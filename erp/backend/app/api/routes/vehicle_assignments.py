"""Vehicle assignment API routes."""

from datetime import date, datetime
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.vehicle import Vehicle
from app.models.employee import Employee
from app.models.vehicle_assignment import VehicleAssignment
from app.schemas.vehicle_assignment import (
    VehicleAssignmentCreate,
    VehicleAssignmentUpdate,
    VehicleAssignmentResponse,
)
from app.schemas.vehicle_assignment_analytics import (
    VehicleAssignmentAggRow,
    VehicleAssignmentAnalyticsResponse,
)
from app.schemas.vehicle_assignment_efficiency import (
    AssignmentEfficiencyRow,
    EmployeeEfficiencySummaryRow,
    VehicleAssignmentEfficiencyResponse,
    VehicleEfficiencySummaryRow,
    EfficiencyAlertRow,
)


router = APIRouter(dependencies=[Depends(require_permission("fleet:view"))])


def _serialize_assignment(assignment: VehicleAssignment) -> VehicleAssignmentResponse:
    """Convert a VehicleAssignment ORM object into a response schema."""

    try:
        employee_ids = json.loads(assignment.employee_ids or "[]")
    except json.JSONDecodeError:
        employee_ids = []

    try:
        route_stops = json.loads(assignment.route_stops or "null")
        if not isinstance(route_stops, list):
            route_stops = None
        else:
            route_stops = [str(s) for s in route_stops if str(s).strip()]
            if len(route_stops) < 2:
                route_stops = None
    except json.JSONDecodeError:
        route_stops = None

    return VehicleAssignmentResponse(
        id=assignment.id,
        vehicle_id=assignment.vehicle_id,
        employee_ids=employee_ids,
        route_stops=route_stops,
        route_from=assignment.route_from,
        route_to=assignment.route_to,
        assignment_date=assignment.assignment_date,
        notes=assignment.notes,
        status=assignment.status or "Incomplete",
        distance_km=assignment.distance_km,
        rate_per_km=assignment.rate_per_km,
        amount=assignment.amount,
        start_time=assignment.start_time,
        end_time=assignment.end_time,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
    )


def _normalize_stops(stops: List[str] | None) -> List[str] | None:
    if not stops:
        return None
    cleaned = [str(s).strip() for s in stops if str(s).strip()]
    if len(cleaned) < 2:
        return None
    return cleaned


def _resolve_route(payload: VehicleAssignmentCreate | VehicleAssignmentUpdate) -> tuple[List[str] | None, str, str]:
    stops = None
    if hasattr(payload, "route_stops"):
        stops = _normalize_stops(getattr(payload, "route_stops"))

    if stops:
        return stops, stops[0], stops[-1]

    route_from = getattr(payload, "route_from", None)
    route_to = getattr(payload, "route_to", None)
    if route_from is None or route_to is None:
        raise HTTPException(status_code=400, detail="Route must include at least 2 stops or route_from and route_to")
    rf = str(route_from).strip()
    rt = str(route_to).strip()
    if not rf or not rt:
        raise HTTPException(status_code=400, detail="route_from and route_to are required")
    return None, rf, rt


@router.post("/", response_model=VehicleAssignmentResponse)
async def create_assignment(
    payload: VehicleAssignmentCreate,
    db: Session = Depends(get_db),
) -> VehicleAssignmentResponse:
    """Create a new vehicle assignment entry."""

    # Ensure vehicle exists
    vehicle = (
        db.query(Vehicle)
        .filter(Vehicle.vehicle_id == payload.vehicle_id)
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=400, detail="Vehicle not found")

    # Optional: ensure all employees exist
    if payload.employee_ids:
        missing = (
            set(payload.employee_ids)
            - {
                e.employee_id
                for e in db.query(Employee)
                .filter(Employee.employee_id.in_(payload.employee_ids))
                .all()
            }
        )
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown employee IDs: {', '.join(sorted(missing))}",
            )

    route_stops, route_from, route_to = _resolve_route(payload)

    db_assignment = VehicleAssignment(
        vehicle_id=payload.vehicle_id,
        employee_ids=json.dumps(payload.employee_ids or []),
        route_stops=json.dumps(route_stops) if route_stops else None,
        route_from=route_from,
        route_to=route_to,
        assignment_date=payload.assignment_date or date.today(),
        status="Incomplete",
        notes=payload.notes,
    )

    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)

    return _serialize_assignment(db_assignment)


@router.get("/", response_model=List[VehicleAssignmentResponse])
async def list_assignments(
    db: Session = Depends(get_db),
    vehicle_id: Optional[str] = Query(default=None),
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=1000),
) -> List[VehicleAssignmentResponse]:
    """Return vehicle assignments.

    Optional filters are provided for analytics/drill-down pages.
    """

    q = db.query(VehicleAssignment)
    if vehicle_id:
        q = q.filter(VehicleAssignment.vehicle_id == vehicle_id)
    if status:
        q = q.filter(VehicleAssignment.status == status)
    if from_date:
        q = q.filter(VehicleAssignment.assignment_date >= from_date)
    if to_date:
        q = q.filter(VehicleAssignment.assignment_date <= to_date)

    assignments = q.order_by(VehicleAssignment.assignment_date.desc(), VehicleAssignment.id.desc()).limit(limit).all()
    return [_serialize_assignment(a) for a in assignments]


@router.get("/analytics", response_model=VehicleAssignmentAnalyticsResponse)
async def assignment_analytics(
    db: Session = Depends(get_db),
    period: str = Query(default="day"),
    day: Optional[date] = Query(default=None),
    month: Optional[str] = Query(default=None),
    year: Optional[int] = Query(default=None),
    vehicle_id: Optional[str] = Query(default=None),
) -> VehicleAssignmentAnalyticsResponse:
    p = str(period or "day").strip().lower()
    if p not in {"today", "day", "month", "year"}:
        raise HTTPException(status_code=400, detail="Invalid period. Use today|day|month|year")

    if p == "today":
        day_val = date.today()
        month_val = None
        year_val = None
    elif p == "day":
        day_val = day or date.today()
        month_val = None
        year_val = None
    elif p == "month":
        if not month:
            month_val = date.today().strftime("%Y-%m")
        else:
            month_val = month
        day_val = None
        year_val = None
        try:
            y_s, m_s = month_val.split("-", 1)
            y_i = int(y_s)
            m_i = int(m_s)
            if not (1 <= m_i <= 12):
                raise ValueError("month out of range")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid month. Use YYYY-MM")
    else:
        year_val = year or date.today().year
        day_val = None
        month_val = None

    q = db.query(VehicleAssignment).filter(VehicleAssignment.status == "Complete")
    q = q.filter(VehicleAssignment.distance_km.isnot(None))

    if vehicle_id:
        q = q.filter(VehicleAssignment.vehicle_id == vehicle_id)

    if day_val is not None:
        q = q.filter(VehicleAssignment.assignment_date == day_val)
    elif month_val is not None:
        y_s, m_s = month_val.split("-", 1)
        y_i = int(y_s)
        m_i = int(m_s)
        start = date(y_i, m_i, 1)
        end = date(y_i + 1, 1, 1) if m_i == 12 else date(y_i, m_i + 1, 1)
        q = q.filter(VehicleAssignment.assignment_date >= start)
        q = q.filter(VehicleAssignment.assignment_date < end)
    elif year_val is not None:
        start = date(year_val, 1, 1)
        end = date(year_val + 1, 1, 1)
        q = q.filter(VehicleAssignment.assignment_date >= start)
        q = q.filter(VehicleAssignment.assignment_date < end)

    rows_raw = q.order_by(VehicleAssignment.vehicle_id.asc(), VehicleAssignment.assignment_date.asc()).all()

    by_vehicle: dict[str, VehicleAssignmentAggRow] = {}
    for a in rows_raw:
        vid = a.vehicle_id
        km = float(a.distance_km or 0)
        amount = float(a.amount or 0)
        rate = float(a.rate_per_km) if a.rate_per_km is not None else (amount / km if km > 0 else None)

        agg = by_vehicle.get(vid)
        if not agg:
            agg = VehicleAssignmentAggRow(
                vehicle_id=vid,
                assignments=0,
                total_km=0.0,
                total_amount=0.0,
                avg_rate_per_km=None,
                cost_per_km=None,
            )
            by_vehicle[vid] = agg

        agg.assignments += 1
        agg.total_km += km
        agg.total_amount += amount

        if agg.total_km > 0:
            agg.cost_per_km = agg.total_amount / agg.total_km

        if rate is not None and rate >= 0:
            if agg.avg_rate_per_km is None:
                agg.avg_rate_per_km = rate
            else:
                agg.avg_rate_per_km = (agg.avg_rate_per_km * (agg.assignments - 1) + rate) / agg.assignments

    rows = sorted(by_vehicle.values(), key=lambda r: (r.vehicle_id))

    scored = [r for r in rows if r.cost_per_km is not None and r.total_km > 0]
    best = sorted(scored, key=lambda r: r.cost_per_km or 0)[:5]
    worst = sorted(scored, key=lambda r: r.cost_per_km or 0, reverse=True)[:5]

    return VehicleAssignmentAnalyticsResponse(
        period=p,
        date=day_val,
        month=month_val,
        year=year_val,
        vehicle_id=vehicle_id,
        rows=rows,
        best_cost_per_km=best,
        worst_cost_per_km=worst,
    )


@router.get("/efficiency", response_model=VehicleAssignmentEfficiencyResponse)
async def assignment_efficiency(
    db: Session = Depends(get_db),
    period: str = Query(default="day"),
    day: Optional[date] = Query(default=None),
    month: Optional[str] = Query(default=None),
    year: Optional[int] = Query(default=None),
    vehicle_id: Optional[str] = Query(default=None),
    outlier_limit: int = Query(default=20),
) -> VehicleAssignmentEfficiencyResponse:
    p = str(period or "day").strip().lower()
    if p not in {"today", "day", "month", "year"}:
        raise HTTPException(status_code=400, detail="Invalid period. Use today|day|month|year")

    if p == "today":
        day_val = date.today()
        month_val = None
        year_val = None
    elif p == "day":
        day_val = day or date.today()
        month_val = None
        year_val = None
    elif p == "month":
        if not month:
            month_val = date.today().strftime("%Y-%m")
        else:
            month_val = month
        day_val = None
        year_val = None
        try:
            y_s, m_s = month_val.split("-", 1)
            y_i = int(y_s)
            m_i = int(m_s)
            if not (1 <= m_i <= 12):
                raise ValueError("month out of range")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid month. Use YYYY-MM")
    else:
        year_val = year or date.today().year
        day_val = None
        month_val = None

    if outlier_limit < 1:
        outlier_limit = 1
    if outlier_limit > 200:
        outlier_limit = 200

    q = db.query(VehicleAssignment).filter(VehicleAssignment.status == "Complete")
    q = q.filter(VehicleAssignment.distance_km.isnot(None))

    if vehicle_id:
        q = q.filter(VehicleAssignment.vehicle_id == vehicle_id)

    if day_val is not None:
        q = q.filter(VehicleAssignment.assignment_date == day_val)
    elif month_val is not None:
        y_s, m_s = month_val.split("-", 1)
        y_i = int(y_s)
        m_i = int(m_s)
        start = date(y_i, m_i, 1)
        end = date(y_i + 1, 1, 1) if m_i == 12 else date(y_i, m_i + 1, 1)
        q = q.filter(VehicleAssignment.assignment_date >= start)
        q = q.filter(VehicleAssignment.assignment_date < end)
    elif year_val is not None:
        start = date(year_val, 1, 1)
        end = date(year_val + 1, 1, 1)
        q = q.filter(VehicleAssignment.assignment_date >= start)
        q = q.filter(VehicleAssignment.assignment_date < end)

    rows_raw = q.order_by(VehicleAssignment.assignment_date.desc(), VehicleAssignment.id.desc()).all()

    # Per vehicle baseline
    v_sum: dict[str, VehicleEfficiencySummaryRow] = {}
    for a in rows_raw:
        vid = a.vehicle_id
        km = float(a.distance_km or 0)
        amount = float(a.amount or 0)
        if km <= 0:
            continue
        cost_per_km = amount / km

        s = v_sum.get(vid)
        if not s:
            s = VehicleEfficiencySummaryRow(
                vehicle_id=vid,
                assignments=0,
                total_km=0.0,
                total_amount=0.0,
                avg_cost_per_km=None,
                min_cost_per_km=None,
                max_cost_per_km=None,
            )
            v_sum[vid] = s

        s.assignments += 1
        s.total_km += km
        s.total_amount += amount
        if s.assignments > 0:
            s.avg_km_per_trip = s.total_km / float(s.assignments)
        s.min_cost_per_km = cost_per_km if s.min_cost_per_km is None else min(s.min_cost_per_km, cost_per_km)
        s.max_cost_per_km = cost_per_km if s.max_cost_per_km is None else max(s.max_cost_per_km, cost_per_km)
        if s.total_km > 0:
            s.avg_cost_per_km = s.total_amount / s.total_km

    # Per assignment rows (cost/km vs its vehicle average)
    per_assignment: list[AssignmentEfficiencyRow] = []
    for a in rows_raw:
        km = float(a.distance_km or 0)
        amount = float(a.amount or 0)
        if km <= 0:
            continue
        rate = float(a.rate_per_km) if a.rate_per_km is not None else (amount / km)
        cost_per_km = amount / km

        base = v_sum.get(a.vehicle_id)
        v_avg = base.avg_cost_per_km if base else None
        delta = (cost_per_km - v_avg) if v_avg is not None else None

        per_assignment.append(
            AssignmentEfficiencyRow(
                assignment_id=a.id,
                assignment_date=a.assignment_date,
                vehicle_id=a.vehicle_id,
                employee_ids=_serialize_assignment(a).employee_ids,
                route_from=a.route_from,
                route_to=a.route_to,
                distance_km=km,
                amount=amount,
                rate_per_km=rate,
                cost_per_km=cost_per_km,
                vehicle_avg_cost_per_km=v_avg,
                delta_vs_vehicle_avg=delta,
            )
        )

    # Sort by delta vs vehicle avg; if vehicle avg missing, fall back to cost_per_km
    expensive = sorted(
        per_assignment,
        key=lambda r: (
            -(r.delta_vs_vehicle_avg if r.delta_vs_vehicle_avg is not None else r.cost_per_km),
            -(r.cost_per_km),
        ),
    )[:outlier_limit]
    efficient = sorted(
        per_assignment,
        key=lambda r: (
            (r.delta_vs_vehicle_avg if r.delta_vs_vehicle_avg is not None else r.cost_per_km),
            (r.cost_per_km),
        ),
    )[:outlier_limit]

    # Employee leaderboard, focusing on expensive assignments
    expensive_ids = {r.assignment_id for r in expensive}
    emp_sum: dict[str, EmployeeEfficiencySummaryRow] = {}
    for r in per_assignment:
        for eid in r.employee_ids:
            if not eid:
                continue
            s = emp_sum.get(eid)
            if not s:
                s = EmployeeEfficiencySummaryRow(
                    employee_id=eid,
                    assignments=0,
                    total_km=0.0,
                    total_amount=0.0,
                    avg_cost_per_km=None,
                    expensive_assignments=0,
                )
                emp_sum[eid] = s
            s.assignments += 1
            s.total_km += float(r.distance_km)
            s.total_amount += float(r.amount)
            if s.total_km > 0:
                s.avg_cost_per_km = s.total_amount / s.total_km
            if r.assignment_id in expensive_ids:
                s.expensive_assignments += 1

    employees_sorted = sorted(
        emp_sum.values(),
        key=lambda e: (
            -int(e.expensive_assignments),
            -(e.avg_cost_per_km if e.avg_cost_per_km is not None else 0),
            -float(e.total_amount),
        ),
    )

    # Build employee baseline avg cost/km (across all assignments in scope)
    emp_avg_cost: dict[str, float] = {}
    for e in employees_sorted:
        if e.avg_cost_per_km is not None:
            emp_avg_cost[e.employee_id] = float(e.avg_cost_per_km)

    # Simple alerts for non-technical users
    # Heuristics:
    # - cost_per_km higher than vehicle avg by a threshold, OR
    # - cost_per_km higher than employee avg by a threshold,
    # - and assignment distance is relatively low compared to vehicle avg_km_per_trip (often indicates inflated amount)
    alerts: list[EfficiencyAlertRow] = []
    for r in expensive:
        base = v_sum.get(r.vehicle_id)
        v_avg = base.avg_cost_per_km if base else None
        v_km_avg = base.avg_km_per_trip if base else None

        emp_id = r.employee_ids[0] if r.employee_ids else None
        e_avg = emp_avg_cost.get(emp_id) if emp_id else None

        delta_v = (r.cost_per_km - v_avg) if v_avg is not None else None
        delta_e = (r.cost_per_km - e_avg) if e_avg is not None else None

        suspicious = False
        reasons: list[str] = []

        if v_avg is not None and r.cost_per_km >= (v_avg * 1.35):
            suspicious = True
            reasons.append(f"Cost/km is {((r.cost_per_km / v_avg) - 1) * 100:.0f}% above this vehicle's average")
        if e_avg is not None and r.cost_per_km >= (e_avg * 1.35):
            suspicious = True
            reasons.append(f"Cost/km is {((r.cost_per_km / e_avg) - 1) * 100:.0f}% above this employee's average")
        if v_km_avg is not None and r.distance_km <= (v_km_avg * 0.6):
            reasons.append("Trip distance is much lower than the vehicle's typical trip")

        if suspicious:
            reasons_txt = "; ".join(reasons) if reasons else "High cost/km compared to normal"
            title = "Suspicious cost pattern"
            detail = f"Assignment #{r.assignment_id}: {reasons_txt}. Please review receipts/rate and route."
            alerts.append(
                EfficiencyAlertRow(
                    level="warning",
                    title=title,
                    detail=detail,
                    assignment_id=r.assignment_id,
                    assignment_date=r.assignment_date,
                    vehicle_id=r.vehicle_id,
                    employee_id=emp_id,
                    distance_km=float(r.distance_km),
                    amount=float(r.amount),
                    cost_per_km=float(r.cost_per_km),
                    vehicle_avg_cost_per_km=float(v_avg) if v_avg is not None else None,
                    employee_avg_cost_per_km=float(e_avg) if e_avg is not None else None,
                    delta_vs_vehicle_avg=float(delta_v) if delta_v is not None else None,
                )
            )

    # Show highest severity first
    alerts = sorted(
        alerts,
        key=lambda a: (
            -(a.delta_vs_vehicle_avg if a.delta_vs_vehicle_avg is not None else 0),
            -a.cost_per_km,
        ),
    )[:outlier_limit]

    vehicles_sorted = sorted(
        v_sum.values(),
        key=lambda v: (
            -(v.avg_cost_per_km if v.avg_cost_per_km is not None else 0),
            -float(v.total_amount),
        ),
    )

    total_km = sum(v.total_km for v in vehicles_sorted)
    total_amount = sum(v.total_amount for v in vehicles_sorted)
    avg_cost = (total_amount / total_km) if total_km > 0 else None

    return VehicleAssignmentEfficiencyResponse(
        period=p,
        date=day_val,
        month=month_val,
        year=year_val,
        vehicle_id=vehicle_id,
        assignments=len(per_assignment),
        total_km=float(total_km),
        total_amount=float(total_amount),
        avg_cost_per_km=avg_cost,
        vehicles=vehicles_sorted,
        expensive_assignments=expensive,
        efficient_assignments=efficient,
        employees=employees_sorted[:50],
        alerts=alerts,
    )


@router.get("/{assignment_id}", response_model=VehicleAssignmentResponse)
async def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
) -> VehicleAssignmentResponse:
    """Get a single assignment by ID."""

    assignment = db.query(VehicleAssignment).filter(VehicleAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    return _serialize_assignment(assignment)


@router.put("/{assignment_id}", response_model=VehicleAssignmentResponse)
async def update_assignment(
    assignment_id: int,
    payload: VehicleAssignmentUpdate,
    db: Session = Depends(get_db),
) -> VehicleAssignmentResponse:
    """Update an existing assignment."""

    assignment = db.query(VehicleAssignment).filter(VehicleAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    update_data = payload.dict(exclude_unset=True)

    # If vehicle_id is changing, validate vehicle exists
    if "vehicle_id" in update_data:
        vehicle = (
            db.query(Vehicle)
            .filter(Vehicle.vehicle_id == update_data["vehicle_id"])
            .first()
        )
        if not vehicle:
            raise HTTPException(status_code=400, detail="Vehicle not found")

    # If employee_ids is changing, validate
    if "employee_ids" in update_data and update_data["employee_ids"] is not None:
        new_ids = update_data["employee_ids"]
        missing = (
            set(new_ids)
            - {
                e.employee_id
                for e in db.query(Employee)
                .filter(Employee.employee_id.in_(new_ids))
                .all()
            }
        )
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown employee IDs: {', '.join(sorted(missing))}",
            )
        assignment.employee_ids = json.dumps(new_ids)
        update_data.pop("employee_ids")

    if "route_stops" in update_data:
        stops = _normalize_stops(update_data.get("route_stops"))
        assignment.route_stops = json.dumps(stops) if stops else None
        if stops:
            assignment.route_from = stops[0]
            assignment.route_to = stops[-1]
        update_data.pop("route_stops")

    if "route_from" in update_data or "route_to" in update_data:
        rf = update_data.get("route_from", assignment.route_from)
        rt = update_data.get("route_to", assignment.route_to)
        rf = str(rf).strip() if rf is not None else ""
        rt = str(rt).strip() if rt is not None else ""
        if not rf or not rt:
            raise HTTPException(status_code=400, detail="route_from and route_to are required")
        assignment.route_from = rf
        assignment.route_to = rt
        update_data.pop("route_from", None)
        update_data.pop("route_to", None)

    incoming_status = update_data.get("status")
    if incoming_status is not None:
        s = str(incoming_status).strip().lower()
        if s in {"complete", "completed"}:
            assignment.status = "Complete"
            km = update_data.get("distance_km")
            rate = update_data.get("rate_per_km")
            amount = update_data.get("amount")
            if km is None or (rate is None and amount is None):
                raise HTTPException(
                    status_code=400,
                    detail="distance_km and amount (or rate_per_km) are required to complete",
                )
            try:
                km_f = float(km)
                rate_f = float(rate) if rate is not None else None
                amount_f = float(amount) if amount is not None else None
            except Exception:
                raise HTTPException(status_code=400, detail="distance_km and amount/rate must be numbers")

            if km_f <= 0:
                raise HTTPException(status_code=400, detail="distance_km must be > 0")

            if rate_f is not None and rate_f < 0:
                raise HTTPException(status_code=400, detail="rate_per_km must be >= 0")
            if amount_f is not None and amount_f < 0:
                raise HTTPException(status_code=400, detail="amount must be >= 0")

            if rate_f is None and amount_f is not None:
                rate_f = amount_f / km_f
            if amount_f is None and rate_f is not None:
                amount_f = km_f * rate_f

            assignment.distance_km = km_f
            assignment.rate_per_km = rate_f
            assignment.amount = amount_f
            if assignment.end_time is None:
                assignment.end_time = datetime.utcnow()
        elif s in {"incomplete", "pending", "open"}:
            assignment.status = "Incomplete"
            assignment.end_time = None
            assignment.distance_km = None
            assignment.rate_per_km = None
            assignment.amount = None
        else:
            raise HTTPException(status_code=400, detail="Invalid status")

        update_data.pop("status", None)
        update_data.pop("distance_km", None)
        update_data.pop("rate_per_km", None)
        update_data.pop("amount", None)

    for field, value in update_data.items():
        setattr(assignment, field, value)

    db.commit()
    db.refresh(assignment)

    return _serialize_assignment(assignment)


@router.delete("/{assignment_id}")
async def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """Delete an assignment by ID."""

    assignment = db.query(VehicleAssignment).filter(VehicleAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    db.delete(assignment)
    db.commit()

    return {"message": "Assignment deleted successfully"}
