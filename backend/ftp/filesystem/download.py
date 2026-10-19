"""Seekable, read-only file object that downloads byte ranges through the StoreLimitless stream API."""

from __future__ import annotations

import asyncio
from asyncio import AbstractEventLoop
from concurrent.futures import Future
from types import TracebackType
from typing import Any

from fastapi import Request
from fastapi.responses import Response, StreamingResponse

from backend.database.models.file import File
from backend.server.security import create_public_stream_token


class FTPDownloadFile:
    """Provide a seekable read-only file interface over the public byte-range streaming endpoint."""

    RANGE_CHUNK_SIZE: int = 1024 * 1024

    def __init__(self, file: File, event_loop: AbstractEventLoop) -> None:
        """Initialize the file position, signed stream token, application event loop, and read buffer."""

        self.file: File = file
        self.name: str = file.name
        self.mode: str = "rb"
        self.position: int = 0
        self.closed: bool = False
        self.token: str = create_public_stream_token(file=file, username=file.username)
        self.event_loop: AbstractEventLoop = event_loop
        self._buffer_start: int = 0
        self._buffer: bytes = b""

    async def _request_async(self, start: int, end: int) -> bytes:
        """Call the public stream route directly and collect its requested byte range."""

        from backend.server.routers import public_stream

        path: str = f"/public/stream/{self.token}"
        scope: dict[str, Any] = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": b"",
            "root_path": "",
            "headers": [(b"range", f"bytes={start}-{end}".encode("ascii"))],
            "client": ("127.0.0.1", 0),
            "server": ("127.0.0.1", 8000),
        }
        request: Request = Request(scope)
        response: Response = await public_stream(token=self.token, request=request)

        if response.status_code != 206:
            body: bytes = getattr(response, "body", b"")
            detail: str = body.decode("utf-8", errors="replace") or "The stream route did not return partial content."
            raise OSError(response.status_code, detail)

        content_range: str | None = response.headers.get("content-range")

        if content_range is None or not content_range.startswith(f"bytes {start}-"):
            raise OSError(f"The stream route returned an unexpected byte range: {content_range!r}")

        if isinstance(response, StreamingResponse):
            data: bytearray = bytearray()

            async for chunk in response.body_iterator:
                if isinstance(chunk, str):
                    data.extend(chunk.encode("utf-8"))
                else:
                    data.extend(chunk)

            result: bytes = bytes(data)

        else:
            result = response.body

        if not result:
            raise OSError(f"The stream route returned no data for bytes={start}-{end}.")

        return result[:end - start + 1]

    def _request(self, start: int, end: int) -> bytes:
        """Run the public stream route on the application's event loop for a byte range."""

        if self.closed:
            raise ValueError("I/O operation on closed file")

        future: Future[bytes] = asyncio.run_coroutine_threadsafe(
            self._request_async(start, end),
            self.event_loop,
        )
        return future.result()

    def _fill_buffer(self, start: int) -> None:
        """Fetch a bounded byte range starting at the current file position."""

        end: int = min(start + self.RANGE_CHUNK_SIZE, self.file.size) - 1

        if end < start:
            self._buffer_start = start
            self._buffer = b""
            return

        self._buffer_start = start
        self._buffer = self._request(start, end)

    def read(self, size: int = -1) -> bytes:
        """Read bytes from the current position, fetching ranges when needed."""

        if self.closed:
            raise ValueError("I/O operation on closed file")

        if self.position >= self.file.size:
            return b""

        if size < 0:
            size = self.file.size - self.position

        if size <= 0:
            return b""

        size = min(size, self.file.size - self.position)
        data: bytearray = bytearray()

        while len(data) < size:
            buffer_offset: int = self.position - self._buffer_start

            if 0 <= buffer_offset < len(self._buffer):
                available: int = len(self._buffer) - buffer_offset
                amount: int = min(available, size - len(data))
                data.extend(self._buffer[buffer_offset:buffer_offset + amount])
                self.position += amount
                continue

            self._fill_buffer(self.position)

        return bytes(data)

    def readinto(self, buffer: bytearray | memoryview) -> int:
        """Read bytes into a writable buffer and return the number of bytes copied."""

        data: bytes = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)

    def seek(self, offset: int, whence: int = 0) -> int:
        """Move the read position using the standard file seek modes."""

        if self.closed:
            raise ValueError("I/O operation on closed file")

        if whence == 0:
            position: int = offset

        elif whence == 1:
            position = self.position + offset

        elif whence == 2:
            position = self.file.size + offset

        else:
            raise ValueError("Invalid whence")

        if position < 0:
            raise ValueError("Invalid seek position")

        self.position = position
        return position

    def tell(self) -> int:
        """Return the current read position."""

        return self.position

    def readable(self) -> bool:
        """Report that the file supports reading."""

        return True

    def writable(self) -> bool:
        """Report that the file is read-only."""

        return False

    def seekable(self) -> bool:
        """Report that the file supports seeking."""

        return True

    def close(self) -> None:
        """Mark the file object as closed."""

        self.closed = True
        self._buffer = b""

    def fileno(self) -> int:
        """Report that this remote file object has no local file descriptor."""

        raise OSError("No file descriptor")

    def __enter__(self) -> FTPDownloadFile:
        """Return this file object for use in a context manager."""

        return self

    def __exit__(self, exc_type: type[BaseException] | None, exc_value: BaseException | None, traceback: TracebackType | None) -> None:
        """Close the file object when leaving a context manager."""

        self.close()

    def __repr__(self) -> str:
        """Return a concise representation of the file and its current position."""

        return f"<FTPDownloadFile {self.name!r} pos={self.position}/{self.file.size}>"
