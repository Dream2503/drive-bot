"""Tests for backend-owned transfer metrics persisted through Redis progress hashes."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.database.redis_server import Redis
from core.utils.progress import Progress


class FakeHashRedis:
    """Minimal hash store with Redis-compatible string coercion."""

    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, str]] = {}

    async def hgetall(self, key: str) -> dict[str, str]:
        return dict(self.hashes.get(key, {}))

    async def hset(self, key: str, mapping: dict[str, object]) -> int:
        target = self.hashes.setdefault(key, {})
        target.update({str(name): str(value) for name, value in mapping.items()})
        return len(mapping)


class BackendProgressMetricTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.redis = FakeHashRedis()
        self.redis_patch = patch.object(Redis, "redis", self.redis)
        self.redis_patch.start()
        self.addCleanup(self.redis_patch.stop)

    @staticmethod
    def progress(downloaded: int, uploaded: int) -> Progress:
        progress = Progress("Public folder", "Downloading files", 100)
        progress.transfer = uploaded
        progress.download_transfer = downloaded
        progress.download_total = 100
        progress.download_active = True
        progress.ingestion_type = "google_drive_folder"
        progress.torrent_items = [{"status": "uploading"}]
        return progress

    async def test_download_speed_upload_speed_and_eta_survive_redis_reload(self) -> None:
        first = self.progress(10, 5)
        second = self.progress(30, 20)

        with patch("backend.database.redis_server.monotonic", side_effect=[100.0, 101.0]):
            await Redis.set("progress:test", first)
            await Redis.set("progress:test", second)

        restored = await Redis.get("progress:test", "Progress")
        self.assertIsInstance(restored, Progress)
        self.assertAlmostEqual(restored.download_speed, 20.0)
        self.assertAlmostEqual(restored.upload_speed, 15.0)
        self.assertAlmostEqual(restored.download_eta or 0, 3.5)
        self.assertAlmostEqual(restored.upload_eta or 0, 80 / 15)
        self.assertEqual(restored.ingestion_type, "google_drive_folder")
        self.assertEqual(restored.file_counts.get("discovered"), 1)
        self.assertGreater(restored.last_updated_at, 0)

    async def test_stalled_transfer_speed_is_cleared_and_unknown_eta_is_none(self) -> None:
        first = self.progress(10, 5)
        second = self.progress(20, 10)
        stalled = self.progress(20, 10)
        stalled.download_total = 0
        stalled.total = 0

        with patch(
            "backend.database.redis_server.monotonic",
            side_effect=[100.0, 101.0, 106.0],
        ):
            await Redis.set("progress:stall", first)
            await Redis.set("progress:stall", second)
            await Redis.set("progress:stall", stalled)

        restored = await Redis.get("progress:stall", "Progress")
        self.assertEqual(restored.download_speed, 0.0)
        self.assertEqual(restored.upload_speed, 0.0)
        self.assertIsNone(restored.download_eta)
        self.assertIsNone(restored.upload_eta)


if __name__ == "__main__":
    unittest.main()
