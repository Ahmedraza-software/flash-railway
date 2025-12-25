from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class GeneralItemTransaction(Base):
    __tablename__ = "general_item_transactions"

    id = Column(Integer, primary_key=True, index=True)

    item_code = Column(String(50), ForeignKey("general_items.item_code"), index=True, nullable=False)
    employee_id = Column(String(50), ForeignKey("employees.employee_id"), index=True, nullable=True)

    action = Column(String(30), nullable=False)  # ISSUE|RETURN|LOST|DAMAGED|ADJUST

    quantity = Column(Float, nullable=True)

    condition_note = Column(String(120), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
