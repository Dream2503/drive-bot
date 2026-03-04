from os import getenv
from pathlib import Path
from typing import TextIO

from dotenv import load_dotenv

LOG_PATH: Path = Path("..") / "logs.txt"
TRANSFER_PATH: Path = Path('..') / "transfer"
LOG_HANDLER: TextIO = open(LOG_PATH, 'a')

load_dotenv()

DISCORD_TOKEN: str | None = getenv("DISCORD_TOKEN")
TELEGRAM_TOKEN: str | None = getenv("TELEGRAM_TOKEN")

if not DISCORD_TOKEN or not TELEGRAM_TOKEN:
    raise RuntimeError("Missing TOKEN")
