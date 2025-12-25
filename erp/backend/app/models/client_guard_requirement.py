from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class ClientGuardRequirement(Base):
    __tablename__ = "client_guard_requirements"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("client_sites.id"), index=True, nullable=False)

    guard_type = Column(String(50), nullable=False)  # Armed/Unarmed/Supervisor/Female Guard
    number_of_guards = Column(Integer, nullable=False, default=1)

    shift_type = Column(String(30), nullable=True)  # Day/Night/Rotational
    shift_start = Column(String(20), nullable=True)
    shift_end = Column(String(20), nullable=True)

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    preferred_language = Column(String(80), nullable=True)
    monthly_amount = Column(Float, nullable=True)

    weekly_off_rules = Column(String(200), nullable=True)
    special_instructions = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
