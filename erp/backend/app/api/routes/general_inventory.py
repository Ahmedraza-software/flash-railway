import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.employee import Employee
from app.models.general_item import GeneralItem
from app.models.general_item_employee_balance import GeneralItemEmployeeBalance
from app.models.general_item_transaction import GeneralItemTransaction
from app.schemas.general_inventory import (
    AdjustRequest,
    EmployeeGeneralIssuedInventory,
    EmployeeGeneralIssuedQuantity,
    GeneralItemCreate,
    GeneralItemOut,
    GeneralItemUpdate,
    GeneralTransactionOut,
    IssueRequest,
    ReturnRequest,
)


router = APIRouter(dependencies=[Depends(require_permission("inventory:view"))])


def _upload_dir() -> str:
    # backend/app/api/routes -> project root
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    d = os.path.join(base, "uploads", "general-items", "images")
    os.makedirs(d, exist_ok=True)
    return d


def _public_url(path: str) -> str:
    fn = os.path.basename(path)
    return f"/uploads/general-items/images/{fn}"


def _ensure_employee(db: Session, employee_id: str) -> None:
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")


def _get_or_create_balance(db: Session, *, employee_id: str, item_code: str) -> GeneralItemEmployeeBalance:
    bal = (
        db.query(GeneralItemEmployeeBalance)
        .filter(GeneralItemEmployeeBalance.employee_id == employee_id)
        .filter(GeneralItemEmployeeBalance.item_code == item_code)
        .first()
    )
    if bal:
        return bal

    bal = GeneralItemEmployeeBalance(employee_id=employee_id, item_code=item_code, quantity_issued=0.0)
    db.add(bal)
    db.flush()
    return bal


def _log_tx(
    db: Session,
    *,
    item_code: str,
    action: str,
    employee_id: Optional[str] = None,
    quantity: Optional[float] = None,
    condition_note: Optional[str] = None,
    notes: Optional[str] = None,
) -> None:
    tx = GeneralItemTransaction(
        item_code=item_code,
        employee_id=employee_id,
        action=action,
        quantity=quantity,
        condition_note=condition_note,
        notes=notes,
    )
    db.add(tx)


@router.get("/items", response_model=List[GeneralItemOut])
async def list_items(db: Session = Depends(get_db)) -> List[GeneralItemOut]:
    return db.query(GeneralItem).order_by(GeneralItem.id.desc()).all()


@router.get("/categories", response_model=List[str])
async def list_categories(db: Session = Depends(get_db)) -> List[str]:
    rows = db.query(distinct(GeneralItem.category)).order_by(GeneralItem.category.asc()).all()
    out: List[str] = []
    for (c,) in rows:
        v = (c or "").strip()
        if v:
            out.append(v)
    return out


@router.post("/items", response_model=GeneralItemOut)
async def create_item(payload: GeneralItemCreate, db: Session = Depends(get_db)) -> GeneralItemOut:
    exists = db.query(GeneralItem).filter(GeneralItem.item_code == payload.item_code).first()
    if exists:
        raise HTTPException(status_code=400, detail="Item code already exists")

    item = GeneralItem(**payload.dict())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/items/{item_code}/image", response_model=GeneralItemOut)
async def upload_item_image(
    item_code: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> GeneralItemOut:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    ct = file.content_type or "application/octet-stream"
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    ext = os.path.splitext(file.filename or "")[-1]
    safe_name = f"{item_code}_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(_upload_dir(), safe_name)

    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    item.image_url = _public_url(dest)
    db.commit()
    db.refresh(item)
    return item


@router.get("/items/{item_code}", response_model=GeneralItemOut)
async def get_item(item_code: str, db: Session = Depends(get_db)) -> GeneralItemOut:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.put("/items/{item_code}", response_model=GeneralItemOut)
async def update_item(item_code: str, payload: GeneralItemUpdate, db: Session = Depends(get_db)) -> GeneralItemOut:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(item, k, v)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_code}")
async def delete_item(item_code: str, db: Session = Depends(get_db)) -> dict:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
    return {"message": "Item deleted"}


@router.get("/employees/{employee_id}/issued", response_model=EmployeeGeneralIssuedInventory)
async def get_employee_issued(employee_id: str, db: Session = Depends(get_db)) -> EmployeeGeneralIssuedInventory:
    _ensure_employee(db, employee_id)

    balances = (
        db.query(GeneralItemEmployeeBalance, GeneralItem)
        .join(GeneralItem, GeneralItem.item_code == GeneralItemEmployeeBalance.item_code)
        .filter(GeneralItemEmployeeBalance.employee_id == employee_id)
        .filter(GeneralItemEmployeeBalance.quantity_issued > 0)
        .order_by(GeneralItemEmployeeBalance.id.desc())
        .all()
    )

    items: List[EmployeeGeneralIssuedQuantity] = []
    for bal, it in balances:
        items.append(
            EmployeeGeneralIssuedQuantity(
                item_code=it.item_code,
                item_name=it.name,
                category=it.category,
                unit_name=it.unit_name,
                quantity_issued=float(bal.quantity_issued or 0.0),
            )
        )

    return EmployeeGeneralIssuedInventory(employee_id=employee_id, items=items)


@router.get("/transactions", response_model=List[GeneralTransactionOut])
async def list_transactions(
    item_code: Optional[str] = None,
    employee_id: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
) -> List[GeneralTransactionOut]:
    q = db.query(GeneralItemTransaction)
    if item_code:
        q = q.filter(GeneralItemTransaction.item_code == item_code)
    if employee_id:
        q = q.filter(GeneralItemTransaction.employee_id == employee_id)
    return q.order_by(GeneralItemTransaction.id.desc()).limit(min(max(limit, 1), 500)).all()


@router.post("/items/{item_code}/issue", response_model=List[GeneralTransactionOut])
async def issue_item(item_code: str, payload: IssueRequest, db: Session = Depends(get_db)) -> List[GeneralTransactionOut]:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    employee_id = (payload.employee_id or "").strip()
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee ID is required")
    _ensure_employee(db, employee_id)

    qty = float(payload.quantity or 0.0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")
    if float(item.quantity_on_hand or 0.0) < qty:
        raise HTTPException(status_code=400, detail="Not enough stock")

    item.quantity_on_hand = float(item.quantity_on_hand or 0.0) - qty
    bal = _get_or_create_balance(db, employee_id=employee_id, item_code=item_code)
    bal.quantity_issued = float(bal.quantity_issued or 0.0) + qty

    _log_tx(db, item_code=item_code, action="ISSUE", employee_id=employee_id, quantity=qty, notes=payload.notes)
    db.commit()

    txs = (
        db.query(GeneralItemTransaction)
        .filter(GeneralItemTransaction.item_code == item_code)
        .order_by(GeneralItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))


@router.post("/items/{item_code}/return", response_model=List[GeneralTransactionOut])
async def return_item(item_code: str, payload: ReturnRequest, db: Session = Depends(get_db)) -> List[GeneralTransactionOut]:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()

    employee_id = (payload.employee_id or "").strip()
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee ID is required")
    # Best-effort: allow returning/unlinking even if employee record was deleted.
    try:
        _ensure_employee(db, employee_id)
    except HTTPException:
        pass

    qty = float(payload.quantity or 0.0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")

    # If the item record is missing (e.g. deleted manually), still allow unlinking
    # from the employee by updating the balance. Stock is only adjusted if the item exists.
    bal = (
        db.query(GeneralItemEmployeeBalance)
        .filter(GeneralItemEmployeeBalance.employee_id == employee_id)
        .filter(GeneralItemEmployeeBalance.item_code == item_code)
        .first()
    )

    if not bal:
        # Fall back to creating balance only if the item exists.
        if item:
            bal = _get_or_create_balance(db, employee_id=employee_id, item_code=item_code)
        else:
            raise HTTPException(status_code=404, detail="Allocation not found for this employee/item")

    if float(bal.quantity_issued or 0.0) < qty:
        raise HTTPException(status_code=400, detail="Employee does not have enough issued quantity")

    if item:
        item.quantity_on_hand = float(item.quantity_on_hand or 0.0) + qty
    bal.quantity_issued = float(bal.quantity_issued or 0.0) - qty

    # Transactions table has FK constraints; if the item or employee record is missing,
    # writing a transaction row could fail. The allocation/balance update above is the
    # authoritative unlink operation.
    employee_exists = db.query(Employee).filter(Employee.employee_id == employee_id).first() is not None
    if item:
        _log_tx(
            db,
            item_code=item_code,
            action="RETURN",
            employee_id=employee_id if employee_exists else None,
            quantity=qty,
            condition_note=payload.condition_note,
            notes=payload.notes,
        )
    db.commit()

    txs = (
        db.query(GeneralItemTransaction)
        .filter(GeneralItemTransaction.item_code == item_code)
        .order_by(GeneralItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))


@router.post("/items/{item_code}/lost", response_model=List[GeneralTransactionOut])
async def lost_item(item_code: str, payload: ReturnRequest, db: Session = Depends(get_db)) -> List[GeneralTransactionOut]:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    employee_id = (payload.employee_id or "").strip()
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee ID is required")
    _ensure_employee(db, employee_id)

    qty = float(payload.quantity or 0.0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")

    bal = _get_or_create_balance(db, employee_id=employee_id, item_code=item_code)
    if float(bal.quantity_issued or 0.0) < qty:
        raise HTTPException(status_code=400, detail="Employee does not have enough issued quantity")

    bal.quantity_issued = float(bal.quantity_issued or 0.0) - qty

    _log_tx(db, item_code=item_code, action="LOST", employee_id=employee_id, quantity=qty, notes=payload.notes)
    db.commit()

    txs = (
        db.query(GeneralItemTransaction)
        .filter(GeneralItemTransaction.item_code == item_code)
        .order_by(GeneralItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))


@router.post("/items/{item_code}/damaged", response_model=List[GeneralTransactionOut])
async def damaged_item(item_code: str, payload: ReturnRequest, db: Session = Depends(get_db)) -> List[GeneralTransactionOut]:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    employee_id = (payload.employee_id or "").strip()
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee ID is required")
    _ensure_employee(db, employee_id)

    qty = float(payload.quantity or 0.0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")

    bal = _get_or_create_balance(db, employee_id=employee_id, item_code=item_code)
    if float(bal.quantity_issued or 0.0) < qty:
        raise HTTPException(status_code=400, detail="Employee does not have enough issued quantity")

    bal.quantity_issued = float(bal.quantity_issued or 0.0) - qty

    _log_tx(
        db,
        item_code=item_code,
        action="DAMAGED",
        employee_id=employee_id,
        quantity=qty,
        condition_note=payload.condition_note,
        notes=payload.notes,
    )
    db.commit()

    txs = (
        db.query(GeneralItemTransaction)
        .filter(GeneralItemTransaction.item_code == item_code)
        .order_by(GeneralItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))


@router.post("/items/{item_code}/adjust", response_model=List[GeneralTransactionOut])
async def adjust_item(item_code: str, payload: AdjustRequest, db: Session = Depends(get_db)) -> List[GeneralTransactionOut]:
    item = db.query(GeneralItem).filter(GeneralItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    qty = float(payload.quantity or 0.0)
    item.quantity_on_hand = qty

    _log_tx(db, item_code=item_code, action="ADJUST", quantity=qty, notes=payload.notes)
    db.commit()

    txs = (
        db.query(GeneralItemTransaction)
        .filter(GeneralItemTransaction.item_code == item_code)
        .order_by(GeneralItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))
