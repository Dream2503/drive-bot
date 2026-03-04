from discord import Intents, TextChannel
from discord.ext.commands import Bot

intents: Intents = Intents.default()
intents.messages = True
intents.dm_messages = True
intents.message_content = True

BOT_ADMINS: tuple[int, int] = (848383053184237609, 1425774970533056522)
FILE_DUMP_ID: int = 1399311590616203284
MAX_PART_SIZE = 10_000_000  # 10MB
MAX_DELETE_LIMIT: int = 100
FILE_DUMP: TextChannel | None = None

app: Bot = Bot(command_prefix='!', intents=intents, help_command=None)
