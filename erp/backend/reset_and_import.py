"""Delete all employees and import fresh from Google Sheets."""
import requests
from sqlalchemy import text
from app.core.database import engine

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
IMPORT_URL = f"{BASE_URL}/api/employees/import/google-sheet"

GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1NKy_gYz-fzghifV8RoCiYVUUYMTiq2FFIzJb8WwsPHI/export?format=csv&gid=304958374"

def delete_all_employees():
    """Delete all employees from database."""
    print("=" * 80)
    print("DELETING ALL EMPLOYEES")
    print("=" * 80)
    
    with engine.begin() as conn:
        # Delete related records first
        conn.execute(text("DELETE FROM employee_warnings"))
        conn.execute(text("DELETE FROM employee_documents"))
        conn.execute(text("DELETE FROM attendance_records"))
        conn.execute(text("DELETE FROM payroll_payment_status"))
        conn.execute(text("DELETE FROM payroll_sheet_entries"))
        conn.execute(text("DELETE FROM employee_advances"))
        conn.execute(text("DELETE FROM employee_advance_deductions"))
        conn.execute(text("DELETE FROM general_item_employee_balances"))
        conn.execute(text("DELETE FROM restricted_item_employee_balances"))
        conn.execute(text("DELETE FROM client_site_guard_allocations"))
        conn.execute(text("DELETE FROM vehicle_assignments"))
        
        # Delete employees
        result = conn.execute(text("DELETE FROM employees"))
        
        # Reset auto-increment (if table exists)
        try:
            conn.execute(text("DELETE FROM sqlite_sequence WHERE name='employees'"))
        except:
            pass
    
    print("✓ All employees deleted\n")

def login():
    response = requests.post(LOGIN_URL, data={"username": "superadmin", "password": "SuperAdmin@123"})
    if response.status_code == 200:
        return response.json().get("access_token")
    return None

def import_all():
    """Import all employees from Google Sheets."""
    print("=" * 80)
    print("IMPORTING ALL EMPLOYEES FROM GOOGLE SHEETS")
    print("=" * 80)
    
    token = login()
    if not token:
        print("✗ Login failed")
        return
    
    print("✓ Logged in\n")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print("Starting import...")
    response = requests.post(
        IMPORT_URL,
        headers=headers,
        params={"url": GOOGLE_SHEET_URL, "mode": "import"},
        timeout=300
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"\n✓ Import complete!")
        print(f"  Total rows processed: {result.get('rows', 0)}")
        print(f"  Employees created: {result.get('created', 0)}")
        print(f"  Skipped (duplicates): {result.get('skipped', 0)}")
        print(f"  Errors: {len(result.get('errors', []))}")
        
        if result.get('errors'):
            print(f"\n  First 10 errors:")
            for err in result.get('errors', [])[:10]:
                print(f"    - {err[:150]}")
            if len(result.get('errors', [])) > 10:
                print(f"    ... and {len(result.get('errors', [])) - 10} more errors")
        
        if result.get('created_employee_ids'):
            print(f"\n  Sample employee IDs created:")
            for emp_id in result.get('created_employee_ids', [])[:10]:
                print(f"    - {emp_id}")
            if len(result.get('created_employee_ids', [])) > 10:
                print(f"    ... and {len(result.get('created_employee_ids', [])) - 10} more")
    else:
        print(f"\n✗ Import failed: {response.status_code}")
        print(f"  {response.text[:500]}")
    
    print("\n" + "=" * 80)

def verify_count():
    """Verify employee count."""
    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM employees"))
        count = result.fetchone()[0]
        print(f"\n✓ Total employees in database: {count}")

if __name__ == "__main__":
    print("\n")
    delete_all_employees()
    import_all()
    verify_count()
    print("\n")
