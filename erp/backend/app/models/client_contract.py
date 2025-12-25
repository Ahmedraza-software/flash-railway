from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class ClientContract(Base):
    __tablename__ = "client_contracts"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True, nullable=False)

    contract_number = Column(String(80), unique=True, index=True, nullable=False)

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    contract_type = Column(String(30), nullable=True)  # Monthly/Annual/Event-based/Security Services/Guarding
    billing_cycle = Column(String(30), nullable=True)  # Monthly/Fortnightly/Weekly
    payment_terms = Column(String(30), nullable=True)  # Advance/Net 15/Net 30
    monthly_cost = Column(Float, nullable=True, default=0)  # Monthly contract cost

    penalty_overtime_rules = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="Active")  # Active/Expired/Terminated/Ended/Pending

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
