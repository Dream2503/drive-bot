from datetime import datetime
from settings import LOGS_PATH


def write_log(level: str, func: str, message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with LOGS_PATH.open("a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] [{func}] [{level}] {message}\n")
