from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id = Column(Integer, primary_key=True, index=True)
    employee_db_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=False)
    name = Column(String(150), nullable=False)
    filename = Column(String(255), nullable=False)
    path = Column(String(500), nullable=False)
    mime_type = Column(String(120), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
