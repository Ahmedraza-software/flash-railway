from sqlalchemy import Column, Date, DateTime, Float, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class FuelEntry(Base):
    __tablename__ = "fuel_entries"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(String(50), index=True, nullable=False)
    entry_date = Column(Date, nullable=False)

    fuel_type = Column(String(30), nullable=True)
    liters = Column(Float, nullable=False)
    price_per_liter = Column(Float, nullable=True)
    total_cost = Column(Float, nullable=True)

    odometer_km = Column(Integer, nullable=True)
    vendor = Column(String(200), nullable=True)
    location = Column(String(200), nullable=True)
    notes = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
