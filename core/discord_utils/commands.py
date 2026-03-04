from traceback import format_exc

import backend.database as database
import settings
from core.settings import TRANSFER_PATH
from core.utils import write_log
from discord.ext.commands import Context
from settings import app, BOT_ADMINS, FILE_DUMP_ID, MAX_DELETE_LIMIT


@app.event
async def on_ready():
    try:
        TRANSFER_PATH.mkdir(exist_ok=True)
        write_log("INFO", "INIT", "", f"Transfer directory ready: {TRANSFER_PATH}.")

        settings.FILE_DUMP = app.get_channel(FILE_DUMP_ID)

        if settings.FILE_DUMP:
            write_log("INFO", "INIT", "", f"FILE_DUMP channel initialized: {settings.FILE_DUMP.name} (id={settings.FILE_DUMP.id}).")

        else:
            write_log("ERROR", "INIT", "", f"Failed to fetch FILE_DUMP channel with ID {FILE_DUMP_ID}. Check bot permissions.")

        write_log("INFO", "INIT", str(app.user), f"Bot online and ready (id={app.user.id}).")

    except Exception as e:
        write_log("ERROR", "INIT", "", f"Initialization failure: {e}\n{format_exc()}")


@app.command()
async def clear(ctx: Context, limit: int = MAX_DELETE_LIMIT) -> None:
    deleted: int = 0

    try:
        limit = max(1, min(int(limit), MAX_DELETE_LIMIT))

    except ValueError:
        write_log("ERROR", "CLEAR", ctx.author.name, f"Invalid limit provided: '{limit}'.")
        return

    try:
        database.clear_file(write_log)

        async for msg in ctx.channel.history(limit=limit):
            if msg.author in {ctx.author, app.user}:
                try:
                    await msg.delete()
                    deleted += 1

                except Exception:
                    continue

        write_log("INFO", "CLEAR", ctx.author.name, f"Cleared {deleted} message(s) from channel `{ctx.channel.name}`.")

    except Exception as e:
        write_log("ERROR", "CLEAR", ctx.author.name, f"Failed during clear operation: {e}\n{format_exc()}")


@app.command()
async def ping(ctx: Context) -> None:
    latency: float = round(app.latency * 1000)

    try:
        await ctx.send(f"🏓 Pong! Latency: {latency} ms")
        write_log("INFO", "PING", ctx.author.name, f"Latency check successful: {latency} ms")

    except Exception as e:
        write_log("ERROR", "PING", ctx.author.name, f"Failed to respond to ping: {e}\n{format_exc()}")


@app.command()
async def shell(ctx: Context, command: str) -> None:
    if ctx.author.id not in BOT_ADMINS:
        write_log("ERROR", "SHELL", ctx.author.name, f"Unauthorized shell access attempt by user ({ctx.author.id}).")
        return

    write_log("INFO", "SHELL", ctx.author.name, f"Executing shell command: {command}")

    try:
        exec(command)
        write_log("INFO", "SHELL", ctx.author.name, "Shell command executed successfully.")

    except Exception as e:
        write_log("ERROR", "SHELL", ctx.author.name, f"Shell execution failed: {e}\n{format_exc()}")
