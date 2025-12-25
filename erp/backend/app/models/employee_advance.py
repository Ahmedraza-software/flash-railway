from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class EmployeeAdvance(Base):
    __tablename__ = "employee_advances"

    id = Column(Integer, primary_key=True, index=True)
    employee_db_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=False)

    amount = Column(Float, nullable=False, default=0.0)
    note = Column(String(500), nullable=True)
    advance_date = Column(Date, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
