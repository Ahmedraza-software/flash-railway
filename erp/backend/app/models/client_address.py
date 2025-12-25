from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class ClientAddress(Base):
    __tablename__ = "client_addresses"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True, nullable=False)

    address_type = Column(String(30), nullable=False)  # Registered | Billing | Head Office

    address_line1 = Column(String(200), nullable=False)
    address_line2 = Column(String(200), nullable=True)
    city = Column(String(80), nullable=True)
    state = Column(String(80), nullable=True)
    country = Column(String(80), nullable=True)
    postal_code = Column(String(30), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
