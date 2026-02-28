import hashlib
import json
import re
import gdown
import requests

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from settings import DRIVE, LOGS_PATH, TEMP_SPLIT_PATH

HashID = Dict[str, int]
FileData = List[HashID]
UserDrive = Dict[str, FileData]
Database = Dict[str, UserDrive]


def load_json(path: Path) -> Any:
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                write_log("INFO", "LOAD JSON", f"Loaded data from `{path}`")
                return data

        except Exception as e:
            write_log("ERROR", "LOAD JSON", f"Failed to load `{path}`: {e}")
            return {}

    write_log("INFO", "LOAD JSON", f"File `{path}` does not exist. Returning empty dict.")
    return {}


def save_json(data: Any, path: Path) -> None:
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)

        write_log("INFO", "SAVE JSON", f"Saved data to `{path}`")

    except Exception as e:
        write_log("ERROR", "SAVE JSON", f"Failed to save `{path}`: {e}")


def extract_file_id(link: str) -> Optional[str]:
    if "drive.google.com" in link:
        match = re.search(r"/file/d/([a-zA-Z0-9_-]+)", link)

        if match:
            file_id = match.group(1)
            write_log("INFO", "EXTRACT FILE ID", f"Found ID via '/file/d/': {file_id}")
            return file_id

        match = re.search(r"id=([a-zA-Z0-9_-]+)", link)

        if match:
            file_id = match.group(1)
            write_log("INFO", "EXTRACT FILE ID", f"Found ID via 'id=': {file_id}")
            return file_id

    write_log("ERROR", "EXTRACT FILE ID", f"Failed to extract file ID from link: {link}")
    return None


def get_original_filename(file_id: str) -> str:
    try:
        url = f"https://drive.google.com/uc?id={file_id}&export=download"
        resp = requests.get(url, stream=True)
        disposition = resp.headers.get("Content-Disposition", "")
        match = re.search(r'filename="(.+?)"', disposition)

        if match:
            filename = match.group(1)
            write_log("INFO", "GET FILENAME", f"Retrieved filename from headers: '{filename}' for ID {file_id}")
            return filename

        html = resp.text
        title_match = re.search(r"<title>(.+?)</title>", html, re.IGNORECASE)

        if title_match:
            raw_title = title_match.group(1).strip()

            if raw_title and not raw_title.lower().startswith("google"):
                filename = raw_title.replace(" - Google Drive", "").strip()
                write_log("INFO", "GET FILENAME", f"Extracted filename from HTML title: '{filename}' for ID {file_id}")
                return filename

        fallback = f"{file_id}.downloaded"
        write_log("ERROR", "GET FILENAME", f"Filename not found in headers or HTML. Using fallback: {fallback}")
        return fallback

    except Exception as e:
        fallback = f"{file_id}.downloaded"
        write_log("ERROR", "GET FILENAME", f"Exception occurred for ID {file_id}: {e}. Using fallback: {fallback}")
        return fallback


def download_drive_file(file_id: str, filename: str) -> Path:
    safe_filename = Path(filename).name

    if ".." in safe_filename or safe_filename.startswith("/"):
        write_log("ERROR", "DOWNLOAD FILE", f"Unsafe filename detected: {filename}")
        raise ValueError("Unsafe filename detected.")

    TEMP_SPLIT_PATH.mkdir(exist_ok=True)
    output_path = TEMP_SPLIT_PATH / safe_filename
    url = f"https://drive.google.com/uc?id={file_id}"

    write_log("INFO", "DOWNLOAD FILE", f"Starting download for ID: {file_id}, saving as: {safe_filename}")

    result = gdown.download(url, str(output_path), quiet=False)

    if result is None or not output_path.exists():
        write_log("ERROR", "DOWNLOAD FILE", f"Failed to download file ID: {file_id}")
        raise RuntimeError(f"Download failed for file ID {file_id}")

    write_log("INFO", "DOWNLOAD FILE", f"Successfully downloaded to: {output_path}")
    return output_path


def hash_data_sha256(data: bytes) -> str:
    hash_value = hashlib.sha256(data).hexdigest()
    write_log("INFO", "HASH", f"Computed SHA-256: {hash_value}")
    return hash_value


def get_file_chunks(user_id: str, filename: str) -> FileData:
    drive: Database = load_json(DRIVE)

    if user_id not in drive or filename not in drive[user_id]:
        write_log("ERROR", "CHUNKS", f"File `{filename}` not found for user {user_id}.")
        raise FileNotFoundError(f"File `{filename}` not found for user {user_id}.")

    chunks = drive[user_id][filename]
    write_log("INFO", "CHUNKS", f"Retrieved {len(chunks)} chunks for `{filename}` (User: {user_id})")
    return chunks


def write_log(level: str, func: str, message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with LOGS_PATH.open("a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] [{func}] [{level}] {message}\n")
