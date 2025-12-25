from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class RestrictedItemEmployeeBalance(Base):
    __tablename__ = "restricted_item_employee_balances"

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(String(50), ForeignKey("employees.employee_id"), index=True, nullable=False)
    item_code = Column(String(50), ForeignKey("restricted_items.item_code"), index=True, nullable=False)

    quantity_issued = Column(Float, nullable=False, default=0.0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
