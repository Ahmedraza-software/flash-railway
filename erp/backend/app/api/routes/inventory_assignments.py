"""API routes for lightweight inventory assignment persistence.

This mirrors the frontend's inventoryAssignments map in the database as a
single JSON blob, without introducing full inventory modelling yet.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.inventory_assignment import InventoryAssignmentState
from app.schemas.inventory_assignment import InventoryAssignmentsState


router = APIRouter(dependencies=[Depends(require_permission("inventory:view"))])


@router.get("/", response_model=InventoryAssignmentsState)
async def get_inventory_assignments(
    db: Session = Depends(get_db),
) -> InventoryAssignmentsState:
    """Return the current inventory assignments map.

    If no row exists yet, an empty map is returned.
    """

    state = db.query(InventoryAssignmentState).first()
    if not state:
        return InventoryAssignmentsState(data={})

    try:
        data = json.loads(state.data or "{}")
    except json.JSONDecodeError:
        data = {}

    return InventoryAssignmentsState(data=data)


@router.put("/", response_model=InventoryAssignmentsState)
async def upsert_inventory_assignments(
    payload: InventoryAssignmentsState,
    db: Session = Depends(get_db),
) -> InventoryAssignmentsState:
    """Replace the stored assignments map with the provided payload."""

    state = db.query(InventoryAssignmentState).first()

    if not state:
        state = InventoryAssignmentState(data=json.dumps(payload.data or {}))
        db.add(state)
    else:
        state.data = json.dumps(payload.data or {})

    db.commit()
    db.refresh(state)

    return InventoryAssignmentsState(data=payload.data or {})
