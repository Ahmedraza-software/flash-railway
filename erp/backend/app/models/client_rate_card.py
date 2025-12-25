from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class ClientRateCard(Base):
    __tablename__ = "client_rate_cards"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True, nullable=False)

    guard_type = Column(String(50), nullable=False)

    rate_per_shift_day_month = Column(Float, nullable=False, default=0.0)
    overtime_rate = Column(Float, nullable=True)
    holiday_rate = Column(Float, nullable=True)

    effective_from = Column(Date, nullable=True)
    effective_to = Column(Date, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
