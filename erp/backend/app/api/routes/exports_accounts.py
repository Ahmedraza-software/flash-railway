from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fpdf import FPDF
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.database import get_db
from app.models.employee import Employee
from app.models.general_item import GeneralItem
from app.models.general_item_employee_balance import GeneralItemEmployeeBalance
from app.models.restricted_item import RestrictedItem
from app.models.restricted_item_employee_balance import RestrictedItemEmployeeBalance
from app.models.restricted_item_serial_unit import RestrictedItemSerialUnit
from app.models.employee_advance import EmployeeAdvance
from app.models.vehicle_assignment import VehicleAssignment
from app.api.routes.payroll import payroll_report
from app.api.dependencies import require_permission

router = APIRouter(dependencies=[Depends(require_permission("accounts:full"))])

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
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    pdf.set_left_margin(12)
    pdf.set_right_margin(12)
    return pdf


def _pdf_new_portrait() -> FPDF:
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


def _pdf_section_title(pdf: FPDF, title: str) -> None:
    pdf.ln(2)
    pdf.set_font("Helvetica", style="B", size=10)
    pdf.cell(0, 6, title, ln=1)
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
            align = "R" if i >= len(r) - 3 else "L"
            pdf.cell(col_widths[i], 6, v, border=1, fill=True, align=align)
        pdf.ln()


@router.get("/accounts/monthly/pdf")
async def export_accounts_monthly_pdf(
    month: str,
    db: Session = Depends(get_db),
) -> Response:
    start, end = _parse_month(month)

    payroll = await payroll_report(month=month, db=db)

    payroll_due = 0.0
    payroll_paid = 0.0
    payroll_due_rows: list[list[str]] = []
    payroll_paid_rows: list[list[str]] = []

    for r in payroll.rows:
        st = str(r.paid_status or "unpaid").strip().lower()
        net = float(r.net_pay or 0.0)
        if st == "paid":
            payroll_paid += net
        else:
            payroll_due += net
        row = (
            [
                str(r.employee_id or ""),
                str(r.name or ""),
                str(r.department or ""),
                str(r.shift_type or ""),
                _fmt_money(float(r.gross_pay or 0.0)),
                _fmt_money(float(getattr(r, "advance_deduction", 0.0) or 0.0)),
                _fmt_money(net),
                "PAID" if st == "paid" else "UNPAID",
            ]
        )
        if st == "paid":
            payroll_paid_rows.append(row)
        else:
            payroll_due_rows.append(row)

    assignments = (
        db.query(VehicleAssignment)
        .filter(VehicleAssignment.status == "Complete")
        .filter(VehicleAssignment.assignment_date >= start)
        .filter(VehicleAssignment.assignment_date <= end)
        .order_by(VehicleAssignment.assignment_date.asc(), VehicleAssignment.id.asc())
        .all()
    )

    total_km = sum(float(a.distance_km or 0.0) for a in assignments)
    total_amount = sum(float(a.amount or 0.0) for a in assignments)

    assignment_rows: list[list[str]] = []
    for a in assignments:
        assignment_rows.append(
            [
                str(a.id),
                (a.assignment_date.isoformat() if a.assignment_date else ""),
                str(a.vehicle_id or ""),
                str(a.route_from or ""),
                str(a.route_to or ""),
                _fmt_money(float(a.distance_km or 0.0)),
                _fmt_money(float(a.amount or 0.0)),
            ]
        )

    advances_total_month = (
        db.query(func.coalesce(func.sum(EmployeeAdvance.amount), 0.0))
        .filter(EmployeeAdvance.advance_date >= start)
        .filter(EmployeeAdvance.advance_date <= end)
        .scalar()
    )

    advances_total_lifetime = db.query(func.coalesce(func.sum(EmployeeAdvance.amount), 0.0)).scalar()

    advances = (
        db.query(EmployeeAdvance, Employee)
        .join(Employee, Employee.id == EmployeeAdvance.employee_db_id)
        .filter(EmployeeAdvance.advance_date >= start)
        .filter(EmployeeAdvance.advance_date <= end)
        .order_by(EmployeeAdvance.advance_date.asc(), EmployeeAdvance.id.asc())
        .all()
    )

    advances_rows: list[list[str]] = []
    for adv, emp in advances:
        name = " ".join([p for p in [emp.first_name, emp.last_name] if p])
        advances_rows.append(
            [
                (adv.advance_date.isoformat() if adv.advance_date else ""),
                str(emp.employee_id or ""),
                str(name),
                _fmt_money(float(adv.amount or 0.0)),
                str(adv.note or ""),
            ]
        )

    pdf = _pdf_new()
    _pdf_header(pdf, title="Accounts Monthly Export", subtitle=f"Month: {month}")

    _pdf_section_title(pdf, "Summary")
    pdf.set_font("Helvetica", size=9)
    pdf.cell(70, 6, "Payroll Due (Unpaid)")
    pdf.cell(0, 6, f"Rs {_fmt_money(payroll_due)}", ln=1)
    pdf.cell(70, 6, "Payroll Paid")
    pdf.cell(0, 6, f"Rs {_fmt_money(payroll_paid)}", ln=1)
    pdf.cell(70, 6, "Fuel Spend on Assignments")
    pdf.cell(0, 6, f"Rs {_fmt_money(total_amount)}", ln=1)
    pdf.cell(70, 6, "KM Covered")
    pdf.cell(0, 6, f"{_fmt_money(total_km)} km", ln=1)
    pdf.cell(70, 6, "Advances Taken (Month)")
    pdf.cell(0, 6, f"Rs {_fmt_money(float(advances_total_month or 0.0))}", ln=1)
    pdf.cell(70, 6, "Total Advances (Lifetime)")
    pdf.cell(0, 6, f"Rs {_fmt_money(float(advances_total_lifetime or 0.0))}", ln=1)

    _pdf_section_title(pdf, f"Payroll Due (Unpaid)  Rs {_fmt_money(payroll_due)}")
    _pdf_table(
        pdf,
        ["Emp ID", "Name", "Dept", "Shift", "Gross", "Adv Ded", "Net", "Status"],
        payroll_due_rows,
        [20, 46, 28, 22, 20, 20, 20, 18],
    )

    _pdf_section_title(pdf, f"Payroll Paid  Rs {_fmt_money(payroll_paid)}")
    _pdf_table(
        pdf,
        ["Emp ID", "Name", "Dept", "Shift", "Gross", "Adv Ded", "Net", "Status"],
        payroll_paid_rows,
        [20, 46, 28, 22, 20, 20, 20, 18],
    )

    _pdf_section_title(pdf, f"Advances Taken (Month)  Rs {_fmt_money(float(advances_total_month or 0.0))}")
    _pdf_table(
        pdf,
        ["Date", "Emp ID", "Employee", "Amount", "Note"],
        advances_rows,
        [24, 24, 60, 22, 120],
    )

    _pdf_section_title(pdf, "Vehicle Assignments")
    _pdf_table(
        pdf,
        ["ID", "Date", "Vehicle", "From", "To", "KM", "Amount"],
        assignment_rows,
        [14, 24, 22, 40, 40, 18, 22],
    )

    out = pdf.output(dest="S")
    pdf_bytes = bytes(out) if isinstance(out, (bytes, bytearray)) else str(out).encode("latin-1")
    filename = f"accounts_export_{month}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/inventory/employees/pdf")
async def export_employee_inventory_pdf(
    include_zero: bool = True,
    db: Session = Depends(get_db),
) -> Response:
    employees = db.query(Employee).order_by(Employee.employee_id.asc()).all()

    pdf = _pdf_new_portrait()
    _pdf_header(pdf, title="Employee Inventory", subtitle="All issued restricted + general inventory by employee")

    first_employee = True

    for emp in employees:
        emp_id = str(getattr(emp, "employee_id", "") or "").strip()
        name = " ".join([p for p in [getattr(emp, "first_name", None), getattr(emp, "last_name", None)] if p])
        name = name or emp_id or "Employee"

        restricted_serial_rows: list[list[str]] = []
        restricted_qty_rows: list[list[str]] = []
        general_rows: list[list[str]] = []

        if emp_id:
            restricted_serials = (
                db.query(RestrictedItemSerialUnit, RestrictedItem)
                .join(RestrictedItem, RestrictedItem.item_code == RestrictedItemSerialUnit.item_code)
                .filter(RestrictedItemSerialUnit.issued_to_employee_id == emp_id)
                .order_by(RestrictedItemSerialUnit.id.asc())
                .all()
            )
            for su, it in restricted_serials:
                restricted_serial_rows.append(
                    [
                        str(getattr(it, "item_code", "") or ""),
                        str(getattr(it, "name", "") or ""),
                        str(getattr(it, "category", "") or ""),
                        str(getattr(su, "serial_number", "") or ""),
                        str(getattr(su, "status", "") or ""),
                    ]
                )

            restricted_qty = (
                db.query(RestrictedItemEmployeeBalance, RestrictedItem)
                .join(RestrictedItem, RestrictedItem.item_code == RestrictedItemEmployeeBalance.item_code)
                .filter(RestrictedItemEmployeeBalance.employee_id == emp_id)
                .filter(RestrictedItemEmployeeBalance.quantity_issued > 0)
                .order_by(RestrictedItemEmployeeBalance.id.asc())
                .all()
            )
            for bal, it in restricted_qty:
                restricted_qty_rows.append(
                    [
                        str(getattr(it, "item_code", "") or ""),
                        str(getattr(it, "name", "") or ""),
                        str(getattr(it, "category", "") or ""),
                        str(getattr(it, "unit_name", "") or ""),
                        _fmt_money(float(getattr(bal, "quantity_issued", 0.0) or 0.0)),
                    ]
                )

            general_qty = (
                db.query(GeneralItemEmployeeBalance, GeneralItem)
                .join(GeneralItem, GeneralItem.item_code == GeneralItemEmployeeBalance.item_code)
                .filter(GeneralItemEmployeeBalance.employee_id == emp_id)
                .filter(GeneralItemEmployeeBalance.quantity_issued > 0)
                .order_by(GeneralItemEmployeeBalance.id.asc())
                .all()
            )
            for bal, it in general_qty:
                general_rows.append(
                    [
                        str(getattr(it, "item_code", "") or ""),
                        str(getattr(it, "name", "") or ""),
                        str(getattr(it, "category", "") or ""),
                        str(getattr(it, "unit_name", "") or ""),
                        _fmt_money(float(getattr(bal, "quantity_issued", 0.0) or 0.0)),
                    ]
                )

        total_items = len(restricted_serial_rows) + len(restricted_qty_rows) + len(general_rows)
        if not include_zero and total_items == 0:
            continue

        if not first_employee:
            pdf.add_page()
            _pdf_header(pdf, title="Employee Inventory", subtitle="All issued restricted + general inventory by employee")
        first_employee = False

        pdf.ln(2)
        pdf.set_draw_color(230, 230, 230)
        pdf.set_fill_color(252, 250, 246)
        pdf.set_text_color(15, 23, 42)
        pdf.set_font("Helvetica", style="B", size=10)
        pdf.cell(0, 8, f"{name}   ({emp_id})", border=1, ln=1, fill=True)
        pdf.set_font("Helvetica", size=9)
        pdf.set_text_color(107, 114, 128)
        pdf.cell(0, 6, f"Total items issued: {total_items}", ln=1)
        pdf.set_text_color(15, 23, 42)

        _pdf_section_title(pdf, "Restricted Inventory (Serial-tracked)")
        if restricted_serial_rows:
            _pdf_table(
                pdf,
                ["Item Code", "Item Name", "Category", "Serial #", "Status"],
                restricted_serial_rows,
                [26, 64, 34, 38, 20],
            )
        else:
            pdf.set_font("Helvetica", size=9)
            pdf.set_text_color(107, 114, 128)
            pdf.cell(0, 6, "No items issued.", ln=1)
            pdf.set_text_color(15, 23, 42)

        _pdf_section_title(pdf, "Restricted Inventory (Quantity-tracked)")
        if restricted_qty_rows:
            _pdf_table(
                pdf,
                ["Item Code", "Item Name", "Category", "Unit", "Qty"],
                restricted_qty_rows,
                [26, 72, 34, 20, 20],
            )
        else:
            pdf.set_font("Helvetica", size=9)
            pdf.set_text_color(107, 114, 128)
            pdf.cell(0, 6, "No items issued.", ln=1)
            pdf.set_text_color(15, 23, 42)

        _pdf_section_title(pdf, "General Inventory (Issued)")
        if general_rows:
            _pdf_table(
                pdf,
                ["Item Code", "Item Name", "Category", "Unit", "Qty"],
                general_rows,
                [26, 72, 34, 20, 20],
            )
        else:
            pdf.set_font("Helvetica", size=9)
            pdf.set_text_color(107, 114, 128)
            pdf.cell(0, 6, "No items issued.", ln=1)
            pdf.set_text_color(15, 23, 42)

    out = pdf.output(dest="S")
    pdf_bytes = bytes(out) if isinstance(out, (bytes, bytearray)) else str(out).encode("latin-1")
    filename = f"employee_inventory_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
