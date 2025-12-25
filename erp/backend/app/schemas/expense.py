from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class ExpenseBase(BaseModel):
    expense_date: date
    category: str = Field(..., max_length=100)
    description: str = Field(..., max_length=500)
    amount: Decimal = Field(..., gt=0)
    vendor_name: Optional[str] = Field(None, max_length=255)
    receipt_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    attachment_url: Optional[str] = Field(None, max_length=500)
    employee_id: Optional[int] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    expense_date: Optional[date] = None
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount: Optional[Decimal] = Field(None, gt=0)
    vendor_name: Optional[str] = Field(None, max_length=255)
    receipt_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    attachment_url: Optional[str] = Field(None, max_length=500)
    employee_id: Optional[int] = None
    status: Optional[str] = Field(None, max_length=20)


class Expense(ExpenseBase):
    id: int
    status: str
    account_id: Optional[int] = None
    journal_entry_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExpenseSummary(BaseModel):
    total_expenses: Decimal
    pending_expenses: Decimal
    approved_expenses: Decimal
    paid_expenses: Decimal
    expense_count: int
    categories: dict[str, Decimal]  # category -> total amount