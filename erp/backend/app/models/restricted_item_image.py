from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class RestrictedItemImage(Base):
    __tablename__ = "restricted_item_images"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String(50), ForeignKey("restricted_items.item_code"), index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    path = Column(String(500), nullable=False)
    mime_type = Column(String(120), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
