"""Vehicle API routes."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleResponse, VehicleUpdate
from app.api.dependencies import require_permission

router = APIRouter(dependencies=[Depends(require_permission("fleet:view"))])


@router.post("/", response_model=VehicleResponse)
async def create_vehicle(vehicle: VehicleCreate, db: Session = Depends(get_db)):
    """Create a new vehicle."""
    # Check if vehicle ID already exists
    db_vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle.vehicle_id).first()
    if db_vehicle:
        raise HTTPException(status_code=400, detail="Vehicle ID already exists")
    
    # Create new vehicle
    db_vehicle = Vehicle(**vehicle.dict())
    db.add(db_vehicle)
    db.commit()
    db.refresh(db_vehicle)
    
    return db_vehicle


@router.get("/", response_model=List[VehicleResponse])
async def get_vehicles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all vehicles."""
    vehicles = db.query(Vehicle).offset(skip).limit(limit).all()
    return vehicles


@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(vehicle_id: str, db: Session = Depends(get_db)):
    """Get a specific vehicle by ID."""
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.put("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(vehicle_id: str, vehicle_update: VehicleUpdate, db: Session = Depends(get_db)):
    """Update a vehicle."""
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # Update vehicle fields
    update_data = vehicle_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vehicle, field, value)
    
    db.commit()
    db.refresh(vehicle)
    
    return vehicle


@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, db: Session = Depends(get_db)):
    """Delete a vehicle."""
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    db.delete(vehicle)
    db.commit()
    
    return {"message": "Vehicle deleted successfully"}
