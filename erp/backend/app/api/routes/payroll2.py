from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from fpdf import FPDF

from app.core.database import get_db
from app.api.dependencies import require_permission, get_current_active_user
from app.models.attendance import AttendanceRecord
from app.models.employee2 import Employee2
from app.models.employee_advance_deduction import EmployeeAdvanceDeduction
from app.models.payroll_sheet_entry import PayrollSheetEntry
from app.models.user import User


router = APIRouter(dependencies=[Depends(require_permission("payroll:view"))])


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


@router.get("/range-report")
async def payroll2_range_report(
    from_date: str,
    to_date: str,
    month: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """
    Payroll2 range report with correct attendance counting.
    
    Key fields:
    - presents_total: Total present days from attendance (present + late status)
    - pre_days: Editable field for previous month portion
    - cur_days: Editable field for current month portion
    - total_days: pre_days + cur_days + leave_encashment (used for salary calculation)
    """
    start = _parse_date(from_date, field="from_date")
    end = _parse_date(to_date, field="to_date")
    if start > end:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    month_label = month or _month_label(end)
    cutoff = datetime.combine(end, time.max)
    working_days = _days_inclusive(start, end)

    # Load all employees
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

    # Load all attendance records in the date range
    attendance = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.date >= start, AttendanceRecord.date <= end)
        .all()
    )

    # Build lookup: employee_id -> date -> record
    by_emp_by_date: dict[str, dict[date, AttendanceRecord]] = {}
    for rec in attendance:
        emp_id = str(rec.employee_id or "").strip()
        # Ensure date is a date object
        if isinstance(rec.date, str):
            rec_date = date.fromisoformat(rec.date)
        else:
            rec_date = rec.date
        by_emp_by_date.setdefault(emp_id, {})[rec_date] = rec

    # Load sheet entries (user overrides)
    sheet_by_emp_db_id: dict[int, PayrollSheetEntry] = {
        r.employee_db_id: r
        for r in db.query(PayrollSheetEntry)
        .filter(PayrollSheetEntry.from_date == start, PayrollSheetEntry.to_date == end)
        .all()
    }

    # Load advance deductions
    advance_ded_by_emp_db_id: dict[int, float] = {
        r.employee_db_id: float(r.amount or 0.0)
        for r in db.query(EmployeeAdvanceDeduction)
        .filter(EmployeeAdvanceDeduction.month == month_label)
        .all()
    }

    rows: list[dict] = []
    total_gross = 0.0
    total_net = 0.0
    total_presents = 0

    for e in employees:
        # Employee ID used for attendance lookup
        employee_id = str(e.fss_no or e.serial_no or e.id).strip()
        
        base_salary = _to_float(e.salary)
        day_rate = (base_salary / float(working_days)) if working_days > 0 else 0.0

        # Count attendance from records
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

        fine_deduction = 0.0
        
        # Track present dates for tooltip - grouped by month
        present_dates_prev: list[str] = []  # Previous month dates
        present_dates_cur: list[str] = []   # Current month dates
        end_month = end.month

        # Iterate through each day in the range
        dcur = start
        while dcur <= end:
            a = by_emp_by_date.get(employee_id, {}).get(dcur)
            
            if a is not None:
                st = (a.status or "").lower().strip()
                
                if st == "present":
                    present_days += 1
                    date_str = dcur.strftime("%d %b")
                    if dcur.month == end_month:
                        present_dates_cur.append(date_str)
                    else:
                        present_dates_prev.append(date_str)
                elif st == "late":
                    late_days += 1
                    date_str = dcur.strftime("%d %b") + " (L)"
                    if dcur.month == end_month:
                        present_dates_cur.append(date_str)
                    else:
                        present_dates_prev.append(date_str)
                elif st == "absent":
                    absent_days += 1
                elif st == "leave":
                    if (a.leave_type or "").lower().strip() == "unpaid":
                        unpaid_leave_days += 1
                    else:
                        paid_leave_days += 1

                # OT calculation
                if a.overtime_minutes and a.overtime_rate:
                    overtime_minutes += int(a.overtime_minutes or 0)
                    overtime_pay += (float(a.overtime_minutes) / 60.0) * float(a.overtime_rate)
                
                # Track OT rate (use latest non-zero)
                if a.overtime_rate and float(a.overtime_rate or 0) > 0:
                    overtime_rate = float(a.overtime_rate)

                # Late tracking
                if a.late_minutes:
                    late_minutes += int(a.late_minutes or 0)
                if a.late_deduction:
                    late_deduction += float(a.late_deduction or 0)

                # Fine from attendance
                if a.fine_amount:
                    fine_deduction += float(a.fine_amount or 0)

            dcur = dcur + timedelta(days=1)

        # Presents Total = present + late (both count as "worked")
        presents_total = present_days + late_days
        total_presents += presents_total

        # Get sheet entry (user overrides)
        sheet = sheet_by_emp_db_id.get(e.id)
        
        # Pre/Cur days from sheet (editable by user) - for display/reference only
        if sheet and sheet.pre_days_override is not None:
            pre_days = int(sheet.pre_days_override)
        else:
            pre_days = 0
        
        if sheet and sheet.cur_days_override is not None:
            cur_days = int(sheet.cur_days_override)
        else:
            cur_days = 0
        
        leave_encashment_days = int(sheet.leave_encashment_days or 0) if sheet else 0

        # Total days = Presents Total + Leave Encashment
        total_days = presents_total + leave_encashment_days
        if total_days < 0:
            total_days = 0

        # Total salary based on total_days
        total_salary = float(total_days) * day_rate

        # Other sheet fields
        allow_other = float(sheet.allow_other or 0.0) if sheet else 0.0
        eobi = float(sheet.eobi or 0.0) if sheet else 0.0
        tax = float(sheet.tax or 0.0) if sheet else 0.0
        fine_adv_extra = float(sheet.fine_adv_extra or 0.0) if sheet else 0.0
        remarks = (sheet.remarks if sheet else None)
        bank_cash = (sheet.bank_cash if sheet else None)

        # Advance deduction
        adv_ded = float(advance_ded_by_emp_db_id.get(e.id, 0.0) or 0.0)
        
        # Total fine/adv = attendance fine + advance deduction + extra fine/adv
        fine_adv = fine_deduction + adv_ded + fine_adv_extra

        # Gross = Total Salary + OT Rate + OT Amount + Allow/Other
        gross_pay = total_salary + overtime_rate + overtime_pay + allow_other

        # Net = Gross - EOBI - Tax - Fine/Adv - Late Deduction
        net_pay = gross_pay - eobi - tax - fine_adv - late_deduction

        total_gross += gross_pay
        total_net += net_pay

        rows.append({
            "employee_db_id": e.id,
            "employee_id": employee_id,
            "name": e.name or "",
            "serial_no": e.serial_no,
            "fss_no": e.fss_no,
            "eobi_no": e.eobi_no,
            "base_salary": base_salary,
            "working_days": working_days,
            "day_rate": day_rate,
            # Attendance counts
            "presents_total": presents_total,
            "present_dates_prev": present_dates_prev,
            "present_dates_cur": present_dates_cur,
            "present_days": present_days,
            "late_days": late_days,
            "absent_days": absent_days,
            "paid_leave_days": paid_leave_days,
            "unpaid_leave_days": unpaid_leave_days,
            # Editable fields
            "pre_days": pre_days,
            "cur_days": cur_days,
            "leave_encashment_days": leave_encashment_days,
            # Calculated
            "total_days": total_days,
            "total_salary": total_salary,
            # OT
            "overtime_minutes": overtime_minutes,
            "overtime_rate": overtime_rate,
            "overtime_pay": overtime_pay,
            # Late
            "late_minutes": late_minutes,
            "late_deduction": late_deduction,
            # Other
            "allow_other": allow_other,
            "gross_pay": gross_pay,
            # Deductions
            "eobi": eobi,
            "tax": tax,
            "fine_deduction": fine_deduction,
            "fine_adv_extra": fine_adv_extra,
            "fine_adv": fine_adv,
            "advance_deduction": adv_ded,
            # Net
            "net_pay": net_pay,
            # Other
            "remarks": remarks,
            "bank_cash": bank_cash,
        })

    summary = {
        "month": month_label,
        "from_date": start.isoformat(),
        "to_date": end.isoformat(),
        "working_days": working_days,
        "employees": len(rows),
        "total_gross": total_gross,
        "total_net": total_net,
        "total_presents": total_presents,
    }

    return {"month": month_label, "summary": summary, "rows": rows}


from pydantic import BaseModel
from typing import List, Optional
import io


class Payroll2RowExport(BaseModel):
    serial_no: Optional[str] = None
    fss_no: Optional[str] = None
    name: str
    base_salary: float
    presents_total: int
    pre_days: int
    cur_days: int
    leave_encashment_days: int
    total_days: int
    total_salary: float
    overtime_rate: float
    overtime_pay: float
    allow_other: float
    gross_pay: float
    eobi_no: Optional[str] = None
    eobi: float
    tax: float
    fine_deduction: float
    fine_adv: float
    net_pay: float
    remarks: Optional[str] = None
    bank_cash: Optional[str] = None


class Payroll2ExportRequest(BaseModel):
    rows: List[Payroll2RowExport]


def _fmt_money(v: float) -> str:
    if v == 0:
        return "0"
    return f"{v:,.0f}"


import os

class PayrollPDF(FPDF):
    """Custom PDF class with header repetition on each page"""
    
    def __init__(self, month: str, from_date: str, to_date: str, headers: list, col_widths: list, admin_name: str = "Admin"):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.month = month
        self.from_date = from_date
        self.to_date = to_date
        self.headers = headers
        self.col_widths = col_widths
        self.admin_name = admin_name
        self.set_auto_page_break(auto=True, margin=8)
        self.set_left_margin(3)
        self.set_right_margin(3)
        
        # Find logo path
        self.logo_path = None
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "frontend-next", "Logo.png"),
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "Logo-removebg-preview.png"),
        ]
        for p in possible_paths:
            if os.path.exists(p):
                self.logo_path = p
                break
    
    def header(self):
        # Logo and company info
        start_y = self.get_y()
        if self.logo_path:
            try:
                self.image(self.logo_path, x=3, y=3, w=20)
            except:
                pass
        
        # Title next to logo
        self.set_xy(25, 3)
        self.set_font("Helvetica", "B", 12)
        self.cell(100, 5, "Flash ERP - Payroll Sheet", ln=False)
        
        # Right side info
        self.set_xy(200, 3)
        self.set_font("Helvetica", "", 7)
        self.cell(0, 4, f"Month: {self.month}", ln=True, align="R")
        self.set_x(200)
        self.cell(0, 4, f"Period: {self.from_date} to {self.to_date}", ln=True, align="R")
        self.set_x(200)
        self.cell(0, 4, f"Generated by: {self.admin_name}", ln=True, align="R")
        self.set_x(200)
        self.cell(0, 4, f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=True, align="R")
        
        self.set_y(20)
        
        # Table headers
        self.set_font("Helvetica", "B", 5)
        self.set_fill_color(220, 220, 220)
        for i, h in enumerate(self.headers):
            self.cell(self.col_widths[i], 4, h, border=1, align="C", fill=True)
        self.ln()
    
    def footer(self):
        self.set_y(-10)
        self.set_font("Helvetica", "I", 6)
        self.cell(0, 4, f"Page {self.page_no()}", align="C")


@router.post("/export-pdf")
async def export_payroll2_pdf(
    from_date: str,
    to_date: str,
    month: str,
    body: Payroll2ExportRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Export payroll2 data as PDF"""
    rows = body.rows
    admin_name = current_user.full_name or current_user.username or "Admin"
    
    # All columns including Remarks and Bank/Cash
    headers = ["#", "FSS", "Name", "Salary", "Pres", "Pre", "Cur", "LE", "Tot", "T.Sal", "OT.R", "OT.A", "Alw", "Gross", "EOBI#", "EOBI", "Tax", "Fine", "F/A", "Net", "Remarks", "B/C"]
    col_widths = [6, 10, 28, 18, 8, 7, 7, 7, 8, 18, 14, 14, 12, 18, 14, 10, 10, 10, 10, 18, 28, 16]
    
    pdf = PayrollPDF(month, from_date, to_date, headers, col_widths, admin_name)
    pdf.add_page()
    
    # Table rows
    pdf.set_font("Helvetica", "", 5)
    total_gross = 0.0
    total_net = 0.0
    
    for r in rows:
        total_gross += r.gross_pay
        total_net += r.net_pay
        
        row_data = [
            r.serial_no or "",
            r.fss_no or "",
            (r.name[:16] + "..") if len(r.name) > 18 else r.name,
            _fmt_money(r.base_salary),
            str(r.presents_total),
            str(r.pre_days),
            str(r.cur_days),
            str(r.leave_encashment_days),
            str(r.total_days),
            _fmt_money(r.total_salary),
            _fmt_money(r.overtime_rate),
            _fmt_money(r.overtime_pay),
            _fmt_money(r.allow_other),
            _fmt_money(r.gross_pay),
            r.eobi_no or "",
            _fmt_money(r.eobi),
            _fmt_money(r.tax),
            _fmt_money(r.fine_deduction),
            _fmt_money(r.fine_adv),
            _fmt_money(r.net_pay),
            (r.remarks or "")[:16],
            (r.bank_cash or "")[:10],
        ]
        
        for i, val in enumerate(row_data):
            align = "L" if i in [2, 14, 20, 21] else "R"
            pdf.cell(col_widths[i], 3.5, val, border=1, align=align)
        pdf.ln()
    
    # Totals row
    pdf.set_font("Helvetica", "B", 5)
    pdf.cell(sum(col_widths[:13]), 4, "TOTALS:", border=1, align="R")
    pdf.cell(col_widths[13], 4, _fmt_money(total_gross), border=1, align="R")
    pdf.cell(sum(col_widths[14:19]), 4, "", border=1)
    pdf.cell(col_widths[19], 4, _fmt_money(total_net), border=1, align="R")
    pdf.cell(sum(col_widths[20:]), 4, "", border=1)
    pdf.ln()
    
    # Summary
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 7)
    pdf.cell(0, 4, f"Total Employees: {len(rows)}  |  Total Gross: Rs {_fmt_money(total_gross)}  |  Total Net: Rs {_fmt_money(total_net)}", ln=True)
    
    # Output
    pdf_bytes = pdf.output()
    
    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=payroll2_{month}.pdf"}
    )
