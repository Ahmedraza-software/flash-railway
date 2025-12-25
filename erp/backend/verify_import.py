"""Verify imported employee data."""
from app.core.database import engine
from sqlalchemy import text

with engine.connect() as con:
    result = con.execute(text("""
        SELECT employee_id, first_name, last_name, fss_number, eobi_no, 
               social_security, verified_by_khidmat_markaz, card_number, date_of_entry
        FROM employees 
        ORDER BY id DESC
        LIMIT 5
    """))
    
    print("=" * 100)
    print("RECENTLY IMPORTED EMPLOYEES - FIELD VERIFICATION")
    print("=" * 100)
    
    for r in result.fetchall():
        print(f"\nEmployee ID: {r[0]}")
        print(f"  Name: {r[1]} {r[2]}")
        print(f"  FSS Number: {r[3]}")
        print(f"  EOBI Number: {r[4]}")
        print(f"  Social Security: {r[5]}")
        print(f"  Verified by Khidmat Markaz: {r[6]}")
        print(f"  Card Number: {r[7]}")
        print(f"  Date of Entry: {r[8]}")
    
    print("\n" + "=" * 100)
