from sqlalchemy import Column, Date, DateTime, Integer, String, event
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class FinanceJournalEntry(Base):
    __tablename__ = "finance_journal_entries"

    id = Column(Integer, primary_key=True, index=True)

    entry_no = Column(String(50), unique=True, nullable=False, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    memo = Column(String(500), nullable=True)

    source_type = Column(String(50), nullable=True, index=True)
    source_id = Column(String(50), nullable=True, index=True)

    status = Column(String(20), nullable=False, default="DRAFT", index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    posted_at = Column(DateTime(timezone=True), nullable=True)

    lines = relationship(
        "FinanceJournalLine",
        back_populates="entry",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


@event.listens_for(FinanceJournalEntry, "before_update")
def _prevent_posted_entry_update(mapper, connection, target):
    if getattr(target, "status", None) == "POSTED":
        raise ValueError("Posted journal entries cannot be modified")


@event.listens_for(FinanceJournalEntry, "before_delete")
def _prevent_posted_entry_delete(mapper, connection, target):
    if getattr(target, "status", None) == "POSTED":
        raise ValueError("Posted journal entries cannot be deleted")
