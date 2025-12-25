from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class EmployeeAdvanceDeduction(Base):
    __tablename__ = "employee_advance_deductions"

    id = Column(Integer, primary_key=True, index=True)
    employee_db_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=False)

    month = Column(String(7), index=True, nullable=False)  # YYYY-MM
    amount = Column(Float, nullable=False, default=0.0)
    note = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("employee_db_id", "month", name="uq_employee_advance_deduction_employee_month"),
    )
