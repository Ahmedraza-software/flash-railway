"""Vehicle model for database."""

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Vehicle(Base):
    """Vehicle model."""
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(String(50), unique=True, index=True, nullable=False)
    vehicle_type = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)
    make_model = Column(String(200), nullable=False)
    license_plate = Column(String(50), nullable=False)
    chassis_number = Column(String(100), nullable=True)
    asset_tag = Column(String(50), nullable=True)
    year = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False, default="Active")
    compliance = Column(String(50), nullable=False, default="Compliant")
    government_permit = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<Vehicle {self.vehicle_id}>"
