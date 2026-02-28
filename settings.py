import logging
import discord
from pathlib import Path
from discord.ext import commands

logging.getLogger("discord.http").setLevel(logging.ERROR)

intents = discord.Intents.default()
intents.messages = True
intents.dm_messages = True
intents.message_content = True

BASE_PATH = Path(".")
DATABASE_PATH = BASE_PATH / "database"
UPLOAD_PATH = BASE_PATH / "upload"
DOWNLOAD_PATH = BASE_PATH / "download"
TEMP_SPLIT_PATH = BASE_PATH / "temp"
LOGS_PATH = BASE_PATH / "logs.txt"

DRIVE = DATABASE_PATH / "drive.json"
COMMANDS = DATABASE_PATH / "commands.json"

MAX_PART_SIZE = 10_000_000
FILE_DUMP_ID = 1399311590616203284
MAX_DELETE_LIMIT = 100

BOT_ADMINS = (848383053184237609,)

FILE_DUMP: discord.TextChannel | None = None

COMMAND_PREFIX = "!"
app = commands.Bot(command_prefix=COMMAND_PREFIX, intents=intents, help_command=None)