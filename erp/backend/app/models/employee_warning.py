from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class EmployeeWarning(Base):
    __tablename__ = "employee_warnings"

    id = Column(Integer, primary_key=True, index=True)
    employee_db_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=False)
    warning_number = Column(String(100), nullable=False)

    found_with = Column(Text)
    notice_text = Column(Text)
    supervisor_signature = Column(String(255))
    supervisor_signature_date = Column(String(50))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
