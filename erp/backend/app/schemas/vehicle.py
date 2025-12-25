"""Vehicle schemas for API serialization."""

from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class VehicleBase(BaseModel):
    """Base vehicle schema."""
    vehicle_id: str
    vehicle_type: str
    category: str
    make_model: str
    license_plate: str
    chassis_number: Optional[str] = None
    asset_tag: Optional[str] = None
    year: int
    status: str = "Active"
    compliance: str = "Compliant"
    government_permit: str


class VehicleCreate(VehicleBase):
    """Schema for creating a vehicle."""
    pass


class VehicleUpdate(BaseModel):
    """Schema for updating a vehicle."""
    vehicle_type: Optional[str] = None
    category: Optional[str] = None
    make_model: Optional[str] = None
    license_plate: Optional[str] = None
    chassis_number: Optional[str] = None
    asset_tag: Optional[str] = None
    year: Optional[int] = None
    status: Optional[str] = None
    compliance: Optional[str] = None
    government_permit: Optional[str] = None


class VehicleResponse(VehicleBase):
    """Schema for vehicle response."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
