from pydantic import BaseModel, Field


class PayrollPaymentStatusUpsert(BaseModel):
    month: str = Field(..., min_length=7, max_length=7)  # YYYY-MM
    employee_id: str = Field(..., min_length=1)
    status: str = Field(..., min_length=1)  # paid|unpaid


class PayrollPaymentStatusOut(PayrollPaymentStatusUpsert):
    id: int
    employee_db_id: int | None = None
    net_pay_snapshot: float | None = None

    class Config:
        from_attributes = True
