from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class VehicleDocumentOut(BaseModel):
    id: int
    vehicle_id: str
    name: str
    filename: str
    url: str
    mime_type: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
