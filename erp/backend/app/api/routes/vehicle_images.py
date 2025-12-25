import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.vehicle import Vehicle
from app.models.vehicle_image import VehicleImage
from app.schemas.vehicle_image import VehicleImageOut


router = APIRouter()


def _upload_dir() -> str:
    # backend/app/api/routes -> project root
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    d = os.path.join(base, "uploads", "vehicles", "images")
    os.makedirs(d, exist_ok=True)
    return d


def _public_url(path: str) -> str:
    fn = os.path.basename(path)
    return f"/uploads/vehicles/images/{fn}"


@router.get("/{vehicle_id}/images", response_model=List[VehicleImageOut])
async def list_vehicle_images(vehicle_id: str, db: Session = Depends(get_db)) -> List[VehicleImageOut]:
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    imgs = (
        db.query(VehicleImage)
        .filter(VehicleImage.vehicle_id == vehicle_id)
        .order_by(VehicleImage.id.desc())
        .all()
    )

    out: List[VehicleImageOut] = []
    for img in imgs:
        out.append(
            VehicleImageOut(
                id=img.id,
                vehicle_id=img.vehicle_id,
                filename=img.filename,
                url=_public_url(img.path),
                mime_type=img.mime_type,
                created_at=img.created_at,
                updated_at=img.updated_at,
            )
        )
    return out


@router.post("/{vehicle_id}/images", response_model=VehicleImageOut)
async def upload_vehicle_image(
    vehicle_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> VehicleImageOut:
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    ct = file.content_type or "application/octet-stream"
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    ext = os.path.splitext(file.filename or "")[-1]
    safe_name = f"{vehicle_id}_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(_upload_dir(), safe_name)

    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    img = VehicleImage(
        vehicle_id=vehicle_id,
        filename=file.filename or safe_name,
        path=dest,
        mime_type=ct,
    )

    db.add(img)
    db.commit()
    db.refresh(img)

    return VehicleImageOut(
        id=img.id,
        vehicle_id=img.vehicle_id,
        filename=img.filename,
        url=_public_url(img.path),
        mime_type=img.mime_type,
        created_at=img.created_at,
        updated_at=img.updated_at,
    )


@router.delete("/{vehicle_id}/images/{image_id}")
async def delete_vehicle_image(vehicle_id: str, image_id: int, db: Session = Depends(get_db)) -> dict:
    img = (
        db.query(VehicleImage)
        .filter(VehicleImage.id == image_id)
        .filter(VehicleImage.vehicle_id == vehicle_id)
        .first()
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        if img.path and os.path.exists(img.path):
            os.remove(img.path)
    except Exception:
        pass

    db.delete(img)
    db.commit()

    return {"message": "Image deleted"}
