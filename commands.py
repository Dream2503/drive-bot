import discord
from app import app, COMMANDS, DRIVE
from utils import load_json, format_drive_structure


# ─── List Files ──────────────────────────────────────────────────────
@app.command()
async def ls(ctx):
    user_id = str(ctx.author.id)  # JSON keys must be strings

    try:
        drive = load_json(DRIVE)

        if user_id not in drive or not drive[user_id]:
            await ctx.send(
                "📂 No files uploaded yet.\n"
                "Use `!upload <google_drive_link>` to upload your first file.")
            return

        structure = format_drive_structure(drive[user_id])
        await ctx.send(f"🗂️ Your Drive Contents:\n```\n{structure}\n```")

    except Exception as e:
        await ctx.send(f"❌ Failed to load drive structure: `{e}`")


# ─── Clear Bot Messages ──────────────────────────────────────────────
@app.command()
async def clear(ctx):
    deleted = 0

    async for msg in ctx.channel.history(limit=100):
        if isinstance(ctx.channel, discord.DMChannel):
            if msg.author == app.user:
                try:
                    await msg.delete()
                    deleted += 1
                except:
                    pass
        else:
            if msg.author == app.user or msg.author == ctx.author:
                try:
                    await msg.delete()
                    deleted += 1
                except:
                    pass

    try:
        await ctx.send(f"🧹 Cleared {deleted} messages.", delete_after=3)
    except:
        pass


# ─── Help Command ────────────────────────────────────────────────────
@app.command(name="help")
async def help_command(ctx):
    try:
        cmd = load_json(COMMANDS)
        help_lines = ["**📜 Drive Bot Commands**", "```"]

        for command, desc in cmd.items():
            help_lines.append(f"{command.ljust(27)} → {desc}")

        help_lines.append("```")
        await ctx.send("\n".join(help_lines))

    except Exception as e:
        await ctx.send(f"⚠️ Unexpected error: `{e}`")


# ─── Ping Command ────────────────────────────────────────────────────
@app.command()
async def ping(ctx):
    await ctx.send("🏓 Pong!")


# ─── Shell Debug (Use With Caution) ──────────────────────────────────
@app.command()
async def shell(ctx, command: str):
    try:
        exec(command)
        await ctx.send(f"🖥️ Executed: `{command}`")
    except Exception as e:
        await ctx.send(f"❌ Error: `{e}`")
