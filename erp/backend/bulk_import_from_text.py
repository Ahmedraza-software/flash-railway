"""
Bulk Employee Import Script - Parses text data and imports to database
"""
import sys
import re
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.employee import Employee
from app.core.database import Base

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)


def parse_date(date_str):
    """Parse various date formats to a standard format."""
    if not date_str or str(date_str).strip() in ["", "-", "Nil", "No"]:
        return None
    
    date_str = str(date_str).strip()
    
    # Try different date formats
    formats = [
        "%d-%b-%Y",  # 30-May-1987
        "%d-%b-%y",  # 30-May-87
        "%d/%b/%Y",  # 30/May/1987
        "%d-%m-%Y",  # 30-05-1987
        "%d/%m/%Y",  # 30/05/1987
        "%Y-%m-%d",  # 1987-05-30
        "%d-%m-%y",  # 30-05-87
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except:
            continue
    
    return None


def clean_string(value):
    """Clean and normalize string values."""
    if value is None:
        return None
    value = str(value).strip()
    if value in ["", "-", "Nil", "nil", "NA", "N/A", "--"]:
        return None
    return value


def parse_salary(salary_str):
    """Parse salary string to remove commas."""
    if not salary_str:
        return None
    salary_str = str(salary_str).replace(",", "").strip()
    if salary_str in ["", "-"]:
        return None
    return salary_str


def parse_boolean(value):
    """Parse boolean values."""
    if not value:
        return False
    value_str = str(value).strip().lower()
    return value_str in ["yes", "true", "1", "y"]


def generate_employee_id(fss_number, name):
    """Generate a unique employee ID."""
    if fss_number and fss_number != "-":
        return f"EMP{fss_number}"
    # Fallback: use first 3 letters of name + timestamp
    name_part = re.sub(r'[^a-zA-Z]', '', name)[:3].upper()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"EMP{name_part}{timestamp[-6:]}"


def split_name(full_name):
    """Split full name into first and last name."""
    if not full_name:
        return "Unknown", "Unknown"
    
    parts = str(full_name).strip().split()
    if len(parts) == 0:
        return "Unknown", "Unknown"
    elif len(parts) == 1:
        return parts[0], ""
    else:
        return parts[0], " ".join(parts[1:])


def import_employee_record(db: Session, record_parts):
    """Import a single employee record."""
    try:
        # Parse the record - adjust indices based on your data structure
        # The data appears to have these columns (approximate):
        # FSS#, Rank, Name, Father's Name, Salary, Status, Unit, Rank, Blood Gp, Status, Unit, Rank, CNIC#, DOB, CNIC Expr, etc.
        
        if len(record_parts) < 10:
            print(f"Skipping incomplete record: {record_parts}")
            return None
        
        fss_number = clean_string(record_parts[0]) if len(record_parts) > 0 else None
        rank = clean_string(record_parts[1]) if len(record_parts) > 1 else None
        full_name = clean_string(record_parts[2]) if len(record_parts) > 2 else "Unknown"
        father_name = clean_string(record_parts[3]) if len(record_parts) > 3 else None
        salary = parse_salary(record_parts[4]) if len(record_parts) > 4 else None
        
        # Split name
        first_name, last_name = split_name(full_name)
        
        # Generate employee ID
        employee_id = generate_employee_id(fss_number, full_name)
        
        # Check if employee already exists
        existing = db.query(Employee).filter(Employee.employee_id == employee_id).first()
        if existing:
            print(f"Employee {employee_id} already exists, skipping...")
            return None
        
        # Extract more fields based on data structure
        # Adjust indices as needed
        service_unit = clean_string(record_parts[5]) if len(record_parts) > 5 else None
        service_rank = clean_string(record_parts[6]) if len(record_parts) > 6 else None
        cnic = clean_string(record_parts[12]) if len(record_parts) > 12 else None
        dob = parse_date(record_parts[13]) if len(record_parts) > 13 else None
        cnic_expiry = parse_date(record_parts[14]) if len(record_parts) > 14 else None
        blood_group = clean_string(record_parts[8]) if len(record_parts) > 8 else None
        
        # Address fields (adjust indices based on actual data)
        village = clean_string(record_parts[40]) if len(record_parts) > 40 else None
        post_office = clean_string(record_parts[41]) if len(record_parts) > 41 else None
        thana = clean_string(record_parts[42]) if len(record_parts) > 42 else None
        tehsil = clean_string(record_parts[43]) if len(record_parts) > 43 else None
        district = clean_string(record_parts[44]) if len(record_parts) > 44 else None
        duty_location = clean_string(record_parts[45]) if len(record_parts) > 45 else None
        
        # Contact information
        mobile = clean_string(record_parts[25]) if len(record_parts) > 25 else None
        home_contact = clean_string(record_parts[26]) if len(record_parts) > 26 else None
        
        # Create employee object
        employee = Employee(
            employee_id=employee_id,
            fss_number=fss_number,
            fss_name=full_name,
            first_name=first_name,
            last_name=last_name,
            father_name=father_name,
            basic_salary=salary,
            total_salary=salary,
            service_unit=service_unit,
            service_rank=service_rank or rank,
            designation=rank,
            cnic=cnic,
            date_of_birth=dob,
            cnic_expiry_date=cnic_expiry,
            blood_group=blood_group,
            permanent_village=village,
            permanent_post_office=post_office,
            permanent_thana=thana,
            permanent_tehsil=tehsil,
            permanent_district=district,
            base_location=duty_location,
            mobile_number=mobile,
            home_contact_no=home_contact,
            employment_status="Active",
            enrolled_as=rank
        )
        
        db.add(employee)
        db.commit()
        db.refresh(employee)
        
        print(f"✓ Imported: {employee_id} - {full_name}")
        return employee
        
    except Exception as e:
        db.rollback()
        print(f"✗ Error importing record: {str(e)}")
        print(f"  Record data: {record_parts[:5] if len(record_parts) > 5 else record_parts}")
        return None


def main():
    """Main import function."""
    print("=" * 80)
    print("BULK EMPLOYEE IMPORT")
    print("=" * 80)
    
    # Your data goes here - paste the employee records
    # For now, this is a template. You'll need to add the actual data
    
    raw_data = """
    # PASTE YOUR EMPLOYEE DATA HERE
    # Each line should be one employee record
    """
    
    db = SessionLocal()
    
    try:
        lines = [line.strip() for line in raw_data.strip().split('\n') if line.strip() and not line.strip().startswith('#')]
        
        total = len(lines)
        success = 0
        failed = 0
        
        print(f"\nProcessing {total} employee records...\n")
        
        for i, line in enumerate(lines, 1):
            # Split by tab or multiple spaces
            parts = re.split(r'\t+|\s{2,}', line)
            
            result = import_employee_record(db, parts)
            if result:
                success += 1
            else:
                failed += 1
            
            if i % 10 == 0:
                print(f"Progress: {i}/{total} ({(i/total)*100:.1f}%)")
        
        print("\n" + "=" * 80)
        print(f"IMPORT COMPLETE")
        print(f"Total: {total} | Success: {success} | Failed: {failed}")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n✗ Fatal error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
