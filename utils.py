"""
utils.py

Utility functions for the Discord Drive Bot.

Responsibilities:
- Read and write JSON data for user files and bot configuration.
- Download files from Google Drive using public share links.
- Extract Google Drive file IDs from links.
- Compute cryptographic hashes for file integrity.
- (Minor) Safeguard against unsafe filenames and potential edge cases.

Requirements:
    - gdown
    - requests

Note:
    - All paths are pathlib.Path objects.
    - Does not handle concurrent writes; add file-locks if multiprocess expected.

Author: Dream2503
"""

import hashlib
import json
import re
import gdown
import requests

from pathlib import Path
from typing import Any, Dict, List, Optional
from settings import DRIVE, UPLOAD_PATH

# ─── Type Aliases ──────────────────────────────────────────────────
HashID = Dict[str, int]
FileData = List[HashID]
UserDrive = Dict[str, FileData]
Database = Dict[str, UserDrive]


def load_json(path: Path) -> Any:
    """
    Utility function to load JSON data from a file path.

    Responsibilities:
    - Open and read JSON content from the given file path.
    - Parse the content into a Python object.
    - Return an empty dictionary if the file does not exist or if parsing fails.

    Args:
        path (Path): The file path from which to load JSON data.

    Returns:
        Any: Parsed JSON object (typically a dict or list), or an empty dict on failure.

    Usage:
        Call this function with a Path object pointing to a JSON file.
        It returns the parsed JSON content or an empty dict if the file is missing or corrupt.

    Flow:
        1. Check if the file exists at the given path.
        2. If it exists, try to open and parse the JSON.
        3. If parsing succeeds, return the parsed data.
        4. If parsing fails due to an exception, return an empty dict.
        5. If the file does not exist, return an empty dict.

    Notes:
    - Does not raise exceptions on file absence or parse errors; failure is silently handled.
    - Useful as a safe loader for configuration or metadata files.
    """
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)

        except Exception:
            return {}

    return {}


def save_json(data: Any, path: Path) -> None:
    """
    Utility function to save Python data as formatted JSON to a file.

    Responsibilities:
    - Serialize Python data into JSON format.
    - Write the JSON data to the specified file path with indentation for readability.

    Args:
        data (Any): JSON-serializable Python data (e.g., dict, list).
        path (Path): The destination file path to write the JSON data.

    Usage:
        Call this function with data and a valid file path to persist data in JSON format.
        The output JSON is indented for human readability.

    Flow:
        1. Open the file at the specified path in write mode with UTF-8 encoding.
        2. Use `json.dump` to serialize and write the provided data to the file.
        3. Format the JSON output with an indentation of 4 spaces.
        4. Close the file automatically after writing completes.

    Notes:
    - The function does not handle exceptions explicitly; calling code should manage file write errors.
    - Suitable for saving configuration, metadata, or other structured data persistently.
    """
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def extract_file_id(link: str) -> Optional[str]:
    """
    Extracts the file ID from a Google Drive shareable link, supporting common URL formats.

    Responsibilities:
    - Parse a user-provided Google Drive URL to extract the unique file identifier.
    - Support multiple URL patterns used by Google Drive links, including direct and query parameter styles.
    - Return the file ID string if found, or None otherwise.

    Args:
        link (str): A user-supplied Google Drive shareable link.

    Returns:
        Optional[str]: The extracted file ID if successful; None if the link format is unrecognized.

    Usage:
        Call this function when receiving a Google Drive link to determine the file ID needed for download or metadata fetching.

    Flow:
        1. Check if the input link contains the domain "drive.google.com".
        2. Attempt to match the file ID in the URL path pattern "/file/d/<file_id>".
        3. If not found, attempt to extract the file ID from the URL query parameter "id=<file_id>".
        4. If a match is found in either pattern, return the extracted file ID.
        5. If no valid patterns are matched, return None.

    Notes:
    - This function uses regular expressions for pattern matching.
    - Assumes typical Google Drive URL formats; may not work with all possible variations.
    - Returns None safely if the link is invalid or the ID cannot be parsed.
    """
    if "drive.google.com" in link:
        match = re.search(r"/file/d/([a-zA-Z0-9_-]+)", link)

        if match:
            return match.group(1)

        match = re.search(r"id=([a-zA-Z0-9_-]+)", link)

        if match:
            return match.group(1)

    return None


def get_original_filename(file_id: str) -> str:
    """
    Attempts to retrieve the original filename of a file stored on Google Drive using its file ID.

    Responsibilities:
    - Make an HTTP request to Google Drive's download URL for the given file ID.
    - Parse the 'Content-Disposition' header to extract the original filename if present.
    - Return a fallback filename using the file ID if the original filename cannot be determined or an error occurs.

    Args:
        file_id (str): The unique identifier for the Google Drive file.

    Returns:
        str: The original filename if successfully extracted; otherwise, a filename based on the file ID with '.downloaded' suffix.

    Usage:
        Use this function to obtain the true file name before downloading, especially when saving the file locally with an appropriate name.

    Flow:
        1. Construct the Google Drive download URL using the file ID.
        2. Send a streaming GET request to this URL.
        3. Retrieve the 'Content-Disposition' header from the response.
        4. Use a regular expression to search for the filename parameter within the header.
        5. If a filename is found, return it; else, return a fallback filename with the file ID.
        6. Catch any exceptions during the process and return the fallback filename.

    Notes:
    - The function assumes network connectivity and relies on Google's response headers.
    - The fallback ensures that even if the filename cannot be determined, the file can be saved with a unique identifiable name.
    - No retries or advanced error handling are implemented; exceptions silently lead to returning the fallback filename.
    """
    try:
        url = f"https://drive.google.com/uc?id={file_id}&export=download"
        resp = requests.get(url, stream=True)
        disposition = resp.headers.get("Content-Disposition", "")
        match = re.search(r'filename="(.+?)"', disposition)
        return match.group(1) if match else f"{file_id}.downloaded"

    except Exception:
        return f"{file_id}.downloaded"


def download_drive_file(file_id: str, filename: str) -> Path:
    """
    Downloads a file from Google Drive using its file ID and saves it locally in the configured upload directory.

    Responsibilities:
    - Ensure the provided filename is safe to use as a local file name.
    - Create the local upload directory if it doesn't exist.
    - Use gdown to download the file from Google Drive's direct download URL.
    - Raise informative exceptions if the filename is unsafe or the download fails.
    - Return the path to the successfully downloaded file.

    Args:
        file_id (str): The unique identifier of the Google Drive file to download.
        filename (str): The desired local filename to save the downloaded file as.

    Returns:
        Path: The pathlib.Path object pointing to the downloaded file on disk.

    Raises:
        ValueError: If the provided filename appears unsafe (e.g., path traversal).
        RuntimeError: If the download fails or the resulting file is not found.

    Usage:
        Call this function internally during file upload flows when downloading
        a file from a provided Google Drive link before chunking and uploading.

    Flow:
        1. Sanitize the filename to prevent directory traversal or absolute path use.
        2. Ensure the upload directory (`UPLOAD_PATH`) exists on the filesystem.
        3. Construct the direct download URL using the given file ID.
        4. Use the `gdown` library to download the file to the resolved local path.
        5. Verify the download succeeded by checking the result and file existence.
        6. If successful, return the path to the downloaded file.
        7. Raise exceptions if any issues arise during these steps.

    Notes:
    - The function assumes network connectivity and Google Drive public link access.
    - The safety check on filenames prevents accidental or malicious filesystem writes outside the intended folder.
    - `gdown` handles Google Drive's download confirmation processes.
    - For production, consider adding retries, timeout handling, and logging for robustness.
    """
    # Basic safety: Prevent dangerous filenames/paths
    safe_filename = Path(filename).name

    if ".." in safe_filename or safe_filename.startswith("/"):
        raise ValueError("Unsafe filename detected.")

    UPLOAD_PATH.mkdir(exist_ok=True)
    output_path = UPLOAD_PATH / safe_filename
    url = f"https://drive.google.com/uc?id={file_id}"
    result = gdown.download(url, str(output_path), quiet=False)

    if result is None or not output_path.exists():
        raise RuntimeError(f"Download failed for file ID {file_id}")

    return output_path


def hash_data_sha256(data: bytes) -> str:
    """
    Computes the SHA-256 cryptographic hash of the provided byte data.

    Responsibilities:
    - Generate a fixed-size, unique hexadecimal string representation of the input bytes.
    - Ensure data integrity checks or deduplication by producing consistent hashes for identical inputs.

    Args:
        data (bytes): The input byte sequence to hash (e.g., file content or file chunk).

    Returns:
        str: The SHA-256 hash digest as a lowercase hexadecimal string.

    Usage:
        Call this function to obtain a unique hash identifier for file content chunks.
        Useful for indexing, integrity verification, and avoiding duplicate uploads.

    Flow:
        1. Accept the input bytes.
        2. Use Python’s hashlib library to compute the SHA-256 digest.
        3. Convert the digest to a hexadecimal string.
        4. Return the hash string.

    Notes:
    - The output is deterministic: the same input always yields the same hash.
    - SHA-256 produces a 64-character hexadecimal string.
    - This function does not perform any I/O or network operations.
    - Suitable for large files or data chunks processed as bytes.
    """
    return hashlib.sha256(data).hexdigest()


def get_file_chunks(user_id: str, filename: str) -> FileData:
    """
    Retrieves the list of file chunks associated with a specific user’s filename from the persistent drive database.

    Responsibilities:
    - Verify the existence of the specified user and filename in the drive database.
    - Return the metadata list containing the chunk hash and Discord message ID mappings.
    - Raise an appropriate error if the user or file is not found.

    Args:
        user_id (str): The Discord user ID as a string.
        filename (str): The exact (case-sensitive) filename to retrieve chunks for.

    Returns:
        FileData: A list of dictionaries, each mapping a chunk SHA-256 hash (str) to the Discord message ID (int) where the chunk is stored.

    Raises:
        FileNotFoundError: If the user ID or filename does not exist within the drive database.

    Usage:
        Call this function internally to validate and fetch chunk data for file download or deletion operations.

    Flow:
        1. Load the complete drive JSON mapping users to their files and chunks.
        2. Check if the given user ID exists in the database.
        3. Check if the filename exists for that user.
        4. If not found, raise FileNotFoundError.
        5. Return the list of chunk metadata (hash to message ID mappings) for the requested file.

    Notes:
    - Relies on the `load_json` utility to safely load the drive database.
    - The return structure aligns with how files are chunked and stored as Discord messages.
    - Ensures downstream commands operate only on valid files.
    """
    drive: Database = load_json(DRIVE)

    if user_id not in drive or filename not in drive[user_id]:
        raise FileNotFoundError(f"File `{filename}` not found for user {user_id}.")

    return drive[user_id][filename]
