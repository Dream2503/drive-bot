from asyncio import Semaphore, create_task, Task, wait
from pathlib import Path
from traceback import format_exc
from typing import AsyncGenerator, Callable, cast
from urllib.parse import urlparse, ParseResult

from backend.database import File, add_file, get_file, get_user, User
from core.config import TRANSFER_PATH
from core.data_center import DataCenter
from core.utils import write_log, get_transfer_path, Progress
from core.utils.download_ import download_google_drive, download_youtube


async def upload(file: File, intermediate: bool = False) -> AsyncGenerator[tuple[str, int, int], None]:
    user: User = cast(User, get_user(username=file.username))
    data_center: DataCenter = DataCenter(file.data_center)
    write_log("INFO", data_center, "UPLOAD", user.username, f"Got file: {file}")

    try:
        if get_file(directory=file.directory, name=file.name, username=file.username):
            path: Path = Path(file.name)
            stem, extension = path.stem, path.suffix
            i = 1

            while get_file(directory=file.directory, name=file.name, username=file.username):
                file.name = f"{stem}({i}){extension}"
                i += 1

        file_path: Path = get_transfer_path(file.username, file.directory, file.name)

        if not file_path.is_relative_to(TRANSFER_PATH.resolve()):
            write_log("ERROR", data_center, "UPLOAD", user.username, f"Illegal file path attempted: {file.name}")
            return

        if not file_path.exists():
            write_log("ERROR", data_center, "UPLOAD", user.username, f"Local file not found: {file_path}")
            return

        write_log("INFO", data_center, "UPLOAD", user.username, f"Found local file: {file_path.name}")
        file_size: int = file_path.stat().st_size
        total_parts: int = (file_size + data_center.MAX_SIZE - 1) // data_center.MAX_SIZE
        progress = Progress("Uploading File", file_size)
        write_log("INFO", data_center, "UPLOAD", user.username, f"Starting upload `{file_path.name}` ({total_parts} parts)")

        with file_path.open("rb") as f:
            chunks: list[tuple[int, bytes, str]] = []

            for i in range(1, total_parts + 1):
                chunk: bytes = f.read(data_center.MAX_SIZE)

                if not chunk:
                    break

                filename: str = f"{file_path.name}{'' if total_parts == 1 else f'.part{i:03d}'}"
                chunks.append((i, chunk, filename))

            semaphore: Semaphore = Semaphore(8)

            async def upload_part(i: int, chunk: bytes, filename: str) -> tuple[int, str]:
                async with semaphore:
                    while True:
                        try:
                            msg_id: str = await data_center.upload(chunk, filename, progress)
                            return i, msg_id

                        except OSError as e:
                            write_log("ERROR", data_center, "UPLOAD", user.username, f"Network error part {i}/{total_parts}, retrying: {e}")

            tasks: set[Task[tuple[int, str]]] = {create_task(upload_part(i, chunk, filename)) for i, chunk, filename in chunks}
            results: dict[int, str] = {}
            uploaded_parts = 0

            while tasks:
                done, tasks = await wait(tasks, timeout=0.1)

                for task in done:
                    i, msg_id = task.result()
                    results[i] = msg_id
                    uploaded_parts += 1
                    write_log("INFO", data_center, "UPLOAD", user.username, f"Uploaded {uploaded_parts}/{total_parts} parts")

                yield progress.value

            file.links = [results[i] for i in range(1, total_parts + 1)]

        if not intermediate:
            add_file(file)
            write_log("INFO", data_center, "UPLOAD", user.username, f"Upload complete `{file_path.name}`")

        file_path.unlink()

    except Exception as e:
        write_log("ERROR", data_center, "UPLOAD", user.username, f"Unhandled exception: {e}\n{format_exc()}")


async def download_link(file: File, link: str) -> AsyncGenerator[tuple[str, int, int], None]:
    user: User = cast(User, get_user(username=file.username))
    data_center: DataCenter = DataCenter(file.data_center)
    write_log("INFO", data_center, "DOWNLOAD", user.username, f"Got link: {link}")

    try:
        write_log("INFO", data_center, "DOWNLOAD", user.username, f"Starting download from `{link}`")
        parsed: ParseResult = urlparse(link)
        host: str = cast(str, parsed.netloc.lower().removeprefix("www."))

        if host == "drive.google.com":
            downloader: Callable = download_google_drive

        elif host in {"youtube.com", "youtu.be", "m.youtube.com"}:
            downloader: Callable = download_youtube

        else:
            raise ValueError(f"Unsupported link: {link}")

        async for progress in downloader(file, link):
            yield progress

        add_file(file)
        write_log("INFO", data_center, "DOWNLOAD", user.username, f"Download and upload complete `{file.name}`")

    except Exception as e:
        write_log("ERROR", data_center, "DOWNLOAD", user.username, f"Unhandled exception: {e}\n{format_exc()}")
        raise
