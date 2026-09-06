from asyncio import Semaphore, create_task, as_completed, Task, sleep
from datetime import datetime, timezone
from mimetypes import guess_type
from pathlib import Path
from traceback import format_exc
from typing import AsyncGenerator, Callable
from urllib.parse import urlparse, ParseResult

from backend.database import File, add_file, get_file, get_user, User
from core.config import TRANSFER_PATH
from core.data_center import DataCenter
from core.download_utils import download_google_drive, download_youtube, upload_part
from core.utils import write_log, get_transfer_path


async def upload(file: File) -> AsyncGenerator[float | int, None]:
    user: User | None = get_user(username=file.username)
    data_center: DataCenter = DataCenter(file.data_center)

    if not user:
        return

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
        write_log("INFO", data_center, "UPLOAD", user.username, f"Starting upload `{file_path.name}` ({total_parts} parts)")

        with file_path.open("rb") as f:
            chunks: list[tuple[int, bytes, str]] = []

            for i in range(1, total_parts + 1):
                chunk: bytes = f.read(data_center.MAX_SIZE)

                if not chunk:
                    break

                filename: str = f"{file_path.name}{'' if total_parts == 1 else f'.part{i:03d}'}"
                chunks.append((i, chunk, filename))

            semaphore = Semaphore(8)

            async def upload_part(i: int, chunk: bytes, filename: str) -> tuple[int, str]:
                async with semaphore:
                    while True:
                        try:
                            msg_id: str = await data_center.upload(chunk, filename)
                            return i, msg_id

                        except OSError as e:
                            write_log("ERROR", data_center, "UPLOAD", user.username, f"Network error part {i}/{total_parts}, retrying: {e}")

            tasks: list[Task[tuple[int, str]]] = [create_task(upload_part(i, chunk, filename)) for i, chunk, filename in chunks]
            results: dict[int, str] = {}

            for task in as_completed(tasks):
                i, msg_id = await task
                results[i] = msg_id
                progress: float | int = round((len(results) / total_parts) * 100, 2)
                write_log("INFO", data_center, "UPLOAD", user.username, f"Uploaded {len(results)}/{total_parts} ({progress:.1f}%)")
                yield progress

            file.links = [results[i] for i in range(1, total_parts + 1)]

        add_file(file)
        write_log("INFO", data_center, "UPLOAD", user.username, f"Upload complete `{file_path.name}`")
        file_path.unlink()

    except Exception as e:
        write_log("ERROR", data_center, "UPLOAD", user.username, f"Unhandled exception: {e}\n{format_exc()}")


async def download(file: File) -> AsyncGenerator[float | int, None]:
    data_center: DataCenter = DataCenter(file.data_center)
    write_log("INFO", data_center, "DOWNLOAD", str(file.username), f"Got file: {file}")

    try:
        total_parts: int = len(file.links)

        if total_parts == 0:
            write_log("ERROR", data_center, "DOWNLOAD", str(file.username), "File has no parts")
            return

        file_path: Path = get_transfer_path(file.username, file.directory, file.name)

        if not file_path.is_relative_to(TRANSFER_PATH.resolve()):
            write_log("ERROR", data_center, "DOWNLOAD", str(file.username), f"Illegal file path attempted: {file.name}")
            return

        write_log("INFO", data_center, "DOWNLOAD", str(file.username), f"Starting download `{file.name}` ({total_parts} parts)")

        with file_path.open("wb") as output:
            for i, flink in enumerate(file.links):
                part: bytes | None = await DataCenter.get_cached_part(str(file.username), i)

                if part is None:
                    while True:
                        try:
                            chunk: bytes = await data_center.download(flink)
                            break

                        except OSError as e:
                            write_log("ERROR", data_center, "DOWNLOAD", str(file.username),
                                      f"Network error part {i + 1}/{total_parts}, retrying: {e}")

                    await DataCenter.cache_part(str(file.username), i, chunk)
                    part = chunk

                output.write(part)
                progress: float | int = round(((i + 1) / total_parts) * 100, 2)
                write_log("INFO", data_center, "DOWNLOAD", str(file.username), f"Downloaded {i + 1}/{total_parts} ({progress:.1f}%)")
                yield progress

        write_log("INFO", data_center, "DOWNLOAD", str(file.username), f"Download complete `{file_path.name}`")

    except Exception as e:
        write_log("ERROR", data_center, "DOWNLOAD", str(file.username), f"Unhandled exception: {e}\n{format_exc()}")


async def download_link(file: File, link: str) -> AsyncGenerator[float | int, None]:
    data_center: DataCenter = DataCenter(file.data_center)
    write_log("INFO", data_center, "DOWNLOAD", file.username, f"Starting download: {link}")
    temp_dir: Path | None = None

    try:
        parsed: ParseResult = urlparse(link)
        host: str = parsed.netloc.lower().removeprefix("www.")

        if host == "drive.google.com":
            downloader: Callable = download_google_drive
            provider: str = "Google Drive"

        elif host in {"youtube.com", "youtu.be", "m.youtube.com"}:
            downloader: Callable = download_youtube
            provider: str = "YouTube"

        else:
            raise ValueError(f"Unsupported link: {link}")

        if provider == "YouTube":
            temp_dir, final_path, total_size, download_task, progress = await downloader(file, link)

            while not download_task.done():
                yield round(progress["value"] * 50, 2)
                await sleep(0.1)

            final_path, total_size = await download_task
            yield 50

            if not final_path.exists():
                raise OSError("YouTube download file not found")

            size: int = final_path.stat().st_size
            max_size: int = data_center.MAX_SIZE
            links: dict[int, str] = {}
            part: int = 0

            while part * max_size < size:
                start: int = part * max_size
                chunk_size: int = min(max_size, size - start)
                links[part] = await upload_part(file, data_center, final_path, part, chunk_size, size, file.name)
                part += 1
                yield round(50 + (start + chunk_size) / size * 50, 2)

        else:
            temp_dir, final_path, total_size, download_task = await downloader(file, link)
            max_size: int = data_center.MAX_SIZE
            part: int = 0
            links: dict[int, str] = {}

            while not download_task.done():
                files: list[Path] = [path for path in temp_dir.iterdir() if path.is_file()]

                if not files:
                    await sleep(0.1)
                    continue

                downloaded_path: Path = files[0]

                try:
                    size: int = downloaded_path.stat().st_size

                except FileNotFoundError:
                    continue

                while size >= (part + 1) * max_size:
                    links[part] = await upload_part(file, data_center, downloaded_path, part, max_size, total_size, file.name)
                    part += 1

                    if total_size:
                        yield round(min(part * max_size, total_size) / total_size * 100, 2)

                    else:
                        yield 0

                    try:
                        downloaded_path = next(path for path in temp_dir.iterdir() if path.is_file())
                        size = downloaded_path.stat().st_size

                    except (StopIteration, FileNotFoundError):
                        break

                await sleep(0.1)

            await download_task
            downloaded_path: Path = final_path

            if not downloaded_path.exists():
                raise OSError(f"{provider} download file not found")

            size = downloaded_path.stat().st_size

            while size >= (part + 1) * max_size:
                links[part] = await upload_part(file, data_center, downloaded_path, part, max_size, size, file.name)
                part += 1
                yield round(min(part * max_size, size) / size * 100, 2) if size else 0
                size = downloaded_path.stat().st_size

            start: int = part * max_size

            if size > start:
                links[part] = await upload_part(file, data_center, downloaded_path, part, size - start, size, file.name)
                part += 1

        file.size = size
        file.links = [links[i] for i in range(part)]
        file.type = guess_type(file.name)[0] or "application/octet-stream"
        file.modified_at = datetime.now(timezone.utc)
        add_file(file)
        write_log("INFO", data_center, "DOWNLOAD", file.username, f"Download and upload complete `{file.name}`")
        yield 100

    except Exception as e:
        write_log("ERROR", data_center, "DOWNLOAD", file.username, f"Unhandled exception: {e}\n{format_exc()}")
        raise

    finally:
        if temp_dir is not None and temp_dir.exists():
            for path in temp_dir.iterdir():
                if path.is_file():
                    path.unlink()
