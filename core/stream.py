"""Serve seekable HTTP byte ranges from files split across a remote data center."""

from __future__ import annotations

from asyncio import sleep, wait_for
from bisect import bisect_right
from dataclasses import dataclass
from re import Match, fullmatch
from typing import AsyncGenerator

from backend.database.models.file import File
from core.data_center import DataCenter
from core.utils_ import part_path


class Stream:
    """Map a requested byte range onto stored parts and yield the selected bytes."""

    @dataclass(frozen=True)
    class FileChunk:
        """Describe the inclusive byte offsets occupied by one remote file part."""

        flink: str
        start: int
        end: int

    @dataclass(frozen=True)
    class ByteRange:
        """Represent an inclusive byte range within the stored file."""

        start: int
        end: int

    @classmethod
    async def prepare(cls, file: File, range_header: str | None = None) -> "Stream":
        """Resolve the real stored byte length from the final storage part before building headers."""

        if not file.links:
            raise OSError("File has no stored data parts")

        provider: type[DataCenter] | None = DataCenter(file.data_center)

        if provider is None:
            raise ValueError(f"Unsupported data center: {file.data_center}")

        last_index = len(file.links) - 1
        cached_last = await DataCenter.get_cached_part(str(file.id), last_index)
        expected_last = None

        if cached_last is not None and 0 < len(cached_last) <= provider.MAX_SIZE:
            expected_last = cached_last

        else:
            for attempt in range(5):
                try:
                    candidate = await wait_for(provider.download(file.links[last_index]), timeout=120)

                    if not candidate or len(candidate) > provider.MAX_SIZE:
                        raise OSError(f"Final storage part has invalid size {len(candidate)} bytes "    f"(maximum {provider.MAX_SIZE})")

                    expected_last = candidate
                    await DataCenter.cache_part(str(file.id), last_index, candidate)
                    break

                except Exception as error:
                    last_error = error

                    if attempt == 4:
                        raise OSError("Could not verify the final storage part after 5 attempts") from last_error

                    await sleep(min(2 ** attempt, 16))

        actual_size = last_index * provider.MAX_SIZE + len(expected_last)

        if actual_size <= 0:
            raise ValueError("Cannot stream an empty file")

        if int(file.size) != actual_size:
            file.size = actual_size

            if file.id is not None:
                try:
                    await file.update()

                except Exception:
                    pass

        return cls(file, range_header)

    def __init__(self, file: File, range_header: str | None = None) -> None:
        """Build byte offsets from the verified size and parse an optional single HTTP byte range."""

        self.file: File = file

        if self.file.size <= 0:
            raise ValueError("Cannot stream an empty file")

        total_chunks: int = (self.file.size + DataCenter.MAX_SIZE - 1) // DataCenter.MAX_SIZE

        if len(self.file.links) != total_chunks:
            raise OSError(f"Verified size requires {total_chunks} chunks, but metadata contains {len(self.file.links)}")

        self.chunks: list[Stream.FileChunk] = [
            Stream.FileChunk(flink, index * DataCenter.MAX_SIZE, min((index + 1) * DataCenter.MAX_SIZE, self.file.size) - 1)
            for index, flink in enumerate(self.file.links)
        ]
        self._chunk_starts: list[int] = [chunk.start for chunk in self.chunks]

        if range_header is None:
            self.byte_range: Stream.ByteRange = Stream.ByteRange(0, self.file.size - 1)
            return

        match: Match[str] | None = fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())

        if match is None:
            raise ValueError("Invalid Range header")

        raw_start, raw_end = match.groups()
        start: int | None = int(raw_start) if raw_start else None
        end: int | None = int(raw_end) if raw_end else None

        if start is None:
            if end is None or end <= 0:
                raise ValueError("Invalid suffix range")

            self.byte_range = Stream.ByteRange(max(self.file.size - end, 0), self.file.size - 1)
            return

        if start >= self.file.size:
            raise ValueError("Range outside file")

        if end is not None and end < start:
            raise ValueError("Invalid range")

        range_end: int = self.file.size - 1 if end is None else min(end, self.file.size - 1)
        self.byte_range = Stream.ByteRange(start, range_end)

    async def stream(self) -> AsyncGenerator[bytes, None]:
        """Yield at most 1 MiB at a time for the validated byte range."""

        byte_range: Stream.ByteRange = self.byte_range
        index: int = bisect_right(self._chunk_starts, byte_range.start) - 1
        position: int = byte_range.start

        while position <= byte_range.end:
            chunk: Stream.FileChunk = self.chunks[index]
            data: bytes | None = await DataCenter.get_cached_part(str(self.file.id), index)
            expected_size: int = chunk.end - chunk.start + 1

            if data is not None and len(data) != expected_size:
                cache_path = part_path(DataCenter.CACHE_DIR, str(self.file.id), index)
                cache_path.unlink(missing_ok=True)
                await DataCenter.touch_cache(str(cache_path))
                data = None

            if data is None:
                data_center: type[DataCenter] | None = DataCenter(self.file.data_center)

                if data_center is None:
                    raise ValueError(f"Unsupported data center: {self.file.data_center}")

                last_error: Exception | None = None

                for attempt in range(5):
                    try:
                        candidate: bytes = await wait_for(data_center.download(chunk.flink), timeout=120)

                        if len(candidate) != expected_size:
                            raise OSError(
                                f"Remote chunk {chunk.flink} returned {len(candidate)} bytes; expected {expected_size}"
                            )

                        data = candidate
                        break

                    except Exception as error:
                        last_error = error
                        if attempt == 4:
                            raise OSError(
                                f"Could not retrieve storage chunk {index + 1}/{len(self.chunks)} after 5 attempts"
                            ) from last_error
                        await sleep(min(2 ** attempt, 16))

                if data is None:
                    raise OSError(f"Could not retrieve storage chunk {chunk.flink}") from last_error

                await DataCenter.cache_part(str(self.file.id), index, data)

            if len(data) != expected_size:
                raise OSError(f"Stored chunk {chunk.flink} has {len(data)} bytes; expected {expected_size}")

            local_start: int = position - chunk.start
            local_end: int = min(byte_range.end, chunk.end) - chunk.start
            remaining: int = local_end - local_start + 1

            while remaining > 0:
                size: int = min(1024 * 1024, remaining)
                part: bytes = data[local_start:local_start + size]
                if not part:
                    raise OSError(f"Chunk ended early: {chunk.flink}")

                yield part
                local_start += len(part)
                remaining -= len(part)

            position = chunk.end + 1
            index += 1
