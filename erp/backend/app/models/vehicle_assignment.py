"""Vehicle assignment model for routes and employee links."""

from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Float
from sqlalchemy.sql import func

from app.core.database import Base


class VehicleAssignment(Base):
    """Vehicle assignment linking vehicles, employees and routes."""

    __tablename__ = "vehicle_assignments"

    id = Column(Integer, primary_key=True, index=True)
    # Reference Vehicle.vehicle_id (string ID like VEH-0123)
    vehicle_id = Column(String(50), index=True, nullable=False)
    # JSON string list of employee_ids (e.g. ["SEC-0001", "SEC-0002"])
    employee_ids = Column(Text, nullable=False)
    route_stops = Column(Text, nullable=True)
    route_from = Column(String(200), nullable=False)
    route_to = Column(String(200), nullable=False)
    assignment_date = Column(Date, nullable=True)
    status = Column(String(30), nullable=False, server_default="Incomplete")
    distance_km = Column(Float, nullable=True)
    rate_per_km = Column(Float, nullable=True)
    amount = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    # When the route/assignment effectively starts
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    # When the route/assignment is marked complete
    end_time = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"<VehicleAssignment {self.vehicle_id} {self.route_from}->{self.route_to}>"
