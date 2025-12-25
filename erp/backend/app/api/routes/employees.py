"""Employee API routes."""

import json
import csv
import io
import re
from urllib.request import Request, urlopen
from calendar import monthrange
from datetime import date, datetime
from typing import Optional, Any, List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from fpdf import FPDF
from sqlalchemy import distinct, func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.employee_warning import EmployeeWarning
from app.models.client_site_guard_allocation import ClientSiteGuardAllocation
from app.models.payroll_payment_status import PayrollPaymentStatus
from app.schemas.employee import (
    Employee as EmployeeSchema,
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeList,
)


router = APIRouter(dependencies=[Depends(require_permission("employees:view"))])


class EmployeeCsvImportRequest(EmployeeCreate):
    pass


def _normalize_csv_header(h: str) -> str:
    s = (h or "").strip().lower()
    s = s.replace("#", " no")
    s = s.replace("/", " ")
    s = s.replace("&", " and ")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", "", s)
    s = s.strip()
    return s


def _parse_date_any(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    if s.lower() in {"for life", "nil", "na", "n/a", "-"}:
        return s
    # Handle things like "10-10-18 / 6-3-23" -> keep raw
    if "/" in s and any(ch.isdigit() for ch in s):
        return s
    fmts = [
        "%Y-%m-%d",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d/%b/%Y",
        "%d/%B/%Y",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d-%m-%y",
        "%d/%m/%y",
        "%d-%b-%y",
        "%d/%b/%y",
        "%d-%m-%Y",
        "%d-%m-%y",
        "%d-%b-%Y",
        "%d-%b-%y",
    ]
    for fmt in fmts:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    return s


def _split_name(full: str) -> tuple[str, str]:
    s = (full or "").strip()
    parts = [p for p in re.split(r"\s+", s) if p]
    if not parts:
        return "Unknown", "-"
    if len(parts) == 1:
        return parts[0], "-"
    return parts[0], " ".join(parts[1:])


def _sanitize_phone(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    return s


def _sanitize_money(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    s = s.replace(",", "")
    s = re.sub(r"[^0-9.]+", "", s)
    return s or None


def _guess_email(*, fssl_no: str | None, cnic: str | None, idx: int) -> str:
    base = (fssl_no or cnic or f"import-{idx}").strip()
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower() or f"import-{idx}"
    return f"{base}@import.local"


def _map_csv_row_to_employee_payload(row: dict[str, Any], idx: int) -> dict[str, Any]:
    # Build a normalized-key dictionary
    nrow: dict[str, Any] = {}
    for k, v in (row or {}).items():
        nk = _normalize_csv_header(str(k))
        if not nk:
            continue
        # Keep the first occurrence; sheet has duplicates (rank/status/unit appear multiple times)
        if nk in nrow:
            continue
        nrow[nk] = v

    fssl_no = str(nrow.get("fss no") or nrow.get("fss") or nrow.get("fss number") or "").strip() or None
    full_name = str(nrow.get("name") or "").strip()
    first_name, last_name = _split_name(full_name)

    cnic = str(nrow.get("cnic no") or nrow.get("cnic") or "").strip() or None
    email = str(nrow.get("email") or "").strip() or _guess_email(fssl_no=fssl_no, cnic=cnic, idx=idx)

    salary = _sanitize_money(nrow.get("salary"))
    status_val = str(nrow.get("status") or "").strip() or None

    payload: dict[str, Any] = {
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "father_name": str(nrow.get("fathers name") or nrow.get("father name") or nrow.get("fathers name") or "").strip() or None,
        "total_salary": salary,
        "employment_status": None,
        "retired_from": None,
        "service_unit": str(nrow.get("unit") or "").strip() or None,
        "service_rank": str(nrow.get("rank") or "").strip() or None,
        "blood_group": str(nrow.get("blood gp") or nrow.get("blood group") or "").strip() or None,
        "cnic": cnic,
        "date_of_birth": _parse_date_any(nrow.get("dob")),
        "cnic_expiry_date": _parse_date_any(nrow.get("cnic expr") or nrow.get("cnic expiry")),
        "original_doc_held": str(nrow.get("documents held") or "").strip() or None,
        "documents_handed_over_to": str(nrow.get("documents reciving handed over to") or nrow.get("documents handed over to") or "").strip() or None,
        "photo_on_document": str(nrow.get("photo on docu") or nrow.get("photo on document") or "").strip() or None,
        "eobi_no": str(nrow.get("eobi no") or nrow.get("eobi") or "").strip() or None,
        "insurance": str(nrow.get("insurance") or "").strip() or None,
        "social_security": str(nrow.get("social security") or "").strip() or None,
        "mobile_number": _sanitize_phone(nrow.get("mob no") or nrow.get("mob") or nrow.get("mobile") or nrow.get("mob  no")),
        "home_contact_no": _sanitize_phone(nrow.get("home contact number") or nrow.get("home contact no") or nrow.get("home contact")),
        "particulars_verified_by_sho_on": _parse_date_any(nrow.get("verified by sho")),
        "police_khidmat_verification_on": _parse_date_any(nrow.get("verified by khidmat markaz")),
        "verified_by_khidmat_markaz": _parse_date_any(nrow.get("verified by khidmat markaz")),
        "domicile": str(nrow.get("domicile") or "").strip() or None,
        "particulars_verified_by_ssp_on": _parse_date_any(nrow.get("verified by ssp")),
        "service_enrollment_date": _parse_date_any(nrow.get("enrolled")),
        "service_reenrollment_date": _parse_date_any(nrow.get("re enrolled") or nrow.get("reenrolled")),
        "permanent_village": str(nrow.get("village") or "").strip() or None,
        "permanent_post_office": str(nrow.get("post office") or "").strip() or None,
        "permanent_thana": str(nrow.get("thana") or "").strip() or None,
        "permanent_tehsil": str(nrow.get("tehsil") or "").strip() or None,
        "permanent_district": str(nrow.get("district") or "").strip() or None,
        "base_location": str(nrow.get("duty location") or "").strip() or None,
        "police_training_letter_date": str(
            nrow.get("police trg ltr and date")
            or nrow.get("police trg ltr date")
            or ""
        ).strip()
        or None,
        "vaccination_certificate": str(nrow.get("vacanation cert") or nrow.get("vaccination cert") or "").strip() or None,
        "volume_no": str(nrow.get("vol no") or nrow.get("vol") or "").strip() or None,
        "payments": str(nrow.get("payments") or "").strip() or None,
        "fss_number": fssl_no,
        "designation": str(nrow.get("designation") or "").strip() or None,
        "date_of_entry": _parse_date_any(nrow.get("date of entry")),
        "card_number": str(nrow.get("card") or nrow.get("card number") or "").strip() or None,
    }

    # Employment status vs retired_from (sheet uses "Civil/Army" etc. in Status)
    if status_val:
        st_norm = status_val.strip().lower()
        if st_norm in {"active", "inactive", "left"}:
            payload["employment_status"] = status_val.strip().title()
        else:
            payload["employment_status"] = "Active"
            # Skip retired_from for now to avoid list serialization issues
            # payload["retired_from"] = json.dumps([status_val.strip()])

    # Remove None keys
    return {k: v for k, v in payload.items() if v is not None and str(v).strip() != ""}


def _fetch_csv_text(url: str) -> str:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as r:
        data = r.read()
    try:
        return data.decode("utf-8")
    except Exception:
        return data.decode("latin-1", errors="ignore")


@router.post("/import/google-sheet", dependencies=[Depends(require_permission("employees:create"))])
async def import_employees_from_google_sheet(
    *,
    url: str,
    mode: str = "preview",
    db: Session = Depends(get_db),
):
    """Import employees from a public Google Sheet CSV URL.

    mode:
      - preview: parse + map + dedupe summary (no DB writes)
      - import: create missing employees
    """
    if not url or not str(url).strip():
        raise HTTPException(status_code=400, detail="url is required")
    mode_s = str(mode or "preview").strip().lower()
    if mode_s not in {"preview", "import"}:
        raise HTTPException(status_code=400, detail="mode must be preview or import")

    try:
        csv_text = _fetch_csv_text(str(url).strip())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch CSV: {e}") from e

    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        return {"rows": 0, "preview": True, "created": 0, "skipped": 0, "errors": ["Empty CSV"]}

    # Find header row: first row containing "name" and "cnic" etc.
    header_idx = None
    for i, r in enumerate(rows[:25]):
        joined = ",".join([str(x or "") for x in r]).lower()
        if "name" in joined and ("cnic" in joined or "fss" in joined):
            header_idx = i
            break
    if header_idx is None:
        header_idx = 0

    headers = rows[header_idx]
    data_rows = rows[header_idx + 1 :]

    dict_rows: list[dict[str, Any]] = []
    for r in data_rows:
        if not any(str(x or "").strip() for x in r):
            continue
        d = {}
        for j, h in enumerate(headers):
            if j >= len(r):
                continue
            d[str(h or "") or f"col_{j}"] = r[j]
        dict_rows.append(d)

    created = 0
    skipped = 0
    errors: list[str] = []
    created_ids: list[str] = []

    for idx, r in enumerate(dict_rows, start=1):
        try:
            payload = _map_csv_row_to_employee_payload(r, idx)
            cnic = str(payload.get("cnic") or "").strip() or None
            fssl_no = str(payload.get("fss_number") or "").strip() or None

            # Deduplicate: CNIC first, else FSSL
            q = db.query(Employee)
            existing = None
            if cnic:
                existing = q.filter(Employee.cnic == cnic).first()
            if not existing and fssl_no:
                existing = q.filter(Employee.fss_number == fssl_no).first()
            if existing:
                skipped += 1
                continue

            # Ensure email unique
            email = str(payload.get("email") or "").strip() or _guess_email(fssl_no=fssl_no, cnic=cnic, idx=idx)
            email_existing = db.query(Employee).filter(Employee.email == email).first()
            if email_existing:
                email = _guess_email(fssl_no=fssl_no, cnic=cnic, idx=idx + 100000)
            payload["email"] = email

            if mode_s == "preview":
                created += 1
                continue

            # Ensure list fields are JSON strings before creating model
            if isinstance(payload.get("retired_from"), list):
                payload["retired_from"] = json.dumps(payload["retired_from"])
            if isinstance(payload.get("languages_spoken"), list):
                payload["languages_spoken"] = json.dumps(payload["languages_spoken"])
            if isinstance(payload.get("bank_accounts"), list):
                payload["bank_accounts"] = json.dumps(payload["bank_accounts"])
            
            # Debug: print payload for row 18
            if idx == 18:
                print(f"\n=== DEBUG ROW 18 ===")
                print(f"retired_from type: {type(payload.get('retired_from'))}")
                print(f"retired_from value: {payload.get('retired_from')}")
                print(f"===================\n")

            # Create employee via model (reuse existing create endpoint behavior for JSON fields)
            employee_id = _generate_employee_id(db)
            db_employee = Employee(employee_id=employee_id, **payload)
            db.add(db_employee)
            db.commit()
            db.refresh(db_employee)
            created += 1
            created_ids.append(str(db_employee.employee_id or ""))
        except Exception as e:
            errors.append(f"Row {idx}: {e}")

    return {
        "preview": mode_s == "preview",
        "rows": len(dict_rows),
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "created_employee_ids": created_ids if mode_s == "import" else [],
    }
def _apply_employee_filters(
    query,
    *,
    search: str | None,
    department: str | None,
    designation: str | None,
    employment_status: str | None,
    created_from: str | None,
    created_to: str | None,
):
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Employee.first_name.ilike(search_term))
            | (Employee.last_name.ilike(search_term))
            | (Employee.employee_id.ilike(search_term))
            | (Employee.email.ilike(search_term))
            | (Employee.mobile_number.ilike(search_term))
        )

    if department:
        query = query.filter(Employee.department == department)

    if designation:
        query = query.filter(Employee.designation == designation)

    if employment_status:
        query = query.filter(Employee.employment_status == employment_status)

    if created_from:
        try:
            start_dt = datetime.strptime(str(created_from).strip(), "%Y-%m-%d")
        except Exception as e:
            raise HTTPException(status_code=400, detail="created_from must be YYYY-MM-DD") from e
        query = query.filter(Employee.created_at >= start_dt)

    if created_to:
        try:
            end_day = datetime.strptime(str(created_to).strip(), "%Y-%m-%d")
            end_dt = end_day.replace(hour=23, minute=59, second=59, microsecond=999999)
        except Exception as e:
            raise HTTPException(status_code=400, detail="created_to must be YYYY-MM-DD") from e
        query = query.filter(Employee.created_at <= end_dt)

    return query


def _parse_month(month: str) -> tuple[date, date]:
    try:
        y_s, m_s = month.split("-", 1)
        y = int(y_s)
        m = int(m_s)
        if not (1 <= m <= 12):
            raise ValueError
    except Exception as e:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format") from e

    last_day = monthrange(y, m)[1]
    return date(y, m, 1), date(y, m, last_day)


def _fmt_money(v: float | int | None) -> str:
    try:
        n = float(v or 0)
    except Exception:
        n = 0.0
    return f"{n:,.2f}".replace(",", "")


def _pdf_new() -> FPDF:
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    pdf.set_left_margin(12)
    pdf.set_right_margin(12)
    return pdf


def _pdf_header(pdf: FPDF, *, title: str, subtitle: str) -> None:
    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", style="B", size=14)
    pdf.cell(0, 8, "Flash ERP", ln=1)
    pdf.set_font("Helvetica", size=10)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(0, 6, subtitle, ln=1)
    pdf.ln(2)

    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", style="B", size=12)
    pdf.cell(0, 8, title, ln=1)
    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(0, 5, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=1)
    pdf.set_text_color(15, 23, 42)
    pdf.ln(2)


def _pdf_kv(pdf: FPDF, label: str, value: str) -> None:
    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(55, 6, label)
    pdf.set_text_color(15, 23, 42)
    pdf.multi_cell(0, 6, value)


def _pdf_section_title(pdf: FPDF, title: str) -> None:
    pdf.ln(1)
    pdf.set_font("Helvetica", style="B", size=10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 7, title, ln=1)
    pdf.set_font("Helvetica", size=9)


def _pdf_table(pdf: FPDF, headers: list[str], rows: list[list[str]], col_widths: list[float]) -> None:
    pdf.set_fill_color(249, 243, 233)
    pdf.set_draw_color(230, 230, 230)
    pdf.set_font("Helvetica", style="B", size=8)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 7, h, border=1, fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", size=8)
    for idx, r in enumerate(rows):
        if idx % 2 == 0:
            pdf.set_fill_color(255, 255, 255)
        else:
            pdf.set_fill_color(252, 250, 246)
        for i, v in enumerate(r):
            align = "R" if i >= len(r) - 1 else "L"
            pdf.cell(col_widths[i], 6, v, border=1, fill=True, align=align)
        pdf.ln()


def _generate_employee_id(db: Session) -> str:
    """Generate a simple sequential employee_id like SEC-0001.

    This looks at the last created employee and increments the numeric suffix.
    """

    last_employee = db.query(Employee).order_by(Employee.id.desc()).first()
    if not last_employee or not last_employee.employee_id:
        next_number = 1
    else:
        # Try to parse trailing number from existing employee_id (e.g. SEC-0007)
        parts = str(last_employee.employee_id).split("-")
        try:
            last_number = int(parts[-1])
            next_number = last_number + 1
        except (ValueError, TypeError):
            next_number = (last_employee.id or 0) + 1

    return f"SEC-{next_number:04d}"


@router.post("/", response_model=EmployeeSchema)
async def create_employee(
    employee: EmployeeCreate,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:create")),
):
    """Create a new employee record."""

    # Enforce unique email constraint at API level for clearer error messages
    existing_email = db.query(Employee).filter(Employee.email == employee.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Employee with this email already exists")

    employee_id = _generate_employee_id(db)

    payload = employee.model_dump()
    if isinstance(payload.get("languages_spoken"), list):
        payload["languages_spoken"] = json.dumps(payload["languages_spoken"], ensure_ascii=False)
    if isinstance(payload.get("languages_proficiency"), list):
        payload["languages_proficiency"] = json.dumps(payload["languages_proficiency"], ensure_ascii=False)
    if isinstance(payload.get("retired_from"), list):
        payload["retired_from"] = json.dumps(payload["retired_from"], ensure_ascii=False)
    if isinstance(payload.get("bank_accounts"), list):
        payload["bank_accounts"] = json.dumps(payload["bank_accounts"], ensure_ascii=False)

    db_employee = Employee(
        employee_id=employee_id,
        **payload,
    )
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)

    return db_employee


@router.get("/", response_model=EmployeeList)
async def list_employees(
    skip: int = 0,
    limit: int = 100,
    search: str = None,
    department: str = None,
    designation: str = None,
    employment_status: str = None,
    created_from: str | None = None,
    created_to: str | None = None,
    with_total: bool = True,
    db: Session = Depends(get_db),
):
    """Return a paginated list of employees with optional search and filters."""
    
    try:
        query = db.query(Employee)
        query = _apply_employee_filters(
            query,
            search=search,
            department=department,
            designation=designation,
            employment_status=employment_status,
            created_from=created_from,
            created_to=created_to,
        )
        
        employees = query.offset(skip).limit(limit).all()

        # Attach warning_count for UI highlighting (warnings >= 3)
        employee_db_ids = [e.id for e in employees if e and e.id is not None]
        warning_counts: dict[int, int] = {}
        if employee_db_ids:
            rows = (
                db.query(EmployeeWarning.employee_db_id, func.count(EmployeeWarning.id))
                .filter(EmployeeWarning.employee_db_id.in_(employee_db_ids))
                .group_by(EmployeeWarning.employee_db_id)
                .all()
            )
            warning_counts = {int(r[0]): int(r[1]) for r in rows if r and r[0] is not None}
            for e in employees:
                try:
                    setattr(e, "warning_count", warning_counts.get(int(e.id), 0))
                except Exception:
                    pass
        total = query.count() if with_total else 0

        return EmployeeList(employees=employees, total=total)
    except Exception as ex:
        import traceback
        print(f"ERROR in list_employees: {ex}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(ex))


@router.get("/kpis")
async def employees_kpis(
    search: str = None,
    department: str = None,
    designation: str = None,
    employment_status: str = None,
    created_from: str | None = None,
    created_to: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    q_emp = db.query(Employee)
    q_emp = _apply_employee_filters(
        q_emp,
        search=search,
        department=department,
        designation=designation,
        employment_status=employment_status,
        created_from=created_from,
        created_to=created_to,
    )

    total = int(q_emp.count())
    status_rows = q_emp.with_entities(Employee.employment_status, func.count(Employee.id)).group_by(Employee.employment_status).all()
    status_counts = {str(st or "").strip().lower(): int(c or 0) for st, c in status_rows}

    # Allocated count (active allocations today) restricted to the filtered employees
    today = date.today()
    allocated_count = (
        db.query(func.count(distinct(ClientSiteGuardAllocation.employee_db_id)))
        .join(Employee, Employee.id == ClientSiteGuardAllocation.employee_db_id)
        .filter(ClientSiteGuardAllocation.status == "Allocated")
        .filter(or_(ClientSiteGuardAllocation.start_date.is_(None), ClientSiteGuardAllocation.start_date <= today))
        .filter(or_(ClientSiteGuardAllocation.end_date.is_(None), ClientSiteGuardAllocation.end_date >= today))
        .filter(Employee.id.in_(q_emp.with_entities(Employee.id)))
        .scalar()
        or 0
    )

    # Top 3 employees by warnings within the filtered employees
    top_rows = (
        db.query(EmployeeWarning.employee_db_id, func.count(EmployeeWarning.id).label("cnt"))
        .join(Employee, Employee.id == EmployeeWarning.employee_db_id)
        .filter(Employee.id.in_(q_emp.with_entities(Employee.id)))
        .group_by(EmployeeWarning.employee_db_id)
        .order_by(func.count(EmployeeWarning.id).desc())
        .limit(3)
        .all()
    )

    top_out: list[dict] = []
    for emp_db_id, cnt in top_rows:
        emp = db.query(Employee).filter(Employee.id == emp_db_id).first()
        if not emp:
            continue
        nm = " ".join([p for p in [emp.first_name, emp.last_name] if p])
        top_out.append(
            {
                "employee_db_id": int(emp.id),
                "employee_id": str(emp.employee_id or ""),
                "name": nm,
                "warnings": int(cnt or 0),
            }
        )

    return {
        "total": total,
        "active": int(status_counts.get("active", 0)),
        "inactive": int(status_counts.get("inactive", 0)),
        "left": int(status_counts.get("left", 0)),
        "allocated": int(allocated_count),
        "top_warnings": top_out,
    }


@router.get("/allocated/active")
async def list_active_allocated_employee_db_ids(
    day: Optional[date] = None,
    db: Session = Depends(get_db),
):
    target = day or date.today()
    rows = (
        db.query(ClientSiteGuardAllocation.employee_db_id)
        .filter(ClientSiteGuardAllocation.status == "Allocated")
        .filter(or_(ClientSiteGuardAllocation.start_date.is_(None), ClientSiteGuardAllocation.start_date <= target))
        .filter(or_(ClientSiteGuardAllocation.end_date.is_(None), ClientSiteGuardAllocation.end_date >= target))
        .distinct()
        .all()
    )
    ids = [int(r[0]) for r in rows if r and r[0] is not None]
    return {"employee_db_ids": ids, "day": target.isoformat()}


@router.get("/{employee_id}", response_model=EmployeeSchema)
async def get_employee(employee_id: str, db: Session = Depends(get_db)):
    """Get a single employee by their employee_id (e.g. SEC-0001)."""

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    return employee


@router.get("/by-db-id/{employee_db_id}", response_model=EmployeeSchema)
async def get_employee_by_db_id(employee_db_id: int, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.id == employee_db_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


@router.put("/{employee_id}", response_model=EmployeeSchema)
async def update_employee(
    employee_id: str,
    employee_update: EmployeeUpdate,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:update")),
):
    """Update an existing employee by employee_id."""

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    update_data = employee_update.model_dump(exclude_unset=True)
    if isinstance(update_data.get("languages_spoken"), list):
        update_data["languages_spoken"] = json.dumps(update_data["languages_spoken"], ensure_ascii=False)
    if isinstance(update_data.get("languages_proficiency"), list):
        update_data["languages_proficiency"] = json.dumps(update_data["languages_proficiency"], ensure_ascii=False)
    if isinstance(update_data.get("retired_from"), list):
        update_data["retired_from"] = json.dumps(update_data["retired_from"], ensure_ascii=False)
    if isinstance(update_data.get("bank_accounts"), list):
        update_data["bank_accounts"] = json.dumps(update_data["bank_accounts"], ensure_ascii=False)
    for field, value in update_data.items():
        setattr(employee, field, value)

    db.commit()
    db.refresh(employee)

    return employee


@router.post("/{employee_id}/mark-left", response_model=EmployeeSchema)
async def mark_employee_left(
    employee_id: str,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:update")),
):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.employment_status = "Left"
    if reason and str(reason).strip():
        stamp = datetime.now().strftime("%Y-%m-%d")
        note = f"[Left {stamp}] {str(reason).strip()}"
        if employee.remarks and str(employee.remarks).strip():
            employee.remarks = f"{employee.remarks}\n{note}"
        else:
            employee.remarks = note

    db.commit()
    db.refresh(employee)
    return employee


@router.get("/{employee_id}/clearance/pdf")
async def export_employee_clearance_pdf(
    employee_id: str,
    month: Optional[str] = None,
    db: Session = Depends(get_db),
) -> Response:
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    start: Optional[date] = None
    end: Optional[date] = None
    if month:
        start, end = _parse_month(month)

    paid_rows = (
        db.query(PayrollPaymentStatus)
        .filter(PayrollPaymentStatus.employee_id == employee_id)
        .filter(PayrollPaymentStatus.status == "paid")
        .order_by(PayrollPaymentStatus.month.asc(), PayrollPaymentStatus.id.asc())
        .all()
    )
    paid_history: list[list[str]] = []
    total_paid = 0.0
    for r in paid_rows:
        amt = float(r.net_pay_snapshot or 0.0)
        total_paid += amt
        paid_history.append([str(r.month or ""), f"Rs {_fmt_money(amt)}"])

    att_q = db.query(AttendanceRecord).filter(AttendanceRecord.employee_id == employee_id)
    if start and end:
        att_q = att_q.filter(AttendanceRecord.date >= start).filter(AttendanceRecord.date <= end)
    attendance = att_q.order_by(AttendanceRecord.date.asc(), AttendanceRecord.id.asc()).all()

    present_days = 0
    late_days = 0
    absent_days = 0
    paid_leave_days = 0
    unpaid_leave_days = 0
    overtime_minutes = 0
    overtime_pay = 0.0
    late_minutes = 0
    late_deduction = 0.0

    for a in attendance:
        st = (a.status or "").lower().strip()
        if st == "present":
            present_days += 1
        elif st == "late":
            late_days += 1
        elif st == "absent":
            absent_days += 1
        elif st == "leave":
            if (a.leave_type or "").lower().strip() == "unpaid":
                unpaid_leave_days += 1
            else:
                paid_leave_days += 1

        if a.overtime_minutes and a.overtime_rate:
            overtime_minutes += int(a.overtime_minutes or 0)
            overtime_pay += (float(a.overtime_minutes or 0) / 60.0) * float(a.overtime_rate or 0.0)

        if a.late_minutes:
            late_minutes += int(a.late_minutes or 0)
        if a.late_deduction:
            late_deduction += float(a.late_deduction or 0.0)

    period_label = month if month else "All Time"
    pdf = _pdf_new()
    _pdf_header(
        pdf,
        title="Employee Clearance Report",
        subtitle=f"Employee: {employee_id}    -    Period: {period_label}",
    )

    _pdf_section_title(pdf, "Employee Details")
    name = " ".join([p for p in [employee.first_name, employee.last_name] if p])
    _pdf_kv(pdf, "Employee ID", str(employee.employee_id or ""))
    _pdf_kv(pdf, "Name", name)
    _pdf_kv(pdf, "Employment status", str(employee.employment_status or ""))
    _pdf_kv(pdf, "Department", str(employee.department or "-"))
    _pdf_kv(pdf, "Designation", str(employee.designation or "-"))
    _pdf_kv(pdf, "Email", str(employee.email or "-"))
    _pdf_kv(pdf, "Mobile", str(employee.mobile_number or "-"))
    if employee.remarks:
        _pdf_kv(pdf, "Remarks", str(employee.remarks))

    _pdf_section_title(pdf, "Payroll Summary")
    _pdf_kv(pdf, "Total Paid (history)", f"Rs {_fmt_money(total_paid)}")
    if paid_history:
        _pdf_table(pdf, ["Month", "Net Paid"], paid_history, [40, 45])
    else:
        pdf.set_font("Helvetica", size=9)
        pdf.set_text_color(107, 114, 128)
        pdf.multi_cell(0, 6, "No paid payroll snapshots found.")
        pdf.set_text_color(15, 23, 42)

    _pdf_section_title(pdf, "Attendance / Overtime / Late")
    _pdf_kv(pdf, "Present days", str(present_days))
    _pdf_kv(pdf, "Late days", str(late_days))
    _pdf_kv(pdf, "Absent days", str(absent_days))
    _pdf_kv(pdf, "Paid leave days", str(paid_leave_days))
    _pdf_kv(pdf, "Unpaid leave days", str(unpaid_leave_days))
    _pdf_kv(pdf, "Overtime minutes", str(overtime_minutes))
    _pdf_kv(pdf, "Overtime pay", f"Rs {_fmt_money(overtime_pay)}")
    _pdf_kv(pdf, "Late minutes", str(late_minutes))
    _pdf_kv(pdf, "Late deduction", f"Rs {_fmt_money(late_deduction)}")

    out = pdf.output(dest="S")
    pdf_bytes = bytes(out) if isinstance(out, (bytes, bytearray)) else str(out).encode("latin-1")
    filename = f"employee_clearance_{employee_id}_{(month or 'all')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/bulk-delete-test")
async def bulk_delete_test():
    """Test endpoint for bulk delete."""
    return {"message": "Bulk delete test endpoint works"}


@router.put("/bulk-delete")
async def bulk_delete_employees(
    employee_ids: List[str],
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:delete")),
):
    """Delete multiple employees by employee_ids."""
    
    if not employee_ids:
        raise HTTPException(status_code=400, detail="No employee IDs provided")
    
    # Find all employees to delete
    employees = db.query(Employee).filter(Employee.employee_id.in_(employee_ids)).all()
    
    if not employees:
        raise HTTPException(status_code=404, detail="No employees found with provided IDs")
    
    found_ids = {emp.employee_id for emp in employees}
    missing_ids = set(employee_ids) - found_ids
    
    # Delete found employees
    for employee in employees:
        db.delete(employee)
    
    db.commit()
    
    result = {
        "message": f"Successfully deleted {len(employees)} employee(s)",
        "deleted_count": len(employees),
        "deleted_ids": list(found_ids)
    }
    
    if missing_ids:
        result["warning"] = f"Could not find {len(missing_ids)} employee(s): {', '.join(missing_ids)}"
    
    return result


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:delete")),
):
    """Delete an employee by employee_id."""

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    db.delete(employee)
    db.commit()

    return {"message": "Employee deleted successfully"}


@router.get("/departments/list")
async def get_departments(db: Session = Depends(get_db)):
    """Get all unique departments from employees."""
    
    departments = db.query(Employee.department).filter(
        Employee.department.isnot(None),
        Employee.department != ""
    ).distinct().all()
    
    return {"departments": [dept[0] for dept in departments if dept[0]]}


@router.get("/designations/list")
async def get_designations(db: Session = Depends(get_db)):
    """Get all unique designations from employees."""
    
    designations = db.query(Employee.designation).filter(
        Employee.designation.isnot(None),
        Employee.designation != ""
    ).distinct().all()
    
    return {"designations": [desig[0] for desig in designations if desig[0]]}

