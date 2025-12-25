"use client";

import {
  AppstoreOutlined,
  CarOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { Area, Line, Pie } from "@ant-design/plots";
import { Button, Card, Col, DatePicker, Dropdown, Row, Space, Statistic, message } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { formatRs } from "@/lib/money";
import { useAuth } from "@/lib/auth";

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type PayrollReportResponse = {
  summary?: { total_net?: number; total_gross?: number; employees?: number };
  rows: Array<{ employee_id: string; paid_status?: string; net_pay?: number }>;
};

function payrollPeriodForMonth(month: string): { from: string; to: string } {
  const to = dayjs(month + "-01").date(25);
  const from = to.subtract(1, "month").date(26);
  return { from: from.format("YYYY-MM-DD"), to: to.format("YYYY-MM-DD") };
}

type ClientSummaryResponse = {
  month: string;
  total_cleared?: number;
  total_pending?: number;
  trend?: Array<{ month: string; value: number }>;
};

type AssignmentEfficiencyResponse = {
  total_km?: number;
  total_amount?: number;
  vehicles?: Array<{ vehicle_id: string; total_km?: number }>;
};

type EmployeeListResponse = {
  employees: unknown[];
  total: number;
};

export default function DashboardHomePage() {
  const [msg, msgCtx] = message.useMessage();
  const { has } = useAuth();

  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));

  const [clearedSummary, setClearedSummary] = useState<ClientSummaryResponse | null>(null);
  const [pendingSummary, setPendingSummary] = useState<ClientSummaryResponse | null>(null);
  const [payrollReport, setPayrollReport] = useState<PayrollReportResponse | null>(null);
  const [assignmentMonthSummary, setAssignmentMonthSummary] = useState<AssignmentEfficiencyResponse | null>(null);

  const [counts, setCounts] = useState<{
    employees: number;
    vehicles: number;
    clients: number;
    guns: number;
    inventoryTotal: number;
  }>({ employees: 0, vehicles: 0, clients: 0, guns: 0, inventoryTotal: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const period = payrollPeriodForMonth(month);
      const canClients = has("clients:view");
      const canPayroll = has("payroll:view");
      const canFleet = has("fleet:view");
      const canInv = has("inventory:view");

      const [cleared, pending, payroll, assignEff, empList, vehicles, clients, generalItems, restrictedItems] = await Promise.all([
        canClients
          ? api.get<ClientSummaryResponse>("/api/client-management/invoices/cleared-summary", { query: { month, months: 6 } })
          : Promise.resolve(null),
        canClients
          ? api.get<ClientSummaryResponse>("/api/client-management/invoices/pending-summary", { query: { month, months: 6 } })
          : Promise.resolve(null),
        canPayroll
          ? api.get<PayrollReportResponse>("/api/payroll/range-report", { query: { month, from_date: period.from, to_date: period.to } })
          : Promise.resolve(null),
        canFleet
          ? api.get<AssignmentEfficiencyResponse>("/api/vehicle-assignments/efficiency", { query: { period: "month", month } })
          : Promise.resolve(null),
        api.get<EmployeeListResponse>("/api/employees/", { query: { skip: 0, limit: 1, with_total: true } }),
        canFleet ? api.get<unknown[]>("/api/vehicles/", { query: { limit: 5000 } }) : Promise.resolve([]),
        canClients ? api.get<unknown[]>("/api/client-management/clients") : Promise.resolve([]),
        canInv ? api.get<unknown[]>("/api/general-inventory/items") : Promise.resolve([]),
        canInv ? api.get<unknown[]>("/api/restricted-inventory/items") : Promise.resolve([]),
      ]);

      setClearedSummary(cleared ?? null);
      setPendingSummary(pending ?? null);
      setPayrollReport(payroll ?? null);
      setAssignmentMonthSummary(assignEff ?? null);

      const vehiclesCount = Array.isArray(vehicles) ? vehicles.length : 0;
      const clientsCount = Array.isArray(clients) ? clients.length : 0;
      const generalCount = Array.isArray(generalItems) ? generalItems.length : 0;
      const gunsCount = Array.isArray(restrictedItems) ? restrictedItems.length : 0;

      setCounts({
        employees: Number(empList?.total ?? 0),
        vehicles: vehiclesCount,
        clients: clientsCount,
        guns: gunsCount,
        inventoryTotal: generalCount + gunsCount,
      });
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load dashboard"));
      setClearedSummary(null);
      setPendingSummary(null);
      setPayrollReport(null);
      setAssignmentMonthSummary(null);
      setCounts({ employees: 0, vehicles: 0, clients: 0, guns: 0, inventoryTotal: 0 });
    } finally {
      setLoading(false);
    }
  }, [has, month, msg]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const payrollRows = payrollReport?.rows ?? [];

    const payrollTotalNet = Number(payrollReport?.summary?.total_net ?? 0);

    const payrollPaid = payrollRows.reduce((a, r) => {
      const st = String(r.paid_status ?? "unpaid").toLowerCase();
      if (st !== "paid") return a;
      return a + Number(r.net_pay ?? 0);
    }, 0);

    const payrollDue = payrollRows.reduce((a, r) => {
      const st = String(r.paid_status ?? "unpaid").toLowerCase();
      if (st === "paid") return a;
      return a + Number(r.net_pay ?? 0);
    }, 0);

    return {
      receivablesPending: Number(pendingSummary?.total_pending ?? 0),
      receivablesCleared: Number(clearedSummary?.total_cleared ?? 0),
      payrollTotalNet,
      payrollPaid,
      payrollDue,
      kmCovered: Number(assignmentMonthSummary?.total_km ?? 0),
      assignmentCost: Number(assignmentMonthSummary?.total_amount ?? 0),
    };
  }, [assignmentMonthSummary?.total_amount, assignmentMonthSummary?.total_km, clearedSummary?.total_cleared, payrollReport?.rows, payrollReport?.summary?.total_net, pendingSummary?.total_pending]);

  const receivablesTrend = useMemo(() => {
    const byMonth = new Map<string, { month: string; pending: number; cleared: number }>();

    for (const r of pendingSummary?.trend ?? []) {
      byMonth.set(r.month, { month: r.month, pending: Number(r.value ?? 0), cleared: 0 });
    }
    for (const r of clearedSummary?.trend ?? []) {
      const existing = byMonth.get(r.month);
      if (existing) existing.cleared = Number(r.value ?? 0);
      else byMonth.set(r.month, { month: r.month, pending: 0, cleared: Number(r.value ?? 0) });
    }

    return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [clearedSummary?.trend, pendingSummary?.trend]);

  const receivablesLineConfig = useMemo(() => ({
    data: receivablesTrend,
    xField: "month",
    yField: "pending",
    height: 220,
    autoFit: true,
    smooth: true,
    color: "#0A84FF",
    lineStyle: { lineWidth: 3, shadowColor: "rgba(10,132,255,0.25)", shadowBlur: 12 },
    point: { size: 3, shape: "circle", style: { fill: "#ffffff", stroke: "#0A84FF", lineWidth: 2 } },
    xAxis: {
      tickLine: null,
      label: { formatter: (v: string) => dayjs(v + "-01").format("MMM") },
      line: null,
      grid: null,
    },
    yAxis: {
      label: { formatter: (v: string) => formatRs(Number(v || 0), 0) },
      grid: null,
      line: null,
    },
    tooltip: {
      formatter: (d: { month: string; pending: number }) => ({ name: `Pending (${d.month})`, value: formatRs(Number(d.pending || 0), 2) }),
      domStyles: {
        "g2-tooltip": {
          borderRadius: "12px",
          boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
          padding: "10px 12px",
        },
        "g2-tooltip-title": { fontWeight: "600" },
      },
    },
  }), [receivablesTrend]);

  const clearedAreaConfig = useMemo(() => ({
    data: receivablesTrend,
    xField: "month",
    yField: "cleared",
    height: 220,
    autoFit: true,
    smooth: true,
    color: "#30D158",
    lineStyle: { lineWidth: 2, shadowColor: "rgba(48,209,88,0.22)", shadowBlur: 12 },
    areaStyle: () => ({
      fill: "l(270) 0:rgba(48,209,88,0.30) 1:rgba(48,209,88,0.02)",
    }),
    xAxis: {
      tickLine: null,
      label: { formatter: (v: string) => dayjs(v + "-01").format("MMM") },
      line: null,
      grid: null,
    },
    yAxis: {
      label: { formatter: (v: string) => formatRs(Number(v || 0), 0) },
      grid: null,
      line: null,
    },
    tooltip: {
      formatter: (d: { month: string; cleared: number }) => ({ name: `Cleared (${d.month})`, value: formatRs(Number(d.cleared || 0), 2) }),
      domStyles: {
        "g2-tooltip": {
          borderRadius: "12px",
          boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
          padding: "10px 12px",
        },
        "g2-tooltip-title": { fontWeight: "600" },
      },
    },
  }), [receivablesTrend]);

  const payrollPieData = useMemo(() => {
    const due = Number(kpis.payrollDue || 0);
    const paid = Number(kpis.payrollPaid || 0);
    return [
      { type: "Due", value: due },
      { type: "Paid", value: paid },
    ].filter((x) => x.value > 0);
  }, [kpis.payrollDue, kpis.payrollPaid]);

  const payrollPieConfig = useMemo(() => ({
    data: payrollPieData,
    angleField: "value",
    colorField: "type",
    radius: 0.9,
    innerRadius: 0.62,
    height: 220,
    autoFit: true,
    color: ["#FF453A", "#30D158"],
    pieStyle: { lineWidth: 0 },
    statistic: {
      title: false,
      content: {
        style: {
          fontSize: "14px",
          fontWeight: 600,
          color: "rgba(0,0,0,0.72)",
        },
        customHtml: () => {
          const total = payrollPieData.reduce((a, r) => a + Number(r.value || 0), 0);
          return `<div style="text-align:center;line-height:1.2"><div style="font-size:12px;color:rgba(0,0,0,0.55)">Payroll</div><div style="font-size:14px;font-weight:600">${formatRs(total, 0)}</div></div>`;
        },
      },
    },
    legend: { position: "bottom" },
    label: false,
    tooltip: {
      formatter: (d: { type: string; value: number }) => ({ name: d.type, value: formatRs(Number(d.value || 0), 2) }),
      domStyles: {
        "g2-tooltip": {
          borderRadius: "12px",
          boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
          padding: "10px 12px",
        },
        "g2-tooltip-title": { fontWeight: "600" },
      },
    },
  }), [payrollPieData]);

  const exportAccountsMonthPdf = useCallback(async () => {
    try {
      const url = `${API_BASE_URL}/api/exports/accounts/monthly/pdf?month=${encodeURIComponent(month)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      downloadBlob(blob, `accounts_export_${month}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    }
  }, [month, msg]);

  const exportPayrollPdf = useCallback(async () => {
    try {
      const url = `${API_BASE_URL}/api/payroll/export/pdf?month=${encodeURIComponent(month)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      downloadBlob(blob, `payroll_${month}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    }
  }, [month, msg]);

  const header = useMemo(() => (
    <Row gutter={[10, 10]} align="middle" style={{ width: "100%" }}>
      <Col xs={24} md={14} style={{ minWidth: 0 }}>
        <></>
      </Col>
      <Col xs={24} md={10}>
        <Space wrap style={{ width: "100%", justifyContent: "flex-end" }}>
          <DatePicker
            picker="month"
            value={dayjs(month + "-01")}
            onChange={(d) => setMonth((d ?? dayjs()).format("YYYY-MM"))}
            style={{ width: "100%", maxWidth: 180 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
          <Dropdown
            placement="bottomRight"
            menu={{
              items: [
                { key: "accounts_pdf", label: "Export Accounts (Month) PDF", onClick: () => void exportAccountsMonthPdf() },
                { key: "payroll_pdf", label: "Export Payroll (Month) PDF", onClick: () => void exportPayrollPdf() },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />} />
          </Dropdown>
        </Space>
      </Col>
    </Row>
  ), [exportAccountsMonthPdf, exportPayrollPdf, load, loading, month]);

  return (
    <>
      {msgCtx}
      <Space direction="vertical" size={10} style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
        {header}

        <Card size="small" className="flash-card">
          <Row gutter={[8, 8]} style={{ width: "100%" }}>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(118, 211, 155, 0.14)" }}>
                <Statistic
                  title={<Space size={6}><TeamOutlined />Employees</Space>}
                  value={counts.employees}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(11, 58, 66, 0.06)" }}>
                <Statistic
                  title={<Space size={6}><CarOutlined />Vehicles</Space>}
                  value={counts.vehicles}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(118, 211, 155, 0.16)" }}>
                <Statistic
                  title={<Space size={6}><UserOutlined />Clients</Space>}
                  value={counts.clients}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(11, 58, 66, 0.08)" }}>
                <Statistic
                  title={<Space size={6}><AppstoreOutlined />Inventory</Space>}
                  value={counts.inventoryTotal}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(122, 31, 43, 0.10)" }}>
                <Statistic
                  title={<Space size={6}><SafetyCertificateOutlined />Guns</Space>}
                  value={counts.guns}
                  styles={{ content: { color: "#7A1F2B", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(122, 31, 43, 0.10)" }}>
                <Statistic
                  title={<Space size={6}><WalletOutlined />Client Due</Space>}
                  value={kpis.receivablesPending}
                  prefix="Rs"
                  precision={2}
                  styles={{ content: { color: "#7A1F2B", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(118, 211, 155, 0.14)" }}>
                <Statistic
                  title={<Space size={6}><CheckCircleOutlined />Client Paid</Space>}
                  value={kpis.receivablesCleared}
                  prefix="Rs"
                  precision={2}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(11, 58, 66, 0.06)" }}>
                <Statistic
                  title={<Space size={6}><WalletOutlined />Payroll Due</Space>}
                  value={kpis.payrollDue}
                  prefix="Rs"
                  precision={2}
                  styles={{ content: { color: "#7A1F2B", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(11, 58, 66, 0.06)" }}>
                <Statistic
                  title={<Space size={6}><WalletOutlined />Payroll Total Net</Space>}
                  value={kpis.payrollTotalNet}
                  prefix="Rs"
                  precision={2}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(118, 211, 155, 0.16)" }}>
                <Statistic
                  title={<Space size={6}><CheckCircleOutlined />Payroll Paid</Space>}
                  value={kpis.payrollPaid}
                  prefix="Rs"
                  precision={2}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(11, 58, 66, 0.06)" }}>
                <Statistic
                  title={<Space size={6}><CarOutlined />KM Covered</Space>}
                  value={kpis.kmCovered}
                  precision={2}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3}>
              <Card size="small" className="flash-card" style={{ height: 72, background: "rgba(11, 58, 66, 0.08)" }}>
                <Statistic
                  title={<Space size={6}><WalletOutlined />Assign Cost</Space>}
                  value={kpis.assignmentCost}
                  prefix="Rs"
                  precision={2}
                  styles={{ content: { color: "#0B3A42", fontSize: 18, lineHeight: "22px" } }}
                />
              </Card>
            </Col>
          </Row>
        </Card>

        <Row gutter={[10, 10]} style={{ width: "100%" }}>
          <Col xs={24} md={12}>
            <Card
              size="small"
              className="flash-card"
              style={{ width: "100%", height: 320, overflow: "hidden" }}
              styles={{ body: { height: 260, overflow: "hidden" } }}
              title="Receivables Pending (Trend)"
              extra={<Statistic value={kpis.receivablesPending} prefix="Rs" precision={2} />}
            >
              <Line {...receivablesLineConfig} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card
              size="small"
              className="flash-card"
              style={{ width: "100%", height: 320, overflow: "hidden" }}
              styles={{ body: { height: 260, overflow: "hidden" } }}
              title="Client Payments Cleared (Trend)"
              extra={<Statistic value={kpis.receivablesCleared} prefix="Rs" precision={2} />}
            >
              <Area {...clearedAreaConfig} />
            </Card>
          </Col>
        </Row>

        <Row gutter={[10, 10]} style={{ width: "100%" }}>
          <Col xs={24} md={12}>
            <Card
              size="small"
              className="flash-card"
              style={{ width: "100%", height: 320, overflow: "hidden" }}
              styles={{ body: { height: 260, overflow: "hidden" } }}
              title="Payroll (Paid vs Due)"
            >
              <Pie {...payrollPieConfig} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card
              size="small"
              className="flash-card"
              style={{ width: "100%", height: 320, overflow: "hidden" }}
              styles={{ body: { height: 260, overflow: "hidden" } }}
              title="Operations"
            >
              <Row gutter={[10, 10]}>
                <Col xs={24} sm={12}>
                  <Statistic title="Cost per KM" value={kpis.kmCovered > 0 ? kpis.assignmentCost / kpis.kmCovered : 0} prefix="Rs" precision={2} />
                </Col>
                <Col xs={24} sm={12}>
                  <Statistic title="KM Covered" value={kpis.kmCovered} precision={2} />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Space>
    </>
  );
}
