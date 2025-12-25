"""
Direct Database Import - Fast bulk import for large datasets
This script imports directly to the database, bypassing the API for speed.
Usage: python import_direct_to_db.py
"""
import sys
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.employee import Employee
from app.core.database import Base

# Create tables
Base.metadata.create_all(bind=engine)


def parse_date(date_str):
    """Parse various date formats."""
    if not date_str or str(date_str).strip() in ["", "-", "Nil", "No", "For Life", "Life Time", "for Life", "Exp", "ExpCNIC", "Expire", "Life time", "Lifetime"]:
        return None
    
    date_str = str(date_str).strip()
    formats = ["%d-%b-%Y", "%d-%b-%y", "%d/%b/%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y", "%d/%m/%y"]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except:
            continue
    return None


def clean(value):
    """Clean string values."""
    if value is None:
        return None
    value = str(value).strip()
    return None if value in ["", "-", "Nil", "nil", "NA", "N/A", "--", "NIL"] else value


def parse_salary(s):
    """Parse salary string."""
    if not s:
        return None
    s = str(s).replace(",", "").replace(" ", "").strip()
    return s if s and s != "-" else None


def create_employee_id(fss, name):
    """Generate unique employee ID."""
    if fss and str(fss).strip() and str(fss).strip() != "-":
        fss_clean = str(fss).strip()
        return f"EMP{fss_clean}"
    # Fallback
    import re
    name_clean = re.sub(r'[^a-zA-Z]', '', str(name))[:4].upper()
    timestamp = datetime.now().strftime('%H%M%S%f')
    return f"EMP{name_clean}{timestamp[-6:]}"


def split_name(full_name):
    """Split full name into first and last."""
    if not full_name:
        return "Unknown", ""
    parts = str(full_name).strip().split()
    if len(parts) == 0:
        return "Unknown", ""
    elif len(parts) == 1:
        return parts[0], ""
    else:
        return parts[0], " ".join(parts[1:])


def import_employee(db: Session, emp_dict):
    """Import a single employee."""
    try:
        name = clean(emp_dict.get("name")) or "Unknown"
        first_name, last_name = split_name(name)
        
        emp_id = create_employee_id(emp_dict.get("fss"), name)
        
        # Check if exists
        existing = db.query(Employee).filter(Employee.employee_id == emp_id).first()
        if existing:
            return None, f"Duplicate: {emp_id}"
        
        # Create employee
        employee = Employee(
            employee_id=emp_id,
            fss_number=clean(emp_dict.get("fss")),
            first_name=first_name,
            last_name=last_name,
            father_name=clean(emp_dict.get("father")),
            basic_salary=parse_salary(emp_dict.get("salary")),
            total_salary=parse_salary(emp_dict.get("salary")),
            designation=clean(emp_dict.get("designation")),
            service_rank=clean(emp_dict.get("rank")),
            service_unit=clean(emp_dict.get("unit")),
            blood_group=clean(emp_dict.get("blood_group")),
            cnic=clean(emp_dict.get("cnic")),
            date_of_birth=parse_date(emp_dict.get("dob")),
            cnic_expiry_date=parse_date(emp_dict.get("expiry")),
            mobile_number=clean(emp_dict.get("mobile")),
            home_contact_no=clean(emp_dict.get("home")),
            permanent_village=clean(emp_dict.get("village")),
            permanent_post_office=clean(emp_dict.get("po")),
            permanent_thana=clean(emp_dict.get("thana")),
            permanent_tehsil=clean(emp_dict.get("tehsil")),
            permanent_district=clean(emp_dict.get("district")),
            domicile=clean(emp_dict.get("domicile")),
            base_location=clean(emp_dict.get("location")),
            service_enrollment_date=parse_date(emp_dict.get("enrolled")),
            service_reenrollment_date=parse_date(emp_dict.get("re_enrolled")),
            eobi_no=clean(emp_dict.get("eobi")),
            insurance=clean(emp_dict.get("insurance")),
            social_security=clean(emp_dict.get("social_security")),
            employment_status="Active",
            email=f"{first_name.lower()}.{last_name.lower().replace(' ', '')}.{emp_dict.get('fss', 'emp')}@flash.com"
        )
        
        db.add(employee)
        db.commit()
        db.refresh(employee)
        
        return employee, None
        
    except Exception as e:
        db.rollback()
        return None, str(e)


# EMPLOYEE DATA - Add all your employees here
EMPLOYEES = [
    # Office Staff
    {"fss": "1", "designation": "MBD", "name": "Aamir Saleem Jan", "salary": "25000", "location": "Office Staff"},
    {"fss": "2", "designation": "Manager Admin", "name": "Ahmad Sarmad", "salary": "76486"},
    {"fss": "3", "designation": "Manager Accounts", "name": "Muhammad Shafiq Kamal", "salary": "125312"},
    {"fss": "4", "designation": "M.O", "name": "Muhammad Azama Mazhar", "salary": "68000"},
    {"fss": "5", "designation": "AM Marketing", "name": "Ather Iqbal", "salary": "60837"},
    
    # Add all 500+ employees here following the same format
    # Example:
    # {"fss": "7459", "designation": "Asst", "name": "Faisal Zaman", "father": "Taib Zaman", "salary": "39600", ...},
]


def main():
    """Main import function."""
    print("=" * 80)
    print("DIRECT DATABASE IMPORT")
    print("=" * 80)
    print(f"\nTotal employees to import: {len(EMPLOYEES)}")
    print("\nStarting import...\n")
    
    db = SessionLocal()
    success = 0
    failed = 0
    errors = []
    
    try:
        for idx, emp_dict in enumerate(EMPLOYEES, 1):
            name = emp_dict.get("name", "Unknown")[:30].ljust(30)
            print(f"[{idx:3d}/{len(EMPLOYEES)}] {name} ", end="", flush=True)
            
            result, error = import_employee(db, emp_dict)
            
            if result:
                print(f"✓ {result.employee_id}")
                success += 1
            else:
                print(f"✗ {error[:30]}")
                errors.append(f"{name}: {error}")
                failed += 1
        
        print("\n" + "=" * 80)
        print(f"IMPORT COMPLETE")
        print(f"Success: {success} | Failed: {failed} | Total: {len(EMPLOYEES)}")
        print("=" * 80)
        
        if errors and len(errors) <= 10:
            print("\nFirst 10 errors:")
            for err in errors[:10]:
                print(f"  - {err}")
        
    except Exception as e:
        print(f"\nFatal error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
