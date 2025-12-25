from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class ClientSite(Base):
    __tablename__ = "client_sites"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True, nullable=False)

    site_name = Column(String(200), nullable=False)
    site_type = Column(String(50), nullable=True)  # Office/Factory/Residence/Event/ATM/Warehouse

    site_address = Column(String(250), nullable=True)
    city = Column(String(80), nullable=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    risk_level = Column(String(20), nullable=False, default="Low")  # Low/Medium/High
    status = Column(String(30), nullable=False, default="Active")  # Active/Closed

    site_instructions = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
