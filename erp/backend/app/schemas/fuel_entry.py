from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class FuelEntryBase(BaseModel):
    vehicle_id: str
    entry_date: date

    fuel_type: Optional[str] = None
    liters: float
    price_per_liter: Optional[float] = None
    total_cost: Optional[float] = None

    odometer_km: Optional[int] = None
    vendor: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class FuelEntryCreate(FuelEntryBase):
    pass


class FuelEntryUpdate(BaseModel):
    vehicle_id: Optional[str] = None
    entry_date: Optional[date] = None

    fuel_type: Optional[str] = None
    liters: Optional[float] = None
    price_per_liter: Optional[float] = None
    total_cost: Optional[float] = None

    odometer_km: Optional[int] = None
    vendor: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class FuelEntryResponse(FuelEntryBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FuelMileageTip(BaseModel):
    level: str
    title: str
    detail: str


class FuelMileageSummary(BaseModel):
    vehicle_id: Optional[str] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None

    entries: int
    total_liters: float
    total_cost: float

    start_odometer_km: Optional[int] = None
    end_odometer_km: Optional[int] = None
    distance_km: Optional[float] = None

    avg_km_per_liter: Optional[float] = None
    avg_cost_per_km: Optional[float] = None

    tips: list[FuelMileageTip]
