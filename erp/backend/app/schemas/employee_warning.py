from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class EmployeeWarningCreate(BaseModel):
    warning_number: str
    found_with: Optional[str] = None
    notice_text: Optional[str] = None
    supervisor_signature: Optional[str] = None
    supervisor_signature_date: Optional[str] = None


class EmployeeWarningOut(BaseModel):
    id: int
    employee_db_id: int
    warning_number: str
    found_with: Optional[str] = None
    notice_text: Optional[str] = None
    supervisor_signature: Optional[str] = None
    supervisor_signature_date: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
