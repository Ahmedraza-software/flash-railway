# Employee Data Import Instructions

## Quick Start

### Step 1: Start the Backend
```bash
cd erp/backend
python -m uvicorn app.main:app --reload
```

### Step 2: Run the Import Script
```bash
python import_complete_staff_data.py
```

## What the Script Does

The import script will:
1. Login to the system as superadmin
2. Parse each employee record
3. Create employee entries via the API
4. Show progress and results

## Data Format

Your employee data has been structured with these key fields:
- FSS Number (Employee ID)
- Name (split into first/last)
- Father's Name
- Salary
- Designation/Rank
- CNIC and expiry
- Date of Birth
- Contact numbers
- Address (Village, Post Office, Thana, Tehsil, District)
- Duty Location
- Service details (Unit, Rank, Enrollment dates)

## Customizing the Import

To add all your 500+ employees:

1. Open `import_complete_staff_data.py`
2. Find the `EMPLOYEES = [...]` section
3. Add your employee dictionaries following this format:

```python
{
    "fss": "Employee FSS Number",
    "designation": "Guard/Supervisor/etc",
    "name": "Full Name",
    "father": "Father's Name",
    "salary": "30000",
    "unit": "Army/Civil/etc",
    "rank": "Rank if applicable",
    "cnic": "XXXXX-XXXXXXX-X",
    "dob": "DD-Mon-YYYY",
    "expiry": "DD-Mon-YYYY",
    "blood_group": "A+/B+/etc",
    "mobile": "03XX-XXXXXXX",
    "home": "Contact number",
    "enrolled": "DD-Mon-YYYY",
    "re_enrolled": "DD-Mon-YYYY",
    "village": "Village name",
    "po": "Post Office",
    "thana": "Thana",
    "tehsil": "Tehsil",
    "district": "District",
    "location": "Duty Location"
},
```

## Alternative: Direct Database Import

If you prefer to import directly to the database (faster for large datasets):

```bash
python import_direct_to_db.py
```

This bypasses the API and writes directly to the database.

## Troubleshooting

### Backend not running
Error: "Login failed"
Solution: Start the backend first

### Duplicate employees
Error: "Employee already exists"
Solution: The script skips duplicates automatically

### Missing fields
Some fields are optional. The script handles missing data gracefully.

## Verification

After import, verify the data:

```bash
python verify_import.py
```

This will show:
- Total employees imported
- Any missing critical fields
- Data quality issues
