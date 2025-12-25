from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class ClientInvoice(Base):
    __tablename__ = "client_invoices"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True, nullable=False)

    invoice_number = Column(String(80), unique=True, index=True, nullable=False)
    invoice_date = Column(Date, nullable=True)

    billing_period = Column(String(80), nullable=True)

    total_amount = Column(Float, nullable=False, default=0.0)
    tax_amount = Column(Float, nullable=True)
    net_payable = Column(Float, nullable=False, default=0.0)

    payment_status = Column(String(30), nullable=False, default="Pending")  # Pending/Paid/Overdue

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
