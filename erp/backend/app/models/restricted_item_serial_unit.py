from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class RestrictedItemSerialUnit(Base):
    __tablename__ = "restricted_item_serial_units"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String(50), ForeignKey("restricted_items.item_code"), index=True, nullable=False)

    serial_number = Column(String(120), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="in_stock")  # in_stock|issued|lost|maintenance

    issued_to_employee_id = Column(String(50), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
