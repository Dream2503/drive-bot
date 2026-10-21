"""Public readiness, upload status, and public file-stream endpoints."""

from __future__ import annotations

from mimetypes import guess_type
from typing import cast, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from backend.database.models import File, User
from backend.database.redis_server import Redis
from backend.server.jwt_handler import get_current_user
from backend.server.security import verify_public_stream_token
from core.stream import Stream
from core.utils.discord_ import Discord
from core.utils.progress import Progress
from .upload_state import get_upload_job_metadata

router: APIRouter = APIRouter()


@router.get("/ready")
async def ready() -> JSONResponse:
    """Report whether the Discord-backed data center is ready."""

    return JSONResponse({"ready": Discord.ready})


@router.get("/upload/{job_id}/status")
async def upload_status(job_id: str, user: User = Depends(get_current_user)) -> JSONResponse:
    """Return progress only to the account that owns the upload job."""

    metadata: dict[str, Any] | None = await get_upload_job_metadata(job_id)

    if metadata is None or metadata.get("username") != user.username:
        raise HTTPException(status_code=404, detail="Upload job not found")

    try:
        progress: Progress = cast(Progress, await Redis.get(job_id, "Progress"))

    except KeyError:
        raise HTTPException(status_code=404, detail="Upload job not found")

    message_lower: str = progress.message.lower()
    completed: bool = "complete" in message_lower
    failed: bool = message_lower.startswith("upload failed")
    cancelled: bool = bool(metadata.get("cancelled")) or message_lower.startswith("upload cancelled")
    file_id: int | None = None

    if completed and "id=" in progress.message:
        try:
            file_id = int(progress.message.split("id=")[-1].split()[0])

        except (ValueError, IndexError):
            file_id = None

    name: str | None | Any = progress.name if progress.name not in {"update_name_from_backend", "link", ""} else metadata.get("name")
    return JSONResponse({
        "status": "cancelled" if cancelled else "completed" if completed else "error" if failed else "uploading",
        "message": " ".join(progress.message.split()[:2]) if completed else progress.message,
        "name": name,
        "transfer": progress.transfer,
        "total": max(progress.total, int(metadata.get("total") or 0)),
        "file_id": file_id,
    })


@router.get("/stream/{token}")
async def public_stream(token: str, request: Request) -> Response:
    """Stream a public file and honor a valid HTTP byte-range header."""

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
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes", })

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


@router.get("/download/{token}")
async def public_download(token: str) -> StreamingResponse:
    """Stream a public file as a downloadable attachment."""

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
