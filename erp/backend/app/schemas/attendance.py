from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class AttendanceBase(BaseModel):
    employee_id: str = Field(..., min_length=1)
    date: date
    status: str = Field(..., min_length=1)
    note: Optional[str] = None
    overtime_minutes: Optional[int] = None
    overtime_rate: Optional[float] = None
    late_minutes: Optional[int] = None
    late_deduction: Optional[float] = None
    leave_type: Optional[str] = None
    fine_amount: Optional[float] = None


class AttendanceUpsert(BaseModel):
    employee_id: str = Field(..., min_length=1)
    status: str = Field(..., min_length=1)
    note: Optional[str] = None
    overtime_minutes: Optional[int] = None
    overtime_rate: Optional[float] = None
    late_minutes: Optional[int] = None
    late_deduction: Optional[float] = None
    leave_type: Optional[str] = None
    fine_amount: Optional[float] = None


class AttendanceBulkUpsert(BaseModel):
    date: date
    records: List[AttendanceUpsert]


class AttendanceRecordOut(AttendanceBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AttendanceList(BaseModel):
    date: date
    records: List[AttendanceRecordOut]

    class Config:
        from_attributes = True
