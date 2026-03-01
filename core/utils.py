from datetime import datetime

from core.settings import LOG_HANDLER


def write_log(level: str, func: str, user: str, message: str) -> None:
    LOG_HANDLER.write(f"[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] [{level}] [{func}] [{user}] {message}\n")
    LOG_HANDLER.flush()
