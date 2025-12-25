"""Employee2 model - simplified employee records from legacy data."""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Employee2(Base):
    """Employee2 model for legacy staff data."""
    
    __tablename__ = "employees2"
    
    id = Column(Integer, primary_key=True, index=True)
    serial_no = Column(String, index=True)  # A - #
    fss_no = Column(String, index=True)  # B - FSS #
    rank = Column(String)  # C - Rank
    name = Column(String, nullable=False)  # D - Name
    father_name = Column(String)  # E - Father's Name
    salary = Column(String)  # F - Salary
    status = Column(String)  # G - Status (Army/Civil/PAF etc)
    unit = Column(String)  # H - Unit
    service_rank = Column(String)  # I - Rank (service)
    blood_group = Column(String)  # J - Blood Gp
    status2 = Column(String)  # K - Status (second)
    unit2 = Column(String)  # L - Unit (second)
    rank2 = Column(String)  # M - Rank (third)
    cnic = Column(String, index=True)  # N - CNIC #
    dob = Column(String)  # O - DOB
    cnic_expiry = Column(String)  # P - CNIC Expr
    documents_held = Column(Text)  # Q - Documents held
    documents_handed_over_to = Column(Text)  # R - Documents Reciving /Handed Over To
    photo_on_doc = Column(String)  # S - Photo on Docu
    eobi_no = Column(String)  # T - EOBI #
    insurance = Column(String)  # W - Insurance
    social_security = Column(String)  # X - Social Security
    mobile_no = Column(String)  # Y - Mob #
    home_contact = Column(String)  # Z - Home Contact Number
    verified_by_sho = Column(String)  # AA - Verified by SHO
    verified_by_khidmat_markaz = Column(String)  # AB - Verified by Khidmat Markaz
    domicile = Column(String)  # AC - Domicile
    verified_by_ssp = Column(String)  # AD - Verified by SSP
    enrolled = Column(String)  # AE - Enrolled
    re_enrolled = Column(String)  # AF - Re Enrolled
    village = Column(String)  # AG - Village
    post_office = Column(String)  # AH - Post Office
    thana = Column(String)  # AI - Thana
    tehsil = Column(String)  # AJ - Tehsil
    district = Column(String)  # AK - District
    duty_location = Column(String)  # AL - Duty Location
    police_trg_ltr_date = Column(String)  # AM - Police Trg Ltr & Date
    vaccination_cert = Column(String)  # AN - Vacanation Cert
    vol_no = Column(String)  # AO - Vol #
    payments = Column(Text)  # AP - Payment's
    category = Column(String)  # Category (Office Staff, Operational Staff, etc.)
    designation = Column(String)  # Job designation
    allocation_status = Column(String, default="Free")  # Free / Allocated
    
    # Avatar and document attachments
    avatar_url = Column(String)  # Profile picture URL
    cnic_attachment = Column(String)  # CNIC document URL
    domicile_attachment = Column(String)  # Domicile document URL
    sho_verified_attachment = Column(String)  # SHO verification document URL
    ssp_verified_attachment = Column(String)  # SSP verification document URL
    khidmat_verified_attachment = Column(String)  # Khidmat Markaz verification document URL
    police_trg_attachment = Column(String)  # Police training document URL
    
    # Bank accounts stored as JSON string
    bank_accounts = Column(Text)  # JSON array of bank accounts
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<Employee2 {self.serial_no} - {self.name}>"
