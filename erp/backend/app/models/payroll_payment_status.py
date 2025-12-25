from sqlalchemy import Column, Float, ForeignKey, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class PayrollPaymentStatus(Base):
    __tablename__ = "payroll_payment_status"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(String(7), index=True, nullable=False)  # YYYY-MM
    employee_id = Column(String(50), index=True, nullable=False)
    employee_db_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=True)
    status = Column(String(10), nullable=False, default="unpaid")  # paid|unpaid

    # Snapshot net pay when status is set to paid (used for "total paid so far")
    net_pay_snapshot = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("month", "employee_id", name="uq_payroll_payment_month_employee"),
    )
