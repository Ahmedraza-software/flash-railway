"""Vehicle maintenance API routes."""

import io
import math
import textwrap
from datetime import date as date_type
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fpdf import FPDF
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.vehicle import Vehicle
from app.models.employee import Employee
from app.models.vehicle_maintenance import VehicleMaintenance
from app.schemas.vehicle_maintenance import (
    VehicleMaintenanceCreate,
    VehicleMaintenanceUpdate,
    VehicleMaintenanceResponse,
)


router = APIRouter(dependencies=[Depends(require_permission("fleet:view"))])


def _serialize(record: VehicleMaintenance) -> VehicleMaintenanceResponse:
    """Convert ORM object into response schema."""

    return VehicleMaintenanceResponse(
        id=record.id,
        vehicle_id=record.vehicle_id,
        employee_id=record.employee_id,
        description=record.description,
        maintenance_date=record.maintenance_date,
        cost=record.cost,
        odometer_km=record.odometer_km,
        service_vendor=record.service_vendor,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _apply_filters(
    query,
    vehicle_id: Optional[str],
    employee_id: Optional[str],
    vendor: Optional[str],
    maintenance_date: Optional[date_type],
    month: Optional[str],
):
    if vehicle_id:
        query = query.filter(VehicleMaintenance.vehicle_id == vehicle_id)
    if employee_id:
        query = query.filter(VehicleMaintenance.employee_id == employee_id)
    if vendor:
        query = query.filter(VehicleMaintenance.service_vendor == vendor)
    if maintenance_date:
        query = query.filter(VehicleMaintenance.maintenance_date == maintenance_date)
    if month:
        try:
            y, m = month.split("-", 1)
            y_i = int(y)
            m_i = int(m)
            if not (1 <= m_i <= 12):
                raise ValueError("month out of range")
            start = date_type(y_i, m_i, 1)
            end = date_type(y_i + 1, 1, 1) if m_i == 12 else date_type(y_i, m_i + 1, 1)
            query = query.filter(VehicleMaintenance.maintenance_date >= start)
            query = query.filter(VehicleMaintenance.maintenance_date < end)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid month. Use YYYY-MM")
    return query


def _pdf_bytes(title: str, lines: List[str]) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.set_left_margin(12)
    pdf.set_right_margin(12)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, title, ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=1)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 11)
    for line in lines:
        pdf.set_x(pdf.l_margin)
        safe_line = "" if line is None else str(line)
        safe_line = safe_line.replace("\r\n", "\n").replace("\r", "\n")
        max_width = pdf.w - pdf.l_margin - pdf.r_margin

        def _emit_one(raw: str) -> None:
            if raw == "":
                pdf.multi_cell(0, 6, "")
                return
            try:
                pdf.multi_cell(0, 6, raw)
            except Exception:
                wrapped: List[str] = []
                for paragraph in raw.split("\n"):
                    if paragraph == "":
                        wrapped.append("")
                        continue
                    cur = ""
                    for ch in paragraph:
                        if pdf.get_string_width(cur + ch) <= max_width:
                            cur += ch
                        else:
                            if cur:
                                wrapped.append(cur)
                                cur = ch
                            else:
                                wrapped.append(ch)
                                cur = ""
                    if cur:
                        wrapped.append(cur)
                for wline in wrapped:
                    pdf.set_x(pdf.l_margin)
                    pdf.multi_cell(0, 6, wline)

        if pdf.get_string_width(safe_line) <= max_width:
            _emit_one(safe_line)
        else:
            for seg in textwrap.wrap(safe_line, width=120, break_long_words=True, break_on_hyphens=False) or [safe_line]:
                pdf.set_x(pdf.l_margin)
                _emit_one(seg)

    out = pdf.output(dest="S")
    return out if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")


def _pdf_new_document() -> FPDF:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_left_margin(14)
    pdf.set_right_margin(14)
    pdf.add_page()
    return pdf


def _pdf_max_width(pdf: FPDF) -> float:
    return pdf.w - pdf.l_margin - pdf.r_margin


def _pdf_write_wrapped(pdf: FPDF, text: str, line_h: float = 6) -> None:
    pdf.set_x(pdf.l_margin)
    safe = "" if text is None else str(text)
    safe = safe.replace("\r\n", "\n").replace("\r", "\n")
    max_width = _pdf_max_width(pdf)

    def _emit_one(raw: str) -> None:
        if raw == "":
            pdf.multi_cell(0, line_h, "")
            return
        try:
            pdf.multi_cell(0, line_h, raw)
        except Exception:
            wrapped: List[str] = []
            for paragraph in raw.split("\n"):
                if paragraph == "":
                    wrapped.append("")
                    continue
                cur = ""
                for ch in paragraph:
                    if pdf.get_string_width(cur + ch) <= max_width:
                        cur += ch
                    else:
                        if cur:
                            wrapped.append(cur)
                            cur = ch
                        else:
                            wrapped.append(ch)
                            cur = ""
                if cur:
                    wrapped.append(cur)
            for wline in wrapped:
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(0, line_h, wline)

    if pdf.get_string_width(safe) <= max_width:
        _emit_one(safe)
    else:
        for seg in textwrap.wrap(safe, width=120, break_long_words=True, break_on_hyphens=False) or [safe]:
            pdf.set_x(pdf.l_margin)
            _emit_one(seg)


def _pdf_header(pdf: FPDF, title: str, subtitle: str) -> None:
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 8, "Flash ERP", ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 5, subtitle, ln=1)
    pdf.set_text_color(0, 0, 0)

    pdf.ln(3)
    pdf.set_draw_color(220, 220, 220)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, title, ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(90, 90, 90)
    pdf.cell(0, 5, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=1)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)


def _pdf_kv_row(pdf: FPDF, label: str, value: str) -> None:
    max_width = _pdf_max_width(pdf)
    label_w = min(44, max_width * 0.35)
    value_w = max_width - label_w

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(55, 55, 55)
    x0 = pdf.l_margin
    y0 = pdf.get_y()
    pdf.set_xy(x0, y0)
    pdf.multi_cell(label_w, 6, label, border=0)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(0, 0, 0)
    pdf.set_xy(x0 + label_w, y0)
    _pdf_write_wrapped(pdf, value, line_h=6)
    y1 = pdf.get_y()

    pdf.set_y(max(y1, y0 + 6))
    pdf.set_draw_color(235, 235, 235)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(3)


def _pdf_kv_table(pdf: FPDF, rows: List[tuple[str, str]]) -> None:
    max_w = _pdf_max_width(pdf)
    label_w = min(52, max_w * 0.33)
    value_w = max_w - label_w
    line_h = 6

    def _wrap_for_width(s: str, w: float) -> List[str]:
        if s is None:
            return [""]
        s = str(s).replace("\r\n", "\n").replace("\r", "\n")
        out: List[str] = []
        for p in s.split("\n"):
            if p == "":
                out.append("")
                continue
            cur = ""
            for ch in p:
                if pdf.get_string_width(cur + ch) <= w:
                    cur += ch
                else:
                    if cur:
                        out.append(cur)
                        cur = ch
                    else:
                        out.append(ch)
                        cur = ""
            if cur:
                out.append(cur)
        return out or [""]

    pdf.set_draw_color(230, 230, 230)
    pdf.set_fill_color(245, 245, 245)

    # Header row
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(label_w, 7, "Field", border=1, fill=True)
    pdf.cell(value_w, 7, "Value", border=1, fill=True)
    pdf.ln(7)

    # Data rows
    for label, value in rows:
        label_lines = _wrap_for_width(label, label_w - 4)
        value_lines = _wrap_for_width(value, value_w - 4)
        row_lines = max(len(label_lines), len(value_lines))
        row_h = row_lines * line_h

        if pdf.get_y() + row_h > pdf.h - pdf.b_margin:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(label_w, 7, "Field", border=1, fill=True)
            pdf.cell(value_w, 7, "Value", border=1, fill=True)
            pdf.ln(7)

        x0 = pdf.l_margin
        y0 = pdf.get_y()
        pdf.rect(x0, y0, label_w, row_h)
        pdf.rect(x0 + label_w, y0, value_w, row_h)

        pdf.set_font("Helvetica", "B", 10)
        pdf.set_xy(x0 + 2, y0 + 1)
        for i in range(row_lines):
            t = label_lines[i] if i < len(label_lines) else ""
            pdf.cell(label_w - 4, line_h, t, border=0, ln=1)
            pdf.set_x(x0 + 2)

        pdf.set_font("Helvetica", "", 10)
        pdf.set_xy(x0 + label_w + 2, y0 + 1)
        for i in range(row_lines):
            t = value_lines[i] if i < len(value_lines) else ""
            pdf.cell(value_w - 4, line_h, t, border=0, ln=1)
            pdf.set_x(x0 + label_w + 2)

        pdf.set_xy(pdf.l_margin, y0 + row_h)
    pdf.ln(2)


def _receipt_pdf_bytes(record: VehicleMaintenance) -> bytes:
    pdf = _pdf_new_document()
    _pdf_header(pdf, f"Maintenance Receipt #{record.id}", "Vehicle Maintenance")

    cost = f"Rs {record.cost:.2f}" if record.cost is not None else "-"
    odo = str(record.odometer_km) if record.odometer_km is not None else "-"
    maint_date = record.maintenance_date.isoformat() if record.maintenance_date else "-"
    created = record.created_at.strftime('%Y-%m-%d %H:%M') if record.created_at else "-"

    pdf.set_draw_color(235, 235, 235)
    pdf.set_fill_color(248, 248, 248)
    pdf.rect(pdf.l_margin, pdf.get_y(), _pdf_max_width(pdf), 7, style="F")
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(55, 55, 55)
    pdf.cell(0, 7, "DETAILS", ln=1)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    _pdf_kv_table(
        pdf,
        [
            ("Receipt ID", str(record.id)),
            ("Vehicle", record.vehicle_id),
            ("Maintenance Date", maint_date),
            ("Employee", record.employee_id or "-"),
            ("Vendor", record.service_vendor or "-"),
            ("Odometer (km)", odo),
            ("Cost", cost),
            ("Description", record.description or "-"),
            ("Created", created),
        ],
    )

    pdf.ln(4)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(110, 110, 110)
    pdf.multi_cell(0, 5, "This document is system-generated and valid without signature.")
    pdf.set_text_color(0, 0, 0)

    out = pdf.output(dest="S")
    return out if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")


def _report_pdf_bytes(records: List[VehicleMaintenance], filters: dict) -> bytes:
    pdf = _pdf_new_document()
    _pdf_header(pdf, "Vehicle Maintenance Report", "Vehicle Maintenance")

    meta_parts: List[str] = []
    if filters.get("vehicle_id"):
        meta_parts.append(f"Vehicle: {filters['vehicle_id']}")
    if filters.get("employee_id"):
        meta_parts.append(f"Employee: {filters['employee_id']}")
    if filters.get("vendor"):
        meta_parts.append(f"Vendor: {filters['vendor']}")
    if filters.get("date"):
        meta_parts.append(f"Date: {filters['date']}")
    if filters.get("month"):
        meta_parts.append(f"Month: {filters['month']}")

    if meta_parts:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(90, 90, 90)
        _pdf_write_wrapped(pdf, "  •  ".join(meta_parts), line_h=6)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)

    max_w = _pdf_max_width(pdf)
    col_w = {
        "id": 12,
        "vehicle": 24,
        "date": 22,
        "emp": 22,
        "vendor": 34,
        "odo": 16,
        "cost": 22,
    }
    fixed = sum(col_w.values())
    col_w["desc"] = max(30, max_w - fixed)

    headers = [
        ("#", col_w["id"], "R"),
        ("Vehicle", col_w["vehicle"], "L"),
        ("Date", col_w["date"], "L"),
        ("Emp", col_w["emp"], "L"),
        ("Vendor", col_w["vendor"], "L"),
        ("Odo", col_w["odo"], "R"),
        ("Cost", col_w["cost"], "R"),
        ("Description", col_w["desc"], "L"),
    ]

    pdf.set_fill_color(245, 245, 245)
    pdf.set_draw_color(230, 230, 230)
    pdf.set_font("Helvetica", "B", 9)
    for text, w, align in headers:
        pdf.cell(w, 7, text, border=1, align=align, fill=True)
    pdf.ln(7)

    pdf.set_font("Helvetica", "", 9)
    total_cost = 0.0
    line_h = 5.5

    def _wrap_for_width(s: str, w: float) -> List[str]:
        if s is None:
            return [""]
        s = str(s).replace("\r\n", "\n").replace("\r", "\n")
        out: List[str] = []
        for p in s.split("\n"):
            if p == "":
                out.append("")
                continue
            cur = ""
            for ch in p:
                if pdf.get_string_width(cur + ch) <= w:
                    cur += ch
                else:
                    if cur:
                        out.append(cur)
                        cur = ch
                    else:
                        out.append(ch)
                        cur = ""
            if cur:
                out.append(cur)
        return out or [""]

    for r in records:
        cost_val = float(r.cost) if r.cost is not None else None
        if cost_val is not None and math.isfinite(cost_val):
            total_cost += cost_val

        row_vals = {
            "id": str(r.id),
            "vehicle": r.vehicle_id,
            "date": r.maintenance_date.isoformat() if r.maintenance_date else "-",
            "emp": r.employee_id or "-",
            "vendor": r.service_vendor or "-",
            "odo": str(r.odometer_km) if r.odometer_km is not None else "-",
            "cost": f"Rs {r.cost:.2f}" if r.cost is not None else "-",
            "desc": r.description or "-",
        }

        lines_per_col = {
            "id": [row_vals["id"]],
            "vehicle": _wrap_for_width(row_vals["vehicle"], col_w["vehicle"]),
            "date": [row_vals["date"]],
            "emp": _wrap_for_width(row_vals["emp"], col_w["emp"]),
            "vendor": _wrap_for_width(row_vals["vendor"], col_w["vendor"]),
            "odo": [row_vals["odo"]],
            "cost": [row_vals["cost"]],
            "desc": _wrap_for_width(row_vals["desc"], col_w["desc"]),
        }
        row_lines = max(len(v) for v in lines_per_col.values())
        row_h = row_lines * line_h

        if pdf.get_y() + row_h > pdf.h - pdf.b_margin:
            pdf.add_page()
            pdf.set_fill_color(245, 245, 245)
            pdf.set_draw_color(230, 230, 230)
            pdf.set_font("Helvetica", "B", 9)
            for text, w, align in headers:
                pdf.cell(w, 7, text, border=1, align=align, fill=True)
            pdf.ln(7)
            pdf.set_font("Helvetica", "", 9)

        x = pdf.l_margin
        y = pdf.get_y()
        pdf.set_draw_color(235, 235, 235)

        def _cell(col: str, w: float, align: str) -> None:
            nonlocal x
            pdf.rect(x, y, w, row_h)
            pdf.set_xy(x + 1.2, y + 1.0)
            content_lines = lines_per_col[col]
            for i in range(row_lines):
                t = content_lines[i] if i < len(content_lines) else ""
                pdf.cell(w - 2.4, line_h, t, border=0, ln=1, align=align)
                pdf.set_x(x + 1.2)
            x += w

        _cell("id", col_w["id"], "R")
        _cell("vehicle", col_w["vehicle"], "L")
        _cell("date", col_w["date"], "L")
        _cell("emp", col_w["emp"], "L")
        _cell("vendor", col_w["vendor"], "L")
        _cell("odo", col_w["odo"], "R")
        _cell("cost", col_w["cost"], "R")
        _cell("desc", col_w["desc"], "L")

        pdf.set_xy(pdf.l_margin, y + row_h)

    pdf.ln(6)
    pdf.set_draw_color(220, 220, 220)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, f"Total records: {len(records)}", ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Total cost: Rs {total_cost:.2f}", ln=1)

    out = pdf.output(dest="S")
    return out if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")


@router.post("/", response_model=VehicleMaintenanceResponse)
async def create_maintenance(
    payload: VehicleMaintenanceCreate,
    db: Session = Depends(get_db),
) -> VehicleMaintenanceResponse:
    """Create a new vehicle maintenance record."""

    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == payload.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=400, detail="Vehicle not found")

    if payload.employee_id:
        employee = (
            db.query(Employee)
            .filter(Employee.employee_id == payload.employee_id)
            .first()
        )
        if not employee:
            raise HTTPException(status_code=400, detail="Employee not found")

    db_record = VehicleMaintenance(
        vehicle_id=payload.vehicle_id,
        employee_id=payload.employee_id,
        description=payload.description,
        maintenance_date=payload.maintenance_date,
        cost=payload.cost,
        odometer_km=payload.odometer_km,
        service_vendor=payload.service_vendor,
    )

    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    return _serialize(db_record)


@router.get("/", response_model=List[VehicleMaintenanceResponse])
async def list_maintenance(
    db: Session = Depends(get_db),
    vehicle_id: Optional[str] = None,
    employee_id: Optional[str] = None,
    vendor: Optional[str] = None,
    maintenance_date: Optional[date_type] = Query(default=None, alias="date"),
    month: Optional[str] = None,
) -> List[VehicleMaintenanceResponse]:
    """Return all maintenance records, optionally filtered by vehicle or employee."""

    query = db.query(VehicleMaintenance).order_by(VehicleMaintenance.maintenance_date.desc())

    query = _apply_filters(query, vehicle_id, employee_id, vendor, maintenance_date, month)

    records = query.all()
    return [_serialize(r) for r in records]


@router.get("/export/pdf")
async def export_maintenance_pdf(
    db: Session = Depends(get_db),
    vehicle_id: Optional[str] = None,
    employee_id: Optional[str] = None,
    vendor: Optional[str] = None,
    maintenance_date: Optional[date_type] = Query(default=None, alias="date"),
    month: Optional[str] = None,
):
    query = db.query(VehicleMaintenance).order_by(VehicleMaintenance.maintenance_date.desc())
    query = _apply_filters(query, vehicle_id, employee_id, vendor, maintenance_date, month)
    records = query.all()

    filters = {
        "vehicle_id": vehicle_id,
        "employee_id": employee_id,
        "vendor": vendor,
        "date": maintenance_date.isoformat() if maintenance_date else None,
        "month": month,
    }

    content = _report_pdf_bytes(records, filters)
    filename = "vehicle_maintenance_report.pdf"
    if month:
        filename = f"vehicle_maintenance_{month}.pdf"
    elif maintenance_date:
        filename = f"vehicle_maintenance_{maintenance_date.isoformat()}.pdf"

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{record_id}", response_model=VehicleMaintenanceResponse)
async def get_maintenance(
    record_id: int,
    db: Session = Depends(get_db),
) -> VehicleMaintenanceResponse:
    """Get a single maintenance record by ID."""

    record = db.query(VehicleMaintenance).filter(VehicleMaintenance.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    return _serialize(record)


@router.get("/{record_id}/receipt")
async def maintenance_receipt_pdf(record_id: int, db: Session = Depends(get_db)):
    record = db.query(VehicleMaintenance).filter(VehicleMaintenance.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    content = _receipt_pdf_bytes(record)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=maintenance_receipt_{record.id}.pdf"},
    )


@router.put("/{record_id}", response_model=VehicleMaintenanceResponse)
async def update_maintenance(
    record_id: int,
    payload: VehicleMaintenanceUpdate,
    db: Session = Depends(get_db),
) -> VehicleMaintenanceResponse:
    """Update an existing maintenance record."""

    record = db.query(VehicleMaintenance).filter(VehicleMaintenance.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(record, field, value)

    db.commit()
    db.refresh(record)

    return _serialize(record)


@router.delete("/{record_id}")
async def delete_maintenance(
    record_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """Delete a maintenance record by ID."""

    record = db.query(VehicleMaintenance).filter(VehicleMaintenance.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    db.delete(record)
    db.commit()

    return {"message": "Maintenance record deleted successfully"}
