import core.transfer
import gdown
import requests
from asyncio import Task, to_thread, create_task, sleep
from backend.database.models import File
from core.config import TRANSFER_PATH
from core.data_center import DataCenter
from core.utils import write_log
from core.utils.binaries import get_ffmpeg_path
from core.utils.env import GOOGLE_API_KEY
from core.utils.progress import Progress, upload_growing_file
from datetime import datetime, timezone
from mimetypes import guess_type
from pathlib import Path
from traceback import format_exc
from typing import Any, AsyncGenerator, cast
from yt_dlp import YoutubeDL


async def download_google_drive(file: File, link: str) -> AsyncGenerator[Progress, None]:
    data_center: DataCenter = DataCenter(file.data_center)
    temp_dir: Path = TRANSFER_PATH / file.username / "gdown"
    temp_dir.mkdir(parents=True, exist_ok=True)

    for path in temp_dir.iterdir():
        if path.is_file():
            path.unlink()

    try:
        progress: Progress = Progress(file.name, f"Uploading File", 0)
        file_id: str = link.split("/file/d/")[1].split("/")[0]
        response = await to_thread(
            requests.get,
            f"https://www.googleapis.com/drive/v3/files/{file_id}",
            params={"fields": "name,size", "key": GOOGLE_API_KEY},
            timeout=30
        )

        if not response.ok:
            raise OSError(f"Google Drive API error: {response.status_code}: {response.text}")

        data: dict[str, str] = response.json()

        if "size" not in data:
            raise OSError("Could not determine Google Drive file size")

        file.name = data.get("name") or file_id
        total_size: int = int(data["size"])
        progress.name = file.name
        progress.total = total_size
        download_task: Task[Any] = create_task(to_thread(gdown.download, link, output=str(temp_dir), quiet=True))

        while True:
            files = [path for path in temp_dir.iterdir() if path.is_file()]

            if files:
                output = files[0]
                break

            await sleep(0.1)

        progress_value: Progress

        async for progress_value in upload_growing_file(
                file=file,
                path=output,
                data_center=data_center,
                progress=progress,
                producer=download_task,
                total_size=total_size
        ):
            yield progress_value

        file.type = guess_type(file.name)[0] or "application/octet-stream"
        file.modified_at = datetime.now(timezone.utc)

    except Exception as e:
        write_log("ERROR", data_center, "UPLOAD", file.username, f"Unhandled exception: {e}\n{format_exc()}")
        raise

    finally:
        if temp_dir.exists():
            for path in temp_dir.iterdir():
                if path.is_file():
                    path.unlink()


async def download_youtube(file: File, link: str) -> AsyncGenerator[Progress, None]:
    ffmpeg_path: Path = get_ffmpeg_path()
    temp_dir: Path = TRANSFER_PATH / file.username / "yt-dlp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    for path in temp_dir.iterdir():
        if path.is_file():
            path.unlink()

    download_progress: Progress = Progress(file.name, "Downloading Video", 0)
    audio_progress: Progress = Progress(file.name, "Downloading Audio", 0)
    merge_progress: Progress = Progress(file.name, "Merging Audio and Video", 0)
    current_progress: dict[str, Progress] = {"value": download_progress}

    def update_progress_name(name: str) -> None:
        if not name:
            return

        file.name = name
        download_progress.name = name
        audio_progress.name = name
        merge_progress.name = name
        current_progress["value"].name = name

    def get_download_name(data: dict) -> str | None:
        info: dict = data.get("info_dict") or {}

        raw_filename: str = (data.get("tmpfilename") or data.get("filename") or "")

        if not raw_filename:
            return None

        filename = Path(raw_filename).name

        if filename.endswith(".part"):
            filename = filename[:-len(".part")]

        temp_path = Path(filename)
        extension = temp_path.suffix
        title: str | None = info.get("title")
        vcodec: str | None = info.get("vcodec")
        acodec: str | None = info.get("acodec")
        separate_stream = (vcodec not in (None, "none") and acodec == "none") or (acodec not in (None, "none") and vcodec == "none")

        if separate_stream:
            extension = ".mkv"

        if title:
            return f"{title}{extension}" if extension else title

        stem = temp_path.stem
        format_id = str(info.get("format_id") or "")

        if format_id:
            for marker in (f".f{format_id}", f".{format_id}"):
                if stem.endswith(marker):
                    stem = stem[:-len(marker)]
                    break
        else:
            possible_id = stem.rsplit(".f", 1)

            if (len(possible_id) == 2 and possible_id[1].isdigit()):
                stem = possible_id[0]

        return f"{stem}{extension}" if extension else stem

    def hook(data: dict) -> None:
        info: dict = data.get("info_dict") or {}
        resolved_name = get_download_name(data)

        if resolved_name and resolved_name != file.name:
            update_progress_name(resolved_name)

        filename: str = data.get("filename", "")

        if filename.endswith((".vtt", ".srt", ".ass", ".ttml", ".srv1", ".srv2", ".srv3")):
            return

        vcodec: str | None = info.get("vcodec")
        acodec: str | None = info.get("acodec")

        if vcodec not in (None, "none") and acodec == "none":
            current_progress["value"] = download_progress
            download_progress.message = "Downloading Video"

        elif acodec not in (None, "none") and vcodec == "none":
            current_progress["value"] = audio_progress
            audio_progress.message = "Downloading Audio"

        progress: Progress = current_progress["value"]

        if data["status"] == "downloading":
            progress.total = (data.get("total_bytes") or data.get("total_bytes_estimate") or 0)
            progress.transfer = data.get("downloaded_bytes", 0)

        elif data["status"] == "finished":
            progress.transfer = progress.total

    def postprocessor_hook(data: dict) -> None:
        if data.get("status") == "started":
            current_progress["value"] = merge_progress
            merge_progress.message = "Merging Audio and Video"

        elif data.get("status") == "finished":
            merge_progress.transfer = merge_progress.total

    def download() -> None:
        with YoutubeDL(cast(Any, {
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "noplaylist": True,
            "format": "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/best",
            "outtmpl": str(temp_dir / "%(title)s.%(ext)s"),
            "merge_output_format": "mkv",
            "ffmpeg_location": str(ffmpeg_path.parent),
            "socket_timeout": 60,
            "retries": 10,
            "progress_hooks": [hook],
            "postprocessor_hooks": [postprocessor_hook],
        })) as ydl:
            ydl.download([link])

    try:
        download_task: Task[Any] = create_task(to_thread(download))

        while not download_task.done():
            yield current_progress["value"]
            await sleep(0.1)

        await download_task

        files: list[Path] = [path for path in temp_dir.iterdir() if path.is_file()]

        if not files:
            raise OSError("YouTube download produced no file")

        output: Path = max(files, key=lambda path: path.stat().st_size)
        update_progress_name(output.name)

        file.size = output.stat().st_size
        file.type = guess_type(file.name)[0] or "application/octet-stream"

        yield current_progress["value"]
        progress: Progress

        async for progress in core.transfer.file_upload(file, output, intermediate=True):
            yield progress

    finally:
        if temp_dir.exists():
            for path in temp_dir.iterdir():
                if path.is_file():
                    path.unlink()
