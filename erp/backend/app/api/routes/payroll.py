from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from fpdf import FPDF

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.attendance import AttendanceRecord
from app.models.employee2 import Employee2
from app.models.employee_advance_deduction import EmployeeAdvanceDeduction
from app.models.payroll_payment_status import PayrollPaymentStatus
from app.models.payroll_sheet_entry import PayrollSheetEntry
from app.schemas.payroll import PayrollReportResponse
from app.schemas.payroll_payment_status import PayrollPaymentStatusOut, PayrollPaymentStatusUpsert
from app.schemas.payroll_sheet_entry import PayrollSheetEntryBulkUpsert, PayrollSheetEntryOut, PayrollSheetEntryUpsert


router = APIRouter(dependencies=[Depends(require_permission("payroll:view"))])


@router.get("/payment-status", response_model=PayrollPaymentStatusOut)
async def get_payment_status(
    month: str,
    employee_id: str,
    db: Session = Depends(get_db),
) -> PayrollPaymentStatusOut:
    row = (
        db.query(PayrollPaymentStatus)
        .filter(
            PayrollPaymentStatus.month == month,
            PayrollPaymentStatus.employee_id == employee_id,
        )
        .first()
    )
    if not row:
        row = PayrollPaymentStatus(month=month, employee_id=employee_id, status="unpaid")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("/payment-status", response_model=PayrollPaymentStatusOut)
async def upsert_payment_status(
    payload: PayrollPaymentStatusUpsert,
    db: Session = Depends(get_db),
) -> PayrollPaymentStatusOut:
    status = (payload.status or "").strip().lower()
    if status not in ("paid", "unpaid"):
        raise HTTPException(status_code=400, detail="status must be 'paid' or 'unpaid'")

    row = (
        db.query(PayrollPaymentStatus)
        .filter(
            PayrollPaymentStatus.month == payload.month,
            PayrollPaymentStatus.employee_id == payload.employee_id,
        )
        .first()
    )

    emp = db.query(Employee2).filter(Employee2.fss_no == payload.employee_id).first()
    emp_db_id = emp.id if emp else None

    net_snapshot: float | None = None
    if status == "paid":
        rep = await payroll_report(month=payload.month, db=db)
        match = next((r for r in rep.rows if r.employee_id == payload.employee_id), None)
        if match is not None:
            net_snapshot = float(match.net_pay or 0.0)
    if not row:
        row = PayrollPaymentStatus(
            month=payload.month,
            employee_id=payload.employee_id,
            status=status,
        )
        db.add(row)
    else:
        row.status = status

    row.employee_db_id = emp_db_id
    row.net_pay_snapshot = net_snapshot if status == "paid" else None

    db.commit()
    db.refresh(row)
    return row


def _parse_month(month: str) -> tuple[date, date]:
    try:
        year_str, month_str = month.split("-")
        year = int(year_str)
        mm = int(month_str)
        if mm < 1 or mm > 12:
            raise ValueError
    except Exception as e:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format") from e

    last_day = monthrange(year, mm)[1]
    start = date(year, mm, 1)
    end = date(year, mm, last_day)
    return start, end


def _parse_date(d: str, *, field: str) -> date:
    try:
        y, m, dd = d.split("-")
        return date(int(y), int(m), int(dd))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{field} must be in YYYY-MM-DD format") from e


def _month_label(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _days_inclusive(start: date, end: date) -> int:
    return int((end - start).days) + 1


def _last_day_of_month(d: date) -> date:
    last = monthrange(d.year, d.month)[1]
    return date(d.year, d.month, last)


def _to_float(v) -> float:
    if v is None:
        return 0.0
    try:
        s = str(v).strip()
        if s == "":
            return 0.0
        return float(s)
    except Exception:
        return 0.0


def _build_payroll_pdf(*, title: str, subtitle: str, rows: list[dict], summary: dict) -> bytes:
    def _fmt_money(v) -> str:
        try:
            n = float(v)
        except Exception:
            return ""
        return f"{n:,.2f}".replace(",", "")

    def _fmt_int(v) -> str:
        try:
            return str(int(v or 0))
        except Exception:
            return "0"

    def _truncate(s: str, max_len: int) -> str:
        ss = (s or "").strip()
        if len(ss) <= max_len:
            return ss
        if max_len <= 3:
            return ss[:max_len]
        return ss[: max_len - 3] + "..."

    def _safe_text(s: str) -> str:
        # FPDF core fonts (e.g., Helvetica) only support latin-1.
        # Replace any unsupported chars to avoid FPDFUnicodeEncodingException.
        try:
            return (s or "").encode("latin-1", "replace").decode("latin-1")
        except Exception:
            return ""

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()

    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", style="B", size=14)
    pdf.cell(0, 8, title, ln=1)

    pdf.set_font("Helvetica", size=10)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(0, 6, subtitle, ln=1)
    pdf.ln(3)

    pdf.set_text_color(15, 23, 42)

    headers = [
        "Sr.\nNo.",
        "FSS\nNo.",
        "Employee Name",
        "Salary\nPer Month",
        "Pre.\nDays",
        "Cur.\nDays",
        "Leave\nEncashment",
        "Total\nDays",
        "Total\nSalary",
        "O.T",
        "O.T\nAmount",
        "Allow./\nOther",
        "Gross\nSalary",
        "EOBI",
        "Tax",
        "Fine/\nAdv.",
        "Net\nPayable",
        "Remarks/\nSignature",
        "Bank/\nCash",
    ]

    # Tuned to fit A4 landscape with margins while keeping it readable
    col_widths = [8, 16, 28, 16, 9, 9, 12, 9, 16, 10, 14, 14, 16, 10, 10, 12, 16, 22, 26]

    header_h = 10
    line_h = 6

    pdf.set_fill_color(249, 243, 233)
    pdf.set_draw_color(230, 230, 230)
    pdf.set_font("Helvetica", style="B", size=8)

    x0 = pdf.get_x()
    y0 = pdf.get_y()
    for i, h in enumerate(headers):
        pdf.set_xy(x0 + sum(col_widths[:i]), y0)
        align = "L" if i in (1, 2, 17, 18) else "C"
        pdf.multi_cell(col_widths[i], header_h / 2, h, border=1, align=align, fill=True)
    pdf.set_xy(x0, y0 + header_h)

    pdf.set_font("Helvetica", size=8)

    for idx, r in enumerate(rows):
        if idx % 2 == 0:
            pdf.set_fill_color(255, 255, 255)
        else:
            pdf.set_fill_color(252, 250, 246)

        vals = [
            str(idx + 1),
            str(r.get("fss_no", "") or ""),
            str(r.get("name", "") or ""),
            _fmt_money(r.get("base_salary", 0.0)),
            _fmt_int(r.get("pre_days", 0)),
            _fmt_int(r.get("cur_days", 0)),
            _fmt_int(r.get("leave_encashment_days", 0)),
            _fmt_int(r.get("total_days", 0)),
            _fmt_money(r.get("total_salary", 0.0)),
            f"{_fmt_int(r.get('overtime_minutes', 0))}m",
            _fmt_money(r.get("overtime_pay", 0.0)),
            _fmt_money(r.get("allow_other", 0.0)),
            _fmt_money(r.get("gross_pay", 0.0)),
            _fmt_money(r.get("eobi", 0.0)),
            _fmt_money(r.get("tax", 0.0)),
            _fmt_money(r.get("fine_adv_extra", 0.0)),
            _fmt_money(r.get("net_pay", 0.0)),
            str(r.get("remarks", "") or ""),
            str(r.get("bank_cash", "") or ""),
        ]

        # Simple truncation for long text columns
        vals[1] = _truncate(vals[1], 18)
        vals[2] = _truncate(vals[2], 20)
        vals[17] = _truncate(vals[17], 22)
        vals[18] = _truncate(vals[18], 30)

        vals = [_safe_text(v) for v in vals]

        x0 = pdf.get_x()
        y0 = pdf.get_y()
        row_h = line_h

        for i in range(len(col_widths)):
            pdf.set_xy(x0 + sum(col_widths[:i]), y0)
            if i in (1, 2, 17, 18):
                align = "L"
            elif i == 0:
                align = "C"
            else:
                align = "R"
            pdf.cell(col_widths[i], row_h, vals[i], border=1, fill=True, align=align)

        pdf.set_xy(x0, y0 + row_h)

    out = pdf.output(dest="S")
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    return str(out).encode("latin-1")


@router.get("/report", response_model=PayrollReportResponse)
async def payroll_report(
    month: str,
    db: Session = Depends(get_db),
) -> PayrollReportResponse:
    start, end = _parse_month(month)
    cutoff = datetime.combine(end, time.max)

    employees = (
        db.query(Employee2)
        .filter(or_(Employee2.created_at == None, Employee2.created_at <= cutoff))
        .order_by(Employee2.serial_no.asc())
        .all()
    )

    attendance = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.date >= start, AttendanceRecord.date <= end)
        .all()
    )

    by_emp: dict[str, list[AttendanceRecord]] = {}
    for rec in attendance:
        by_emp.setdefault(rec.employee_id, []).append(rec)

    paid_status_by_emp: dict[str, str] = {
        r.employee_id: (r.status or "unpaid")
        for r in db.query(PayrollPaymentStatus)
        .filter(PayrollPaymentStatus.month == month)
        .all()
    }

    sheet_by_emp_db_id: dict[int, PayrollSheetEntry] = {
        r.employee_db_id: r
        for r in db.query(PayrollSheetEntry)
        .filter(PayrollSheetEntry.from_date == start, PayrollSheetEntry.to_date == end)
        .all()
    }

    advance_ded_by_emp_db_id: dict[int, float] = {
        r.employee_db_id: float(r.amount or 0.0)
        for r in db.query(EmployeeAdvanceDeduction)
        .filter(EmployeeAdvanceDeduction.month == month)
        .all()
    }

    rows: list[dict] = []
    total_gross = 0.0
    total_net = 0.0

    for e in employees:
        employee_id = e.fss_no or e.serial_no or str(e.id)
        base_salary = _to_float(e.salary)
        allowances = 0.0  # Employee2 doesn't have allowances field

        present_days = 0
        late_days = 0
        absent_days = 0
        paid_leave_days = 0
        unpaid_leave_days = 0

        overtime_minutes = 0
        overtime_pay = 0.0

        overtime_rate = 0.0

        late_minutes = 0
        late_deduction = 0.0

        late_rate = 0.0

        for a in by_emp.get(employee_id, []):
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
                overtime_pay += (float(a.overtime_minutes) / 60.0) * float(a.overtime_rate)
            # Keep track of the rate (use the latest non-zero rate) even if no minutes
            if a.overtime_rate and float(a.overtime_rate or 0) > 0:
                overtime_rate = float(a.overtime_rate)

            if a.late_minutes:
                late_minutes += int(a.late_minutes or 0)
            if a.late_deduction:
                late_deduction += float(a.late_deduction or 0)

        unpaid_leave_deduction = float(unpaid_leave_days) * 1000.0

        gross_pay = base_salary + allowances + overtime_rate + overtime_pay
        adv_ded = float(advance_ded_by_emp_db_id.get(e.id, 0.0) or 0.0)
        net_pay = gross_pay - late_deduction - unpaid_leave_deduction - adv_ded

        total_gross += gross_pay
        total_net += net_pay

        rows.append(
            {
                "employee_db_id": e.id,
                "employee_id": employee_id,
                "name": e.name or "",
                "department": e.category or "-",
                "shift_type": "-",
                "serial_no": e.serial_no,
                "fss_no": e.fss_no,
                "eobi_no": e.eobi_no,
                "base_salary": base_salary,
                "allowances": allowances,
                "present_days": present_days,
                "late_days": late_days,
                "absent_days": absent_days,
                "paid_leave_days": paid_leave_days,
                "unpaid_leave_days": unpaid_leave_days,
                "overtime_minutes": overtime_minutes,
                "overtime_pay": overtime_pay,
                "overtime_rate": overtime_rate,
                "late_minutes": late_minutes,
                "late_deduction": late_deduction,
                "unpaid_leave_deduction": unpaid_leave_deduction,
                "advance_deduction": adv_ded,
                "gross_pay": gross_pay,
                "net_pay": net_pay,
                "paid_status": paid_status_by_emp.get(employee_id, "unpaid"),
            }
        )

    summary = {
        "month": month,
        "employees": len(rows),
        "total_gross": total_gross,
        "total_net": total_net,
    }

    return PayrollReportResponse(month=month, summary=summary, rows=rows)


@router.get("/range-report", response_model=PayrollReportResponse)
async def payroll_range_report(
    from_date: str,
    to_date: str,
    month: str | None = None,
    db: Session = Depends(get_db),
) -> PayrollReportResponse:
    start = _parse_date(from_date, field="from_date")
    end = _parse_date(to_date, field="to_date")
    if start > end:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    month_label = month or _month_label(end)
    cutoff = datetime.combine(end, time.max)
    working_days = _days_inclusive(start, end)

    employees = (
        db.query(Employee2)
        .filter(or_(Employee2.created_at == None, Employee2.created_at <= cutoff))
        .all()
    )
    
    # Sort by serial_no numerically
    def sort_key(e):
        try:
            return int(e.serial_no or 0)
        except (ValueError, TypeError):
            return 999999
    employees = sorted(employees, key=sort_key)

    attendance = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.date >= start, AttendanceRecord.date <= end)
        .all()
    )

    # Build lookup by employee_id and date
    by_emp_by_date: dict[str, dict[date, AttendanceRecord]] = {}
    for rec in attendance:
        emp_id = str(rec.employee_id or "").strip()
        # Ensure date is a date object for consistent lookup
        rec_date = rec.date if isinstance(rec.date, date) else date.fromisoformat(str(rec.date))
        by_emp_by_date.setdefault(emp_id, {})[rec_date] = rec

    paid_status_by_emp: dict[str, str] = {
        r.employee_id: (r.status or "unpaid")
        for r in db.query(PayrollPaymentStatus)
        .filter(PayrollPaymentStatus.month == month_label)
        .all()
    }

    sheet_by_emp_db_id: dict[int, PayrollSheetEntry] = {
        r.employee_db_id: r
        for r in db.query(PayrollSheetEntry)
        .filter(PayrollSheetEntry.from_date == start, PayrollSheetEntry.to_date == end)
        .all()
    }

    advance_ded_by_emp_db_id: dict[int, float] = {
        r.employee_db_id: float(r.amount or 0.0)
        for r in db.query(EmployeeAdvanceDeduction)
        .filter(EmployeeAdvanceDeduction.month == month_label)
        .all()
    }

    rows: list[dict] = []
    total_gross = 0.0
    total_net = 0.0

    day_cursor_start = start

    pre_days_default = 0
    cur_days_default = working_days
    if start.year != end.year or start.month != end.month:
        pre_days_default = _days_inclusive(start, min(end, _last_day_of_month(start)))
        cur_days_default = working_days - pre_days_default

    for e in employees:
        employee_id = str(e.fss_no or e.serial_no or e.id).strip()
        
        base_salary = _to_float(e.salary)
        allowances = 0.0  # Employee2 doesn't have allowances field

        day_rate = (base_salary / float(working_days)) if working_days > 0 else 0.0

        present_days = 0
        late_days = 0
        absent_days = 0
        paid_leave_days = 0
        unpaid_leave_days = 0
        unmarked_days = 0

        overtime_minutes = 0
        overtime_pay = 0.0

        overtime_rate = 0.0

        late_minutes = 0
        late_deduction = 0.0

        late_rate = 0.0

        fine_deduction = 0.0

        dcur = day_cursor_start
        while dcur <= end:
            a = by_emp_by_date.get(employee_id, {}).get(dcur)
            st = (a.status or "unmarked").lower().strip() if a else "unmarked"

            if st == "present":
                present_days += 1
            elif st == "late":
                late_days += 1
            elif st == "absent":
                absent_days += 1
            elif st == "leave":
                if a and (a.leave_type or "").lower().strip() == "unpaid":
                    unpaid_leave_days += 1
                else:
                    paid_leave_days += 1
            else:
                # treat unmarked as absent for payroll purposes
                unmarked_days += 1

            if a is not None:
                if a.overtime_minutes and a.overtime_rate:
                    overtime_minutes += int(a.overtime_minutes or 0)
                    overtime_pay += (float(a.overtime_minutes) / 60.0) * float(a.overtime_rate)
                # Keep track of the rate (use the latest non-zero rate) even if no minutes
                if a.overtime_rate and float(a.overtime_rate or 0) > 0:
                    overtime_rate = float(a.overtime_rate)

                if a.late_minutes:
                    late_minutes += int(a.late_minutes or 0)
                if a.late_deduction:
                    late_deduction += float(a.late_deduction or 0)

                if a.fine_amount:
                    fine_deduction += float(a.fine_amount or 0)

            dcur = dcur + timedelta(days=1)

        # overtime_rate is already set from attendance records above

        if late_minutes > 0:
            late_rate = float(late_deduction) / float(late_minutes)

        # Calculate payable days from attendance (for reference)
        payable_days = int(present_days + late_days + paid_leave_days)
        if payable_days > working_days:
            payable_days = working_days

        # Presents total = present + late (both count as "worked")
        presents_total = present_days + late_days

        sheet = sheet_by_emp_db_id.get(e.id)
        leave_encashment_days = int(sheet.leave_encashment_days or 0) if sheet else 0

        # Pre/Cur days from sheet overrides (editable by user) - for display/reference only
        if sheet and sheet.pre_days_override is not None:
            pre_days = int(sheet.pre_days_override)
        else:
            pre_days = 0
        
        if sheet and sheet.cur_days_override is not None:
            cur_days = int(sheet.cur_days_override)
        else:
            cur_days = 0

        if pre_days < 0:
            pre_days = 0
        if cur_days < 0:
            cur_days = 0

        # Total days = Presents Total + Leave Encashment
        total_days = int(presents_total + leave_encashment_days)
        if total_days < 0:
            total_days = 0

        total_salary = float(total_days) * float(day_rate)

        allow_other = float(sheet.allow_other or 0.0) if sheet else 0.0
        eobi = float(sheet.eobi or 0.0) if sheet else 0.0
        tax = float(sheet.tax or 0.0) if sheet else 0.0
        fine_adv_extra = float(sheet.fine_adv_extra or 0.0) if sheet else 0.0
        remarks = (sheet.remarks if sheet else None)
        bank_cash = (sheet.bank_cash if sheet else None)

        # Attendance-derived fine + monthly advance deduction + any extra manual fine/adv
        adv_ded = float(advance_ded_by_emp_db_id.get(e.id, 0.0) or 0.0)
        fine_adv = float(fine_deduction) + float(adv_ded) + float(fine_adv_extra)

        # unpaid leave + absent + unmarked are already excluded by prorating, so unpaid_leave_deduction is 0 here.
        unpaid_leave_deduction = 0.0

        # Gross as per sheet: Total Salary + OT Rate + OT Amount + (Allowance + Other)
        gross_pay = total_salary + overtime_rate + overtime_pay + allowances + allow_other

        # Net payable: Gross - (EOBI + Tax + Fine/Adv + Late Deduction)
        net_pay = gross_pay - eobi - tax - fine_adv - late_deduction - unpaid_leave_deduction

        total_gross += gross_pay
        total_net += net_pay

        rows.append(
            {
                "employee_db_id": e.id,
                "employee_id": employee_id,
                "name": e.name or "",
                "department": e.category or "-",
                "shift_type": "-",
                "serial_no": e.serial_no,
                "fss_no": e.fss_no,
                "eobi_no": e.eobi_no,
                "base_salary": base_salary,
                "allowances": allowances,
                "bank_name": None,
                "account_number": None,
                "working_days": working_days,
                "day_rate": day_rate,
                "payable_days": payable_days,
                "basic_earned": total_salary,
                "pre_days": pre_days,
                "cur_days": cur_days,
                "leave_encashment_days": leave_encashment_days,
                "total_days": total_days,
                "total_salary": total_salary,
                "present_days": present_days,
                "late_days": late_days,
                "absent_days": absent_days,
                "paid_leave_days": paid_leave_days,
                "unpaid_leave_days": unpaid_leave_days,
                "unmarked_days": unmarked_days,
                "overtime_minutes": overtime_minutes,
                "overtime_pay": overtime_pay,
                "overtime_rate": overtime_rate,
                "late_minutes": late_minutes,
                "late_deduction": late_deduction,
                "late_rate": late_rate,
                "fine_deduction": fine_deduction,
                "allow_other": allow_other,
                "eobi": eobi,
                "tax": tax,
                "fine_adv_extra": fine_adv_extra,
                "fine_adv": fine_adv,
                "remarks": remarks,
                "bank_cash": bank_cash,
                "unpaid_leave_deduction": unpaid_leave_deduction,
                "advance_deduction": adv_ded,
                "gross_pay": gross_pay,
                "net_pay": net_pay,
                "paid_status": paid_status_by_emp.get(employee_id, "unpaid"),
            }
        )

    summary = {
        "month": month_label,
        "employees": len(rows),
        "total_gross": total_gross,
        "total_net": total_net,
    }

    return PayrollReportResponse(month=month_label, summary=summary, rows=rows)


@router.get("/sheet-entries", response_model=list[PayrollSheetEntryOut])
async def list_payroll_sheet_entries(
    from_date: str,
    to_date: str,
    db: Session = Depends(get_db),
) -> list[PayrollSheetEntryOut]:
    start = _parse_date(from_date, field="from_date")
    end = _parse_date(to_date, field="to_date")
    if start > end:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")
    return (
        db.query(PayrollSheetEntry)
        .filter(PayrollSheetEntry.from_date == start, PayrollSheetEntry.to_date == end)
        .order_by(PayrollSheetEntry.employee_db_id.asc())
        .all()
    )


@router.put("/sheet-entries", response_model=list[PayrollSheetEntryOut])
async def bulk_upsert_payroll_sheet_entries(
    payload: PayrollSheetEntryBulkUpsert,
    db: Session = Depends(get_db),
) -> list[PayrollSheetEntryOut]:
    start = payload.from_date
    end = payload.to_date
    if start > end:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    out: list[PayrollSheetEntry] = []

    for e in payload.entries:
        if e.from_date != start or e.to_date != end:
            raise HTTPException(status_code=400, detail="entry period must match payload from/to")

        row = (
            db.query(PayrollSheetEntry)
            .filter(
                PayrollSheetEntry.employee_db_id == e.employee_db_id,
                PayrollSheetEntry.from_date == start,
                PayrollSheetEntry.to_date == end,
            )
            .first()
        )

        if not row:
            row = PayrollSheetEntry(
                employee_db_id=e.employee_db_id,
                from_date=start,
                to_date=end,
            )
            db.add(row)

        row.pre_days_override = e.pre_days_override
        row.cur_days_override = e.cur_days_override
        row.leave_encashment_days = int(e.leave_encashment_days or 0)
        row.allow_other = float(e.allow_other or 0.0)
        row.eobi = float(e.eobi or 0.0)
        row.tax = float(e.tax or 0.0)
        row.fine_adv_extra = float(e.fine_adv_extra or 0.0)
        row.remarks = e.remarks
        row.bank_cash = e.bank_cash

        out.append(row)

    db.commit()

    # Refresh to return ids/created_at
    res: list[PayrollSheetEntryOut] = []
    for r in out:
        db.refresh(r)
        res.append(r)
    return res


@router.get("/export/pdf")
async def export_payroll_pdf(
    month: str,
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
) -> Response:
    def _fmt_money(v) -> str:
        try:
            n = float(v)
        except Exception:
            return ""
        return f"{n:,.2f}".replace(",", "")

    if from_date and to_date:
        rep = await payroll_range_report(from_date=from_date, to_date=to_date, month=month, db=db)
        rep_summary = rep.summary.model_dump() if hasattr(rep.summary, "model_dump") else dict(rep.summary)
        pdf_bytes = _build_payroll_pdf(
            title="Payroll",
            subtitle=f"{from_date} to {to_date}    -    Employees: {rep_summary.get('employees', 0)}    -    Net: {_fmt_money(rep_summary.get('total_net', 0.0))}",
            rows=[r.model_dump() if hasattr(r, 'model_dump') else dict(r) for r in rep.rows],
            summary=rep_summary,
        )
        filename = f"payroll_{from_date}_to_{to_date}.pdf"
    else:
        report = await payroll_report(month=month, db=db)
        report_summary = report.summary.model_dump() if hasattr(report.summary, "model_dump") else dict(report.summary)
        pdf_bytes = _build_payroll_pdf(
            title="Payroll",
            subtitle=f"Month: {report.month}    -    Employees: {report_summary.get('employees', 0)}    -    Net: {_fmt_money(report_summary.get('total_net', 0.0))}",
            rows=[r.model_dump() for r in report.rows],
            summary=report_summary,
        )
        filename = f"payroll_{month}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
