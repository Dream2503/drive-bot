"""
transfer.py

Combined upload, download, and remove commands for the Discord Drive Bot.

Responsibilities:
- Handles uploading files from Google Drive links or a local upload directory to Discord,
  splitting large files into manageable chunks compliant with Discord limits,
  hashing and storing metadata per user.
- Handles downloading previously uploaded files by streaming chunked parts from Discord,
  reconstructing them into files saved locally in the download directory.
- Handles file removal (single, multiple, or all files), deleting all stored chunks from Discord
  and cleaning up user drive metadata.
- Provides progress feedback, error handling, and cleans up temporary files appropriately.

Requirements:
- settings.py (defines UPLOAD_PATH, DOWNLOAD_PATH, DRIVE path, FILE_DUMP channel)
- utils.py (provides Google Drive download, hashing, JSON operations, and chunk retrieval)
- Discord.py (v2.0+)
- Other dependencies: gdown, requests, pathlib.

Usage:
    Register this module with the bot instance.
    Invoke the `!upload`, `!download`, and `!remove` commands for file transfers and management.

Notes:
    - Only deletes locally downloaded files that the bot fetched for upload to avoid affecting user files.
    - Bot must have permissions to send, fetch, and manage messages in FILE_DUMP channel.
    - Chunk size for uploads is controlled by MAX_PART_SIZE.
    - Partial downloads and incomplete removals are handled safely with cleanup to avoid corrupted data.
    - Supports batch operations: upload, download, or remove multiple files at once, including 'all'.
    - Designed for sequential chunk operations but can be extended with concurrency for higher performance.

Author: Dream2503
"""
import asyncio

import discord
from discord.ext import commands
import settings
from settings import app, MAX_PART_SIZE, UPLOAD_PATH, DOWNLOAD_PATH
from utils import *


async def upload_and_hash_part(data: bytes) -> HashID:
    """
    Uploads a file chunk as an attachment to a designated Discord channel,
    computes its SHA-256 hash, and returns the mapping of hash to the Discord message ID.

    Responsibilities:
    - Ensure the upload channel (`FILE_DUMP`) is available for sending files.
    - Compute the SHA-256 hash of the given data chunk.
    - Write the chunk to a temporary folder (`TEMP_SPLIT_PATH`) if it doesn’t already exist.
    - Upload the chunk as a file attachment to the Discord channel.
    - Delete the temporary file after successful upload.
    - Return a dictionary mapping the chunk’s hash to the Discord message ID for tracking.

    Args:
        data (bytes): The binary content of the file chunk to be uploaded.

    Returns:
        HashID: A dictionary mapping the SHA-256 hash (str) to the Discord message ID (int).

    Usage:
        Called internally during file uploads to handle individual chunk uploads.
        The returned hash and message ID are used for metadata indexing and later retrieval.

    Flow:
        1. Check that `settings.FILE_DUMP` channel is set; raise error if not.
        2. Compute the SHA-256 hash of the chunk.
        3. Determine the file path for the chunk using `TEMP_SPLIT_PATH`.
        4. If the chunk file does not exist locally, write the bytes to disk.
        5. Open the chunk file and upload it as a Discord file attachment.
        6. Upon successful upload, delete the local chunk file.
        7. Return a dictionary with the hash as key and uploaded message ID as value.

    Notes:
    - Temporary files are stored and cleaned from `TEMP_SPLIT_PATH`, not `UPLOAD_PATH`.
    - Uses Python 3.8+’s `unlink(missing_ok=True)` to safely delete files.
    - Assumes the upload channel is a valid `discord.TextChannel`.
    """
    part_hash = hash_data_sha256(data)
    part_path = TEMP_SPLIT_PATH / part_hash

    if not part_path.exists():
        part_path.write_bytes(data)
        write_log("INFO", "UPLOAD HASH PART", f"Written chunk to temp path: {part_path}")

    message = await settings.FILE_DUMP.send(file=discord.File(part_path, filename=part_hash))
    write_log("INFO", "UPLOAD HASH PART", f"Uploaded part `{part_hash}` to Discord (Message ID: {message.id})")
    part_path.unlink(missing_ok=True)
    write_log("INFO", "UPLOAD HASH PART", f"Deleted temp part file: {part_path}")
    return {part_hash: message.id}


@app.command()
async def upload(ctx: commands.Context, *paths: str) -> None:
    """
    Discord bot command to upload one or multiple files to a user's personal drive, supporting both local files and Google Drive links.

    Responsibilities:
    - Accept multiple upload inputs in one command, including Google Drive links and local filenames.
    - Support the special keyword 'all' to upload every file present in the local upload directory.
    - Download files from Google Drive when links are provided, handling link parsing and download errors.
    - Check for duplicates in the user's drive metadata and skip re-uploads.
    - Split large files into Discord-compliant chunk sizes and upload each chunk as a Discord message attachment.
    - Track progress with real-time status messages to the user during uploads.
    - Update persistent per-user metadata with hashes and Discord message IDs of uploaded chunks.
    - Clean up temporarily downloaded files while preserving user local files.
    - Provide a summary message indicating successful and failed upload attempts.

    Args:
        ctx (commands.Context): The Discord command context.
        paths (str): One or more Google Drive links or filenames to upload. 'all' indicates all local files.

    Usage:
        Invoked by users typing commands like:
        - `!upload <google_drive_link>`
        - `!upload <filename>`
        - `!upload file1 file2 ...`
        - `!upload all` to upload all files in the local upload folder.

    Flow:
        1. Extract the invoking user's username.
        2. Validate that at least one path or link is provided; else send usage instructions.
        3. If 'all' is specified, enumerate all files in the local upload directory to upload.
        4. For each input path or link:
           a. Determine if it refers to a local file or a Google Drive link.
           b. If local, prepare for upload; if a link, parse and download the file.
           c. Load user's drive metadata and skip files already uploaded, cleaning up temp files if applicable.
           d. Split files exceeding `MAX_PART_SIZE` into chunks.
           e. Upload each chunk while tracking hashes and Discord message IDs.
           f. Update status messages to indicate chunk upload progress.
           g. Save the metadata mapping for the uploaded file.
           h. Remove temporary files if downloaded.
        5. After processing all inputs, send a summary indicating which uploads succeeded or failed.

    Notes:
    - Utilizes utility functions for Google Drive downloading, SHA-256 hashing, and JSON metadata handling.
    - Assumes `settings.FILE_DUMP` is set correctly to the Discord channel for storage.
    - Respects Discord's attachment size limits enforced via `MAX_PART_SIZE`.
    - Provides robust error handling with user notifications and resource cleanup.
    - Designed for sequential processing; concurrency or parallel uploads can be added later as an enhancement.
    """
    username = ctx.author.name.upper()
    user_id = ctx.author.id

    if not paths:
        await ctx.send(f"❗ <@{user_id}> Usage: `!upload <google_drive_link|filename> [filename2 ...]` or `!upload all`")
        write_log("ERROR", "UPLOAD", f"[{username}] invoked without providing paths.")
        return

    if "all" in (p.lower() for p in paths):
        all_files = [p.name for p in UPLOAD_PATH.iterdir() if p.is_file()]

        if not all_files:
            await ctx.send(f"📂 <@{user_id}> The upload folder is empty. Add files before using `!upload all`.")
            write_log("ERROR", "UPLOAD", f"[{username}] used `!upload all` but upload folder is empty.")
            return

        paths = tuple(all_files)
        write_log("INFO", "UPLOAD", f"[{username}] using `!upload all`: {paths}")

    successful_uploads = []
    failed_uploads = []

    for input_path in paths:
        file_was_downloaded = False
        filename = ""

        try:
            local_file = (UPLOAD_PATH / input_path).resolve()
            is_local = local_file.exists()

            if is_local:
                filename = local_file.name
                saved_path = local_file
                await ctx.send(f"📤 <@{user_id}> Uploading local file `{filename}` from `{UPLOAD_PATH}` folder...")
                write_log("INFO", "UPLOAD", f"[{username}] Found local file: {filename}")

            else:
                file_id = extract_file_id(input_path)

                if not file_id:
                    await ctx.send(f"❌ <@{user_id}> Invalid Google Drive link format: `{input_path}`")
                    failed_uploads.append(input_path)
                    write_log("ERROR", "UPLOAD", f"[{username}] Invalid Google Drive link: {input_path}")
                    continue

                await ctx.send(f"📥 <@{user_id}> Downloading file from Google Drive ID: {file_id}")
                filename = get_original_filename(file_id)
                saved_path = await asyncio.to_thread(download_drive_file, file_id, filename)
                file_was_downloaded = True
                await ctx.send(f"✅ <@{user_id}> File downloaded as `{filename}`.")
                write_log("INFO", "UPLOAD", f"[{username}] Downloaded file `{filename}` from Google Drive.")

            drive = load_json(DRIVE)
            drive.setdefault(username.lower(), {})

            if filename in drive[username.lower()]:
                await ctx.send(f"🔁 <@{user_id}> File `{filename}` is already uploaded. Skipping re-upload.")
                failed_uploads.append(filename)
                write_log("INFO", "UPLOAD", f"[{username}] File `{filename}` already exists. Skipped.")
                continue

            file_size = saved_path.stat().st_size
            hashes = []

            if file_size <= MAX_PART_SIZE:
                data = saved_path.read_bytes()
                hashes = [await upload_and_hash_part(data)]
                write_log("INFO", "UPLOAD", f"[{username}] Uploaded single-part file `{filename}`.")

            else:
                split_path = TEMP_SPLIT_PATH / filename
                total_parts = (file_size + MAX_PART_SIZE - 1) // MAX_PART_SIZE
                status_msg = await ctx.send(f"📤 <@{user_id}> Uploading part 1/{total_parts} of `{filename}`...")
                write_log("INFO", "UPLOAD",
                          f"[{username}] Starting multi-part upload: `{filename}` ({total_parts} parts).")

                with saved_path.open("rb") as f:
                    for part_num in range(1, total_parts + 1):
                        chunk = f.read(MAX_PART_SIZE)

                        if not chunk:
                            break

                        part_file = split_path.with_name(f"{split_path.stem}.part{part_num:03d}{split_path.suffix}")
                        part_file.write_bytes(chunk)
                        hashes.append(await upload_and_hash_part(chunk))
                        part_file.unlink(missing_ok=True)

                        write_log("INFO", "UPLOAD",
                                  f"[{username}] Uploaded part {part_num}/{total_parts} of `{filename}`.")

                        if part_num < total_parts:
                            await status_msg.edit(content=f"📤 <@{user_id}> Uploading part {part_num + 1}/{total_parts}"
                                                          f" of `{filename}`...")

                await status_msg.edit(content=f"✅ <@{user_id}> All {total_parts} parts of `{filename}` uploaded.")
                write_log("INFO", "UPLOAD", f"[{username}] Completed multi-part upload: `{filename}`")

            drive = load_json(DRIVE)
            drive.setdefault(username.lower(), {})
            drive[username.lower()][filename] = hashes
            save_json(drive, DRIVE)
            successful_uploads.append(filename)
            write_log("INFO", "UPLOAD", f"[{username}] File `{filename}` saved to drive with {len(hashes)} part(s).")

        except Exception as e:
            await ctx.send(f"❌ <@{user_id}> Failed to upload `{input_path or filename}`: `{e}`")
            failed_uploads.append(input_path or filename)
            write_log("ERROR", "UPLOAD", f"[{username}] Exception uploading `{input_path or filename}`: {e}")

        finally:
            if file_was_downloaded and 'saved_path' in locals() and saved_path.exists():
                saved_path.unlink()
                await ctx.send(f"🧹 <@{user_id}> Removed downloaded file `{filename}`.")
                write_log("INFO", "UPLOAD", f"[{username}] Removed temporary downloaded file `{filename}`.")

    summary_msg = ""

    if successful_uploads:
        summary_msg += f"✅ <@{user_id}> Uploaded {len(successful_uploads)} file(s): {', '.join(successful_uploads)}\n"
        write_log("INFO", "UPLOAD", f"[{username}] Successfully uploaded files: {successful_uploads}")

    if failed_uploads:
        summary_msg += f"⚠️ <@{user_id}> Failed to upload {len(failed_uploads)} file(s): {', '.join(failed_uploads)}"
        write_log("ERROR", "UPLOAD", f"[{username}] Failed to upload files: {failed_uploads}")

    await ctx.send(summary_msg.strip())


@app.command()
async def download(ctx: commands.Context, *filenames: str) -> None:
    """
    Discord bot command to download and reconstruct one or multiple files from the user's drive, streaming their contents into the local `download/` directory.

    Responsibilities:
    - Accept either a single filename, multiple filenames, or the 'all' keyword from the user as download targets.
    - Validate that each requested filename exists in the user's drive metadata (expand 'all' to all files).
    - Retrieve each chunk's Discord message by stored message ID and stream them sequentially for each file.
    - Write file chunks directly to disk in the download directory without loading entire files into memory.
    - Report per-file progress to the user, including success and error notifications.
    - Handle errors gracefully for each file, including deleting partially written files on failure.
    - Summarize the download results after completion.

    Args:
        ctx (commands.Context): The Discord command invocation context.
        filenames (str): One or more filenames to reconstruct and download, or 'all' to download all user files.

    Usage:
        - `!download <filename>` to download a single file.
        - `!download file1 file2 ...` to download multiple files in one command.
        - `!download all` to download all files from the user's drive.
        The bot saves each reconstructed file in the local `download/` folder.

    Flow:
        1. Parse user ID and load their file metadata from the drive.
        2. If 'all' is specified, expand to all available user's files; otherwise use provided filenames.
        3. For each filename:
            a. Validate existence in the user's drive. If missing, skip and notify.
            b. Prepare the output file path and create the download directory if needed.
            c. For each chunk:
                i. Retrieve the Discord message by message ID.
                ii. Verify the presence of a file attachment.
                iii. Read chunk data asynchronously and write it to disk.
                iv. After each chunk, update user with download progress.
                v. On error during chunk processing, clean up the partial file, notify, and skip to next file.
            d. Upon successful completion of all chunks, notify the user.
        4. After processing all files, send a summary reporting successful and failed downloads.

    Notes:
    - Output files are saved using specified filenames in the `download/<username>/` directory.
    - Partial files are deleted on error to avoid leaving corrupted files.
    - Requires bot permissions to fetch messages and download attachments in the configured `FILE_DUMP` channel.
    - Efficiently streams chunks to avoid high memory usage, supporting large files as well as batch downloads.
    """
    username = ctx.author.name.upper()
    user_id = ctx.author.id

    drive = load_json(DRIVE)
    user_files = drive.get(username.lower(), {})

    if not filenames:
        await ctx.send(f"❗ <@{user_id}> Usage: `!download <filename> [filename2 ...]` or `!download all`")
        write_log("ERROR", "DOWNLOAD", f"[{username}] called without filenames.")
        return

    requested_files = list(filenames)

    if any(f.lower() == "all" for f in requested_files):
        if not user_files:
            await ctx.send(f"📁 <@{user_id}> Your drive is empty—nothing to download.")
            write_log("ERROR", "DOWNLOAD", f"[{username}] tried to download all, but drive is empty.")
            return

        requested_files = list(user_files.keys())
        write_log("INFO", "DOWNLOAD", f"[{username}] requested all files: {requested_files}")

    successful, failed = [], []

    user_folder = DOWNLOAD_PATH / username.lower()
    user_folder.mkdir(parents=True, exist_ok=True)

    for filename in requested_files:
        if filename not in user_files:
            await ctx.send(f"❌ <@{user_id}> File `{filename}` not found in your drive. Skipping.")
            failed.append(filename)
            write_log("ERROR", "DOWNLOAD", f"[{username}] File `{filename}` not found.")
            continue

        if settings.FILE_DUMP is None:
            await ctx.send(f"❌ <@{user_id}> Internal error: file storage channel not set.")
            failed.append(filename)
            write_log("ERROR", "DOWNLOAD", f"[{username}] FILE_DUMP is not configured.")
            continue

        chunks = user_files[filename]
        total_parts = len(chunks)
        await ctx.send(f"🔎 <@{user_id}> Validating `{filename}`... Starting download.")
        write_log("INFO", "DOWNLOAD", f"[{username}] Starting download for `{filename}` ({total_parts} parts)")
        final_path = user_folder / filename
        status = await ctx.send(f"📥 <@{user_id}> Downloading {total_parts} parts for `{filename}`...")

        try:
            with open(final_path, "wb") as output:
                for i, chunk in enumerate(chunks):
                    hash_val, msg_id = list(chunk.items())[0]

                    try:
                        msg = await settings.FILE_DUMP.fetch_message(msg_id)

                        if not msg.attachments:
                            raise ValueError("No attachment found in message.")

                        attachment = msg.attachments[0]
                        data = await attachment.read()
                        output.write(data)
                        await status.edit(content=f"📥 <@{user_id}> Downloaded part {i + 1}/{total_parts} for "
                                                  f"`{filename}`...")
                        write_log("INFO", "DOWNLOAD", f"<[{username}] Downloaded part {i + 1} of `{filename}`.")

                    except Exception as e:
                        await status.edit(content=f"⚠️ <@{user_id}> Failed at part {i + 1} of `{filename}`: `{e}`")
                        write_log("ERROR", "DOWNLOAD", f"[{username}] Failed at part {i + 1} of `{filename}`: {e}")

                        if final_path.exists():
                            final_path.unlink()
                            write_log("INFO", "DOWNLOAD", f"Deleted incomplete file `{final_path}`.")

                        failed.append(filename)
                        break

                else:
                    await status.edit(content=f"✅ <@{user_id}> File `{filename}` saved in "
                                              f"`download/{username.lower()}/`.")
                    successful.append(filename)
                    write_log("INFO", "DOWNLOAD", f"[{username}] Downloaded file `{filename}` successfully.")
                    continue

        except Exception as e:
            await status.edit(content=f"❌ <@{user_id}> Failed to write file `{filename}`: `{e}`")

            if final_path.exists():
                final_path.unlink()
                write_log("INFO", "DOWNLOAD", f"Deleted partially written file `{final_path}`.")

            failed.append(filename)
            write_log("ERROR", "DOWNLOAD", f"[{username}] Exception writing file `{filename}`: {e}")

    summary = ""

    if successful:
        summary += f"✅ <@{user_id}> Downloaded → | {' | '.join(successful)} |\n"
        write_log("INFO", "DOWNLOAD", f"[{username}] Successfully downloaded: {successful}")

    if failed:
        summary += f"⚠️ <@{user_id}> Failed → | {' | '.join(failed)} |"
        write_log("ERROR", "DOWNLOAD", f"[{username}] Failed downloads: {failed}")

    if summary:
        await ctx.send(summary.strip())


@app.command()
async def remove(ctx: commands.Context, *filenames: str) -> None:
    """
    Discord bot command to remove one or multiple files, or all files, from a user's drive by deleting all associated Discord-stored chunks and updating metadata.

    Responsibilities:
    - Validate user input and determine whether to delete specific files or all files.
    - For the 'all' keyword, iteratively remove all files belonging to the user.
    - For specific files:
        - Verify each file's existence.
        - Fetch and delete all Discord messages corresponding to each file's chunks.
        - Update the drive metadata by removing each file entry.
    - Provide real-time progress updates to the user via Discord messages.
    - Handle permissions and error cases gracefully, alerting the user to missing permissions or failures.

    Args:
        ctx (commands.Context): The Discord command invocation context.
        filenames (str): One or more filenames to remove, or 'all' to remove all files.

    Usage:
        - Users invoke this command with `!remove <filename1> [filename2 ...]` to delete multiple specific files.
        - Using `!remove all` deletes all files uploaded by the user.
        - The command sends progress updates and final confirmation messages for each file.

    Flow:
        1. Retrieve the user's Discord ID as a string.
        2. If no filenames are provided, send usage instructions and exit.
        3. If 'all' is among the filenames, load the entire user's file list and replace filenames with all files.
        4. For each filename to delete:
            a. Validate existence and retrieve associated chunk message IDs.
            b. Send a status message tracking deletion progress.
            c. Iterate over message IDs, fetching and deleting messages from the file dump channel.
            d. Handle exceptions such as message not found or permission errors.
            e. Update and save drive metadata to remove the file record.
            f. Send file-specific deletion confirmation.
        5. Finish after all requested files are processed.

    Notes:
    - The command assumes `settings.FILE_DUMP` is the Discord channel where file chunks are stored and accessible.
    - Proper bot permissions to fetch and delete messages in the file dump channel are required.
    - Sequential processing ensures clear progress feedback and error handling without recursion.
    - Designed to avoid unhandled exceptions to maintain a smooth user experience.
    """
    username = ctx.author.name.upper()
    user_id = ctx.author.id

    if not filenames:
        await ctx.send(f"❗ <@{user_id}> Usage: `!remove <filename> [filename2 ...]` or `!remove all`")
        write_log("ERROR", "REMOVE", f"[{username}] called without filenames.")
        return

    drive = load_json(DRIVE)
    user_files = drive.get(username.lower(), {})

    if "all" in (name.lower() for name in filenames):
        if not user_files:
            await ctx.send(f"📁 <@{user_id}> Your drive is already empty.")
            write_log("INFO", "REMOVE", f"[{username}] attempted to remove all but drive is empty.")
            return

        filenames = list(user_files.keys())
        await ctx.send(f"🧹 <@{user_id}> Removing **{len(filenames)}** files from your drive...")
        write_log("INFO", "REMOVE", f"[{username}] requested to remove all files: {filenames}")

    for filename in filenames:
        if filename not in user_files:
            await ctx.send(f"📁 <@{user_id}> File `{filename}` not found in your drive. Skipping.")
            write_log("ERROR", "REMOVE", f"[{username}] File `{filename}` not found.")
            continue

        try:
            chunks = get_file_chunks(username.lower(), filename)
            total_parts = len(chunks)
            message_ids = [list(part.values())[0] for part in chunks]
            write_log("INFO", "REMOVE", f"[{username}] Preparing to delete `{filename}` with {total_parts} parts.")

        except Exception as e:
            await ctx.send(f"⚠️ <@{user_id}> Error retrieving chunks for `{filename}`: `{e}`")
            write_log("ERROR", "REMOVE", f"[{username}] Failed to get chunks for `{filename}`: {e}")
            continue

        status = await ctx.send(f"🗑️ <@{user_id}> Deleting `{filename}`... 0/{total_parts}")
        deleted = 0

        for i, msg_id in enumerate(message_ids):
            try:
                await status.edit(content=f"🗑️ <@{user_id}> Deleting `{filename}`... {i + 1}/{total_parts}")
                msg = await settings.FILE_DUMP.fetch_message(msg_id)
                await msg.delete()
                deleted += 1
                write_log("INFO", "REMOVE", f"[{username}] Deleted part {i + 1} of `{filename}`.")

            except discord.NotFound:
                write_log("ERROR", "REMOVE", f"[{username}] Message ID `{msg_id}` not found for `{filename}`.")
                continue

            except discord.Forbidden:
                await status.edit(content=f"🚫 <@{user_id}> Missing permissions to delete messages.")
                write_log("ERROR", "REMOVE", f"[{username}] Missing permissions to delete message `{msg_id}`.")
                return

            except Exception as e:
                await status.edit(content=f"⚠️ <@{user_id}> Failed at message ID `{msg_id}`: `{e}`")
                write_log("ERROR", "REMOVE", f"[{username}] Failed to delete message `{msg_id}`: {e}")
                return

        try:
            drive = load_json(DRIVE)

            if filename in drive.get(username.lower(), {}):
                del drive[username.lower()][filename]

                if not drive[username.lower()]:
                    del drive[username.lower()]

                save_json(drive, DRIVE)
                write_log("INFO", "REMOVE", f"[{username}] Metadata updated after removing `{filename}`.")

            user_files = drive.get(username.lower(), {})

        except Exception as e:
            await ctx.send(f"⚠️ <@{user_id}> Deleted chunks but failed to update metadata for `{filename}`: `{e}`")
            write_log("ERROR", "REMOVE",
                      f"[{username}] Failed to update DRIVE metadata after deleting `{filename}`: {e}")

        await status.edit(content=f"✅ <@{user_id}> `{filename}` deleted ({deleted}/{total_parts} parts).")
        await ctx.send(f"📁 <@{user_id}> `{filename}` has been fully removed from your drive.")
        write_log("INFO", "REMOVE", f"[{username}] Completed deletion of `{filename}` ({deleted}/{total_parts}).")
