"""API routes package initialization."""

from fastapi import APIRouter
from app.api.routes import (
    auth,
    admin_rbac,
    users,
    vehicles,
    vehicle_documents,
    vehicle_images,
    fuel_entries,
    employees,
    employees2,
    employee_documents,
    employee_warnings,
    attendance,
    leave_periods,
    payroll,
    payroll2,
    vehicle_assignments,
    vehicle_maintenance,
    inventory_assignments,
    client_management,
    general_inventory,
    restricted_inventory,
    advances,
    exports_accounts,
    finance,
    expenses,
    upload,
    bulk_operations,
    analytics,
)

api_router = APIRouter()

# Include routers
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(admin_rbac.router, prefix="/admin", tags=["Admin"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(vehicles.router, prefix="/vehicles", tags=["Vehicles"])
api_router.include_router(vehicle_documents.router, prefix="/vehicles", tags=["Vehicle Documents"])
api_router.include_router(vehicle_images.router, prefix="/vehicles", tags=["Vehicle Images"])
api_router.include_router(fuel_entries.router, prefix="/fuel-entries", tags=["Fuel & Mileage"])
if hasattr(employees, "router"):
    api_router.include_router(employees.router, prefix="/employees", tags=["Employees"])
api_router.include_router(employees2.router, prefix="/employees2", tags=["Employees2"])
api_router.include_router(employee_documents.router, prefix="/employees", tags=["Employee Documents"])
api_router.include_router(employee_warnings.router, prefix="/employees", tags=["Employee Warnings"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
api_router.include_router(leave_periods.router, prefix="/leave-periods", tags=["Leave Periods"])
api_router.include_router(payroll.router, prefix="/payroll", tags=["Payroll"])
api_router.include_router(payroll2.router, prefix="/payroll2", tags=["Payroll2"])
api_router.include_router(
    vehicle_assignments.router,
    prefix="/vehicle-assignments",
    tags=["Vehicle Assignments"],
)
api_router.include_router(
    vehicle_maintenance.router,
    prefix="/vehicle-maintenance",
    tags=["Vehicle Maintenance"],
)
api_router.include_router(
    inventory_assignments.router,
    prefix="/inventory-assignments",
    tags=["Inventory Assignments"],
)
api_router.include_router(
    general_inventory.router,
    prefix="/general-inventory",
    tags=["General Inventory"],
)
api_router.include_router(
    client_management.router,
    prefix="/client-management",
    tags=["Client & Contracts"],
)
api_router.include_router(
    restricted_inventory.router,
    prefix="/restricted-inventory",
    tags=["Weapons & Restrict"],
)
api_router.include_router(
    advances.router,
    prefix="/advances",
    tags=["Accounts & Advances"],
)

api_router.include_router(
    exports_accounts.router,
    prefix="/exports",
    tags=["Exports"],
)

api_router.include_router(
    finance.router,
    prefix="/finance",
    tags=["Finance"],
)

api_router.include_router(
    expenses.router,
    prefix="/expenses",
    tags=["Expenses"],
)

api_router.include_router(
    upload.router,
    prefix="",
    tags=["Upload"],
)

api_router.include_router(
    bulk_operations.router,
    prefix="/bulk",
    tags=["Bulk Operations"],
)

api_router.include_router(
    analytics.router,
    prefix="/analytics",
    tags=["Analytics"],
)
