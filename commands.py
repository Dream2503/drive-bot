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

from discord import Embed
from discord.ext import commands
from settings import app, DRIVE, COMMANDS, BOT_ADMINS, MAX_DELETE_LIMIT
from utils import load_json, write_log


@app.command()
async def ls(ctx: commands.Context) -> None:
    """
    Discord bot command to list all uploaded files for the invoking user (by username) in a visually formatted embed.

    Responsibilities:
    - Extract the user's Discord username and load their file metadata.
    - Check if the user has any uploaded files.
    - Display a helpful embed message if no files exist.
    - If files are found, format each with part count in a rich embed.
    - Handle and report any exceptions during drive access or embed sending.

    Args:
        ctx (commands.Context): The Discord command invocation context.

    Outputs:
        - Sends a Discord embed listing the user's files and part counts (if any).
        - Otherwise, sends an embed prompting the user to upload files.

    Usage:
        Users invoke this command by typing `!ls` in any channel or DM to view their uploaded files.

    Flow:
        1. Extract the username from the invoking Discord context.
        2. Load the drive metadata JSON to retrieve all users' uploaded files.
        3. Fetch the dictionary of this user's files using their username; if empty, prompt them to upload.
        4. If files exist, iterate through them and add an embed field for each filename with its part count.
        5. Send the formatted embed back to the user for clear and readable drive contents.
        6. Catch and report any exceptions that occur during drive access or message sending.

    Notes:
        - Assumes drive metadata is keyed by username, not Discord user ID.
        - Use `!upload` to populate the drive before using this command.
    """
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
    """
    Discord bot command to delete recent messages sent by the invoking user or the bot.

    Responsibilities:
    - Deletes up to a specified number of recent messages authored by the user or the bot.
    - Applies the same logic across all channel types using message history and deletion.
    - Provides feedback on how many messages were deleted.

    Args:
        ctx (commands.Context): The Discord command invocation context.
        limit (int): Maximum number of recent messages to check and delete (default: 100).

    Usage:
        Users can type `!clear` or `!clear 50` to remove up to 50 of their and the bot's recent messages.

    Flow:
        1. Sanitize the `limit` input to ensure it's a valid integer between 1 and MAX_DELETE_LIMIT.
        2. Traverse recent message history from the current channel.
        3. Delete messages authored by either the user or the bot.
        4. Report the number of deleted messages.
        5. Silently ignore exceptions during deletion to ensure resilience.

    Notes:
        - Deletes are attempted individually for consistent behavior across all channel types.
        - The confirmation message auto-deletes after 3 seconds.
        - Requires the bot to have permission to manage messages in the current channel.
    """
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
    write_log("INFO", "PING", f"[{ctx.author.name.upper()}] pinged the bot: {latency_ms} ms")


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
