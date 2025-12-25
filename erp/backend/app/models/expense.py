from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

# Import to ensure model is registered before relationship resolution
from app.models.finance_account import FinanceAccount  # noqa: F401


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    
    # Basic expense information
    expense_date = Column(Date, nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)  # e.g., "Office Supplies", "Travel", "Utilities"
    description = Column(String(500), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    
    # Optional fields
    vendor_name = Column(String(255), nullable=True)
    receipt_number = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    attachment_url = Column(String(500), nullable=True)  # For file attachments
    
    # Finance integration
    account_id = Column(Integer, ForeignKey("finance_accounts.id"), nullable=True, index=True)
    journal_entry_id = Column(Integer, ForeignKey("finance_journal_entries.id"), nullable=True, index=True)
    
    # Employee who created/submitted the expense
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    
    # Status tracking
    status = Column(String(20), nullable=False, default="PENDING", index=True)  # PENDING, APPROVED, REJECTED, PAID
    is_active = Column(Boolean, nullable=False, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    account = relationship("FinanceAccount", foreign_keys=[account_id])
    employee = relationship("Employee", foreign_keys=[employee_id])