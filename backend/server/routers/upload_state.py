"""Redis-backed upload coordination and account-scoped upload job registry."""

from __future__ import annotations

from asyncio import Task, gather, sleep
from pathlib import Path
from time import time
from typing import Any, cast

from fastapi import HTTPException

from backend.database.models import File
from backend.database.redis_server import Redis
from core.transfer import file_upload
from core.utils.progress import Progress

BACKGROUND_UPLOAD_TASKS: set[Task[None]] = set()
UPLOAD_JOB_TASKS: dict[str, Task[None]] = {}


def pending_upload_key(job_id: str) -> str:
    """Build the Redis key for an upload awaiting its first chunk."""

    return f"upload:pending:{job_id}"


def upload_session_key(job_id: str) -> str:
    """Build the Redis key for an active chunk upload session."""

    return f"upload:session:{job_id}"


def upload_job_key(job_id: str) -> str:
    """Build the Redis key containing ownership and display metadata for a job."""

    return f"upload:job:{job_id}"


def user_upload_jobs_key(username: str) -> str:
    """Build the Redis set key indexing upload jobs by account username."""

    return f"upload:user:{username}:jobs"


async def register_upload_job(job_id: str, *, username: str, name: str, kind: str, directory: str, data_center: str, total: int = 0) -> None:
    """Persist account ownership and display metadata so any signed-in device can find a job."""

    metadata: dict[str, Any] = {
        "job_id": job_id,
        "username": username,
        "name": name,
        "kind": kind,
        "directory": directory,
        "data_center": data_center,
        "total": max(0, int(total)),
        "created_at": time(),
        "cancelled": False,
    }
    await Redis.set_json(upload_job_key(job_id), metadata)
    await Redis.redis.sadd(user_upload_jobs_key(username), job_id)


async def get_upload_job_metadata(job_id: str) -> dict[str, Any] | None:
    """Return persisted metadata for a job, if it still exists."""

    value: Any = await Redis.get_json(upload_job_key(job_id))
    return value if isinstance(value, dict) else None


async def list_user_upload_jobs(username: str) -> list[dict[str, Any]]:
    """Return this user's upload jobs with current Redis-backed progress values."""

    index_key: str = user_upload_jobs_key(username)
    raw_job_ids: set[str] = await Redis.redis.smembers(index_key)
    jobs: list[dict[str, Any]] = []

    for raw_job_id in raw_job_ids:
        job_id: str = str(raw_job_id)
        metadata: dict[str, Any] | None = await get_upload_job_metadata(job_id)

        if metadata is None or metadata.get("username") != username:
            await Redis.redis.srem(index_key, job_id)
            continue

        try:
            progress: Progress = cast(Progress, await Redis.get(job_id, "Progress"))

        except KeyError:
            await Redis.redis.srem(index_key, job_id)
            await Redis.delete_key(upload_job_key(job_id))
            continue

        message: str = str(progress.message or "")
        lowered: str = message.lower()

        if bool(metadata.get("cancelled")) or lowered.startswith("upload cancelled"):
            status: str = "cancelled"

        elif "complete" in lowered:
            status = "completed"

        elif bool(metadata.get("failed")) or lowered.startswith("upload failed"):
            status = "error"

        else:
            status = "uploading"

        progress_name: str = str(progress.name or "").strip()

        if progress_name in {"", "link", "update_name_from_backend"}:
            progress_name = str(metadata.get("name") or "Upload")

        total: int = max(int(progress.total or 0), int(metadata.get("total") or 0))
        transfer: int = max(0, int(progress.transfer or 0))
        jobs.append({
            "job_id": job_id,
            "name": progress_name,
            "kind": str(metadata.get("kind") or "link"),
            "directory": str(metadata.get("directory") or "/home"),
            "data_center": str(metadata.get("data_center") or ""),
            "status": status,
            "message": message or "Uploading",
            "transfer": transfer,
            "total": total,
            "created_at": int(float(metadata.get("created_at") or 0) * 1000),
        })

    jobs.sort(key=lambda item: item["created_at"], reverse=True)
    return jobs


def track_upload_task(task: Task[None], job_id: str | None = None) -> None:
    """Keep a background task referenced and optionally index it for account-scoped cancellation."""

    BACKGROUND_UPLOAD_TASKS.add(task)

    if job_id:
        UPLOAD_JOB_TASKS[job_id] = task

    def discard(done_task: Task[None]) -> None:
        BACKGROUND_UPLOAD_TASKS.discard(done_task)

        if job_id and UPLOAD_JOB_TASKS.get(job_id) is done_task:
            UPLOAD_JOB_TASKS.pop(job_id, None)

    task.add_done_callback(discard)


def cancel_upload_task(job_id: str) -> bool:
    """Cancel a tracked server-side import or chunk-processing task when it is running."""

    task: Task[None] | None = UPLOAD_JOB_TASKS.get(job_id)

    if task is None or task.done():
        return False

    task.cancel()
    return True


async def wait_for_all_chunks(job_id: str, file: File) -> None:
    """Wait on Redis-backed contiguous-byte metadata rather than an in-memory Event."""

    while True:
        job_metadata: dict[str, Any] | None = await get_upload_job_metadata(job_id)

        if job_metadata and bool(job_metadata.get("cancelled")):
            raise RuntimeError("Upload cancelled")

        if job_metadata and bool(job_metadata.get("failed")):
            raise RuntimeError("Upload failed: browser transfer stopped")

        state: Any = await Redis.get_json(upload_session_key(job_id))

        if not isinstance(state, dict):
            raise TimeoutError("Upload session expired before all chunks arrived")

        contiguous: int = int(state.get("contiguous", 0))
        total: int = int(state.get("total", 0))
        file.size = contiguous

        if bool(state.get("received_chunk")) and contiguous >= total:
            return

        last_activity: float = float(state.get("last_activity", 0))

        if time() - last_activity > 120:
            raise TimeoutError("No data received from the browser")

        await sleep(0.25)


async def record_written_range(job_id: str, start: int, end: int) -> int:
    """Merge a completed chunk range atomically in Redis and return contiguous bytes."""

    session_key: str = upload_session_key(job_id)
    lock: Any = Redis.redis.lock(f"upload:lock:{job_id}", timeout=30, blocking_timeout=30)

    async with lock:
        state: Any = await Redis.get_json(session_key)

        if not isinstance(state, dict):
            raise HTTPException(status_code=404, detail="Upload session expired")

        ranges_raw: Any = state.get("ranges", [])
        ranges: list[list[int]] = [[int(item[0]), int(item[1])] for item in ranges_raw if isinstance(item, (list, tuple)) and len(item) == 2]

        if end > start:
            ranges.append([start, end])
            ranges.sort(key=lambda item: item[0])

        merged: list[list[int]] = []

        for range_start, range_end in ranges:
            if merged and range_start <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], range_end)

            else:
                merged.append([range_start, range_end])

        contiguous: int = merged[0][1] if merged and merged[0][0] == 0 else 0
        state["ranges"] = merged
        state["contiguous"] = contiguous
        state["last_activity"] = time()
        state["received_chunk"] = True
        file_state: Any = state.get("file")

        if isinstance(file_state, dict):
            file_state["size"] = contiguous

        await Redis.set_json(session_key, state, ex=60 * 60)
        return contiguous


async def run_chunk_upload_job(job_id: str, file: File, file_path: Path, producer_task: Task[None]) -> None:
    """Stream received chunks to the data center and clean up Redis session state."""

    try:
        async for progress in file_upload(file, file_path, producer_task):
            await Redis.set(job_id, progress)

        if producer_task.done() and not producer_task.cancelled():
            producer_error: BaseException | None = producer_task.exception()

            if producer_error is not None:
                metadata: dict[str, Any] | None = await get_upload_job_metadata(job_id)

                if not (metadata and metadata.get("failed")):
                    message: str = "Upload cancelled" if metadata and metadata.get("cancelled") else f"Upload failed: {producer_error}"
                    await Redis.set(job_id, Progress(file.name, message, 0))

    except Exception as error:
        metadata = await get_upload_job_metadata(job_id)

        if not (metadata and metadata.get("failed")):
            message = "Upload cancelled" if metadata and metadata.get("cancelled") else f"Upload failed: {error}"
            await Redis.set(job_id, Progress(file.name, message, 0))

    finally:
        if not producer_task.done():
            producer_task.cancel()

        await gather(producer_task, return_exceptions=True)
        await Redis.delete_key(upload_session_key(job_id))
        await Redis.delete_key(pending_upload_key(job_id))
        file_path.unlink(missing_ok=True)

        try:
            file_path.parent.rmdir()

        except OSError:
            pass
