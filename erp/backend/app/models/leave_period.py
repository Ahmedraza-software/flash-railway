from sqlalchemy import Column, Date, DateTime, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class LeavePeriod(Base):
    __tablename__ = "leave_periods"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, index=True, nullable=False)

    from_date = Column(Date, index=True, nullable=False)
    to_date = Column(Date, index=True, nullable=False)

    leave_type = Column(String, nullable=False, default="paid")
    reason = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
