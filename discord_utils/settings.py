from backend.database.init_db import init_db
from discord import Intents
from discord.ext.commands import Bot

from pathlib import Path

intents: Intents = Intents.default()
intents.messages = True
intents.dm_messages = True
intents.message_content = True

BASE_PATH: Path = Path(".")
LOGS_PATH: Path = BASE_PATH / "logs.txt"
BOT_CREDS = BASE_PATH / "bot_creds.txt"
TRANSFER_PATH: Path = BASE_PATH / ".." / "transfer"

MAX_PART_SIZE = 10_000_000  # 10 * (2 << 20)  # 10 MB
FILE_DUMP_ID: int = 1399311590616203284
MAX_DELETE_LIMIT: int = 100

BOT_ADMINS: tuple[int] = (848383053184237609,)
FILE_DUMP = None
DATABASE, CURSOR = init_db()

COMMAND_PREFIX: str = "!"
app: Bot = Bot(command_prefix=COMMAND_PREFIX, intents=intents, help_command=None)
