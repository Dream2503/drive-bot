"""Virtual FTP filesystem backed by StoreLimitless database models and transfer routines."""

from __future__ import annotations

import asyncio
from asyncio import AbstractEventLoop
from backend.database.models import Directory, File, User
from backend.ftp.filesystem.download import FTPDownloadFile
from backend.ftp.filesystem.upload import FTPUploadFile
from concurrent.futures import Future
from core.config import TRANSFER_PATH
from core.transfer import file_upload
from datetime import datetime, timezone
from mimetypes import guess_type
from os import stat_result
from pyftpdlib.filesystems import AbstractedFS, FilesystemError
from stat import S_IFDIR, S_IFREG
from time import time
from typing import Any, TYPE_CHECKING, TypeVar, cast, Coroutine

if TYPE_CHECKING:
    from backend.ftp.handler import StoreLimitlessHandler

T = TypeVar("T")


class StoreLimitlessFS(AbstractedFS):
    """Expose each authenticated user's StoreLimitless directories and files as an FTP filesystem."""

    def __init__(self, root: str, cmd_channel: StoreLimitlessHandler) -> None:
        """Initialize the virtual filesystem with the authenticated user and application event loop."""

        super().__init__(root, cmd_channel)
        self.user: User = cast(User, cmd_channel.store_limitless_user)
        self.event_loop: AbstractEventLoop = cmd_channel.event_loop
        TRANSFER_PATH.mkdir(parents=True, exist_ok=True)

    def _run(self, coro: Coroutine[Any, Any, T]) -> T:
        """Run an asynchronous database operation on the application's event loop and wait for its result."""

        future: Future[T] = asyncio.run_coroutine_threadsafe(coro, self.event_loop)
        return future.result()

    def _get_directory(self, path: str) -> Directory | None:
        """Resolve a normalized virtual path to a directory owned by the authenticated user."""

        path: str = self.ftpnorm(path)

        if path == "/":
            return self._run(self.user.home)

        parent: str
        name: str
        parent, _, name = path.rpartition("/")
        parent = parent or "/"
        parent_directory: Directory | None = self._get_directory(parent)

        if parent_directory is None:
            return None

        directories: list[Directory] = self._run(Directory.get_all(self.user.username, directory=parent_directory.path))
        return next((directory for directory in directories if directory.path.name == name), None)

    def _get_file(self, path: str) -> File | None:
        """Resolve a normalized virtual path to a file owned by the authenticated user."""

        path: str = self.ftpnorm(path)

        if path == "/":
            return None

        parent: str
        name: str
        parent, _, name = path.rpartition("/")
        parent = parent or "/"
        directory: Directory | None = self._get_directory(parent)

        if directory is None:
            return None

        files: list[File] = self._run(File.get_all(self.user.username, directory_id=directory.id))
        return next((file for file in files if file.name == name), None)

    def _get_transfer_path(self, file: File) -> Path:
        """Build the temporary local path used while receiving an uploaded file."""

        directory: Path = TRANSFER_PATH / self.user.username
        directory.mkdir(parents=True, exist_ok=True)
        return directory / f"{file.id}_{file.name}"

    def _finish_upload(self, file: File, path: Path) -> None:
        """Validate the staged upload and pass it to the StoreLimitless upload pipeline."""

        try:
            size: int = path.stat().st_size

            if size == 0:
                path.unlink(missing_ok=True)
                return

            file.size = size
            file.modified_at = datetime.now(timezone.utc)
            self._run(self._upload_file(file, path))

        except Exception:
            path.unlink(missing_ok=True)
            raise

    async def _upload_file(self, file: File, path: Path) -> None:
        """Consume the asynchronous upload pipeline until the file has been processed."""

        async for _ in file_upload(file, path):
            pass

    def listdir(self, path: str) -> list[str]:
        """Return the immediate directory and file names for a virtual directory."""

        path: str = self.ftpnorm(path)
        directory: Directory | None = self._get_directory(path)

        if directory is None:
            raise OSError(2, "No such file or directory", path)

        directories: list[Directory] = self._run(Directory.get_all(self.user.username, directory=directory.path))
        files: list[File] = self._run(File.get_all(self.user.username, directory_id=directory.id))
        return [directory.path.name for directory in directories] + [file.name for file in files]

    def isdir(self, path: str) -> bool:
        """Report whether a virtual path represents a directory."""

        path: str = self.ftpnorm(path)
        return path == "/" or self._get_directory(path) is not None

    def isfile(self, path: str) -> bool:
        """Report whether a virtual path represents a file."""

        path: str = self.ftpnorm(path)
        return path != "/" and self._get_file(path) is not None

    def islink(self, path: str) -> bool:
        """Report that StoreLimitless does not expose symbolic links."""

        return False

    def lexists(self, path: str) -> bool:
        """Check whether a virtual path exists without following links."""

        path: str = self.ftpnorm(path)
        return path == "/" or self._get_directory(path) is not None or self._get_file(path) is not None

    def exists(self, path: str) -> bool:
        """Check whether a virtual path exists."""

        return self.lexists(path)

    def getsize(self, path: str) -> int:
        """Return a file's size, or zero for a directory."""

        path: str = self.ftpnorm(path)

        if path == "/":
            return 0

        file: File | None = self._get_file(path)

        if file is not None:
            return file.size

        if self._get_directory(path) is not None:
            return 0

        raise OSError(2, "No such file or directory", path)

    def getmtime(self, path: str) -> float:
        """Return the modification timestamp for a file or directory."""

        path: str = self.ftpnorm(path)

        if path == "/":
            return time()

        file: File | None = self._get_file(path)

        if file is not None:
            return file.modified_at.timestamp()

        directory: Directory | None = self._get_directory(path)

        if directory is not None:
            return directory.modified_at.timestamp()

        raise OSError(2, "No such file or directory", path)

    def realpath(self, path: str) -> str:
        """Return the normalized virtual FTP path."""

        return self.ftpnorm(path)

    def validpath(self, path: str) -> bool:
        """Validate a virtual path according to the filesystem's path policy."""

        return self.ftpnorm(path).startswith("/")

    def stat(self, path: str) -> stat_result:
        """Return filesystem metadata for the root, a directory, or a file."""

        path: str = self.ftpnorm(path)

        if path == "/":
            now: int = int(time())
            return stat_result((S_IFDIR | 0o755, 0, 0, 1, 0, 0, 0, now, now, now))

        directory: Directory | None = self._get_directory(path)

        if directory is not None:
            modified: int = int(directory.modified_at.timestamp())
            return stat_result((S_IFDIR | 0o755, directory.id, 0, 1, 0, 0, 0, modified, modified, modified))

        file: File | None = self._get_file(path)

        if file is not None:
            modified: int = int(file.modified_at.timestamp())
            return stat_result((S_IFREG | 0o644, file.id, 0, 1, 0, 0, file.size, modified, modified, modified))

        raise OSError(2, "No such file or directory", path)

    def lstat(self, path: str) -> stat_result:
        """Return metadata for a virtual path; links are not supported."""

        return self.stat(path)

    def chdir(self, path: str) -> None:
        """Change the FTP session's current working directory."""

        path: str = self.ftpnorm(path)

        if self._get_directory(path) is None:
            raise OSError(2, "No such file or directory", path)

        self.cwd = path

    def mkdir(self, path: str) -> None:
        """Create a directory under an existing parent directory."""

        path: str = self.ftpnorm(path)

        if path == "/" or self.lexists(path):
            raise OSError(17, "File exists", path)

        parent: str
        name: str
        parent, _, name = path.rpartition("/")
        parent = parent or "/"
        directory: Directory | None = self._get_directory(parent)

        if directory is None:
            raise OSError(2, "No such file or directory", parent)

        self._run(Directory(path=directory.path / name, modified_at=datetime.now(timezone.utc), username=self.user.username).save())

    def remove(self, path: str) -> None:
        """Move a file to the user's trash."""

        path: str = self.ftpnorm(path)
        file: File | None = self._get_file(path)

        if file is None:
            if self._get_directory(path) is not None:
                raise OSError(21, "Is a directory", path)

            raise OSError(2, "No such file or directory", path)

        self._run(file.move_to_trash())

    def rmdir(self, path: str) -> None:
        """Move a non-root, non-home directory to the user's trash."""

        path: str = self.ftpnorm(path)

        if path == "/":
            raise OSError(1, "Permission denied", path)

        directory: Directory | None = self._get_directory(path)

        if directory is None:
            raise OSError(2, "No such file or directory", path)

        home: Directory = self._run(self.user.home)

        if directory.id == home.id:
            raise OSError(1, "Permission denied", path)

        self._run(directory.move_to_trash())

    def _get_descendant_directories(self, path: Path) -> list[Directory]:
        """Collect descendants before a directory path is changed."""

        descendants: list[Directory] = []
        pending: list[Path] = [path]

        while pending:
            parent_path: Path = pending.pop()
            children: list[Directory] = self._run(Directory.get_all(self.user.username, directory=parent_path))

            for child in children:
                descendants.append(child)
                pending.append(child.path)

        return descendants

    def rename(self, src: str, dst: str) -> None:
        """Rename or move a file or directory to a destination path."""

        src: str = self.ftpnorm(src)
        dst: str = self.ftpnorm(dst)

        if src == "/" or dst == "/":
            raise OSError(1, "Permission denied", src)

        if self.lexists(dst):
            raise OSError(17, "File exists", dst)

        parent: str
        name: str
        parent, _, name = dst.rpartition("/")
        parent = parent or "/"
        directory: Directory | None = self._get_directory(parent)

        if directory is None:
            raise OSError(2, "No such file or directory", parent)

        file: File | None = self._get_file(src)

        if file is not None:
            file.name = name
            file.directory_id = directory.id
            file.modified_at = datetime.now(timezone.utc)
            self._run(file.save())
            return

        source_directory: Directory | None = self._get_directory(src)

        if source_directory is None:
            raise OSError(2, "No such file or directory", src)

        old_path: Path = source_directory.path
        new_path: Path = directory.path / name
        descendants: list[Directory] = self._get_descendant_directories(old_path)
        source_directory.path = new_path
        source_directory.modified_at = datetime.now(timezone.utc)
        self._run(source_directory.save())

        for descendant in descendants:
            relative_path: Path = descendant.path.relative_to(old_path)
            descendant.path = new_path / relative_path
            descendant.modified_at = datetime.now(timezone.utc)
            self._run(descendant.save())

    def chmod(self, path: str, mode: int) -> None:
        """Reject permission changes, which the virtual filesystem does not support."""

        if not self.lexists(path):
            raise OSError(2, "No such file or directory", path)

        raise FilesystemError("chmod is not supported by StoreLimitless.")

    def open(self, filename: str, mode: str) -> FTPDownloadFile | FTPUploadFile:
        """Open a virtual file for downloading or create a staged upload for writing."""

        filename: str = self.ftpnorm(filename)

        if "r" in mode:
            file: File | None = self._get_file(filename)

            if file is None:
                raise OSError(2, "No such file or directory", filename)

            return FTPDownloadFile(file, self.event_loop)

        if "w" in mode or "a" in mode:
            parent: str
            name: str
            parent, _, name = filename.rpartition("/")
            parent = parent or "/"
            directory: Directory | None = self._get_directory(parent)

            if directory is None:
                raise OSError(2, "No such file or directory", parent)

            existing: File | None = self._get_file(filename)

            if existing is not None:
                if "w" in mode:
                    self._run(existing.move_to_trash())

                else:
                    raise OSError(17, "File exists", filename)

            file: File = File(
                directory_id=directory.id,
                name=name, type=guess_type(name)[0] or "application/octet-stream",
                size=0,
                modified_at=datetime.now(timezone.utc),
                links=[],
                data_center=getattr(self.user, "data_center", None) or "Discord",
                username=self.user.username
            )
            transfer_path: Path = self._get_transfer_path(file)

            if "a" in mode:
                transfer_path.touch()

            else:
                transfer_path.write_bytes(b"")

            return FTPUploadFile(self, file, transfer_path, "ab" if "a" in mode else "wb")

        raise FilesystemError(f"Unsupported file mode: {mode}")
