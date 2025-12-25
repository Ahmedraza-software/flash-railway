from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class ClientSiteGuardAllocation(Base):
    __tablename__ = "client_site_guard_allocations"

    id = Column(Integer, primary_key=True, index=True)

    site_id = Column(Integer, ForeignKey("client_sites.id"), index=True, nullable=True)
    contract_id = Column(Integer, ForeignKey("client_contracts.id"), index=True, nullable=True)
    requirement_id = Column(Integer, ForeignKey("client_guard_requirements.id"), index=True, nullable=True)

    employee_db_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=False)

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    status = Column(String(30), nullable=False, default="Allocated")  # Allocated/Released/Active

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
