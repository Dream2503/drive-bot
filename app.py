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

from settings import app, UPLOAD_PATH, FILE_DUMP_ID


@app.event
async def on_ready():
    """
    Discord bot event handler triggered once when the bot successfully connects and is ready.

    Responsibilities:
        - Ensures the `upload/` directory exists to hold temporary upload files.
        - Fetches and caches the `FILE_DUMP` Discord channel object by ID for later file storage and retrieval.
        - Logs important startup information and error messages to the console for diagnostics.

    Usage:
        Automatically called by the Discord.py event loop upon bot startup.
        Sets up necessary directories and validates critical channel references before bot becomes operational.

    Flow:
        1. Create the `UPLOAD_PATH` directory if it does not exist.
        2. Retrieve the Discord channel object corresponding to `FILE_DUMP_ID` and store it in `settings.FILE_DUMP`.
        3. If the channel is not found, output error messages suggesting permission or configuration issues.
        4. Otherwise, output the channel name and id to confirm proper setup.
        5. Print the bot's login username and ID to confirm successful startup.

    Notes:
        - Requires `UPLOAD_PATH` and `FILE_DUMP_ID` to be properly defined in `settings.py`.
        - The cached `FILE_DUMP` channel is used for uploading and fetching file chunks uploaded as Discord messages.
        - Proper permissions to read messages and send/delete in `FILE_DUMP` channel are essential.
    """
    UPLOAD_PATH.mkdir(exist_ok=True)  # Make sure the upload/ directory exists for incoming files
    settings.FILE_DUMP = app.get_channel(FILE_DUMP_ID)  # Cache the file dump channel by ID, needed for file operations

    if settings.FILE_DUMP is None:
        print("❌ Failed to fetch FILE_DUMP channel.")
        print(f"   → Check FILE_DUMP_ID ({FILE_DUMP_ID}) and bot permissions.")

    else:
        print(f"📤 FILE_DUMP channel set: {settings.FILE_DUMP.name} (id={settings.FILE_DUMP.id})")

    print(f"✅ Bot is online. Logged in as {app.user} (id={app.user.id})")


if __name__ == "__main__":
    try:
        # Loads and cleans your bot token from a secure file
        with open("database/bot_creds.txt") as f:
            token = f.read().strip()

            if not token:
                raise ValueError("Empty token in 'bot_creds.txt'.")

        print("⏳ Starting Drive Bot...")
        app.run(token)

    except FileNotFoundError:
        print("❌ Missing 'database/bot_creds.txt'. Please place your bot token in this file.")

    except Exception as e:
        print(f"❌ Critical error during bot startup: {e}")
