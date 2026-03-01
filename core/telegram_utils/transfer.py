from asyncio import to_thread
from io import BytesIO
from pathlib import Path

from backend.database.utils import get_file_links, get_username, insert_files
from core.settings import TRANSFER_PATH
from core.telegram_utils.settings import FILE_DUMP_ID, MAX_PART_SIZE
from core.utils import write_log
from telegram import InputFile
from telegram.ext import ContextTypes


async def upload(update, context: ContextTypes.DEFAULT_TYPE, uid: int, filename: str) -> None:
    username: str | None = get_username(uid, write_log)

    if not username:
        return

    try:
        local_file: Path = (TRANSFER_PATH / filename).resolve()

        if not local_file.exists():
            write_log("ERROR", "UPLOAD", username, f"Local file not found: {local_file}")
            return

        write_log("INFO", "UPLOAD", username, f"Found local file: {filename}")

        if get_file_links(uid, filename, write_log):
            write_log("ERROR", "UPLOAD", username, f"File `{filename}` already exists.")
            return

        file_size: int = local_file.stat().st_size
        total_parts: int = (file_size + MAX_PART_SIZE - 1) // MAX_PART_SIZE
        links: list[int] = []
        write_log("INFO", "UPLOAD", username, f"Starting upload: `{filename}` ({total_parts} part(s)).")

        with local_file.open("rb") as f:
            for i in range(1, total_parts + 1):
                chunk: bytes = await to_thread(f.read, MAX_PART_SIZE)

                if not chunk:
                    break

                try:
                    bio = BytesIO(chunk)
                    bio.name = f"{filename}.part{i:03d}"
                    msg = await context.bot.send_document(chat_id=FILE_DUMP_ID, document=InputFile(bio))
                    msg_id: int = msg.message_id
                    links.append(msg_id)
                    write_log("INFO", "UPLOAD", username, f"Uploaded part {i}/{total_parts} of `{filename}` to Telegram. (Message ID: {msg_id})")

                except Exception as e:
                    write_log("ERROR", "UPLOAD", username, f"Failed at part {i}/{total_parts}: {e}")

                    for msg_id in links:
                        try:
                            await context.bot.delete_message(chat_id=FILE_DUMP_ID, message_id=msg_id)
                        except:
                            pass

                    return

        insert_files(uid, filename, links, write_log)
        write_log("INFO", "UPLOAD", username, f"Completed upload: `{filename}` ({len(links)} part(s)).")

    except Exception as e:
        write_log("ERROR", "UPLOAD", username, f"Exception uploading `{filename}`: {e}")


async def download(ctx: ContextTypes.DEFAULT_TYPE, uid: int, filename: str) -> None:
    username: str | None = get_username(uid, write_log)

    if not username:
        return

    final_path: Path = TRANSFER_PATH / filename

    try:
        links: list[int] | None = get_file_links(uid, filename, write_log)

        if not links:
            write_log("ERROR", "DOWNLOAD", username, f"No such file `{filename}` in database.")
            return

        total_parts: int = len(links)
        write_log("INFO", "DOWNLOAD", username, f"Starting download for `{filename}` ({total_parts} part(s)).")

        with final_path.open("wb") as output:
            for i, msg_id in enumerate(links, start=1):
                try:
                    msg = await ctx.bot.get_chat(FILE_DUMP_ID)
                    message = await msg.get_message(msg_id)

                    if not message.document:
                        raise ValueError("No document found in message.")

                    file = await message.document.get_file()
                    chunk: bytes = await file.download_as_bytearray()

                    output.write(chunk)
                    write_log("INFO", "DOWNLOAD", username, f"Downloaded part {i}/{total_parts} of `{filename}`.")

                except Exception as e:
                    write_log("ERROR", "DOWNLOAD", username, f"Failed at part {i}/{total_parts} of `{filename}`: {e}")
                    output.close()

                    if final_path.exists():
                        final_path.unlink()

                    return

        write_log("INFO", "DOWNLOAD", username, f"Downloaded file `{filename}` successfully.")

    except Exception as e:
        if final_path.exists():
            final_path.unlink()

        write_log("ERROR", "DOWNLOAD", username, f"Exception during download of `{filename}`: {e}")
