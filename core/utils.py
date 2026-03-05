from datetime import datetime

from core.module import Module
from core.settings import LOG_HANDLER
from filelock import BaseFileLock, FileLock

LOCK: BaseFileLock = FileLock("logs.txt.lock")


def write_log(level: str, module: type[Module], func: str, user: str, message: str) -> None:
    with LOCK:
        LOG_HANDLER.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{module}] [{level}] [{func}] [{user}] {message}\n")
        LOG_HANDLER.flush()
