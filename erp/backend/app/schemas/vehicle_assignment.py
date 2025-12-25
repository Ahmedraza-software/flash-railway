"""Vehicle assignment schemas for API serialization."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


class VehicleAssignmentBase(BaseModel):
    """Base schema for a vehicle assignment."""

    vehicle_id: str
    employee_ids: List[str]
    route_stops: Optional[List[str]] = None
    route_from: Optional[str] = None
    route_to: Optional[str] = None
    assignment_date: Optional[date] = None
    notes: Optional[str] = None


class VehicleAssignmentCreate(VehicleAssignmentBase):
    """Schema for creating a vehicle assignment."""

    pass


class VehicleAssignmentUpdate(BaseModel):
    """Schema for updating a vehicle assignment."""

    vehicle_id: Optional[str] = None
    employee_ids: Optional[List[str]] = None
    route_stops: Optional[List[str]] = None
    route_from: Optional[str] = None
    route_to: Optional[str] = None
    assignment_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    distance_km: Optional[float] = None
    rate_per_km: Optional[float] = None
    amount: Optional[float] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class VehicleAssignmentResponse(VehicleAssignmentBase):
    """Schema returned from the API for an assignment."""

    id: int
    status: str
    distance_km: Optional[float] = None
    rate_per_km: Optional[float] = None
    amount: Optional[float] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

