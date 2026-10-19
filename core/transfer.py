"""Coordinate file uploads and remote-link downloads through storage providers."""

from __future__ import annotations

from asyncio import Task
from pathlib import Path
from traceback import format_exc
from typing import AsyncGenerator, Callable, cast
from urllib.parse import ParseResult, urlparse

from backend.database.models import File, User
from core.data_center import DataCenter
from core.utils import write_log
from core.utils.progress import Progress, upload_growing_file


async def file_upload(
        file: File,
        file_path: Path,
        upload_task: Task[None] | None = None,
        intermediate: bool = False,
) -> AsyncGenerator[Progress, None]:
    """Upload a local file, optionally leaving the final database save to the caller."""

    data_center: type[DataCenter] | None = DataCenter(file.data_center)

    if data_center is None:
        raise ValueError(f"Unsupported data center: {file.data_center}")

    write_log("INFO", data_center, "UPLOAD", file.username, f"Got file: {file}")

    try:
        write_log("INFO", data_center, "UPLOAD", file.username, f"Found local file: {file_path.name}")
        progress: Progress = Progress(file.name, "Uploading File", 0)

        async for progress_value in upload_growing_file(
                file=file,
                path=file_path,
                data_center=data_center,
                progress=progress,
                producer=upload_task,
        ):
            yield progress_value

        if not intermediate:
            await file.save()
            write_log("INFO", data_center, "UPLOAD", file.username, f"Upload complete `{file_path.name}`")
            progress.message = f"Upload Complete of id={file.id}"
            yield progress

        file_path.unlink(missing_ok=True)

    except Exception as error:
        write_log("ERROR", data_center, "UPLOAD", file.username, f"Unhandled exception: {error}\n{format_exc()}")
        raise


async def link_upload(file: File, link: str) -> AsyncGenerator[Progress, None]:
    """Download a supported remote link and upload its contents to the configured provider."""

    from core.utils.download_ import download_google_drive, download_youtube

    user: User | None = cast(User | None, await User.get(file.username))

    if user is None:
        raise ValueError(f"User not found: {file.username}")

    data_center: type[DataCenter] | None = DataCenter(file.data_center)

    if data_center is None:
        raise ValueError(f"Unsupported data center: {file.data_center}")

    progress: Progress = Progress("link", "Uploading File", 0)
    write_log("INFO", data_center, "DOWNLOAD", user.username, f"Got link: {link}")

    try:
        write_log("INFO", data_center, "DOWNLOAD", user.username, f"Starting download from `{link}`")
        parsed: ParseResult = urlparse(link)
        host: str = (parsed.hostname or "").lower().removeprefix("www.")

        downloader: Callable[[File, str], AsyncGenerator[Progress, None]]

        if host == "drive.google.com":
            downloader = download_google_drive

        elif host in {"youtube.com", "youtu.be", "m.youtube.com"}:
            downloader = download_youtube

        else:
            raise ValueError(f"Unsupported link: {link}")

        async for progress_value in downloader(file, link):
            yield progress_value

        await file.save()
        write_log("INFO", data_center, "DOWNLOAD", user.username, f"Download and upload complete `{file.name}`")
        progress.message = f"Upload Complete of id={file.id}"
        yield progress

    except Exception as error:
        write_log("ERROR", data_center, "DOWNLOAD", user.username, f"Unhandled exception: {error}\n{format_exc()}")
        raise
