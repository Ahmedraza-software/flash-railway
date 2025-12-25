"""Import employees from the provided Google Sheet."""
import requests

BASE_URL = "http://127.0.0.1:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
IMPORT_URL = f"{BASE_URL}/api/employees/import/google-sheet"

# Your Google Sheet converted to CSV export URL
GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1sT2_SIsvmkinlvTPvE3D9R1ABj1sXqKI8I455dg8kjY/export?format=csv&gid=0"

def login():
    """Login and get access token."""
    response = requests.post(
        LOGIN_URL,
        data={"username": "superadmin", "password": "SuperAdmin@123"},
        timeout=30
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    else:
        print(f"Login failed: {response.status_code}")
        print(response.text)
        return None

def preview_import(token):
    """Preview what will be imported."""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(
        IMPORT_URL,
        headers=headers,
        params={"url": GOOGLE_SHEET_URL, "mode": "preview"},
        timeout=60
    )
    print("Preview Response:")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Total rows: {data.get('rows', 0)}")
        print(f"Created (valid): {data.get('created', 0)}")
        print(f"Skipped: {data.get('skipped', 0)}")
        if data.get('errors'):
            print("Errors:")
            for err in data['errors'][:5]:
                print(f"  - {err}")
        return data.get('created', 0) > 0 or data.get('rows', 0) > 0
    else:
        print(response.text)
    return False

def do_import(token):
    """Actually import the employees."""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(
        IMPORT_URL,
        headers=headers,
        params={"url": GOOGLE_SHEET_URL, "mode": "import"},
        timeout=300
    )
    print("\nImport Response:")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Imported: {data.get('imported', 0)} employees")
        print(f"Skipped: {data.get('skipped', 0)}")
        if data.get('errors'):
            print("Errors:")
            for err in data['errors'][:10]:
                print(f"  - {err}")
    else:
        print(response.text)

if __name__ == "__main__":
    print("=" * 60)
    print("IMPORTING EMPLOYEES FROM GOOGLE SHEET")
    print("=" * 60)
    
    token = login()
    if not token:
        print("Failed to login!")
        exit(1)
    
    print("\nLogged in successfully!")
    print("\n--- PREVIEW ---")
    if preview_import(token):
        print("\n--- IMPORTING ---")
        do_import(token)
    else:
        print("\nPreview failed, not importing.")
