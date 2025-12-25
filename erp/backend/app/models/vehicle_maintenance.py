"""Vehicle maintenance model for database."""

from sqlalchemy import Column, Integer, String, Date, DateTime, Float
from sqlalchemy.sql import func

from app.core.database import Base


class VehicleMaintenance(Base):
    """Vehicle maintenance log entry linking a vehicle and an employee."""

    __tablename__ = "vehicle_maintenance"

    id = Column(Integer, primary_key=True, index=True)
    # Reference Vehicle.vehicle_id (string ID like VEH-0001)
    vehicle_id = Column(String(50), index=True, nullable=False)
    # Reference Employee.employee_id (string ID like SEC-0001)
    employee_id = Column(String, index=True, nullable=True)
    # Short description of the work done
    description = Column(String(255), nullable=True)
    # When the maintenance was performed
    maintenance_date = Column(Date, nullable=False)
    # Optional cost of the job
    cost = Column(Float, nullable=True)
    # Optional odometer reading in kilometers
    odometer_km = Column(Integer, nullable=True)
    # Optional external workshop / vendor
    service_vendor = Column(String(200), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"<VehicleMaintenance {self.vehicle_id} {self.maintenance_date}>"
