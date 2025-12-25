from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class EmployeeIssuedSerial(BaseModel):
    serial_unit_id: int
    item_code: str
    item_name: str
    category: str
    serial_number: str
    status: str
    created_at: datetime


class EmployeeIssuedQuantity(BaseModel):
    item_code: str
    item_name: str
    category: str
    unit_name: str
    quantity_issued: float


class EmployeeIssuedInventory(BaseModel):
    employee_id: str
    serial_items: List[EmployeeIssuedSerial]
    quantity_items: List[EmployeeIssuedQuantity]


class QuantityActionRequest(BaseModel):
    quantity: float
    notes: Optional[str] = None


class SerialActionRequest(BaseModel):
    notes: Optional[str] = None
