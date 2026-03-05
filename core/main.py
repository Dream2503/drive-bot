from threading import Thread

import discord_utils
import telegram_utils


def main() -> None:
    discord_thread = Thread(target=discord_utils.main, daemon=True)
    discord_thread.start()
    telegram_utils.main()


if __name__ == "__main__":
    main()
