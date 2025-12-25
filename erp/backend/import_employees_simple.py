"""
Simple Employee Import Script
Paste your employee data in the EMPLOYEE_DATA section below
"""
import sys
import re
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.employee import Employee
from app.core.database import Base

# Create tables
Base.metadata.create_all(bind=engine)


def parse_date(date_str):
    """Parse date string."""
    if not date_str or str(date_str).strip() in ["", "-", "Nil", "No", "For Life", "Life Time", "for Life", "Exp", "ExpCNIC", "Expire", "ExpireCNIC"]:
        return None
    
    date_str = str(date_str).strip()
    
    formats = [
        "%d-%b-%Y", "%d-%b-%y", "%d/%b/%Y", "%d-%m-%Y", 
        "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y", "%d/%m/%y"
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except:
            continue
    
    return None


def clean(value):
    """Clean string value."""
    if value is None:
        return None
    value = str(value).strip()
    return None if value in ["", "-", "Nil", "nil", "NA", "N/A", "--", "Yes", "No"] else value


def parse_salary(s):
    """Parse salary."""
    if not s:
        return None
    s = str(s).replace(",", "").replace(" ", "").strip()
    return s if s and s != "-" else None


def parse_bool(v):
    """Parse boolean."""
    return str(v).strip().lower() in ["yes", "true", "1", "y"] if v else False


def import_employees():
    """Import employees from data."""
    
    # PASTE YOUR EMPLOYEE DATA HERE
    # Format: Each line is one employee with fields separated by tabs
    # Columns: FSS#, Rank, Name, Father Name, Salary, ..., Village, Post Office, Thana, Tehsil, District, Duty Location
    
    EMPLOYEE_DATA = """
1	MBD	Aamir Saleem Jan	-	25000	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	Office Staff
2	Manager Admin	Ahmad Sarmad	-	76486	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
3	Manager Accounts	Muhammad Shafiq Kamal	-	125312	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
4	M.O	Muhammad Azama Mazhar	-	68000	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
5	AM Marketing	Ather Iqbal	-	60837	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-	-
6	7459	Asst	Faisal Zaman	Taib Zaman	39600	Civil	-	61101-6827977-5	30-May-1987	18-Jul-2028	finance Asst	Nil	4700A462788	5-May-16	163230	334-5464450	Nil	Nil	5-May-2016	St#18A, Jawa Road, Burma Town	Letrar Road	Shehzad Town	Islamabad	Islamabad	Islamabad	-	-	-	-	-	-
"""
    
    db = SessionLocal()
    success = 0
    failed = 0
    
    try:
        lines = [l.strip() for l in EMPLOYEE_DATA.strip().split('\n') if l.strip()]
        
        print(f"Processing {len(lines)} employees...\n")
        
        for line in lines:
            try:
                parts = line.split('\t')
                
                if len(parts) < 4:
                    print(f"Skipping incomplete line: {line[:50]}...")
                    failed += 1
                    continue
                
                fss = clean(parts[0])
                rank = clean(parts[1])
                name = clean(parts[2]) or "Unknown"
                father = clean(parts[3])
                salary = parse_salary(parts[4]) if len(parts) > 4 else None
                
                # Split name
                name_parts = name.split()
                first_name = name_parts[0] if name_parts else "Unknown"
                last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
                
                # Generate employee ID
                emp_id = f"EMP{fss}" if fss and fss.isdigit() else f"EMP{datetime.now().strftime('%Y%m%d%H%M%S')}"
                
                # Check if exists
                if db.query(Employee).filter(Employee.employee_id == emp_id).first():
                    print(f"Skipping duplicate: {emp_id}")
                    continue
                
                # Extract more fields
                cnic = clean(parts[8]) if len(parts) > 8 else None
                dob = parse_date(parts[9]) if len(parts) > 9 else None
                cnic_exp = parse_date(parts[10]) if len(parts) > 10 else None
                mobile = clean(parts[21]) if len(parts) > 21 else None
                village = clean(parts[29]) if len(parts) > 29 else None
                post_office = clean(parts[30]) if len(parts) > 30 else None
                thana = clean(parts[31]) if len(parts) > 31 else None
                tehsil = clean(parts[32]) if len(parts) > 32 else None
                district = clean(parts[33]) if len(parts) > 33 else None
                duty_location = clean(parts[34]) if len(parts) > 34 else None
                
                # Create employee
                employee = Employee(
                    employee_id=emp_id,
                    fss_number=fss,
                    first_name=first_name,
                    last_name=last_name,
                    father_name=father,
                    basic_salary=salary,
                    total_salary=salary,
                    designation=rank,
                    service_rank=rank,
                    cnic=cnic,
                    date_of_birth=dob,
                    cnic_expiry_date=cnic_exp,
                    mobile_number=mobile,
                    permanent_village=village,
                    permanent_post_office=post_office,
                    permanent_thana=thana,
                    permanent_tehsil=tehsil,
                    permanent_district=district,
                    base_location=duty_location,
                    employment_status="Active"
                )
                
                db.add(employee)
                db.commit()
                
                print(f"✓ {emp_id}: {name}")
                success += 1
                
            except Exception as e:
                db.rollback()
                print(f"✗ Error: {str(e)}")
                failed += 1
        
        print(f"\n{'='*60}")
        print(f"Import Complete: {success} success, {failed} failed")
        print(f"{'='*60}")
        
    finally:
        db.close()


if __name__ == "__main__":
    import_employees()
