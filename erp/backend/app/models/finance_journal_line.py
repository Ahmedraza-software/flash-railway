from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, Numeric, String, event
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class FinanceJournalLine(Base):
    __tablename__ = "finance_journal_lines"

    __table_args__ = (
        CheckConstraint("debit >= 0", name="ck_fin_journal_line_debit_nonneg"),
        CheckConstraint("credit >= 0", name="ck_fin_journal_line_credit_nonneg"),
        CheckConstraint("NOT (debit > 0 AND credit > 0)", name="ck_fin_journal_line_not_both"),
        CheckConstraint("(debit > 0) OR (credit > 0)", name="ck_fin_journal_line_one_side"),
    )

    id = Column(Integer, primary_key=True, index=True)

    entry_id = Column(Integer, ForeignKey("finance_journal_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("finance_accounts.id"), nullable=False, index=True)

    description = Column(String(500), nullable=True)

    debit = Column(Numeric(14, 2), nullable=False, default=0)
    credit = Column(Numeric(14, 2), nullable=False, default=0)

    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    entry = relationship("FinanceJournalEntry", back_populates="lines")
    account = relationship("FinanceAccount", back_populates="journal_lines")
    employee = relationship("Employee")


@event.listens_for(FinanceJournalLine, "before_update")
def _prevent_posted_line_update(mapper, connection, target):
    if getattr(getattr(target, "entry", None), "status", None) == "POSTED":
        raise ValueError("Posted journal entry lines cannot be modified")


@event.listens_for(FinanceJournalLine, "before_delete")
def _prevent_posted_line_delete(mapper, connection, target):
    if getattr(getattr(target, "entry", None), "status", None) == "POSTED":
        raise ValueError("Posted journal entry lines cannot be deleted")
