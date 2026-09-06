from datetime import datetime
from logging import basicConfig, getLogger, INFO, WARNING
from pathlib import Path

from filelock import FileLock

from core.config import LOG_HANDLER, LOG_PATH, TRANSFER_PATH
from core.data_center import DataCenter

LOCK: FileLock = FileLock("logs.txt.lock")
basicConfig(level=INFO, filename=LOG_PATH, filemode="a", format="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s")
getLogger("httpx").setLevel(WARNING)


def write_log(level: str, data_center: type[DataCenter] | DataCenter, func: str, user: str, message: str) -> None:
    with LOCK:
        LOG_HANDLER.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{data_center.NAME}] [{level}] [{func}] [{user}] {message}\n")
        LOG_HANDLER.flush()


def get_transfer_path(username: str, directory: str, filename: str) -> Path:
    path: Path = TRANSFER_PATH / username

    if directory:
        path = path / directory

    return path / filename
