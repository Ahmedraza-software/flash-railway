from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class GeneralItemBase(BaseModel):
    item_code: str
    category: str
    name: str
    description: Optional[str] = None

    image_url: Optional[str] = None

    unit_name: str = "unit"

    quantity_on_hand: float = 0.0
    min_quantity: Optional[float] = None

    storage_location: Optional[str] = None

    status: str = "Active"


class GeneralItemCreate(GeneralItemBase):
    pass


class GeneralItemUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None

    unit_name: Optional[str] = None

    quantity_on_hand: Optional[float] = None
    min_quantity: Optional[float] = None

    storage_location: Optional[str] = None

    status: Optional[str] = None


class GeneralItemOut(GeneralItemBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GeneralTransactionOut(BaseModel):
    id: int
    item_code: str
    employee_id: Optional[str] = None
    action: str
    quantity: Optional[float] = None
    condition_note: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class IssueRequest(BaseModel):
    employee_id: str
    quantity: float
    notes: Optional[str] = None


class ReturnRequest(BaseModel):
    employee_id: str
    quantity: float
    condition_note: Optional[str] = None
    notes: Optional[str] = None


class AdjustRequest(BaseModel):
    quantity: float
    notes: Optional[str] = None


class EmployeeGeneralIssuedQuantity(BaseModel):
    item_code: str
    item_name: str
    category: str
    unit_name: str
    quantity_issued: float


class EmployeeGeneralIssuedInventory(BaseModel):
    employee_id: str
    items: List[EmployeeGeneralIssuedQuantity]
