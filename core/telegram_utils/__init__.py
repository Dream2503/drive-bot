from io import BytesIO

from pyrogram import Client
from pyrogram.types import Message

from core.data_center import ConfigMeta, DataCenter
from core.settings import getenv
from core.utils import write_log


class Telegram(DataCenter, metaclass=ConfigMeta):
    NAME: str = "Telegram"
    TOKEN: str = getenv("TELEGRAM_TOKEN")
    API_ID: int = int(getenv("TELEGRAM_API_ID"))
    API_HASH: str = getenv("TELEGRAM_API_HASH")
    ADMIN: int = int(getenv("TELEGRAM_ADMIN"))
    FILE_DUMP_ID: int = int(getenv("TELEGRAM_FILE_DUMP_ID"))

    app: Client

    @staticmethod
    async def upload(chunk: bytes, filename: str) -> str:
        message: Message = await Telegram.app.send_document(chat_id=Telegram.FILE_DUMP_ID, document=BytesIO(chunk), file_name=filename)

        if message.document is None:
            raise OSError(f"Telegram upload failed for '{filename}'")

        return f"tg:{message.id}"

    @staticmethod
    async def download(flink: str) -> bytes:
        if not flink.startswith("tg:"):
            raise OSError(f"Unsupported Telegram reference: {flink}")

        message_id: int = int(flink[3:])
        message: Message | None = await Telegram.app.get_messages(Telegram.FILE_DUMP_ID, message_id)

        if message is None or message.document is None:
            raise OSError(f"Telegram message {message_id} not found")

        data: bytearray = bytearray()

        async for chunk in Telegram.app.stream_media(message):
            data.extend(chunk)

        return bytes(data)

    @staticmethod
    async def initialize() -> None:
        try:
            Telegram.app = Client("storelimitless", api_id=Telegram.API_ID, api_hash=Telegram.API_HASH, bot_token=Telegram.TOKEN)
            await Telegram.app.start()
            me = await Telegram.app.get_me()
            write_log("INFO", Telegram, "INIT", me.username or str(me.id), f"Bot is online. Logged in (id={me.id})")

        except Exception as e:
            write_log("ERROR", Telegram, "INIT", "", f"Initialization failure: {e}")
            raise

    @staticmethod
    async def shutdown() -> None:
        try:
            await Telegram.app.stop()
            write_log("INFO", Telegram, "SHUTDOWN", "", "Telegram client stopped.")

        except Exception as e:
            write_log("ERROR", Telegram, "SHUTDOWN", "", f"Shutdown failure: {e}")
