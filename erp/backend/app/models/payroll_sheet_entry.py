from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class PayrollSheetEntry(Base):
    __tablename__ = "payroll_sheet_entries"

    id = Column(Integer, primary_key=True, index=True)
    employee_db_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=False)

    from_date = Column(Date, index=True, nullable=False)
    to_date = Column(Date, index=True, nullable=False)

    # Optional overrides for split days (default computed from attendance)
    pre_days_override = Column(Integer, nullable=True)
    cur_days_override = Column(Integer, nullable=True)

    leave_encashment_days = Column(Integer, nullable=False, default=0)

    allow_other = Column(Float, nullable=False, default=0.0)

    eobi = Column(Float, nullable=False, default=0.0)
    tax = Column(Float, nullable=False, default=0.0)

    fine_adv_extra = Column(Float, nullable=False, default=0.0)

    remarks = Column(String(500), nullable=True)
    bank_cash = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "employee_db_id",
            "from_date",
            "to_date",
            name="uq_payroll_sheet_entries_employee_period",
        ),
    )
