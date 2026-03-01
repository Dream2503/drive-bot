from os import getenv

from core.utils import write_log
from dotenv import load_dotenv
from settings import app


def main() -> None:
    load_dotenv()

    try:
        token: str | None = getenv("DISCORD_TOKEN")

        if not token:
            write_log("ERROR", "MAIN", "", "DISCORD_TOKEN not found in environment.")
            exit(0)

        write_log("INFO", "MAIN", "", "Starting Store Limitless Bot...")
        app.run(token)

    except Exception as e:
        write_log("ERROR", "MAIN", "", f"Critical error during bot startup: {e}")


if __name__ == "__main__":
    main()
