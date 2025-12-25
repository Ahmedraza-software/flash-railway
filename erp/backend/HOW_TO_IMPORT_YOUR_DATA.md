# How to Import Your 500+ Employee Records

## Overview
You have employee data with these columns:
- FSS #, Rank, Name, Father's Name, Salary, Status, Unit, CNIC, DOB, CNIC Expiry
- Contact info (Mobile, Home), Address (Village, Post Office, Thana, Tehsil, District)
- Duty Location, Enrollment dates, and more

## Best Approach: Direct Database Import

For 500+ employees, the fastest method is direct database import.

### Step 1: Prepare Your Data

Open `import_direct_to_db.py` and add your employees to the `EMPLOYEES` list:

```python
EMPLOYEES = [
    {
        "fss": "7459",
        "designation": "Asst",
        "name": "Faisal Zaman",
        "father": "Taib Zaman",
        "salary": "39600",
        "unit": "Civil",
        "cnic": "61101-6827977-5",
        "dob": "30-May-1987",
        "expiry": "18-Jul-2028",
        "mobile": "334-5464450",
        "village": "St#18A, Jawa Road",
        "po": "Letrar Road",
        "thana": "Shehzad Town",
        "tehsil": "Islamabad",
        "district": "Islamabad",
        "location": "Islamabad",
        "enrolled": "5-May-2016"
    },
    # Add more employees...
]
```

### Step 2: Run the Import

```bash
cd erp/backend
python import_direct_to_db.py
```

The script will:
- ✓ Show progress for each employee
- ✓ Skip duplicates automatically
- ✓ Handle missing/optional fields
- ✓ Display final statistics

## Field Mapping Guide

Your spreadsheet columns map to database fields as follows:

| Your Column | Database Field | Required | Notes |
|-------------|----------------|----------|-------|
| FSS # | fss_number | No | Used to generate employee_id |
| Rank | designation | Yes | Job title/rank |
| Name | first_name, last_name | Yes | Auto-split |
| Father's Name | father_name | No | |
| Salary | basic_salary, total_salary | No | Remove commas |
| Unit | service_unit | No | Army/Civil/etc |
| Rank (service) | service_rank | No | Military rank |
| CNIC # | cnic | No | Format: XXXXX-XXXXXXX-X |
| DOB | date_of_birth | No | Various formats supported |
| CNIC Expr | cnic_expiry_date | No | |
| Blood Gp | blood_group | No | A+, B+, etc |
| Mob # | mobile_number | No | |
| Home Contact | home_contact_no | No | |
| Village | permanent_village | No | |
| Post Office | permanent_post_office | No | |
| Thana | permanent_thana | No | |
| Tehsil | permanent_tehsil | No | |
| District | permanent_district | No | |
| Duty Location | base_location | No | Current assignment |
| Enrolled | service_enrollment_date | No | |
| Re Enrolled | service_reenrollment_date | No | |
| EOBI # | eobi_no | No | |
| Insurance | insurance | No | |
| Social Security | social_security | No | |

## Date Format Support

The script automatically handles these date formats:
- `30-May-1987` (DD-Mon-YYYY)
- `30-May-87` (DD-Mon-YY)
- `30/05/1987` (DD/MM/YYYY)
- `1987-05-30` (YYYY-MM-DD)
- And more...

Special values like "For Life", "Life Time", "Exp" are handled as NULL.

## Quick Copy-Paste Template

For each employee in your data, create an entry like this:

```python
{
    "fss": "FSS_NUMBER",
    "designation": "RANK/DESIGNATION",
    "name": "FULL NAME",
    "father": "FATHER NAME",
    "salary": "SALARY_WITHOUT_COMMAS",
    "unit": "UNIT",
    "rank": "SERVICE_RANK",
    "cnic": "CNIC_NUMBER",
    "dob": "DATE_OF_BIRTH",
    "expiry": "CNIC_EXPIRY",
    "blood_group": "BLOOD_GROUP",
    "mobile": "MOBILE_NUMBER",
    "home": "HOME_CONTACT",
    "village": "VILLAGE",
    "po": "POST_OFFICE",
    "thana": "THANA",
    "tehsil": "TEHSIL",
    "district": "DISTRICT",
    "location": "DUTY_LOCATION",
    "enrolled": "ENROLLMENT_DATE",
    "re_enrolled": "RE_ENROLLMENT_DATE",
    "eobi": "EOBI_NUMBER",
    "insurance": "INSURANCE",
    "social_security": "SOCIAL_SECURITY"
},
```

## Example: Converting Your Data

Your row:
```
7459	Asst	Faisal Zaman	Taib Zaman	39,600	Civil	61101-6827977-5	30-May-1987	18-Jul-2028	...
```

Becomes:
```python
{
    "fss": "7459",
    "designation": "Asst",
    "name": "Faisal Zaman",
    "father": "Taib Zaman",
    "salary": "39600",
    "unit": "Civil",
    "cnic": "61101-6827977-5",
    "dob": "30-May-1987",
    "expiry": "18-Jul-2028",
    # ... add remaining fields
},
```

## Verification

After import, check the results:

```bash
python verify_import.py
```

Or query the database:

```bash
python inspect_db.py
```

## Troubleshooting

### "No module named 'app'"
Make sure you're in the `erp/backend` directory.

### "Table doesn't exist"
The script creates tables automatically. If you see this error, check database permissions.

### "Duplicate employee"
The script skips duplicates. This is normal if you run the import multiple times.

### Need to clear and re-import?
```bash
python reset_and_import.py
```

## Need Help?

The script provides detailed progress output:
- ✓ = Successfully imported
- ✗ = Failed (with reason)
- Final statistics show success/failure counts

All errors are logged for review.
