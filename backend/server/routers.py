import aiofiles
from asyncio import Task, create_task, sleep
from backend.database.models import Directory, File, User
from backend.database.redis_server import Redis
from backend.server.jwt_handler import create_access_token, get_current_user
from backend.server.security import hash_password, verify_password, create_public_stream_token, verify_public_stream_token
from backend.server.utils import perform_validation
from core.config import TRANSFER_PATH
from core.stream import Stream
from core.transfer import link_upload, file_upload
from core.utils.discord_ import Discord
from core.utils.progress import Progress
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Header, Query
from fastapi.responses import Response, StreamingResponse, JSONResponse
from mimetypes import guess_type
from pathlib import Path
from pydantic import BaseModel
from time import time
from typing import Any, Literal, cast
from urllib.parse import quote
from uuid import uuid4

auth: APIRouter = APIRouter(prefix="/auth")
public: APIRouter = APIRouter(prefix="/public")

# Redis owns upload metadata. This set only keeps live asyncio tasks strongly
# referenced while they run; Task objects themselves cannot be serialized to Redis.
_BACKGROUND_UPLOAD_TASKS: set[Task[None]] = set()


def _pending_upload_key(job_id: str) -> str:
    return f"upload:pending:{job_id}"


def _upload_session_key(job_id: str) -> str:
    return f"upload:session:{job_id}"


def _track_upload_task(task: Task[None]) -> None:
    _BACKGROUND_UPLOAD_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_UPLOAD_TASKS.discard)


async def wait_for_all_chunks(job_id: str, file: File) -> None:
    """Wait on Redis-backed contiguous-byte metadata rather than an in-memory Event."""
    while True:
        state = await Redis.get_json(_upload_session_key(job_id))

        if not isinstance(state, dict):
            raise TimeoutError("Upload session expired before all chunks arrived")

        contiguous = int(state.get("contiguous", 0))
        total = int(state.get("total", 0))
        file.size = contiguous

        if bool(state.get("received_chunk")) and contiguous >= total:
            return

        last_activity = float(state.get("last_activity", 0))
        if time() - last_activity > 120:
            raise TimeoutError("No data received from the browser")

        await sleep(0.25)


async def _record_written_range(job_id: str, start: int, end: int) -> int:
    """Merge a completed chunk range atomically in Redis and return contiguous bytes."""
    session_key = _upload_session_key(job_id)
    lock = Redis.redis.lock(
        f"upload:lock:{job_id}",
        timeout=30,
        blocking_timeout=30,
    )

    async with lock:
        state = await Redis.get_json(session_key)
        if not isinstance(state, dict):
            raise HTTPException(status_code=404, detail="Upload session expired")

        ranges_raw = state.get("ranges", [])
        ranges: list[list[int]] = [
            [int(item[0]), int(item[1])]
            for item in ranges_raw
            if isinstance(item, (list, tuple)) and len(item) == 2
        ]

        if end > start:
            ranges.append([start, end])
            ranges.sort(key=lambda item: item[0])

        merged: list[list[int]] = []
        for range_start, range_end in ranges:
            if merged and range_start <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], range_end)
            else:
                merged.append([range_start, range_end])

        contiguous = merged[0][1] if merged and merged[0][0] == 0 else 0
        state["ranges"] = merged
        state["contiguous"] = contiguous
        state["last_activity"] = time()
        state["received_chunk"] = True

        file_state = state.get("file")
        if isinstance(file_state, dict):
            file_state["size"] = contiguous

        await Redis.set_json(session_key, state, ex=60 * 60)

        return contiguous


async def _run_chunk_upload_job(
        job_id: str,
        file: File,
        file_path: Path,
        producer_task: Task[None],
) -> None:
    """Stream received chunks to the data center and clean up Redis session state."""
    try:
        async for progress in file_upload(file, file_path, producer_task):
            await Redis.set(job_id, progress)

        # file_upload logs and absorbs producer errors, so propagate those errors
        # into the Redis progress record for the dashboard.
        if producer_task.done() and not producer_task.cancelled():
            producer_error = producer_task.exception()
            if producer_error is not None:
                await Redis.set(
                    job_id,
                    Progress(file.name, f"Upload failed: {producer_error}", 0),
                )

    except Exception as error:
        await Redis.set(
            job_id,
            Progress(file.name, f"Upload failed: {error}", 0),
        )

    finally:
        await Redis.delete_key(_upload_session_key(job_id))
        await Redis.delete_key(_pending_upload_key(job_id))
        file_path.unlink(missing_ok=True)

        try:
            file_path.parent.rmdir()
        except OSError:
            pass


class MoveItemRequest(BaseModel):
    type: Literal["file", "folder"]
    id: int


class BulkMoveRequest(BaseModel):
    directory: str
    items: list[MoveItemRequest]


@public.get("/ready")
async def ready() -> JSONResponse:
    return JSONResponse({"ready": Discord.ready})


@auth.post("/register")
async def register(user: User) -> JSONResponse:
    user.verify()

    if await User.get(user.username):
        raise HTTPException(status_code=400, detail="Username already registered")

    user.password = hash_password(user.password)
    await user.save()
    return JSONResponse({"message": "User registered successfully"})


@auth.post("/login")
async def login(username: str, password: str) -> tuple[dict[str, str], dict[str, str], Directory]:
    await Redis.delete(f"user:{username}", "User")
    await Redis.delete(f"user:{username}:directories", "Directory")
    await Redis.delete(f"user:{username}:files", "File")

    user: User | None = await User.get(username)

    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return ({
                "message": "Login successful",
                "access_token": create_access_token(data={"sub": user.username}),
                "token_type": "bearer",
            }, {
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
            }, await user.home)


@auth.get("/metadata")
async def get_metadata(user: User = Depends(get_current_user)) -> JSONResponse:
    """Return account metadata. Add future account-level metadata fields here."""
    active_files: list[File] = await File.get_all(user.username)
    trashed_files: list[File] = await File.get_all(user.username, trash=True)

    # Include trashed files because they still occupy storage until permanently deleted.
    storage_used_bytes: int = sum(
        max(0, int(file.size or 0))
        for file in (*active_files, *trashed_files)
    )

    return JSONResponse({"storage_used_bytes": storage_used_bytes})


@public.get("/upload/{job_id}/status")
async def upload_status(job_id: str) -> JSONResponse:
    try:
        progress: Progress = cast(Progress, await Redis.get(job_id, "Progress"))
    except KeyError:
        raise HTTPException(status_code=404, detail="Upload job not found")

    message_lower = progress.message.lower()
    completed: bool = "complete" in message_lower
    failed: bool = message_lower.startswith("upload failed")
    file_id: int | None = None

    if completed and "id=" in progress.message:
        try:
            file_id = int(progress.message.split("id=")[-1].split()[0])

        except (ValueError, IndexError):
            file_id = None

    return JSONResponse({
        "status": "completed" if completed else "error" if failed else "uploading",
        "message": " ".join(progress.message.split()[:2]) if completed else progress.message,
        "name": progress.name if progress.name != "update_name_from_backend" else None,
        "transfer": progress.transfer,
        "total": progress.total,
        "file_id": file_id,
    })


@auth.post("/upload")
async def upload_file(
        data_center: str = Header(..., alias="X-Data-Center"),
        directory: str = Header(..., alias="X-Directory"),
        file_name: str = Header(..., alias="X-File-Name"),
        user: User = Depends(get_current_user)
) -> JSONResponse:
    data_center = perform_validation(data_center, "data_center")
    file_name = perform_validation(file_name, "file_name")
    directory_obj: Directory | None = await Directory.get(user.username, path=Path(directory))

    if directory_obj is None:
        raise HTTPException(status_code=404, detail="Directory not found")

    job_id: str = str(uuid4())
    # A per-job directory prevents simultaneous uploads with the same filename
    # from sharing or overwriting each other's temporary file.
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
        _pending_upload_key(job_id),
        {
            "file": file.model_dump(mode="json"),
            "file_path": str(file_path),
            "username": user.username,
        },
        ex=60 * 60,
    )
    await Redis.set(job_id, Progress(file_name, "Waiting for upload", 0))

    return JSONResponse({"job_id": job_id})


@public.put("/upload/{job_id}/chunk")
async def upload_chunk(
        job_id: str,
        request: Request,
        offset: int = Query(..., ge=0),
        total: int = Query(..., ge=0),
        user: User = Depends(get_current_user)
) -> JSONResponse:
    session_key = _upload_session_key(job_id)
    state = await Redis.get_json(session_key)

    if not isinstance(state, dict):
        pending = await Redis.get_json(_pending_upload_key(job_id))

        if not isinstance(pending, dict):
            raise HTTPException(status_code=404, detail="Upload job not found")

        pending_file_data = pending.get("file")
        if not isinstance(pending_file_data, dict):
            raise HTTPException(status_code=404, detail="Upload job metadata is invalid")

        pending_file = File.model_validate(pending_file_data)
        if pending_file.username != user.username:
            raise HTTPException(status_code=403, detail="Access denied")

        raw_file_path = pending.get("file_path")
        if not isinstance(raw_file_path, str) or not raw_file_path:
            raise HTTPException(status_code=404, detail="Upload file path is missing")
        file_path = Path(raw_file_path)

        # Several initial chunks can arrive concurrently. SET NX below chooses
        # exactly one request to create the Redis session and its worker tasks.
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.touch(exist_ok=True)

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

        created = await Redis.set_json(
            session_key,
            new_state,
            ex=60 * 60,
            nx=True,
        )

        if created:
            state = new_state
            await Redis.delete_key(_pending_upload_key(job_id))
            await Redis.set(job_id, Progress(pending_file.name, "Receiving and uploading", 0))

            producer_task: Task[None] = create_task(
                wait_for_all_chunks(job_id, pending_file)
            )
            upload_task: Task[None] = create_task(
                _run_chunk_upload_job(job_id, pending_file, file_path, producer_task)
            )
            _track_upload_task(upload_task)
        else:
            state = await Redis.get_json(session_key)

        if not isinstance(state, dict):
            raise HTTPException(status_code=404, detail="Upload session could not be created")

    if str(state.get("username", "")) != user.username:
        raise HTTPException(status_code=403, detail="Access denied")

    if int(state.get("total", -1)) != total:
        raise HTTPException(status_code=409, detail="File size changed during upload")

    file_path = Path(str(state.get("file_path", "")))
    if not file_path.is_file():
        file_state = state.get("file")
        fallback_name = (
            str(file_state.get("name", "upload"))
            if isinstance(file_state, dict)
            else "upload"
        )
        await Redis.delete_key(session_key)
        await Redis.set(
            job_id,
            Progress(
                fallback_name,
                "Upload failed: temporary file is missing; please restart the upload",
                0,
            ),
        )
        raise HTTPException(
            status_code=409,
            detail="Upload was interrupted and its temporary file is missing. Please restart the upload.",
        )

    if offset > total:
        raise HTTPException(status_code=416, detail="Chunk offset exceeds declared file size")

    position = offset
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

    contiguous = await _record_written_range(job_id, offset, position)

    return JSONResponse({"job_id": job_id, "contiguous": contiguous})


@auth.post("/upload-link")
async def upload_link(link: str, data_center: str, directory: str, user: User = Depends(get_current_user)) -> JSONResponse:
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
    await Redis.set(job_id, Progress(file.name, "Starting", 0))

    async def run_upload_job() -> None:
        progress: Progress

        async for progress in link_upload(file, link):
            await Redis.set(job_id, progress)

    create_task(run_upload_job())
    return JSONResponse({"job_id": job_id})


@auth.post("/create-folder")
async def create_folder(directory: str, name: str, user: User = Depends(get_current_user)) -> JSONResponse:
    folder: Directory = Directory(
        path=Path(perform_validation(directory, "directory")) / perform_validation(name, "file_name"),
        modified_at=datetime.now(timezone.utc),
        username=user.username,
    )
    await folder.save()
    return JSONResponse({
        "message": "Folder created successfully",
        "directory": str(folder),
    })


@auth.get("/search")
async def search(
        query: str = Query(..., min_length=1, description="File or directory name to search for"),
        user: User = Depends(get_current_user),
        trash: bool = Query(False, description="Search trashed files and directories"),
) -> dict[str, list[dict[str, object]]]:
    """Search this user's files and directories by name across all folders."""
    query = query.strip()
    if not query:
        raise HTTPException(status_code=422, detail="Search query cannot be empty")

    matching_files: list[File] = await File.get_all(user.username, trash=trash, file_name=query)
    matching_directories: list[Directory] = await Directory.get_all(user.username, trash=trash, directory_name=query, )

    files: list[dict[str, object]] = []

    for file in matching_files:
        directory = await Directory.get(user.username, did=file.directory_id, trash=trash)
        item = file.model_dump(mode="json")
        item["directory"] = str(directory.path) if directory is not None else ""
        files.append(item)

    directories = [directory.model_dump(mode="json") for directory in matching_directories]

    return {"files": files, "directories": directories}


@auth.get("/directory")
async def get_directory(directory: str, user: User = Depends(get_current_user)) -> tuple[list[Directory], list[File]]:
    directory_obj: Directory | None = await Directory.get(user.username, path=Path(directory))

    if directory_obj is None:
        raise HTTPException(status_code=404, detail="Directory not found")

    return await Directory.get_all(user.username, directory=Path(directory)), await File.get_all(user.username, directory_id=directory_obj.id)


@auth.get("/trash")
async def get_trash(user: User = Depends(get_current_user)) -> tuple[list[Directory], list[File]]:
    await File.purge_expired(user.username)
    return await Directory.get_all(user.username, trash=True), await File.get_all(user.username, trash=True)


def _clean_name(name: str, entity: str) -> str:
    """Validate a single file/folder name shared by rename operations."""
    clean_name = perform_validation(name.strip(), "file_name")
    if not clean_name or clean_name in {".", ".."} or "/" in clean_name or "\\" in clean_name:
        raise HTTPException(status_code=422, detail=f"Invalid {entity} name")
    return clean_name


async def _update_file_fields(file: File, *, name: str | None = None, directory_id: int | None = None) -> None:
    """Persist supported file changes for both rename and move operations."""
    if name is not None:
        file.name = name
    if directory_id is not None:
        file.directory_id = directory_id
    await file.update()


async def _rewrite_directory_tree_path(user: User, directory: Directory, new_path: Path) -> None:
    """Update a directory path and its descendant paths after rename or move."""
    old_path = Path(directory.path)
    if old_path == new_path:
        return

    # Snapshot descendants before changing the parent's stored path.
    all_directories: list[Directory] = await Directory.get_all(user.username)
    descendants: list[tuple[Directory, Path]] = []
    for candidate in all_directories:
        if candidate.id == directory.id or candidate.username != user.username:
            continue
        try:
            relative_path = Path(candidate.path).relative_to(old_path)
        except ValueError:
            continue
        if relative_path != Path("."):
            descendants.append((candidate, relative_path))

    directory.path = new_path
    await directory.update()

    # Update deepest paths first to minimize collisions if the database enforces
    # uniqueness on the stored directory path.
    for child, relative_path in sorted(
            descendants,
            key=lambda entry: len(entry[1].parts),
            reverse=True,
    ):
        child.path = new_path / relative_path
        await child.update()


@auth.patch("/file/{fid}/rename")
async def rename_file(
        fid: int,
        name: str = Query(..., min_length=1, max_length=255),
        user: User = Depends(get_current_user),
) -> JSONResponse:
    """Rename a file owned by the authenticated user."""
    file: File | None = await File.get(user.username, fid=fid)
    if file is None or file.username != user.username:
        raise HTTPException(status_code=404, detail="File not found")

    clean_name = _clean_name(name, "file")
    if clean_name != file.name:
        same_directory_files: list[File] = await File.get_all(
            user.username,
            directory_id=file.directory_id,
        )
        if any(candidate.id != file.id and candidate.name == clean_name for candidate in same_directory_files):
            raise HTTPException(status_code=409, detail="A file with that name already exists in this directory")
        await _update_file_fields(file, name=clean_name)

    return JSONResponse({"message": "File renamed successfully", "id": fid, "name": file.name})


@auth.patch("/directory/{did}/rename")
async def rename_directory(
        did: int,
        name: str = Query(..., min_length=1, max_length=255),
        user: User = Depends(get_current_user),
) -> JSONResponse:
    """Rename a directory using the shared path-rewrite helper."""
    directory: Directory | None = await Directory.get(user.username, did=did)
    if directory is None or directory.username != user.username:
        raise HTTPException(status_code=404, detail="Directory not found")

    old_path = Path(directory.path)
    if old_path == Path("/home"):
        raise HTTPException(status_code=400, detail="The home directory cannot be renamed")

    clean_name = _clean_name(name, "directory")
    new_path = old_path.with_name(clean_name)
    if new_path == old_path:
        return JSONResponse({
            "message": "Directory name unchanged",
            "id": did,
            "name": clean_name,
            "path": str(old_path),
        })

    existing: Directory | None = await Directory.get(user.username, path=new_path)
    if existing is not None and existing.id != did:
        raise HTTPException(status_code=409, detail="A folder with that name already exists")

    await _rewrite_directory_tree_path(user, directory, new_path)
    return JSONResponse({
        "message": "Directory renamed successfully",
        "id": did,
        "name": clean_name,
        "path": str(new_path),
    })


async def _resolve_move_destination(user: User, directory_path: str) -> Directory:
    destination: Directory | None = await Directory.get(user.username, path=Path(directory_path))
    if destination is None or destination.username != user.username:
        raise HTTPException(status_code=404, detail="Destination directory not found")
    return destination


async def _move_file_to_directory(user: User, fid: int, destination: Directory) -> dict[str, object]:
    """Move one owned file to a destination, shared by single and bulk routes."""
    file: File | None = await File.get(user.username, fid=fid)
    if file is None or file.username != user.username:
        raise HTTPException(status_code=404, detail="File not found")

    if file.directory_id == destination.id:
        return {
            "status": "unchanged", "type": "file", "id": fid, "name": file.name,
            "message": "File is already in that directory", "directory": str(destination.path),
        }

    destination_files: list[File] = await File.get_all(user.username, directory_id=destination.id)
    if any(candidate.id != file.id and candidate.name == file.name for candidate in destination_files):
        raise HTTPException(status_code=409, detail=f'A file named "{file.name}" already exists in the destination')

    await _update_file_fields(file, directory_id=destination.id)
    return {
        "status": "moved", "type": "file", "id": fid, "name": file.name,
        "message": "File moved successfully", "directory_id": destination.id,
        "directory": str(destination.path),
    }


async def _move_directory_to_destination(user: User, did: int, destination: Directory) -> dict[str, object]:
    """Move one owned directory, preserving descendant paths."""
    source: Directory | None = await Directory.get(user.username, did=did)
    if source is None or source.username != user.username:
        raise HTTPException(status_code=404, detail="Directory not found")

    old_path = Path(source.path)
    if old_path == Path("/home"):
        raise HTTPException(status_code=400, detail="The home directory cannot be moved")

    destination_path = Path(destination.path)
    try:
        destination_path.relative_to(old_path)
    except ValueError:
        pass
    else:
        raise HTTPException(status_code=400, detail="A folder cannot be moved into itself or one of its descendants")

    new_path = destination_path / old_path.name
    if new_path == old_path:
        return {
            "status": "unchanged", "type": "folder", "id": did, "name": old_path.name,
            "message": "Directory is already in that location", "path": str(old_path),
        }

    existing: Directory | None = await Directory.get(user.username, path=new_path)
    if existing is not None and existing.id != did:
        raise HTTPException(status_code=409, detail=f'A folder named "{new_path.name}" already exists in the destination')

    await _rewrite_directory_tree_path(user, source, new_path)
    return {
        "status": "moved", "type": "folder", "id": did, "name": new_path.name,
        "message": "Directory moved successfully", "path": str(new_path),
    }


@auth.patch("/file/{fid}/move")
async def move_file(
        fid: int,
        directory: str = Query(..., min_length=1),
        user: User = Depends(get_current_user),
) -> JSONResponse:
    destination = await _resolve_move_destination(user, directory)
    result = await _move_file_to_directory(user, fid, destination)
    return JSONResponse(result)


@auth.patch("/directory/{did}/move")
async def move_directory(
        did: int,
        directory: str = Query(..., min_length=1),
        user: User = Depends(get_current_user),
) -> JSONResponse:
    destination = await _resolve_move_destination(user, directory)
    result = await _move_directory_to_destination(user, did, destination)
    return JSONResponse(result)


@auth.patch("/move")
async def move_items(
        request: BulkMoveRequest,
        user: User = Depends(get_current_user),
) -> JSONResponse:
    """Move a mixed selection of files and folders into one destination.

    Each item is validated independently. The response lists successful moves,
    items that were already in the destination, and individual failures.
    """
    if not request.items:
        raise HTTPException(status_code=422, detail="Select at least one file or folder to move")

    destination = await _resolve_move_destination(user, request.directory)
    moved: list[dict[str, object]] = []
    unchanged: list[dict[str, object]] = []
    failed: list[dict[str, object]] = []
    seen: set[tuple[str, int]] = set()

    for item in request.items:
        identity = (item.type, item.id)
        if identity in seen:
            continue
        seen.add(identity)
        try:
            result = await (
                _move_file_to_directory(user, item.id, destination)
                if item.type == "file"
                else _move_directory_to_destination(user, item.id, destination)
            )
            if result.get("status") == "unchanged":
                unchanged.append(result)
            else:
                moved.append(result)
        except HTTPException as error:
            failed.append({"type": item.type, "id": item.id, "error": error.detail, "status_code": error.status_code})

    return JSONResponse({
        "message": "Bulk move completed",
        "destination": str(destination.path),
        "moved": moved,
        "unchanged": unchanged,
        "failed": failed,
    })


@auth.delete("/file/{fid}")
async def file_delete(fid: int, user: User = Depends(get_current_user)) -> JSONResponse:
    file: File | None = await File.get(user.username, fid=fid)

    if file is None:
        raise HTTPException(status_code=404, detail="File not found")

    if file.username != user.username:
        raise HTTPException(status_code=403, detail="Access denied")

    await file.move_to_trash()
    return JSONResponse({"message": "File moved to trash"})


@auth.delete("/directory/{did}")
async def directory_delete(did: int, user: User = Depends(get_current_user)) -> JSONResponse:
    directory: Directory | None = await Directory.get(user.username, did=did)

    if directory is None:
        raise HTTPException(status_code=404, detail="Directory not found")

    if directory.username != user.username:
        raise HTTPException(status_code=403, detail="Access denied")

    await directory.move_to_trash()
    return JSONResponse({"message": "Directory moved to trash"})


@auth.delete("/trash/file/{fid}")
async def permanently_delete(fid: int, user: User = Depends(get_current_user)) -> JSONResponse:
    file: File | None = await File.get(user.username, fid=fid, trash=True)

    if file is None or file.username != user.username:
        raise HTTPException(status_code=404, detail="File not found")

    await file.delete()
    return JSONResponse({"message": "Permanently deleted"})


@auth.delete("/trash/directory/{did}")
async def permanently_delete_directory(did: int, user: User = Depends(get_current_user)) -> JSONResponse:
    directory: Directory | None = await Directory.get(user.username, did=did, trash=True)

    if directory is None or directory.username != user.username:
        raise HTTPException(status_code=404, detail="Directory not found")

    for file in await File.get_all(user.username, directory_id=directory.id, trash=True):
        await file.delete()

    for child in await Directory.get_all(user.username, directory=directory.path, trash=True):
        await permanently_delete_directory(cast(int, child.id), user)

    await directory.delete()
    return JSONResponse({"message": "Permanently deleted"})


@auth.post("/trash/file/{fid}/restore")
async def restore_file(fid: int, user: User = Depends(get_current_user)) -> JSONResponse:
    file: File | None = await File.get(user.username, fid=fid, trash=True)

    if file is None or file.username != user.username:
        raise HTTPException(status_code=404, detail="File not found")

    await file.restore()
    return JSONResponse({"message": "Restored"})


@auth.post("/trash/directory/{did}/restore")
async def restore_directory(did: int, user: User = Depends(get_current_user)) -> JSONResponse:
    directory: Directory | None = await Directory.get(user.username, did=did, trash=True)

    if directory is None or directory.username != user.username:
        raise HTTPException(status_code=404, detail="Directory not found")

    await directory.restore()
    return JSONResponse({"message": "Restored"})


@auth.post("/file/{fid}/public-link")
async def create_public_link(fid: int, user: User = Depends(get_current_user)) -> dict[str, str]:
    file: File | None = await File.get(user.username, fid=fid)

    if file is None:
        raise HTTPException(status_code=404, detail="File not found")

    if file.username != user.username:
        raise HTTPException(status_code=403, detail="Access denied")

    return {"public_token": create_public_stream_token(file=file, username=file.username)}


@public.get("/stream/{token}")
async def public_stream(token: str, request: Request) -> Response:
    try:
        payload: dict[str, str | int] = verify_public_stream_token(token)

    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid download stream link")

    file: File | None = await File.get(cast(str, payload["username"]), fid=int(payload["file_id"]))

    if file is None or file.username != payload["username"]:
        raise HTTPException(status_code=404, detail="File not found")

    range_header: str | None = request.headers.get("range")

    try:
        stream: Stream = Stream(file, range_header)

    except (ValueError, IndexError):
        size: int = file.size

        return Response(
            status_code=416,
            headers={
                "Content-Range": f"bytes */{size}",
                "Accept-Ranges": "bytes",
            },
        )

    length: int = stream.byte_range.end - stream.byte_range.start + 1
    content_type: str = file.type or guess_type(file.name)[0] or "application/octet-stream"
    status_code: int = 206 if range_header else 200
    headers: dict[str, str] = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Type": content_type,
        "Content-Disposition": f"inline; filename=\"{file.name.encode('ascii', 'ignore').decode()}\"; filename*=UTF-8''{quote(file.name)}",
        "Cache-Control": "no-cache",
    }

    if status_code == 206:
        headers["Content-Range"] = f"bytes {stream.byte_range.start}-{stream.byte_range.end}/{file.size}"

    return StreamingResponse(stream.stream(), status_code=status_code, headers=headers, media_type=content_type)


@public.get("/download/{token}")
async def public_download(token: str) -> StreamingResponse:
    try:
        payload: dict[str, str | int] = verify_public_stream_token(token)

    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid public download link")

    file: File | None = await File.get(cast(str, payload["username"]), fid=int(payload["file_id"]))

    if file is None or file.username != payload["username"]:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        stream: Stream = Stream(file)

    except (ValueError, IndexError) as e:
        raise HTTPException(status_code=502, detail=f"File metadata failure: {e}") from e

    size: int = file.size
    content_type: str = file.type or guess_type(file.name)[0] or "application/octet-stream"
    headers: dict[str, str] = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(size),
        "Content-Type": content_type,
        "Content-Disposition": f'attachment; filename="{file.name.encode("ascii", "ignore").decode() or "download"}"; filename*=UTF-8\'\'{quote(file.name)}',
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(stream.stream(), status_code=200, headers=headers, media_type=content_type)
