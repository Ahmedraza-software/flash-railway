"""Vehicle maintenance schemas for API serialization."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class VehicleMaintenanceBase(BaseModel):
    """Base schema for a vehicle maintenance record."""

    vehicle_id: str
    employee_id: Optional[str] = None
    description: Optional[str] = None
    maintenance_date: date
    cost: Optional[float] = None
    odometer_km: Optional[int] = None
    service_vendor: Optional[str] = None


class VehicleMaintenanceCreate(VehicleMaintenanceBase):
    """Schema for creating a maintenance record."""

    pass


class VehicleMaintenanceUpdate(BaseModel):
    """Schema for updating a maintenance record."""

    vehicle_id: Optional[str] = None
    employee_id: Optional[str] = None
    description: Optional[str] = None
    maintenance_date: Optional[date] = None
    cost: Optional[float] = None
    odometer_km: Optional[int] = None
    service_vendor: Optional[str] = None


class VehicleMaintenanceResponse(VehicleMaintenanceBase):
    """Schema returned from the API for a maintenance record."""

    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
