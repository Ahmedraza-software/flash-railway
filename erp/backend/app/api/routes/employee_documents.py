import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.employee import Employee
from app.models.employee_document import EmployeeDocument
from app.schemas.employee_document import EmployeeDocumentOut


router = APIRouter()


def _upload_dir(employee_db_id: int) -> str:
    # backend/app/api/routes -> project root
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    d = os.path.join(base, "uploads", "employees", str(employee_db_id))
    os.makedirs(d, exist_ok=True)
    return d


def _public_url(employee_db_id: int, path: str) -> str:
    fn = os.path.basename(path)
    return f"/uploads/employees/{employee_db_id}/{fn}"


@router.get("/by-db-id/{employee_db_id}/documents", response_model=List[EmployeeDocumentOut])
async def list_employee_documents(employee_db_id: int, db: Session = Depends(get_db)) -> List[EmployeeDocumentOut]:
    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    docs = (
        db.query(EmployeeDocument)
        .filter(EmployeeDocument.employee_db_id == employee_db_id)
        .order_by(EmployeeDocument.id.desc())
        .all()
    )

    out: List[EmployeeDocumentOut] = []
    for d in docs:
        out.append(
            EmployeeDocumentOut(
                id=d.id,
                employee_db_id=d.employee_db_id,
                name=d.name,
                filename=d.filename,
                url=_public_url(employee_db_id, d.path),
                mime_type=d.mime_type,
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
        )
    return out


@router.post("/by-db-id/{employee_db_id}/documents", response_model=EmployeeDocumentOut)
async def upload_employee_document(
    employee_db_id: int,
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> EmployeeDocumentOut:
    emp = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if not name.strip():
        raise HTTPException(status_code=400, detail="Document name is required")

    ct = file.content_type or "application/octet-stream"

    ext = os.path.splitext(file.filename or "")[-1]
    safe_name = f"emp_{employee_db_id}_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(_upload_dir(employee_db_id), safe_name)

    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    doc = EmployeeDocument(
        employee_db_id=employee_db_id,
        name=name.strip(),
        filename=file.filename or safe_name,
        path=dest,
        mime_type=ct,
    )

    db.add(doc)
    db.commit()
    db.refresh(doc)

    return EmployeeDocumentOut(
        id=doc.id,
        employee_db_id=doc.employee_db_id,
        name=doc.name,
        filename=doc.filename,
        url=_public_url(employee_db_id, doc.path),
        mime_type=doc.mime_type,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.delete("/by-db-id/{employee_db_id}/documents/{doc_id}")
async def delete_employee_document(employee_db_id: int, doc_id: int, db: Session = Depends(get_db)) -> dict:
    doc = (
        db.query(EmployeeDocument)
        .filter(EmployeeDocument.id == doc_id)
        .filter(EmployeeDocument.employee_db_id == employee_db_id)
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
