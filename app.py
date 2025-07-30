"""
app.py

Main entry point for the Discord Drive Bot.

Responsibilities:
- Initializes and configures the Discord bot instance.
- Registers event handlers (such as on_ready).
- Ensures required directories and channels are accessible at startup.
- Loads command and feature modules to provide file upload, download, and management features.
- Handles bot authentication using the secret token file.

Requirements:
- Essential modules: settings, utils, commands, upload, download.
- Environment: 'database/bot_creds.txt' must contain your bot token.
- FILE_DUMP_ID (in settings) must refer to a real (and accessible) Discord text channel in your guild.
- All required permissions must be granted for full functionality.

Usage:
    python app.py

Notes:
    - For scaling or improved maintainability, consider splitting subcommands/features into Cogs.
    - The bot uses synchronous imports and startup logic; this is suitable for single-instance bots.
    - Error messages are output to the terminal for easier diagnosis.

Author: Dream2503
"""
import settings  # Configuration and bot instance
import commands  # Command handlers for bot features
import transfer  # File upload & download logic (including !upload & !download)

from settings import app, UPLOAD_PATH, DOWNLOAD_PATH, TEMP_SPLIT_PATH, LOGS_PATH, FILE_DUMP_ID
from utils import write_log


@app.event
async def on_ready():
    """
    Discord bot event handler triggered once when the bot successfully connects and is ready.

    Responsibilities:
        - Ensures required local directories exist for bot operations:
            - `UPLOAD_PATH` for user-uploaded files.
            - `DOWNLOAD_PATH` for reassembled downloads.
            - `TEMP_SPLIT_PATH` for temporary chunked files.
        - Fetches and caches the `FILE_DUMP` Discord channel object by ID for file chunk storage.
        - Logs startup details and diagnostic messages to both console and file.

    Usage:
        Automatically invoked by the Discord.py event loop upon bot startup.
        Sets up critical paths and validates the upload channel before the bot begins serving commands.

    Flow:
        1. Create the `upload/`, `download/`, and `temp/` directories if they don’t already exist.
        2. Retrieve and cache the `FILE_DUMP` channel object using its ID.
        3. Log error messages if the channel is not accessible, suggesting permission/config issues.
        4. Log success messages if setup completes as expected, including bot and channel identity.

    Notes:
        - Requires `UPLOAD_PATH`, `DOWNLOAD_PATH`, and `TEMP_SPLIT_PATH` to be defined in `settings.py`.
        - Requires `FILE_DUMP_ID` to reference a valid `discord.TextChannel` where the bot has send/delete permissions.
        - These checks ensure all runtime paths are ready and prevent errors during uploads/downloads.
    """
    UPLOAD_PATH.mkdir(exist_ok=True)
    DOWNLOAD_PATH.mkdir(exist_ok=True)
    TEMP_SPLIT_PATH.mkdir(exist_ok=True)
    open(LOGS_PATH, "a").close()
    write_log("INFO", "INIT", "Created required directories.")
    settings.FILE_DUMP = app.get_channel(FILE_DUMP_ID)

    if settings.FILE_DUMP is None:
        write_log("ERROR", "INIT", f"Failed to fetch FILE_DUMP channel with ID {FILE_DUMP_ID}. Check permissions.")

    else:
        write_log("INFO", "INIT", f"FILE_DUMP channel set: {settings.FILE_DUMP.name} (id={settings.FILE_DUMP.id})")

    write_log("INFO", "INIT", f"Bot is online. Logged in as {app.user} (id={app.user.id})")


if __name__ == "__main__":
    try:
        with open("database/bot_creds.txt") as f:
            token = f.read().strip()

            if not token:
                write_log("ERROR", "MAIN", "Empty token in 'bot_creds.txt'.")
                exit(0)

        write_log("INFO", "MAIN", "Starting Drive Bot...")
        app.run(token)

    except FileNotFoundError:
        write_log("ERROR", "MAIN", "Missing 'database/bot_creds.txt'. Please place your bot token in this file.")

    except Exception as e:
        write_log("ERROR", "MAIN", f"Critical error during bot startup: {e}")
