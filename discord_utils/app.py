import commands
import transfer
import settings

from discord.ext.commands import Context
from dotenv import load_dotenv
from settings import app, CURSOR, FILE_DUMP_ID, LOG_HANDLER, TRANSFER_PATH
from os import getenv
from utils import write_log


@app.event
async def on_ready():
    TRANSFER_PATH.mkdir(exist_ok=True)
    settings.FILE_DUMP = app.get_channel(FILE_DUMP_ID)
    write_log("INFO", "INIT", "", "Initiated required directories.")

    if settings.FILE_DUMP:
        write_log("INFO", "INIT", "", f"FILE_DUMP channel set: {settings.FILE_DUMP.name} (id={settings.FILE_DUMP.id})")

    else:
        write_log("ERROR", "INIT", "", f"Failed to fetch FILE_DUMP channel with ID {FILE_DUMP_ID}. Check permissions.")

    write_log("INFO", "INIT", str(app.user), f"Bot is online. Logged in (id={app.user.id})")


@app.command()
async def shutdown(ctx: Context):
    await ctx.message.delete()
    write_log("INFO", "SHUTDOWN", ctx.author.name, "Shutting down bot.")
    CURSOR.connection.close()
    LOG_HANDLER.close()
    await app.close()


if __name__ == "__main__":
    load_dotenv()

    try:
        token: str | None = getenv("DISCORD_TOKEN")

        if not token:
            write_log("ERROR", "MAIN", "", "DISCORD_TOKEN not found in environment.")
            exit(0)

        write_log("INFO", "MAIN", "", "Starting Drive Bot...")
        app.run(token)

    except Exception as e:
        write_log("ERROR", "MAIN", "", f"Critical error during bot startup: {e}")
