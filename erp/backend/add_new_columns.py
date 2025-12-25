"""Add new columns to employees table."""
from app.core.database import engine
from sqlalchemy import text

def add_columns():
    """Add missing columns to employees table."""
    columns_to_add = [
        ("verified_by_khidmat_markaz", "VARCHAR"),
        ("date_of_entry", "VARCHAR"),
        ("card_number", "VARCHAR"),
    ]
    
    with engine.begin() as conn:
        # Check existing columns
        result = conn.execute(text("PRAGMA table_info(employees)"))
        existing_columns = {row[1] for row in result.fetchall()}
        
        for col_name, col_type in columns_to_add:
            if col_name not in existing_columns:
                try:
                    conn.execute(text(f"ALTER TABLE employees ADD COLUMN {col_name} {col_type}"))
                    print(f"✓ Added column: {col_name}")
                except Exception as e:
                    print(f"✗ Failed to add {col_name}: {e}")
            else:
                print(f"- Column already exists: {col_name}")
    
    print("\n✓ Migration complete!")

if __name__ == "__main__":
    add_columns()
