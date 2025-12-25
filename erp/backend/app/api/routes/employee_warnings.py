import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.employee import Employee
from app.models.employee_warning import EmployeeWarning
from app.models.employee_warning_document import EmployeeWarningDocument
from app.schemas.employee_warning import EmployeeWarningCreate, EmployeeWarningOut
from app.schemas.employee_warning_document import EmployeeWarningDocumentOut


router = APIRouter()


def _base_upload_dir() -> str:
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    d = os.path.join(base, "uploads", "employees")
    os.makedirs(d, exist_ok=True)
    return d


def _warning_upload_dir(employee_db_id: int, warning_id: int) -> str:
    d = os.path.join(_base_upload_dir(), str(employee_db_id), "warnings", str(warning_id))
    os.makedirs(d, exist_ok=True)
    return d


def _public_url(employee_db_id: int, warning_id: int, path: str) -> str:
    fn = os.path.basename(path)
    return f"/uploads/employees/{employee_db_id}/warnings/{warning_id}/{fn}"


@router.get("/by-db-id/{employee_db_id}/warnings", response_model=List[EmployeeWarningOut])
async def list_employee_warnings(employee_db_id: int, db: Session = Depends(get_db)) -> List[EmployeeWarningOut]:
    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    rows = (
        db.query(EmployeeWarning)
        .filter(EmployeeWarning.employee_db_id == employee_db_id)
        .order_by(EmployeeWarning.id.desc())
        .all()
    )
    return rows


@router.post("/by-db-id/{employee_db_id}/warnings", response_model=EmployeeWarningOut)
async def create_employee_warning(
    employee_db_id: int,
    payload: EmployeeWarningCreate,
    db: Session = Depends(get_db),
) -> EmployeeWarningOut:
    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    warning_number = (payload.warning_number or "").strip()
    if not warning_number:
        raise HTTPException(status_code=400, detail="warning_number is required")

    w = EmployeeWarning(
        employee_db_id=employee_db_id,
        warning_number=warning_number,
        found_with=(payload.found_with or None),
        notice_text=((payload.notice_text or "").strip() or None),
        supervisor_signature=(payload.supervisor_signature or None),
        supervisor_signature_date=(payload.supervisor_signature_date or None),
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


@router.delete("/by-db-id/{employee_db_id}/warnings/{warning_id}")
async def delete_employee_warning(employee_db_id: int, warning_id: int, db: Session = Depends(get_db)) -> dict:
    w = (
        db.query(EmployeeWarning)
        .filter(EmployeeWarning.id == warning_id)
        .filter(EmployeeWarning.employee_db_id == employee_db_id)
        .first()
    )
    if not w:
        raise HTTPException(status_code=404, detail="Warning not found")

    docs = db.query(EmployeeWarningDocument).filter(EmployeeWarningDocument.warning_id == warning_id).all()
    for d in docs:
        try:
            if d.path and os.path.exists(d.path):
                os.remove(d.path)
        except Exception:
            pass
        db.delete(d)

    db.delete(w)
    db.commit()
    return {"message": "Warning deleted"}


@router.get("/warnings/{warning_id}/documents", response_model=List[EmployeeWarningDocumentOut])
async def list_warning_documents(warning_id: int, db: Session = Depends(get_db)) -> List[EmployeeWarningDocumentOut]:
    w = db.query(EmployeeWarning).filter(EmployeeWarning.id == warning_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warning not found")

    docs = (
        db.query(EmployeeWarningDocument)
        .filter(EmployeeWarningDocument.warning_id == warning_id)
        .order_by(EmployeeWarningDocument.id.desc())
        .all()
    )

    out: List[EmployeeWarningDocumentOut] = []
    for d in docs:
        out.append(
            EmployeeWarningDocumentOut(
                id=d.id,
                warning_id=d.warning_id,
                filename=d.filename,
                url=_public_url(w.employee_db_id, warning_id, d.path),
                mime_type=d.mime_type,
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
        )
    return out


@router.post("/warnings/{warning_id}/documents", response_model=EmployeeWarningDocumentOut)
async def upload_warning_document(
    warning_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> EmployeeWarningDocumentOut:
    w = db.query(EmployeeWarning).filter(EmployeeWarning.id == warning_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warning not found")

    ct = file.content_type or "application/octet-stream"

    ext = os.path.splitext(file.filename or "")[-1]
    safe_name = f"warn_{warning_id}_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(_warning_upload_dir(w.employee_db_id, warning_id), safe_name)

    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    doc = EmployeeWarningDocument(
        warning_id=warning_id,
        filename=file.filename or safe_name,
        path=dest,
        mime_type=ct,
    )

    db.add(doc)
    db.commit()
    db.refresh(doc)

    return EmployeeWarningDocumentOut(
        id=doc.id,
        warning_id=doc.warning_id,
        filename=doc.filename,
        url=_public_url(w.employee_db_id, warning_id, doc.path),
        mime_type=doc.mime_type,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.delete("/warnings/{warning_id}/documents/{doc_id}")
async def delete_warning_document(warning_id: int, doc_id: int, db: Session = Depends(get_db)) -> dict:
    doc = (
        db.query(EmployeeWarningDocument)
        .filter(EmployeeWarningDocument.id == doc_id)
        .filter(EmployeeWarningDocument.warning_id == warning_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        if doc.path and os.path.exists(doc.path):
            os.remove(doc.path)
    except Exception:
        pass

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted"}
