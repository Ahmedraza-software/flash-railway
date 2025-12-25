from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class RestrictedItemTransaction(Base):
    __tablename__ = "restricted_item_transactions"

    id = Column(Integer, primary_key=True, index=True)

    item_code = Column(String(50), ForeignKey("restricted_items.item_code"), index=True, nullable=False)
    employee_id = Column(String(50), ForeignKey("employees.employee_id"), index=True, nullable=True)
    serial_unit_id = Column(Integer, ForeignKey("restricted_item_serial_units.id"), index=True, nullable=True)

    action = Column(
        String(30),
        nullable=False,
    )  # ISSUE|RETURN|LOST|DAMAGED|MAINTENANCE|CLEANING|ADJUST

    quantity = Column(Float, nullable=True)

    condition_note = Column(String(120), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
