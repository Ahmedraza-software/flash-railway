from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, exists
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.attendance import AttendanceRecord
from app.models.leave_period import LeavePeriod
from app.schemas.leave_period import (
    LeavePeriodAlert,
    LeavePeriodCreate,
    LeavePeriodOut,
    LeavePeriodUpdate,
)


router = APIRouter()


def _validate_leave_period(from_date: date, to_date: date, leave_type: str) -> None:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")
    lt = (leave_type or "").strip().lower()
    if lt not in {"paid", "unpaid"}:
        raise HTTPException(status_code=400, detail="leave_type must be 'paid' or 'unpaid'")


@router.post("/", response_model=LeavePeriodOut)
async def create_leave_period(payload: LeavePeriodCreate, db: Session = Depends(get_db)) -> LeavePeriod:
    _validate_leave_period(payload.from_date, payload.to_date, payload.leave_type)

    lt = (payload.leave_type or "paid").strip().lower()

    rec = LeavePeriod(
        employee_id=payload.employee_id,
        from_date=payload.from_date,
        to_date=payload.to_date,
        leave_type=lt,
        reason=payload.reason,
    )
    db.add(rec)

    d = payload.from_date
    while d <= payload.to_date:
        existing_att = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.employee_id == payload.employee_id,
                AttendanceRecord.date == d,
            )
            .first()
        )

        if not existing_att:
            db.add(
                AttendanceRecord(
                    employee_id=payload.employee_id,
                    date=d,
                    status="leave",
                    leave_type=lt,
                )
            )

        d = d + timedelta(days=1)

    db.commit()
    db.refresh(rec)
    return rec


@router.get("/", response_model=list[LeavePeriodOut])
async def list_leave_periods(
    employee_id: str | None = None,
    active_on: date | None = None,
    db: Session = Depends(get_db),
) -> list[LeavePeriod]:
    q = db.query(LeavePeriod)
    if employee_id:
        q = q.filter(LeavePeriod.employee_id == employee_id)
    if active_on:
        q = q.filter(and_(LeavePeriod.from_date <= active_on, LeavePeriod.to_date >= active_on))
    return q.order_by(LeavePeriod.to_date.desc(), LeavePeriod.employee_id.asc()).all()


@router.put("/{leave_period_id}", response_model=LeavePeriodOut)
async def update_leave_period(
    leave_period_id: int,
    payload: LeavePeriodUpdate,
    db: Session = Depends(get_db),
) -> LeavePeriod:
    rec = db.query(LeavePeriod).filter(LeavePeriod.id == leave_period_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Leave period not found")

    update_data = payload.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(rec, k, v)

    _validate_leave_period(rec.from_date, rec.to_date, rec.leave_type)

    if rec.leave_type:
        rec.leave_type = rec.leave_type.strip().lower()

    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/{leave_period_id}")
async def delete_leave_period(leave_period_id: int, db: Session = Depends(get_db)) -> dict:
    rec = db.query(LeavePeriod).filter(LeavePeriod.id == leave_period_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Leave period not found")
    db.delete(rec)
    db.commit()
    return {"message": "Leave period deleted"}


@router.get("/alerts", response_model=list[LeavePeriodAlert])
async def leave_period_alerts(
    as_of: date | None = None,
    employee_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[LeavePeriodAlert]:
    as_of_date = as_of or date.today()
    q = db.query(LeavePeriod).filter(LeavePeriod.to_date < as_of_date)
    if employee_id:
        q = q.filter(LeavePeriod.employee_id == employee_id)

    periods = q.order_by(LeavePeriod.to_date.desc()).all()
    alerts: list[LeavePeriodAlert] = []

    for p in periods:
        returned = db.query(
            exists().where(
                and_(
                    AttendanceRecord.employee_id == p.employee_id,
                    AttendanceRecord.date > p.to_date,
                    AttendanceRecord.status.in_(["present", "late"]),
                )
            )
        ).scalar()

        if returned:
            continue

        alerts.append(
            LeavePeriodAlert(
                leave_period_id=p.id,
                employee_id=p.employee_id,
                from_date=p.from_date,
                to_date=p.to_date,
                leave_type=p.leave_type,
                reason=p.reason,
                last_day=p.to_date,
                message=(
                    f"Leave finished on {p.to_date.isoformat()} for employee {p.employee_id}. "
                    f"Last day was {p.to_date.isoformat()}."
                ),
            )
        )

    return alerts
