from discord import Embed
from discord.ext import commands
from settings import app, DRIVE, COMMANDS, BOT_ADMINS, MAX_DELETE_LIMIT
from utils import load_json, write_log


@app.command()
async def ls(ctx: commands.Context) -> None:
    username = ctx.author.name.upper()

    try:
        drive = load_json(DRIVE)
        user_files = drive.get(username.lower(), {})

        if not user_files:
            embed = Embed(
                    title="📂 No files uploaded yet!",
                    description="Use `!upload <google_drive_link>` or `!upload <filename>` to add files to your drive.",
                    color=0x3498db,
            )
            await ctx.send(embed=embed)
            write_log("INFO", "LS", f"[{username}] checked drive: no files found.")
            return

        embed = Embed(
                title="🗂️ Your Drive Contents",
                description="Below are your uploaded files:",
                color=0x2ecc71,
        )

        for filename, chunks in user_files.items():
            embed.add_field(
                    name=f"📄 `{filename}`",
                    value=f"📦 {len(chunks)} part{'s' if len(chunks) != 1 else ''}",
                    inline=False,
            )

        embed.set_footer(text="To download: !download <filename>")
        await ctx.send(embed=embed)
        write_log("INFO", "LS", f"[{username}] listed {len(user_files)} files in their drive.")

    except Exception as e:
        await ctx.send(f"❌ Failed to load your drive: `{e}`")
        write_log("ERROR", "LS", f"Failed to list files for [{username}]: {e}")


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


@app.command(name="help")
async def help_command(ctx: commands.Context) -> None:
    username = ctx.author.name.upper()

    try:
        cmd_dict = load_json(COMMANDS)

        if not isinstance(cmd_dict, dict):
            raise ValueError("Help file not loaded or corrupt.")

        embed = Embed(
                title="📜 Drive Bot Help",
                description="Here are all the available commands. Use them in any channel or DM!",
                color=0x2ecc71,
        )

        for command, desc in cmd_dict.items():
            embed.add_field(name=f"`{command}`", value=desc, inline=False)

        embed.set_footer(text="For file upload/download/removal, filenames/links are case-sensitive.")
        await ctx.send(embed=embed)
        write_log("INFO", "HELP", f"[{username}] requested help command.")

    except Exception as e:
        await ctx.send(f"⚠️ Help file missing or broken: `{e}`")
        write_log("ERROR", "HELP", f"Failed to load help for [{username}]: {e}")


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