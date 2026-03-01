import settings
from backend.database.utils import clear_files
from core.settings import LOG_HANDLER, TRANSFER_PATH
from core.utils import write_log
from discord.ext.commands import Context
from settings import app, BOT_ADMINS, FILE_DUMP_ID, MAX_DELETE_LIMIT


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
    LOG_HANDLER.close()
    await app.close()


@app.command()
async def clear(ctx: Context, limit: int = MAX_DELETE_LIMIT) -> None:
    username: str = ctx.author.name
    deleted: int = 0
    clear_files(write_log)

    try:
        limit: int = max(1, min(int(limit), MAX_DELETE_LIMIT))

    except ValueError:
        write_log("ERROR", "CLEAR", username, f"Invalid limit input: '{limit}' is not an integer.")
        return

    try:
        async for msg in ctx.channel.history(limit=limit):
            if msg.author in {ctx.author, app.user}:
                try:
                    await msg.delete()
                    deleted += 1

                except Exception:
                    continue

        write_log("INFO", "CLEAR", username, f"Cleared {deleted} message(s).")

    except Exception as e:
        write_log("ERROR", "CLEAR", username, f"Failed to clear messages: {e}")


@app.command()
async def ping(ctx: Context) -> None:
    latency: float = round(app.latency * 1000)
    await ctx.send(f"🏓 Pong! Latency: {latency} ms")
    write_log("INFO", "PING", ctx.author.name, f"Pinged the bot: {latency} ms")


@app.command()
async def shell(ctx: Context, command: str) -> None:
    username: str = ctx.author.name
    user_id: int = ctx.author.id

    if user_id not in BOT_ADMINS:
        write_log("ERROR", "SHELL", username, f"Unauthorized shell access attempt by ({user_id})")
        return

    try:
        exec(command)
        write_log("INFO", "SHELL", username, f"Shell command executed: {command}")

    except Exception as e:
        write_log("ERROR", "SHELL", username, f"Shell command error: {command} -> {e}")
