from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class GeneralItem(Base):
    __tablename__ = "general_items"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String(50), unique=True, index=True, nullable=False)

    category = Column(String(50), nullable=False)  # bag | walkie_talkie | uniform | flashlight | other
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    image_url = Column(String(500), nullable=True)

    unit_name = Column(String(50), nullable=False, default="unit")

    quantity_on_hand = Column(Float, nullable=False, default=0.0)
    min_quantity = Column(Float, nullable=True)

    storage_location = Column(String(120), nullable=True)

    status = Column(String(30), nullable=False, default="Active")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
