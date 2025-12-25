"""
Final bulk import with all spreadsheet employees and complete field mapping.
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
EMPLOYEES_URL = f"{BASE_URL}/api/employees/"

USERNAME = "superadmin"
PASSWORD = "SuperAdmin@123"


def parse_name(full_name):
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
    if val is None or str(val).strip() in ["", "-", "Nil", "nil", "N/A", "NA", "No"]:
        return None
    return str(val).strip()


def login():
    response = requests.post(LOGIN_URL, data={"username": USERNAME, "password": PASSWORD})
    if response.status_code == 200:
        return response.json().get("access_token")
    return None


def create_employee(token, employee_data):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return requests.post(EMPLOYEES_URL, headers=headers, json=employee_data)


# All employees from spreadsheet
ALL_EMPLOYEES = [
    {"fss": "135420", "designation": "Office Staff", "name": "Ramzan Ali", "father": "Shoukat Ali", "salary": "30,800", "unit": "Civil", "rank": "37401-8941641-1", "cnic": "37401-8941641-1", "dob": "25-Jul-1992", "expiry": "7-Sep-2031", "docs": "CNIC Original", "handed": None, "photo": "1 - Pic", "eobi": "4700B35813", "insurance": None, "ss": "Yes", "mobile": "0303-5190459", "home": None, "sho": "11/Oct/2016", "khidmat": "No", "domicile": None, "ssp": None, "enrolled": "7-Oct-2013", "re_enrolled": "31-Dec-2019", "village": "Bardiana", "po": "Mohra Noori", "thana": "Gujar Khan", "tehsil": "Gujar Khan", "district": "Rawalpindi", "location": "Kuwait Embassy", "police_trg": "27-Oct-13", "vacc": None, "vol": None, "payments": None, "card": None, "entry": None},
    
    {"fss": "147074", "designation": "Armourer", "name": "Jamil Akhtar", "father": "Muhammad Irfan", "salary": "12,000", "unit": "Army", "rank": "EMEHav", "cnic": "37403-4477709-7", "dob": "7-Dec-1970", "expiry": "31-Dec-2020", "docs": "Nil", "handed": None, "photo": "1 - Pic", "eobi": "4700B422931", "insurance": None, "ss": None, "mobile": "174660345", "home": "522351512", "sho": "12/Apr/2016", "khidmat": None, "domicile": None, "ssp": None, "enrolled": "29-Oct-2015", "re_enrolled": "10-Nov-2022", "village": "Bhangal", "po": "Letrar Bala", "thana": "Kotli Sattian", "tehsil": "Kotli Sattian", "district": "Rawalpindi", "location": "Kuwait Embassy", "police_trg": "29-Oct-15", "vacc": None, "vol": None, "payments": None, "card": None, "entry": None},
    
    {"fss": "152989", "designation": "Guard", "name": "Adil Hussain", "father": "Rafaqat Ali", "salary": "27,000", "unit": "Civil", "rank": None, "cnic": "37406-0735941-5", "dob": "2-May-1988", "expiry": "28-Jan-2029", "docs": "CNIC Origional", "handed": None, "photo": None, "eobi": "4700D168666", "insurance": None, "ss": None, "mobile": "0310-0786253", "home": "0300-5243276", "sho": "18/Apr/2024", "khidmat": None, "domicile": None, "ssp": None, "enrolled": "30-Sep-2009", "re_enrolled": "8-Mar-2024", "village": "Wani Gujran , Texila", "po": "Khas", "thana": "Texila", "tehsil": "Rawalpindi", "district": "Rawalpindi", "location": "PEL House 2 Islamabad", "police_trg": "30-Sep-09", "vacc": None, "vol": None, "payments": None, "card": None, "entry": None},
    
    {"fss": "165857", "designation": "Checker", "name": "Muhammad Naseer", "father": "Ghulam Rasool", "salary": "28,000", "unit": None, "rank": None, "cnic": "82302-4278253-7", "dob": "16-Aug-1985", "expiry": "10-May-2026", "docs": "CNIC Original", "handed": "Yes", "photo": None, "eobi": None, "insurance": None, "ss": None, "mobile": "100230344", "home": "50300211", "sho": "11/Jul/2015", "khidmat": "19/Sep/2016", "domicile": None, "ssp": None, "enrolled": "26-Jun-2014", "re_enrolled": "27-Sep-2022", "village": "Narian", "po": "Hajira", "thana": "Poonch", "tehsil": "Hajira", "district": "Poonch", "location": "Islamabad", "police_trg": None, "vacc": None, "vol": None, "payments": None, "card": None, "entry": None},
    
    {"fss": "1712505", "designation": "Driver", "name": "Imran Aslam", "father": "Aslam Khan", "salary": "30,000", "unit": "Civil", "rank": None, "cnic": "37101-1857143-5", "dob": "1-Jan-1975", "expiry": "17-Jun-2025", "docs": "6-Jan-2025", "handed": "By Hand", "photo": "3 - Pics", "eobi": None, "insurance": None, "ss": None, "mobile": "0313-4215795", "home": "0313-5859754", "sho": None, "khidmat": "8-Jun-2024", "domicile": None, "ssp": None, "enrolled": None, "re_enrolled": None, "village": "Mohallah Saddiqabad,Mirza", "po": "Khas", "thana": "Attock", "tehsil": "Attock", "district": None, "location": "Flash Office", "police_trg": None, "vacc": None, "vol": None, "payments": None, "card": None, "entry": None},
    
    {"fss": "185003", "designation": "Driver", "name": "Ajab Khan", "father": "Khan Bahadar", "salary": "30,000", "unit": "Civil", "rank": None, "cnic": "37101-3741619-7", "dob": "2-Sep-1978", "expiry": "31-Dec-2029", "docs": "CNIC Origional", "handed": None, "photo": "2 - Pic", "eobi": "4700H225812", "insurance": None, "ss": "Yes", "mobile": "0349-7803310", "home": None, "sho": "10-10-18 / 6-3-23", "khidmat": None, "domicile": None, "ssp": None, "enrolled": "21-Jan-2013", "re_enrolled": "20-Aug-2021", "village": "Near  Masjid Anwar-E-Habib", "po": "Mirza", "thana": "Saddar", "tehsil": "Attock", "district": "Attock", "location": "Islamabad", "police_trg": "20-Aug-21", "vacc": None, "vol": None, "payments": None, "card": None, "entry": None},
    
    {"fss": "1912819", "designation": "Driver", "name": "Zafar Iqbal", "father": "Muhammad Aslam", "salary": "28,000", "unit": "Civil", "rank": None, "cnic": "37105-0229410-9", "dob": "25-Sep-1976", "expiry": "21-Jun-2027", "docs": "CNIC Original", "handed": None, "photo": "1x Pics", "eobi": None, "insurance": None, "ss": None, "mobile": "0345-5772474", "home": "0347-5242007", "sho": "Sup Rafaqat Ali", "khidmat": "8-Jul-2025", "domicile": None, "ssp": None, "enrolled": None, "re_enrolled": None, "village": "Cameti Chowk Pindi Gheb", "po": "Khas", "thana": "Pindi Gheb", "tehsil": "Pindi Gheb", "district": "Attock", "location": "Flash Office", "police_trg": None, "vacc": None, "vol": None, "payments": None, "card": None, "entry": None},
    
    {"fss": "2012215", "designation": "Office Boy", "name": "Muhammad Shafique", "father": "Muhammad Siddique", "salary": "31,500", "unit": None, "rank": None, "cnic": "37401-3376490-5", "dob": "3-Aug-1983", "expiry": "27-Jul-2030", "docs": "CNIC Origional", "handed": "Yes", "photo": None, "eobi": None, "insurance": None, "ss": None, "mobile": "0349-5870159", "home": None, "sho": "28-Apr-2023", "khidmat": None, "domicile": None, "ssp": None, "enrolled": None, "re_enrolled": None, "village": "Karnali", "po": "Khas", "thana": "Mandra", "tehsil": "Gujar Khan", "district": "Rawalpindi", "location": "Office F-8", "police_trg": None, "vacc": None, "vol": None, "payments": None, "card": None, "entry": None},
]


def main():
    print("=" * 90)
    print("FINAL BULK EMPLOYEE IMPORT")
    print("=" * 90)
    
    token = login()
    if not token:
        print("✗ Login failed")
        return
    
    print(f"✓ Logged in\n")
    print(f"Importing {len(ALL_EMPLOYEES)} employees...\n")
    
    success = 0
    failed = 0
    
    for idx, emp in enumerate(ALL_EMPLOYEES, 1):
        first_name, last_name = parse_name(emp.get("name", ""))
        
        employee_data = {
            "first_name": first_name,
            "last_name": last_name,
            "father_name": clean_value(emp.get("father")),
            "email": f"{first_name.lower()}.{last_name.lower().replace(' ', '')}.{emp.get('fss', idx)}@flash.com",
            "designation": clean_value(emp.get("designation")),
            "employment_status": "Active",
            "total_salary": clean_value(emp.get("salary", "").replace(",", "")),
            "base_location": clean_value(emp.get("location")),
            "service_unit": clean_value(emp.get("unit")),
            "service_rank": clean_value(emp.get("rank")),
            "service_enrollment_date": clean_value(emp.get("enrolled")),
            "service_reenrollment_date": clean_value(emp.get("re_enrolled")),
            "retired_from": [emp.get("unit")] if emp.get("unit") else None,
            "cnic": clean_value(emp.get("cnic")),
            "date_of_birth": clean_value(emp.get("dob")),
            "cnic_expiry_date": clean_value(emp.get("expiry")),
            "domicile": clean_value(emp.get("domicile")),
            "mobile_number": clean_value(emp.get("mobile")),
            "home_contact_no": clean_value(emp.get("home")),
            "permanent_village": clean_value(emp.get("village")),
            "permanent_post_office": clean_value(emp.get("po")),
            "permanent_thana": clean_value(emp.get("thana")),
            "permanent_tehsil": clean_value(emp.get("tehsil")),
            "permanent_district": clean_value(emp.get("district")),
            "original_doc_held": clean_value(emp.get("docs")),
            "documents_handed_over_to": clean_value(emp.get("handed")),
            "photo_on_document": clean_value(emp.get("photo")),
            "particulars_verified_by_sho_on": clean_value(emp.get("sho")),
            "particulars_verified_by_ssp_on": clean_value(emp.get("ssp")),
            "police_khidmat_verification_on": clean_value(emp.get("khidmat")),
            "verified_by_khidmat_markaz": clean_value(emp.get("khidmat")),
            "eobi_no": clean_value(emp.get("eobi")),
            "insurance": clean_value(emp.get("insurance")),
            "social_security": clean_value(emp.get("ss")),
            "police_training_letter_date": clean_value(emp.get("police_trg")),
            "vaccination_certificate": clean_value(emp.get("vacc")),
            "fss_number": clean_value(emp.get("fss")),
            "volume_no": clean_value(emp.get("vol")),
            "payments": clean_value(emp.get("payments")),
            "card_number": clean_value(emp.get("card")),
            "date_of_entry": clean_value(emp.get("entry")),
        }
        
        employee_data = {k: v for k, v in employee_data.items() if v is not None}
        
        print(f"[{idx:2d}/{len(ALL_EMPLOYEES)}] {emp.get('name', 'Unknown'):30s} ", end="", flush=True)
        
        response = create_employee(token, employee_data)
        
        if response.status_code in [200, 201]:
            emp_id = response.json().get("employee_id", "N/A")
            print(f"✓ {emp_id}")
            success += 1
        else:
            print(f"✗ {response.status_code}")
            failed += 1
    
    print("\n" + "=" * 90)
    print(f"RESULT: {success} SUCCESS | {failed} FAILED | {len(ALL_EMPLOYEES)} TOTAL")
    print("=" * 90)


if __name__ == "__main__":
    main()
