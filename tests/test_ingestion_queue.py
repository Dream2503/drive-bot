"""Tests for the Redis-backed global FIFO used by ingestion file uploads."""

from __future__ import annotations

import asyncio
from time import monotonic
import unittest
from unittest.mock import patch

from core.utils import ingestion_queue


class FakeRedis:
    """Small async Redis-script fake that preserves queue, ticket, and lease semantics."""

    def __init__(self) -> None:
        self.sequence = 0
        self.queue: dict[str, int] = {}
        self.tickets: dict[str, tuple[str, float]] = {}
        self.lock_owner: str | None = None
        self.lock_expires = 0.0

    def _alive_ticket(self, key: str) -> bool:
        ticket = self.tickets.get(key)
        if ticket is None:
            return False
        if ticket[1] <= monotonic():
            self.tickets.pop(key, None)
            return False
        return True

    async def eval(self, script: str, number_of_keys: int, *args: object) -> int:
        keys = [str(value) for value in args[:number_of_keys]]
        values = list(args[number_of_keys:])

        if "storelimitless-ingestion-enqueue" in script:
            queue_key, _sequence_key, ticket_key = keys
            ticket_id = str(values[0])
            ttl = int(values[1])
            self.sequence += 1
            self.tickets[ticket_key] = (ticket_id, monotonic() + ttl)
            self.queue[ticket_id] = self.sequence
            return self.sequence

        if "storelimitless-ingestion-renew-ticket" in script:
            key = keys[0]
            if not self._alive_ticket(key):
                return 0
            ticket_id, _ = self.tickets[key]
            self.tickets[key] = (ticket_id, monotonic() + int(values[0]))
            return 1

        if "storelimitless-ingestion-claim" in script:
            queue_key, _lock_key, own_ticket_key = keys
            ticket_id = str(values[0])
            lease_ms = int(values[1])
            ticket_prefix = str(values[2])

            while self.queue:
                head = min(self.queue, key=self.queue.get)
                if self._alive_ticket(ticket_prefix + head):
                    break
                self.queue.pop(head, None)

            if not self.queue:
                return -1
            if not self._alive_ticket(own_ticket_key):
                self.queue.pop(ticket_id, None)
                return -2
            if head != ticket_id:
                return 0
            if self.lock_owner is not None and self.lock_expires <= monotonic():
                self.lock_owner = None
            if self.lock_owner is not None:
                return 0

            self.lock_owner = ticket_id
            self.lock_expires = monotonic() + lease_ms / 1000
            self.queue.pop(ticket_id, None)
            self.tickets.pop(own_ticket_key, None)
            return 1

        if "storelimitless-ingestion-renew-lock" in script:
            lock_owner = str(values[0])
            lease_ms = int(values[1])
            if self.lock_owner != lock_owner or self.lock_expires <= monotonic():
                return 0
            self.lock_expires = monotonic() + lease_ms / 1000
            return 1

        if "storelimitless-ingestion-release-lock" in script:
            if self.lock_owner != str(values[0]):
                return 0
            self.lock_owner = None
            self.lock_expires = 0.0
            return 1

        if "storelimitless-ingestion-cancel-ticket" in script:
            queue_key, ticket_key = keys
            self.queue.pop(str(values[0]), None)
            self.tickets.pop(ticket_key, None)
            return 1

        raise AssertionError(f"Unrecognized Redis script: {script[:80]!r}")


class IngestionQueueTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.redis = FakeRedis()
        self.redis_patch = patch.object(ingestion_queue.Redis, "redis", self.redis)
        self.redis_patch.start()
        self.addCleanup(self.redis_patch.stop)

    async def test_concurrent_jobs_never_hold_two_upload_slots(self) -> None:
        tickets = [await ingestion_queue.enqueue_ingestion_upload() for _ in range(4)]
        active = 0
        max_active = 0
        started: list[str] = []

        async def upload(ticket: ingestion_queue.IngestionUploadTicket) -> None:
            nonlocal active, max_active
            async with ingestion_queue.ingestion_upload_slot(ticket):
                active += 1
                max_active = max(max_active, active)
                started.append(ticket.ticket_id)
                await asyncio.sleep(0.01)
                active -= 1

        await asyncio.gather(*(upload(ticket) for ticket in tickets))

        self.assertEqual(max_active, 1)
        self.assertEqual(started, [ticket.ticket_id for ticket in tickets])
        self.assertIsNone(self.redis.lock_owner)
        self.assertFalse(self.redis.queue)

    async def test_cancelled_waiter_is_removed_without_blocking_following_file(self) -> None:
        first = await ingestion_queue.enqueue_ingestion_upload()
        second = await ingestion_queue.enqueue_ingestion_upload()

        await ingestion_queue.cancel_ingestion_upload(first)

        async with ingestion_queue.ingestion_upload_slot(second):
            self.assertEqual(self.redis.lock_owner, second.ticket_id)

        self.assertIsNone(self.redis.lock_owner)
        self.assertFalse(self.redis.queue)

    async def test_failed_upload_releases_slot_for_next_job(self) -> None:
        first = await ingestion_queue.enqueue_ingestion_upload()
        second = await ingestion_queue.enqueue_ingestion_upload()

        with self.assertRaisesRegex(RuntimeError, "mock storage failure"):
            async with ingestion_queue.ingestion_upload_slot(first):
                raise RuntimeError("mock storage failure")

        async with ingestion_queue.ingestion_upload_slot(second):
            self.assertEqual(self.redis.lock_owner, second.ticket_id)

        self.assertIsNone(self.redis.lock_owner)


if __name__ == "__main__":
    unittest.main()
