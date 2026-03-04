from traceback import format_exc

import commands
import transfer
from core.settings import DISCORD_TOKEN
from core.utils import write_log
from settings import app

__all__: list[str] = ["commands", "transfer"]


def main() -> None:
    try:
        write_log("INFO", "MAIN", "", "Starting Store Limitless Bot...")
        app.run(DISCORD_TOKEN)

    except Exception as e:
        write_log("ERROR", "MAIN", "", f"Critical startup failure: {e}\n{format_exc()}")
        raise


if __name__ == "__main__":
    main()
