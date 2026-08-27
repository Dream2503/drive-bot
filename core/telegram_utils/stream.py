from bisect import bisect_right
from dataclasses import dataclass
from typing import AsyncGenerator

from core.telegram_utils import Telegram


@dataclass(frozen=True)
class TelegramPart:
    message_id: int
    size: int
    start: int
    end: int


@dataclass(frozen=True)
class ByteRange:
    start: int
    end: int


def parse_range(value: str | None, size: int) -> ByteRange:
    if size <= 0:
        raise ValueError("Cannot stream an empty file")

    if value is None:
        return ByteRange(0, size - 1)

    if not value.startswith("bytes="):
        raise ValueError("Invalid Range header")

    value = value[6:]

    if "," in value:
        raise ValueError("Multiple ranges are not supported")

    start_text, end_text = value.split("-", 1)

    if not start_text:
        length = int(end_text)

        if length <= 0:
            raise ValueError("Invalid suffix range")

        return ByteRange(max(size - length, 0), size - 1)

    start = int(start_text)

    if start < 0 or start >= size:
        raise ValueError("Range outside file")

    end = size - 1 if not end_text else int(end_text)

    if end < start:
        raise ValueError("Invalid range")

    return ByteRange(start, min(end, size - 1))


def get_parts(flinks: list[str], file_size: int, max_size: int) -> list[TelegramPart]:
    if file_size <= 0:
        raise OSError("Invalid file size")

    total_parts: int = (file_size + max_size - 1) // max_size
    parts: list[TelegramPart] = []

    for index, flink in enumerate(flinks):
        if not flink.startswith("tg:"):
            raise OSError(f"Unsupported Telegram reference: {flink}")

        if index >= total_parts:
            raise OSError("More Telegram parts than expected")

        start: int = index * max_size
        size: int = min(max_size, file_size - start)
        parts.append(TelegramPart(message_id=int(flink[3:]), size=size, start=start, end=start + size - 1))

    if len(parts) != total_parts:
        raise OSError(f"Expected {total_parts} Telegram parts, got {len(parts)}")

    return parts


def find_part(parts: list[TelegramPart], position: int) -> int:
    starts = [part.start for part in parts]
    return bisect_right(starts, position) - 1


async def stream_range(parts: list[TelegramPart], byte_range: ByteRange) -> AsyncGenerator[bytes, None]:
    index: int = find_part(parts, byte_range.start)
    position: int = byte_range.start

    while position <= byte_range.end:
        part: TelegramPart = parts[index]
        local_start: int = position - part.start
        local_end: int = min(byte_range.end, part.end) - part.start
        message = await Telegram.app.get_messages(Telegram.FILE_DUMP_ID, part.message_id)

        if message is None or message.document is None:
            raise OSError(f"Telegram message {part.message_id} not found")

        remaining: int = local_end - local_start + 1
        skipped: int = 0

        async for chunk in Telegram.app.stream_media(message):
            if skipped < local_start:
                skip: int = min(len(chunk), local_start - skipped)
                skipped += skip
                chunk = chunk[skip:]

            if not chunk:
                continue

            if len(chunk) > remaining:
                chunk = chunk[:remaining]

            yield chunk

            remaining -= len(chunk)

            if remaining <= 0:
                break

        if remaining > 0:
            raise OSError(f"Telegram stream ended early for message {part.message_id}")

        position = part.end + 1
        index += 1
