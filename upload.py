import os
import discord
from pathlib import Path
from app import app, FILE_DUMP, MAX_PART_SIZE, DRIVE, UPLOAD
from utils import download_drive_file, extract_file_id, get_original_filename, hash_data_sha256, load_json, save_json


# ─────────────────────────────────────────────────────────────────────────────
# 🧩 File Splitting & Uploading
# ─────────────────────────────────────────────────────────────────────────────

async def upload_chunk_to_discord(file_path: Path) -> int:
    """Upload a file chunk to FILE_DUMP channel and return the message ID."""
    if FILE_DUMP is None:
        raise RuntimeError("FILE_DUMP channel is not set.")

    async with file_path.open("rb") as f:
        message = await FILE_DUMP.send(file=discord.File(f, filename=file_path.name))

    file_path.unlink()  # 🧹 Delete after upload
    return message.id


async def handle_single_part(file_path: Path, output_name: str) -> list[dict[str, int]]:
    """Handle small files (<= MAX_PART_SIZE): save, hash, upload, and return metadata."""
    with file_path.open("rb") as f:
        data = f.read()

    part_path = UPLOAD / output_name
    with part_path.open("wb") as f_out:
        f_out.write(data)

    part_hash = hash_data_sha256(data)
    msg_id = await upload_chunk_to_discord(part_path)

    return [{part_hash: msg_id}]


async def handle_multi_part(file_path: Path) -> list[dict[str, int]]:
    """Handle large files: split, hash, upload each part, and return metadata."""
    hashes = []

    with file_path.open("rb") as f:
        while True:
            chunk = f.read(MAX_PART_SIZE)
            if not chunk:
                break

            part_hash = hash_data_sha256(chunk)
            part_path = UPLOAD / part_hash

            with part_path.open("wb") as part_file:
                part_file.write(chunk)

            msg_id = await upload_chunk_to_discord(part_path)
            hashes.append({part_hash: msg_id})

    return hashes


async def split_and_hash_file(file_path: Path, user_id: str) -> None:
    """Split file if needed, hash parts, and update user drive index."""
    drive = load_json(DRIVE)
    drive.setdefault(user_id, {})
    my_drive = drive[user_id]

    filename = file_path.name
    file_size = os.path.getsize(file_path)

    if file_size <= MAX_PART_SIZE:
        hashes = await handle_single_part(file_path, filename)
    else:
        hashes = await handle_multi_part(file_path)

    my_drive[filename] = hashes
    save_json(drive, DRIVE)


# ─────────────────────────────────────────────────────────────────────────────
# 🚀 Command Execution Logic
# ─────────────────────────────────────────────────────────────────────────────

async def handle_upload(ctx, user_id: str, link: str):
    await ctx.send("📥 Downloading file from Google Drive...")

    file_id = extract_file_id(link)
    if not file_id:
        await ctx.send("❌ Invalid Google Drive link format.")
        return

    filename = get_original_filename(file_id)
    saved_path = UPLOAD / filename

    # Skip if already uploaded
    drive = load_json(DRIVE)
    if user_id in drive and filename in drive[user_id]:
        await ctx.send(f"🔁 File `{filename}` is already uploaded. Skipping re-upload.")
        return

    download_drive_file(file_id, filename)
    await ctx.send(f"✅ File downloaded as `{filename}`.")
    await ctx.send("📦 Processing file...")

    await process_file(ctx, saved_path, user_id)


async def process_file(ctx, filepath: Path, user_id: str):
    await split_and_hash_file(filepath, user_id)

    if filepath.exists():
        filepath.unlink()
        await ctx.send(f"🧹 Removed original large file `{filepath.name}`.")

    await ctx.send("📂 File stored and indexed successfully in your drive.")


# ─────────────────────────────────────────────────────────────────────────────
# 📦 Upload Command
# ─────────────────────────────────────────────────────────────────────────────

@app.command()
async def upload(ctx, link: str = ""):
    user_id = str(ctx.author.id)

    if not link:
        await ctx.send("❗ Usage: `!upload <google_drive_link>`")
        return

    try:
        await handle_upload(ctx, user_id, link)
    except Exception as e:
        await ctx.send(f"❌ Failed to upload: `{e}`")
