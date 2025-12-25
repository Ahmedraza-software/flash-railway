from __future__ import annotations

from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import get_db
from app.models.employee import Employee
from app.models.employee_advance import EmployeeAdvance
from app.models.employee_advance_deduction import EmployeeAdvanceDeduction
from app.models.payroll_payment_status import PayrollPaymentStatus
from app.schemas.employee_advance import (
    EmployeeAdvanceCreate,
    EmployeeAdvanceDeductionOut,
    EmployeeAdvanceDeductionUpsert,
    EmployeeAdvanceOut,
    EmployeeAdvanceMonthRow,
    EmployeeAdvancesMonthSummary,
    EmployeeAdvanceSummary,
)

from app.api.dependencies import require_permission

router = APIRouter(dependencies=[Depends(require_permission("accounts:full"))])


def _month_ok(month: str) -> None:
    if not month or len(month) != 7 or month[4] != "-":
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format")


def _month_range(month: str) -> tuple[date, date]:
    _month_ok(month)
    try:
        y_s, m_s = month.split("-", 1)
        y = int(y_s)
        m = int(m_s)
        if m < 1 or m > 12:
            raise ValueError
    except Exception as e:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format") from e
    last_day = monthrange(y, m)[1]
    return date(y, m, 1), date(y, m, last_day)


@router.get("/summary", response_model=EmployeeAdvancesMonthSummary)
def advances_month_summary(month: str, db: Session = Depends(get_db)) -> EmployeeAdvancesMonthSummary:
    start, end = _month_range(month)

    rows = (
        db.query(
            EmployeeAdvance.employee_db_id,
            func.coalesce(func.sum(EmployeeAdvance.amount), 0.0).label("total"),
        )
        .filter(EmployeeAdvance.advance_date >= start, EmployeeAdvance.advance_date <= end)
        .group_by(EmployeeAdvance.employee_db_id)
        .all()
    )

    by_employee_db_id: dict[int, float] = {int(r[0]): float(r[1] or 0.0) for r in rows}
    total = float(sum(by_employee_db_id.values()))

    return EmployeeAdvancesMonthSummary(month=month, total_advanced=total, by_employee_db_id=by_employee_db_id)


@router.get("/monthly", response_model=list[EmployeeAdvanceMonthRow])
def list_advances_for_month(month: str, db: Session = Depends(get_db)) -> list[EmployeeAdvanceMonthRow]:
    start, end = _month_range(month)

    rows = (
        db.query(EmployeeAdvance, Employee)
        .join(Employee, Employee.id == EmployeeAdvance.employee_db_id)
        .filter(EmployeeAdvance.advance_date >= start, EmployeeAdvance.advance_date <= end)
        .order_by(EmployeeAdvance.advance_date.desc(), EmployeeAdvance.id.desc())
        .all()
    )

    out: list[EmployeeAdvanceMonthRow] = []
    for adv, emp in rows:
        out.append(
            EmployeeAdvanceMonthRow(
                id=adv.id,
                employee_db_id=adv.employee_db_id,
                employee_id=emp.employee_id,
                employee_name=" ".join([p for p in [emp.first_name, emp.last_name] if p]),
                amount=float(adv.amount or 0.0),
                note=adv.note,
                advance_date=adv.advance_date,
                created_at=adv.created_at,
            )
        )
    return out


@router.get("/employees/{employee_db_id}/summary", response_model=EmployeeAdvanceSummary)
def employee_advance_summary(employee_db_id: int, db: Session = Depends(get_db)) -> EmployeeAdvanceSummary:
    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    total_adv = (
        db.query(func.coalesce(func.sum(EmployeeAdvance.amount), 0.0))
        .filter(EmployeeAdvance.employee_db_id == employee_db_id)
        .scalar()
    )
    total_ded = (
        db.query(func.coalesce(func.sum(EmployeeAdvanceDeduction.amount), 0.0))
        .filter(EmployeeAdvanceDeduction.employee_db_id == employee_db_id)
        .scalar()
    )
    total_paid = (
        db.query(func.coalesce(func.sum(PayrollPaymentStatus.net_pay_snapshot), 0.0))
        .filter(PayrollPaymentStatus.employee_db_id == employee_db_id, PayrollPaymentStatus.status == "paid")
        .scalar()
    )

    bal = float(total_adv or 0.0) - float(total_ded or 0.0)

    return EmployeeAdvanceSummary(
        employee_db_id=employee_db_id,
        total_advanced=float(total_adv or 0.0),
        total_deducted=float(total_ded or 0.0),
        balance=bal,
        total_paid_so_far=float(total_paid or 0.0),
    )


@router.get("/employees/{employee_db_id}/advances", response_model=list[EmployeeAdvanceOut])
def list_advances(employee_db_id: int, db: Session = Depends(get_db)):
    return (
        db.query(EmployeeAdvance)
        .filter(EmployeeAdvance.employee_db_id == employee_db_id)
        .order_by(EmployeeAdvance.advance_date.desc(), EmployeeAdvance.id.desc())
        .all()
    )


@router.post("/employees/{employee_db_id}/advances", response_model=EmployeeAdvanceOut)
def create_advance(employee_db_id: int, payload: EmployeeAdvanceCreate, db: Session = Depends(get_db)):
    if payload.employee_db_id != employee_db_id:
        raise HTTPException(status_code=400, detail="employee_db_id mismatch")

    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    adv = EmployeeAdvance(
        employee_db_id=employee_db_id,
        amount=float(payload.amount),
        note=payload.note,
        advance_date=payload.advance_date,
    )
    db.add(adv)
    db.commit()
    db.refresh(adv)
    return adv


@router.delete("/employees/{employee_db_id}/advances/{advance_id}")
def delete_advance(employee_db_id: int, advance_id: int, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    adv = (
        db.query(EmployeeAdvance)
        .filter(EmployeeAdvance.id == advance_id, EmployeeAdvance.employee_db_id == employee_db_id)
        .first()
    )
    if not adv:
        raise HTTPException(status_code=404, detail="Advance not found")

    db.delete(adv)
    db.commit()
    return {"ok": True}


@router.get("/employees/{employee_db_id}/deductions", response_model=list[EmployeeAdvanceDeductionOut])
def list_deductions(employee_db_id: int, db: Session = Depends(get_db)):
    return (
        db.query(EmployeeAdvanceDeduction)
        .filter(EmployeeAdvanceDeduction.employee_db_id == employee_db_id)
        .order_by(EmployeeAdvanceDeduction.month.desc(), EmployeeAdvanceDeduction.id.desc())
        .all()
    )


@router.put("/employees/{employee_db_id}/deductions", response_model=EmployeeAdvanceDeductionOut)
def upsert_monthly_deduction(employee_db_id: int, payload: EmployeeAdvanceDeductionUpsert, db: Session = Depends(get_db)):
    if payload.employee_db_id != employee_db_id:
        raise HTTPException(status_code=400, detail="employee_db_id mismatch")
    _month_ok(payload.month)

    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    row = (
        db.query(EmployeeAdvanceDeduction)
        .filter(EmployeeAdvanceDeduction.employee_db_id == employee_db_id, EmployeeAdvanceDeduction.month == payload.month)
        .first()
    )
    if not row:
        row = EmployeeAdvanceDeduction(
            employee_db_id=employee_db_id,
            month=payload.month,
            amount=float(payload.amount),
            note=payload.note,
        )
        db.add(row)
    else:
        row.amount = float(payload.amount)
        row.note = payload.note

    db.commit()
    db.refresh(row)
    return row


@router.delete("/employees/{employee_db_id}/deductions/{deduction_id}")
def delete_deduction(employee_db_id: int, deduction_id: int, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    ded = (
        db.query(EmployeeAdvanceDeduction)
        .filter(
            EmployeeAdvanceDeduction.id == deduction_id,
            EmployeeAdvanceDeduction.employee_db_id == employee_db_id,
        )
        .first()
    )
    if not ded:
        raise HTTPException(status_code=404, detail="Deduction not found")

    db.delete(ded)
    db.commit()
    return {"ok": True}
