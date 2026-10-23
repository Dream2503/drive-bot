"""Offline integration tests for public Google Drive folder scheduling."""

from __future__ import annotations

import asyncio
import threading
import time
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from core.utils.progress import Progress
from core.utils import download_utils
import core.transfer as transfer


class FakeDirectory:
    """In-memory directory rows for folder-ingestion tests."""

    base_directory: "FakeDirectory | None" = None

    def __init__(self, directory_id: int, path: Path) -> None:
        self.id = directory_id
        self.path = path

    @classmethod
    async def get(cls, username: str, *, did: int | None = None, path: Path | None = None, trash: bool = False):
        return cls.base_directory


class FakeFile:
    """In-memory file row that records which destination received an upload."""

    saved: list[tuple[str, int, int]] = []

    def __init__(self, **kwargs: object) -> None:
        self.__dict__.update(kwargs)
        self.id: int | None = None

    async def save(self) -> None:
        self.id = len(self.saved) + 1
        self.saved.append((str(self.name), int(self.directory_id), int(self.size)))


class GoogleDriveFolderTests(unittest.IsolatedAsyncioTestCase):
    def test_public_folder_url_detection(self) -> None:
        self.assertTrue(download_utils.is_google_drive_folder_url(
            "https://drive.google.com/drive/folders/abc_DEF-123?usp=sharing"
        ))
        self.assertTrue(download_utils.is_google_drive_folder_url(
            "https://drive.google.com/drive/folders/abc_DEF-123/view?usp=drive_link"
        ))
        self.assertFalse(download_utils.is_google_drive_folder_url(
            "https://drive.google.com/file/d/abc_DEF-123/view"
        ))
        self.assertFalse(download_utils.is_google_drive_folder_url("https://example.com/drive/folders/abc"))

    async def test_nested_files_download_in_parallel_and_upload_one_at_a_time(self) -> None:
        entries = [
            SimpleNamespace(id="photo-id", path="Photos/photo.jpg", local_path="unused"),
            SimpleNamespace(id="project-id", path="Projects/source.zip", local_path="unused"),
            SimpleNamespace(id="root-id", path="movie.mkv", local_path="unused"),
        ]
        base_directory = FakeDirectory(1, Path("/home"))
        FakeDirectory.base_directory = base_directory
        created_directories: list[tuple[str, ...]] = []
        saved_files: list[tuple[str, int, int]] = []
        download_guard = threading.Lock()
        active_downloads = 0
        max_active_downloads = 0
        active_uploads = 0
        max_active_uploads = 0
        next_directory_id = 10

        async def ensure_directory(username: str, base: FakeDirectory, parts: tuple[str, ...]) -> FakeDirectory:
            nonlocal next_directory_id
            created_directories.append(parts)
            target = base.path.joinpath(*parts)
            next_directory_id += 1
            return FakeDirectory(next_directory_id, target)

        class TrackedFile(FakeFile):
            saved = saved_files

        class FakeDataCenter:
            NAME = "Test"

        def fake_download(file_id: str, output_path: Path, item: dict[str, object]) -> Path:
            nonlocal active_downloads, max_active_downloads
            with download_guard:
                active_downloads += 1
                max_active_downloads = max(max_active_downloads, active_downloads)
            try:
                time.sleep(0.05)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes((file_id + "-payload").encode())
                item["download_transfer"] = output_path.stat().st_size
                item["download_total"] = output_path.stat().st_size
                return output_path
            finally:
                with download_guard:
                    active_downloads -= 1

        @asynccontextmanager
        async def fake_upload_slot(ticket: object):
            nonlocal active_uploads, max_active_uploads
            active_uploads += 1
            max_active_uploads = max(max_active_uploads, active_uploads)
            try:
                await asyncio.sleep(0.005)
                yield
            finally:
                active_uploads -= 1

        async def fake_enqueue() -> object:
            return object()

        async def fake_cancel(ticket: object) -> None:
            return None

        async def fake_file_upload(remote_file: TrackedFile, local_path: Path, intermediate: bool = False):
            await asyncio.sleep(0.03)
            progress = Progress(str(remote_file.name), "Uploading File", int(remote_file.size))
            progress.transfer = int(remote_file.size)
            yield progress

        fake_input = SimpleNamespace(
            username="test-user",
            directory_id=1,
            data_center="Test",
            name="Public Drive folder",
        )

        with TemporaryDirectory() as temporary:
            with (
                patch.object(download_utils, "TRANSFER_PATH", Path(temporary)),
                patch.object(download_utils, "Directory", FakeDirectory),
                patch.object(download_utils, "File", TrackedFile),
                patch.object(download_utils, "DataCenter", lambda _name: FakeDataCenter),
                patch.object(download_utils, "ensure_torrent_directory", ensure_directory),
                patch.object(download_utils, "write_log", lambda *args, **kwargs: None),
                patch.object(download_utils, "_public_google_drive_folder_title", lambda _link: "Research Folder"),
                patch.object(download_utils, "_download_google_drive_entry", fake_download),
                patch.object(download_utils.gdown, "download_folder", lambda **kwargs: entries),
                patch.object(download_utils, "enqueue_ingestion_upload", fake_enqueue),
                patch.object(download_utils, "cancel_ingestion_upload", fake_cancel),
                patch.object(download_utils, "ingestion_upload_slot", fake_upload_slot),
                patch.object(transfer, "file_upload", fake_file_upload),
                patch.dict("os.environ", {"STORELIMITLESS_GOOGLE_DRIVE_DOWNLOADS": "3"}),
            ):
                snapshots: list[Progress] = []
                async for progress in download_utils.download_google_drive_folder(
                    fake_input,
                    "https://drive.google.com/drive/folders/public-folder-id",
                ):
                    snapshots.append(progress)

        self.assertGreaterEqual(max_active_downloads, 2, "independent files should download concurrently")
        self.assertEqual(max_active_uploads, 1, "one folder job must never overlap storage uploads")
        self.assertCountEqual(
            created_directories,
            [
                ("Research Folder",),
                ("Research Folder", "Photos"),
                ("Research Folder", "Projects"),
                ("Research Folder",),
            ],
        )
        self.assertCountEqual(
            [name for name, _directory_id, _size in saved_files],
            ["photo.jpg", "source.zip", "movie.mkv"],
        )
        self.assertEqual(len(saved_files), 3)
        self.assertEqual(snapshots[-1].message, "Google Drive folder import complete")
        self.assertTrue(all(item["status"] == "completed" for item in snapshots[-1].torrent_items))
        self.assertEqual(snapshots[-1].file_counts["completed"], 3)


if __name__ == "__main__":
    unittest.main()
