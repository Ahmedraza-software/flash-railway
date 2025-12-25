from datetime import date as date_type
from typing import Optional

from pydantic import BaseModel


class VehicleAssignmentAggRow(BaseModel):
    vehicle_id: str
    assignments: int
    total_km: float
    total_amount: float
    avg_rate_per_km: Optional[float] = None
    cost_per_km: Optional[float] = None


class VehicleAssignmentAnalyticsResponse(BaseModel):
    period: str
    date: Optional[date_type] = None
    month: Optional[str] = None
    year: Optional[int] = None
    vehicle_id: Optional[str] = None

    rows: list[VehicleAssignmentAggRow]

    best_cost_per_km: list[VehicleAssignmentAggRow]
    worst_cost_per_km: list[VehicleAssignmentAggRow]
