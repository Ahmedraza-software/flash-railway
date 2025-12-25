"""
Complete Staff Import Script
Run this script to import all employee data into the database
Usage: python import_all_staff.py
"""
import sys
import re
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.employee import Employee
from app.core.database import Base

# Create all tables
Base.metadata.create_all(bind=engine)

# Utility functions
def parse_date(date_str):
    if not date_str or str(date_str).strip() in ["", "-", "Nil", "No", "For Life", "Life Time", "for Life", "Exp", "ExpCNIC", "Expire", "ExpireCNIC", "Life time", "Lifetime"]:
        return None
    date_str = str(date_str).strip()
    formats = ["%d-%b-%Y", "%d-%b-%y", "%d/%b/%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y", "%d/%m/%y", "%d/%B/%Y"]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except:
            continue
    return None

def clean(value):
    if value is None:
        return None
    value = str(value).strip()
    return None if value in ["", "-", "Nil", "nil", "NA", "N/A", "--", "Nil", "NIL"] else value

def parse_salary(s):
    if not s:
        return None
    s = str(s).replace(",", "").replace(" ", "").strip()
    return s if s and s not in ["-", ""] else None

def create_employee_id(fss, name):
    if fss and str(fss).strip() and str(fss).strip() != "-":
        return f"EMP{str(fss).strip()}"
    name_clean = re.sub(r'[^a-zA-Z]', '', str(name))[:4].upper()
    return f"EMP{name_clean}{datetime.now().strftime('%H%M%S')}"

def import_employee(db, fss, rank, name, father, salary, status, unit, service_rank, blood_group, 
                   status2, unit2, rank2, cnic, dob, cnic_exp, docs_held, docs_handed, photo_doc,
                   eobi, insurance, social_sec, mobile, home_contact, verified_sho, verified_khidmat,
                   domicile, verified_ssp, enrolled, reenrolled, village, post_office, thana, 
                   tehsil, district, duty_location, police_trg, vaccination, vol_no, payments,
                   number, date_entry, card, designation):
    
    try:
        name = clean(name) or "Unknown"
        name_parts = name.split()
        first_name = name_parts[0] if name_parts else "Unknown"
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
        
        emp_id = create_employee_id(fss, name)
        
        # Check if exists
        if db.query(Employee).filter(Employee.employee_id == emp_id).first():
            return None, f"Duplicate: {emp_id}"
        
        employee = Employee(
            employee_id=emp_id,
            fss_number=clean(fss),
            first_name=first_name,
            last_name=last_name,
            father_name=clean(father),
            basic_salary=parse_salary(salary),
            total_salary=parse_salary(salary),
            designation=clean(designation) or clean(rank),
            service_rank=clean(service_rank) or clean(rank),
            service_unit=clean(unit),
            blood_group=clean(blood_group),
            cnic=clean(cnic),
            date_of_birth=parse_date(dob),
            cnic_expiry_date=parse_date(cnic_exp),
            mobile_number=clean(mobile),
            home_contact_no=clean(home_contact),
            permanent_village=clean(village),
            permanent_post_office=clean(post_office),
            permanent_thana=clean(thana),
            permanent_tehsil=clean(tehsil),
            permanent_district=clean(district),
            domicile=clean(domicile),
            base_location=clean(duty_location),
            eobi_no=clean(eobi),
            insurance=clean(insurance),
            social_security=clean(social_sec),
            service_enrollment_date=parse_date(enrolled),
            service_reenrollment_date=parse_date(reenrolled),
            police_training_letter_date=clean(police_trg),
            vaccination_certificate=clean(vaccination),
            volume_no=clean(vol_no),
            date_of_entry=parse_date(date_entry),
            card_number=clean(card),
            employment_status=clean(status) or "Active",
            particulars_verified_by_sho_on=parse_date(verified_sho),
            particulars_verified_by_ssp_on=parse_date(verified_ssp),
            verified_by_khidmat_markaz=clean(verified_khidmat),
            original_doc_held=clean(docs_held),
            documents_handed_over_to=clean(docs_handed),
            photo_on_document=clean(photo_doc),
            payments=clean(payments)
        )
        
        db.add(employee)
        db.commit()
        db.refresh(employee)
        
        return employee, None
        
    except Exception as e:
        db.rollback()
        return None, str(e)

def main():
    print("="*80)
    print("EMPLOYEE IMPORT SYSTEM")
    print("="*80)
    
    db = SessionLocal()
    success_count = 0
    fail_count = 0
    
    try:
        # Sample data - replace with your actual data
        # Format: (fss, rank, name, father, salary, status, unit, service_rank, blood_group, ...)
        employees = [
            # Add your employee tuples here
            # Example:
            # ("7459", "Asst", "Faisal Zaman", "Taib Zaman", "39600", "Civil", "", "", "", "", "", "", "61101-6827977-5", "30-May-1987", "18-Jul-2028", "finance Asst", "Nil", "4700A462788", "5-May-16", "163230", "334-5464450", "Nil", "Nil", "5-May-2016", "St#18A, Jawa Road", "Letrar Road", "Shehzad Town", "Islamabad", "Islamabad", "Islamabad", "", "", "", "", "", "", "Asst"),
        ]
        
        print(f"\nProcessing {len(employees)} employees...\n")
        
        for emp_data in employees:
            if len(emp_data) < 42:
                # Pad with None values
                emp_data = list(emp_data) + [None] * (42 - len(emp_data))
            
            result, error = import_employee(db, *emp_data[:42])
            
            if result:
                print(f"✓ {result.employee_id}: {result.first_name} {result.last_name}")
                success_count += 1
            else:
                print(f"✗ Error: {error}")
                fail_count += 1
        
        print(f"\n{'='*80}")
        print(f"IMPORT COMPLETE")
        print(f"Success: {success_count} | Failed: {fail_count}")
        print(f"{'='*80}")
        
    except Exception as e:
        print(f"\nFatal error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
