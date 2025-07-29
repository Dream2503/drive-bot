"""
commands.py

Main user command definitions for the Discord Drive Bot.

Responsibilities:
- Registers all user-facing commands for the Drive Bot via the Discord.py commands extension.
- Enables file listing, file downloading, message cleanup, latency checks, and user diagnostics.
- Loads bot command help/usage from database/commands.json.
- Restricts the dangerous shell command to BOT_ADMINS only.

Requirements:
- settings.py, utils.py, and Discord.py (2.0+ recommended).
- Requires settings.BOT_ADMINS for admin-only shell access.
- File metadata from database/drive.json and help text from database/commands.json.

Usage:
    Import and load as part of the Drive Bot main entry-point (see app.py).

Notes:
    - Exception handling in all commands, with user-friendly Discord messaging.
    - For further modularity, convert to Discord.py Cogs if scaling up.

Author: Dream2503
"""

import discord
from discord import Embed
from discord.ext import commands
from settings import app, DRIVE, COMMANDS, BOT_ADMINS, MAX_DELETE_LIMIT
from utils import load_json


@app.command()
async def ls(ctx: commands.Context) -> None:
    """
    Discord bot command to list all uploaded files for the invoking user in a visually formatted embed (tree-view style).

    Responsibilities:
    - Extract the user's Discord ID from context and load their file metadata.
    - Check if the user has any uploaded files.
    - If no files are found, prompt the user to upload files in a friendly embed.
    - If files exist, format and display each file with its part count as fields within a rich Discord embed.
    - Catch and report any exceptions during file retrieval or messaging.

    Args:
        ctx (commands.Context): The Discord command invocation context.

    Outputs:
        - Sends a Discord embed listing the user's files and part counts (if any).
        - Otherwise, sends an embed prompting the user to upload files.

    Usage:
        Users invoke this command by typing `!ls` in any channel or DM to view their uploaded files.

    Flow:
        1. Extract the string user ID from the invoking Discord context.
        2. Load the drive metadata JSON to get all users' files.
        3. Fetch this user's files dictionary; if empty, prompt them to upload.
        4. If files exist, for each file, add an embed field with filename and part count.
        5. Send the formatted embed back to the user for visual clarity.
        6. Catch and report any exceptions during file fetching or messaging.

    Notes:
        - Uses `load_json` to fetch file data.
        - Presents file information using a rich embed for clarity and readability.
        - For empty drives, the embed includes upload instructions.
        - Asynchronous and suitable for Discord.py 2.x command extension.
    """
    user_id = str(ctx.author.id)

    try:
        drive = load_json(DRIVE)
        user_files = drive.get(user_id, {})

        if not user_files:
            embed = Embed(
                title="📂 No files uploaded yet!",
                description="Use `!upload <google_drive_link>` or `!upload <filename>` to add files to your drive.",
                color=0x3498db,  # A soft blue
            )
            await ctx.send(embed=embed)
            return

        # Prepare a nicely formatted embed with file details
        embed = Embed(title="🗂️ Your Drive Contents", description="Below are your uploaded files:", color=0x2ecc71)

        for filename, chunks in user_files.items():
            embed.add_field(
                name=f"📄 `{filename}`",
                value=f"📦 {len(chunks)} part{'s' if len(chunks) != 1 else ''}",
                inline=False,
            )

        embed.set_footer(text="To download: !download <filename>")
        await ctx.send(embed=embed)

    except Exception as e:
        await ctx.send(f"❌ Failed to load your drive: `{e}`")


@app.command()
async def clear(ctx: commands.Context, limit: int = 100) -> None:
    """
    Discord bot command to delete recent messages sent by the invoking user or the bot in the current channel or DM.

    Responsibilities:
    - Deletes up to a specified number of recent messages from both the user and bot for chat cleanliness.
    - Uses bulk deletion via `purge` in guild text channels for efficiency.
    - Falls back to manual message-by-message deletion in DM channels or other unsupported channel types.
    - Checks for appropriate bot permissions before attempting deletions in guild channels.

    Args:
        ctx (commands.Context): The Discord command invocation context.
        limit (int): Maximum number of recent messages to check and delete. Capped to avoid abuse.

    Usage:
        Invoked by users in any channel or DM by typing `!clear` (optionally with a limit number).
        Example: `!clear` or `!clear 50` to clear up to 50 recent messages.

    Flow:
        1. Validate and sanitize the limit argument.
        2. In guild text channels:
           - Verify the bot has Manage Messages permission.
           - Use bulk deletion (`purge`) filtering messages from the user and bot.
        3. In DM channels or unsupported types:
           - Iterate over recent messages and delete individually if authored by user or bot.
        4. Send a confirmation message stating how many messages were deleted.
        5. Handle and silently ignore exceptions during deletion to avoid command failure.

    Notes:
        - Bulk deletion via `purge` respects Discord's rate limits and is more efficient.
        - Manual deletion fallback is slower but necessary in DMs.
        - The confirmation message auto-deletes after 3 seconds to reduce clutter.
    """
    try:
        limit = max(1, min(int(limit), MAX_DELETE_LIMIT))  # Enforce sane limits

    except ValueError:
        await ctx.send("❗ Limit must be an integer.")
        return

    # For guild text channels, check permissions and bulk delete
    if isinstance(ctx.channel, discord.TextChannel):
        if not ctx.channel.permissions_for(ctx.guild.me).manage_messages:
            await ctx.send("🚫 I need the 'Manage Messages' permission to delete messages here.")
            return

        deleted_messages = await ctx.channel.purge(limit=limit, check=lambda m: m.author in {app.user, ctx.author})
        await ctx.send(f"🧹 Cleared {len(deleted_messages)} messages.", delete_after=3)
        return

    # For DMs and other channel types, fallback to manual deletion
    deleted = 0

    try:
        async for msg in ctx.channel.history(limit=limit):
            if msg.author in {app.user, ctx.author}:
                try:
                    await msg.delete()
                    deleted += 1

                except Exception:
                    pass

        await ctx.send(f"🧹 Cleared {deleted} messages.", delete_after=3)

    except Exception:
        pass


@app.command(name="help")
async def help_command(ctx: commands.Context) -> None:
    """
    Discord bot command to send a beautiful, embedded help message listing all available commands with their descriptions.

    Responsibilities:
    - Loads command/description pairs from the JSON help file (commands.json).
    - Formats and sends a visually appealing help message using a Discord embed, with each command on its own line and emoji.
    - Gracefully handles missing or corrupted help files by sending an error message instead.

    Args:
        ctx (commands.Context): The Discord command invocation context.

    Usage:
        Invoked by users typing `!help` in any Discord channel or DM to view all available bot commands and their usage.

    Flow:
        1. Load the commands and descriptions dictionary from the commands.json file.
        2. Validate that the data is a proper dictionary.
        3. Create a rich Discord embed, adding each command and its description as a separate field.
        4. Send the embed as a message to the invoking context.
        5. If an error occurs (e.g., file missing or JSON corrupted), send user-friendly error feedback.

    Notes:
    - Uses an embed for a modern, user-friendly help display (with colors and emoji).
    - Relies on the commands.json file being present and valid.
    - Assumes the `load_json` utility returns parsed content or raises appropriate exceptions.
    - The embed improves readability, especially for mobile and first-time users.
    """
    try:
        cmd_dict = load_json(COMMANDS)

        if not isinstance(cmd_dict, dict):
            raise ValueError("Help file not loaded or corrupt.")

        embed = Embed(
            title="📜 Drive Bot Help",
            description="Here are all the available commands. Use them in any channel or DM!",
            color=0x2ecc71,  # green
        )

        for command, desc in cmd_dict.items():
            embed.add_field(name=f"`{command}`", value=desc, inline=False)

        embed.set_footer(text="For file upload/download/removal, filenames/links are case-sensitive.")
        await ctx.send(embed=embed)

    except Exception as e:
        await ctx.send(f"⚠️ Help file missing or broken: `{e}`")


@app.command()
async def ping(ctx: commands.Context) -> None:
    """
    Discord bot command that responds with 'Pong!' and reports the current bot latency.

    Responsibilities:
    - Provide a quick, user-friendly check to confirm the bot is online.
    - Measure and display the latency between the bot and the Discord gateway in milliseconds.

    Args:
        ctx (commands.Context): The Discord command invocation context.

    Usage:
        Users invoke this command by typing `!ping` in any Discord channel or DM where the bot is present.
        The bot replies with "Pong!" followed by the latency in ms.

    Flow:
        1. Retrieve the bot's current websocket latency (`app.latency`), which is in seconds.
        2. Convert latency to milliseconds and round to a whole number.
        3. Send a message to the invoking context including the latency.

    Notes:
    - The latency reported is an approximation of the websocket heartbeat interval to Discord and may fluctuate.
    - This command is typically used for diagnostic or uptime checking purposes.
    """

    latency_ms = round(app.latency * 1000)
    await ctx.send(f"🏓 Pong! Latency: {latency_ms} ms")


@app.command()
async def shell(ctx: commands.Context, command: str) -> None:
    """
    Discord bot command that allows authorized admins to execute raw Python code in the bot's runtime environment.

    Responsibilities:
    - Execute arbitrary Python code received via Discord command for debugging or administration.
    - Restrict access to only Discord users whose IDs are listed in settings.BOT_ADMINS.
    - Safely report execution results or errors back to the invoking user.

    Args:
        ctx (commands.Context): The Discord command context.
        command (str): The Python code string to execute.

    Usage:
        Used by authorized admins typing `!shell <code>` where `<code>` is any valid Python code.
        Useful for debugging or runtime introspection of the bot.

    Flow:
        1. Verify if the invoking user's Discord ID is present in the BOT_ADMINS list.
        2. If not authorized, send a permission-denied message and exit.
        3. If authorized, execute the given Python code string using Python's exec().
        4. If execution succeeds, confirm execution with the original code snippet.
        5. If execution raises an exception, catch it and send back an error message with details.

    Notes:
    - This command is highly dangerous and should never be exposed to untrusted users.
    - Execution context is the global namespace of the running bot; code can modify bot state.
    - Use with extreme caution; consider logging accesses and restricting to bot owners only.
    """
    if ctx.author.id not in BOT_ADMINS:
        await ctx.send("⛔ You don't have permission to use this command.")
        return

    try:
        exec(command)
        await ctx.send(f"🖥️ Executed: `{command}`")

    except Exception as e:
        await ctx.send(f"❌ Error: `{e}`")
