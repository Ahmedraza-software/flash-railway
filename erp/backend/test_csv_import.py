"""Test CSV import from Google Sheets."""
import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
IMPORT_URL = f"{BASE_URL}/api/employees/import/google-sheet"

# Google Sheets CSV export URL
GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1NKy_gYz-fzghifV8RoCiYVUUYMTiq2FFIzJb8WwsPHI/export?format=csv&gid=304958374"

def login():
    response = requests.post(LOGIN_URL, data={"username": "superadmin", "password": "SuperAdmin@123"})
    if response.status_code == 200:
        return response.json().get("access_token")
    return None

def test_preview():
    token = login()
    if not token:
        print("✗ Login failed")
        return
    
    print("=" * 80)
    print("TESTING CSV IMPORT - PREVIEW MODE")
    print("=" * 80)
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(
        IMPORT_URL,
        headers=headers,
        params={"url": GOOGLE_SHEET_URL, "mode": "preview"}
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"\n✓ Preview successful!")
        print(f"  Total rows: {result.get('rows', 0)}")
        print(f"  New employees: {result.get('created', 0)}")
        print(f"  Skipped (duplicates): {result.get('skipped', 0)}")
        print(f"  Errors: {len(result.get('errors', []))}")
        
        if result.get('errors'):
            print(f"\n  First 5 errors:")
            for err in result.get('errors', [])[:5]:
                print(f"    - {err}")
    else:
        print(f"\n✗ Preview failed: {response.status_code}")
        print(f"  {response.text}")
    
    print("\n" + "=" * 80)

def test_import():
    token = login()
    if not token:
        print("✗ Login failed")
        return
    
    print("=" * 80)
    print("TESTING CSV IMPORT - IMPORT MODE")
    print("=" * 80)
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(
        IMPORT_URL,
        headers=headers,
        params={"url": GOOGLE_SHEET_URL, "mode": "import"}
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"\n✓ Import successful!")
        print(f"  Total rows: {result.get('rows', 0)}")
        print(f"  Created: {result.get('created', 0)}")
        print(f"  Skipped: {result.get('skipped', 0)}")
        print(f"  Errors: {len(result.get('errors', []))}")
        
        if result.get('created_employee_ids'):
            print(f"\n  Created employee IDs:")
            for emp_id in result.get('created_employee_ids', [])[:10]:
                print(f"    - {emp_id}")
            if len(result.get('created_employee_ids', [])) > 10:
                print(f"    ... and {len(result.get('created_employee_ids', [])) - 10} more")
        
        if result.get('errors'):
            print(f"\n  First 5 errors:")
            for err in result.get('errors', [])[:5]:
                print(f"    - {err}")
    else:
        print(f"\n✗ Import failed: {response.status_code}")
        print(f"  {response.text}")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    print("\n")
    test_preview()
    print("\n")
    
    # Run actual import
    test_import()
