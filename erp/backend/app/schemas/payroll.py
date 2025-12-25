from typing import List

from pydantic import BaseModel


class PayrollEmployeeRow(BaseModel):
    employee_db_id: int
    employee_id: str
    name: str
    department: str
    shift_type: str

    # Employee number in the system
    serial_no: str | None = None
    # Optional extra identifier used in printed sheet
    fss_no: str | None = None
    # EOBI number
    eobi_no: str | None = None

    base_salary: float
    allowances: float

    working_days: int = 0
    day_rate: float = 0.0
    payable_days: int = 0
    basic_earned: float = 0.0

    pre_days: int = 0
    cur_days: int = 0
    leave_encashment_days: int = 0

    total_days: int = 0
    total_salary: float = 0.0

    present_days: int
    late_days: int
    absent_days: int
    paid_leave_days: int
    unpaid_leave_days: int
    unmarked_days: int = 0

    overtime_minutes: int
    overtime_pay: float

    overtime_rate: float = 0.0

    late_minutes: int
    late_deduction: float

    late_rate: float = 0.0

    fine_deduction: float = 0.0

    # Sheet fields (editable per payroll period)
    allow_other: float = 0.0
    eobi: float = 0.0
    tax: float = 0.0
    fine_adv_extra: float = 0.0
    fine_adv: float = 0.0
    remarks: str | None = None
    bank_cash: str | None = None

    bank_name: str | None = None
    account_number: str | None = None

    unpaid_leave_deduction: float

    advance_deduction: float = 0.0

    gross_pay: float
    net_pay: float

    paid_status: str = "unpaid"


class PayrollReport(BaseModel):
    month: str  # YYYY-MM
    rows: List[PayrollEmployeeRow]


class PayrollSummary(BaseModel):
    month: str
    employees: int
    total_gross: float
    total_net: float


class PayrollReportResponse(BaseModel):
    month: str
    summary: PayrollSummary
    rows: List[PayrollEmployeeRow]
