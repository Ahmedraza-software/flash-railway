from datetime import date as date_type
from typing import Optional

from pydantic import BaseModel


class AssignmentEfficiencyRow(BaseModel):
    assignment_id: int
    assignment_date: Optional[date_type] = None

    vehicle_id: str
    employee_ids: list[str]

    route_from: Optional[str] = None
    route_to: Optional[str] = None

    distance_km: float
    amount: float
    rate_per_km: float
    cost_per_km: float

    vehicle_avg_cost_per_km: Optional[float] = None
    delta_vs_vehicle_avg: Optional[float] = None


class VehicleEfficiencySummaryRow(BaseModel):
    vehicle_id: str
    assignments: int
    total_km: float
    total_amount: float
    avg_km_per_trip: Optional[float] = None
    avg_cost_per_km: Optional[float] = None
    min_cost_per_km: Optional[float] = None
    max_cost_per_km: Optional[float] = None


class EfficiencyAlertRow(BaseModel):
    level: str
    title: str
    detail: str

    assignment_id: int
    assignment_date: Optional[date_type] = None
    vehicle_id: str
    employee_id: Optional[str] = None

    distance_km: float
    amount: float
    cost_per_km: float

    vehicle_avg_cost_per_km: Optional[float] = None
    employee_avg_cost_per_km: Optional[float] = None
    delta_vs_vehicle_avg: Optional[float] = None


class EmployeeEfficiencySummaryRow(BaseModel):
    employee_id: str
    assignments: int
    total_km: float
    total_amount: float
    avg_cost_per_km: Optional[float] = None
    expensive_assignments: int


class VehicleAssignmentEfficiencyResponse(BaseModel):
    period: str
    date: Optional[date_type] = None
    month: Optional[str] = None
    year: Optional[int] = None
    vehicle_id: Optional[str] = None

    # Overall
    assignments: int
    total_km: float
    total_amount: float
    avg_cost_per_km: Optional[float] = None

    # Per vehicle baseline
    vehicles: list[VehicleEfficiencySummaryRow]

    # Outliers
    expensive_assignments: list[AssignmentEfficiencyRow]
    efficient_assignments: list[AssignmentEfficiencyRow]

    # Employees / drivers leaderboard
    employees: list[EmployeeEfficiencySummaryRow]

    # Simple alerts for non-technical users
    alerts: list[EfficiencyAlertRow]
