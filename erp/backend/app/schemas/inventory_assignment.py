"""Schemas for lightweight inventory assignment persistence.

These mirror the structure used by the frontend's inventoryAssignments map.
"""

from typing import Dict, List

from pydantic import BaseModel


class InventoryAssignmentEntry(BaseModel):
    itemId: str
    quantity: int


# Map of employeeId -> list of {itemId, quantity}
InventoryAssignmentsMap = Dict[str, List[InventoryAssignmentEntry]]


class InventoryAssignmentsState(BaseModel):
    data: InventoryAssignmentsMap

    class Config:
        from_attributes = True
