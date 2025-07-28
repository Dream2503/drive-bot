import logging
from pathlib import Path

import discord
from discord.ext import commands

# ─── Logging ─────────────────────────────────────────────────────────────
logging.getLogger("discord.http").setLevel(logging.ERROR)

# ─── Intents ─────────────────────────────────────────────────────────────
intents = discord.Intents.default()
intents.messages = True
intents.dm_messages = True
intents.guilds = True
intents.message_content = True

# ─── Constants ───────────────────────────────────────────────────────────
COMMAND_PREFIX = "!"
DRIVE = Path("database/drive.json")
UPLOAD = Path("upload")
COMMANDS = Path("database/commands.json")
MAX_PART_SIZE = 10_000_000  # < 10MB for safety

FILE_DUMP: discord.TextChannel | None = None

# ─── Bot Setup ───────────────────────────────────────────────────────────
app = commands.Bot(command_prefix=COMMAND_PREFIX, intents=intents, help_command=None)


# ─── Events ──────────────────────────────────────────────────────────────
@app.event
async def on_ready():
    global FILE_DUMP

    UPLOAD.mkdir(exist_ok=True)  # Ensure upload directory exists

    FILE_DUMP = app.get_channel(1399311590616203284)
    if FILE_DUMP is None:
        print("❌ Failed to fetch FILE_DUMP channel. Check the ID or permissions.")
    else:
        print(f"📤 FILE_DUMP channel set to: {FILE_DUMP.name}")

    print(f"✅ Logged in as {app.user}")


# Optional if you're only using commands
@app.event
async def on_message(message):
    if message.author.bot or not message.content.strip():
        return
    await app.process_commands(message)


# ─── Import Command Modules ──────────────────────────────────────────────
import commands
import upload

# ─── Entry Point ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        with open("database/bot_creds.txt") as f:
            token = f.read().strip()
            app.run(token)
    except FileNotFoundError:
        print("❌ Missing 'bot_creds.txt'. Please add your bot token in 'database/bot_creds.txt'.")
