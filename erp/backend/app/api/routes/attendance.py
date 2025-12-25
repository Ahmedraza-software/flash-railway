from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.schemas.attendance import AttendanceBulkUpsert, AttendanceList

from fpdf import FPDF
from calendar import monthrange

from datetime import date as dt_date


router = APIRouter(dependencies=[Depends(require_permission("attendance:manage"))])


@router.get("/employee/{employee_id}")
async def employee_attendance_range(
    employee_id: str,
    from_date: date,
    to_date: date,
    db: Session = Depends(get_db),
) -> dict:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.employee_id == employee_id,
            AttendanceRecord.date >= from_date,
            AttendanceRecord.date <= to_date,
        )
        .order_by(AttendanceRecord.date.asc())
        .all()
    )
    by_date = {r.date: r for r in records}

    rows: list[dict] = []
    d = from_date
    while d <= to_date:
        r = by_date.get(d)
        if not r:
            rows.append(
                {
                    "date": d.isoformat(),
                    "status": "unmarked",
                    "leave_type": None,
                    "overtime_minutes": None,
                    "overtime_rate": None,
                    "late_minutes": None,
                    "late_deduction": None,
                    "fine_amount": None,
                    "note": None,
                }
            )
        else:
            rows.append(
                {
                    "date": d.isoformat(),
                    "status": r.status,
                    "leave_type": r.leave_type,
                    "overtime_minutes": r.overtime_minutes,
                    "overtime_rate": r.overtime_rate,
                    "late_minutes": r.late_minutes,
                    "late_deduction": r.late_deduction,
                    "fine_amount": r.fine_amount,
                    "note": r.note,
                }
            )

        d = d.fromordinal(d.toordinal() + 1)

    return {
        "employee_id": employee_id,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "rows": rows,
    }


def _build_employee_attendance_range_pdf(
    *,
    employee_id: str,
    employee_name: str,
    from_date: date,
    to_date: date,
    rows: list[dict],
) -> bytes:
    def _safe_text(v: object) -> str:
        try:
            return ("" if v is None else str(v)).encode("latin-1", "replace").decode("latin-1")
        except Exception:
            return ""

    def _fmt_status(r: dict) -> str:
        st = str(r.get("status") or "").strip().lower()
        if not st or st == "unmarked":
            return "-"
        if st == "leave":
            lt = str(r.get("leave_type") or "paid").strip().lower()
            return f"Leave ({lt.upper()})"
        return st[:1].upper() + st[1:]

    def _fmt_int(v: object) -> str:
        if v is None or v == "":
            return ""
        try:
            return str(int(v))
        except Exception:
            return ""

    def _fmt_money(v: object) -> str:
        if v is None or v == "":
            return ""
        try:
            n = float(v)
        except Exception:
            return ""
        return f"{n:,.2f}".replace(",", "")

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()

    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", style="B", size=14)
    pdf.cell(0, 8, "Employee Attendance", ln=1)

    pdf.set_font("Helvetica", size=10)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(0, 6, f"Employee: {employee_id}  {employee_name}", ln=1)
    pdf.cell(0, 6, f"Period: {from_date.isoformat()} to {to_date.isoformat()}", ln=1)
    pdf.ln(3)

    headers = ["Date", "Status", "OT (mins)", "Late (mins)", "Fine", "Note"]
    col_widths = [26, 30, 22, 24, 18, 0]
    header_h = 8
    line_h = 6

    pdf.set_text_color(15, 23, 42)
    pdf.set_fill_color(249, 243, 233)
    pdf.set_draw_color(230, 230, 230)
    pdf.set_font("Helvetica", style="B", size=9)

    for i, h in enumerate(headers):
        w = col_widths[i] if col_widths[i] else (pdf.w - pdf.l_margin - pdf.r_margin - sum(col_widths[:-1]))
        pdf.cell(w, header_h, h, border=1, fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", size=9)
    for idx, r in enumerate(rows):
        date_txt = _safe_text(r.get("date"))
        status_txt = _safe_text(_fmt_status(r))
        ot_txt = _fmt_int(r.get("overtime_minutes"))
        late_txt = _fmt_int(r.get("late_minutes"))
        fine_txt = _fmt_money(r.get("fine_amount"))
        note_txt = _safe_text(r.get("note"))

        values = [date_txt, status_txt, ot_txt, late_txt, fine_txt, note_txt]

        x0 = pdf.get_x()
        y0 = pdf.get_y()

        note_w = pdf.w - pdf.l_margin - pdf.r_margin - sum(col_widths[:-1])
        note_lines = pdf.multi_cell(note_w, line_h, values[-1], border=0, split_only=True)
        max_lines = max(1, len(note_lines) if note_lines else 1)
        row_h = max_lines * line_h

        if idx % 2 == 0:
            pdf.set_fill_color(255, 255, 255)
        else:
            pdf.set_fill_color(252, 250, 246)

        # First 5 columns
        for i in range(5):
            w = col_widths[i]
            pdf.set_xy(x0 + sum(col_widths[:i]), y0)
            align = "L"
            if i in (2, 3, 4):
                align = "R"
            pdf.cell(w, row_h, values[i], border=1, fill=True, align=align)

        # Note
        pdf.set_xy(x0 + sum(col_widths[:5]), y0)
        pdf.multi_cell(note_w, line_h, values[5], border=1, fill=True)
        pdf.set_xy(x0, y0 + row_h)

    out = pdf.output(dest="S")
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    return str(out).encode("latin-1")


@router.get("/employee/{employee_id}/export/pdf")
async def export_employee_attendance_pdf(
    employee_id: str,
    from_date: date,
    to_date: date,
    db: Session = Depends(get_db),
) -> Response:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    emp_name = ""
    if emp is not None:
        emp_name = " ".join([p for p in [getattr(emp, "first_name", ""), getattr(emp, "last_name", "")] if p]).strip()

    records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.employee_id == employee_id,
            AttendanceRecord.date >= from_date,
            AttendanceRecord.date <= to_date,
        )
        .order_by(AttendanceRecord.date.asc())
        .all()
    )
    by_date = {r.date: r for r in records}

    rows: list[dict] = []
    d = from_date
    while d <= to_date:
        r = by_date.get(d)
        if not r:
            rows.append(
                {
                    "date": d.isoformat(),
                    "status": "unmarked",
                    "leave_type": None,
                    "overtime_minutes": None,
                    "late_minutes": None,
                    "fine_amount": None,
                    "note": None,
                }
            )
        else:
            rows.append(
                {
                    "date": d.isoformat(),
                    "status": r.status,
                    "leave_type": r.leave_type,
                    "overtime_minutes": r.overtime_minutes,
                    "late_minutes": r.late_minutes,
                    "fine_amount": r.fine_amount,
                    "note": r.note,
                }
            )
        d = d.fromordinal(d.toordinal() + 1)

    pdf_bytes = _build_employee_attendance_range_pdf(
        employee_id=employee_id,
        employee_name=emp_name,
        from_date=from_date,
        to_date=to_date,
        rows=rows,
    )
    filename = f"attendance_{employee_id}_{from_date.isoformat()}_{to_date.isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/summary")
async def attendance_summary(
    from_date: date,
    to_date: date,
    department: str | None = None,
    designation: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    cutoff = datetime.combine(to_date, time.max)

    emp_q = db.query(Employee).filter(Employee.created_at <= cutoff)
    if department:
        emp_q = emp_q.filter(Employee.department == department)
    if designation:
        emp_q = emp_q.filter(Employee.designation == designation)

    total_employees = int(emp_q.count())

    # Count marked attendance records by status
    att_q = (
        db.query(AttendanceRecord.status, func.count(AttendanceRecord.id))
        .join(Employee, Employee.employee_id == AttendanceRecord.employee_id)
        .filter(and_(AttendanceRecord.date >= from_date, AttendanceRecord.date <= to_date))
        .filter(Employee.created_at <= cutoff)
    )
    if department:
        att_q = att_q.filter(Employee.department == department)
    if designation:
        att_q = att_q.filter(Employee.designation == designation)

    rows = att_q.group_by(AttendanceRecord.status).all()
    counts = {str(st or "").strip().lower(): int(c or 0) for st, c in rows}

    present = int(counts.get("present", 0))
    late = int(counts.get("late", 0))
    absent = int(counts.get("absent", 0))
    leave = int(counts.get("leave", 0))
    unmarked = max(0, total_employees - (present + late + absent + leave))

    fine_total = (
        db.query(func.coalesce(func.sum(AttendanceRecord.fine_amount), 0.0))
        .join(Employee, Employee.employee_id == AttendanceRecord.employee_id)
        .filter(and_(AttendanceRecord.date >= from_date, AttendanceRecord.date <= to_date))
        .filter(Employee.created_at <= cutoff)
    )
    if department:
        fine_total = fine_total.filter(Employee.department == department)
    if designation:
        fine_total = fine_total.filter(Employee.designation == designation)
    fine_total_val = float(fine_total.scalar() or 0.0)

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "total": total_employees,
        "unmarked": unmarked,
        "present": present,
        "late": late,
        "absent": absent,
        "leave": leave,
        "fine_total": fine_total_val,
    }


def _build_attendance_pdf(
    *,
    report_date: date,
    rows: list[dict],

) -> bytes:
    def _fmt_money(v) -> str:
        if v is None or v == "":
            return ""
        try:
            n = float(v)
        except (TypeError, ValueError):
            return ""
        if n == 0:
            return "0.00"
        return f"{n:,.2f}".replace(",", "")

    def _fmt_int(v) -> str:
        if v is None or v == "":
            return ""
        try:
            return str(int(v))
        except (TypeError, ValueError):
            return ""

    def _fmt_ot(total_minutes) -> str:
        if total_minutes is None or total_minutes == "":
            return ""
        try:
            mins = int(total_minutes)
        except (TypeError, ValueError):
            return ""
        if mins <= 0:
            return ""
        h = mins // 60
        m = mins % 60
        return f"{h:02d}:{m:02d}"

    # Landscape fits the extra columns much better.
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()

    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", style="B", size=14)
    pdf.cell(0, 8, f"Attendance Report", ln=1)

    pdf.set_font("Helvetica", size=10)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(0, 6, f"Date: {report_date.isoformat()}    -    Exported from Flash ERP", ln=1)
    pdf.ln(3)

    pdf.set_text_color(15, 23, 42)

    headers = [
        "Employee ID",
        "Name",
        "Department",
        "Shift",
        "Status",
        "Leave",
        "OT",
        "OT Rate",
        "Late",
        "Deduct",
        "Fine",
        "Note",
    ]
    # Last column (Note) is calculated as remaining width.
    col_widths = [22, 44, 32, 28, 16, 18, 14, 16, 14, 18, 16, 0]

    header_h = 8
    line_h = 6

    pdf.set_fill_color(249, 243, 233)
    pdf.set_draw_color(230, 230, 230)
    pdf.set_font("Helvetica", style="B", size=9)
    for i, h in enumerate(headers):
        w = col_widths[i] if col_widths[i] else (pdf.w - pdf.l_margin - pdf.r_margin - sum(col_widths[:-1]))
        pdf.cell(w, header_h, h, border=1, fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", size=9)

    for idx, r in enumerate(rows):
        status = str(r.get("status", "") or "").strip().lower()
        if status:
            status = status[:1].upper() + status[1:]

        values = [
            str(r.get("employee_id", "") or ""),
            str(r.get("name", "") or ""),
            str(r.get("department", "") or ""),
            str(r.get("shift_type", "") or ""),
            status,
            str(r.get("leave_type", "") or ""),
            _fmt_ot(r.get("overtime_minutes")),
            _fmt_money(r.get("overtime_rate")),
            _fmt_int(r.get("late_minutes")),
            _fmt_money(r.get("late_deduction")),
            _fmt_money(r.get("fine_amount")),
            str(r.get("note", "") or ""),
        ]

        x0 = pdf.get_x()
        y0 = pdf.get_y()
        note_w = pdf.w - pdf.l_margin - pdf.r_margin - sum(col_widths[:-1])
        note_lines = pdf.multi_cell(note_w, line_h, values[-1], border=0, split_only=True)
        max_lines = max(1, len(note_lines) if note_lines else 1)
        row_h = max_lines * line_h

        # Zebra rows
        if idx % 2 == 0:
            pdf.set_fill_color(255, 255, 255)
        else:
            pdf.set_fill_color(252, 250, 246)

        # First 11 columns
        for i in range(11):
            w = col_widths[i]
            pdf.set_xy(x0 + sum(col_widths[:i]), y0)

            # Right-align numeric columns
            align = "L"
            if i in (6, 7, 8, 9, 10):
                align = "R"

            pdf.cell(w, row_h, values[i], border=1, fill=True, align=align)

        # Note column (wrap)
        pdf.set_xy(x0 + sum(col_widths[:11]), y0)
        pdf.multi_cell(note_w, line_h, values[11], border=1, fill=True)

        pdf.set_xy(x0, y0 + row_h)

    out = pdf.output(dest="S")
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    return str(out).encode("latin-1")


def _build_attendance_monthly_pdf(
    *,
    month_start: date,
    month_end: date,
    rows: list[dict],
) -> bytes:
    def _safe_text(s: str) -> str:
        try:
            return (s or "").encode("latin-1", "replace").decode("latin-1")
        except Exception:
            return ""

    days_in_month = monthrange(month_start.year, month_start.month)[1]

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()

    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", style="B", size=14)
    pdf.cell(0, 8, "Monthly Attendance Sheet", ln=1)

    pdf.set_font("Helvetica", size=10)
    pdf.set_text_color(107, 114, 128)
    month_label = month_start.strftime("%B %Y")
    pdf.cell(0, 6, f"Month/Year: {month_label}    -    Exported from Flash ERP", ln=1)
    pdf.ln(3)

    pdf.set_text_color(15, 23, 42)

    col_no_w = 8
    col_emp_w = 22
    col_name_w = 42
    day_w = (pdf.w - pdf.l_margin - pdf.r_margin - col_no_w - col_emp_w - col_name_w) / float(days_in_month)
    if day_w > 8:
        day_w = 8

    total_w = col_no_w + col_emp_w + col_name_w + (day_w * float(days_in_month))
    if total_w > (pdf.w - pdf.l_margin - pdf.r_margin):
        day_w = (pdf.w - pdf.l_margin - pdf.r_margin - col_no_w - col_emp_w - col_name_w) / float(days_in_month)

    header_h = 8
    row_h = 6

    pdf.set_fill_color(249, 243, 233)
    pdf.set_draw_color(230, 230, 230)
    pdf.set_font("Helvetica", style="B", size=7)

    x0 = pdf.get_x()
    y0 = pdf.get_y()

    pdf.set_xy(x0, y0)
    pdf.cell(col_no_w, header_h, "No.", border=1, fill=True, align="C")
    pdf.set_xy(x0 + col_no_w, y0)
    pdf.cell(col_emp_w, header_h, "Emp ID", border=1, fill=True, align="C")
    pdf.set_xy(x0 + col_no_w + col_emp_w, y0)
    pdf.cell(col_name_w, header_h, "Employee Name", border=1, fill=True, align="C")

    for d in range(1, days_in_month + 1):
        pdf.set_xy(x0 + col_no_w + col_emp_w + col_name_w + (day_w * float(d - 1)), y0)
        pdf.cell(day_w, header_h, str(d), border=1, fill=True, align="C")

    pdf.set_xy(x0, y0 + header_h)

    pdf.set_font("Helvetica", size=7)

    for idx, r in enumerate(rows):
        if idx % 2 == 0:
            pdf.set_fill_color(255, 255, 255)
        else:
            pdf.set_fill_color(252, 250, 246)

        emp_id = _safe_text(str(r.get("employee_id", "") or ""))
        name = _safe_text(str(r.get("name", "") or ""))
        day_codes: list[str] = r.get("days", []) or []

        y = pdf.get_y()
        x = pdf.get_x()

        pdf.set_xy(x, y)
        pdf.cell(col_no_w, row_h, str(idx + 1), border=1, fill=True, align="C")
        pdf.set_xy(x + col_no_w, y)
        pdf.cell(col_emp_w, row_h, emp_id, border=1, fill=True, align="L")
        pdf.set_xy(x + col_no_w + col_emp_w, y)
        if len(name) > 26:
            name = name[:26]
        pdf.cell(col_name_w, row_h, name, border=1, fill=True, align="L")

        for i in range(days_in_month):
            code = ""
            if i < len(day_codes):
                code = _safe_text(str(day_codes[i] or ""))
            pdf.set_xy(x + col_no_w + col_emp_w + col_name_w + (day_w * float(i)), y)
            pdf.cell(day_w, row_h, code, border=1, fill=True, align="C")

        pdf.set_xy(x, y + row_h)

    pdf.ln(4)
    pdf.set_text_color(107, 114, 128)
    pdf.set_font("Helvetica", size=9)
    pdf.cell(0, 5, "Legend: P=Present  A=Absent  T=Tardy(Late)  U=Unpaid Leave  E=Excused(Paid Leave)", ln=1)

    out = pdf.output(dest="S")
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    return str(out).encode("latin-1")


@router.get("/", response_model=AttendanceList)
async def list_attendance(
    date: date,
    db: Session = Depends(get_db),
) -> AttendanceList:
    records = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.date == date)
        .order_by(AttendanceRecord.employee_id.asc())
        .all()
    )
    return AttendanceList(date=date, records=records)


@router.put("/", response_model=AttendanceList)
async def bulk_upsert_attendance(
    payload: AttendanceBulkUpsert,
    db: Session = Depends(get_db),
) -> AttendanceList:
    for rec in payload.records:
        existing = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.employee_id == rec.employee_id,
                AttendanceRecord.date == payload.date,
            )
            .first()
        )

        status = (rec.status or "").strip().lower()

        # Treat 'unmarked' as clearing the record.
        if status == "unmarked":
            if existing:
                db.delete(existing)
            continue

        if not existing:
            db.add(
                AttendanceRecord(
                    employee_id=rec.employee_id,
                    date=payload.date,
                    status=status,
                    note=rec.note,
                    overtime_minutes=rec.overtime_minutes,
                    overtime_rate=rec.overtime_rate,
                    late_minutes=rec.late_minutes,
                    late_deduction=rec.late_deduction,
                    leave_type=rec.leave_type,
                    fine_amount=rec.fine_amount,
                )
            )
        else:
            existing.status = status
            existing.note = rec.note
            existing.overtime_minutes = rec.overtime_minutes
            existing.overtime_rate = rec.overtime_rate
            existing.late_minutes = rec.late_minutes
            existing.late_deduction = rec.late_deduction
            existing.leave_type = rec.leave_type
            existing.fine_amount = rec.fine_amount

    db.commit()

    records = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.date == payload.date)
        .order_by(AttendanceRecord.employee_id.asc())
        .all()
    )
    return AttendanceList(date=payload.date, records=records)


@router.get("/export/pdf")
async def export_attendance_pdf(
    report_date: date | None = None,
    date: date | None = Query(default=None),
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
) -> Response:
    # Backwards-compatible: frontend sends ?date=YYYY-MM-DD for single-day export.
    if report_date is None and date is not None:
        report_date = date
    if from_date and to_date:
        if from_date > to_date:
            raise HTTPException(status_code=400, detail="from_date must be <= to_date")
        if from_date.year != to_date.year or from_date.month != to_date.month:
            raise HTTPException(status_code=400, detail="from_date and to_date must be in the same month")

        month_start = dt_date(from_date.year, from_date.month, 1)
        month_end = dt_date(from_date.year, from_date.month, monthrange(from_date.year, from_date.month)[1])
        cutoff = datetime.combine(to_date, time.max)
        employees = (
            db.query(Employee)
            .filter(Employee.created_at <= cutoff)
            .order_by(Employee.employee_id.asc())
            .all()
        )
        attendance = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.date >= month_start, AttendanceRecord.date <= month_end)
            .order_by(AttendanceRecord.employee_id.asc(), AttendanceRecord.date.asc())
            .all()
        )

        by_emp_by_date: dict[str, dict[date, AttendanceRecord]] = {}
        for r in attendance:
            by_emp_by_date.setdefault(r.employee_id, {})[r.date] = r

        def _code(a: AttendanceRecord | None) -> str:
            if not a:
                return ""
            st = (a.status or "").strip().lower()
            if st == "present":
                return "P"
            if st == "absent":
                return "A"
            if st == "late":
                return "T"
            if st == "leave":
                lt = (a.leave_type or "").strip().lower()
                return "U" if lt == "unpaid" else "E"
            return ""

        out_rows: list[dict] = []
        for e in employees:
            name = " ".join([p for p in [e.first_name, e.last_name] if p])
            days: list[str] = []
            dcur = month_start
            while dcur <= month_end:
                rec = by_emp_by_date.get(e.employee_id, {}).get(dcur)
                days.append(_code(rec))
                dcur = dcur.fromordinal(dcur.toordinal() + 1)
            out_rows.append({"employee_id": e.employee_id, "name": name, "days": days})

        pdf_bytes = _build_attendance_monthly_pdf(month_start=month_start, month_end=month_end, rows=out_rows)
        filename = f"attendance_{from_date.strftime('%Y-%m')}.pdf"
    else:
        if report_date is None:
            raise HTTPException(status_code=400, detail="date is required when from_date/to_date not provided")

        cutoff = datetime.combine(report_date, time.max)
        employees = (
            db.query(Employee)
            .filter(Employee.created_at <= cutoff)
            .order_by(Employee.employee_id.asc())
            .all()
        )
        attendance = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.date == report_date)
            .order_by(AttendanceRecord.employee_id.asc())
            .all()
        )

        by_employee_id = {r.employee_id: r for r in attendance}
        rows: list[dict] = []
        for e in employees:
            a = by_employee_id.get(e.employee_id)
            rows.append(
                {
                    "employee_id": e.employee_id,
                    "name": " ".join([p for p in [e.first_name, e.last_name] if p]),
                    "department": e.department or "-",
                    "shift_type": e.shift_type or "-",
                    "status": (a.status if a else "unmarked"),
                    "note": (a.note if a else ""),
                    "overtime_minutes": (a.overtime_minutes if a else None),
                    "overtime_rate": (a.overtime_rate if a else None),
                    "late_minutes": (a.late_minutes if a else None),
                    "late_deduction": (a.late_deduction if a else None),
                    "leave_type": (a.leave_type if a else None),
                    "fine_amount": (a.fine_amount if a else None),
                }
            )

        pdf_bytes = _build_attendance_pdf(report_date=report_date, rows=rows)
        filename = f"attendance_{report_date.isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
