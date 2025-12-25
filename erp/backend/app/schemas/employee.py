import json
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator
from datetime import datetime


class EmployeeLanguageProficiency(BaseModel):
    language: str
    level: str


class EmployeeBankAccount(BaseModel):
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_type: Optional[str] = None
    tax_id: Optional[str] = None


class EmployeeBase(BaseModel):
    """Base employee schema."""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., max_length=100)
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    profile_photo: Optional[str] = None
    government_id: Optional[str] = None
    cnic: Optional[str] = None
    cnic_expiry_date: Optional[str] = None
    domicile: Optional[str] = None
    languages_spoken: Optional[List[str]] = None
    languages_proficiency: Optional[List[EmployeeLanguageProficiency]] = None
    height_cm: Optional[int] = None
    email: str
    mobile_number: Optional[str] = None
    personal_phone_number: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    father_name: Optional[str] = None
    previous_employment: Optional[str] = None
    next_of_kin_name: Optional[str] = None
    next_of_kin_cnic: Optional[str] = None
    next_of_kin_mobile_number: Optional[str] = None
    permanent_address: Optional[str] = None
    temporary_address: Optional[str] = None

    permanent_village: Optional[str] = None
    permanent_post_office: Optional[str] = None
    permanent_thana: Optional[str] = None
    permanent_tehsil: Optional[str] = None
    permanent_district: Optional[str] = None

    present_village: Optional[str] = None
    present_post_office: Optional[str] = None
    present_thana: Optional[str] = None
    present_tehsil: Optional[str] = None
    present_district: Optional[str] = None

    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    enrolled_as: Optional[str] = None
    employment_type: Optional[str] = None
    shift_type: Optional[str] = None
    reporting_manager: Optional[str] = None
    base_location: Optional[str] = None
    interviewed_by: Optional[str] = None
    introduced_by: Optional[str] = None
    security_clearance: Optional[str] = None
    basic_security_training: Optional[bool] = False
    fire_safety_training: Optional[bool] = False
    first_aid_certification: Optional[bool] = False
    agreement: Optional[bool] = False
    police_clearance: Optional[bool] = False
    fingerprint_check: Optional[bool] = False
    background_screening: Optional[bool] = False
    reference_verification: Optional[bool] = False
    guard_card: Optional[bool] = False
    guard_card_doc: Optional[str] = None
    police_clearance_doc: Optional[str] = None
    fingerprint_check_doc: Optional[str] = None
    background_screening_doc: Optional[str] = None
    reference_verification_doc: Optional[str] = None
    other_certificates: Optional[str] = None  # JSON string
    basic_salary: Optional[str] = None
    allowances: Optional[str] = None
    total_salary: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_type: Optional[str] = None
    tax_id: Optional[str] = None
    bank_accounts: Optional[List[EmployeeBankAccount]] = None
    system_access_rights: Optional[str] = None
    employment_status: str = "Active"
    last_site_assigned: Optional[str] = None
    remarks: Optional[str] = None

    retired_from: Optional[List[str]] = None
    service_unit: Optional[str] = None
    service_rank: Optional[str] = None
    service_enrollment_date: Optional[str] = None
    service_reenrollment_date: Optional[str] = None
    medical_category: Optional[str] = None
    discharge_cause: Optional[str] = None

    blood_group: Optional[str] = None
    civil_education_type: Optional[str] = None
    civil_education_detail: Optional[str] = None

    sons_names: Optional[str] = None
    daughters_names: Optional[str] = None
    brothers_names: Optional[str] = None
    sisters_names: Optional[str] = None

    particulars_verified_by_sho_on: Optional[str] = None
    particulars_verified_by_ssp_on: Optional[str] = None
    police_khidmat_verification_on: Optional[str] = None
    verified_by_khidmat_markaz: Optional[str] = None

    signature_recording_officer: Optional[str] = None
    signature_individual: Optional[str] = None
    fss_number: Optional[str] = None
    fss_name: Optional[str] = None
    fss_so: Optional[str] = None

    original_doc_held: Optional[str] = None
    documents_handed_over_to: Optional[str] = None
    photo_on_document: Optional[str] = None
    eobi_no: Optional[str] = None
    insurance: Optional[str] = None
    social_security: Optional[str] = None
    home_contact_no: Optional[str] = None
    police_training_letter_date: Optional[str] = None
    vaccination_certificate: Optional[str] = None
    volume_no: Optional[str] = None
    payments: Optional[str] = None
    fingerprint_attested_by: Optional[str] = None
    date_of_entry: Optional[str] = None
    card_number: Optional[str] = None


class EmployeeCreate(EmployeeBase):
    """Schema for creating an employee."""
    pass


class EmployeeUpdate(BaseModel):
    """Schema for updating an employee."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    profile_photo: Optional[str] = None
    government_id: Optional[str] = None
    cnic: Optional[str] = None
    cnic_expiry_date: Optional[str] = None
    domicile: Optional[str] = None
    languages_spoken: Optional[List[str]] = None
    height_cm: Optional[int] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None
    personal_phone_number: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    father_name: Optional[str] = None
    previous_employment: Optional[str] = None
    next_of_kin_name: Optional[str] = None
    next_of_kin_cnic: Optional[str] = None
    next_of_kin_mobile_number: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    permanent_address: Optional[str] = None
    temporary_address: Optional[str] = None

    permanent_village: Optional[str] = None
    permanent_post_office: Optional[str] = None
    permanent_thana: Optional[str] = None
    permanent_tehsil: Optional[str] = None
    permanent_district: Optional[str] = None

    present_village: Optional[str] = None
    present_post_office: Optional[str] = None
    present_thana: Optional[str] = None
    present_tehsil: Optional[str] = None
    present_district: Optional[str] = None

    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    enrolled_as: Optional[str] = None
    employment_type: Optional[str] = None
    shift_type: Optional[str] = None
    reporting_manager: Optional[str] = None
    base_location: Optional[str] = None
    interviewed_by: Optional[str] = None
    introduced_by: Optional[str] = None
    security_clearance: Optional[str] = None
    basic_security_training: Optional[bool] = None
    fire_safety_training: Optional[bool] = None
    first_aid_certification: Optional[bool] = None
    agreement: Optional[bool] = None
    police_clearance: Optional[bool] = None
    fingerprint_check: Optional[bool] = None
    background_screening: Optional[bool] = None
    reference_verification: Optional[bool] = None
    guard_card: Optional[bool] = None
    guard_card_doc: Optional[str] = None
    police_clearance_doc: Optional[str] = None
    fingerprint_check_doc: Optional[str] = None
    background_screening_doc: Optional[str] = None
    reference_verification_doc: Optional[str] = None
    other_certificates: Optional[str] = None
    basic_salary: Optional[str] = None
    allowances: Optional[str] = None
    total_salary: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_type: Optional[str] = None
    tax_id: Optional[str] = None
    bank_accounts: Optional[List[EmployeeBankAccount]] = None
    system_access_rights: Optional[str] = None
    employment_status: Optional[str] = None
    last_site_assigned: Optional[str] = None
    remarks: Optional[str] = None

    retired_from: Optional[List[str]] = None
    service_unit: Optional[str] = None
    service_rank: Optional[str] = None
    service_enrollment_date: Optional[str] = None
    service_reenrollment_date: Optional[str] = None
    medical_category: Optional[str] = None
    discharge_cause: Optional[str] = None

    blood_group: Optional[str] = None
    civil_education_type: Optional[str] = None
    civil_education_detail: Optional[str] = None

    sons_names: Optional[str] = None
    daughters_names: Optional[str] = None
    brothers_names: Optional[str] = None
    sisters_names: Optional[str] = None

    particulars_verified_by_sho_on: Optional[str] = None
    particulars_verified_by_ssp_on: Optional[str] = None
    police_khidmat_verification_on: Optional[str] = None
    verified_by_khidmat_markaz: Optional[str] = None

    signature_recording_officer: Optional[str] = None
    signature_individual: Optional[str] = None
    fss_number: Optional[str] = None
    fss_name: Optional[str] = None
    fss_so: Optional[str] = None

    original_doc_held: Optional[str] = None
    documents_handed_over_to: Optional[str] = None
    photo_on_document: Optional[str] = None
    eobi_no: Optional[str] = None
    insurance: Optional[str] = None
    social_security: Optional[str] = None
    home_contact_no: Optional[str] = None
    police_training_letter_date: Optional[str] = None
    vaccination_certificate: Optional[str] = None
    volume_no: Optional[str] = None
    payments: Optional[str] = None
    fingerprint_attested_by: Optional[str] = None
    date_of_entry: Optional[str] = None
    card_number: Optional[str] = None


class EmployeeInDB(EmployeeBase):
    """Schema for employee in database."""
    id: int
    employee_id: str
    warning_count: Optional[int] = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

    @field_validator("languages_spoken", mode="before")
    @classmethod
    def _parse_languages_spoken(cls, v: Any):
        if v is None:
            return None
        if isinstance(v, list):
            return [str(x) for x in v if x is not None and str(x).strip()]
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return None
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [str(x) for x in parsed if x is not None and str(x).strip()]
            except Exception:
                parts = [p.strip() for p in s.split(",")]
                out = [p for p in parts if p]
                return out or None
        return None

    @field_validator("bank_accounts", mode="before")
    @classmethod
    def _parse_bank_accounts(cls, v: Any):
        if v is None:
            return None
        if isinstance(v, list):
            return v or None
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return None
            try:
                parsed = json.loads(s)
                return parsed if isinstance(parsed, list) and parsed else None
            except Exception:
                return None
        return None

    @field_validator("retired_from", mode="before")
    @classmethod
    def _parse_retired_from(cls, v: Any):
        if v is None:
            return None
        if isinstance(v, list):
            out = [str(x) for x in v if x is not None and str(x).strip()]
            return out or None
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return None
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    out = [str(x) for x in parsed if x is not None and str(x).strip()]
                    return out or None
            except Exception:
                parts = [p.strip() for p in s.split(",")]
                out = [p for p in parts if p]
                return out or None
        return None

    @field_validator("languages_proficiency", mode="before")
    @classmethod
    def _parse_languages_proficiency(cls, v: Any):
        if v is None:
            return None
        if isinstance(v, list):
            out: list[dict[str, str]] = []
            for it in v:
                if isinstance(it, dict) and it.get("language") and it.get("level"):
                    out.append({"language": str(it["language"]), "level": str(it["level"])})
            return out or None
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return None
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    out: list[dict[str, str]] = []
                    for it in parsed:
                        if isinstance(it, dict) and it.get("language") and it.get("level"):
                            out.append({"language": str(it["language"]), "level": str(it["level"])})
                    return out or None
            except Exception:
                return None
        return None


class Employee(EmployeeInDB):
    """Schema for employee response."""
    pass


class EmployeeList(BaseModel):
    """Schema for employee list response."""
    employees: List[Employee]
    total: int
