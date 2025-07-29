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
import discord
from discord.ext import commands
import settings
from settings import app, MAX_PART_SIZE, DRIVE, UPLOAD_PATH, DOWNLOAD_PATH
from utils import (
    download_drive_file,
    extract_file_id,
    get_file_chunks, get_original_filename,
    hash_data_sha256,
    load_json,
    save_json,
    HashID,
)


async def upload_and_hash_part(data: bytes) -> HashID:
    """
    Uploads a file chunk as an attachment to a designated Discord channel,
    computes its SHA-256 hash, and returns the mapping of hash to the Discord message ID.

    Responsibilities:
    - Ensure the upload channel (`FILE_DUMP`) is available for sending files.
    - Compute the SHA-256 hash of the given data chunk.
    - Write the chunk to disk temporarily if it doesn’t already exist.
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
        3. Determine the file path for the chunk based on the hash.
        4. If the chunk file does not exist locally, write the bytes to disk.
        5. Open the chunk file and upload it as a Discord file attachment.
        6. Upon successful upload, delete the local chunk file.
        7. Return a dictionary with the hash as key and uploaded message ID as value.

    Notes:
    - Temporary files are stored and cleaned in the configured `UPLOAD_PATH`.
    - Uses Python 3.8+’s `unlink(missing_ok=True)` to safely delete files.
    - Assumes the upload channel is a valid `discord.TextChannel`.
    """

    if settings.FILE_DUMP is None:
        raise RuntimeError("FILE_DUMP channel is not set in settings.")

    part_hash = hash_data_sha256(data)
    part_path = UPLOAD_PATH / part_hash

    # Write the chunk for uploading if not already present
    if not part_path.exists():
        part_path.write_bytes(data)

    with part_path.open("rb") as f:
        message = await settings.FILE_DUMP.send(file=discord.File(f, filename=part_hash))

    part_path.unlink(missing_ok=True)  # Remove temp file after upload (Python 3.8+)
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
        1. Extract the invoking user's Discord ID.
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
    user_id = str(ctx.author.id)

    if not paths:
        await ctx.send("❗ Usage: `!upload <google_drive_link|filename> [filename2 ...]` or `!upload all`")
        return

    # If 'all' specified, collect all files inside UPLOAD_PATH
    if "all" in (p.lower() for p in paths):
        all_files = [p.name for p in UPLOAD_PATH.iterdir() if p.is_file()]

        if not all_files:
            await ctx.send("📂 The upload folder is empty. Add files before using `!upload all`.")
            return

        paths = tuple(all_files)

    successful_uploads = []
    failed_uploads = []

    for input_path in paths:
        file_was_downloaded = False

        # Determine if input is local file or Google Drive link
        local_file = (UPLOAD_PATH / input_path).resolve()
        is_local = local_file.exists()

        if is_local:
            filename = local_file.name
            saved_path = local_file
            await ctx.send(f"📤 Uploading local file `{filename}` from `{UPLOAD_PATH}` folder...")

        else:
            # Treat as Google Drive link
            try:
                await ctx.send(f"📥 Downloading file from Google Drive link: {input_path}")
                file_id = extract_file_id(input_path)

                if not file_id:
                    await ctx.send(f"❌ Invalid Google Drive link format: `{input_path}`")
                    failed_uploads.append(input_path)
                    continue

                filename = get_original_filename(file_id)

            except Exception as e:
                await ctx.send(f"❌ Failed to parse Google Drive link `{input_path}`: `{e}`")
                failed_uploads.append(input_path)
                continue

            try:
                saved_path = download_drive_file(file_id, filename)
                file_was_downloaded = True
                await ctx.send(f"✅ File downloaded as `{filename}`.")

            except Exception as e:
                await ctx.send(f"❌ Failed to download file `{filename}`: `{e}`")
                failed_uploads.append(input_path)
                continue

        # Check for duplicates
        try:
            drive = load_json(DRIVE)
            drive.setdefault(user_id, {})

            if filename in drive[user_id]:
                await ctx.send(f"🔁 File `{filename}` is already uploaded. Skipping re-upload.")

                if file_was_downloaded and saved_path.exists():
                    saved_path.unlink()

                failed_uploads.append(filename)
                continue

        except Exception as e:
            await ctx.send(f"❌ Error loading drive metadata: `{e}`")

            if file_was_downloaded and saved_path.exists():
                saved_path.unlink()

            failed_uploads.append(filename)
            continue

        # Upload Process (split, hash, upload)
        file_size = saved_path.stat().st_size
        hashes = []

        try:
            if file_size <= MAX_PART_SIZE:
                data = saved_path.read_bytes()
                hashes = [await upload_and_hash_part(data)]

            else:
                total_parts = (file_size + MAX_PART_SIZE - 1) // MAX_PART_SIZE
                status_msg = await ctx.send(f"📤 Uploading part 1/{total_parts} of `{filename}`...")

                with saved_path.open("rb") as f:
                    for part_num in range(1, total_parts + 1):
                        chunk = f.read(MAX_PART_SIZE)

                        if not chunk:
                            break

                        hashes.append(await upload_and_hash_part(chunk))

                        if part_num < total_parts:
                            await status_msg.edit(
                                content=f"📤 Uploading part {part_num + 1}/{total_parts} of `{filename}`...")

                await status_msg.edit(content=f"✅ All {total_parts} parts of `{filename}` uploaded.")

        except Exception as e:
            await ctx.send(f"❌ Failed during file upload of `{filename}`: `{e}`")

            if file_was_downloaded and saved_path.exists():
                saved_path.unlink()

            failed_uploads.append(filename)
            continue

        # Save metadata & clean up
        try:
            drive[user_id][filename] = hashes
            save_json(drive, DRIVE)

        except Exception as e:
            await ctx.send(f"⚠️ Upload succeeded but failed to save metadata for `{filename}`: `{e}`")

        if file_was_downloaded and saved_path.exists():
            saved_path.unlink()
            await ctx.send(f"🧹 Removed downloaded file `{filename}`.")

        successful_uploads.append(filename)

    # Summary message
    summary_msg = ""

    if successful_uploads:
        summary_msg += f"✅ Successfully uploaded → | {' | '.join(successful_uploads)} |\n"

    if failed_uploads:
        summary_msg += f"⚠️ Failed to upload → | {' | '.join(failed_uploads)} |"

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
    - Output files are saved using specified filenames in the `download/` directory.
    - Partial files are deleted on error to avoid leaving corrupted files.
    - Requires bot permissions to fetch messages and download attachments in the configured `FILE_DUMP` channel.
    - Efficiently streams chunks to avoid high memory usage, supporting large files as well as batch downloads.
    """
    user_id = str(ctx.author.id)

    # Collect candidate files
    drive = load_json(DRIVE)
    user_files = drive.get(user_id, {})

    if not filenames:
        await ctx.send("❗ Usage: `!download <filename> [filename2 ...]` or `!download all`")
        return

    requested_files = list(filenames)

    # Expand 'all' to all available user files (case-insensitive search for 'all')
    if any(f.lower() == "all" for f in requested_files):
        if not user_files:
            await ctx.send("📁 Your drive is empty—nothing to download.")
            return

        requested_files = list(user_files.keys())

    successful, failed = [], []

    for filename in requested_files:
        if filename not in user_files:
            await ctx.send(f"❌ File `{filename}` not found in your drive. Skipping.")
            failed.append(filename)
            continue

        if settings.FILE_DUMP is None:
            await ctx.send("❌ Internal error: file storage channel not set.")
            failed.append(filename)
            continue

        chunks = user_files[filename]
        total_parts = len(chunks)
        await ctx.send(f"🔎 Validating `{filename}`...")

        final_path = DOWNLOAD_PATH / filename
        DOWNLOAD_PATH.mkdir(exist_ok=True)
        status = await ctx.send(f"📥 Downloading {total_parts} parts for `{filename}`...")

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
                        await status.edit(content=f"📥 Downloaded part {i + 1}/{total_parts}...")

                    except Exception as e:
                        await status.edit(content=f"⚠️ Failed at part {i + 1}: `{e}`")

                        # Clean up partial file on error
                        if final_path.exists():
                            final_path.unlink()

                        failed.append(filename)
                        break  # Skip to next requested file

                else:
                    await status.edit(content=f"✅ File `{filename}` reconstructed and saved as `{filename}`"
                                              f" in `download/` folder.")
                    successful.append(filename)
                    continue  # only runs if not broken out of 'for' loop above

        # If failed in any inner loop: file already marked as failed
        except Exception as e:
            await status.edit(content=f"❌ Failed to write file `{filename}`: `{e}`")

            if final_path.exists():
                final_path.unlink()

            failed.append(filename)

    # Send summary
    summary = ""

    if successful:
        summary += f"✅ Downloaded → | {' | '.join(successful)} |\n"

    if failed:
        summary += f"⚠️ Failed → | {' | '.join(failed)} |"

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
    user_id = str(ctx.author.id)

    if not filenames:
        await ctx.send("❗ Usage: `!remove <filename> [filename2 ...]` or `!remove all`")
        return

    drive = load_json(DRIVE)
    user_files = drive.get(user_id, {})

    # Handle 'all' keyword: delete all files regardless of other filenames
    if "all" in (name.lower() for name in filenames):
        if not user_files:
            await ctx.send("📁 Your drive is already empty.")
            return

        filenames = list(user_files.keys())  # override filenames to all files
        await ctx.send(f"🧹 Removing **{len(filenames)}** files from your drive...")

    # Loop over given filenames and delete each
    for filename in filenames:
        if filename not in user_files:
            await ctx.send(f"📁 File `{filename}` not found in your drive. Skipping.")
            continue

        try:
            chunks = get_file_chunks(user_id, filename)
            total_parts = len(chunks)
            message_ids = [list(part.values())[0] for part in chunks]

        except Exception as e:
            await ctx.send(f"⚠️ Error retrieving chunks for `{filename}`: `{e}`")
            continue

        status = await ctx.send(f"🗑️ Deleting `{filename}`... 0/{total_parts}")
        deleted = 0

        for i, msg_id in enumerate(message_ids):
            try:
                await status.edit(content=f"🗑️ Deleting `{filename}`... {i + 1}/{total_parts}")
                msg = await settings.FILE_DUMP.fetch_message(msg_id)
                await msg.delete()
                deleted += 1

            except discord.NotFound:
                continue

            except discord.Forbidden:
                await status.edit(content="🚫 Missing permissions to delete messages.")
                return

            except Exception as e:
                await status.edit(content=f"⚠️ Failed at message ID `{msg_id}`: `{e}`")
                return

        # Remove metadata for deleted file
        try:
            drive = load_json(DRIVE)  # reload in case of concurrent changes

            if filename in drive.get(user_id, {}):
                del drive[user_id][filename]
                save_json(drive, DRIVE)

            user_files = drive.get(user_id, {})  # update local copy to reflect changes

        except Exception as e:
            await ctx.send(f"⚠️ Deleted chunks but failed to update metadata for `{filename}`: `{e}`")

        await status.edit(content=f"✅ `{filename}` deleted ({deleted}/{total_parts} parts).")
        await ctx.send(f"📁 `{filename}` has been fully removed from your drive.")
