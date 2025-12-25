"""Employee2 API routes."""

import json
import os
import uuid
import io
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from fpdf import FPDF

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.employee2 import Employee2
from app.schemas.employee2 import (
    Employee2 as Employee2Schema,
    Employee2Create,
    Employee2Update,
    Employee2List,
)

router = APIRouter(dependencies=[Depends(require_permission("employees:view"))])

# Project root for uploads
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent.parent

# Upload directory for employee2 files
UPLOAD_DIR = Path(__file__).parent.parent.parent.parent.parent / "uploads" / "employees2"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/", response_model=Employee2List)
async def list_employees2(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    with_total: bool = True,
    db: Session = Depends(get_db),
):
    """Return a paginated list of Employee2 records."""
    query = db.query(Employee2)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Employee2.name.ilike(search_term))
            | (Employee2.fss_no.ilike(search_term))
            | (Employee2.cnic.ilike(search_term))
            | (Employee2.mobile_no.ilike(search_term))
            | (Employee2.serial_no.ilike(search_term))
        )
    
    if category:
        query = query.filter(Employee2.category == category)
    
    if status:
        query = query.filter(Employee2.status == status)
    
    total = query.count() if with_total else 0
    employees = query.offset(skip).limit(limit).all()
    
    return Employee2List(employees=employees, total=total)


@router.get("/categories")
async def list_categories(db: Session = Depends(get_db)):
    """Get distinct categories."""
    rows = db.query(Employee2.category).distinct().filter(Employee2.category.isnot(None)).all()
    return [r[0] for r in rows if r[0] and str(r[0]).strip()]


@router.get("/statuses")
async def list_statuses(db: Session = Depends(get_db)):
    """Get distinct statuses."""
    rows = db.query(Employee2.status).distinct().filter(Employee2.status.isnot(None)).all()
    return [r[0] for r in rows if r[0] and str(r[0]).strip()]


@router.post("/", response_model=Employee2Schema)
async def create_employee2(
    employee: Employee2Create,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:create")),
):
    """Create a new Employee2 record."""
    db_employee = Employee2(**employee.model_dump())
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return db_employee


@router.post("/import-json", dependencies=[Depends(require_permission("employees:create"))])
async def import_from_json(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import Employee2 records from JSON file."""
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {e}")
    
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="JSON must be an array of records")
    
    created = 0
    skipped = 0
    errors = []
    current_category = None
    
    # Skip header rows (first 2 rows typically)
    for idx, row in enumerate(data):
        try:
            # Get values with fallback
            a_val = str(row.get("A", "") or "").strip()
            b_val = str(row.get("B", "") or "").strip()
            c_val = str(row.get("C", "") or "").strip()
            d_val = str(row.get("D", "") or "").strip()
            
            # Skip header row
            if a_val == "#" or d_val == "Name":
                continue
            
            # Skip empty number row
            if a_val == "" and b_val == "" and c_val == "" and d_val == "":
                continue
            
            # Check if this is a category row (no numeric serial, has text in A)
            if a_val and not a_val.isdigit() and not d_val:
                current_category = a_val
                continue
            
            # Skip if no name
            if not d_val:
                skipped += 1
                continue
            
            employee_data = {
                "serial_no": a_val or None,
                "fss_no": b_val or None,
                "rank": c_val or None,
                "name": d_val,
                "father_name": str(row.get("E", "") or "").strip() or None,
                "salary": str(row.get("F", "") or "").strip() or None,
                "status": str(row.get("G", "") or "").strip() or None,
                "unit": str(row.get("H", "") or "").strip() or None,
                "service_rank": str(row.get("I", "") or "").strip() or None,
                "blood_group": str(row.get("J", "") or "").strip() or None,
                "status2": str(row.get("K", "") or "").strip() or None,
                "unit2": str(row.get("L", "") or "").strip() or None,
                "rank2": str(row.get("M", "") or "").strip() or None,
                "cnic": str(row.get("N", "") or "").strip() or None,
                "dob": str(row.get("O", "") or "").strip() or None,
                "cnic_expiry": str(row.get("P", "") or "").strip() or None,
                "documents_held": str(row.get("Q", "") or "").strip() or None,
                "documents_handed_over_to": str(row.get("R", "") or "").strip() or None,
                "photo_on_doc": str(row.get("S", "") or "").strip() or None,
                "eobi_no": str(row.get("T", "") or "").strip() or None,
                "insurance": str(row.get("W", "") or "").strip() or None,
                "social_security": str(row.get("X", "") or "").strip() or None,
                "mobile_no": str(row.get("Y", "") or "").strip() or None,
                "home_contact": str(row.get("Z", "") or "").strip() or None,
                "verified_by_sho": str(row.get("AA", "") or "").strip() or None,
                "verified_by_khidmat_markaz": str(row.get("AB", "") or "").strip() or None,
                "domicile": str(row.get("AC", "") or "").strip() or None,
                "verified_by_ssp": str(row.get("AD", "") or "").strip() or None,
                "enrolled": str(row.get("AE", "") or "").strip() or None,
                "re_enrolled": str(row.get("AF", "") or "").strip() or None,
                "village": str(row.get("AG", "") or "").strip() or None,
                "post_office": str(row.get("AH", "") or "").strip() or None,
                "thana": str(row.get("AI", "") or "").strip() or None,
                "tehsil": str(row.get("AJ", "") or "").strip() or None,
                "district": str(row.get("AK", "") or "").strip() or None,
                "duty_location": str(row.get("AL", "") or "").strip() or None,
                "police_trg_ltr_date": str(row.get("AM", "") or "").strip() or None,
                "vaccination_cert": str(row.get("AN", "") or "").strip() or None,
                "vol_no": str(row.get("AO", "") or "").strip() or None,
                "payments": str(row.get("AP", "") or "").strip() or None,
                "category": current_category,
            }
            
            db_employee = Employee2(**employee_data)
            db.add(db_employee)
            created += 1
            
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    db.commit()
    
    return {
        "created": created,
        "skipped": skipped,
        "errors": errors[:20],  # Limit errors returned
        "total_rows": len(data),
    }


@router.get("/{employee_id}", response_model=Employee2Schema)
async def get_employee2(employee_id: int, db: Session = Depends(get_db)):
    """Get a single Employee2 by ID."""
    employee = db.query(Employee2).filter(Employee2.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


@router.put("/{employee_id}", response_model=Employee2Schema)
async def update_employee2(
    employee_id: int,
    employee_update: Employee2Update,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:update")),
):
    """Update an Employee2 record."""
    employee = db.query(Employee2).filter(Employee2.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    update_data = employee_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(employee, field, value)
    
    db.commit()
    db.refresh(employee)
    return employee


@router.delete("/{employee_id}")
async def delete_employee2(
    employee_id: int,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:delete")),
):
    """Delete an Employee2 record."""
    employee = db.query(Employee2).filter(Employee2.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    db.delete(employee)
    db.commit()
    return {"message": "Employee deleted successfully"}


@router.delete("/")
async def delete_all_employees2(
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:delete")),
):
    """Delete all Employee2 records (for re-import)."""
    count = db.query(Employee2).delete()
    db.commit()
    return {"message": f"Deleted {count} employees"}


@router.post("/{employee_id}/upload/{field_type}")
async def upload_employee_file(
    employee_id: int,
    field_type: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:update")),
):
    """Upload a file for an employee (avatar, cnic, domicile, etc.)."""
    # Validate field type
    valid_fields = [
        "avatar", "cnic", "domicile", "sho_verified", 
        "ssp_verified", "khidmat_verified", "police_trg"
    ]
    if field_type not in valid_fields:
        raise HTTPException(status_code=400, detail=f"Invalid field type. Must be one of: {valid_fields}")
    
    # Get employee
    employee = db.query(Employee2).filter(Employee2.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Get file extension
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        new_filename = f"emp{employee_id}_{field_type}_{timestamp}_{unique_id}{file_ext}"
        
        # Save file
        file_path = UPLOAD_DIR / new_filename
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Update employee record
        file_url = f"/uploads/employees2/{new_filename}"
        field_name = f"{field_type}_attachment" if field_type != "avatar" else "avatar_url"
        setattr(employee, field_name, file_url)
        db.commit()
        db.refresh(employee)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "url": file_url,
                "field": field_name,
                "filename": new_filename,
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


class EmployeePDF(FPDF):
    """Custom PDF class for employee export."""
    
    def __init__(self, employee_name: str):
        super().__init__()
        self.employee_name = employee_name
        self.set_auto_page_break(auto=True, margin=15)
    
    def header(self):
        # Header with blue background
        self.set_fill_color(24, 144, 255)  # Blue
        self.rect(0, 0, 210, 25, 'F')
        self.set_text_color(255, 255, 255)
        self.set_font("Arial", "B", 16)
        self.set_y(8)
        self.cell(0, 10, f"Employee Profile", 0, 1, "C")
        self.set_text_color(0, 0, 0)
        self.ln(10)
    
    def footer(self):
        self.set_y(-15)
        self.set_font("Arial", "I", 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')} | Page {self.page_no()}", 0, 0, "C")
        self.set_text_color(0, 0, 0)
    
    def section_title(self, title: str):
        self.ln(3)
        self.set_font("Arial", "B", 11)
        self.set_fill_color(240, 240, 240)
        self.set_draw_color(200, 200, 200)
        self.cell(0, 8, "  " + title, 1, 1, "L", True)
        self.ln(2)
    
    def add_table_row(self, data: list, widths: list, is_header: bool = False):
        """Add a table row with borders."""
        if is_header:
            self.set_font("Arial", "B", 9)
            self.set_fill_color(245, 245, 245)
        else:
            self.set_font("Arial", "", 9)
        
        h = 7
        for i, (text, w) in enumerate(zip(data, widths)):
            self.cell(w, h, str(text) if text else "-", 1, 0, "L", is_header)
        self.ln()
    
    def info_box(self, label: str, value: str, w: int = 63):
        """Create a labeled info box."""
        self.set_font("Arial", "B", 8)
        self.set_text_color(100, 100, 100)
        self.cell(w, 5, label, 0, 0, "L")
        self.set_font("Arial", "", 9)
        self.set_text_color(0, 0, 0)
        self.set_x(self.get_x() - w)
        self.set_y(self.get_y() + 4)
        self.cell(w, 6, str(value) if value else "-", 0, 0, "L")
        self.set_y(self.get_y() - 4)


@router.get("/{employee_id}/export-pdf")
async def export_employee_pdf(
    employee_id: int,
    db: Session = Depends(get_db),
):
    """Export employee details as PDF with images and attachments."""
    employee = db.query(Employee2).filter(Employee2.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    pdf = EmployeePDF(employee.name or "Unknown")
    pdf.add_page()
    
    # Profile Card Section
    pdf.set_fill_color(250, 250, 250)
    pdf.set_draw_color(220, 220, 220)
    pdf.rect(10, 30, 190, 45, 'D')
    
    # Profile picture
    avatar_loaded = False
    if employee.avatar_url:
        avatar_path = PROJECT_ROOT / employee.avatar_url.lstrip("/")
        if avatar_path.exists():
            try:
                pdf.image(str(avatar_path), x=15, y=35, w=35, h=35)
                avatar_loaded = True
            except:
                pass
    
    if not avatar_loaded:
        # Draw placeholder circle
        pdf.set_fill_color(200, 200, 200)
        pdf.ellipse(15, 35, 35, 35, 'F')
        pdf.set_font("Arial", "B", 20)
        pdf.set_text_color(255, 255, 255)
        pdf.set_xy(15, 47)
        initials = "".join([n[0].upper() for n in (employee.name or "?").split()[:2]])
        pdf.cell(35, 10, initials, 0, 0, "C")
        pdf.set_text_color(0, 0, 0)
    
    # Name and basic info next to photo
    pdf.set_xy(55, 35)
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 8, employee.name or "-", 0, 1)
    
    pdf.set_x(55)
    pdf.set_font("Arial", "", 10)
    info_parts = []
    if employee.category:
        info_parts.append(f"Category: {employee.category}")
    if employee.designation:
        info_parts.append(f"Designation: {employee.designation}")
    if employee.rank:
        info_parts.append(f"Rank: {employee.rank}")
    pdf.cell(0, 6, " | ".join(info_parts) if info_parts else "-", 0, 1)
    
    pdf.set_x(55)
    pdf.set_font("Arial", "", 10)
    info_parts2 = []
    if employee.serial_no:
        info_parts2.append(f"Serial #: {employee.serial_no}")
    if employee.fss_no:
        info_parts2.append(f"FSS #: {employee.fss_no}")
    if employee.cnic:
        info_parts2.append(f"CNIC: {employee.cnic}")
    pdf.cell(0, 6, " | ".join(info_parts2) if info_parts2 else "", 0, 1)
    
    # Status badge
    if employee.allocation_status:
        pdf.set_x(55)
        if employee.allocation_status == "Free":
            pdf.set_fill_color(82, 196, 26)
        else:
            pdf.set_fill_color(250, 173, 20)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Arial", "B", 9)
        pdf.cell(25, 6, employee.allocation_status, 0, 0, "C", True)
        pdf.set_text_color(0, 0, 0)
    
    pdf.set_y(80)
    
    # Two column layout for details
    col_width = 95
    left_x = 10
    right_x = 105
    
    # Basic Information (Left)
    pdf.set_x(left_x)
    pdf.section_title("Basic Information")
    start_y = pdf.get_y()
    
    basic_data = [
        ("Serial #", employee.serial_no), ("FSS #", employee.fss_no),
        ("Rank", employee.rank), ("Service Rank", employee.service_rank),
        ("Father's Name", employee.father_name), ("Salary", employee.salary),
        ("Status", employee.status), ("Unit", employee.unit),
        ("Blood Group", employee.blood_group), ("Duty Location", employee.duty_location),
    ]
    
    pdf.set_font("Arial", "", 9)
    for i in range(0, len(basic_data), 2):
        pdf.set_x(left_x)
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(22, 5, basic_data[i][0], 0, 0)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(25, 5, str(basic_data[i][1]) if basic_data[i][1] else "-", 0, 0)
        if i + 1 < len(basic_data):
            pdf.set_font("Arial", "B", 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(22, 5, basic_data[i+1][0], 0, 0)
            pdf.set_font("Arial", "", 9)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(25, 5, str(basic_data[i+1][1]) if basic_data[i+1][1] else "-", 0, 1)
        else:
            pdf.ln()
    
    end_basic_y = pdf.get_y()
    
    # Identity & Documents (Right)
    pdf.set_xy(right_x, start_y - 13)
    pdf.section_title("Identity & Documents")
    
    identity_data = [
        ("CNIC", employee.cnic), ("CNIC Expiry", employee.cnic_expiry),
        ("DOB", employee.dob), ("Domicile", employee.domicile),
        ("EOBI #", employee.eobi_no), ("Insurance", employee.insurance),
        ("Social Sec", employee.social_security), ("Vol #", employee.vol_no),
    ]
    
    for i in range(0, len(identity_data), 2):
        pdf.set_x(right_x)
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(22, 5, identity_data[i][0], 0, 0)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(25, 5, str(identity_data[i][1]) if identity_data[i][1] else "-", 0, 0)
        if i + 1 < len(identity_data):
            pdf.set_font("Arial", "B", 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(22, 5, identity_data[i+1][0], 0, 0)
            pdf.set_font("Arial", "", 9)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(25, 5, str(identity_data[i+1][1]) if identity_data[i+1][1] else "-", 0, 1)
        else:
            pdf.ln()
    
    # Move to next row
    pdf.set_y(max(end_basic_y, pdf.get_y()) + 5)
    
    # Contact & Verification (Left)
    pdf.set_x(left_x)
    pdf.section_title("Contact & Verification")
    start_y2 = pdf.get_y()
    
    contact_data = [
        ("Mobile", employee.mobile_no), ("Home", employee.home_contact),
        ("SHO Verified", employee.verified_by_sho), ("SSP Verified", employee.verified_by_ssp),
        ("Enrolled", employee.enrolled), ("Re-Enrolled", employee.re_enrolled),
    ]
    
    for i in range(0, len(contact_data), 2):
        pdf.set_x(left_x)
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(22, 5, contact_data[i][0], 0, 0)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(25, 5, str(contact_data[i][1]) if contact_data[i][1] else "-", 0, 0)
        if i + 1 < len(contact_data):
            pdf.set_font("Arial", "B", 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(22, 5, contact_data[i+1][0], 0, 0)
            pdf.set_font("Arial", "", 9)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(25, 5, str(contact_data[i+1][1]) if contact_data[i+1][1] else "-", 0, 1)
        else:
            pdf.ln()
    
    # Khidmat verified (full width in left column)
    pdf.set_x(left_x)
    pdf.set_font("Arial", "B", 8)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(25, 5, "Khidmat Verified", 0, 0)
    pdf.set_font("Arial", "", 9)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(65, 5, str(employee.verified_by_khidmat_markaz) if employee.verified_by_khidmat_markaz else "-", 0, 1)
    
    end_contact_y = pdf.get_y()
    
    # Address (Right)
    pdf.set_xy(right_x, start_y2 - 13)
    pdf.section_title("Address")
    
    address_data = [
        ("Village", employee.village), ("Post Office", employee.post_office),
        ("Thana", employee.thana), ("Tehsil", employee.tehsil),
        ("District", employee.district), ("Duty Loc", employee.duty_location),
    ]
    
    for i in range(0, len(address_data), 2):
        pdf.set_x(right_x)
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(22, 5, address_data[i][0], 0, 0)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(25, 5, str(address_data[i][1]) if address_data[i][1] else "-", 0, 0)
        if i + 1 < len(address_data):
            pdf.set_font("Arial", "B", 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(22, 5, address_data[i+1][0], 0, 0)
            pdf.set_font("Arial", "", 9)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(25, 5, str(address_data[i+1][1]) if address_data[i+1][1] else "-", 0, 1)
        else:
            pdf.ln()
    
    # Move to next row
    pdf.set_y(max(end_contact_y, pdf.get_y()) + 5)
    
    # Other Information
    pdf.set_x(left_x)
    pdf.section_title("Other Information")
    
    other_data = [
        ("Status 2", employee.status2), ("Unit 2", employee.unit2),
        ("Rank 2", employee.rank2), ("Vaccination", employee.vaccination_cert),
        ("Payments", employee.payments), ("Police Trg", employee.police_trg_ltr_date),
    ]
    
    for i in range(0, len(other_data), 2):
        pdf.set_x(left_x)
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(22, 5, other_data[i][0], 0, 0)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(25, 5, str(other_data[i][1]) if other_data[i][1] else "-", 0, 0)
        if i + 1 < len(other_data):
            pdf.set_font("Arial", "B", 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(22, 5, other_data[i+1][0], 0, 0)
            pdf.set_font("Arial", "", 9)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(25, 5, str(other_data[i+1][1]) if other_data[i+1][1] else "-", 0, 1)
        else:
            pdf.ln()
    
    # Bank Accounts Section
    if employee.bank_accounts:
        try:
            accounts = json.loads(employee.bank_accounts)
            if accounts:
                pdf.ln(3)
                pdf.set_x(left_x)
                pdf.section_title("Bank Accounts")
                
                # Table header
                pdf.set_font("Arial", "B", 9)
                pdf.set_fill_color(240, 240, 240)
                pdf.cell(50, 7, "Bank Name", 1, 0, "C", True)
                pdf.cell(50, 7, "Account Title", 1, 0, "C", True)
                pdf.cell(45, 7, "Account #", 1, 0, "C", True)
                pdf.cell(45, 7, "Branch", 1, 1, "C", True)
                
                pdf.set_font("Arial", "", 9)
                for acc in accounts:
                    pdf.cell(50, 7, acc.get("bank_name", "-"), 1, 0, "L")
                    pdf.cell(50, 7, acc.get("account_title", "-"), 1, 0, "L")
                    pdf.cell(45, 7, acc.get("account_number", "-"), 1, 0, "L")
                    pdf.cell(45, 7, acc.get("branch", "-"), 1, 1, "L")
        except:
            pass
    
    # Document Attachments Section
    attachments = [
        ("CNIC Document", employee.cnic_attachment),
        ("Domicile Document", employee.domicile_attachment),
        ("SHO Verification", employee.sho_verified_attachment),
        ("SSP Verification", employee.ssp_verified_attachment),
        ("Khidmat Verification", employee.khidmat_verified_attachment),
        ("Police Training", employee.police_trg_attachment),
    ]
    
    has_attachments = any(att[1] for att in attachments)
    if has_attachments:
        pdf.add_page()
        pdf.set_y(30)
        pdf.section_title("Document Attachments")
        
        for label, url in attachments:
            if url:
                file_path = PROJECT_ROOT / url.lstrip("/")
                if file_path.exists():
                    ext = file_path.suffix.lower()
                    if ext in [".jpg", ".jpeg", ".png", ".gif", ".bmp"]:
                        try:
                            # Check if we need a new page
                            if pdf.get_y() > 200:
                                pdf.add_page()
                                pdf.set_y(30)
                            
                            pdf.set_font("Arial", "B", 10)
                            pdf.set_fill_color(24, 144, 255)
                            pdf.set_text_color(255, 255, 255)
                            pdf.cell(60, 7, "  " + label, 0, 1, "L", True)
                            pdf.set_text_color(0, 0, 0)
                            pdf.ln(2)
                            
                            # Add image with border
                            pdf.set_draw_color(200, 200, 200)
                            img_y = pdf.get_y()
                            pdf.image(str(file_path), x=10, w=180)
                            pdf.ln(5)
                        except:
                            pdf.set_font("Arial", "I", 9)
                            pdf.cell(0, 6, f"{label}: [Image could not be loaded]", 0, 1)
                    else:
                        # PDF or other document
                        pdf.set_font("Arial", "B", 10)
                        pdf.set_fill_color(250, 140, 22)
                        pdf.set_text_color(255, 255, 255)
                        pdf.cell(60, 7, "  " + label, 0, 0, "L", True)
                        pdf.set_text_color(0, 0, 0)
                        pdf.set_font("Arial", "", 9)
                        pdf.cell(0, 7, f"  [PDF Document: {os.path.basename(url)}]", 0, 1)
                        pdf.ln(2)
    
    # Generate PDF
    pdf_bytes = bytes(pdf.output())
    
    # Create filename
    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in (employee.name or "employee"))
    filename = f"Employee_{employee.id}_{safe_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
