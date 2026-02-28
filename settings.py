import logging
import discord
from pathlib import Path

from discord import Intents
from discord.ext import commands
from discord.ext.commands import Bot

logging.getLogger("discord.http").setLevel(logging.ERROR)

intents: Intents = discord.Intents.default()
intents.messages = True
intents.dm_messages = True
intents.message_content = True

BASE_PATH: Path = Path('.')
DATABASE_PATH: Path = BASE_PATH / "database"
UPLOAD_PATH: Path = BASE_PATH / "upload"
DOWNLOAD_PATH: Path = BASE_PATH / "download"
TEMP_SPLIT_PATH: Path = BASE_PATH / "temp"
LOGS_PATH: Path = BASE_PATH / "logs.txt"

DRIVE: Path = DATABASE_PATH / "drive.json"
COMMANDS: Path = DATABASE_PATH / "commands.json"

MAX_PART_SIZE: int = 10 * (2 << 20)  # 10 MB
FILE_DUMP_ID: int = 1399311590616203284
MAX_DELETE_LIMIT: int = 100

BOT_ADMINS: tuple[int] = (848383053184237609,)

FILE_DUMP: discord.TextChannel | None = None

COMMAND_PREFIX: str = "!"
app: Bot = commands.Bot(command_prefix=COMMAND_PREFIX, intents=intents, help_command=None)
