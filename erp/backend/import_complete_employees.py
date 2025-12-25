"""
Complete employee import script with all spreadsheet fields mapped.
Maps: FSS #, Rank, Name, Father's Name, Salary, Status, Unit, Rank, Blood Gp, 
CNIC #, DOB, CNIC Expr, Documents held, Documents Receiving/Handed Over To, 
Photo on Docu, EOBI #, Insurance, Social Security, Mob #, Home Contact Number,
Verified by SHO, Verified by Khidmat Markaz, Domicile, Verified by SSP, 
Enrolled, Re Enrolled, Village, Post Office, Thana, Tehsil, District, 
Duty Location, Police Trg Ltr & Date, Vacanation Cert, Vol #, Payment's, 
Number, Date of Entry, Card
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
EMPLOYEES_URL = f"{BASE_URL}/api/employees/"

USERNAME = "superadmin"
PASSWORD = "SuperAdmin@123"


def parse_name(full_name):
    """Split full name into first and last name."""
    if not full_name or full_name.strip() == "":
        return "Unknown", "Employee"
    
    parts = full_name.strip().split()
    if len(parts) == 1:
        return parts[0], "."
    elif len(parts) == 2:
        return parts[0], parts[1]
    else:
        return parts[0], " ".join(parts[1:])


def clean_value(val):
    """Clean and return value or None."""
    if val is None or str(val).strip() in ["", "-", "Nil", "nil", "N/A", "NA"]:
        return None
    return str(val).strip()


def login():
    """Login and get access token."""
    print("Logging in...")
    response = requests.post(LOGIN_URL, data={"username": USERNAME, "password": PASSWORD})
    
    if response.status_code == 200:
        token = response.json().get("access_token")
        print(f"✓ Login successful\n")
        return token
    else:
        print(f"✗ Login failed: {response.status_code}")
        return None


def create_employee(token, employee_data):
    """Create employee via API."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return requests.post(EMPLOYEES_URL, headers=headers, json=employee_data)


# Complete employee data from spreadsheet with ALL fields
COMPLETE_EMPLOYEES = [
    {
        "fss_number": "101904",
        "designation": "Supervisor",
        "name": "Rafaqat Ali",
        "father_name": "Muhammad Afsar",
        "salary": "39,930",
        "employment_status": "Active",
        "service_unit": "Army",
        "service_rank": "58 Med ADN/Sub",
        "blood_group": None,
        "cnic": "37406-1569055-1",
        "dob": "8-Jun-1961",
        "cnic_expiry": "For Life",
        "documents_held": "Office Senior Supervioser",
        "documents_handed_over_to": None,
        "photo_on_document": "1 - Pic",
        "eobi_no": "4700H106482",
        "insurance": None,
        "social_security": "Yes",
        "mobile": "D-6530300",
        "home_contact": "52432769",
        "verified_by_sho": None,
        "verified_by_khidmat_markaz": "9/Jun/2007",
        "domicile": None,
        "verified_by_ssp": None,
        "enrolled": "7-May-2006",
        "re_enrolled": None,
        "village": "Wani Gujran",
        "post_office": "Wani Gujran",
        "thana": "Taxila",
        "tehsil": "Taxila",
        "district": "Rawalpindi",
        "duty_location": "Islamabad",
        "police_training_letter": "1-Jul-07",
        "vaccination_cert": None,
        "volume_no": None,
        "payments": None,
        "card": None,
        "date_of_entry": None
    },
    {
        "fss_number": "112216",
        "designation": "Supervisor",
        "name": "Iftikhar Hussain",
        "father_name": "Sajawal Khan",
        "salary": "35,090",
        "employment_status": "Active",
        "service_unit": "Army",
        "service_rank": "16 Sig BnHav",
        "blood_group": None,
        "cnic": "37401-1475783-3",
        "dob": "10-Mar-1962",
        "cnic_expiry": "For Life",
        "documents_held": "CNIC Origional",
        "documents_handed_over_to": None,
        "photo_on_document": "1 - Pic",
        "eobi_no": "4700J120221",
        "insurance": None,
        "social_security": "Yes",
        "mobile": "CMH0347-5953802",
        "home_contact": None,
        "verified_by_sho": "19/Dec/2015",
        "verified_by_khidmat_markaz": "19/Feb/2023",
        "domicile": None,
        "verified_by_ssp": None,
        "enrolled": "10-Aug-2007",
        "re_enrolled": None,
        "village": "Cantt Malook",
        "post_office": "Canat Khalil",
        "thana": "Jatli",
        "tehsil": "Gujar Khan",
        "district": "Rawalpindi",
        "duty_location": "Islamabad",
        "police_training_letter": "1-Jul-08",
        "vaccination_cert": None,
        "volume_no": None,
        "payments": None,
        "card": None,
        "date_of_entry": None
    },
    {
        "fss_number": "125899",
        "designation": "Supervisor",
        "name": "Shah Jahan",
        "father_name": "Muhammad Ramzan",
        "salary": "34,485",
        "employment_status": "Active",
        "service_unit": "Army",
        "service_rank": "45 FFLnk",
        "blood_group": None,
        "cnic": "12101-8279297-3",
        "dob": "6-Apr-1971",
        "cnic_expiry": "1-Dec-2030",
        "documents_held": "CNIC Origional",
        "documents_handed_over_to": "Handed over on 1 Mar 18",
        "photo_on_document": "3 - Pic",
        "eobi_no": "4700H430182",
        "insurance": None,
        "social_security": None,
        "mobile": "192210343",
        "home_contact": "787966325",
        "verified_by_sho": "25/Sep/2014",
        "verified_by_khidmat_markaz": "23/May/2023",
        "domicile": None,
        "verified_by_ssp": None,
        "enrolled": "12-Aug-2014",
        "re_enrolled": None,
        "village": "Babar Paka",
        "post_office": "Prova",
        "thana": "Prova",
        "tehsil": "Prova",
        "district": "Dera Ismail Khan",
        "duty_location": "Islamabad",
        "police_training_letter": "12-Aug-14",
        "vaccination_cert": None,
        "volume_no": None,
        "payments": None,
        "card": None,
        "date_of_entry": None
    },
]


def main():
    print("=" * 80)
    print("COMPLETE EMPLOYEE IMPORT WITH ALL FIELDS")
    print("=" * 80)
    
    token = login()
    if not token:
        return
    
    print(f"Importing {len(COMPLETE_EMPLOYEES)} employees with complete data...\n")
    
    success = 0
    failed = 0
    
    for idx, emp in enumerate(COMPLETE_EMPLOYEES, 1):
        first_name, last_name = parse_name(emp.get("name", ""))
        
        # Map all spreadsheet fields to API fields
        employee_data = {
            # Basic Info
            "first_name": first_name,
            "last_name": last_name,
            "father_name": clean_value(emp.get("father_name")),
            "email": f"{first_name.lower()}.{last_name.lower().replace(' ', '')}@flash.com",
            
            # Employment
            "designation": clean_value(emp.get("designation")),
            "employment_status": clean_value(emp.get("employment_status")) or "Active",
            "total_salary": clean_value(emp.get("salary", "").replace(",", "")),
            "base_location": clean_value(emp.get("duty_location")),
            
            # Service Details
            "service_unit": clean_value(emp.get("service_unit")),
            "service_rank": clean_value(emp.get("service_rank")),
            "service_enrollment_date": clean_value(emp.get("enrolled")),
            "service_reenrollment_date": clean_value(emp.get("re_enrolled")),
            "retired_from": [emp.get("service_unit")] if emp.get("service_unit") else None,
            
            # Personal Info
            "blood_group": clean_value(emp.get("blood_group")),
            "cnic": clean_value(emp.get("cnic")),
            "date_of_birth": clean_value(emp.get("dob")),
            "cnic_expiry_date": clean_value(emp.get("cnic_expiry")),
            "domicile": clean_value(emp.get("domicile")),
            
            # Contact
            "mobile_number": clean_value(emp.get("mobile")),
            "home_contact_no": clean_value(emp.get("home_contact")),
            
            # Address
            "permanent_village": clean_value(emp.get("village")),
            "permanent_post_office": clean_value(emp.get("post_office")),
            "permanent_thana": clean_value(emp.get("thana")),
            "permanent_tehsil": clean_value(emp.get("tehsil")),
            "permanent_district": clean_value(emp.get("district")),
            
            # Documents & Verification
            "original_doc_held": clean_value(emp.get("documents_held")),
            "documents_handed_over_to": clean_value(emp.get("documents_handed_over_to")),
            "photo_on_document": clean_value(emp.get("photo_on_document")),
            "particulars_verified_by_sho_on": clean_value(emp.get("verified_by_sho")),
            "particulars_verified_by_ssp_on": clean_value(emp.get("verified_by_ssp")),
            "police_khidmat_verification_on": clean_value(emp.get("verified_by_khidmat_markaz")),
            "verified_by_khidmat_markaz": clean_value(emp.get("verified_by_khidmat_markaz")),
            
            # Benefits & Certificates
            "eobi_no": clean_value(emp.get("eobi_no")),
            "insurance": clean_value(emp.get("insurance")),
            "social_security": clean_value(emp.get("social_security")),
            "police_training_letter_date": clean_value(emp.get("police_training_letter")),
            "vaccination_certificate": clean_value(emp.get("vaccination_cert")),
            
            # Additional Fields
            "fss_number": clean_value(emp.get("fss_number")),
            "volume_no": clean_value(emp.get("volume_no")),
            "payments": clean_value(emp.get("payments")),
            "card_number": clean_value(emp.get("card")),
            "date_of_entry": clean_value(emp.get("date_of_entry")),
        }
        
        # Remove None values
        employee_data = {k: v for k, v in employee_data.items() if v is not None}
        
        print(f"[{idx:2d}/{len(COMPLETE_EMPLOYEES)}] {emp.get('name', 'Unknown'):30s} ", end="")
        
        response = create_employee(token, employee_data)
        
        if response.status_code in [200, 201]:
            emp_id = response.json().get("employee_id", "N/A")
            print(f"✓ {emp_id}")
            success += 1
        else:
            print(f"✗ Error {response.status_code}")
            try:
                error_detail = response.json()
                print(f"    Details: {json.dumps(error_detail, indent=2)}")
            except:
                print(f"    Details: {response.text[:200]}")
            failed += 1
    
    print("\n" + "=" * 80)
    print(f"SUCCESS: {success} | FAILED: {failed} | TOTAL: {len(COMPLETE_EMPLOYEES)}")
    print("=" * 80)


if __name__ == "__main__":
    main()
