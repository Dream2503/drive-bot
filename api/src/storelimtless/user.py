from __future__ import annotations

from copy import copy
from datetime import datetime
from pathlib import Path
from typing import cast, TYPE_CHECKING

if TYPE_CHECKING:
    from .directory import Directory


class User:
    def __init__(self, token: str, username: str, first_name: str, last_name: str, directory: dict[str, int | str | None]) -> None:
        from .directory import Directory

        self.token = token
        self.username: str = username
        self.first_name: str = first_name
        self.last_name: str = last_name
        self._directory: Directory = Directory(self,
                                               cast(int, directory["id"]),
                                               Path(cast(str, directory["path"])),
                                               datetime.fromisoformat(cast(str, directory["modified_at"])),
                                               datetime.fromisoformat(cast(str, directory["deleted_at"])) if directory["deleted_at"] else None)

    def __repr__(self) -> str:
        return (
            f"User(username={self.username!r}, "
            f"first_name={self.first_name!r}, "
            f"last_name={self.last_name!r}, "
            f"directory={self._directory!r})"
        )

    def __str__(self) -> str:
        return (
            f"{self.first_name} {self.last_name} (@{self.username})\n"
            f"{str(self.directory).split("\n", 1)[1]}"
        )

    @property
    def directory(self) -> Directory:
        return copy(self._directory)
