"""Data-center provider factory and bounded on-disk cache for remote file chunks."""

from __future__ import annotations

import os
from asyncio import Lock, to_thread
from collections import OrderedDict
from pathlib import Path
from shutil import rmtree
from time import monotonic
from typing import TYPE_CHECKING, cast
from uuid import uuid4

from core.config import TRANSFER_PATH

if TYPE_CHECKING:
    from core.utils.progress import Progress


class DataCenter:
    """Factory base for storage providers and owner of the shared chunk cache."""

    NAME: str
    TOKEN: str
    FILE_DUMP_ID: int
    MAX_SIZE: int = 10 * 1024 * 1024
    CACHE_DIR: Path = TRANSFER_PATH / "cached"
    CACHE_LIMIT: int = 256 * 1024 * 1024

    _cache: OrderedDict[str, tuple[int, float]] = OrderedDict()
    _cache_size: int = 0
    _cache_lock: Lock | None = None

    def __new__(cls, name: str) -> type[DataCenter] | None:
        """Resolve a configured provider name to its provider class."""

        from core.utils.discord_ import Discord
        from core.utils.telegram_ import Telegram

        providers: dict[str, type[DataCenter]] = {
            Discord.NAME: Discord,
            Telegram.NAME: Telegram,
            Database.NAME: Database,
            BackEnd.NAME: BackEnd,
            Binaries.NAME: Binaries,
        }
        return providers.get(name)

    @staticmethod
    def _lock() -> Lock:
        """Return the lazily created async lock protecting cache metadata."""

        if DataCenter._cache_lock is None:
            DataCenter._cache_lock = Lock()

        return cast(Lock, DataCenter._cache_lock)

    @staticmethod
    def _part_path(fid: str, part: int) -> Path:
        """Build the deterministic on-disk path for one cached file part."""

        if part < 0:
            raise ValueError("Cache part index cannot be negative")

        if not fid or Path(fid).name != fid or fid in {".", ".."}:
            raise ValueError("Invalid file cache identifier")

        return DataCenter.CACHE_DIR / fid / f"part_{part:08d}"

    @staticmethod
    async def cache_part(fid: str, part: int, data: bytes) -> Path:
        """Atomically write a downloaded part and account for it in the LRU cache."""

        path: Path = DataCenter._part_path(fid, part)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp: Path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")

        try:
            await to_thread(temp.write_bytes, data)
            os.replace(temp, path)

        finally:
            temp.unlink(missing_ok=True)

        key: str = str(path)
        new_size: int = len(data)

        async with DataCenter._lock():
            old: tuple[int, float] | None = DataCenter._cache.pop(key, None)

            if old is not None:
                DataCenter._cache_size -= old[0]

            DataCenter._cache[key] = (new_size, monotonic())
            DataCenter._cache_size += new_size
            await DataCenter._evict()

        return path

    @staticmethod
    async def get_cached_part(fid: str, part: int) -> bytes | None:
        """Read a cached part and refresh its recency in the LRU index."""

        path: Path = DataCenter._part_path(fid, part)

        if not path.is_file() or path.stat().st_size <= 0:
            await DataCenter.touch_cache(str(path))
            return None

        try:
            data: bytes = await to_thread(path.read_bytes)

        except FileNotFoundError:
            await DataCenter.touch_cache(str(path))
            return None

        key: str = str(path)
        size: int = len(data)

        async with DataCenter._lock():
            old: tuple[int, float] | None = DataCenter._cache.pop(key, None)

            if old is not None:
                DataCenter._cache_size -= old[0]

            DataCenter._cache[key] = (size, monotonic())
            DataCenter._cache_size += size
            await DataCenter._evict()

        return data if path.is_file() else None

    @staticmethod
    async def has_cached_part(fid: str, part: int) -> bool:
        """Return whether a non-empty cached part exists and refresh its recency."""

        path: Path = DataCenter._part_path(fid, part)

        if not path.is_file() or path.stat().st_size <= 0:
            await DataCenter.touch_cache(str(path))
            return False

        return await DataCenter.touch_cache(str(path))

    @staticmethod
    async def touch_cache(path: str) -> bool:
        """Refresh or remove one cache-index entry and enforce the configured size limit."""

        cache_path: Path = Path(path)

        if not cache_path.is_file():
            async with DataCenter._lock():
                old: tuple[int, float] | None = DataCenter._cache.pop(path, None)

                if old is not None:
                    DataCenter._cache_size -= old[0]

            return False

        size: int = cache_path.stat().st_size

        async with DataCenter._lock():
            old: tuple[int, float] | None = DataCenter._cache.pop(path, None)

            if old is not None:
                DataCenter._cache_size -= old[0]

            DataCenter._cache[path] = (size, monotonic())
            DataCenter._cache_size += size
            await DataCenter._evict()

        return cache_path.is_file()

    @staticmethod
    async def _evict() -> None:
        """Remove least-recently-used cached parts until the cache is within its limit."""

        while DataCenter._cache_size > DataCenter.CACHE_LIMIT and DataCenter._cache:
            key: str
            size: int
            key, (size, _) = DataCenter._cache.popitem(last=False)
            path: Path = Path(key)

            try:
                path.unlink(missing_ok=True)

                try:
                    path.parent.rmdir()

                except OSError:
                    pass

            finally:
                DataCenter._cache_size -= size

    @staticmethod
    async def initialize_cache() -> None:
        """Recreate the disposable chunk cache and reset its in-memory accounting."""

        async with DataCenter._lock():
            if DataCenter.CACHE_DIR.exists():
                await to_thread(rmtree, DataCenter.CACHE_DIR)

            DataCenter.CACHE_DIR.mkdir(parents=True, exist_ok=True)
            DataCenter._cache.clear()
            DataCenter._cache_size = 0

    @staticmethod
    async def upload(chunk: bytes, filename: str, progress: Progress) -> str:
        """Upload one chunk; concrete storage providers must implement this operation."""

        raise NotImplementedError("DataCenter subclasses must implement upload().")

    @staticmethod
    async def download(flink: str) -> bytes:
        """Download one chunk; concrete storage providers must implement this operation."""

        raise NotImplementedError("DataCenter subclasses must implement download().")


class ConfigMeta(type):
    """Display provider classes by their configured names in logs and diagnostics."""

    def __str__(cls) -> str:
        """Return the class name as its display value."""

        return cls.__name__

    def __repr__(cls) -> str:
        """Return the class name as its representation."""

        return cls.__name__


class Database(DataCenter, metaclass=ConfigMeta):
    """Marker provider representing database-backed storage operations."""

    NAME: str = "Database"


class BackEnd(Database, metaclass=ConfigMeta):
    """Marker provider used for backend-owned files and operations."""

    NAME: str = "BackEnd"


class Binaries(Database, metaclass=ConfigMeta):
    """Log source for dependency installers and system binary management."""

    NAME: str = "Binaries"
