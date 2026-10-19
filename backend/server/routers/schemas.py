"""Request schemas used by file and directory management routes."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class MoveItemRequest(BaseModel):
    """Identify a single file or folder in a move request."""
    type: Literal["file", "folder"]
    id: int


class BulkMoveRequest(BaseModel):
    """Describe a request to move multiple items to one directory."""
    directory: str
    items: list[MoveItemRequest]
