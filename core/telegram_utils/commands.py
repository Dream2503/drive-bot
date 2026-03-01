from time import perf_counter

from core.settings import TRANSFER_PATH
from core.telegram_utils.settings import BOT_ADMINS, FILE_DUMP_ID
from core.utils import write_log
from telegram import Message, Update, User
from telegram.ext import ContextTypes


async def on_startup(app):
    TRANSFER_PATH.mkdir(exist_ok=True)
    write_log("INFO", "INIT", "", "Initiated required directories.")

    try:
        chat = await app.bot.get_chat(FILE_DUMP_ID)

        if chat:
            write_log("INFO", "INIT", "", f"FILE_DUMP chat set: {chat.title} (id={chat.id})")
        else:
            write_log("ERROR", "INIT", "", f"Failed to fetch FILE_DUMP chat with ID {FILE_DUMP_ID}.")

    except Exception as e:
        write_log("ERROR", "INIT", "", f"Error fetching FILE_DUMP chat: {e}")

    me: User = await app.bot.get_me()

    write_log("INFO", "INIT", "", f"Bot is online. Logged in (id={me.id})")


async def shutdown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.type == "private" or update.effective_chat.id != FILE_DUMP_ID or update.effective_user.id not in BOT_ADMINS:
        return

    write_log("INFO", "SHUTDOWN", "", "Shutdown command received.")

    await update.message.reply_text("Shutting down...")

    try:
        pass
    except Exception:
        pass

    await context.application.stop()
    await context.application.shutdown()


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    write_log("ERROR", "BOT", "", f"Exception: {context.error}")


async def clear(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat.type == "private" or update.effective_chat.id != FILE_DUMP_ID:
        return

    if not context.args:
        await update.message.reply_text("Usage: /clear n")
        return

    for i in range(int(context.args[0])):
        try:
            await context.bot.delete_message(update.effective_chat.id, update.message.message_id - i)
        except:
            pass


async def ping(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat.type == "private" or update.effective_chat.id != FILE_DUMP_ID:
        return

    start: float = perf_counter()
    msg: Message = await update.message.reply_text("Pinging...")
    end: float = perf_counter()
    latency = round((end - start) * 1000, 2)
    await msg.edit_text(f"Pong 🏓 {latency} ms")


async def shell(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.type == "private" or update.effective_chat.id != FILE_DUMP_ID or update.effective_user.id not in BOT_ADMINS:
        return

    if not context.args:
        return await update.message.reply_text("Usage: /shell python-code")

    command = " ".join(context.args)

    try:
        exec(command)
        # write_log("INFO", "SHELL", username, f"Shell command executed: {command}")

    except Exception as e:
        pass
        # write_log("ERROR", "SHELL", username, f"Shell command error: {command} -> {e}")
