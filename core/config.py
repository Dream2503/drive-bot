import os
import platform
import sys
from logging import INFO, WARNING, basicConfig, getLogger
from pathlib import Path
from typing import TextIO

from filelock import FileLock

FROZEN: bool = getattr(sys, "frozen", False)

if FROZEN:
    if platform.system() == "Windows":
        BASE_DIR = Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData/Local")) / "StoreLimitless"

    else:
        BASE_DIR = Path(os.getenv("XDG_DATA_HOME", Path.home() / ".local/share")) / "storeLimitless"

    BASE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_PATH: Path = BASE_DIR / "logs.log"
    LOG_LOCK_PATH: Path = BASE_DIR / "logs.lock"
    TELEGRAM_SESSION: Path = BASE_DIR / "telegram_bot"
    TRANSFER_PATH: Path = BASE_DIR / "transfer"
    TRANSFER_PATH.mkdir(parents=True, exist_ok=True)

else:
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    LOG_PATH: Path = BASE_DIR / "logs.log"
    LOG_LOCK_PATH: Path = BASE_DIR / "logs.lock"
    TELEGRAM_SESSION: Path = BASE_DIR / "telegram_bot"
    TRANSFER_PATH: Path = BASE_DIR / "transfer"

POSSIBLE_DATACENTERS: frozenset[str] = frozenset({
    "Discord",
    "GitHub",
    "Telegram",
})

SUPPORTED_DOMAINS: frozenset[str] = frozenset({
    "drive.google.com",
    "youtube.com",
    "youtu.be",
    "m.youtube.com",
})

TRANSFER_PATH.mkdir(exist_ok=True)
LOG_HANDLER: TextIO = open(LOG_PATH, "a", encoding="utf-8")
LOCK: FileLock = FileLock(LOG_LOCK_PATH)

basicConfig(level=INFO, filename=LOG_PATH, filemode="a", format="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s", )
getLogger("httpx").setLevel(WARNING)
getLogger("telethon").setLevel(WARNING)
