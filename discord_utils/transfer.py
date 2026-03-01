import settings

from asyncio import to_thread
from discord import File
from discord.ext.commands import Context
from pathlib import Path
from io import BytesIO
from settings import app, CURSOR, MAX_PART_SIZE, TRANSFER_PATH
from utils import write_log


@app.command()
async def upload(ctx: Context, uid: int, upload_path: str) -> None:
    CURSOR.execute(
            "SELECT username "
            "FROM users "
            "WHERE uid = %s;", (uid,),
    )
    row: list[str] = CURSOR.fetchone()

    if row:
        username: str = row[0]
        write_log("INFO", "UPLOAD", username, f"Successfully fetched user from database")

    else:
        write_log("ERROR", "UPLOAD", "", f"User not found in the database")
        return

    try:
        local_file: Path = (TRANSFER_PATH / upload_path).resolve()

        if local_file.exists():
            filename: str = local_file.name
            write_log("INFO", "UPLOAD", username, f"Found local file: {filename}")

        else:
            write_log("ERROR", "UPLOAD", username, f"local file not found: {local_file}")
            return

        CURSOR.execute(
                "SELECT * "
                "FROM files f JOIN owns o ON f.fid = o.fid "
                "WHERE o.uid = %s AND f.fname = %s;", (uid, filename),
        )

        if CURSOR.fetchone():
            write_log("ERROR", "UPLOAD", username, f"File `{filename}` already exists.")
            return

        file_size: int = local_file.stat().st_size
        links: list[int] = []
        total_parts: int = (file_size + MAX_PART_SIZE - 1) // MAX_PART_SIZE
        write_log("INFO", "UPLOAD", username, f"Starting upload: `{filename}` ({total_parts} part(s)).")

        with local_file.open("rb") as f:
            for i in range(1, total_parts + 1):
                chunk: bytes = await to_thread(f.read, MAX_PART_SIZE)

                if not chunk:
                    break

                message = await settings.FILE_DUMP.send(file=File(BytesIO(chunk), filename=f"{filename}.part{i:03d}"))
                links.append(message.id)
                write_log("INFO", "UPLOAD", username, f"Uploaded part {i}/{total_parts} of `{filename}`to Discord. (Message ID: {message.id})")

        write_log("INFO", "UPLOAD", username, f"Completed upload: `{filename}` ({total_parts} part(s)).")
        CURSOR.execute(
                "INSERT INTO files (fname, flinks) "
                "VALUES (%s, %s) "
                "RETURNING fid;", (filename, links),
        )
        fid = CURSOR.fetchone()[0]
        CURSOR.execute(
                "INSERT INTO owns "
                "VALUES (%s, %s);", (uid, fid),
        )
        CURSOR.connection.commit()
        write_log("INFO", "UPLOAD", username, f"File `{filename}` saved to database with {len(links)} part(s).")

    except Exception as e:
        write_log("ERROR", "UPLOAD", username, f"Exception uploading `{upload_path}`: {e}")

# @app.command()
# async def download(ctx: commands.Context, *filenames: str) -> None:
#     username = ctx.author.name.upper()
#     user_id = ctx.author.id
#
#     drive = load_json(DRIVE)
#     user_files = drive.get(username.lower(), {})
#
#     if not filenames:
#         await ctx.send(f"❗ <@{user_id}> Usage: `!download <filename> [filename2 ...]` or `!download all`")
#         write_log("ERROR", "DOWNLOAD", f"[{username}] called without filenames.")
#         return
#
#     requested_files = list(filenames)
#
#     if any(f.lower() == "all" for f in requested_files):
#         if not user_files:
#             await ctx.send(f"📁 <@{user_id}> Your drive is empty—nothing to download.")
#             write_log("ERROR", "DOWNLOAD", f"[{username}] tried to download all, but drive is empty.")
#             return
#
#         requested_files = list(user_files.keys())
#         write_log("INFO", "DOWNLOAD", f"[{username}] requested all files: {requested_files}")
#
#     successful, failed = [], []
#
#     user_folder = DOWNLOAD_PATH / username.lower()
#     user_folder.mkdir(parents=True, exist_ok=True)
#
#     for filename in requested_files:
#         if filename not in user_files:
#             await ctx.send(f"❌ <@{user_id}> File `{filename}` not found in your drive. Skipping.")
#             failed.append(filename)
#             write_log("ERROR", "DOWNLOAD", f"[{username}] File `{filename}` not found.")
#             continue
#
#         if settings.FILE_DUMP is None:
#             await ctx.send(f"❌ <@{user_id}> Internal error: file storage channel not set.")
#             failed.append(filename)
#             write_log("ERROR", "DOWNLOAD", f"[{username}] FILE_DUMP is not configured.")
#             continue
#
#         chunks = user_files[filename]
#         total_parts = len(chunks)
#         await ctx.send(f"🔎 <@{user_id}> Validating `{filename}`... Starting download.")
#         write_log("INFO", "DOWNLOAD", f"[{username}] Starting download for `{filename}` ({total_parts} parts)")
#         final_path = user_folder / filename
#         status = await ctx.send(f"📥 <@{user_id}> Downloading {total_parts} parts for `{filename}`...")
#
#         try:
#             with open(final_path, "wb") as output:
#                 for i, chunk in enumerate(chunks):
#                     hash_val, msg_id = list(chunk.items())[0]
#
#                     try:
#                         msg = await settings.FILE_DUMP.fetch_message(msg_id)
#
#                         if not msg.attachments:
#                             raise ValueError("No attachment found in message.")
#
#                         attachment = msg.attachments[0]
#                         data = await attachment.read()
#                         output.write(data)
#                         await status.edit(
#                                 content=f"📥 <@{user_id}> Downloaded part {i + 1}/{total_parts} for "
#                                         f"`{filename}`...",
#                         )
#                         write_log("INFO", "DOWNLOAD", f"<[{username}] Downloaded part {i + 1} of `{filename}`.")
#
#                     except Exception as e:
#                         await status.edit(content=f"⚠️ <@{user_id}> Failed at part {i + 1} of `{filename}`: `{e}`")
#                         write_log("ERROR", "DOWNLOAD", f"[{username}] Failed at part {i + 1} of `{filename}`: {e}")
#
#                         if final_path.exists():
#                             final_path.unlink()
#                             write_log("INFO", "DOWNLOAD", f"Deleted incomplete file `{final_path}`.")
#
#                         failed.append(filename)
#                         break
#
#                 else:
#                     await status.edit(
#                             content=f"✅ <@{user_id}> File `{filename}` saved in "
#                                     f"`download/{username.lower()}/`.",
#                     )
#                     successful.append(filename)
#                     write_log("INFO", "DOWNLOAD", f"[{username}] Downloaded file `{filename}` successfully.")
#                     continue
#
#         except Exception as e:
#             await status.edit(content=f"❌ <@{user_id}> Failed to write file `{filename}`: `{e}`")
#
#             if final_path.exists():
#                 final_path.unlink()
#                 write_log("INFO", "DOWNLOAD", f"Deleted partially written file `{final_path}`.")
#
#             failed.append(filename)
#             write_log("ERROR", "DOWNLOAD", f"[{username}] Exception writing file `{filename}`: {e}")
#
#     summary = ""
#
#     if successful:
#         summary += f"✅ <@{user_id}> Downloaded → | {' | '.join(successful)} |\n"
#         write_log("INFO", "DOWNLOAD", f"[{username}] Successfully downloaded: {successful}")
#
#     if failed:
#         summary += f"⚠️ <@{user_id}> Failed → | {' | '.join(failed)} |"
#         write_log("ERROR", "DOWNLOAD", f"[{username}] Failed downloads: {failed}")
#
#     if summary:
#         await ctx.send(summary.strip())
#
#
# @app.command()
# async def remove(ctx: commands.Context, *filenames: str) -> None:
#     username = ctx.author.name.upper()
#     user_id = ctx.author.id
#
#     if not filenames:
#         await ctx.send(f"❗ <@{user_id}> Usage: `!remove <filename> [filename2 ...]` or `!remove all`")
#         write_log("ERROR", "REMOVE", f"[{username}] called without filenames.")
#         return
#
#     drive = load_json(DRIVE)
#     user_files = drive.get(username.lower(), {})
#
#     if "all" in (name.lower() for name in filenames):
#         if not user_files:
#             await ctx.send(f"📁 <@{user_id}> Your drive is already empty.")
#             write_log("INFO", "REMOVE", f"[{username}] attempted to remove all but drive is empty.")
#             return
#
#         filenames = list(user_files.keys())
#         await ctx.send(f"🧹 <@{user_id}> Removing **{len(filenames)}** files from your drive...")
#         write_log("INFO", "REMOVE", f"[{username}] requested to remove all files: {filenames}")
#
#     for filename in filenames:
#         if filename not in user_files:
#             await ctx.send(f"📁 <@{user_id}> File `{filename}` not found in your drive. Skipping.")
#             write_log("ERROR", "REMOVE", f"[{username}] File `{filename}` not found.")
#             continue
#
#         try:
#             chunks = get_file_chunks(username.lower(), filename)
#             total_parts = len(chunks)
#             message_ids = [list(part.values())[0] for part in chunks]
#             write_log("INFO", "REMOVE", f"[{username}] Preparing to delete `{filename}` with {total_parts} parts.")
#
#         except Exception as e:
#             await ctx.send(f"⚠️ <@{user_id}> Error retrieving chunks for `{filename}`: `{e}`")
#             write_log("ERROR", "REMOVE", f"[{username}] Failed to get chunks for `{filename}`: {e}")
#             continue
#
#         status = await ctx.send(f"🗑️ <@{user_id}> Deleting `{filename}`... 0/{total_parts}")
#         deleted = 0
#
#         for i, msg_id in enumerate(message_ids):
#             try:
#                 await status.edit(content=f"🗑️ <@{user_id}> Deleting `{filename}`... {i + 1}/{total_parts}")
#                 msg = await settings.FILE_DUMP.fetch_message(msg_id)
#                 await msg.delete()
#                 deleted += 1
#                 write_log("INFO", "REMOVE", f"[{username}] Deleted part {i + 1} of `{filename}`.")
#
#             except discord.NotFound:
#                 write_log("ERROR", "REMOVE", f"[{username}] Message ID `{msg_id}` not found for `{filename}`.")
#                 continue
#
#             except discord.Forbidden:
#                 await status.edit(content=f"🚫 <@{user_id}> Missing permissions to delete messages.")
#                 write_log("ERROR", "REMOVE", f"[{username}] Missing permissions to delete message `{msg_id}`.")
#                 return
#
#             except Exception as e:
#                 await status.edit(content=f"⚠️ <@{user_id}> Failed at message ID `{msg_id}`: `{e}`")
#                 write_log("ERROR", "REMOVE", f"[{username}] Failed to delete message `{msg_id}`: {e}")
#                 return
#
#         try:
#             drive = load_json(DRIVE)
#
#             if filename in drive.get(username.lower(), {}):
#                 del drive[username.lower()][filename]
#
#                 if not drive[username.lower()]:
#                     del drive[username.lower()]
#
#                 save_json(drive, DRIVE)
#                 write_log("INFO", "REMOVE", f"[{username}] Metadata updated after removing `{filename}`.")
#
#             user_files = drive.get(username.lower(), {})
#
#         except Exception as e:
#             await ctx.send(f"⚠️ <@{user_id}> Deleted chunks but failed to update metadata for `{filename}`: `{e}`")
#             write_log(
#                     "ERROR", "REMOVE",
#                     f"[{username}] Failed to update DRIVE metadata after deleting `{filename}`: {e}",
#             )
#
#         await status.edit(content=f"✅ <@{user_id}> `{filename}` deleted ({deleted}/{total_parts} parts).")
#         await ctx.send(f"📁 <@{user_id}> `{filename}` has been fully removed from your drive.")
#         write_log("INFO", "REMOVE", f"[{username}] Completed deletion of `{filename}` ({deleted}/{total_parts}).")
