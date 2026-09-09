from datetime import datetime
from io import BytesIO
from logging import basicConfig, getLogger, INFO, WARNING
from pathlib import Path

from filelock import FileLock

from core.config import LOG_HANDLER, LOG_PATH, TRANSFER_PATH, LOG_LOCK_PATH
from core.data_center import DataCenter

LOCK: FileLock = FileLock(LOG_LOCK_PATH)
basicConfig(level=INFO, filename=LOG_PATH, filemode="a", format="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s")
getLogger("httpx").setLevel(WARNING)
getLogger("telethon").setLevel(WARNING)


def write_log(level: str, data_center: type[DataCenter] | DataCenter, func: str, user: str, message: str) -> None:
    with LOCK:
        LOG_HANDLER.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{data_center.NAME}] [{level}] [{func}] [{user}] {message}\n")
        LOG_HANDLER.flush()


def get_transfer_path(username: str, directory: str, filename: str) -> Path:
    path: Path = TRANSFER_PATH / username

    if directory:
        path = path / directory

    return path / filename


class Progress:
    def __init__(self, message: str, total: int):
        self.message: str = message
        self.transfer: int = 0
        self.total: int = total

    @property
    def value(self) -> tuple[str, int, int]:
        return self.message, self.transfer, self.total


class ProgressStream(BytesIO):
    def __init__(self, data: bytes, progress: Progress):
        super().__init__(data)
        self.progress = progress

    def read(self, size: int | None = -1) -> bytes:
        chunk: bytes = super().read(size)
        self.progress.transfer += len(chunk)
        return chunk
