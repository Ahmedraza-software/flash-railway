from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class RestrictedItemBase(BaseModel):
    item_code: str
    category: str
    name: str
    description: Optional[str] = None

    is_serial_tracked: bool = False
    unit_name: str = "unit"

    quantity_on_hand: float = 0.0
    min_quantity: Optional[float] = None

    make_model: Optional[str] = None
    caliber: Optional[str] = None

    storage_location: Optional[str] = None

    requires_maintenance: bool = False
    requires_cleaning: bool = False

    status: str = "Active"


class RestrictedItemCreate(RestrictedItemBase):
    pass


class RestrictedItemUpdate(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None

    is_serial_tracked: Optional[bool] = None
    unit_name: Optional[str] = None

    quantity_on_hand: Optional[float] = None
    min_quantity: Optional[float] = None

    make_model: Optional[str] = None
    caliber: Optional[str] = None

    storage_location: Optional[str] = None

    requires_maintenance: Optional[bool] = None
    requires_cleaning: Optional[bool] = None

    status: Optional[str] = None


class RestrictedItemOut(RestrictedItemBase):
    id: int
    serial_total: Optional[int] = None
    serial_in_stock: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RestrictedItemImageOut(BaseModel):
    id: int
    item_code: str
    filename: str
    url: str
    mime_type: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RestrictedSerialUnitOut(BaseModel):
    id: int
    item_code: str
    serial_number: str
    status: str
    issued_to_employee_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RestrictedSerialUnitCreate(BaseModel):
    serial_number: str


class RestrictedTransactionOut(BaseModel):
    id: int
    item_code: str
    employee_id: Optional[str] = None
    serial_unit_id: Optional[int] = None
    action: str
    quantity: Optional[float] = None
    condition_note: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class IssueRequest(BaseModel):
    employee_id: str
    quantity: Optional[float] = None
    serial_numbers: Optional[List[str]] = None
    notes: Optional[str] = None


class ReturnRequest(BaseModel):
    employee_id: Optional[str] = None
    quantity: Optional[float] = None
    serial_numbers: Optional[List[str]] = None
    condition_note: Optional[str] = None
    notes: Optional[str] = None


class LostRequest(BaseModel):
    employee_id: Optional[str] = None
    quantity: Optional[float] = None
    serial_numbers: Optional[List[str]] = None
    notes: Optional[str] = None
