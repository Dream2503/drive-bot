from asyncio import Task, to_thread, create_task, sleep, wait
from datetime import datetime, timezone
from mimetypes import guess_type
from pathlib import Path
from typing import BinaryIO, Any, AsyncGenerator, cast

import gdown
import requests
from yt_dlp import YoutubeDL

from backend.database import File, get_file
from core.config import TRANSFER_PATH, GOOGLE_API_KEY
from core.data_center import DataCenter
from core.utils import write_log, Progress, get_transfer_path


async def upload_part(file: File, data_center: DataCenter, path: Path, part: int, size: int, total_size: int, name: str, progress: Progress) -> str:
    with path.open("rb") as buffer:
        buffer.seek(part * data_center.MAX_SIZE)
        chunk: bytes = buffer.read(size)

    msg_id: str = await data_center.upload(chunk, f"{name}.part{part}", progress)

    if total_size:
        total_parts: int = (total_size + data_center.MAX_SIZE - 1) // data_center.MAX_SIZE
        write_log("INFO", data_center, "UPLOAD", file.username, f"Uploaded part {part + 1}/{total_parts}")

    else:
        write_log("INFO", data_center, "UPLOAD", file.username, f"Uploaded part {part + 1}")

    return msg_id


def get_unique_name(directory: str, name: str, username: str) -> str:
    if not get_file(directory=directory, name=name, username=username):
        return name

    path: Path = Path(name)
    stem, extension = path.stem, path.suffix
    i: int = 1

    while get_file(name=f"{stem}({i}){extension}", username=username):
        i += 1

    return f"{stem}({i}){extension}"


async def download_google_drive(file: File, link: str) -> AsyncGenerator[tuple[str, int, int], None]:
    data_center: DataCenter = DataCenter(file.data_center)
    temp_dir: Path = TRANSFER_PATH / file.username / "gdown"
    temp_dir.mkdir(parents=True, exist_ok=True)

    for path in temp_dir.iterdir():
        if path.is_file():
            path.unlink()

    try:
        file_id: str = link.split("/file/d/")[1].split("/")[0]
        response = await to_thread(requests.get, f"https://www.googleapis.com/drive/v3/files/{file_id}",
                                   params={"fields": "name,size", "key": GOOGLE_API_KEY}, timeout=30)

        if not response.ok:
            raise OSError(f"Google Drive API error: {response.status_code}: {response.text}")

        data: dict[str, str] = response.json()

        if "size" not in data:
            raise OSError("Could not determine Google Drive file size")

        file.name = get_unique_name(file.directory, data.get("name") or file_id, file.username)
        total_size: int = int(data["size"])
        output: Path = temp_dir / file.name
        progress: Progress = Progress(f"Uploading {file.name}", total_size)
        yield progress.value

        def download() -> None:
            result: str | BinaryIO | tuple[Any, ...] = gdown.download(link, output=str(output), quiet=False)

            if not result:
                raise OSError("Google Drive download failed")

        download_task: Task[Any] = create_task(to_thread(download))
        upload_tasks: set[Task[tuple[int, str]]] = set()
        max_size: int = data_center.MAX_SIZE
        part: int = 0
        links: dict[int, str] = {}

        async def upload(part: int, path: Path, size: int) -> tuple[int, str]:
            return part, await upload_part(file, data_center, path, part, size, total_size, file.name, progress)

        while not download_task.done():
            files: list[Path] = [path for path in temp_dir.iterdir() if path.is_file()]

            if files:
                downloaded_path: Path = files[0]

                try:
                    size: int = downloaded_path.stat().st_size

                except FileNotFoundError:
                    size = 0

                while size >= (part + 1) * max_size:
                    upload_tasks.add(create_task(upload(part, downloaded_path, max_size)))
                    part += 1

            if upload_tasks:
                done, upload_tasks = await wait(upload_tasks, timeout=0)

                for task in done:
                    i, msg_id = task.result()
                    links[i] = msg_id

            yield progress.value
            await sleep(0.1)

        await download_task

        if not output.exists():
            raise OSError("Google Drive download file not found")

        size: int = output.stat().st_size

        while size >= (part + 1) * max_size:
            upload_tasks.add(create_task(upload(part, output, max_size)))
            part += 1
            size = output.stat().st_size

        start: int = part * max_size

        if size > start:
            upload_tasks.add(create_task(upload(part, output, size - start)))
            part += 1

        while upload_tasks:
            done, upload_tasks = await wait(upload_tasks, timeout=0.1)

            for task in done:
                i, msg_id = task.result()
                links[i] = msg_id

            yield progress.value

        file.size = size
        file.links = [links[i] for i in range(part)]
        file.type = guess_type(file.name)[0] or "application/octet-stream"
        file.modified_at = datetime.now(timezone.utc)

        progress.transfer = total_size
        yield progress.value

    finally:
        if temp_dir.exists():
            for path in temp_dir.iterdir():
                if path.is_file():
                    path.unlink()


async def download_youtube(file: File, link: str) -> AsyncGenerator[tuple[str, int, int], None]:
    from core.transfer import upload

    temp_dir: Path = TRANSFER_PATH / file.username / "yt-dlp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    for path in temp_dir.iterdir():
        if path.is_file():
            path.unlink()

    download_progress: Progress = Progress("Downloading Video", 0)
    current_progress: dict[str, Progress] = {"value": download_progress}
    yield download_progress.value

    def hook(data: dict):
        filename: str = data.get("filename", "")

        if filename.endswith((".vtt", ".srt", ".ass", ".ttml", ".srv1", ".srv2", ".srv3")):
            return

        info: dict = data.get("info_dict", {})
        vcodec: str | None = info.get("vcodec")
        acodec: str | None = info.get("acodec")

        if vcodec != "none" and acodec == "none":
            if current_progress["value"] is not download_progress:
                current_progress["value"] = download_progress
                download_progress.message = "Downloading Video"

        elif acodec != "none" and vcodec == "none":
            if current_progress["value"] is download_progress:
                current_progress["value"] = Progress("Downloading Audio", 0)

        progress: Progress = current_progress["value"]

        if data["status"] == "downloading":
            progress.total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
            progress.transfer = data.get("downloaded_bytes", 0)

        elif data["status"] == "finished":
            progress.transfer = progress.total

    def download() -> None:
        with YoutubeDL(cast(Any, {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "format": "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/best",
            "outtmpl": str(temp_dir / "%(title)s.%(ext)s"),
            "merge_output_format": "mkv",
            "writesubtitles": True,
            "subtitleslangs": ["en"],
            "embedsubtitles": True,
            "progress_hooks": [hook],
        })) as ydl:
            ydl.download([link])

    try:
        download_task: Task[Any] = create_task(to_thread(download))

        while not download_task.done():
            yield current_progress["value"].value
            await sleep(0.1)

        await download_task
        files: list[Path] = [path for path in temp_dir.iterdir() if path.is_file()]

        if not files:
            raise OSError("YouTube download produced no file")

        output: Path = max(files, key=lambda path: path.stat().st_size)
        file.name = get_unique_name(file.directory, output.name, file.username)
        file_path: Path = get_transfer_path(file.username, file.directory, file.name)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        output.rename(file_path)
        file.size = file_path.stat().st_size
        file.type = guess_type(file.name)[0] or "application/octet-stream"
        yield current_progress["value"].value

        async for progress in upload(file, True):
            yield progress

    finally:
        if temp_dir.exists():
            for path in temp_dir.iterdir():
                if path.is_file():
                    path.unlink()

# async def download_torrent(file: File, link: str) -> AsyncGenerator[float | int, None]:
#     data_center: type[DataCenter] = DataCenter(file.data_center)
#     write_log("INFO", data_center, "DOWNLOAD", str(file.username), f"Starting torrent download: {link}")
#
#     try:
#         loop = asyncio.get_running_loop()
#         queue: asyncio.Queue[float | None] = asyncio.Queue()
#         next_log = 10.0
#         next_yield = 1.0
#
#         def download():
#             session = lt.session()
#             params = lt.parse_magnet_uri(link)
#             params.save_path = str(TRANSFER_PATH)
#             handle = session.add_torrent(params)
#
#             while True:
#                 status = handle.status()
#                 value = round(status.progress * 100, 2)
#                 loop.call_soon_threadsafe(queue.put_nowait, value)
#
#                 if status.is_seeding:
#                     break
#
#                 import time
#                 time.sleep(0.5)
#
#             return session, handle
#
#         download_task = asyncio.create_task(asyncio.to_thread(download))
#
#         while not download_task.done():
#             try:
#                 value = await asyncio.wait_for(queue.get(), timeout=0.1)
#
#                 if value is None:
#                     continue
#
#                 if value >= next_log:
#                     write_log("INFO", data_center, "DOWNLOAD", str(file.username), f"Torrent download ({value:.1f}%)")
#                     next_log += 10
#
#                 if value >= next_yield:
#                     yield value
#                     next_yield += 1
#
#             except asyncio.TimeoutError:
#                 pass
#
#         session, handle = await download_task
#
#         while not queue.empty():
#             value = queue.get_nowait()
#
#             if value is not None and value >= next_yield:
#                 yield value
#                 next_yield += 1
#
#         if not handle.is_valid():
#             raise OSError("Torrent download failed")
#
#         torrent_info = handle.torrent_file()
#
#         if torrent_info is None:
#             raise OSError("Failed to obtain torrent metadata")
#
#         if torrent_info.num_files() != 1:
#             raise OSError("Only single-file torrents are supported")
#
#         file.name = Path(torrent_info.layout().file_path(0)).name
#
#         target_path = TRANSFER_PATH / file.name
#         downloaded_path = TRANSFER_PATH / torrent_info.layout().file_path(0)
#
#         if downloaded_path != target_path:
#             downloaded_path.replace(target_path)
#
#         write_log("INFO", data_center, "DOWNLOAD", str(file.username), f"Torrent download complete `{file.name}`")
#
#         async for progress in upload(file):
#             yield progress
#
#     except Exception as e:
#         write_log("ERROR", data_center, "DOWNLOAD", str(file.username), f"Unhandled exception: {e}\n{format_exc()}")
