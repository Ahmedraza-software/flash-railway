"""Bulk operations API routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.api.dependencies import require_permission
from app.models.employee import Employee

router = APIRouter()


@router.post("/employees/delete")
async def bulk_delete_employees(
    employee_ids: List[str],
    db: Session = Depends(get_db),
    _user=Depends(require_permission("employees:delete")),
):
    """Delete multiple employees by employee_ids."""
    
    if not employee_ids:
        raise HTTPException(status_code=400, detail="No employee IDs provided")
    
    # Find all employees to delete
    employees = db.query(Employee).filter(Employee.employee_id.in_(employee_ids)).all()
    
    if not employees:
        raise HTTPException(status_code=404, detail="No employees found with provided IDs")
    
    found_ids = {emp.employee_id for emp in employees}
    missing_ids = set(employee_ids) - found_ids
    
    # Delete found employees
    for employee in employees:
        db.delete(employee)
    
    db.commit()
    
    result = {
        "message": f"Successfully deleted {len(employees)} employee(s)",
        "deleted_count": len(employees),
        "deleted_ids": list(found_ids)
    }
    
    if missing_ids:
        result["warning"] = f"Could not find {len(missing_ids)} employee(s): {', '.join(missing_ids)}"
    
    return result


@router.get("/test")
async def test_bulk_operations():
    """Test endpoint to verify bulk operations API is working."""
    return {"message": "Bulk operations API is working"}