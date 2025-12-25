"""Import employees from JSON file directly into SQLite database."""
import json
import sqlite3
import re
from datetime import datetime

DB_PATH = "flash_erp.db"
JSON_PATH = "C:/Users/ahmed/Desktop/kiro - Copy/convertcsv.json"

def sanitize_phone(v):
    if not v:
        return None
    s = re.sub(r"[^\d]", "", str(v).split("/")[0])
    return s if s else None

def sanitize_money(v):
    if not v:
        return None
    s = re.sub(r"[^\d.]", "", str(v))
    try:
        return str(int(float(s))) if s else None
    except:
        return None

def parse_excel_date(v):
    """Parse Excel serial date or date string."""
    if not v:
        return None
    s = str(v).strip()
    if not s or s.lower() in ("nil", "n/a", "-", "for life", "exp", "life time", "expired"):
        return None
    
    # Try Excel serial date (number)
    try:
        serial = int(float(s))
        if 20000 < serial < 60000:  # Valid Excel date range
            from datetime import timedelta
            base = datetime(1899, 12, 30)
            return (base + timedelta(days=serial)).strftime("%Y-%m-%d")
    except:
        pass
    
    # Try common date formats
    for fmt in ["%d-%b-%Y", "%d/%b/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y"]:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except:
            continue
    return None

def split_name(full_name):
    parts = (full_name or "").strip().split()
    if len(parts) == 0:
        return "Unknown", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])

def get_next_employee_id(cursor):
    cursor.execute("SELECT MAX(CAST(SUBSTR(employee_id, 4) AS INTEGER)) FROM employees WHERE employee_id LIKE 'EMP%'")
    result = cursor.fetchone()[0]
    next_num = (result or 0) + 1
    return f"EMP{next_num:05d}"

def main():
    print("=" * 60)
    print("IMPORTING EMPLOYEES FROM JSON")
    print("=" * 60)
    
    # Load JSON
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"Loaded {len(data)} rows from JSON")
    
    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Column mapping (JSON key -> meaning)
    # A=#, B=FSS#, C=Rank, D=Name, E=Father's Name, F=Salary, G=Status, H=Unit, I=Rank
    # J=Blood Gp, K=Status, L=Unit, M=Rank, N=CNIC#, O=DOB, P=CNIC Expr
    # Q=Documents held, R=Documents Handed Over To, S=Photo on Docu, T=EOBI#
    # W=Insurance, X=Social Security, Y=Mob#, Z=Home Contact Number
    # AA=Verified by SHO, AB=Verified by Khidmat Markaz, AC=Domicile, AD=Verified by SSP
    # AE=Enrolled, AF=Re Enrolled, AG=Village, AH=Post Office, AI=Thana, AJ=Tehsil
    # AK=District, AL=Duty Location, AM=Police Trg Ltr & Date, AN=Vacanation Cert
    # AO=Vol#, AP=Payment's
    
    created = 0
    skipped = 0
    errors = []
    
    for idx, row in enumerate(data):
        # Skip header rows and section headers
        name = str(row.get("D") or "").strip()
        row_num = str(row.get("A") or "").strip()
        
        # Skip if no name or if it's a header/section row
        if not name or name == "Name":
            continue
        if not row_num.isdigit():
            continue
        
        try:
            first_name, last_name = split_name(name)
            cnic = str(row.get("N") or "").strip() or None
            fss_no = str(row.get("B") or "").strip() or None
            
            # Check for duplicates by CNIC
            if cnic:
                cursor.execute("SELECT id FROM employees WHERE cnic = ?", (cnic,))
                if cursor.fetchone():
                    skipped += 1
                    continue
            
            # Check for duplicates by FSS number
            if fss_no:
                cursor.execute("SELECT id FROM employees WHERE fss_number = ?", (fss_no,))
                if cursor.fetchone():
                    skipped += 1
                    continue
            
            employee_id = get_next_employee_id(cursor)
            email = f"{first_name.lower().replace(' ', '')}.{last_name.lower().replace(' ', '') if last_name else 'emp'}_{idx}@company.local"
            
            # Prepare data
            emp_data = {
                "employee_id": employee_id,
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "father_name": str(row.get("E") or "").strip() or None,
                "total_salary": sanitize_money(row.get("F")),
                "employment_status": "Active",
                "fss_number": fss_no,
                "designation": str(row.get("C") or "").strip() or None,
                "service_rank": str(row.get("I") or "").strip() or None,
                "service_unit": str(row.get("H") or "").strip() or None,
                "blood_group": str(row.get("J") or "").strip() or None,
                "cnic": cnic,
                "date_of_birth": parse_excel_date(row.get("O")),
                "cnic_expiry_date": parse_excel_date(row.get("P")),
                "original_doc_held": str(row.get("Q") or "").strip() or None,
                "documents_handed_over_to": str(row.get("R") or "").strip() or None,
                "photo_on_document": str(row.get("S") or "").strip() or None,
                "eobi_no": str(row.get("T") or "").strip() or None,
                "insurance": str(row.get("W") or "").strip() or None,
                "social_security": str(row.get("X") or "").strip() or None,
                "mobile_number": sanitize_phone(row.get("Y")),
                "home_contact_no": sanitize_phone(row.get("Z")),
                "particulars_verified_by_sho_on": parse_excel_date(row.get("AA")),
                "police_khidmat_verification_on": parse_excel_date(row.get("AB")),
                "domicile": str(row.get("AC") or "").strip() or None,
                "particulars_verified_by_ssp_on": parse_excel_date(row.get("AD")),
                "service_enrollment_date": parse_excel_date(row.get("AE")),
                "service_reenrollment_date": parse_excel_date(row.get("AF")),
                "permanent_village": str(row.get("AG") or "").strip() or None,
                "permanent_post_office": str(row.get("AH") or "").strip() or None,
                "permanent_thana": str(row.get("AI") or "").strip() or None,
                "permanent_tehsil": str(row.get("AJ") or "").strip() or None,
                "permanent_district": str(row.get("AK") or "").strip() or None,
                "base_location": str(row.get("AL") or "").strip() or None,
                "police_training_letter_date": str(row.get("AM") or "").strip() or None,
                "vaccination_certificate": str(row.get("AN") or "").strip() or None,
                "volume_no": str(row.get("AO") or "").strip() or None,
                "payments": str(row.get("AP") or "").strip() or None,
            }
            
            # Build INSERT statement
            columns = [k for k, v in emp_data.items() if v is not None]
            values = [v for v in emp_data.values() if v is not None]
            placeholders = ",".join(["?" for _ in columns])
            
            sql = f"INSERT INTO employees ({','.join(columns)}) VALUES ({placeholders})"
            cursor.execute(sql, values)
            conn.commit()
            created += 1
            
            if created % 50 == 0:
                print(f"Created {created} employees...")
                
        except Exception as e:
            errors.append(f"Row {idx} ({name}): {e}")
            conn.rollback()
    
    conn.close()
    
    print(f"\n{'=' * 60}")
    print("IMPORT COMPLETE")
    print(f"{'=' * 60}")
    print(f"Created: {created}")
    print(f"Skipped (duplicates): {skipped}")
    print(f"Errors: {len(errors)}")
    
    if errors[:10]:
        print("\nFirst 10 errors:")
        for e in errors[:10]:
            print(f"  - {e}")

if __name__ == "__main__":
    main()
