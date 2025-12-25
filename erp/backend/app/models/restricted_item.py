from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class RestrictedItem(Base):
    __tablename__ = "restricted_items"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String(50), unique=True, index=True, nullable=False)

    category = Column(String(50), nullable=False)  # firearm | ammo | tactical | equipment
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    is_serial_tracked = Column(Boolean, default=False)
    unit_name = Column(String(50), nullable=False, default="unit")  # unit | round | box | pcs

    quantity_on_hand = Column(Float, nullable=False, default=0.0)
    min_quantity = Column(Float, nullable=True)

    make_model = Column(String(200), nullable=True)
    caliber = Column(String(50), nullable=True)

    storage_location = Column(String(120), nullable=True)

    requires_maintenance = Column(Boolean, default=False)
    requires_cleaning = Column(Boolean, default=False)

    status = Column(String(30), nullable=False, default="Active")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
