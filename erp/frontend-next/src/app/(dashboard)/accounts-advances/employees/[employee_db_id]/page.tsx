"use client";

import {
  Badge,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatRs } from "@/lib/money";
import type {
  Employee,
  EmployeeAdvance,
  EmployeeAdvanceCreate,
  EmployeeAdvanceDeduction,
  EmployeeAdvanceDeductionUpsert,
  EmployeeAdvanceSummary,
} from "@/lib/types";

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function money(n: number): string {
  return formatRs(Number(n || 0), 2);
}

function parseSalaryAmount(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const cleaned = v.replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function getEmployeeSalary(emp: Employee | null): number {
  if (!emp) return 0;
  const total = parseSalaryAmount(emp.total_salary);
  if (total > 0) return total;
  const basic = parseSalaryAmount(emp.basic_salary);
  const allow = parseSalaryAmount(emp.allowances);
  const sum = basic + allow;
  return sum > 0 ? sum : 0;
}

function installmentSuggestions(balance: number): Array<{ months: number; amount: number }> {
  const b = Number(balance || 0);
  if (!(b > 0)) return [];
  const options = [1, 2, 3, 6, 12];
  return options
    .map((months) => ({ months, amount: Math.ceil(b / months) }))
    .filter((x) => Number.isFinite(x.amount) && x.amount > 0);
}

type AdvanceFormValues = {
  amount: number;
  note?: string;
  advance_date: dayjs.Dayjs;
};

type DeductionFormValues = {
  month: string;
  amount: number;
  note?: string;
};

export default function EmployeeAdvanceProfilePage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();
  const params = useParams();

  const employeeDbId = useMemo(() => {
    const rawAny = (params as unknown as { employee_db_id?: string | string[] })?.employee_db_id;
    const raw = Array.isArray(rawAny) ? rawAny[0] : rawAny;
    if (typeof raw !== "string" || !raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params]);

  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [summary, setSummary] = useState<EmployeeAdvanceSummary | null>(null);
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [deductions, setDeductions] = useState<EmployeeAdvanceDeduction[]>([]);

  const [advanceDrawerOpen, setAdvanceDrawerOpen] = useState(false);
  const [advanceForm] = Form.useForm<AdvanceFormValues>();

  const [deductionDrawerOpen, setDeductionDrawerOpen] = useState(false);
  const [deductionForm] = Form.useForm<DeductionFormValues>();

  const load = useCallback(async () => {
    if (employeeDbId === null) return;
    setLoading(true);
    try {
      const [emp, sum, adv, ded] = await Promise.all([
        api.get<Employee>(`/api/employees/by-db-id/${employeeDbId}`),
        api.get<EmployeeAdvanceSummary>(`/api/advances/employees/${employeeDbId}/summary`),
        api.get<EmployeeAdvance[]>(`/api/advances/employees/${employeeDbId}/advances`),
        api.get<EmployeeAdvanceDeduction[]>(`/api/advances/employees/${employeeDbId}/deductions`),
      ]);
      setEmployee(emp ?? null);
      setSummary(sum ?? null);
      setAdvances(Array.isArray(adv) ? adv : []);
      setDeductions(Array.isArray(ded) ? ded : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load employee profile"));
    } finally {
      setLoading(false);
    }
  }, [employeeDbId, msg]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateAdvance = useCallback(() => {
    const salary = getEmployeeSalary(employee);
    const recommended = salary > 0 ? Math.round(salary * 0.3) : 0;
    advanceForm.resetFields();
    advanceForm.setFieldsValue({
      amount: recommended,
      note: "",
      advance_date: dayjs(),
    });
    setAdvanceDrawerOpen(true);
  }, [advanceForm, employee]);

  const saveAdvance = useCallback(async () => {
    if (!employeeDbId) return;
    const v = await advanceForm.validateFields();
    try {
      const payload: EmployeeAdvanceCreate = {
        employee_db_id: employeeDbId,
        amount: Number(v.amount),
        note: v.note || null,
        advance_date: v.advance_date.format("YYYY-MM-DD"),
      };
      await api.post<EmployeeAdvance>(`/api/advances/employees/${employeeDbId}/advances`, payload);
      msg.success("Advance created");
      setAdvanceDrawerOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to create advance"));
    }
  }, [advanceForm, employeeDbId, load, msg]);

  const deleteAdvance = useCallback(
    async (advanceId: number) => {
      if (!employeeDbId) return;
      try {
        await api.del<{ ok: boolean }>(`/api/advances/employees/${employeeDbId}/advances/${advanceId}`);
        msg.success("Advance deleted");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to delete advance"));
      }
    },
    [employeeDbId, load, msg]
  );

  const openSetDeduction = useCallback(() => {
    deductionForm.resetFields();
    deductionForm.setFieldsValue({
      month: dayjs().format("YYYY-MM"),
      amount: 0,
      note: "",
    });
    setDeductionDrawerOpen(true);
  }, [deductionForm]);

  const saveDeduction = useCallback(async () => {
    if (!employeeDbId) return;
    const v = await deductionForm.validateFields();
    try {
      const payload: EmployeeAdvanceDeductionUpsert = {
        employee_db_id: employeeDbId,
        month: v.month,
        amount: Number(v.amount),
        note: v.note || null,
      };
      await api.put<EmployeeAdvanceDeduction>(`/api/advances/employees/${employeeDbId}/deductions`, payload);
      msg.success("Monthly deduction saved");
      setDeductionDrawerOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to save deduction"));
    }
  }, [deductionForm, employeeDbId, load, msg]);

  const deleteDeduction = useCallback(
    async (deductionId: number) => {
      if (!employeeDbId) return;
      try {
        await api.del<{ ok: boolean }>(`/api/advances/employees/${employeeDbId}/deductions/${deductionId}`);
        msg.success("Deduction deleted");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to delete deduction"));
      }
    },
    [employeeDbId, load, msg]
  );

  const advancesColumns: ColumnsType<EmployeeAdvance> = useMemo(
    () => [
      { title: "Date", dataIndex: "advance_date", key: "advance_date", width: 120 },
      { title: "Amount", dataIndex: "amount", key: "amount", width: 140, render: (v: number) => money(v) },
      { title: "Note", dataIndex: "note", key: "note" },
      {
        title: "",
        key: "actions",
        width: 70,
        render: (_, r) => (
          <Popconfirm
            title="Delete advance?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => void deleteAdvance(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      },
    ],
    [deleteAdvance]
  );

  const deductionsColumns: ColumnsType<EmployeeAdvanceDeduction> = useMemo(
    () => [
      { title: "Month", dataIndex: "month", key: "month", width: 120 },
      { title: "Amount", dataIndex: "amount", key: "amount", width: 140, render: (v: number) => money(v) },
      { title: "Note", dataIndex: "note", key: "note" },
      {
        title: "",
        key: "actions",
        width: 70,
        render: (_, r) => (
          <Popconfirm
            title="Delete deduction?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => void deleteDeduction(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
      },
    ],
    [deleteDeduction]
  );

  const headerTitle = useMemo(() => {
    if (!employee) return "Employee Profile";
    return `${employee.employee_id} — ${employee.first_name} ${employee.last_name}`;
  }, [employee]);

  return (
    <>
      {msgCtx}
      {employeeDbId === null && (
        <Alert
          type="error"
          showIcon
          message="Invalid employee link"
          description="The employee id in the URL is not valid. Please go back and try again."
          style={{ marginBottom: 12 }}
        />
      )}
      <Card
        title={<Typography.Title level={4} style={{ margin: 0 }}>{headerTitle}</Typography.Title>}
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/accounts-advances/employees")}>
              Back
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAdvance}>
              Create Advance
            </Button>
            <Button icon={<SaveOutlined />} onClick={openSetDeduction}>
              Set Monthly Deduction
            </Button>
          </Space>
        }
      >
        <Row gutter={12}>
          <Col span={8}>
            <Statistic
              title="Total Paid So Far"
              value={summary?.total_paid_so_far ?? 0}
              formatter={(v) => money(Number(v))}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Total Advances"
              value={summary?.total_advanced ?? 0}
              formatter={(v) => money(Number(v))}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Outstanding Advance Balance"
              value={summary?.balance ?? 0}
              formatter={(v) => money(Number(v))}
            />
          </Col>
        </Row>

        <Divider />

        <Row gutter={12}>
          <Col span={12}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>Advances</Typography.Title>
            <Table
              rowKey={(r) => r.id}
              size="small"
              loading={loading}
              columns={advancesColumns}
              dataSource={advances}
              pagination={{ pageSize: 10 }}
            />
          </Col>
          <Col span={12}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>Monthly Deductions</Typography.Title>
            <Table
              rowKey={(r) => r.id}
              size="small"
              loading={loading}
              columns={deductionsColumns}
              dataSource={deductions}
              pagination={{ pageSize: 10 }}
            />
          </Col>
        </Row>

        <Divider />
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          <Badge status="processing" text="Note" /> Deductions are stored per month (YYYY-MM). Payroll integration will use these values to deduct from salary.
        </Typography.Paragraph>
      </Card>

      <Drawer
        title="Create Advance"
        open={advanceDrawerOpen}
        onClose={() => setAdvanceDrawerOpen(false)}
        width={520}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setAdvanceDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => void saveAdvance()}>
              Save
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Salary
                </Typography.Text>
                <div>
                  <Typography.Text strong>
                    {(() => {
                      const salary = getEmployeeSalary(employee);
                      return salary > 0 ? money(salary) : "-";
                    })()}
                  </Typography.Text>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Recommended Advance
                </Typography.Text>
                <div>
                  <Typography.Text strong>
                    {(() => {
                      const salary = getEmployeeSalary(employee);
                      const recommended = salary > 0 ? Math.round(salary * 0.3) : 0;
                      return recommended > 0 ? money(recommended) : "-";
                    })()}
                  </Typography.Text>
                </div>
              </div>
            </div>

            <Alert
              type="info"
              showIcon
              message="Suggestion"
              description={
                <Space wrap>
                  <span>Recommended is ~30% of salary.</span>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => {
                      const salary = getEmployeeSalary(employee);
                      const recommended = salary > 0 ? Math.round(salary * 0.3) : 0;
                      advanceForm.setFieldsValue({ amount: recommended });
                    }}
                  >
                    Use Recommended
                  </Button>
                </Space>
              }
            />
          </Space>
        </div>

        <Form layout="vertical" form={advanceForm}>
          <Form.Item label="Amount" name="amount" rules={[{ required: true, message: "Amount is required" }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="Advance Date" name="advance_date" rules={[{ required: true, message: "Date is required" }]}
          >
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="Note" name="note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title="Set Monthly Deduction"
        open={deductionDrawerOpen}
        onClose={() => setDeductionDrawerOpen(false)}
        width={520}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDeductionDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => void saveDeduction()}>
              Save
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Outstanding Advance
                </Typography.Text>
                <div>
                  <Typography.Text strong>
                    {summary && typeof summary.balance === "number" && summary.balance > 0 ? money(summary.balance) : "-"}
                  </Typography.Text>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Installment Suggestions
                </Typography.Text>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Choose a plan to auto-fill amount
                  </Typography.Text>
                </div>
              </div>
            </div>

            {(() => {
              const bal = summary?.balance ?? 0;
              const sugg = installmentSuggestions(bal);
              if (sugg.length === 0) return null;
              return (
                <Alert
                  type="info"
                  showIcon
                  message="Suggestion"
                  description={
                    <Space wrap>
                      {sugg.map((s) => (
                        <Button
                          key={s.months}
                          size="small"
                          onClick={() => deductionForm.setFieldsValue({ amount: s.amount })}
                        >
                          {s.months === 12
                            ? `Full year: ${money(s.amount)}`
                            : `Complete ${s.months} month${s.months === 1 ? "" : "s"}: ${money(s.amount)}`}
                        </Button>
                      ))}
                    </Space>
                  }
                />
              );
            })()}
          </Space>
        </div>

        <Form layout="vertical" form={deductionForm}>
          <Form.Item
            label="Month (YYYY-MM)"
            name="month"
            rules={[{ required: true, message: "Month is required" }]}
          >
            <Input placeholder="2025-12" />
          </Form.Item>

          <Form.Item
            label="Deduction Amount"
            name="amount"
            rules={[{ required: true, message: "Amount is required" }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="Note" name="note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
