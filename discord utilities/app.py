import commands
import transfer

from settings import *
from utils import write_log


@app.event
async def init():
    UPLOAD_PATH.mkdir(exist_ok=True)
    DOWNLOAD_PATH.mkdir(exist_ok=True)
    TEMP_SPLIT_PATH.mkdir(exist_ok=True)
    open(LOGS_PATH, "a").close()
    write_log("INFO", "INIT", "Initiated required directories.")
    FILE_DUMP = app.get_channel(FILE_DUMP_ID)

    if FILE_DUMP:
        write_log("INFO", "INIT", f"FILE_DUMP channel set: {FILE_DUMP.name} (id={FILE_DUMP.id})")

    else:
        write_log("ERROR", "INIT", f"Failed to fetch FILE_DUMP channel with ID {FILE_DUMP_ID}. Check permissions.")

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
