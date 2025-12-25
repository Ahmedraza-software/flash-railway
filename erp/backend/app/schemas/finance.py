from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class FinanceAccountBase(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=255)
    account_type: str = Field(..., max_length=20)
    parent_id: Optional[int] = None
    is_system: bool = False
    is_active: bool = True


class FinanceAccountCreate(FinanceAccountBase):
    pass


class FinanceAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    account_type: Optional[str] = Field(None, max_length=20)
    parent_id: Optional[int] = None
    is_active: Optional[bool] = None


class FinanceAccount(FinanceAccountBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FinanceJournalLineBase(BaseModel):
    account_id: int
    description: Optional[str] = Field(None, max_length=500)
    debit: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    credit: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    employee_id: Optional[int] = None


class FinanceJournalLineCreate(FinanceJournalLineBase):
    pass


class FinanceJournalLine(FinanceJournalLineBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class FinanceJournalEntryBase(BaseModel):
    entry_date: date
    memo: Optional[str] = Field(None, max_length=500)
    source_type: Optional[str] = Field(None, max_length=50)
    source_id: Optional[str] = Field(None, max_length=50)


class FinanceJournalEntryCreate(FinanceJournalEntryBase):
    lines: List[FinanceJournalLineCreate] = Field(default_factory=list)


class FinanceJournalEntryUpdate(BaseModel):
    entry_date: Optional[date] = None
    memo: Optional[str] = Field(None, max_length=500)


class FinanceJournalEntry(FinanceJournalEntryBase):
    id: int
    entry_no: str
    status: str
    created_at: datetime
    posted_at: Optional[datetime] = None
    lines: List[FinanceJournalLine] = Field(default_factory=list)

    class Config:
        from_attributes = True
