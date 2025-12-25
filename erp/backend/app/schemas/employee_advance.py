from datetime import date, datetime

from pydantic import BaseModel, Field


class EmployeeAdvanceCreate(BaseModel):
    employee_db_id: int
    amount: float = Field(..., gt=0)
    note: str | None = Field(None, max_length=500)
    advance_date: date


class EmployeeAdvanceOut(BaseModel):
    id: int
    employee_db_id: int
    amount: float
    note: str | None = None
    advance_date: date
    created_at: datetime

    class Config:
        from_attributes = True


class EmployeeAdvanceDeductionUpsert(BaseModel):
    employee_db_id: int
    month: str = Field(..., min_length=7, max_length=7)
    amount: float = Field(..., gt=0)
    note: str | None = Field(None, max_length=500)


class EmployeeAdvanceDeductionOut(BaseModel):
    id: int
    employee_db_id: int
    month: str
    amount: float
    note: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class EmployeeAdvanceSummary(BaseModel):
    employee_db_id: int
    total_advanced: float
    total_deducted: float
    balance: float
    total_paid_so_far: float


class EmployeeAdvancesMonthSummary(BaseModel):
    month: str
    total_advanced: float
    by_employee_db_id: dict[int, float]


class EmployeeAdvanceMonthRow(BaseModel):
    id: int
    employee_db_id: int
    employee_id: str
    employee_name: str
    amount: float
    note: str | None = None
    advance_date: date
    created_at: datetime

    class Config:
        from_attributes = True
