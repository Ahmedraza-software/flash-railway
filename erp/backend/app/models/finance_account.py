from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class FinanceAccount(Base):
    __tablename__ = "finance_accounts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)

    # ASSET / LIABILITY / EQUITY / INCOME / EXPENSE
    account_type = Column(String(20), nullable=False, index=True)

    parent_id = Column(Integer, ForeignKey("finance_accounts.id"), nullable=True)

    is_system = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    parent = relationship("FinanceAccount", remote_side=[id], backref="children")

    # Use lazy loading to avoid circular import issues
    journal_lines = relationship("FinanceJournalLine", back_populates="account", lazy="dynamic")
