from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    client_code = Column(String(50), unique=True, index=True, nullable=False)
    client_name = Column(String(200), nullable=False)

    client_type = Column(String(50), nullable=False)  # Corporate | Individual | Government
    industry_type = Column(String(80), nullable=True)  # Residential/Commercial/Industrial/Hospital/Bank/Event

    status = Column(String(30), nullable=False, default="Active")  # Active | Inactive | Blacklisted | Lead | On Hold | Contract Expired | Terminated

    location = Column(String(200), nullable=True)  # City / Area
    address = Column(Text, nullable=True)  # Full address
    phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)

    registration_number = Column(String(80), nullable=True)
    vat_gst_number = Column(String(80), nullable=True)
    website = Column(String(200), nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
