"""
Import all employees from Google Sheets data.
This script parses the spreadsheet data and imports all employees.
"""
import requests
import re

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
EMPLOYEES_URL = f"{BASE_URL}/api/employees/"

USERNAME = "superadmin"
PASSWORD = "SuperAdmin@123"


def parse_name(full_name):
    """Split full name into first and last name."""
    if not full_name:
        return "Unknown", "Employee"
    
    parts = full_name.strip().split()
    if len(parts) == 1:
        return parts[0], "."
    elif len(parts) == 2:
        return parts[0], parts[1]
    else:
        # First name is first part, last name is rest
        return parts[0], " ".join(parts[1:])


def clean_salary(salary_str):
    """Clean salary string."""
    if not salary_str or salary_str == "-":
        return None
    # Remove commas and spaces
    cleaned = re.sub(r'[,\s]', '', str(salary_str))
    return cleaned if cleaned else None


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


# Parsed employee data from the spreadsheet
EMPLOYEES = [
    {"name": "Rafaqat Ali", "father": "Muhammad Afsar", "salary": "39930", "rank": "58 Med ADN/Sub", "cnic": "37406-1569055-1", "dob": "8-Jun-1961", "mobile": "D-6530300", "home": "52432769", "village": "Wani Gujran", "po": "Wani Gujran", "thana": "Taxila", "tehsil": "Taxila", "district": "Rawalpindi", "location": "Islamabad", "designation": "Supervisor", "fss": "101904"},
    {"name": "Iftikhar Hussain", "father": "Sajawal Khan", "salary": "35090", "rank": "16 Sig BnHav", "cnic": "37401-1475783-3", "dob": "10-Mar-1962", "mobile": "0347-5953802", "village": "Cantt Malook", "po": "Canat Khalil", "thana": "Jatli", "tehsil": "Gujar Khan", "district": "Rawalpindi", "location": "Islamabad", "designation": "Supervisor", "fss": "112216"},
    {"name": "Shah Jahan", "father": "Muhammad Ramzan", "salary": "34485", "rank": "45 FFLnk", "cnic": "12101-8279297-3", "dob": "6-Apr-1971", "mobile": "192210343", "home": "787966325", "village": "Babar Paka", "po": "Prova", "thana": "Prova", "tehsil": "Prova", "district": "Dera Ismail Khan", "location": "Islamabad", "designation": "Supervisor", "fss": "125899"},
    {"name": "Ramzan Ali", "father": "Shoukat Ali", "salary": "30800", "rank": "Civil", "cnic": "37401-8941641-1", "dob": "25-Jul-1992", "mobile": "0303-5190459", "village": "Bardiana", "po": "Mohra Noori", "thana": "Gujar Khan", "tehsil": "Gujar Khan", "district": "Rawalpindi", "location": "Kuwait Embassy", "designation": "Office Staff", "fss": "135420"},
    {"name": "Jamil Akhtar", "father": "Muhammad Irfan", "salary": "12000", "rank": "EMEHav", "cnic": "37403-4477709-7", "dob": "7-Dec-1970", "mobile": "174660345", "home": "522351512", "village": "Bhangal", "po": "Letrar Bala", "thana": "Kotli Sattian", "tehsil": "Kotli Sattian", "district": "Rawalpindi", "location": "Kuwait Embassy", "designation": "Armourer", "fss": "147074"},
    {"name": "Adil Hussain", "father": "Rafaqat Ali", "salary": "27000", "rank": "Civil", "cnic": "37406-0735941-5", "dob": "2-May-1988", "mobile": "0310-0786253", "home": "0300-5243276", "village": "Wani Gujran , Texila", "po": "Khas", "thana": "Texila", "tehsil": "Rawalpindi", "district": "Rawalpindi", "location": "PEL House 2 Islamabad", "designation": "Guard", "fss": "152989"},
    {"name": "Muhammad Naseer", "father": "Ghulam Rasool", "salary": "28000", "cnic": "82302-4278253-7", "dob": "16-Aug-1985", "mobile": "100230344", "home": "50300211", "village": "Narian", "po": "Hajira", "thana": "Poonch", "tehsil": "Hajira", "district": "Poonch", "location": "Islamabad", "designation": "Checker", "fss": "165857"},
    {"name": "Imran Aslam", "father": "Aslam Khan", "salary": "30000", "rank": "Civil", "cnic": "37101-1857143-5", "dob": "1-Jan-1975", "mobile": "0313-4215795", "home": "0313-5859754", "village": "Mohallah Saddiqabad,Mirza", "po": "Khas", "thana": "Attock", "tehsil": "Attock", "location": "Flash Office", "designation": "Driver", "fss": "1712505"},
    {"name": "Ajab Khan", "father": "Khan Bahadar", "salary": "30000", "rank": "Civil", "cnic": "37101-3741619-7", "dob": "2-Sep-1978", "mobile": "0349-7803310", "village": "Near  Masjid Anwar-E-Habib", "po": "Mirza", "thana": "Saddar", "tehsil": "Attock", "district": "Attock", "location": "Islamabad", "designation": "Driver", "fss": "185003"},
    {"name": "Zafar Iqbal", "father": "Muhammad Aslam", "salary": "28000", "rank": "Civil", "cnic": "37105-0229410-9", "dob": "25-Sep-1976", "mobile": "0345-5772474", "home": "0347-5242007", "village": "Cameti Chowk Pindi Gheb", "po": "Khas", "thana": "Pindi Gheb", "tehsil": "Pindi Gheb", "district": "Attock", "location": "Flash Office", "designation": "Driver", "fss": "1912819"},
]


def main():
    print("=" * 70)
    print("EMPLOYEE BULK IMPORT")
    print("=" * 70)
    
    token = login()
    if not token:
        return
    
    print(f"Importing {len(EMPLOYEES)} employees...\n")
    
    success = 0
    failed = 0
    
    for idx, emp in enumerate(EMPLOYEES, 1):
        first_name, last_name = parse_name(emp.get("name", ""))
        
        employee_data = {
            "first_name": first_name,
            "last_name": last_name,
            "father_name": emp.get("father"),
            "total_salary": clean_salary(emp.get("salary")),
            "service_rank": emp.get("rank"),
            "cnic": emp.get("cnic"),
            "date_of_birth": emp.get("dob"),
            "mobile_number": emp.get("mobile"),
            "home_contact_no": emp.get("home"),
            "permanent_village": emp.get("village"),
            "permanent_post_office": emp.get("po"),
            "permanent_thana": emp.get("thana"),
            "permanent_tehsil": emp.get("tehsil"),
            "permanent_district": emp.get("district"),
            "base_location": emp.get("location"),
            "designation": emp.get("designation"),
            "fss_number": emp.get("fss"),
            "email": f"{first_name.lower()}.{last_name.lower().replace(' ', '')}@flash.com",
            "employment_status": "Active",
            "retired_from": [emp.get("rank")] if emp.get("rank") else None
        }
        
        print(f"[{idx:2d}/{len(EMPLOYEES)}] {emp.get('name', 'Unknown'):30s} ", end="")
        
        response = create_employee(token, employee_data)
        
        if response.status_code in [200, 201]:
            emp_id = response.json().get("employee_id", "N/A")
            print(f"✓ {emp_id}")
            success += 1
        else:
            print(f"✗ Error {response.status_code}")
            failed += 1
    
    print("\n" + "=" * 70)
    print(f"SUCCESS: {success} | FAILED: {failed} | TOTAL: {len(EMPLOYEES)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
