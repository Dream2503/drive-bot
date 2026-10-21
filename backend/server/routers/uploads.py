"""Upload initiation, chunk reception, and link-based upload endpoints."""

from __future__ import annotations

from asyncio import CancelledError, Task, create_task
from datetime import datetime, timezone
from mimetypes import guess_type
from pathlib import Path
from time import time
from typing import Any, cast
from urllib.parse import unquote, urlsplit
from uuid import uuid4

import aiofiles
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from backend.database.models import Directory, File, User
from backend.database.redis_server import Redis
from backend.server.jwt_handler import get_current_user
from backend.server.utils import perform_validation
from core.config import TRANSFER_PATH
from core.transfer import link_upload
from core.utils import sanitize_sensitive_urls
from core.utils.progress import Progress
from .upload_state import (
    cancel_upload_task,
    get_upload_job_metadata,
    list_user_upload_jobs,
    pending_upload_key,
    record_written_range,
    register_upload_job,
    run_chunk_upload_job,
    track_upload_task,
    upload_job_key,
    upload_session_key,
    user_upload_jobs_key,
    wait_for_all_chunks,
)

router: APIRouter = APIRouter()
public_router: APIRouter = APIRouter()


@router.post("/upload")
async def upload_file(
        data_center: str = Header(..., alias="X-Data-Center"),
        directory: str = Header(..., alias="X-Directory"),
        file_name: str = Header(..., alias="X-File-Name"),
        file_size: int = Header(0, alias="X-File-Size", ge=0),
        user: User = Depends(get_current_user)
) -> JSONResponse:
    """Create an upload job and store its initial metadata in Redis."""

    data_center = perform_validation(data_center, "data_center")
    file_name = perform_validation(file_name, "file_name")
    directory_obj: Directory | None = await Directory.get(user.username, path=Path(directory))

    if directory_obj is None:
        raise HTTPException(status_code=404, detail="Directory not found")

    job_id: str = str(uuid4())
    file_path: Path = TRANSFER_PATH / user.username / job_id / file_name
    file: File = File(
        directory_id=cast(int, directory_obj.id),
        name=file_name,
        type=guess_type(file_name)[0] or "application/octet-stream",
        size=0,
        modified_at=datetime.now(timezone.utc),
        links=[],
        data_center=data_center,
        username=user.username
    )
    await Redis.set_json(
        pending_upload_key(job_id),
        {"file": file.model_dump(mode="json"), "file_path": str(file_path), "username": user.username},
        ex=60 * 60,
    )
    await Redis.set(job_id, Progress(file_name, "Waiting for upload", 0))
    await register_upload_job(
        job_id,
        username=user.username,
        name=file_name,
        kind="file",
        directory=str(directory_obj.path),
        data_center=data_center,
        total=file_size,
    )
    return JSONResponse({"job_id": job_id})


@router.get("/upload-jobs")
async def get_upload_jobs(user: User = Depends(get_current_user)) -> JSONResponse:
    """List upload jobs belonging to the authenticated username across all devices."""

    return JSONResponse({"jobs": await list_user_upload_jobs(user.username)})


@router.delete("/upload-jobs/{job_id}")
async def dismiss_upload_job(job_id: str, user: User = Depends(get_current_user)) -> JSONResponse:
    """Dismiss a terminal upload job from the shared account tray."""

    metadata: dict[str, Any] | None = await get_upload_job_metadata(job_id)
    if metadata is None:
        await Redis.redis.srem(user_upload_jobs_key(user.username), job_id)
        return JSONResponse({"message": "Upload job dismissed"})

    if metadata.get("username") != user.username:
        raise HTTPException(status_code=404, detail="Upload job not found")

    try:
        current: Progress = await Redis.get(job_id, "Progress")
    except KeyError:
        current = Progress(str(metadata.get("name") or "Upload"), "Upload failed", 0)
    current_message = current.message.lower()
    if not (metadata.get("cancelled") or "complete" in current_message or current_message.startswith("upload failed")):
        raise HTTPException(status_code=409, detail="Cancel the upload before dismissing it")

    await Redis.redis.srem(user_upload_jobs_key(user.username), job_id)
    await Redis.delete_key(upload_job_key(job_id))
    await Redis.delete(job_id, "Progress")
    return JSONResponse({"message": "Upload job dismissed"})


@router.post("/upload-jobs/{job_id}/fail")
async def fail_upload_job(
        job_id: str,
        message: str = Body(..., embed=True, max_length=1000),
        user: User = Depends(get_current_user),
) -> JSONResponse:
    """Publish a browser-side file-transfer failure to every device on the account."""

    metadata: dict[str, Any] | None = await get_upload_job_metadata(job_id)
    if metadata is None or metadata.get("username") != user.username:
        raise HTTPException(status_code=404, detail="Upload job not found")
    if metadata.get("kind") != "file":
        raise HTTPException(status_code=400, detail="Only browser file uploads can report transfer failures")

    try:
        current: Progress = await Redis.get(job_id, "Progress")
    except KeyError:
        raise HTTPException(status_code=404, detail="Upload job not found")

    lowered = current.message.lower()
    if metadata.get("cancelled") or lowered.startswith("upload cancelled"):
        return JSONResponse({"job_id": job_id, "status": "cancelled"})
    if "complete" in lowered:
        return JSONResponse({"job_id": job_id, "status": "completed"})

    detail = " ".join(sanitize_sensitive_urls(message).split())[:300] or "Browser file transfer failed"
    metadata["failed"] = True
    metadata["failed_at"] = time()
    await Redis.set_json(upload_job_key(job_id), metadata)
    failure = Progress(str(metadata.get("name") or current.name), f"Upload failed: {detail}", current.total)
    failure.transfer = current.transfer
    await Redis.set(job_id, failure)

    cancel_upload_task(job_id)
    await Redis.delete_key(pending_upload_key(job_id))
    return JSONResponse({"job_id": job_id, "status": "error"})


@router.post("/upload-jobs/{job_id}/cancel")
async def cancel_upload_job(job_id: str, user: User = Depends(get_current_user)) -> JSONResponse:
    """Cancel an upload from any signed-in device and publish the shared terminal status."""

    metadata: dict[str, Any] | None = await get_upload_job_metadata(job_id)
    if metadata is None or metadata.get("username") != user.username:
        raise HTTPException(status_code=404, detail="Upload job not found")

    try:
        current: Progress = await Redis.get(job_id, "Progress")
    except KeyError:
        raise HTTPException(status_code=404, detail="Upload job not found")

    message_lower: str = current.message.lower()
    if "complete" in message_lower or message_lower.startswith("upload failed"):
        raise HTTPException(status_code=409, detail="Upload is already finished")

    metadata["cancelled"] = True
    metadata["cancelled_at"] = time()
    await Redis.set_json(upload_job_key(job_id), metadata)
    await Redis.set(job_id, Progress(str(metadata.get("name") or current.name), "Upload cancelled", 0))

    task_was_running: bool = cancel_upload_task(job_id)
    if not task_was_running and metadata.get("kind") == "file":
        await Redis.delete_key(pending_upload_key(job_id))

    return JSONResponse({"job_id": job_id, "status": "cancelled"})


@public_router.put("/upload/{job_id}/chunk")
async def upload_chunk(
        job_id: str,
        request: Request,
        offset: int = Query(..., ge=0),
        total: int = Query(..., ge=0),
        user: User = Depends(get_current_user)
) -> JSONResponse:
    """Write an uploaded byte range and update the Redis range metadata."""

    metadata: dict[str, Any] | None = await get_upload_job_metadata(job_id)
    if metadata is None or metadata.get("username") != user.username:
        raise HTTPException(status_code=404, detail="Upload job not found")
    if metadata.get("cancelled"):
        raise HTTPException(status_code=409, detail="Upload was cancelled")
    if metadata.get("failed"):
        raise HTTPException(status_code=409, detail="Upload has already failed")

    session_key: str = upload_session_key(job_id)
    state: Any = await Redis.get_json(session_key)

    if not isinstance(state, dict):
        pending: Any = await Redis.get_json(pending_upload_key(job_id))

        if not isinstance(pending, dict):
            raise HTTPException(status_code=404, detail="Upload job not found")

        pending_file_data: Any = pending.get("file")

        if not isinstance(pending_file_data, dict):
            raise HTTPException(status_code=404, detail="Upload job metadata is invalid")

        pending_file: File = File.model_validate(pending_file_data)

        if pending_file.username != user.username:
            raise HTTPException(status_code=403, detail="Access denied")

        raw_file_path: Any = pending.get("file_path")

        if not isinstance(raw_file_path, str) or not raw_file_path:
            raise HTTPException(status_code=404, detail="Upload file path is missing")

        file_path: Path = Path(raw_file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.touch(exist_ok=True)
        metadata["total"] = total
        await Redis.set_json(upload_job_key(job_id), metadata)
        new_state: dict[str, Any] = {
            "file": pending_file.model_dump(mode="json"),
            "file_path": str(file_path),
            "username": user.username,
            "total": total,
            "ranges": [],
            "contiguous": 0,
            "received_chunk": False,
            "last_activity": time(),
        }
        created: bool = await Redis.set_json(session_key, new_state, ex=60 * 60, nx=True)

        if created:
            state = new_state
            await Redis.delete_key(pending_upload_key(job_id))
            await Redis.set(job_id, Progress(pending_file.name, "Receiving and uploading", 0))
            producer_task: Task[None] = create_task(wait_for_all_chunks(job_id, pending_file))
            upload_task: Task[None] = create_task(run_chunk_upload_job(job_id, pending_file, file_path, producer_task))
            track_upload_task(upload_task, job_id)

        else:
            state = await Redis.get_json(session_key)

        if not isinstance(state, dict):
            raise HTTPException(status_code=404, detail="Upload session could not be created")

    if str(state.get("username", "")) != user.username:
        raise HTTPException(status_code=403, detail="Access denied")

    if int(state.get("total", -1)) != total:
        raise HTTPException(status_code=409, detail="File size changed during upload")

    file_path: Path = Path(str(state.get("file_path", "")))

    if not file_path.is_file():
        file_state: Any = state.get("file")
        fallback_name: str = (str(file_state.get("name", "upload")) if isinstance(file_state, dict) else "upload")
        await Redis.delete_key(session_key)
        await Redis.set(job_id, Progress(fallback_name, "Upload failed: temporary file is missing; please restart the upload", 0))
        raise HTTPException(status_code=409, detail="Upload was interrupted and its temporary file is missing. Please restart the upload.")

    if offset > total:
        raise HTTPException(status_code=416, detail="Chunk offset exceeds declared file size")

    position: int = offset

    async with aiofiles.open(file_path, "r+b") as buffer:
        await buffer.seek(offset)

        async for chunk in request.stream():
            if not chunk:
                continue

            if position + len(chunk) > total:
                raise HTTPException(status_code=413, detail="Chunk exceeds declared file size")

            await buffer.write(chunk)
            await buffer.flush()
            position += len(chunk)

    latest_metadata = await get_upload_job_metadata(job_id)
    if latest_metadata is None or latest_metadata.get("username") != user.username:
        raise HTTPException(status_code=404, detail="Upload job not found")
    if latest_metadata.get("cancelled"):
        raise HTTPException(status_code=409, detail="Upload was cancelled")
    if latest_metadata.get("failed"):
        raise HTTPException(status_code=409, detail="Upload has already failed")

    contiguous: int = await record_written_range(job_id, offset, position)
    return JSONResponse({"job_id": job_id, "contiguous": contiguous})


@router.post("/upload-link")
async def upload_link(link: str, data_center: str, directory: str, user: User = Depends(get_current_user)) -> JSONResponse:
    """Start a background job that imports a file from a URL."""

    link = perform_validation(link, "link")
    data_center = perform_validation(data_center, "data_center")
    directory_obj: Directory | None = await Directory.get(user.username, path=Path(directory))

    if directory_obj is None:
        raise HTTPException(status_code=404, detail="Directory not found")

    file: File = File(
        directory_id=cast(int, directory_obj.id),
        name="update_name_from_backend",
        type="application/octet-stream",
        size=0,
        modified_at=datetime.now(timezone.utc),
        links=[],
        data_center=data_center,
        username=user.username
    )
    job_id: str = str(uuid4())
    parsed_link = urlsplit(link)
    link_name = unquote(Path(parsed_link.path).name).strip() or (parsed_link.hostname or "Link import")
    link_name = link_name[:255]
    await Redis.set(job_id, Progress(file.name, "Starting", 0))
    await register_upload_job(
        job_id,
        username=user.username,
        name=link_name,
        kind="link",
        directory=str(directory_obj.path),
        data_center=data_center,
    )

    async def run_upload_job() -> None:
        """Persist progress while the source URL is imported into storage."""

        progress: Progress

        try:
            async for progress in link_upload(file, link):
                latest_metadata = await get_upload_job_metadata(job_id)
                if latest_metadata is None or latest_metadata.get("cancelled"):
                    await Redis.set(job_id, Progress(file.name, "Upload cancelled", 0))
                    return
                await Redis.set(job_id, progress)

        except CancelledError:
            # The cancel endpoint has already published the shared terminal status.
            return
        except Exception as error:
            latest_metadata = await get_upload_job_metadata(job_id)
            if latest_metadata and latest_metadata.get("cancelled"):
                await Redis.set(job_id, Progress(file.name, "Upload cancelled", 0))
                return

            # link_upload logs the traceback. Store a safe terminal status so polling
            # stops and the frontend can display the failure instead of spinning forever.
            failure_detail: str = " ".join(sanitize_sensitive_urls(str(error)).split())[:400]
            failure_message: str = f"Upload failed: {failure_detail or type(error).__name__}"

            try:
                await Redis.set(job_id, Progress(file.name, failure_message, 0))
            except Exception as status_error:
                # Do not let a second failure while saving job status escape the task.
                from logging import getLogger

                getLogger(__name__).error(
                    "Could not persist failed upload job %s (%s)",
                    job_id,
                    type(status_error).__name__,
                )

    upload_task: Task[None] = create_task(run_upload_job())
    track_upload_task(upload_task, job_id)
    return JSONResponse({"job_id": job_id})
