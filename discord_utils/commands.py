from discord.ext.commands import Context
from settings import app, BOT_ADMINS, CURSOR, MAX_DELETE_LIMIT
from utils import write_log


@app.command()
async def clear(ctx: Context, limit: int = MAX_DELETE_LIMIT) -> None:
    username: str = ctx.author.name
    deleted: int = 0
    CURSOR.execute("TRUNCATE TABLE owns, files RESTART IDENTITY;")
    CURSOR.connection.commit()
    write_log("INFO", "CLEAR", username, f"Truncated the files table")

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
