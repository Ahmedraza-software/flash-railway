from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class Employee(Base):
    """Employee model."""
    
    __tablename__ = "employees"
    
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, unique=True, index=True, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    gender = Column(String)
    date_of_birth = Column(String)
    profile_photo = Column(Text)  # Store as base64 or URL
    government_id = Column(String)
    cnic = Column(String)
    cnic_expiry_date = Column(String)
    domicile = Column(String)
    languages_spoken = Column(Text)  # JSON array string
    languages_proficiency = Column(Text)  # JSON array of {language, level}
    height_cm = Column(Integer)
    email = Column(String, unique=True, index=True)
    mobile_number = Column(String)
    personal_phone_number = Column(String)
    emergency_contact_name = Column(String)
    emergency_contact_number = Column(String)
    father_name = Column(String)
    previous_employment = Column(Text)
    next_of_kin_name = Column(String)
    next_of_kin_cnic = Column(String)
    next_of_kin_mobile_number = Column(String)
    permanent_address = Column(Text)
    temporary_address = Column(Text)

    permanent_village = Column(String)
    permanent_post_office = Column(String)
    permanent_thana = Column(String)
    permanent_tehsil = Column(String)
    permanent_district = Column(String)

    present_village = Column(String)
    present_post_office = Column(String)
    present_thana = Column(String)
    present_tehsil = Column(String)
    present_district = Column(String)

    city = Column(String)
    state = Column(String)
    postal_code = Column(String)
    department = Column(String)
    designation = Column(String)
    enrolled_as = Column(String)
    employment_type = Column(String)
    shift_type = Column(String)
    reporting_manager = Column(String)
    base_location = Column(String)
    interviewed_by = Column(String)
    introduced_by = Column(String)
    security_clearance = Column(String)
    basic_security_training = Column(Boolean, default=False)
    fire_safety_training = Column(Boolean, default=False)
    first_aid_certification = Column(Boolean, default=False)
    agreement = Column(Boolean, default=False)
    police_clearance = Column(Boolean, default=False)
    fingerprint_check = Column(Boolean, default=False)
    background_screening = Column(Boolean, default=False)
    reference_verification = Column(Boolean, default=False)
    guard_card = Column(Boolean, default=False)
    guard_card_doc = Column(Text)
    police_clearance_doc = Column(Text)
    fingerprint_check_doc = Column(Text)
    background_screening_doc = Column(Text)
    reference_verification_doc = Column(Text)
    other_certificates = Column(Text)  # JSON string
    basic_salary = Column(String)
    allowances = Column(String)
    total_salary = Column(String)
    bank_name = Column(String)
    account_number = Column(String)
    ifsc_code = Column(String)
    account_type = Column(String)
    tax_id = Column(String)
    bank_accounts = Column(Text)  # JSON array string
    system_access_rights = Column(Text)
    employment_status = Column(String, default="Active")
    last_site_assigned = Column(String)
    remarks = Column(Text)

    retired_from = Column(Text)  # JSON array string
    service_unit = Column(String)
    service_rank = Column(String)
    service_enrollment_date = Column(String)
    service_reenrollment_date = Column(String)
    medical_category = Column(String)
    discharge_cause = Column(Text)

    blood_group = Column(String)
    civil_education_type = Column(String)
    civil_education_detail = Column(String)

    sons_names = Column(Text)
    daughters_names = Column(Text)
    brothers_names = Column(Text)
    sisters_names = Column(Text)

    particulars_verified_by_sho_on = Column(String)
    particulars_verified_by_ssp_on = Column(String)
    police_khidmat_verification_on = Column(String)
    verified_by_khidmat_markaz = Column(String)

    signature_recording_officer = Column(Text)
    signature_individual = Column(Text)
    fss_number = Column(String)
    fss_name = Column(String)
    fss_so = Column(String)

    original_doc_held = Column(Text)
    documents_handed_over_to = Column(String)
    photo_on_document = Column(String)
    eobi_no = Column(String)
    insurance = Column(String)
    social_security = Column(String)
    home_contact_no = Column(String)
    police_training_letter_date = Column(String)
    vaccination_certificate = Column(String)
    volume_no = Column(String)
    payments = Column(Text)
    fingerprint_attested_by = Column(String)
    date_of_entry = Column(String)
    card_number = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<Employee {self.employee_id}>"
