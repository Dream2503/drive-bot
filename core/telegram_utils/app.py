from os import getenv

from commands import *
from core.utils import write_log
from dotenv import load_dotenv
from telegram.ext import ApplicationBuilder, CommandHandler


def main() -> None:
    load_dotenv()

    try:
        token: str | None = getenv("TELEGRAM_TOKEN")

        if not token:
            write_log("ERROR", "MAIN", "", "TELEGRAM_TOKEN not found in environment.")
            exit(0)

        write_log("INFO", "MAIN", "", "Starting Store Limitless Bot...")
        app = ApplicationBuilder().token(token).build()
        app.add_handler(CommandHandler("clear", clear))
        app.add_handler(CommandHandler("ping", ping))
        app.add_handler(CommandHandler("shell", shell))
        app.add_handler(CommandHandler("shutdown", shutdown))
        app.add_error_handler(error_handler)
        app.run_polling(drop_pending_updates=True)

    except Exception as e:
        write_log("ERROR", "MAIN", "", f"Critical error during bot startup: {e}")


if __name__ == "__main__":
    main()
