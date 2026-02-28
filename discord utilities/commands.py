from discord.ext import commands
from settings import app, BOT_ADMINS, MAX_DELETE_LIMIT
from utils import write_log


@app.command()
async def clear(ctx: commands.Context, limit: int = 100) -> None:
    username = ctx.author.name.upper()

    try:
        limit = max(1, min(int(limit), MAX_DELETE_LIMIT))

    except ValueError:
        await ctx.send("❗ Limit must be an integer.")
        write_log("ERROR", "CLEAR", f"Invalid limit input by [{username}]: '{limit}' is not an integer.")
        return

    deleted = 0

    try:
        async for msg in ctx.channel.history(limit=limit):
            if msg.author in {ctx.author, app.user}:
                try:
                    await msg.delete()
                    deleted += 1

                except Exception:
                    continue

        await ctx.send(f"🧹 Cleared {deleted} messages.", delete_after=3)
        write_log("INFO", "CLEAR", f"[{username}] cleared {deleted} message(s).")

    except Exception as e:
        await ctx.send(f"❌ Failed to clear messages: {e}")
        write_log("ERROR", "CLEAR", f"Failed to clear messages for [{username}]: {e}")


@app.command()
async def ping(ctx: commands.Context) -> None:
    latency_ms = round(app.latency * 1000)
    await ctx.send(f"🏓 Pong! Latency: {latency_ms} ms")
    write_log("INFO", "PING", f"[{ctx.author.name.upper()}] pinged the bot: {latency_ms} ms")


@app.command()
async def shell(ctx: commands.Context, command: str) -> None:
    username = ctx.author.name.upper()

    if ctx.author.id not in BOT_ADMINS:
        await ctx.send("⛔ You don't have permission to use this command.")
        write_log("ERROR", "SHELL", f"Unauthorized shell access attempt by [{username} ({ctx.author.id})")
        return

    try:
        exec(command)
        await ctx.send(f"🖥️ Executed: `{command}`")
        write_log("INFO", "SHELL", f"Shell command executed by {username}: {command}")

    except Exception as e:
        await ctx.send(f"❌ Error: `{e}`")
        write_log("ERROR", "SHELL", f"Shell command error by {username}: {command} -> {e}")