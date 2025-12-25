"""
Bulk Employee Import Script
Imports employee data from the provided dataset into the database.
"""
import sys
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.employee import Employee
from app.core.database import Base

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)


def parse_date(date_str):
    """Parse various date formats to a standard format."""
    if not date_str or date_str.strip() == "" or date_str == "-":
        return None
    
    date_str = str(date_str).strip()
    
    # Try different date formats
    formats = [
        "%d-%b-%Y",  # 30-May-1987
        "%d-%b-%y",  # 30-May-87
        "%d/%m/%Y",  # 30/05/1987
        "%d/%m/%y",  # 30/05/87
        "%Y-%m-%d",  # 1987-05-30
        "%d-%m-%Y",  # 30-05-1987
        "%d-%m-%y",  # 30-05-87
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except:
            continue
    
    return date_str  # Return as-is if can't parse


def clean_string(value):
    """Clean and normalize string values."""
    if value is None or value == "" or value == "-" or value == "Nil":
        return None
    return str(value).strip()


def parse_salary(salary_str):
    """Parse salary string to remove commas and convert to string."""
    if not salary_str or salary_str == "-":
        return None
    salary_str = str(salary_str).replace(",", "").strip()
    return salary_str if salary_str else None


# Employee data - each tuple represents one employee
employees_data = [
