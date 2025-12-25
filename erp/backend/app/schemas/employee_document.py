from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class EmployeeDocumentOut(BaseModel):
    id: int
    employee_db_id: int
    name: str
    filename: str
    url: str
    mime_type: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
