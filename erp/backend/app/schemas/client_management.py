from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


class ClientBase(BaseModel):
    client_code: str
    client_name: str
    client_type: str
    industry_type: Optional[str] = None
    status: str = "Active"
    location: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    registration_number: Optional[str] = None
    vat_gst_number: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    client_name: Optional[str] = None
    client_type: Optional[str] = None
    industry_type: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    registration_number: Optional[str] = None
    vat_gst_number: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None


class ClientOut(ClientBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SuggestedEmployeeOut(BaseModel):
    id: int
    employee_id: str
    first_name: str
    last_name: str
    languages: List[str] = []


class ClientSiteGuardAllocationBase(BaseModel):
    employee_db_id: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str = "Allocated"


class ClientSiteGuardAllocationCreate(BaseModel):
    employee_db_id: int
    requirement_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ClientSiteGuardAllocationUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None


class ClientSiteGuardAllocationOut(ClientSiteGuardAllocationBase):
    id: int
    site_id: int
    requirement_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClientContactBase(BaseModel):
    name: str
    designation: Optional[str] = None
    phone_number: Optional[str] = None
    alternate_phone: Optional[str] = None
    email: Optional[str] = None
    preferred_contact_method: Optional[str] = None
    is_primary: bool = False


class ClientContactCreate(ClientContactBase):
    pass


class ClientContactUpdate(BaseModel):
    name: Optional[str] = None
    designation: Optional[str] = None
    phone_number: Optional[str] = None
    alternate_phone: Optional[str] = None
    email: Optional[str] = None
    preferred_contact_method: Optional[str] = None
    is_primary: Optional[bool] = None


class ClientContactOut(ClientContactBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClientAddressBase(BaseModel):
    address_type: str
    address_line1: str
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None


class ClientAddressCreate(ClientAddressBase):
    pass


class ClientAddressUpdate(BaseModel):
    address_type: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None


class ClientAddressOut(ClientAddressBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClientSiteBase(BaseModel):
    site_name: str
    site_type: Optional[str] = None
    site_address: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    risk_level: str = "Low"
    status: str = "Active"
    site_instructions: Optional[str] = None


class ClientSiteCreate(ClientSiteBase):
    pass


class ClientSiteUpdate(BaseModel):
    site_name: Optional[str] = None
    site_type: Optional[str] = None
    site_address: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    risk_level: Optional[str] = None
    status: Optional[str] = None
    site_instructions: Optional[str] = None


class ClientSiteOut(ClientSiteBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClientContractBase(BaseModel):
    contract_number: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    contract_type: Optional[str] = None
    billing_cycle: Optional[str] = None
    payment_terms: Optional[str] = None
    monthly_cost: Optional[float] = 0
    penalty_overtime_rules: Optional[str] = None
    notes: Optional[str] = None
    status: str = "Active"


class ClientContractCreate(ClientContractBase):
    pass


class ClientContractUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    contract_type: Optional[str] = None
    billing_cycle: Optional[str] = None
    payment_terms: Optional[str] = None
    monthly_cost: Optional[float] = None
    penalty_overtime_rules: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class ClientContractOut(ClientContractBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ClientGuardRequirementBase(BaseModel):
    guard_type: str
    number_of_guards: int = 1
    shift_type: Optional[str] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None

    start_date: Optional[date] = None
    end_date: Optional[date] = None
    preferred_language: Optional[str] = None
    monthly_amount: Optional[float] = None
    weekly_off_rules: Optional[str] = None
    special_instructions: Optional[str] = None


class ClientGuardRequirementCreate(ClientGuardRequirementBase):
    pass


class ClientGuardRequirementUpdate(BaseModel):
    guard_type: Optional[str] = None
    number_of_guards: Optional[int] = None
    shift_type: Optional[str] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    preferred_language: Optional[str] = None
    monthly_amount: Optional[float] = None
    weekly_off_rules: Optional[str] = None
    special_instructions: Optional[str] = None


class ClientGuardRequirementOut(ClientGuardRequirementBase):
    id: int
    site_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClientContractRequirementOut(ClientGuardRequirementOut):
    site_name: str
    site_status: Optional[str] = None


class ClientRateCardBase(BaseModel):
    guard_type: str
    rate_per_shift_day_month: float
    overtime_rate: Optional[float] = None
    holiday_rate: Optional[float] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class ClientRateCardCreate(ClientRateCardBase):
    pass


class ClientRateCardUpdate(BaseModel):
    guard_type: Optional[str] = None
    rate_per_shift_day_month: Optional[float] = None
    overtime_rate: Optional[float] = None
    holiday_rate: Optional[float] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class ClientRateCardOut(ClientRateCardBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClientInvoiceBase(BaseModel):
    invoice_number: str
    invoice_date: Optional[date] = None
    billing_period: Optional[str] = None
    total_amount: float = 0.0
    tax_amount: Optional[float] = None
    net_payable: float = 0.0
    payment_status: str = "Pending"


class ClientInvoiceCreate(ClientInvoiceBase):
    pass


class ClientInvoiceUpdate(BaseModel):
    invoice_date: Optional[date] = None
    billing_period: Optional[str] = None
    total_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    net_payable: Optional[float] = None
    payment_status: Optional[str] = None


class ClientInvoiceOut(ClientInvoiceBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClientDocumentBase(BaseModel):
    document_type: str
    file_url: str
    expiry_date: Optional[date] = None
    remarks: Optional[str] = None


class ClientDocumentCreate(ClientDocumentBase):
    pass


class ClientDocumentUpdate(BaseModel):
    document_type: Optional[str] = None
    file_url: Optional[str] = None
    expiry_date: Optional[date] = None
    remarks: Optional[str] = None


class ClientDocumentOut(ClientDocumentBase):
    id: int
    client_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClientDetailOut(ClientOut):
    contacts: List[ClientContactOut]
    addresses: List[ClientAddressOut]
    sites: List[ClientSiteOut]
    contracts: List[ClientContractOut]
    rate_cards: List[ClientRateCardOut]
    invoices: List[ClientInvoiceOut]
    documents: List[ClientDocumentOut]
