"""
Import employees from Google Sheets data into the ERP system.
"""
import requests
import json
from datetime import datetime

# API Configuration
BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
EMPLOYEES_URL = f"{BASE_URL}/api/employees/"

# Login credentials (superadmin)
USERNAME = "superadmin"
PASSWORD = "SuperAdmin@123"

# Employee data from Google Sheets
EMPLOYEES_DATA = [
    {
        "fss_number": "67459",
        "designation": "Asst",
        "first_name": "Faisal",
        "last_name": "Zaman",
        "father_name": "Taib Zaman",
        "total_salary": "39600",
        "retired_from": ["Civil"],
        "service_rank": "61101-6827977-5",
        "cnic": "61101-6827977-5",
        "date_of_birth": "30-May-1987",
        "cnic_expiry_date": "18-Jul-2028",
        "original_doc_held": "finance Asst",
        "documents_handed_over_to": "Nil",
        "photo_on_document": "4700A4627885",
        "service_enrollment_date": "5-May-2016",
        "mobile_number": "163230334",
        "home_contact_no": "5464450",
        "particulars_verified_by_sho_on": "Nil",
        "particulars_verified_by_ssp_on": "Nil",
        "service_reenrollment_date": "5-May-2016",
        "permanent_village": "St#18A, Jawa Road, Burma Town",
        "permanent_post_office": "Letrar Road",
        "permanent_thana": "Shehzad Town",
        "permanent_tehsil": "Islamabad",
        "permanent_district": "Islamabad",
        "base_location": "Islamabad",
        "email": "faisal.zaman@flash.com"
    },
    {
        "fss_number": "74708",
        "designation": "RO",
        "first_name": "Ansar",
        "last_name": "Abbas",
        "father_name": "Ghulam Muhammad",
        "total_salary": "43137",
        "retired_from": ["Civil"],
        "service_rank": "38403-2034593-3",
        "cnic": "38403-2034593-3",
        "date_of_birth": "15-Mar-1978",
        "cnic_expiry_date": "1-Dec-2027",
        "original_doc_held": "Office Staff",
        "documents_handed_over_to": "Yes",
        "photo_on_document": "4200G0306532",
        "service_enrollment_date": "26-Jun-2012",
        "mobile_number": "131640346",
        "home_contact_no": "681783423",
        "police_khidmat_verification_on": "Jun/2012",
        "particulars_verified_by_ssp_on": "Nil",
        "service_reenrollment_date": "26-Jun-2012",
        "permanent_village": "Chak # 37-NB",
        "permanent_post_office": "Chak # 37-NB",
        "permanent_thana": "Saddar",
        "permanent_tehsil": "Sargodha",
        "permanent_district": "Sargodha",
        "base_location": "Islamabad",
        "email": "ansar.abbas@flash.com"
    },
    {
        "fss_number": "85644",
        "designation": "RO",
        "first_name": "Muhammad Iftikhar",
        "last_name": "Rao",
        "father_name": "Rao Muhammad Munir Khan",
        "total_salary": "35000",
        "retired_from": ["Civil"],
        "service_rank": "36603-5931243-5",
        "cnic": "36603-5931243-5",
        "date_of_birth": "13-Mar-1966",
        "cnic_expiry_date": "21-Mar-2026",
        "original_doc_held": "Office Staff",
        "photo_on_document": "1 - Pic 0500J908092.14",
        "mobile_number": "1100321",
        "home_contact_no": "7562718",
        "particulars_verified_by_sho_on": "Nil",
        "particulars_verified_by_ssp_on": "Nil",
        "service_enrollment_date": "6-Feb-2014",
        "permanent_village": "House # 45, St#1G Bloch",
        "permanent_post_office": "Vehari",
        "permanent_thana": "Vehari",
        "permanent_tehsil": "Vehari",
        "base_location": "Islamabad",
        "email": "iftikhar.rao@flash.com"
    },
    {
        "fss_number": "98507",
        "designation": "AMM",
        "first_name": "Sajjad Hussain",
        "last_name": "Malik",
        "father_name": "Fateh Khan Malik",
        "total_salary": "37500",
        "retired_from": ["Civil"],
        "service_rank": "61101-1903864-7",
        "cnic": "61101-1903864-7",
        "date_of_birth": "18-Jun-1958",
        "cnic_expiry_date": "For Life",
        "original_doc_held": "SVC Card Org",
        "photo_on_document": "1 - Pic",
        "insurance": "Pension",
        "mobile_number": "0342-5499566",
        "particulars_verified_by_sho_on": "Nil",
        "particulars_verified_by_ssp_on": "Nil",
        "service_enrollment_date": "11-Sep-2017",
        "permanent_village": "House#131, Sofa Valley, Near Spring Valley",
        "permanent_post_office": "Gala Vela Road North Bani Gala",
        "permanent_thana": "Bani Gala",
        "permanent_tehsil": "Islamabad",
        "permanent_district": "Islamabad",
        "base_location": "Islamabad",
        "email": "sajjad.malik@flash.com"
    }
]


def login():
    """Login and get access token."""
    print("Logging in...")
    response = requests.post(
        LOGIN_URL,
        data={
            "username": USERNAME,
            "password": PASSWORD
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        print(f"✓ Login successful")
        return token
    else:
        print(f"✗ Login failed: {response.status_code}")
        print(response.text)
        return None


def create_employee(token, employee_data):
    """Create a single employee."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    response = requests.post(
        EMPLOYEES_URL,
        headers=headers,
        json=employee_data
    )
    
    return response


def main():
    """Main import function."""
    print("=" * 60)
    print("Employee Import Script")
    print("=" * 60)
    
    # Login
    token = login()
    if not token:
        print("Failed to login. Exiting.")
        return
    
    print(f"\nImporting {len(EMPLOYEES_DATA)} employees...")
    print("-" * 60)
    
    success_count = 0
    error_count = 0
    
    for idx, emp_data in enumerate(EMPLOYEES_DATA, 1):
        name = f"{emp_data.get('first_name', '')} {emp_data.get('last_name', '')}"
        print(f"\n[{idx}/{len(EMPLOYEES_DATA)}] Importing: {name}")
        
        response = create_employee(token, emp_data)
        
        if response.status_code in [200, 201]:
            result = response.json()
            employee_id = result.get("employee_id", "N/A")
            print(f"  ✓ Success - Employee ID: {employee_id}")
            success_count += 1
        else:
            print(f"  ✗ Failed - Status: {response.status_code}")
            try:
                error_detail = response.json()
                print(f"  Error: {error_detail}")
            except:
                print(f"  Error: {response.text[:200]}")
            error_count += 1
    
    print("\n" + "=" * 60)
    print("Import Summary")
    print("=" * 60)
    print(f"Total: {len(EMPLOYEES_DATA)}")
    print(f"Success: {success_count}")
    print(f"Failed: {error_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
