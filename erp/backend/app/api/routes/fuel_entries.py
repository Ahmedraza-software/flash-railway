from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.fuel_entry import FuelEntry
from app.models.vehicle import Vehicle
from app.schemas.fuel_entry import (
    FuelEntryCreate,
    FuelEntryResponse,
    FuelEntryUpdate,
    FuelMileageSummary,
    FuelMileageTip,
)


router = APIRouter(dependencies=[Depends(require_permission("fleet:view"))])


def _normalize_cost(payload: FuelEntryCreate | FuelEntryUpdate) -> None:
    liters = getattr(payload, "liters", None)
    ppl = getattr(payload, "price_per_liter", None)
    total = getattr(payload, "total_cost", None)

    if total is None and liters is not None and ppl is not None:
        try:
            payload.total_cost = float(liters) * float(ppl)  # type: ignore[attr-defined]
        except Exception:
            pass


@router.post("/", response_model=FuelEntryResponse)
async def create_fuel_entry(payload: FuelEntryCreate, db: Session = Depends(get_db)) -> FuelEntryResponse:
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == payload.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=400, detail="Vehicle not found")

    if payload.liters <= 0:
        raise HTTPException(status_code=400, detail="Liters must be greater than 0")

    _normalize_cost(payload)

    rec = FuelEntry(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/", response_model=List[FuelEntryResponse])
async def list_fuel_entries(
    db: Session = Depends(get_db),
    vehicle_id: Optional[str] = None,
    from_date: Optional[date_type] = Query(default=None),
    to_date: Optional[date_type] = Query(default=None),
    limit: int = 500,
) -> List[FuelEntryResponse]:
    q = db.query(FuelEntry)
    if vehicle_id:
        q = q.filter(FuelEntry.vehicle_id == vehicle_id)
    if from_date:
        q = q.filter(FuelEntry.entry_date >= from_date)
    if to_date:
        q = q.filter(FuelEntry.entry_date <= to_date)

    return q.order_by(FuelEntry.entry_date.desc(), FuelEntry.id.desc()).limit(limit).all()


@router.get("/{entry_id:int}", response_model=FuelEntryResponse)
async def get_fuel_entry(entry_id: int, db: Session = Depends(get_db)) -> FuelEntryResponse:
    rec = db.query(FuelEntry).filter(FuelEntry.id == entry_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Fuel entry not found")
    return rec


@router.put("/{entry_id:int}", response_model=FuelEntryResponse)
async def update_fuel_entry(entry_id: int, payload: FuelEntryUpdate, db: Session = Depends(get_db)) -> FuelEntryResponse:
    rec = db.query(FuelEntry).filter(FuelEntry.id == entry_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Fuel entry not found")

    if payload.vehicle_id:
        vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == payload.vehicle_id).first()
        if not vehicle:
            raise HTTPException(status_code=400, detail="Vehicle not found")

    _normalize_cost(payload)

    update_data = payload.model_dump(exclude_unset=True)
    if "liters" in update_data and update_data["liters"] is not None and float(update_data["liters"]) <= 0:
        raise HTTPException(status_code=400, detail="Liters must be greater than 0")

    for k, v in update_data.items():
        setattr(rec, k, v)

    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/{entry_id:int}")
async def delete_fuel_entry(entry_id: int, db: Session = Depends(get_db)) -> dict:
    rec = db.query(FuelEntry).filter(FuelEntry.id == entry_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Fuel entry not found")

    db.delete(rec)
    db.commit()
    return {"message": "Fuel entry deleted"}


@router.get("/summary", response_model=FuelMileageSummary)
async def fuel_mileage_summary(
    db: Session = Depends(get_db),
    vehicle_id: Optional[str] = None,
    from_date: Optional[date_type] = Query(default=None),
    to_date: Optional[date_type] = Query(default=None),
) -> FuelMileageSummary:
    q = db.query(FuelEntry)
    if vehicle_id:
        q = q.filter(FuelEntry.vehicle_id == vehicle_id)
    if from_date:
        q = q.filter(FuelEntry.entry_date >= from_date)
    if to_date:
        q = q.filter(FuelEntry.entry_date <= to_date)

    entries: List[FuelEntry] = q.order_by(FuelEntry.vehicle_id.asc(), FuelEntry.entry_date.asc(), FuelEntry.id.asc()).all()

    tips: List[FuelMileageTip] = []
    if not entries:
        tips.append(FuelMileageTip(level="info", title="No data", detail="Add fuel entries to see analytics."))
        return FuelMileageSummary(
            vehicle_id=vehicle_id,
            from_date=from_date,
            to_date=to_date,
            entries=0,
            total_liters=0.0,
            total_cost=0.0,
            tips=tips,
        )

    total_liters = sum(float(e.liters or 0) for e in entries)
    total_cost = sum(float(e.total_cost or 0) for e in entries)

    start_odo: Optional[int] = None
    end_odo: Optional[int] = None
    distance_km: Optional[float] = None

    # Only compute distance-based metrics when a single vehicle is requested.
    if vehicle_id:
        odo_values = [e.odometer_km for e in entries if e.odometer_km is not None]
        start_odo = odo_values[0] if odo_values else None
        end_odo = odo_values[-1] if odo_values else None
        if start_odo is not None and end_odo is not None and end_odo >= start_odo:
            distance_km = float(end_odo - start_odo)
    else:
        tips.append(
            FuelMileageTip(
                level="info",
                title="Select a vehicle for mileage",
                detail="Distance, km/L and cost per km are calculated per-vehicle using odometer readings. Select a specific vehicle to see these metrics.",
            )
        )

    avg_km_per_liter: Optional[float] = None
    if distance_km is not None and total_liters > 0:
        avg_km_per_liter = distance_km / total_liters

    avg_cost_per_km: Optional[float] = None
    if distance_km is not None and distance_km > 0:
        avg_cost_per_km = total_cost / distance_km

    if vehicle_id and any(e.odometer_km is None for e in entries):
        tips.append(
            FuelMileageTip(
                level="warning",
                title="Missing odometer readings",
                detail="Some entries are missing odometer (km). Add it to improve mileage and cost per km accuracy.",
            )
        )

    if total_cost == 0:
        tips.append(
            FuelMileageTip(
                level="info",
                title="Missing costs",
                detail="Total cost is 0. Add price per liter or total cost to track cost controls.",
            )
        )

    if avg_km_per_liter is not None:
        if avg_km_per_liter < 6:
            tips.append(
                FuelMileageTip(
                    level="warning",
                    title="Low fuel efficiency",
                    detail=f"Average fuel efficiency is {avg_km_per_liter:.2f} km/L. Check tire pressure, idling time, and route planning.",
                )
            )
        elif avg_km_per_liter >= 10:
            tips.append(
                FuelMileageTip(
                    level="success",
                    title="Good fuel efficiency",
                    detail=f"Average fuel efficiency is {avg_km_per_liter:.2f} km/L. Keep preventive maintenance and smooth driving habits.",
                )
            )

    if avg_cost_per_km is not None and avg_cost_per_km > 0:
        if avg_cost_per_km > 60:
            tips.append(
                FuelMileageTip(
                    level="warning",
                    title="High cost per km",
                    detail=f"Average cost is Rs {avg_cost_per_km:.2f} per km. Review fuel prices, route planning, and vehicle utilization.",
                )
            )
        else:
            tips.append(
                FuelMileageTip(
                    level="info",
                    title="Cost per km",
                    detail=f"Average cost is Rs {avg_cost_per_km:.2f} per km.",
                )
            )

    # Detect suspicious jumps (simple heuristic)
    last_by_vehicle: dict[str, FuelEntry] = {}
    for e in entries:
        prev = last_by_vehicle.get(e.vehicle_id)
        last_by_vehicle[e.vehicle_id] = e
        if not prev:
            continue
        if prev.odometer_km is None or e.odometer_km is None:
            continue
        if e.odometer_km < prev.odometer_km:
            tips.append(
                FuelMileageTip(
                    level="warning",
                    title="Odometer decreased",
                    detail=f"Vehicle {e.vehicle_id} has an odometer drop between entries. Please verify readings.",
                )
            )
            continue
        delta_km = e.odometer_km - prev.odometer_km
        if delta_km > 0 and e.liters > 0:
            km_per_l = delta_km / float(e.liters)
            if km_per_l < 4:
                tips.append(
                    FuelMileageTip(
                        level="warning",
                        title="Possible fuel spike",
                        detail=f"Vehicle {e.vehicle_id} shows {km_per_l:.2f} km/L on {e.entry_date.isoformat()}. Consider checking for leaks, idling, or route issues.",
                    )
                )

    return FuelMileageSummary(
        vehicle_id=vehicle_id,
        from_date=from_date,
        to_date=to_date,
        entries=len(entries),
        total_liters=float(total_liters),
        total_cost=float(total_cost),
        start_odometer_km=start_odo,
        end_odometer_km=end_odo,
        distance_km=distance_km,
        avg_km_per_liter=avg_km_per_liter,
        avg_cost_per_km=avg_cost_per_km,
        tips=tips,
    )
