from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class LeavePeriodBase(BaseModel):
    employee_id: str = Field(..., min_length=1)
    from_date: date
    to_date: date
    leave_type: str = Field("paid")
    reason: Optional[str] = None


class LeavePeriodCreate(LeavePeriodBase):
    pass


class LeavePeriodUpdate(BaseModel):
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    leave_type: Optional[str] = None
    reason: Optional[str] = None


class LeavePeriodOut(LeavePeriodBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LeavePeriodAlert(BaseModel):
    leave_period_id: int
    employee_id: str
    from_date: date
    to_date: date
    leave_type: str
    reason: Optional[str] = None
    last_day: date
    message: str
