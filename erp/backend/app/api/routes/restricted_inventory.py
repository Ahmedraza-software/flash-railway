import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.employee import Employee
from app.models.restricted_item import RestrictedItem
from app.models.restricted_item_employee_balance import RestrictedItemEmployeeBalance
from app.models.restricted_item_image import RestrictedItemImage
from app.models.restricted_item_serial_unit import RestrictedItemSerialUnit
from app.models.restricted_item_transaction import RestrictedItemTransaction
from app.schemas.employee_inventory import (
    EmployeeIssuedInventory,
    EmployeeIssuedQuantity,
    EmployeeIssuedSerial,
    QuantityActionRequest,
    SerialActionRequest,
)
from app.schemas.restricted_inventory import (
    IssueRequest,
    LostRequest,
    RestrictedItemCreate,
    RestrictedItemImageOut,
    RestrictedItemOut,
    RestrictedItemUpdate,
    RestrictedSerialUnitCreate,
    RestrictedSerialUnitOut,
    RestrictedTransactionOut,
    ReturnRequest,
)


router = APIRouter(dependencies=[Depends(require_permission("inventory:view"))])


def _ensure_employee(db: Session, employee_id: str) -> None:
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")


def _get_or_create_balance(db: Session, *, employee_id: str, item_code: str) -> RestrictedItemEmployeeBalance:
    bal = (
        db.query(RestrictedItemEmployeeBalance)
        .filter(RestrictedItemEmployeeBalance.employee_id == employee_id)
        .filter(RestrictedItemEmployeeBalance.item_code == item_code)
        .first()
    )
    if bal:
        return bal

    bal = RestrictedItemEmployeeBalance(employee_id=employee_id, item_code=item_code, quantity_issued=0.0)
    db.add(bal)
    db.flush()
    return bal


def _upload_dir() -> str:
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    d = os.path.join(base, "uploads", "restricted-inventory", "images")
    os.makedirs(d, exist_ok=True)
    return d


def _public_url(path: str) -> str:
    fn = os.path.basename(path)
    return f"/uploads/restricted-inventory/images/{fn}"


@router.get("/items", response_model=List[RestrictedItemOut])
async def list_items(db: Session = Depends(get_db)) -> List[RestrictedItemOut]:
    items = db.query(RestrictedItem).order_by(RestrictedItem.id.desc()).all()
    out: List[RestrictedItemOut] = []
    for it in items:
        serial_total: Optional[int] = None
        serial_in_stock: Optional[int] = None
        if it.is_serial_tracked:
            serial_total = (
                db.query(func.count(RestrictedItemSerialUnit.id))
                .filter(RestrictedItemSerialUnit.item_code == it.item_code)
                .scalar()
                or 0
            )
            serial_in_stock = (
                db.query(func.count(RestrictedItemSerialUnit.id))
                .filter(RestrictedItemSerialUnit.item_code == it.item_code)
                .filter(RestrictedItemSerialUnit.status == "in_stock")
                .scalar()
                or 0
            )
        out.append(
            RestrictedItemOut(
                id=it.id,
                item_code=it.item_code,
                category=it.category,
                name=it.name,
                description=it.description,
                is_serial_tracked=it.is_serial_tracked,
                unit_name=it.unit_name,
                quantity_on_hand=float(it.quantity_on_hand or 0.0),
                min_quantity=float(it.min_quantity) if it.min_quantity is not None else None,
                make_model=it.make_model,
                caliber=it.caliber,
                storage_location=it.storage_location,
                requires_maintenance=bool(it.requires_maintenance),
                requires_cleaning=bool(it.requires_cleaning),
                status=it.status,
                serial_total=serial_total,
                serial_in_stock=serial_in_stock,
                created_at=it.created_at,
                updated_at=it.updated_at,
            )
        )
    return out


@router.post("/items", response_model=RestrictedItemOut)
async def create_item(payload: RestrictedItemCreate, db: Session = Depends(get_db)) -> RestrictedItemOut:
    exists = db.query(RestrictedItem).filter(RestrictedItem.item_code == payload.item_code).first()
    if exists:
        raise HTTPException(status_code=400, detail="Item code already exists")

    item = RestrictedItem(**payload.dict())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/employees/{employee_id}/issued", response_model=EmployeeIssuedInventory)
async def get_employee_issued(employee_id: str, db: Session = Depends(get_db)) -> EmployeeIssuedInventory:
    _ensure_employee(db, employee_id)

    serial_units = (
        db.query(RestrictedItemSerialUnit, RestrictedItem)
        .join(RestrictedItem, RestrictedItem.item_code == RestrictedItemSerialUnit.item_code)
        .filter(RestrictedItemSerialUnit.issued_to_employee_id == employee_id)
        .order_by(RestrictedItemSerialUnit.id.desc())
        .all()
    )

    serial_items: List[EmployeeIssuedSerial] = []
    for su, it in serial_units:
        serial_items.append(
            EmployeeIssuedSerial(
                serial_unit_id=su.id,
                item_code=it.item_code,
                item_name=it.name,
                category=it.category,
                serial_number=su.serial_number,
                status=su.status,
                created_at=su.created_at,
            )
        )

    balances = (
        db.query(RestrictedItemEmployeeBalance, RestrictedItem)
        .join(RestrictedItem, RestrictedItem.item_code == RestrictedItemEmployeeBalance.item_code)
        .filter(RestrictedItemEmployeeBalance.employee_id == employee_id)
        .filter(RestrictedItemEmployeeBalance.quantity_issued > 0)
        .order_by(RestrictedItemEmployeeBalance.id.desc())
        .all()
    )

    quantity_items: List[EmployeeIssuedQuantity] = []
    for bal, it in balances:
        quantity_items.append(
            EmployeeIssuedQuantity(
                item_code=it.item_code,
                item_name=it.name,
                category=it.category,
                unit_name=it.unit_name,
                quantity_issued=float(bal.quantity_issued or 0.0),
            )
        )

    return EmployeeIssuedInventory(employee_id=employee_id, serial_items=serial_items, quantity_items=quantity_items)


@router.get("/issued", response_model=List[EmployeeIssuedInventory])
async def list_all_issued(db: Session = Depends(get_db)) -> List[EmployeeIssuedInventory]:
    """Return current issued restricted inventory for all employees.

    This endpoint is intentionally best-effort and does not require that the employee
    record still exists, so allocations can still be managed/returned.
    """

    serial_units = (
        db.query(RestrictedItemSerialUnit, RestrictedItem)
        .join(RestrictedItem, RestrictedItem.item_code == RestrictedItemSerialUnit.item_code)
        .filter(RestrictedItemSerialUnit.issued_to_employee_id.isnot(None))
        .order_by(RestrictedItemSerialUnit.issued_to_employee_id.asc(), RestrictedItemSerialUnit.id.desc())
        .all()
    )

    balances = (
        db.query(RestrictedItemEmployeeBalance, RestrictedItem)
        .join(RestrictedItem, RestrictedItem.item_code == RestrictedItemEmployeeBalance.item_code)
        .filter(RestrictedItemEmployeeBalance.quantity_issued > 0)
        .order_by(RestrictedItemEmployeeBalance.employee_id.asc(), RestrictedItemEmployeeBalance.id.desc())
        .all()
    )

    out_by_emp: dict[str, EmployeeIssuedInventory] = {}

    for su, it in serial_units:
        eid = (su.issued_to_employee_id or "").strip()
        if not eid:
            continue
        inv = out_by_emp.get(eid)
        if not inv:
            inv = EmployeeIssuedInventory(employee_id=eid, serial_items=[], quantity_items=[])
            out_by_emp[eid] = inv
        inv.serial_items.append(
            EmployeeIssuedSerial(
                serial_unit_id=su.id,
                item_code=it.item_code,
                item_name=it.name,
                category=it.category,
                serial_number=su.serial_number,
                status=su.status,
                created_at=su.created_at,
            )
        )

    for bal, it in balances:
        eid = (bal.employee_id or "").strip()
        if not eid:
            continue
        inv = out_by_emp.get(eid)
        if not inv:
            inv = EmployeeIssuedInventory(employee_id=eid, serial_items=[], quantity_items=[])
            out_by_emp[eid] = inv
        inv.quantity_items.append(
            EmployeeIssuedQuantity(
                item_code=it.item_code,
                item_name=it.name,
                category=it.category,
                unit_name=it.unit_name,
                quantity_issued=float(bal.quantity_issued or 0.0),
            )
        )

    return list(out_by_emp.values())


@router.post("/employees/{employee_id}/serials/{serial_unit_id}/{action}")
async def employee_serial_action(
    employee_id: str,
    serial_unit_id: int,
    action: str,
    payload: SerialActionRequest,
    db: Session = Depends(get_db),
) -> dict:
    _ensure_employee(db, employee_id)

    su = db.query(RestrictedItemSerialUnit).filter(RestrictedItemSerialUnit.id == serial_unit_id).first()
    if not su:
        raise HTTPException(status_code=404, detail="Serial unit not found")
    if su.issued_to_employee_id != employee_id:
        raise HTTPException(status_code=400, detail="This serial is not assigned to this employee")

    action_u = (action or "").strip().lower()
    allowed = {"return", "lost", "damaged", "maintenance", "available", "found"}
    if action_u not in allowed:
        raise HTTPException(status_code=400, detail="Invalid action")

    # Actions are designed to be one-click for lay users.
    # - return: goes back to stock and unassign
    # - lost/damaged/maintenance: keep assignment so it stays visible under this employee
    # - available/found: goes back to stock and unassign
    if action_u == "return":
        su.status = "in_stock"
        su.issued_to_employee_id = None
        _log_tx(db, item_code=su.item_code, action="RETURN", employee_id=employee_id, serial_unit_id=su.id, notes=payload.notes)
    elif action_u == "lost":
        su.status = "lost"
        _log_tx(db, item_code=su.item_code, action="LOST", employee_id=employee_id, serial_unit_id=su.id, notes=payload.notes)
    elif action_u == "damaged":
        su.status = "maintenance"
        _log_tx(db, item_code=su.item_code, action="DAMAGED", employee_id=employee_id, serial_unit_id=su.id, notes=payload.notes)
    elif action_u == "maintenance":
        su.status = "maintenance"
        _log_tx(db, item_code=su.item_code, action="MAINTENANCE", employee_id=employee_id, serial_unit_id=su.id, notes=payload.notes)
    elif action_u == "available":
        su.status = "in_stock"
        su.issued_to_employee_id = None
        _log_tx(db, item_code=su.item_code, action="AVAILABLE", employee_id=employee_id, serial_unit_id=su.id, notes=payload.notes)
    elif action_u == "found":
        su.status = "in_stock"
        su.issued_to_employee_id = None
        _log_tx(db, item_code=su.item_code, action="FOUND", employee_id=employee_id, serial_unit_id=su.id, notes=payload.notes)

    db.commit()
    return {"message": "ok"}


@router.post("/employees/{employee_id}/items/{item_code}/{action}")
async def employee_quantity_action(
    employee_id: str,
    item_code: str,
    action: str,
    payload: QuantityActionRequest,
    db: Session = Depends(get_db),
) -> dict:
    _ensure_employee(db, employee_id)

    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.is_serial_tracked:
        raise HTTPException(status_code=400, detail="This endpoint is for quantity-tracked items")

    qty = float(payload.quantity or 0.0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")

    bal = _get_or_create_balance(db, employee_id=employee_id, item_code=item_code)

    action_u = (action or "").strip().lower()
    allowed = {"return", "lost", "damaged", "maintenance", "available", "found"}
    if action_u not in allowed:
        raise HTTPException(status_code=400, detail="Invalid action")

    if action_u in {"return", "lost", "damaged", "maintenance"}:
        if float(bal.quantity_issued or 0.0) < qty:
            raise HTTPException(status_code=400, detail="Employee does not have enough issued quantity")

    if action_u == "return":
        item.quantity_on_hand = float(item.quantity_on_hand or 0.0) + qty
        bal.quantity_issued = float(bal.quantity_issued or 0.0) - qty
        _log_tx(db, item_code=item_code, action="RETURN", employee_id=employee_id, quantity=qty, notes=payload.notes)
    elif action_u == "lost":
        bal.quantity_issued = float(bal.quantity_issued or 0.0) - qty
        _log_tx(db, item_code=item_code, action="LOST", employee_id=employee_id, quantity=qty, notes=payload.notes)
    elif action_u == "damaged":
        bal.quantity_issued = float(bal.quantity_issued or 0.0) - qty
        _log_tx(db, item_code=item_code, action="DAMAGED", employee_id=employee_id, quantity=qty, notes=payload.notes)
    elif action_u == "maintenance":
        _log_tx(db, item_code=item_code, action="MAINTENANCE", employee_id=employee_id, quantity=qty, notes=payload.notes)
    elif action_u == "available":
        _log_tx(db, item_code=item_code, action="AVAILABLE", employee_id=employee_id, quantity=qty, notes=payload.notes)
    elif action_u == "found":
        item.quantity_on_hand = float(item.quantity_on_hand or 0.0) + qty
        _log_tx(db, item_code=item_code, action="FOUND", employee_id=employee_id, quantity=qty, notes=payload.notes)

    db.commit()
    return {"message": "ok"}


@router.get("/items/{item_code}", response_model=RestrictedItemOut)
async def get_item(item_code: str, db: Session = Depends(get_db)) -> RestrictedItemOut:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    serial_total: Optional[int] = None
    serial_in_stock: Optional[int] = None
    if item.is_serial_tracked:
        serial_total = (
            db.query(func.count(RestrictedItemSerialUnit.id))
            .filter(RestrictedItemSerialUnit.item_code == item.item_code)
            .scalar()
            or 0
        )
        serial_in_stock = (
            db.query(func.count(RestrictedItemSerialUnit.id))
            .filter(RestrictedItemSerialUnit.item_code == item.item_code)
            .filter(RestrictedItemSerialUnit.status == "in_stock")
            .scalar()
            or 0
        )

    return RestrictedItemOut(
        id=item.id,
        item_code=item.item_code,
        category=item.category,
        name=item.name,
        description=item.description,
        is_serial_tracked=item.is_serial_tracked,
        unit_name=item.unit_name,
        quantity_on_hand=float(item.quantity_on_hand or 0.0),
        min_quantity=float(item.min_quantity) if item.min_quantity is not None else None,
        make_model=item.make_model,
        caliber=item.caliber,
        storage_location=item.storage_location,
        requires_maintenance=bool(item.requires_maintenance),
        requires_cleaning=bool(item.requires_cleaning),
        status=item.status,
        serial_total=serial_total,
        serial_in_stock=serial_in_stock,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.put("/items/{item_code}", response_model=RestrictedItemOut)
async def update_item(item_code: str, payload: RestrictedItemUpdate, db: Session = Depends(get_db)) -> RestrictedItemOut:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
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
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
    return {"message": "Item deleted"}


@router.get("/items/{item_code}/serials", response_model=List[RestrictedSerialUnitOut])
async def list_serials(item_code: str, db: Session = Depends(get_db)) -> List[RestrictedSerialUnitOut]:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    rows = (
        db.query(RestrictedItemSerialUnit)
        .filter(RestrictedItemSerialUnit.item_code == item_code)
        .order_by(RestrictedItemSerialUnit.id.desc())
        .all()
    )
    return rows


@router.post("/items/{item_code}/serials", response_model=RestrictedSerialUnitOut)
async def add_serial(item_code: str, payload: RestrictedSerialUnitCreate, db: Session = Depends(get_db)) -> RestrictedSerialUnitOut:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if not item.is_serial_tracked:
        raise HTTPException(status_code=400, detail="This item is not serial-tracked")

    sn = (payload.serial_number or "").strip()
    if not sn:
        raise HTTPException(status_code=400, detail="Serial number is required")

    existing = (
        db.query(RestrictedItemSerialUnit)
        .filter(RestrictedItemSerialUnit.item_code == item_code)
        .filter(RestrictedItemSerialUnit.serial_number == sn)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Serial already exists")

    unit = RestrictedItemSerialUnit(item_code=item_code, serial_number=sn, status="in_stock")
    db.add(unit)

    tx = RestrictedItemTransaction(item_code=item_code, action="ADJUST", quantity=None, notes=f"Serial added: {sn}")
    db.add(tx)

    db.commit()
    db.refresh(unit)

    return unit


@router.get("/items/{item_code}/images", response_model=List[RestrictedItemImageOut])
async def list_images(item_code: str, db: Session = Depends(get_db)) -> List[RestrictedItemImageOut]:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    imgs = (
        db.query(RestrictedItemImage)
        .filter(RestrictedItemImage.item_code == item_code)
        .order_by(RestrictedItemImage.id.desc())
        .all()
    )

    out: List[RestrictedItemImageOut] = []
    for img in imgs:
        out.append(
            RestrictedItemImageOut(
                id=img.id,
                item_code=img.item_code,
                filename=img.filename,
                url=_public_url(img.path),
                mime_type=img.mime_type,
                created_at=img.created_at,
                updated_at=img.updated_at,
            )
        )
    return out


@router.post("/items/{item_code}/images", response_model=RestrictedItemImageOut)
async def upload_image(
    item_code: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> RestrictedItemImageOut:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
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

    img = RestrictedItemImage(
        item_code=item_code,
        filename=file.filename or safe_name,
        path=dest,
        mime_type=ct,
    )

    db.add(img)
    db.commit()
    db.refresh(img)

    return RestrictedItemImageOut(
        id=img.id,
        item_code=img.item_code,
        filename=img.filename,
        url=_public_url(img.path),
        mime_type=img.mime_type,
        created_at=img.created_at,
        updated_at=img.updated_at,
    )


@router.delete("/items/{item_code}/images/{image_id}")
async def delete_image(item_code: str, image_id: int, db: Session = Depends(get_db)) -> dict:
    img = (
        db.query(RestrictedItemImage)
        .filter(RestrictedItemImage.id == image_id)
        .filter(RestrictedItemImage.item_code == item_code)
        .first()
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        if img.path and os.path.exists(img.path):
            os.remove(img.path)
    except Exception:
        pass

    db.delete(img)
    db.commit()

    return {"message": "Image deleted"}


def _log_tx(
    db: Session,
    *,
    item_code: str,
    action: str,
    employee_id: Optional[str] = None,
    serial_unit_id: Optional[int] = None,
    quantity: Optional[float] = None,
    condition_note: Optional[str] = None,
    notes: Optional[str] = None,
) -> None:
    tx = RestrictedItemTransaction(
        item_code=item_code,
        action=action,
        employee_id=employee_id,
        serial_unit_id=serial_unit_id,
        quantity=quantity,
        condition_note=condition_note,
        notes=notes,
    )
    db.add(tx)


@router.get("/transactions", response_model=List[RestrictedTransactionOut])
async def list_transactions(
    item_code: Optional[str] = None,
    employee_id: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
) -> List[RestrictedTransactionOut]:
    q = db.query(RestrictedItemTransaction)
    if item_code:
        q = q.filter(RestrictedItemTransaction.item_code == item_code)
    if employee_id:
        q = q.filter(RestrictedItemTransaction.employee_id == employee_id)
    return q.order_by(RestrictedItemTransaction.id.desc()).limit(min(max(limit, 1), 500)).all()


@router.post("/items/{item_code}/issue", response_model=List[RestrictedTransactionOut])
async def issue_item(item_code: str, payload: IssueRequest, db: Session = Depends(get_db)) -> List[RestrictedTransactionOut]:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    employee_id = (payload.employee_id or "").strip()
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee ID is required")
    _ensure_employee(db, employee_id)

    created: List[RestrictedItemTransaction] = []

    if item.is_serial_tracked:
        sns = payload.serial_numbers or []
        sns = [s.strip() for s in sns if s and s.strip()]
        if not sns:
            raise HTTPException(status_code=400, detail="serial_numbers are required for serial-tracked items")

        units = (
            db.query(RestrictedItemSerialUnit)
            .filter(RestrictedItemSerialUnit.item_code == item_code)
            .filter(RestrictedItemSerialUnit.serial_number.in_(sns))
            .all()
        )
        found = {u.serial_number: u for u in units}
        missing = [sn for sn in sns if sn not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Serial(s) not found: {', '.join(missing)}")

        for sn in sns:
            u = found[sn]
            if u.status != "in_stock":
                raise HTTPException(status_code=400, detail=f"Serial {sn} is not available")
            u.status = "issued"
            u.issued_to_employee_id = employee_id
            _log_tx(db, item_code=item_code, action="ISSUE", employee_id=employee_id, serial_unit_id=u.id, notes=payload.notes)

    else:
        qty = payload.quantity
        if qty is None or qty <= 0:
            raise HTTPException(status_code=400, detail="quantity must be > 0")
        if item.quantity_on_hand < qty:
            raise HTTPException(status_code=400, detail="Not enough stock")

        item.quantity_on_hand = float(item.quantity_on_hand) - float(qty)
        if employee_id:
            bal = _get_or_create_balance(db, employee_id=employee_id, item_code=item_code)
            bal.quantity_issued = float(bal.quantity_issued or 0.0) + float(qty)
        _log_tx(db, item_code=item_code, action="ISSUE", employee_id=employee_id, quantity=float(qty), notes=payload.notes)

    db.commit()

    # return latest transactions for this request
    txs = (
        db.query(RestrictedItemTransaction)
        .filter(RestrictedItemTransaction.item_code == item_code)
        .order_by(RestrictedItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))


@router.post("/items/{item_code}/return", response_model=List[RestrictedTransactionOut])
async def return_item(item_code: str, payload: ReturnRequest, db: Session = Depends(get_db)) -> List[RestrictedTransactionOut]:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    employee_id = (payload.employee_id or "").strip()
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee ID is required")
    _ensure_employee(db, employee_id)

    created: List[RestrictedItemTransaction] = []

    if item.is_serial_tracked:
        sns = payload.serial_numbers or []
        sns = [s.strip() for s in sns if s and s.strip()]
        if not sns:
            raise HTTPException(status_code=400, detail="serial_numbers are required for serial-tracked items")

        units = (
            db.query(RestrictedItemSerialUnit)
            .filter(RestrictedItemSerialUnit.item_code == item_code)
            .filter(RestrictedItemSerialUnit.serial_number.in_(sns))
            .all()
        )
        found = {u.serial_number: u for u in units}
        missing = [sn for sn in sns if sn not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Serial(s) not found: {', '.join(missing)}")

        for sn in sns:
            u = found[sn]
            if u.status != "issued":
                raise HTTPException(status_code=400, detail=f"Serial {sn} is not issued")
            u.status = "in_stock"
            u.issued_to_employee_id = None
            _log_tx(db, item_code=item_code, action="RETURN", employee_id=employee_id, serial_unit_id=u.id, notes=payload.notes)

    else:
        qty = payload.quantity
        if qty is None or qty <= 0:
            raise HTTPException(status_code=400, detail="quantity must be > 0")

        item.quantity_on_hand = float(item.quantity_on_hand) + float(qty)

        if employee_id:
            bal = _get_or_create_balance(db, employee_id=employee_id, item_code=item_code)
            if float(bal.quantity_issued or 0.0) < float(qty):
                raise HTTPException(status_code=400, detail="Employee does not have enough issued quantity")
            bal.quantity_issued = float(bal.quantity_issued or 0.0) - float(qty)

        _log_tx(db, item_code=item_code, action="RETURN", employee_id=employee_id, quantity=float(qty), notes=payload.notes)

    db.commit()

    txs = (
        db.query(RestrictedItemTransaction)
        .filter(RestrictedItemTransaction.item_code == item_code)
        .order_by(RestrictedItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))


@router.post("/items/{item_code}/maintenance", response_model=List[RestrictedTransactionOut])
async def mark_maintenance(item_code: str, payload: LostRequest, db: Session = Depends(get_db)) -> List[RestrictedTransactionOut]:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if item.is_serial_tracked:
        sns = payload.serial_numbers or []
        sns = [s.strip() for s in sns if s and s.strip()]
        if not sns:
            raise HTTPException(status_code=400, detail="serial_numbers are required for serial-tracked items")

        units = (
            db.query(RestrictedItemSerialUnit)
            .filter(RestrictedItemSerialUnit.item_code == item_code)
            .filter(RestrictedItemSerialUnit.serial_number.in_(sns))
            .all()
        )
        found = {u.serial_number: u for u in units}
        missing = [sn for sn in sns if sn not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Serial(s) not found: {', '.join(missing)}")

        for sn in sns:
            u = found[sn]
            u.status = "maintenance"
            u.issued_to_employee_id = None
            _log_tx(db, item_code=item_code, action="MAINTENANCE", employee_id=payload.employee_id, serial_unit_id=u.id, notes=payload.notes)

    else:
        qty = payload.quantity
        if qty is None or qty <= 0:
            raise HTTPException(status_code=400, detail="quantity must be > 0")
        _log_tx(db, item_code=item_code, action="MAINTENANCE", employee_id=payload.employee_id, quantity=float(qty), notes=payload.notes)

    db.commit()

    txs = (
        db.query(RestrictedItemTransaction)
        .filter(RestrictedItemTransaction.item_code == item_code)
        .order_by(RestrictedItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))


@router.post("/items/{item_code}/cleaning", response_model=List[RestrictedTransactionOut])
async def mark_cleaning(item_code: str, payload: LostRequest, db: Session = Depends(get_db)) -> List[RestrictedTransactionOut]:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if item.is_serial_tracked:
        sns = payload.serial_numbers or []
        sns = [s.strip() for s in sns if s and s.strip()]
        if not sns:
            raise HTTPException(status_code=400, detail="serial_numbers are required for serial-tracked items")

        units = (
            db.query(RestrictedItemSerialUnit)
            .filter(RestrictedItemSerialUnit.item_code == item_code)
            .filter(RestrictedItemSerialUnit.serial_number.in_(sns))
            .all()
        )
        found = {u.serial_number: u for u in units}
        missing = [sn for sn in sns if sn not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Serial(s) not found: {', '.join(missing)}")

        for sn in sns:
            u = found[sn]
            _log_tx(db, item_code=item_code, action="CLEANING", employee_id=payload.employee_id, serial_unit_id=u.id, notes=payload.notes)

    else:
        qty = payload.quantity
        if qty is None or qty <= 0:
            raise HTTPException(status_code=400, detail="quantity must be > 0")
        _log_tx(db, item_code=item_code, action="CLEANING", employee_id=payload.employee_id, quantity=float(qty), notes=payload.notes)

    db.commit()

    txs = (
        db.query(RestrictedItemTransaction)
        .filter(RestrictedItemTransaction.item_code == item_code)
        .order_by(RestrictedItemTransaction.id.desc())
        .limit(50)
        .all()
    )
    return list(reversed(txs))


@router.post("/items/{item_code}/adjust", response_model=RestrictedItemOut)
async def adjust_stock(item_code: str, payload: RestrictedItemUpdate, db: Session = Depends(get_db)) -> RestrictedItemOut:
    item = db.query(RestrictedItem).filter(RestrictedItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.is_serial_tracked:
        raise HTTPException(status_code=400, detail="Use serial endpoints for serial-tracked items")

    if payload.quantity_on_hand is None:
        raise HTTPException(status_code=400, detail="quantity_on_hand is required")

    item.quantity_on_hand = float(payload.quantity_on_hand)
    _log_tx(db, item_code=item_code, action="ADJUST", quantity=float(item.quantity_on_hand), notes="Stock adjusted")
    db.commit()
    db.refresh(item)
    return item
