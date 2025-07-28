import hashlib
import json
import re
from pathlib import Path
from typing import Any

import gdown
import requests

from app import UPLOAD


def load_json(path: Path) -> dict:
    """Load JSON data from a file, return empty dict if file doesn't exist."""
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_json(data: Any, path: Path) -> None:
    """Save Python data as JSON to a file."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def format_drive_structure(files: dict[str, list[dict[str, int]]]) -> str:
    """Return a tree-like string structure for a user's drive content."""
    if not files:
        return "📁 (empty)"

    lines = ["📁 Your Drive:"]
    total = len(files)

    for idx, (filename, chunks) in enumerate(files.items()):
        connector = "└──" if idx == total - 1 else "├──"
        lines.append(f"│   {connector} {filename}  📦 ({len(chunks)} parts)")

    return "\n".join(lines)


def extract_file_id(link: str) -> str | None:
    """Extract the Google Drive file ID from a shared link."""
    if "drive.google.com" in link:
        if "/file/d/" in link:
            return link.split("/file/d/")[1].split("/")[0]
        elif "id=" in link:
            return link.split("id=")[1].split("&")[0]
    return None


def get_original_filename(file_id: str) -> str:
    """Try to fetch the original file name from Google Drive headers."""
    try:
        url = f"https://drive.google.com/uc?id={file_id}&export=download"
        resp = requests.get(url, stream=True)
        disposition = resp.headers.get("Content-Disposition", "")
        match = re.search(r'filename="(.+?)"', disposition)
        return match.group(1) if match else f"{file_id}.downloaded"
    except:
        return f"{file_id}.downloaded"


def download_drive_file(file_id: str, filename: str) -> Path:
    """Download file using gdown and return the saved path."""
    UPLOAD.mkdir(exist_ok=True)
    output_path = UPLOAD / filename
    url = f"https://drive.google.com/uc?id={file_id}"
    gdown.download(url, str(output_path), quiet=False)
    return output_path


def hash_data_sha256(data: bytes) -> str:
    """Compute SHA-256 hash of the given bytes."""
    return hashlib.sha256(data).hexdigest()
