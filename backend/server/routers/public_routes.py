"""Public readiness, upload status, and public file-stream endpoints."""

from __future__ import annotations

from hashlib import sha256
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
    completed: bool = message_lower.startswith("upload complete")
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
        "torrent_items": list(getattr(progress, "torrent_items", []) or []),
        "file_id": file_id,
    })


def _file_etag(file: File) -> str:
    """Create a stable strong validator for a stored file representation."""

    modified_at = getattr(file, "modified_at", None)
    source = f"{file.id}:{file.size}:{modified_at.isoformat() if modified_at else ''}"
    return f'"{sha256(source.encode("utf-8")).hexdigest()}"'


def _content_disposition(filename: str, attachment: bool) -> str:
    """Build a safe ASCII fallback plus an RFC 5987 UTF-8 filename."""

    fallback = filename.encode("ascii", "ignore").decode("ascii")
    fallback = fallback.replace('"', "'").replace("\\", "_").replace("/", "_") or "download"
    disposition = "attachment" if attachment else "inline"
    return f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"


async def _file_response(file: File, request: Request, *, attachment: bool, head_only: bool = False) -> Response:
    """Build a byte-range response with validators suitable for interrupted downloads."""

    range_header = request.headers.get("range")
    if_range = request.headers.get("if-range")

    if not file.links and int(file.size) == 0:
        content_type = file.type or guess_type(file.name)[0] or "application/octet-stream"
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": content_type,
            "Content-Disposition": _content_disposition(file.name, attachment),
            "Cache-Control": "private, no-cache, no-transform",
            "ETag": _file_etag(file),
            "Content-Length": "0",
            "X-Content-Type-Options": "nosniff",
            "X-Accel-Buffering": "no",
        }
        return Response(content=b"", status_code=200, headers=headers, media_type=content_type)

    try:
        stream = await Stream.prepare(file, range_header)

    except ValueError:
        size = max(0, int(file.size))
        etag = _file_etag(file)

        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes", "ETag": etag})

    except OSError as error:
        raise HTTPException(status_code=502, detail=f"File storage metadata failure: {error}") from error

    size = max(0, int(file.size))
    etag = _file_etag(file)

    if range_header and if_range and if_range.strip() != etag:
        range_header = None
        stream = Stream(file, None)

    content_type = file.type or guess_type(file.name)[0] or "application/octet-stream"
    headers: dict[str, str] = {
        "Accept-Ranges": "bytes",
        "Content-Type": content_type,
        "Content-Disposition": _content_disposition(file.name, attachment),
        "Cache-Control": "private, no-cache, no-transform",
        "ETag": etag,
        "Content-Length": str(size),
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
    }

    start = stream.byte_range.start
    end = stream.byte_range.end
    length = end - start + 1
    partial = range_header is not None
    headers["Content-Length"] = str(length)

    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"

    if head_only:
        return Response(status_code=206 if partial else 200, headers=headers, media_type=content_type)

    return StreamingResponse(stream.stream(), status_code=206 if partial else 200, headers=headers, media_type=content_type)


async def _owned_public_file(token: str) -> File:
    """Resolve a signed token to its original owner's file record."""

    try:
        payload: dict[str, str | int] = verify_public_stream_token(token)

    except ValueError as error:
        raise HTTPException(status_code=404, detail="Invalid public download link") from error

    file = await File.get(cast(str, payload["username"]), fid=int(payload["file_id"]))

    if file is None or file.username != payload["username"]:
        raise HTTPException(status_code=404, detail="File not found")

    return file


@router.get("/stream/{token}")
async def public_stream(token: str, request: Request) -> Response:
    """Stream a file with single-range and validator support for seeking/resuming."""

    file = await _owned_public_file(token)
    return await _file_response(file, request, attachment=False)


@router.get("/download/{token}")
async def public_download(token: str, request: Request) -> Response:
    """Download an attachment with byte ranges, validators, and resumable transfers."""

    file = await _owned_public_file(token)
    return await _file_response(file, request, attachment=True)


@router.head("/download/{token}")
async def public_download_head(token: str, request: Request) -> Response:
    """Expose file length and range validators for download managers before transfer."""

    file = await _owned_public_file(token)
    return await _file_response(file, request, attachment=True, head_only=True)
