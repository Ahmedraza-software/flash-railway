from sqlalchemy import Column, Integer, String, Date, DateTime, UniqueConstraint, Float
from sqlalchemy.sql import func

from app.core.database import Base


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, index=True, nullable=False)
    date = Column(Date, index=True, nullable=False)
    status = Column(String, nullable=False, default="unmarked")
    note = Column(String)

    # Overtime fields (used when status is present)
    overtime_minutes = Column(Integer)
    overtime_rate = Column(Float)

    # Late fields (used when status is late)
    late_minutes = Column(Integer)
    late_deduction = Column(Float)

    # Leave fields (used when status is leave)
    leave_type = Column(String)

    fine_amount = Column(Float)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("employee_id", "date", name="uq_attendance_employee_date"),)
