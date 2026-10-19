"""Shared logging helpers for StoreLimitless core services."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.data_center import DataCenter


def write_log(level: str, data_center: type[DataCenter] | DataCenter, func: str, user: str, message: str) -> None:
    """Write and flush a timestamped, lock-protected application log record."""

    from core.config import LOG_HANDLER, LOCK

    timestamp: str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with LOCK:
        LOG_HANDLER.write(f"[{timestamp}] [{data_center.NAME}] [{level}] [{func}] [{user}] {message}\n")
        LOG_HANDLER.flush()
