import os
import shutil

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine, Base
from app.core.security import get_password_hash
from app.api.routes import api_router
from app.models import (
    user,
    vehicle,
    vehicle_document,
    vehicle_image,
    fuel_entry,
    employee,
    employee_document,
    employee_warning,
    employee_warning_document,
    attendance,
    leave_period,
    vehicle_assignment,
    vehicle_maintenance,
    payroll_payment_status,
    payroll_sheet_entry,
    employee_advance,
    employee_advance_deduction,
    general_item,
    general_item_transaction,
    general_item_employee_balance,
    client,
    client_contact,
    client_address,
    client_site,
    client_contract,
    client_guard_requirement,
    client_site_guard_allocation,
    client_rate_card,
    client_invoice,
    client_document,
    restricted_item,
    restricted_item_image,
    restricted_item_serial_unit,
    restricted_item_transaction,
    restricted_item_employee_balance,
    finance_account,
    finance_journal_line,
    finance_journal_entry,
    expense,
    employee2,
)  # Import models to create tables

from app.models.rbac import Permission, Role
from app.models.user import User

# Create database tables
Base.metadata.create_all(bind=engine)


def _seed_rbac() -> None:
    permissions = {
        "employees:view": "View employees",
        "employees:create": "Create employees",
        "employees:update": "Update employees",
        "employees:delete": "Delete employees",
        "attendance:manage": "View and manage attendance",
        "payroll:view": "View payroll",
        "performance:view": "View performance dashboards",
        "clients:view": "View client management",
        "fleet:view": "View fleet module",
        "inventory:view": "View inventory module",
        "accounts:full": "Full access to accounts/finance/expenses/advances/exports",
        "rbac:admin": "Manage roles/permissions/users",
    }

    roles = {
        "SuperAdmin": {
            "description": "System super admin role",
            "is_system": True,
            "permissions": list(permissions.keys()),
        },
        "EmployeeEntry": {
            "description": "Can create employees",
            "is_system": True,
            "permissions": ["employees:create", "employees:view", "employees:update"],
        },
        "AttendanceManager": {
            "description": "Can view and manage attendance",
            "is_system": True,
            "permissions": ["attendance:manage", "employees:view"],
        },
        "HRPayrollViewer": {
            "description": "Can view attendance and payroll",
            "is_system": True,
            "permissions": ["attendance:manage", "payroll:view", "employees:view"],
        },
        "ClientsViewer": {
            "description": "Can view clients section",
            "is_system": True,
            "permissions": ["clients:view"],
        },
        "AccountsFull": {
            "description": "Full access to accounts section",
            "is_system": True,
            "permissions": ["accounts:full"],
        },
        "HRPayrollAccountsFull": {
            "description": "Attendance + Payroll + full accounts",
            "is_system": True,
            "permissions": ["attendance:manage", "payroll:view", "accounts:full", "employees:view"],
        },
    }

    users = {
        "superadmin": {
            "email": "superadmin@local.com",
            "full_name": "Super Admin",
            "password": "SuperAdmin@123",
            "is_superuser": True,
            "roles": ["SuperAdmin"],
        },
        "employee_entry": {
            "email": "employee_entry@local.com",
            "full_name": "Employee Entry",
            "password": "Employee@123",
            "is_superuser": False,
            "roles": ["EmployeeEntry"],
        },
        "attendance_manager": {
            "email": "attendance_manager@local.com",
            "full_name": "Attendance Manager",
            "password": "Attendance@123",
            "is_superuser": False,
            "roles": ["AttendanceManager"],
        },
        "hr_payroll": {
            "email": "hr_payroll@local.com",
            "full_name": "HR Payroll",
            "password": "HRPayroll@123",
            "is_superuser": False,
            "roles": ["HRPayrollViewer"],
        },
        "clients_view": {
            "email": "clients_view@local.com",
            "full_name": "Clients Viewer",
            "password": "Clients@123",
            "is_superuser": False,
            "roles": ["ClientsViewer"],
        },
        "accounts_full": {
            "email": "accounts_full@local.com",
            "full_name": "Accounts Full",
            "password": "Accounts@123",
            "is_superuser": False,
            "roles": ["AccountsFull"],
        },
        "hr_payroll_accounts": {
            "email": "hr_payroll_accounts@local.com",
            "full_name": "HR Payroll + Accounts",
            "password": "HRPayrollAccounts@123",
            "is_superuser": False,
            "roles": ["HRPayrollAccountsFull"],
        },
    }

    from sqlalchemy.orm import Session

    db = Session(bind=engine)
    try:
        for key, desc in permissions.items():
            exists = db.query(Permission).filter(Permission.key == key).first()
            if not exists:
                db.add(Permission(key=key, description=desc))
        db.commit()

        perm_by_key = {p.key: p for p in db.query(Permission).all()}
        for role_name, spec in roles.items():
            r = db.query(Role).filter(Role.name == role_name).first()
            if not r:
                r = Role(
                    name=role_name,
                    description=spec.get("description"),
                    is_system=bool(spec.get("is_system", False)),
                )
                db.add(r)
                db.flush()
            r.permissions = [perm_by_key[k] for k in spec.get("permissions", []) if k in perm_by_key]
        db.commit()

        role_by_name = {r.name: r for r in db.query(Role).all()}
        for username, spec in users.items():
            u = db.query(User).filter(User.username == username).first()
            if not u:
                u = User(
                    email=spec["email"],
                    username=username,
                    full_name=spec.get("full_name"),
                    hashed_password=get_password_hash(spec["password"]),
                    is_active=True,
                    is_superuser=bool(spec.get("is_superuser", False)),
                )
                db.add(u)
                db.flush()
            else:
                u.email = spec["email"]
                u.full_name = spec.get("full_name")
                u.is_superuser = bool(spec.get("is_superuser", False))
                u.is_active = True
            u.roles = [role_by_name[n] for n in spec.get("roles", []) if n in role_by_name]
        db.commit()
    finally:
        db.close()


_seed_rbac()


def _ensure_employee_columns_exist() -> None:
    employee_columns = {
        "agreement": "BOOLEAN DEFAULT 0",
        "police_clearance": "BOOLEAN DEFAULT 0",
        "fingerprint_check": "BOOLEAN DEFAULT 0",
        "background_screening": "BOOLEAN DEFAULT 0",
        "reference_verification": "BOOLEAN DEFAULT 0",
        "guard_card": "BOOLEAN DEFAULT 0",
        "guard_card_doc": "TEXT",
        "police_clearance_doc": "TEXT",
        "fingerprint_check_doc": "TEXT",
        "background_screening_doc": "TEXT",
        "reference_verification_doc": "TEXT",
        "total_salary": "VARCHAR",
        "account_type": "VARCHAR",
        "bank_accounts": "TEXT",
        "languages_spoken": "TEXT",
        "languages_proficiency": "TEXT",
        "height_cm": "INTEGER",
        "permanent_address": "TEXT",
        "temporary_address": "TEXT",
        "cnic": "VARCHAR",
        "cnic_expiry_date": "VARCHAR",
        "domicile": "VARCHAR",
        "personal_phone_number": "VARCHAR",
        "next_of_kin_cnic": "VARCHAR",
        "next_of_kin_mobile_number": "VARCHAR",
        "permanent_village": "VARCHAR",
        "permanent_post_office": "VARCHAR",
        "permanent_thana": "VARCHAR",
        "permanent_tehsil": "VARCHAR",
        "permanent_district": "VARCHAR",
        "present_village": "VARCHAR",
        "present_post_office": "VARCHAR",
        "present_thana": "VARCHAR",
        "present_tehsil": "VARCHAR",
        "present_district": "VARCHAR",
        "enrolled_as": "VARCHAR",
        "interviewed_by": "VARCHAR",
        "introduced_by": "VARCHAR",
        "retired_from": "TEXT",
        "service_unit": "VARCHAR",
        "service_rank": "VARCHAR",
        "service_enrollment_date": "VARCHAR",
        "service_reenrollment_date": "VARCHAR",
        "medical_category": "VARCHAR",
        "discharge_cause": "TEXT",
        "blood_group": "VARCHAR",
        "civil_education_type": "VARCHAR",
        "civil_education_detail": "VARCHAR",
        "sons_names": "TEXT",
        "daughters_names": "TEXT",
        "brothers_names": "TEXT",
        "sisters_names": "TEXT",
        "particulars_verified_by_sho_on": "VARCHAR",
        "particulars_verified_by_ssp_on": "VARCHAR",
        "police_khidmat_verification_on": "VARCHAR",
        "signature_recording_officer": "TEXT",
        "signature_individual": "TEXT",
        "fss_number": "VARCHAR",
        "fss_name": "VARCHAR",
        "fss_so": "VARCHAR",
        "original_doc_held": "TEXT",
        "documents_handed_over_to": "VARCHAR",
        "photo_on_document": "VARCHAR",
        "eobi_no": "VARCHAR",
        "insurance": "VARCHAR",
        "social_security": "VARCHAR",
        "home_contact_no": "VARCHAR",
        "police_training_letter_date": "VARCHAR",
        "vaccination_certificate": "VARCHAR",
        "volume_no": "VARCHAR",
        "payments": "TEXT",
        "fingerprint_attested_by": "VARCHAR",
    }

    with engine.begin() as conn:
        try:
            existing = set()
            if engine.dialect.name == "sqlite":
                rows = conn.execute(text("PRAGMA table_info(employees)")).fetchall()
                existing = {r[1] for r in rows}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='employees'"
                    )
                ).fetchall()
                existing = {r[0] for r in rows}

            for col, ddl in employee_columns.items():
                if col in existing:
                    continue
                conn.execute(text(f"ALTER TABLE employees ADD COLUMN {col} {ddl}"))
        except Exception:
            # Best-effort migration to avoid crashing the app on startup.
            pass


_ensure_employee_columns_exist()


def _ensure_employee_warning_columns_exist() -> None:
    cols = {
        "found_with": "TEXT",
        "supervisor_signature": "VARCHAR",
        "supervisor_signature_date": "VARCHAR",
        "notice_text": "TEXT",
    }

    with engine.begin() as conn:
        try:
            existing = set()
            if engine.dialect.name == "sqlite":
                rows = conn.execute(text("PRAGMA table_info(employee_warnings)")).fetchall()
                existing = {r[1] for r in rows}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='employee_warnings'"
                    )
                ).fetchall()
                existing = {r[0] for r in rows}

            for col, ddl in cols.items():
                if col in existing:
                    continue
                conn.execute(text(f"ALTER TABLE employee_warnings ADD COLUMN {col} {ddl}"))
        except Exception:
            pass


_ensure_employee_warning_columns_exist()


def _ensure_general_item_columns_exist() -> None:
    cols = {
        "image_url": "VARCHAR",
    }

    with engine.begin() as conn:
        try:
            existing = set()
            if engine.dialect.name == "sqlite":
                rows = conn.execute(text("PRAGMA table_info(general_items)")).fetchall()
                existing = {r[1] for r in rows}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='general_items'"
                    )
                ).fetchall()
                existing = {r[0] for r in rows}

            for col, ddl in cols.items():
                if col in existing:
                    continue
                conn.execute(text(f"ALTER TABLE general_items ADD COLUMN {col} {ddl}"))
        except Exception:
            pass


_ensure_general_item_columns_exist()


def _ensure_client_guard_requirement_columns_exist() -> None:
    cols = {
        "start_date": "DATE",
        "end_date": "DATE",
        "preferred_language": "VARCHAR",
        "monthly_amount": "FLOAT",
    }

    with engine.begin() as conn:
        try:
            existing = set()
            if engine.dialect.name == "sqlite":
                rows = conn.execute(text("PRAGMA table_info(client_guard_requirements)")).fetchall()
                existing = {r[1] for r in rows}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='client_guard_requirements'"
                    )
                ).fetchall()
                existing = {r[0] for r in rows}

            for col, ddl in cols.items():
                if col in existing:
                    continue
                conn.execute(text(f"ALTER TABLE client_guard_requirements ADD COLUMN {col} {ddl}"))
        except Exception:
            pass


_ensure_client_guard_requirement_columns_exist()


def _ensure_attendance_columns_exist() -> None:
    attendance_columns = {
        "overtime_minutes": "INTEGER",
        "overtime_rate": "FLOAT",
        "late_minutes": "INTEGER",
        "late_deduction": "FLOAT",
        "leave_type": "VARCHAR",
        "fine_amount": "FLOAT",
    }

    with engine.begin() as conn:
        try:
            existing = set()
            if engine.dialect.name == "sqlite":
                rows = conn.execute(text("PRAGMA table_info(attendance_records)")).fetchall()
                existing = {r[1] for r in rows}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='attendance_records'"
                    )
                ).fetchall()
                existing = {r[0] for r in rows}

            for col, ddl in attendance_columns.items():
                if col in existing:
                    continue
                conn.execute(text(f"ALTER TABLE attendance_records ADD COLUMN {col} {ddl}"))
        except Exception:
            pass


_ensure_attendance_columns_exist()


def _ensure_vehicle_columns_exist() -> None:
    vehicle_columns = {
        "chassis_number": "VARCHAR(100)",
    }

    with engine.begin() as conn:
        try:
            existing = set()
            if engine.dialect.name == "sqlite":
                rows = conn.execute(text("PRAGMA table_info(vehicles)")).fetchall()
                existing = {r[1] for r in rows}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='vehicles'"
                    )
                ).fetchall()
                existing = {r[0] for r in rows}

            for col, ddl in vehicle_columns.items():
                if col in existing:
                    continue
                conn.execute(text(f"ALTER TABLE vehicles ADD COLUMN {col} {ddl}"))
        except Exception:
            pass


_ensure_vehicle_columns_exist()


def _ensure_vehicle_assignment_columns_exist() -> None:
    assignment_columns = {
        "route_stops": "TEXT",
        "status": "VARCHAR(30) DEFAULT 'Incomplete'",
        "assignment_date": "DATE",
        "distance_km": "FLOAT",
        "rate_per_km": "FLOAT",
        "amount": "FLOAT",
    }

    with engine.begin() as conn:
        try:
            existing = set()
            if engine.dialect.name == "sqlite":
                rows = conn.execute(text("PRAGMA table_info(vehicle_assignments)")).fetchall()
                existing = {r[1] for r in rows}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='vehicle_assignments'"
                    )
                ).fetchall()
                existing = {r[0] for r in rows}

            for col, ddl in assignment_columns.items():
                if col in existing:
                    continue
                conn.execute(text(f"ALTER TABLE vehicle_assignments ADD COLUMN {col} {ddl}"))
        except Exception:
            pass


_ensure_vehicle_assignment_columns_exist()


def _ensure_payroll_payment_status_columns_exist() -> None:
    payroll_columns = {
        "employee_db_id": "INTEGER",
        "net_pay_snapshot": "FLOAT",
    }

    with engine.begin() as conn:
        try:
            existing = set()
            if engine.dialect.name == "sqlite":
                rows = conn.execute(text("PRAGMA table_info(payroll_payment_status)")).fetchall()
                existing = {r[1] for r in rows}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name='payroll_payment_status'"
                    )
                ).fetchall()
                existing = {r[0] for r in rows}

            for col, ddl in payroll_columns.items():
                if col in existing:
                    continue
                conn.execute(text(f"ALTER TABLE payroll_payment_status ADD COLUMN {col} {ddl}"))
        except Exception:
            pass


_ensure_payroll_payment_status_columns_exist()

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="A modern ERP system built with FastAPI and React",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler to ensure CORS headers are sent even on 500 errors."""
    import traceback
    traceback.print_exc()
    return Response(
        content=str(exc),
        status_code=500,
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        },
    )

# Include API router
app.include_router(api_router, prefix="/api")

# Serve uploads from project root so previously uploaded files remain accessible.
# backend/app/main.py -> project root is ../../
_uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
os.makedirs(_uploads_dir, exist_ok=True)

# Migrate any legacy uploads folders into project-root uploads (best effort)
_legacy_dirs = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "uploads")),  # backend/app/uploads
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads")),  # backend/uploads
]
try:
    target_vehicles = os.path.join(_uploads_dir, "vehicles")
    os.makedirs(target_vehicles, exist_ok=True)
    for _legacy_uploads_dir in _legacy_dirs:
        legacy_vehicles = os.path.join(_legacy_uploads_dir, "vehicles")
        if not os.path.isdir(legacy_vehicles):
            continue
        for fn in os.listdir(legacy_vehicles):
            src = os.path.join(legacy_vehicles, fn)
            dst = os.path.join(target_vehicles, fn)
            if os.path.isfile(src) and not os.path.exists(dst):
                shutil.copy2(src, dst)
except Exception:
    pass

app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
