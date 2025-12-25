import json
import os
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fpdf import FPDF
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.employee import Employee
from app.models.client import Client
from app.models.client_address import ClientAddress
from app.models.client_contact import ClientContact
from app.models.client_contract import ClientContract
from app.models.client_document import ClientDocument
from app.models.client_guard_requirement import ClientGuardRequirement
from app.models.client_site_guard_allocation import ClientSiteGuardAllocation
from app.models.client_invoice import ClientInvoice
from app.models.client_rate_card import ClientRateCard
from app.models.client_site import ClientSite
from app.schemas.client_management import (
    ClientAddressCreate,
    ClientAddressOut,
    ClientAddressUpdate,
    ClientContactCreate,
    ClientContactOut,
    ClientContactUpdate,
    ClientContractCreate,
    ClientContractOut,
    ClientContractUpdate,
    ClientCreate,
    ClientDetailOut,
    ClientDocumentCreate,
    ClientDocumentOut,
    ClientDocumentUpdate,
    ClientGuardRequirementCreate,
    ClientGuardRequirementOut,
    ClientGuardRequirementUpdate,
    ClientContractRequirementOut,
    ClientSiteGuardAllocationCreate,
    ClientSiteGuardAllocationOut,
    SuggestedEmployeeOut,
    ClientInvoiceCreate,
    ClientInvoiceOut,
    ClientInvoiceUpdate,
    ClientOut,
    ClientRateCardCreate,
    ClientRateCardOut,
    ClientRateCardUpdate,
    ClientSiteCreate,
    ClientSiteOut,
    ClientSiteUpdate,
    ClientUpdate,
)


router = APIRouter(dependencies=[Depends(require_permission("clients:view"))])


def _parse_ym(v: str) -> date:
    try:
        parts = (v or "").strip().split("-")
        if len(parts) != 2:
            raise ValueError("invalid")
        y = int(parts[0])
        m = int(parts[1])
        return date(y, m, 1)
    except Exception:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")


def _add_months(d: date, months: int) -> date:
    # months can be negative
    y = d.year
    m = d.month + months
    while m > 12:
        y += 1
        m -= 12
    while m < 1:
        y -= 1
        m += 12
    return date(y, m, 1)


def _project_root() -> str:
    # backend/app/api/routes -> project root
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))


def _client_upload_dir(client_id: int) -> str:
    d = os.path.join(_project_root(), "uploads", "clients", str(client_id))
    os.makedirs(d, exist_ok=True)
    return d


def _client_public_url(client_id: int, abs_path: str) -> str:
    fn = os.path.basename(abs_path)
    return f"/uploads/clients/{client_id}/{fn}"


def _parse_invoice_number(invoice_number: str) -> dict:
    # expected: INV-{client_id}-{site_id}-{requirement_id}-{timestamp}
    try:
        parts = str(invoice_number or "").split("-")
        if len(parts) < 5 or parts[0] != "INV":
            return {}
        return {
            "client_id": int(parts[1]),
            "site_id": int(parts[2]),
            "requirement_id": int(parts[3]),
        }
    except Exception:
        return {}


def _pdf_new_document() -> FPDF:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_left_margin(14)
    pdf.set_right_margin(14)
    pdf.add_page()
    return pdf


def _pdf_text(pdf: FPDF, text: str, bold: bool = False, size: int = 10, ln: bool = True) -> None:
    pdf.set_font("Helvetica", "B" if bold else "", size)
    pdf.multi_cell(0, 6, "" if text is None else str(text))
    if ln:
        pdf.ln(1)


def _parse_json_list(v: Optional[str]) -> list:
    if not v:
        return []
    try:
        parsed = json.loads(v)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _employee_languages(e: Employee) -> list[str]:
    out: list[str] = []
    for x in _parse_json_list(getattr(e, "languages_spoken", None)):
        if x is None:
            continue
        s = str(x).strip()
        if s:
            out.append(s)

    for x in _parse_json_list(getattr(e, "languages_proficiency", None)):
        if isinstance(x, dict):
            lang = str(x.get("language") or "").strip()
            if lang:
                out.append(lang)

    # dedupe while keeping order
    seen = set()
    uniq: list[str] = []
    for s in out:
        k = s.lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(s)
    return uniq


def _ranges_overlap(a_start: Optional[date], a_end: Optional[date], b_start: Optional[date], b_end: Optional[date]) -> bool:
    # Treat None as open-ended
    left_start = a_start or date.min
    left_end = a_end or date.max
    right_start = b_start or date.min
    right_end = b_end or date.max
    return left_start <= right_end and right_start <= left_end


def _get_client(db: Session, client_id: int) -> Client:
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.get("/clients", response_model=List[ClientOut])
async def list_clients(db: Session = Depends(get_db)) -> List[ClientOut]:
    return db.query(Client).order_by(Client.id.desc()).all()


@router.post("/clients", response_model=ClientOut)
async def create_client(payload: ClientCreate, db: Session = Depends(get_db)) -> ClientOut:
    exists = db.query(Client).filter(Client.client_code == payload.client_code).first()
    if exists:
        raise HTTPException(status_code=400, detail="Client code already exists")
    c = Client(**payload.dict())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.get("/clients/{client_id}", response_model=ClientDetailOut)
async def get_client(client_id: int, db: Session = Depends(get_db)) -> ClientDetailOut:
    c = _get_client(db, client_id)

    contacts = db.query(ClientContact).filter(ClientContact.client_id == client_id).order_by(ClientContact.id.desc()).all()
    addresses = db.query(ClientAddress).filter(ClientAddress.client_id == client_id).order_by(ClientAddress.id.desc()).all()
    sites = db.query(ClientSite).filter(ClientSite.client_id == client_id).order_by(ClientSite.id.desc()).all()
    contracts = db.query(ClientContract).filter(ClientContract.client_id == client_id).order_by(ClientContract.id.desc()).all()
    rate_cards = db.query(ClientRateCard).filter(ClientRateCard.client_id == client_id).order_by(ClientRateCard.id.desc()).all()
    invoices = db.query(ClientInvoice).filter(ClientInvoice.client_id == client_id).order_by(ClientInvoice.id.desc()).all()
    documents = db.query(ClientDocument).filter(ClientDocument.client_id == client_id).order_by(ClientDocument.id.desc()).all()

    return ClientDetailOut(
        id=c.id,
        client_code=c.client_code,
        client_name=c.client_name,
        client_type=c.client_type,
        industry_type=c.industry_type,
        status=c.status,
        location=c.location,
        address=c.address,
        phone=c.phone,
        email=c.email,
        registration_number=c.registration_number,
        vat_gst_number=c.vat_gst_number,
        website=c.website,
        notes=c.notes,
        created_at=c.created_at,
        updated_at=c.updated_at,
        contacts=contacts,
        addresses=addresses,
        sites=sites,
        contracts=contracts,
        rate_cards=rate_cards,
        invoices=invoices,
        documents=documents,
    )


@router.put("/clients/{client_id}", response_model=ClientOut)
async def update_client(client_id: int, payload: ClientUpdate, db: Session = Depends(get_db)) -> ClientOut:
    c = _get_client(db, client_id)
    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/clients/{client_id}")
async def delete_client(client_id: int, db: Session = Depends(get_db)) -> dict:
    c = _get_client(db, client_id)
    db.delete(c)
    db.commit()
    return {"message": "Client deleted"}


@router.get("/clients/{client_id}/contacts", response_model=List[ClientContactOut])
async def list_contacts(client_id: int, db: Session = Depends(get_db)) -> List[ClientContactOut]:
    _get_client(db, client_id)
    return db.query(ClientContact).filter(ClientContact.client_id == client_id).order_by(ClientContact.id.desc()).all()


@router.post("/clients/{client_id}/contacts", response_model=ClientContactOut)
async def create_contact(client_id: int, payload: ClientContactCreate, db: Session = Depends(get_db)) -> ClientContactOut:
    _get_client(db, client_id)
    c = ClientContact(client_id=client_id, **payload.dict())
    c.is_primary = 1 if payload.is_primary else 0
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/clients/{client_id}/contacts/{contact_id}", response_model=ClientContactOut)
async def update_contact(
    client_id: int,
    contact_id: int,
    payload: ClientContactUpdate,
    db: Session = Depends(get_db),
) -> ClientContactOut:
    _get_client(db, client_id)
    row = db.query(ClientContact).filter(ClientContact.id == contact_id).filter(ClientContact.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    upd = payload.dict(exclude_unset=True)
    if "is_primary" in upd and upd["is_primary"] is not None:
        upd["is_primary"] = 1 if upd["is_primary"] else 0
    for k, v in upd.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/clients/{client_id}/contacts/{contact_id}")
async def delete_contact(client_id: int, contact_id: int, db: Session = Depends(get_db)) -> dict:
    _get_client(db, client_id)
    row = db.query(ClientContact).filter(ClientContact.id == contact_id).filter(ClientContact.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(row)
    db.commit()
    return {"message": "Contact deleted"}


@router.get("/clients/{client_id}/addresses", response_model=List[ClientAddressOut])
async def list_addresses(client_id: int, db: Session = Depends(get_db)) -> List[ClientAddressOut]:
    _get_client(db, client_id)
    return db.query(ClientAddress).filter(ClientAddress.client_id == client_id).order_by(ClientAddress.id.desc()).all()


@router.post("/clients/{client_id}/addresses", response_model=ClientAddressOut)
async def create_address(client_id: int, payload: ClientAddressCreate, db: Session = Depends(get_db)) -> ClientAddressOut:
    _get_client(db, client_id)
    row = ClientAddress(client_id=client_id, **payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/clients/{client_id}/addresses/{address_id}", response_model=ClientAddressOut)
async def update_address(
    client_id: int,
    address_id: int,
    payload: ClientAddressUpdate,
    db: Session = Depends(get_db),
) -> ClientAddressOut:
    _get_client(db, client_id)
    row = db.query(ClientAddress).filter(ClientAddress.id == address_id).filter(ClientAddress.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Address not found")
    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/clients/{client_id}/addresses/{address_id}")
async def delete_address(client_id: int, address_id: int, db: Session = Depends(get_db)) -> dict:
    _get_client(db, client_id)
    row = db.query(ClientAddress).filter(ClientAddress.id == address_id).filter(ClientAddress.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Address not found")
    db.delete(row)
    db.commit()
    return {"message": "Address deleted"}


@router.get("/clients/{client_id}/sites", response_model=List[ClientSiteOut])
async def list_sites(client_id: int, db: Session = Depends(get_db)) -> List[ClientSiteOut]:
    _get_client(db, client_id)
    return db.query(ClientSite).filter(ClientSite.client_id == client_id).order_by(ClientSite.id.desc()).all()


@router.post("/clients/{client_id}/sites", response_model=ClientSiteOut)
async def create_site(client_id: int, payload: ClientSiteCreate, db: Session = Depends(get_db)) -> ClientSiteOut:
    _get_client(db, client_id)
    row = ClientSite(client_id=client_id, **payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/clients/{client_id}/sites/{site_id}", response_model=ClientSiteOut)
async def update_site(client_id: int, site_id: int, payload: ClientSiteUpdate, db: Session = Depends(get_db)) -> ClientSiteOut:
    _get_client(db, client_id)
    row = db.query(ClientSite).filter(ClientSite.id == site_id).filter(ClientSite.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Site not found")
    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/clients/{client_id}/sites/{site_id}")
async def delete_site(client_id: int, site_id: int, db: Session = Depends(get_db)) -> dict:
    _get_client(db, client_id)
    row = db.query(ClientSite).filter(ClientSite.id == site_id).filter(ClientSite.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Site not found")
    db.delete(row)
    db.commit()
    return {"message": "Site deleted"}


@router.get("/clients/{client_id}/contract-requirements", response_model=List[ClientContractRequirementOut])
async def list_contract_requirements(client_id: int, db: Session = Depends(get_db)) -> List[ClientContractRequirementOut]:
    _get_client(db, client_id)
    rows = (
        db.query(ClientGuardRequirement, ClientSite)
        .join(ClientSite, ClientSite.id == ClientGuardRequirement.site_id)
        .filter(ClientSite.client_id == client_id)
        .order_by(ClientGuardRequirement.id.desc())
        .all()
    )

    out: list[ClientContractRequirementOut] = []
    for req, site in rows:
        out.append(
            ClientContractRequirementOut(
                id=int(req.id),
                site_id=int(req.site_id),
                site_name=str(site.site_name or ""),
                site_status=str(site.status) if getattr(site, "status", None) is not None else None,
                guard_type=str(req.guard_type),
                number_of_guards=int(req.number_of_guards or 0),
                shift_type=req.shift_type,
                shift_start=req.shift_start,
                shift_end=req.shift_end,
                start_date=req.start_date,
                end_date=req.end_date,
                preferred_language=req.preferred_language,
                monthly_amount=req.monthly_amount,
                weekly_off_rules=req.weekly_off_rules,
                special_instructions=req.special_instructions,
                created_at=req.created_at,
                updated_at=req.updated_at,
            )
        )
    return out


@router.get("/clients/{client_id}/contracts", response_model=List[ClientContractOut])
async def list_contracts(client_id: int, db: Session = Depends(get_db)) -> List[ClientContractOut]:
    _get_client(db, client_id)
    return db.query(ClientContract).filter(ClientContract.client_id == client_id).order_by(ClientContract.id.desc()).all()


@router.get("/clients/{client_id}/contracts/{contract_id}", response_model=ClientContractOut)
async def get_contract(client_id: int, contract_id: int, db: Session = Depends(get_db)) -> ClientContractOut:
    _get_client(db, client_id)
    contract = db.query(ClientContract).filter(
        ClientContract.id == contract_id,
        ClientContract.client_id == client_id
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


@router.post("/clients/{client_id}/contracts", response_model=ClientContractOut)
async def create_contract(client_id: int, payload: ClientContractCreate, db: Session = Depends(get_db)) -> ClientContractOut:
    _get_client(db, client_id)
    exists = db.query(ClientContract).filter(ClientContract.contract_number == payload.contract_number).first()
    if exists:
        raise HTTPException(status_code=400, detail="Contract number already exists")
    row = ClientContract(client_id=client_id, **payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/clients/{client_id}/contracts/{contract_id}", response_model=ClientContractOut)
async def update_contract(
    client_id: int,
    contract_id: int,
    payload: ClientContractUpdate,
    db: Session = Depends(get_db),
) -> ClientContractOut:
    from app.models.employee2 import Employee2
    
    _get_client(db, client_id)
    row = db.query(ClientContract).filter(ClientContract.id == contract_id).filter(ClientContract.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    prev_status = row.status
    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(row, k, v)
    
    # If contract is ended, release all allocated guards
    new_status = upd.get("status", prev_status)
    if prev_status != "Ended" and new_status == "Ended":
        allocations = (
            db.query(ClientSiteGuardAllocation)
            .filter(ClientSiteGuardAllocation.contract_id == contract_id)
            .filter(ClientSiteGuardAllocation.status == "Active")
            .all()
        )
        for alloc in allocations:
            alloc.status = "Released"
            # Update employee status to Free
            emp = db.query(Employee2).filter(Employee2.id == alloc.employee_db_id).first()
            if emp:
                emp.allocation_status = "Free"
    
    db.commit()
    db.refresh(row)
    return row


@router.delete("/clients/{client_id}/contracts/{contract_id}")
async def delete_contract(client_id: int, contract_id: int, db: Session = Depends(get_db)) -> dict:
    from app.models.employee2 import Employee2
    
    _get_client(db, client_id)
    row = db.query(ClientContract).filter(ClientContract.id == contract_id).filter(ClientContract.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Release all allocated guards before deleting
    allocations = (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.contract_id == contract_id)
        .all()
    )
    for alloc in allocations:
        emp = db.query(Employee2).filter(Employee2.id == alloc.employee_db_id).first()
        if emp:
            emp.allocation_status = "Free"
        db.delete(alloc)
    
    db.delete(row)
    db.commit()
    return {"message": "Contract deleted"}


@router.get("/clients/{client_id}/rate-cards", response_model=List[ClientRateCardOut])
async def list_rate_cards(client_id: int, db: Session = Depends(get_db)) -> List[ClientRateCardOut]:
    _get_client(db, client_id)
    return db.query(ClientRateCard).filter(ClientRateCard.client_id == client_id).order_by(ClientRateCard.id.desc()).all()


@router.post("/clients/{client_id}/rate-cards", response_model=ClientRateCardOut)
async def create_rate_card(client_id: int, payload: ClientRateCardCreate, db: Session = Depends(get_db)) -> ClientRateCardOut:
    _get_client(db, client_id)
    row = ClientRateCard(client_id=client_id, **payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/clients/{client_id}/rate-cards/{rate_id}", response_model=ClientRateCardOut)
async def update_rate_card(client_id: int, rate_id: int, payload: ClientRateCardUpdate, db: Session = Depends(get_db)) -> ClientRateCardOut:
    _get_client(db, client_id)
    row = db.query(ClientRateCard).filter(ClientRateCard.id == rate_id).filter(ClientRateCard.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rate card not found")
    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/clients/{client_id}/rate-cards/{rate_id}")
async def delete_rate_card(client_id: int, rate_id: int, db: Session = Depends(get_db)) -> dict:
    _get_client(db, client_id)
    row = db.query(ClientRateCard).filter(ClientRateCard.id == rate_id).filter(ClientRateCard.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rate card not found")
    db.delete(row)
    db.commit()
    return {"message": "Rate card deleted"}


@router.get("/clients/{client_id}/invoices", response_model=List[ClientInvoiceOut])
async def list_invoices(client_id: int, db: Session = Depends(get_db)) -> List[ClientInvoiceOut]:
    _get_client(db, client_id)
    return db.query(ClientInvoice).filter(ClientInvoice.client_id == client_id).order_by(ClientInvoice.id.desc()).all()


@router.get("/invoices/cleared-summary")
async def cleared_payments_summary(
    month: str,
    months: int = 6,
    db: Session = Depends(get_db),
) -> dict:
    m0 = _parse_ym(month)
    m = max(1, min(int(months or 6), 24))

    start = _add_months(m0, -(m - 1))
    end = _add_months(m0, 1)

    rows = (
        db.query(ClientInvoice)
        .filter(ClientInvoice.payment_status == "Paid")
        .filter(ClientInvoice.created_at >= datetime(start.year, start.month, 1))
        .filter(ClientInvoice.created_at < datetime(end.year, end.month, 1))
        .all()
    )

    def _row_month_key(inv: ClientInvoice) -> str:
        d = inv.invoice_date or (inv.created_at.date() if inv.created_at else None)
        if not d:
            return ""
        return f"{d.year:04d}-{d.month:02d}"

    sums: dict[str, float] = {}
    for inv in rows:
        key = _row_month_key(inv)
        if not key:
            continue
        amt = float(getattr(inv, "net_payable", 0.0) or 0.0)
        sums[key] = float(sums.get(key, 0.0) + amt)

    trend: list[dict] = []
    for i in range(m - 1, -1, -1):
        mm = _add_months(m0, -i)
        key = f"{mm.year:04d}-{mm.month:02d}"
        trend.append({"month": key, "value": float(sums.get(key, 0.0))})

    return {
        "month": f"{m0.year:04d}-{m0.month:02d}",
        "total_cleared": float(sums.get(f"{m0.year:04d}-{m0.month:02d}", 0.0)),
        "trend": trend,
    }


@router.get("/invoices/pending-summary")
async def pending_invoices_summary(
    month: str,
    months: int = 6,
    db: Session = Depends(get_db),
) -> dict:
    m0 = _parse_ym(month)
    m = max(1, min(int(months or 6), 24))

    start = _add_months(m0, -(m - 1))
    end = _add_months(m0, 1)

    rows = (
        db.query(ClientInvoice)
        .filter(ClientInvoice.payment_status != "Paid")
        .filter(ClientInvoice.created_at >= datetime(start.year, start.month, 1))
        .filter(ClientInvoice.created_at < datetime(end.year, end.month, 1))
        .all()
    )

    def _row_month_key(inv: ClientInvoice) -> str:
        d = inv.invoice_date or (inv.created_at.date() if inv.created_at else None)
        if not d:
            return ""
        return f"{d.year:04d}-{d.month:02d}"

    sums: dict[str, float] = {}
    for inv in rows:
        key = _row_month_key(inv)
        if not key:
            continue
        amt = float(getattr(inv, "net_payable", 0.0) or 0.0)
        sums[key] = float(sums.get(key, 0.0) + amt)

    trend: list[dict] = []
    for i in range(m - 1, -1, -1):
        mm = _add_months(m0, -i)
        key = f"{mm.year:04d}-{mm.month:02d}"
        trend.append({"month": key, "value": float(sums.get(key, 0.0))})

    return {
        "month": f"{m0.year:04d}-{m0.month:02d}",
        "total_pending": float(sums.get(f"{m0.year:04d}-{m0.month:02d}", 0.0)),
        "trend": trend,
    }


@router.post("/clients/{client_id}/invoices", response_model=ClientInvoiceOut)
async def create_invoice(client_id: int, payload: ClientInvoiceCreate, db: Session = Depends(get_db)) -> ClientInvoiceOut:
    _get_client(db, client_id)
    exists = db.query(ClientInvoice).filter(ClientInvoice.invoice_number == payload.invoice_number).first()
    if exists:
        raise HTTPException(status_code=400, detail="Invoice number already exists")
    row = ClientInvoice(client_id=client_id, **payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/clients/{client_id}/invoices/{invoice_id}", response_model=ClientInvoiceOut)
async def update_invoice(client_id: int, invoice_id: int, payload: ClientInvoiceUpdate, db: Session = Depends(get_db)) -> ClientInvoiceOut:
    _get_client(db, client_id)
    row = db.query(ClientInvoice).filter(ClientInvoice.id == invoice_id).filter(ClientInvoice.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    prev_status = str(getattr(row, "payment_status", "") or "")
    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(row, k, v)

    # If payment is marked Paid, release allocations linked to this invoice's site/requirement.
    new_status = str(getattr(row, "payment_status", "") or "")
    if prev_status != "Paid" and new_status == "Paid":
        meta = _parse_invoice_number(str(getattr(row, "invoice_number", "") or ""))
        site_id = meta.get("site_id")
        requirement_id = meta.get("requirement_id")
        if site_id:
            q = (
                db.query(ClientSiteGuardAllocation)
                .filter(ClientSiteGuardAllocation.site_id == int(site_id))
                .filter(ClientSiteGuardAllocation.status == "Allocated")
            )
            if requirement_id:
                q = q.filter(
                    or_(
                        ClientSiteGuardAllocation.requirement_id == int(requirement_id),
                        ClientSiteGuardAllocation.requirement_id.is_(None),
                    )
                )
            allocs = q.all()
            for a in allocs:
                a.status = "Released"
    db.commit()
    db.refresh(row)
    return row


@router.delete("/clients/{client_id}/invoices/{invoice_id}")
async def delete_invoice(client_id: int, invoice_id: int, db: Session = Depends(get_db)) -> dict:
    _get_client(db, client_id)
    row = db.query(ClientInvoice).filter(ClientInvoice.id == invoice_id).filter(ClientInvoice.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    db.delete(row)
    db.commit()
    return {"message": "Invoice deleted"}


@router.get("/clients/{client_id}/documents", response_model=List[ClientDocumentOut])
async def list_documents(client_id: int, db: Session = Depends(get_db)) -> List[ClientDocumentOut]:
    _get_client(db, client_id)
    return db.query(ClientDocument).filter(ClientDocument.client_id == client_id).order_by(ClientDocument.id.desc()).all()


@router.post("/clients/{client_id}/documents", response_model=ClientDocumentOut)
async def create_document(client_id: int, payload: ClientDocumentCreate, db: Session = Depends(get_db)) -> ClientDocumentOut:
    _get_client(db, client_id)
    row = ClientDocument(client_id=client_id, **payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/clients/{client_id}/documents/upload", response_model=ClientDocumentOut)
async def upload_client_document(
    client_id: int,
    document_type: str = Form(...),
    expiry_date: Optional[date] = Form(None),
    remarks: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ClientDocumentOut:
    _get_client(db, client_id)

    if not document_type or not str(document_type).strip():
        raise HTTPException(status_code=400, detail="Document type is required")

    ext = os.path.splitext(file.filename or "")[-1]
    safe_name = f"client_{client_id}_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(_client_upload_dir(client_id), safe_name)

    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    row = ClientDocument(
        client_id=client_id,
        document_type=str(document_type).strip(),
        file_url=_client_public_url(client_id, dest),
        expiry_date=expiry_date,
        remarks=remarks,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/clients/{client_id}/documents/{document_id}", response_model=ClientDocumentOut)
async def update_document(client_id: int, document_id: int, payload: ClientDocumentUpdate, db: Session = Depends(get_db)) -> ClientDocumentOut:
    _get_client(db, client_id)
    row = db.query(ClientDocument).filter(ClientDocument.id == document_id).filter(ClientDocument.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/clients/{client_id}/documents/{document_id}")
async def delete_document(client_id: int, document_id: int, db: Session = Depends(get_db)) -> dict:
    _get_client(db, client_id)
    row = db.query(ClientDocument).filter(ClientDocument.id == document_id).filter(ClientDocument.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(row)
    db.commit()
    return {"message": "Document deleted"}


@router.get("/clients/{client_id}/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(client_id: int, invoice_id: int, db: Session = Depends(get_db)):
    client = _get_client(db, client_id)
    inv = (
        db.query(ClientInvoice)
        .filter(ClientInvoice.id == invoice_id)
        .filter(ClientInvoice.client_id == client_id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    meta = _parse_invoice_number(inv.invoice_number)
    site = None
    req = None
    allocations: List[ClientSiteGuardAllocation] = []
    employees: List[Employee] = []

    if meta.get("site_id"):
        site = db.query(ClientSite).filter(ClientSite.id == int(meta["site_id"])).first()
    if site and meta.get("requirement_id"):
        req = (
            db.query(ClientGuardRequirement)
            .filter(ClientGuardRequirement.id == int(meta["requirement_id"]))
            .filter(ClientGuardRequirement.site_id == int(site.id))
            .first()
        )
    if site:
        q = db.query(ClientSiteGuardAllocation).filter(ClientSiteGuardAllocation.site_id == int(site.id))
        if meta.get("requirement_id"):
            q = q.filter(
                or_(
                    ClientSiteGuardAllocation.requirement_id == int(meta["requirement_id"]),
                    ClientSiteGuardAllocation.requirement_id.is_(None),
                )
            )
        allocations = q.order_by(ClientSiteGuardAllocation.id.desc()).all()

        emp_ids = sorted({int(a.employee_db_id) for a in allocations if a.employee_db_id is not None})
        if emp_ids:
            employees = db.query(Employee).filter(Employee.id.in_(emp_ids)).all()

    emp_by_id = {int(e.id): e for e in employees if e and e.id is not None}

    pdf = _pdf_new_document()
    _pdf_text(pdf, "Flash ERP", bold=True, size=16)
    _pdf_text(pdf, "Client Invoice", bold=True, size=14)
    _pdf_text(pdf, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    pdf.ln(2)

    _pdf_text(pdf, f"Invoice #: {inv.invoice_number}", bold=True)
    _pdf_text(pdf, f"Invoice Date: {(inv.invoice_date.isoformat() if inv.invoice_date else '')}")
    _pdf_text(pdf, f"Billing Period: {inv.billing_period or ''}")
    _pdf_text(pdf, f"Payment Status: {inv.payment_status}")
    pdf.ln(2)

    _pdf_text(pdf, "Client Details", bold=True)
    _pdf_text(pdf, f"Client Code: {client.client_code}")
    _pdf_text(pdf, f"Client Name: {client.client_name}")
    _pdf_text(pdf, f"Client Type: {client.client_type}")
    _pdf_text(pdf, f"Industry: {client.industry_type or ''}")
    _pdf_text(pdf, f"Website: {client.website or ''}")
    pdf.ln(2)

    if site:
        _pdf_text(pdf, "Site Details", bold=True)
        _pdf_text(pdf, f"Site: {site.site_name}")
        _pdf_text(pdf, f"City: {site.city or ''}")
        _pdf_text(pdf, f"Risk Level: {site.risk_level or ''}")
        _pdf_text(pdf, f"Status: {site.status}")
        pdf.ln(2)

    if req:
        _pdf_text(pdf, "Work Requirement", bold=True)
        _pdf_text(pdf, f"Guard Type: {req.guard_type}")
        _pdf_text(pdf, f"Guards Needed: {req.number_of_guards}")
        _pdf_text(pdf, f"Preferred Language: {req.preferred_language or ''}")
        _pdf_text(pdf, f"From: {(req.start_date.isoformat() if req.start_date else '')}  To: {(req.end_date.isoformat() if req.end_date else '')}")
        _pdf_text(pdf, f"Monthly Amount: {float(req.monthly_amount or 0.0):.2f}")
        pdf.ln(2)

    _pdf_text(pdf, "Allocated Employees", bold=True)
    if not allocations:
        _pdf_text(pdf, "No allocations found")
    else:
        for a in reversed(allocations[-50:]):
            e = emp_by_id.get(int(a.employee_db_id))
            emp_label = f"{getattr(e, 'employee_id', '')} - {getattr(e, 'first_name', '')} {getattr(e, 'last_name', '')}".strip(" -")
            _pdf_text(
                pdf,
                f"Employee: {emp_label} | DB Id: {a.employee_db_id} | {a.start_date} to {a.end_date} | Status: {a.status}",
            )

    pdf.ln(2)
    _pdf_text(pdf, "Payment Summary", bold=True)
    _pdf_text(pdf, f"Total Amount: {float(inv.total_amount or 0.0):.2f}")
    _pdf_text(pdf, f"Tax Amount: {float(inv.tax_amount or 0.0):.2f}" if inv.tax_amount is not None else "Tax Amount: ")
    _pdf_text(pdf, f"Net Payable: {float(inv.net_payable or 0.0):.2f}")

    out = pdf.output(dest="S")
    pdf_bytes = out if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")

    filename = f"{inv.invoice_number}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


@router.get("/sites/{site_id}/requirements", response_model=List[ClientGuardRequirementOut])
async def list_requirements(site_id: int, db: Session = Depends(get_db)) -> List[ClientGuardRequirementOut]:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return db.query(ClientGuardRequirement).filter(ClientGuardRequirement.site_id == site_id).order_by(ClientGuardRequirement.id.desc()).all()


@router.post("/sites/{site_id}/requirements", response_model=ClientGuardRequirementOut)
async def create_requirement(site_id: int, payload: ClientGuardRequirementCreate, db: Session = Depends(get_db)) -> ClientGuardRequirementOut:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    row = ClientGuardRequirement(site_id=site_id, **payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/sites/{site_id}/requirements/{requirement_id}", response_model=ClientGuardRequirementOut)
async def update_requirement(
    site_id: int,
    requirement_id: int,
    payload: ClientGuardRequirementUpdate,
    db: Session = Depends(get_db),
) -> ClientGuardRequirementOut:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    row = (
        db.query(ClientGuardRequirement)
        .filter(ClientGuardRequirement.id == requirement_id)
        .filter(ClientGuardRequirement.site_id == site_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Requirement not found")
    upd = payload.dict(exclude_unset=True)
    for k, v in upd.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/sites/{site_id}/requirements/{requirement_id}")
async def delete_requirement(site_id: int, requirement_id: int, db: Session = Depends(get_db)) -> dict:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    row = (
        db.query(ClientGuardRequirement)
        .filter(ClientGuardRequirement.id == requirement_id)
        .filter(ClientGuardRequirement.site_id == site_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Requirement not found")
    db.delete(row)
    db.commit()
    return {"message": "Requirement deleted"}


@router.get("/sites/{site_id}/allocations", response_model=List[ClientSiteGuardAllocationOut])
async def list_site_allocations(site_id: int, db: Session = Depends(get_db)) -> List[ClientSiteGuardAllocationOut]:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.site_id == site_id)
        .order_by(ClientSiteGuardAllocation.id.desc())
        .all()
    )


@router.post("/sites/{site_id}/allocations", response_model=ClientSiteGuardAllocationOut)
async def allocate_guard(site_id: int, payload: ClientSiteGuardAllocationCreate, db: Session = Depends(get_db)) -> ClientSiteGuardAllocationOut:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    emp = db.query(Employee).filter(Employee.id == payload.employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Prevent overlapping active allocations for the same employee
    existing = (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.employee_db_id == payload.employee_db_id)
        .filter(ClientSiteGuardAllocation.status == "Allocated")
        .all()
    )
    for a in existing:
        if _ranges_overlap(a.start_date, a.end_date, payload.start_date, payload.end_date):
            raise HTTPException(status_code=400, detail="Employee already allocated in the selected date range")

    row = ClientSiteGuardAllocation(
        site_id=site_id,
        requirement_id=payload.requirement_id,
        employee_db_id=payload.employee_db_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status="Allocated",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/sites/{site_id}/allocations/{allocation_id}/release", response_model=ClientSiteGuardAllocationOut)
async def release_guard(site_id: int, allocation_id: int, db: Session = Depends(get_db)) -> ClientSiteGuardAllocationOut:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    row = (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.id == allocation_id)
        .filter(ClientSiteGuardAllocation.site_id == site_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Allocation not found")
    row.status = "Released"
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/sites/{site_id}/requirements/{requirement_id}/suggested-employees",
    response_model=List[SuggestedEmployeeOut],
)
async def suggested_employees(site_id: int, requirement_id: int, db: Session = Depends(get_db)) -> List[SuggestedEmployeeOut]:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    req = (
        db.query(ClientGuardRequirement)
        .filter(ClientGuardRequirement.id == requirement_id)
        .filter(ClientGuardRequirement.site_id == site_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    preferred = (req.preferred_language or "").strip().lower()

    # Pull employees and filter in python (languages stored as JSON text)
    employees = db.query(Employee).order_by(Employee.id.desc()).all()

    # Exclude allocated employees for overlapping range
    allocations = (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.status == "Allocated")
        .all()
    )
    allocated_by_employee: dict[int, list[ClientSiteGuardAllocation]] = {}
    for a in allocations:
        allocated_by_employee.setdefault(int(a.employee_db_id), []).append(a)

    out: list[SuggestedEmployeeOut] = []
    for e in employees:
        langs = _employee_languages(e)
        if preferred and not any(preferred == l.lower() for l in langs):
            continue
        # availability check
        blocked = False
        for a in allocated_by_employee.get(int(e.id), []):
            if _ranges_overlap(a.start_date, a.end_date, req.start_date, req.end_date):
                blocked = True
                break
        if blocked:
            continue

        out.append(
            SuggestedEmployeeOut(
                id=int(e.id),
                employee_id=str(e.employee_id),
                first_name=str(e.first_name),
                last_name=str(e.last_name),
                languages=langs,
            )
        )

    return out


@router.post("/sites/{site_id}/requirements/{requirement_id}/complete")
async def complete_requirement(site_id: int, requirement_id: int, db: Session = Depends(get_db)) -> dict:
    site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    req = (
        db.query(ClientGuardRequirement)
        .filter(ClientGuardRequirement.id == requirement_id)
        .filter(ClientGuardRequirement.site_id == site_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    # Create a paid invoice for this site requirement (monthly amount)
    invoice_number = f"INV-{site.client_id}-{site_id}-{requirement_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    billing_period = None
    if req.start_date and req.end_date:
        billing_period = f"{req.start_date.isoformat()} to {req.end_date.isoformat()}"
    elif req.start_date:
        billing_period = f"From {req.start_date.isoformat()}"
    elif req.end_date:
        billing_period = f"Till {req.end_date.isoformat()}"

    amount = float(req.monthly_amount or 0.0)
    inv = ClientInvoice(
        client_id=site.client_id,
        invoice_number=invoice_number,
        invoice_date=date.today(),
        billing_period=billing_period,
        total_amount=amount,
        tax_amount=None,
        net_payable=amount,
        payment_status="Pending",
    )
    db.add(inv)

    db.commit()
    return {
        "message": "Invoice created",
        "invoice_number": invoice_number,
        "released": 0,
    }

# ─────────────────────────────────────────────────────────────────────────────
# Contract Guard Allocations
# ─────────────────────────────────────────────────────────────────────────────

from app.models.employee2 import Employee2

@router.get("/contracts/{contract_id}/allocations")
async def list_contract_allocations(contract_id: int, db: Session = Depends(get_db)):
    """List all guard allocations for a contract"""
    contract = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    allocations = (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.contract_id == contract_id)
        .all()
    )
    
    result = []
    for a in allocations:
        emp = db.query(Employee2).filter(Employee2.id == a.employee_db_id).first()
        result.append({
            "id": a.id,
            "contract_id": a.contract_id,
            "employee_db_id": a.employee_db_id,
            "employee_name": emp.name if emp else "Unknown",
            "employee_id": emp.serial_no if emp else "",
            "start_date": a.start_date.isoformat() if a.start_date else None,
            "end_date": a.end_date.isoformat() if a.end_date else None,
            "status": a.status or "Active",
        })
    return result


@router.post("/contracts/{contract_id}/allocations")
async def create_contract_allocation(
    contract_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    """Allocate a guard to a contract"""
    contract = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    employee_db_id = payload.get("employee_db_id")
    if not employee_db_id:
        raise HTTPException(status_code=400, detail="employee_db_id required")
    
    emp = db.query(Employee2).filter(Employee2.id == employee_db_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Check if already allocated
    existing = (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.employee_db_id == employee_db_id)
        .filter(ClientSiteGuardAllocation.status == "Active")
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Guard already allocated to another contract")
    
    start_date = None
    if payload.get("start_date"):
        start_date = date.fromisoformat(payload["start_date"])
    
    alloc = ClientSiteGuardAllocation(
        contract_id=contract_id,
        employee_db_id=employee_db_id,
        start_date=start_date,
        status="Active",
    )
    db.add(alloc)
    
    # Update employee status to allocated
    emp.allocation_status = "Allocated"
    
    db.commit()
    db.refresh(alloc)
    
    return {"id": alloc.id, "message": "Guard allocated"}


@router.delete("/contracts/{contract_id}/allocations/{allocation_id}")
async def delete_contract_allocation(
    contract_id: int,
    allocation_id: int,
    db: Session = Depends(get_db),
):
    """Remove a guard allocation"""
    alloc = (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.id == allocation_id)
        .filter(ClientSiteGuardAllocation.contract_id == contract_id)
        .first()
    )
    if not alloc:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    # Update employee status to free
    emp = db.query(Employee2).filter(Employee2.id == alloc.employee_db_id).first()
    if emp:
        emp.allocation_status = "Free"
    
    db.delete(alloc)
    db.commit()
    
    return {"message": "Guard removed and marked as free"}


# ─────────────────────────────────────────────────────────────────────────────
# Contract Invoice/Receipt PDF
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/contracts/{contract_id}/invoice-pdf")
async def download_contract_invoice_pdf(contract_id: int, db: Session = Depends(get_db)):
    """Generate invoice PDF for a contract"""
    contract = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    client = db.query(Client).filter(Client.id == contract.client_id).first()
    
    # Get allocated guards
    allocations = (
        db.query(ClientSiteGuardAllocation)
        .filter(ClientSiteGuardAllocation.contract_id == contract_id)
        .all()
    )
    
    guards = []
    for a in allocations:
        emp = db.query(Employee2).filter(Employee2.id == a.employee_db_id).first()
        if emp:
            guards.append({
                "name": emp.name,
                "id": emp.serial_no or str(emp.id),
                "designation": emp.designation or "Guard",
            })
    
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # Header
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "INVOICE", ln=True, align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Invoice Date: {datetime.now().strftime('%Y-%m-%d')}", ln=True, align="C")
    pdf.ln(10)
    
    # Client Info
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Client Information", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Client: {client.client_name if client else 'N/A'}", ln=True)
    pdf.cell(0, 6, f"Code: {client.client_code if client else 'N/A'}", ln=True)
    pdf.cell(0, 6, f"Location: {getattr(client, 'location', '') or 'N/A'}", ln=True)
    pdf.ln(8)
    
    # Contract Info
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Contract Details", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Contract #: {contract.contract_number}", ln=True)
    pdf.cell(0, 6, f"Type: {contract.contract_type or 'N/A'}", ln=True)
    pdf.cell(0, 6, f"Start Date: {contract.start_date or 'N/A'}", ln=True)
    pdf.cell(0, 6, f"End Date: {contract.end_date or 'N/A'}", ln=True)
    pdf.cell(0, 6, f"Status: {contract.status}", ln=True)
    pdf.ln(8)
    
    # Guards
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"Allocated Guards ({len(guards)})", ln=True)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(60, 6, "Name", border=1)
    pdf.cell(30, 6, "ID", border=1)
    pdf.cell(50, 6, "Designation", border=1)
    pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    for g in guards:
        pdf.cell(60, 6, g["name"][:25], border=1)
        pdf.cell(30, 6, g["id"], border=1)
        pdf.cell(50, 6, g["designation"], border=1)
        pdf.ln()
    pdf.ln(8)
    
    # Cost
    monthly_cost = float(contract.monthly_cost or 0)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Billing", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(100, 6, "Monthly Cost:", border=0)
    pdf.cell(0, 6, f"Rs {monthly_cost:,.0f}", ln=True)
    pdf.ln(10)
    
    # Footer
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(0, 6, f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=True, align="C")
    
    pdf_bytes = pdf.output()
    
    return StreamingResponse(
        iter([bytes(pdf_bytes)]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{contract.contract_number}.pdf"}
    )


@router.get("/contracts/{contract_id}/receipt-pdf")
async def download_contract_receipt_pdf(contract_id: int, db: Session = Depends(get_db)):
    """Generate receipt PDF for a contract"""
    contract = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    client = db.query(Client).filter(Client.id == contract.client_id).first()
    
    pdf = FPDF()
    pdf.add_page()
    
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "PAYMENT RECEIPT", ln=True, align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Date: {datetime.now().strftime('%Y-%m-%d')}", ln=True, align="C")
    pdf.ln(10)
    
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Received from: {client.client_name if client else 'N/A'}", ln=True)
    pdf.cell(0, 6, f"Contract #: {contract.contract_number}", ln=True)
    pdf.ln(5)
    
    monthly_cost = float(contract.monthly_cost or 0)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"Amount: Rs {monthly_cost:,.0f}", ln=True)
    pdf.ln(10)
    
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, "Payment Status: Received", ln=True)
    pdf.ln(20)
    
    pdf.cell(0, 6, "_________________________", ln=True)
    pdf.cell(0, 6, "Authorized Signature", ln=True)
    
    pdf_bytes = pdf.output()
    
    return StreamingResponse(
        iter([bytes(pdf_bytes)]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=receipt_{contract.contract_number}.pdf"}
    )
