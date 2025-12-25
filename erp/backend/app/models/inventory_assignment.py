"""Inventory assignment state stored as a single JSON blob.

This is a lightweight persistence layer for the frontend's inventoryAssignments
map (item/employee quantities), so that the state survives server restarts and
browser refreshes.
"""

from sqlalchemy import Column, Integer, Text, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class InventoryAssignmentState(Base):
    """Stores all inventory assignment data as a JSON string.

    The frontend currently manages a dictionary structure like:

        {
            "EMP-001": [{"itemId": "INV-0001", "quantity": 4}, ...],
            "EMP-002": [...],
            ...
        }

    Instead of modeling this in a normalized way, we keep a single row
    with a JSON Text column to mirror the localStorage structure.
    """

    __tablename__ = "inventory_assignments_state"

    id = Column(Integer, primary_key=True, index=True)
    # JSON string for the entire assignments map
    data = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
