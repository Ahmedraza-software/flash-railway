"""Schemas package initialization."""

from app.schemas.user import (
    User,
    UserCreate,
    UserUpdate,
    UserInDB,
    Token,
    TokenData,
)
from app.schemas.vehicle import (
    VehicleBase,
    VehicleCreate,
    VehicleUpdate,
    VehicleResponse,
)
from app.schemas.vehicle_image import VehicleImageOut
from app.schemas.vehicle_maintenance import VehicleMaintenanceCreate, VehicleMaintenanceResponse, VehicleMaintenanceUpdate
from app.schemas.employee_document import EmployeeDocumentOut

__all__ = [
    "User",
    "UserCreate",
    "UserUpdate",
    "UserInDB",
    "Token",
    "TokenData",
    "VehicleBase",
    "VehicleCreate",
    "VehicleUpdate",
    "VehicleResponse",
]
