from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class ClientContact(Base):
    __tablename__ = "client_contacts"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True, nullable=False)

    name = Column(String(120), nullable=False)
    designation = Column(String(120), nullable=True)

    phone_number = Column(String(50), nullable=True)
    alternate_phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)

    preferred_contact_method = Column(String(30), nullable=True)  # Phone | Email | WhatsApp
    is_primary = Column(Integer, nullable=False, default=0)  # 0/1

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
