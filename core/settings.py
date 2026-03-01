from pathlib import Path
from typing import TextIO

LOG_PATH: Path = Path(".") / "logs.txt"
TRANSFER_PATH: Path = Path('.') / "transfer"
LOG_HANDLER: TextIO = open(LOG_PATH, 'a')
