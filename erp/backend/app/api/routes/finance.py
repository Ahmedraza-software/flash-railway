from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.models.user import User
from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.finance_account import FinanceAccount
from app.models.finance_journal_entry import FinanceJournalEntry
from app.models.finance_journal_line import FinanceJournalLine
from app.schemas.finance import (
    FinanceAccount as FinanceAccountSchema,
    FinanceAccountCreate,
    FinanceAccountUpdate,
    FinanceJournalEntry as FinanceJournalEntrySchema,
    FinanceJournalEntryCreate,
    FinanceJournalEntryUpdate,
)

router = APIRouter(dependencies=[Depends(require_permission("accounts:full"))])

ALLOWED_ACCOUNT_TYPES = {"ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"}


def _validate_account_type(account_type: str) -> None:
    if account_type not in ALLOWED_ACCOUNT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid account_type '{account_type}'. Must be one of: {sorted(ALLOWED_ACCOUNT_TYPES)}",
        )


def _validate_journal_lines(lines: list[FinanceJournalLine]) -> None:
    if not lines:
        raise HTTPException(status_code=400, detail="Journal entry must have at least one line")

    total_debit = Decimal("0")
    total_credit = Decimal("0")

    for i, ln in enumerate(lines):
        debit = Decimal(str(ln.debit or 0))
        credit = Decimal(str(ln.credit or 0))

        if debit < 0 or credit < 0:
            raise HTTPException(status_code=400, detail=f"Line {i + 1}: debit/credit cannot be negative")

        if debit == 0 and credit == 0:
            raise HTTPException(status_code=400, detail=f"Line {i + 1}: either debit or credit must be > 0")

        if debit > 0 and credit > 0:
            raise HTTPException(status_code=400, detail=f"Line {i + 1}: cannot have both debit and credit")

        total_debit += debit
        total_credit += credit

    if total_debit != total_credit:
        raise HTTPException(
            status_code=400,
            detail=f"Total debit ({total_debit}) must equal total credit ({total_credit})",
        )


def _next_entry_no(db: Session, entry_date: date) -> str:
    ym = entry_date.strftime("%Y%m")
    prefix = f"JE-{ym}-"

    last = (
        db.query(FinanceJournalEntry)
        .filter(FinanceJournalEntry.entry_no.like(f"{prefix}%"))
        .order_by(FinanceJournalEntry.id.desc())
        .first()
    )

    if not last:
        return f"{prefix}0001"

    tail = last.entry_no.replace(prefix, "")
    try:
        n = int(tail)
    except ValueError:
        n = 0
    return f"{prefix}{n + 1:04d}"


@router.get("/accounts", response_model=list[FinanceAccountSchema])
def list_accounts(
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    return db.query(FinanceAccount).order_by(FinanceAccount.code.asc()).all()


@router.post("/accounts", response_model=FinanceAccountSchema)
def create_account(
    payload: FinanceAccountCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    _validate_account_type(payload.account_type)

    existing = db.query(FinanceAccount).filter(FinanceAccount.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account code already exists")

    if payload.parent_id is not None:
        parent = db.query(FinanceAccount).filter(FinanceAccount.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent account not found")

    acc = FinanceAccount(
        code=payload.code,
        name=payload.name,
        account_type=payload.account_type,
        parent_id=payload.parent_id,
        is_system=payload.is_system,
        is_active=payload.is_active,
    )
    db.add(acc)
    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(acc)
    return acc


@router.get("/accounts/{account_id}", response_model=FinanceAccountSchema)
def get_account(
    account_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    acc = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return acc


@router.put("/accounts/{account_id}", response_model=FinanceAccountSchema)
def update_account(
    account_id: int,
    payload: FinanceAccountUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    acc = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    if payload.account_type is not None:
        _validate_account_type(payload.account_type)
        acc.account_type = payload.account_type

    if payload.name is not None:
        acc.name = payload.name

    if payload.is_active is not None:
        acc.is_active = payload.is_active

    if payload.parent_id is not None:
        if payload.parent_id == acc.id:
            raise HTTPException(status_code=400, detail="Account cannot be parent of itself")
        parent = db.query(FinanceAccount).filter(FinanceAccount.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent account not found")
        acc.parent_id = payload.parent_id

    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(acc)
    return acc


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    acc = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    if acc.is_system:
        raise HTTPException(status_code=400, detail="System accounts cannot be deleted")

    used = db.query(FinanceJournalLine).filter(FinanceJournalLine.account_id == account_id).first()
    if used:
        raise HTTPException(status_code=400, detail="Account is used in journal lines and cannot be deleted")

    db.delete(acc)
    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.get("/journals", response_model=list[FinanceJournalEntrySchema])
def list_journals(
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    return db.query(FinanceJournalEntry).order_by(FinanceJournalEntry.id.desc()).all()


@router.post("/journals", response_model=FinanceJournalEntrySchema)
def create_journal(
    payload: FinanceJournalEntryCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    if payload.source_type and payload.source_id:
        existing = (
            db.query(FinanceJournalEntry)
            .filter(
                FinanceJournalEntry.source_type == payload.source_type,
                FinanceJournalEntry.source_id == payload.source_id,
                FinanceJournalEntry.status == "POSTED",
            )
            .first()
        )
        if existing:
            return existing

    entry_no = _next_entry_no(db, payload.entry_date)
    entry = FinanceJournalEntry(
        entry_no=entry_no,
        entry_date=payload.entry_date,
        memo=payload.memo,
        source_type=payload.source_type,
        source_id=payload.source_id,
        status="DRAFT",
    )

    for ln in payload.lines:
        acc = db.query(FinanceAccount).filter(FinanceAccount.id == ln.account_id).first()
        if not acc:
            raise HTTPException(status_code=404, detail=f"Account not found: {ln.account_id}")

        entry.lines.append(
            FinanceJournalLine(
                account_id=ln.account_id,
                description=ln.description,
                debit=ln.debit,
                credit=ln.credit,
                employee_id=ln.employee_id,
            )
        )

    db.add(entry)
    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(entry)
    return entry


@router.get("/journals/{entry_id}", response_model=FinanceJournalEntrySchema)
def get_journal(
    entry_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    entry = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return entry


@router.put("/journals/{entry_id}", response_model=FinanceJournalEntrySchema)
def update_journal(
    entry_id: int,
    payload: FinanceJournalEntryUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    entry = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    if entry.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT journal entries can be updated")

    if payload.entry_date is not None:
        entry.entry_date = payload.entry_date

    if payload.memo is not None:
        entry.memo = payload.memo

    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(entry)
    return entry


@router.delete("/journals/{entry_id}")
def delete_journal(
    entry_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    entry = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    if entry.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT journal entries can be deleted")

    db.delete(entry)
    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.post("/journals/{entry_id}/post", response_model=FinanceJournalEntrySchema)
def post_journal(
    entry_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    entry = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    if entry.status == "POSTED":
        return entry

    if entry.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT journal entries can be posted")

    if entry.source_type and entry.source_id:
        existing_posted = (
            db.query(FinanceJournalEntry)
            .filter(
                FinanceJournalEntry.id != entry.id,
                FinanceJournalEntry.source_type == entry.source_type,
                FinanceJournalEntry.source_id == entry.source_id,
                FinanceJournalEntry.status == "POSTED",
            )
            .first()
        )
        if existing_posted:
            raise HTTPException(
                status_code=400,
                detail=f"A posted journal already exists for source {entry.source_type}/{entry.source_id} ({existing_posted.entry_no})",
            )

    _validate_journal_lines(entry.lines)

    entry.status = "POSTED"
    entry.posted_at = func.now()

    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(entry)
    return entry


@router.post("/journals/{entry_id}/reverse", response_model=FinanceJournalEntrySchema)
def reverse_journal(
    entry_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    original = db.query(FinanceJournalEntry).filter(FinanceJournalEntry.id == entry_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    if original.status != "POSTED":
        raise HTTPException(status_code=400, detail="Only POSTED journal entries can be reversed")

    existing_reversal = (
        db.query(FinanceJournalEntry)
        .filter(
            FinanceJournalEntry.source_type == "REVERSAL",
            FinanceJournalEntry.source_id == str(original.id),
        )
        .first()
    )
    if existing_reversal:
        return existing_reversal

    entry_no = _next_entry_no(db, original.entry_date)
    reversal = FinanceJournalEntry(
        entry_no=entry_no,
        entry_date=original.entry_date,
        memo=f"Reversal of {original.entry_no}",
        source_type="REVERSAL",
        source_id=str(original.id),
        status="DRAFT",
    )

    for ln in original.lines:
        reversal.lines.append(
            FinanceJournalLine(
                account_id=ln.account_id,
                description=f"Reversal: {ln.description}" if ln.description else "Reversal",
                debit=ln.credit,
                credit=ln.debit,
                employee_id=ln.employee_id,
            )
        )

    db.add(reversal)
    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    db.refresh(reversal)

    _validate_journal_lines(reversal.lines)

    reversal.status = "POSTED"
    reversal.posted_at = func.now()

    try:
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    db.refresh(reversal)
    return reversal
