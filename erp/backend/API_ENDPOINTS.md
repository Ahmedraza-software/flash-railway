# Flash ERP Backend API Endpoints

## Base URL

- API base prefix: `/api`
- Swagger UI: `/docs`
- ReDoc: `/redoc`

## System

- `GET /`
  - Returns app info + docs link.
- `GET /health`
  - Health check.

## Authentication (`/api/auth`)

- `POST /api/auth/register`
  - Register a new user.
- `POST /api/auth/login`
  - Login using `application/x-www-form-urlencoded` (`username`, `password`) and receive a bearer token.
- `GET /api/auth/me`
  - Get current user info.
  - Auth: `Authorization: Bearer <token>`

## Users (`/api/users`) (superuser-only)

- `GET /api/users/`
  - Query params: `skip` (default `0`), `limit` (default `100`)
  - Auth: superuser
- `GET /api/users/{user_id}`
  - Auth: superuser
- `PUT /api/users/{user_id}`
  - Auth: superuser
- `DELETE /api/users/{user_id}`
  - Auth: superuser

## Vehicles (`/api/vehicles`)

- `POST /api/vehicles/`
- `GET /api/vehicles/`
  - Query params: `skip` (default `0`), `limit` (default `100`)
- `GET /api/vehicles/{vehicle_id}`
- `PUT /api/vehicles/{vehicle_id}`
- `DELETE /api/vehicles/{vehicle_id}`

## Employees (`/api/employees`)

- `POST /api/employees/`
- `GET /api/employees/`
  - Query params:
    - `skip` (default `0`)
    - `limit` (default `100`)
    - `search` (optional)
    - `department` (optional)
    - `designation` (optional)
    - `employment_status` (optional)
    - `with_total` (default `true`)
- `GET /api/employees/{employee_id}`
- `PUT /api/employees/{employee_id}`
- `DELETE /api/employees/{employee_id}`
- `GET /api/employees/departments/list`
- `GET /api/employees/designations/list`

## Attendance (`/api/attendance`)

- `GET /api/attendance/`
  - Query params: `date` (required, `YYYY-MM-DD`)
- `PUT /api/attendance/`
  - Bulk upsert attendance for a given date.
- `GET /api/attendance/export/pdf`
  - Query params: `date` (required, `YYYY-MM-DD`)
  - Returns a PDF.

## Payroll (`/api/payroll`)

- `GET /api/payroll/report`
  - Query params: `month` (required, `YYYY-MM`)
- `GET /api/payroll/export/pdf`
  - Query params: `month` (required, `YYYY-MM`)
  - Returns a PDF.

## Vehicle Assignments (`/api/vehicle-assignments`)

- `POST /api/vehicle-assignments/`
- `GET /api/vehicle-assignments/`
- `GET /api/vehicle-assignments/{assignment_id}`
- `PUT /api/vehicle-assignments/{assignment_id}`
- `DELETE /api/vehicle-assignments/{assignment_id}`

## Vehicle Maintenance (`/api/vehicle-maintenance`)

- `POST /api/vehicle-maintenance/`
- `GET /api/vehicle-maintenance/`
  - Optional query params: `vehicle_id`, `employee_id`
- `GET /api/vehicle-maintenance/{record_id}`
- `PUT /api/vehicle-maintenance/{record_id}`
- `DELETE /api/vehicle-maintenance/{record_id}`

## Inventory Assignments (`/api/inventory-assignments`)

- `GET /api/inventory-assignments/`
  - Returns the current persisted inventory assignments JSON map.
- `PUT /api/inventory-assignments/`
  - Replaces the stored inventory assignments JSON map.
