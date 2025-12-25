from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class PayrollSheetEntryBase(BaseModel):
    employee_db_id: int
    from_date: date
    to_date: date

    pre_days_override: int | None = None
    cur_days_override: int | None = None

    leave_encashment_days: int = 0

    allow_other: float = 0.0

    eobi: float = 0.0
    tax: float = 0.0

    fine_adv_extra: float = 0.0

    remarks: str | None = Field(None, max_length=500)
    bank_cash: str | None = Field(None, max_length=50)


class PayrollSheetEntryUpsert(PayrollSheetEntryBase):
    pass


class PayrollSheetEntryOut(PayrollSheetEntryBase):
    id: int
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class PayrollSheetEntryBulkUpsert(BaseModel):
    from_date: date
    to_date: date
    entries: list[PayrollSheetEntryUpsert]
