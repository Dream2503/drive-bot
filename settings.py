"""
settings.py

Global configuration and setup for the Discord Drive Bot.

Responsibilities:
- Centralizes all global constants, Discord settings, and file path definitions.
- Controls logging granularity for debugging and production.
- Declares Discord bot intents for security and privacy.
- Manages key channel and folder references used by other modules.

Requirements:
- Discord.py (2.0+ recommended).
- All paths must be valid and write-accessible.
- Bot must have required permissions (message read/send, attachment, message management in FILE_DUMP channel).

Customizing:
- Edit the path constants if your directory structure changes.
- Adjust MAX_PART_SIZE if Discord raises/lifts chunk limits.
- Set FILE_DUMP_ID to the correct text channel.
- Populate BOT_ADMINS with Discord user IDs for privileged commands.

Author: Dream2503
"""
import logging
import discord
from pathlib import Path
from discord.ext import commands

# ─── Logging Configuration ────────────────────────────────────────────────
# Reduce log noise from Discord HTTP requests (raise to logging.CRITICAL for production)
logging.getLogger("discord.http").setLevel(logging.ERROR)

# ─── Discord Bot Intents ──────────────────────────────────────────────────
# Required to interact with messages, reads, and content for private/guild chats
intents = discord.Intents.default()
intents.messages = True  # Read all message events
intents.dm_messages = True  # Direct message events
intents.message_content = True  # Access full message content (MUST ENABLE IN DEV PORTAL)

# ─── File Paths and Constants ─────────────────────────────────────────────
BASE_PATH = Path(".")
DATABASE_PATH = BASE_PATH / "database"
UPLOAD_PATH = BASE_PATH / "upload"
DOWNLOAD_PATH = BASE_PATH / "download"
TEMP_SPLIT_PATH = BASE_PATH / "temp"
LOGS_PATH = BASE_PATH / "logs.txt"

# Core data files
DRIVE = DATABASE_PATH / "drive.json"  # Stores uploaded file metadata per user
COMMANDS = DATABASE_PATH / "commands.json"  # Stores command help/descriptions (optional)

# Upload and chunking settings
MAX_PART_SIZE = 10_000_000  # Each file part: 10MiB (Discord's safe limit)
FILE_DUMP_ID = 1399311590616203284  # Channel ID where chunks are stored
MAX_DELETE_LIMIT = 100  # Maximum deletion limit for chats

# ─── Permissions, Admins, Miscellaneous ───────────────────────────────────
# Use for admin-only features like shell/debug commands
BOT_ADMINS = [
    # Add owner/admin Discord user IDs as int
    848383053184237609
]

# These variables are set by the bot at runtime (do NOT edit manually!)
FILE_DUMP: discord.TextChannel | None = None  # Will be injected with the live channel object

# ─── Discord Bot Instance ─────────────────────────────────────────────────
COMMAND_PREFIX = "!"  # Prefix string for all commands (user input)
app = commands.Bot(command_prefix=COMMAND_PREFIX, intents=intents, help_command=None)

# ──────────────── Helper Descriptions ─────────────────────────────────────
#   - To change the uploads/downloads/database location, edit the related constants above.
#   - To move the bot to a different channel, update FILE_DUMP_ID.
#   - Add more configuration (e.g., per-guild) as you scale features.
