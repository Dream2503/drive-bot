from __future__ import annotations

from datetime import datetime
from pathlib import Path
from time import sleep
from typing import Literal, TYPE_CHECKING

from tqdm import tqdm

from .auth import StoreLimitless
from .exception import StoreLimitlessResponseError
from .file import File

if TYPE_CHECKING:
    from .user import User


class Directory:
    def __init__(self, user: User, id: int, path: Path, modified_at: datetime, deleted_at: datetime | None):
        self.user: User = user
        self.id: int = id
        self.path: Path = path
        self.modified_at: datetime = modified_at
        self.deleted_at: datetime | None = deleted_at

    def __repr__(self) -> str:
        return (
            f"Directory(id={self.id}, "
            f"path={self.path!r}, "
            f"modified_at={self.modified_at}, "
            f"deleted_at={self.deleted_at}, "
            f"user={self.user.username!r})"
        )

    def __str__(self) -> str:
        folders: int = 0
        files_count: int = 0
        total_size: int = 0
        directories_to_visit = [self]

        while directories_to_visit:
            directory = directories_to_visit.pop()
            directories, files = directory.ls()

            folders += len(directories)
            files_count += len(files)
            total_size += sum(file.size for file in files)
            directories_to_visit.extend(directories)

        size: float = float(total_size)
        units: tuple[str, ...] = ("B", "KB", "MB", "GB", "TB")

        for unit in units:
            if size < 1024 or unit == units[-1]:
                break
            size /= 1024

        return (
            f"Directory: {self.path}\n"
            f"Folders: {folders}\n"
            f"Files: {files_count}\n"
            f"Size: {size:.2f} {unit}\n"
            f"Modified: {self.modified_at}\n"
        )

    def mkdir(self, name: str) -> Directory:
        if not name or name in (".", ".."):
            raise ValueError("Invalid folder name")

        StoreLimitless.request(
            self.user.token,
            "POST",
            "/auth/create-folder",
            params={
                "directory": str(self.path),
                "name": name,
            },
        )
        return self

    def cd(self, arg: str) -> Directory:
        if arg in ("~", "/"):
            self.__dict__.update(self.user.directory.__dict__)
            return self

        if len(Path(arg).parts) != 1:
            raise ValueError("cd accepts only one directory at a time")

        path = self.path / arg if not arg.startswith("/") else Path(arg)
        directories, _ = self.ls()

        for directory in directories:
            if directory.path == path:
                self.__dict__.update(directory.__dict__)
                return self

        raise ValueError(f"Directory does not exist: {path}")

    def ls(self) -> tuple[list[Directory], list[File]]:
        current_directory = str(self.path)
        response = StoreLimitless.request(
            self.user.token,
            "GET",
            "/auth/directory",
            params={"directory": current_directory},
        )
        directories, files = response.json()

        return [
            Directory(self.user,
                      directory["id"],
                      Path(directory["path"]),
                      datetime.fromisoformat(directory["modified_at"]),
                      datetime.fromisoformat(directory["deleted_at"]) if directory["deleted_at"] else None)
            for directory in directories], [
            File(file["id"],
                 self,
                 file["name"],
                 file["type"],
                 file["size"],
                 datetime.fromisoformat(file["modified_at"]),
                 datetime.fromisoformat(file["deleted_at"]) if file["deleted_at"] else None,
                 file["data_center"])
            for file in files
        ]

    def find(self, file_name: str) -> tuple[list[Directory], list[File]]:
        directories: list[Directory] = []
        files: list[File] = []
        directories_to_visit: list[Directory] = [self]

        while directories_to_visit:
            directory: Directory = directories_to_visit.pop()
            child_directories, child_files = directory.ls()
            directories.extend(directory for directory in child_directories if file_name.lower() in directory.path.name.lower())
            files.extend(file for file in child_files if file_name.lower() in file.name.lower())
            directories_to_visit.extend(child_directories)

        return directories, files

    def upload(self, source: str | Path, data_center: Literal["Discord", "Telegram"], *, quiet: bool = False) -> File:
        if isinstance(source, Path) or not source.startswith(("http://", "https://")):
            path: Path = Path(source)

            if not path.is_file():
                raise FileNotFoundError(path)

            file_name: str = path.name

            with path.open("rb") as file:
                response = StoreLimitless.request(
                    self.user.token,
                    "POST",
                    "/auth/upload",
                    headers={
                        "X-Data-Center": data_center,
                        "X-File-Name": file_name,
                        "X-Directory": str(self.path),
                        "Content-Type": "application/octet-stream",
                    },
                    data=file,
                )
        else:
            response = StoreLimitless.request(
                self.user.token,
                "POST",
                "/auth/upload-link",
                params={
                    "link": source,
                    "data_center": data_center,
                    "directory": str(self.path),
                },
            )

        try:
            job_id: str = response.json()["job_id"]

        except (ValueError, KeyError, TypeError) as e:
            raise StoreLimitlessResponseError("StoreLimitless server returned an invalid upload response") from e

        with tqdm(
                unit="B",
                unit_scale=True,
                unit_divisor=1024,
                disable=quiet,
                ascii=" ━",
                colour="green",
                bar_format="\033[92m{desc}\033[0m {bar:40}\033[0m \033[92m{n_fmt}/{total_fmt}\033[0m \033[91m{rate_fmt}\033[0m eta \033[96m{remaining}\033[0m"
        ) as bar:
            while True:
                response = StoreLimitless.request(
                    self.user.token,
                    "GET",
                    f"/auth/upload/{job_id}/status",
                )

                try:
                    status: dict = response.json()

                except (ValueError, KeyError, TypeError) as e:
                    raise StoreLimitlessResponseError("StoreLimitless server returned an invalid upload status") from e

                bar.total = status["total"]
                bar.n = status["transfer"]
                bar.set_description(status["message"], refresh=False)
                bar.refresh()

                if status["status"] == "completed":
                    break

                sleep(0.1)

        if status["file_id"] is None:
            raise StoreLimitlessResponseError("Upload completed but the server did not return a file ID")

        for file in self.ls()[1]:
            if file.id == status["file_id"]:
                return file

        raise StoreLimitlessResponseError(f"Upload completed but file {status["file_id"]} could not be found")
