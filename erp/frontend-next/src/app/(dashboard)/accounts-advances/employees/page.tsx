"use client";

import { Button, Card, Checkbox, Col, DatePicker, Drawer, Dropdown, Input, List, message, Row, Segmented, Space, Statistic, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, SearchOutlined, TeamOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, Column, Line, Pie } from "@ant-design/plots";
import { api } from "@/lib/api";
import type { Employee, EmployeeAdvanceMonthRow, EmployeeAdvanceSummary, PayrollEmployeeRow, PayrollReportResponse, EmployeeAdvancesMonthSummary, VehicleAssignment, VehicleAssignmentEfficiencyResponse } from "@/lib/types";
import { formatRs } from "@/lib/money";
import { API_BASE_URL } from "@/lib/config";

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }

  return fallback;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsvLine(values: unknown[]): string {
  return values.map(csvEscape).join(",");
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

type ClearedPaymentsSummary = {
  month: string;
  total_cleared: number;
  trend: Array<{ month: string; value: number }>;
};

function payrollPeriodForMonth(month: string): { from: string; to: string } {
  const to = dayjs(month + "-01").date(25);
  const from = to.subtract(1, "month").date(26);
  return { from: from.format("YYYY-MM-DD"), to: to.format("YYYY-MM-DD") };
}

export default function EmployeeRecordsPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const [showGraphs, setShowGraphs] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");

  const [advancesMonthSummary, setAdvancesMonthSummary] = useState<EmployeeAdvancesMonthSummary | null>(null);
  const [advancesMonthRows, setAdvancesMonthRows] = useState<EmployeeAdvanceMonthRow[]>([]);
  const [assignmentsMonthSummary, setAssignmentsMonthSummary] = useState<VehicleAssignmentEfficiencyResponse | null>(null);

  const [clearedPaymentsSummary, setClearedPaymentsSummary] = useState<ClearedPaymentsSummary | null>(null);
  const [clearedPaymentsTrend, setClearedPaymentsTrend] = useState<Array<{ month: string; value: number }>>([]);

  const [payrollDueTrend, setPayrollDueTrend] = useState<Array<{ month: string; value: number }>>([]);
  const [fuelSpendMonthTrend, setFuelSpendMonthTrend] = useState<Array<{ month: string; value: number }>>([]);
  const [advancesTakenMonthTrend, setAdvancesTakenMonthTrend] = useState<Array<{ month: string; value: number }>>([]);

  const [pendingClientReceivablesSummary, setPendingClientReceivablesSummary] = useState<null | { month: string; total_pending: number }>(null);

  const [payrollNetMarkedThisMonth, setPayrollNetMarkedThisMonth] = useState(0);

  const [payrollByEmployeeId, setPayrollByEmployeeId] = useState<
    Record<string, { paid_status: "paid" | "unpaid"; net_pay: number }>
  >({});
  const [payrollRows, setPayrollRows] = useState<PayrollEmployeeRow[]>([]);
  const [advanceSummaryByEmployeeDbId, setAdvanceSummaryByEmployeeDbId] = useState<Record<number, EmployeeAdvanceSummary>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("employee_records_show_graphs");
      if (raw === null) return;
      setShowGraphs(raw === "1");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("employee_records_show_graphs", showGraphs ? "1" : "0");
    } catch {
      // ignore
    }
  }, [showGraphs]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use Employee2 API
      const data = await api.get<{ employees: any[]; total: number }>("/api/employees2/", {
        query: {
          skip: 0,
          limit: 50,
          with_total: false,
          search: q.trim() || undefined,
        },
      });

      const emps = Array.isArray(data?.employees) ? data.employees : [];
      // Map Employee2 fields to match expected structure
      const mappedEmps = emps.map((e: any) => ({
        ...e,
        employee_id: e.fss_no || e.serial_no || String(e.id),
        first_name: e.name?.split(" ")[0] || e.name || "",
        last_name: e.name?.split(" ").slice(1).join(" ") || "",
      }));
      setEmployees(mappedEmps);

      try {
        const period = payrollPeriodForMonth(month);
        const rep = await api.get<PayrollReportResponse>("/api/payroll/range-report", {
          query: { month, from_date: period.from, to_date: period.to },
        });

        setPayrollNetMarkedThisMonth(Number(rep?.summary?.total_net ?? 0));
        const map: Record<string, { paid_status: "paid" | "unpaid"; net_pay: number }> = {};
        for (const r of rep?.rows ?? []) {
          const st = (r.paid_status || "unpaid").toLowerCase() === "paid" ? "paid" : "unpaid";
          map[r.employee_id] = { paid_status: st, net_pay: Number(r.net_pay || 0) };
        }
        setPayrollByEmployeeId(map);
        setPayrollRows(Array.isArray(rep?.rows) ? rep.rows : []);
      } catch {
        setPayrollNetMarkedThisMonth(0);
        setPayrollByEmployeeId({});
        setPayrollRows([]);
      }

      try {
        const months: string[] = [];
        for (let i = 5; i >= 0; i -= 1) {
          months.push(dayjs(month + "-01").subtract(i, "month").format("YYYY-MM"));
        }

        const reps = await Promise.all(
          months.map((m) => {
            const period = payrollPeriodForMonth(m);
            return api.get<PayrollReportResponse>("/api/payroll/range-report", {
              query: { month: m, from_date: period.from, to_date: period.to },
            });
          })
        );

        const trend = months.map((m, idx) => {
          const rep = reps[idx];
          const due = (rep?.rows ?? []).reduce((a, r) => {
            const st = (r.paid_status || "unpaid").toLowerCase() === "paid" ? "paid" : "unpaid";
            if (st === "paid") return a;
            return a + Number(r.net_pay || 0);
          }, 0);
          return { month: m, value: Number(due || 0) };
        });
        setPayrollDueTrend(trend);
      } catch {
        setPayrollDueTrend([]);
      }

      try {
        const adv = await api.get<EmployeeAdvancesMonthSummary>("/api/advances/summary", { query: { month } });
        setAdvancesMonthSummary(adv ?? null);
      } catch {
        setAdvancesMonthSummary(null);
      }

      try {
        const advRows = await api.get<EmployeeAdvanceMonthRow[]>("/api/advances/monthly", { query: { month } });
        setAdvancesMonthRows(Array.isArray(advRows) ? advRows : []);
      } catch {
        setAdvancesMonthRows([]);
      }

      try {
        const pending = await api.get<{ month: string; total_pending: number }>("/api/client-management/invoices/pending-summary", {
          query: { month, months: 1 },
        });
        setPendingClientReceivablesSummary(pending ?? null);
      } catch {
        setPendingClientReceivablesSummary(null);
      }

      try {
        const asg = await api.get<VehicleAssignmentEfficiencyResponse>("/api/vehicle-assignments/efficiency", {
          query: { period: "month", month },
        });
        setAssignmentsMonthSummary(asg ?? null);
      } catch {
        setAssignmentsMonthSummary(null);
      }

      try {
        const months: string[] = [];
        for (let i = 5; i >= 0; i -= 1) {
          months.push(dayjs(month + "-01").subtract(i, "month").format("YYYY-MM"));
        }
        const reps = await Promise.all(
          months.map((m) => api.get<VehicleAssignmentEfficiencyResponse>("/api/vehicle-assignments/efficiency", { query: { period: "month", month: m } }))
        );
        const spendTrend = months.map((m, idx) => ({ month: m, value: Number(reps[idx]?.total_amount ?? 0) }));
        setFuelSpendMonthTrend(spendTrend);
      } catch {
        setFuelSpendMonthTrend([]);
      }

      try {
        const months: string[] = [];
        for (let i = 5; i >= 0; i -= 1) {
          months.push(dayjs(month + "-01").subtract(i, "month").format("YYYY-MM"));
        }
        const reps = await Promise.all(
          months.map((m) => api.get<EmployeeAdvancesMonthSummary>("/api/advances/summary", { query: { month: m } }))
        );
        const trend = months.map((m, idx) => ({ month: m, value: Number(reps[idx]?.total_advanced ?? 0) }));
        setAdvancesTakenMonthTrend(trend);
      } catch {
        setAdvancesTakenMonthTrend([]);
      }

      try {
        const rep = await api.get<ClearedPaymentsSummary>("/api/client-management/invoices/cleared-summary", {
          query: { month, months: 6 },
        });
        setClearedPaymentsSummary(rep ?? null);
        setClearedPaymentsTrend(Array.isArray(rep?.trend) ? rep.trend : []);
      } catch {
        setClearedPaymentsSummary(null);
        setClearedPaymentsTrend([]);
      }

      try {
        const sums = await Promise.all(
          emps.map((e) => api.get<EmployeeAdvanceSummary>(`/api/advances/employees/${e.id}/summary`))
        );
        const next: Record<number, EmployeeAdvanceSummary> = {};
        for (const s of sums) {
          if (s && typeof s.employee_db_id === "number") next[s.employee_db_id] = s;
        }
        setAdvanceSummaryByEmployeeDbId(next);
      } catch {
        setAdvanceSummaryByEmployeeDbId({});
      }
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load employees"));
      setEmployees([]);
      setPayrollByEmployeeId({});
      setPayrollRows([]);
      setAdvanceSummaryByEmployeeDbId({});
      setAdvancesMonthSummary(null);
      setAdvancesMonthRows([]);
      setAssignmentsMonthSummary(null);
      setPayrollDueTrend([]);
      setFuelSpendMonthTrend([]);
      setAdvancesTakenMonthTrend([]);
      setClearedPaymentsSummary(null);
      setClearedPaymentsTrend([]);
      setPendingClientReceivablesSummary(null);
    } finally {
      setLoading(false);
    }
  }, [month, msg, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = useMemo(() => (
    <Space>
      <TeamOutlined />
      <span>Accounts</span>
    </Space>
  ), []);

  const filteredEmployees = useMemo(() => {
    if (paidFilter === "all") return employees;
    return employees.filter((e) => {
      const p = payrollByEmployeeId[e.employee_id];
      const st = p?.paid_status ?? "unpaid";
      return st === paidFilter;
    });
  }, [employees, paidFilter, payrollByEmployeeId]);

  const kpis = useMemo(() => {
    const paidCount = filteredEmployees.filter((e) => (payrollByEmployeeId[e.employee_id]?.paid_status ?? "unpaid") === "paid").length;
    const totalPaidThisMonth = filteredEmployees.reduce((a, e) => {
      const p = payrollByEmployeeId[e.employee_id];
      if (!p || p.paid_status !== "paid") return a;
      return a + Number(p.net_pay || 0);
    }, 0);
    const totalPayrollDueThisMonth = filteredEmployees.reduce((a, e) => {
      const p = payrollByEmployeeId[e.employee_id];
      if (!p || p.paid_status !== "unpaid") return a;
      return a + Number(p.net_pay || 0);
    }, 0);

    const netSalaryMarkedThisMonth = Number(payrollNetMarkedThisMonth || 0);

    const totalAdvancesTaken = filteredEmployees.reduce((a, e) => {
      const s = advanceSummaryByEmployeeDbId[e.id];
      return a + Number(s?.total_advanced ?? 0);
    }, 0);
    const totalAdvancesTakenThisMonth = filteredEmployees.reduce((a, e) => {
      const by = advancesMonthSummary?.by_employee_db_id;
      const v = by ? Number(by[e.id] ?? 0) : 0;
      return a + v;
    }, 0);

    const kmCoveredThisMonth = Number(assignmentsMonthSummary?.total_km ?? 0);
    const assignmentCostThisMonth = Number(assignmentsMonthSummary?.total_amount ?? 0);
    const clientClearedThisMonth = Number(clearedPaymentsSummary?.total_cleared ?? 0);
    const pendingClientReceivablesThisMonth = Number(pendingClientReceivablesSummary?.total_pending ?? 0);

    return {
      paidCount,
      netSalaryMarkedThisMonth,
      totalPaidThisMonth,
      totalPayrollDueThisMonth,
      totalAdvancesTaken,
      totalAdvancesTakenThisMonth,
      assignmentCostThisMonth,
      kmCoveredThisMonth,
      clientClearedThisMonth,
      pendingClientReceivablesThisMonth,
      employees: filteredEmployees.length,
    };
  }, [advanceSummaryByEmployeeDbId, advancesMonthSummary, assignmentsMonthSummary, clearedPaymentsSummary, filteredEmployees, payrollByEmployeeId, payrollNetMarkedThisMonth, pendingClientReceivablesSummary]);

  const payrollDueRows = useMemo(() => {
    return (payrollRows ?? []).filter((r) => String(r.paid_status || "unpaid").toLowerCase() !== "paid");
  }, [payrollRows]);

  const payrollPaidRows = useMemo(() => {
    return (payrollRows ?? []).filter((r) => String(r.paid_status || "unpaid").toLowerCase() === "paid");
  }, [payrollRows]);

  const payrollColumns: ColumnsType<PayrollEmployeeRow> = useMemo(
    () => [
      { title: "Emp ID", dataIndex: "employee_id", key: "employee_id", width: 120 },
      { title: "Name", dataIndex: "name", key: "name" },
      { title: "Department", dataIndex: "department", key: "department", width: 140 },
      { title: "Shift", dataIndex: "shift_type", key: "shift_type", width: 120 },
      {
        title: "Net Pay",
        dataIndex: "net_pay",
        key: "net_pay",
        width: 140,
        render: (v: number) => formatRs(Number(v || 0), 2),
      },
      { title: "Status", dataIndex: "paid_status", key: "paid_status", width: 110 },
    ],
    []
  );

  const advancesColumns: ColumnsType<EmployeeAdvanceMonthRow> = useMemo(
    () => [
      { title: "Date", dataIndex: "advance_date", key: "advance_date", width: 120 },
      { title: "Emp ID", dataIndex: "employee_id", key: "employee_id", width: 120 },
      { title: "Employee", dataIndex: "employee_name", key: "employee_name" },
      {
        title: "Amount",
        dataIndex: "amount",
        key: "amount",
        width: 140,
        render: (v: number) => formatRs(Number(v || 0), 2),
      },
      { title: "Note", dataIndex: "note", key: "note" },
    ],
    []
  );

  const fuelSpendMonthlyAreaConfig = useMemo(() => ({
    data: fuelSpendMonthTrend,
    xField: "month",
    yField: "value",
    height: 220,
    autoFit: true,
    padding: [12, 12, 24, 56] as [number, number, number, number],
    smooth: true,
    color: "#52c41a",
    areaStyle: () => ({
      fill: "l(270) 0:#e6fffb 0.5:#b7eb8f 1:#52c41a",
      fillOpacity: 0.85,
    }),
    xAxis: {
      tickLine: null,
      label: {
        formatter: (v: string) => dayjs(v + "-01").format("MMM"),
      },
    },
    yAxis: {
      label: {
        formatter: (v: string) => formatRs(Number(v || 0), 0),
      },
    },
    tooltip: {
      formatter: (d: { month: string; value: number }) => ({
        name: d.month,
        value: formatRs(Number(d.value || 0), 2),
      }),
    },
  }), [fuelSpendMonthTrend]);

  const kmByVehicleForMonth = useMemo(() => {
    const rows = (assignmentsMonthSummary?.vehicles ?? [])
      .map((v) => ({ vehicle: v.vehicle_id, km: Number(v.total_km ?? 0) }))
      .filter((x) => x.km > 0)
      .sort((a, b) => b.km - a.km);

    const top = rows.slice(0, 7);
    const rest = rows.slice(7);
    const othersKm = rest.reduce((a, r) => a + r.km, 0);
    const out = [...top];
    if (othersKm > 0) out.push({ vehicle: "Others", km: othersKm });
    return out;
  }, [assignmentsMonthSummary]);

  const kmPieConfig = useMemo(() => ({
    data: kmByVehicleForMonth,
    angleField: "km",
    colorField: "vehicle",
    radius: 0.9,
    innerRadius: 0.55,
    color: ["#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#13c2c2", "#eb2f96", "#a0d911", "#2f54eb"],
    height: 220,
    autoFit: true,
    padding: [12, 12, 12, 12] as [number, number, number, number],
    legend: { position: "bottom" },
    label: false,
    tooltip: {
      formatter: (d: { vehicle: string; km: number }) => ({
        name: d.vehicle,
        value: `${Number(d.km || 0).toFixed(2)} km`,
      }),
    },
  }), [kmByVehicleForMonth]);

  const advancesTakenMonthlyBarConfig = useMemo(() => ({
    data: advancesTakenMonthTrend,
    xField: "month",
    yField: "value",
    height: 220,
    autoFit: true,
    padding: [12, 12, 24, 56] as [number, number, number, number],
    xAxis: {
      tickLine: null,
      label: {
        formatter: (v: string) => dayjs(v + "-01").format("MMM"),
      },
    },
    yAxis: {
      label: {
        formatter: (v: string) => formatRs(Number(v || 0), 0),
      },
    },
    color: "#1677ff",
    tooltip: {
      formatter: (d: { month: string; value: number }) => ({
        name: d.month,
        value: formatRs(Number(d.value || 0), 2),
      }),
    },
  }), [advancesTakenMonthTrend]);

  const advancesLifetimeTop = useMemo(() => {
    const items = employees
      .map((e) => {
        const s = advanceSummaryByEmployeeDbId[e.id];
        return {
          name: e.name || e.employee_id || e.serial_no || `ID:${e.id}`,
          value: Number(s?.total_advanced ?? 0),
        };
      })
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    return items;
  }, [advanceSummaryByEmployeeDbId, employees]);

  const advancesLifetimeBarConfig = useMemo(() => ({
    data: advancesLifetimeTop,
    xField: "name",
    yField: "value",
    height: 220,
    autoFit: true,
    padding: [12, 12, 24, 56] as [number, number, number, number],
    xAxis: { tickLine: null },
    yAxis: {
      label: {
        formatter: (v: string) => formatRs(Number(v || 0), 0),
      },
    },
    color: "#1677ff",
    tooltip: {
      formatter: (d: { name: string; value: number }) => ({
        name: d.name,
        value: formatRs(Number(d.value || 0), 2),
      }),
    },
  }), [advancesLifetimeTop]);

  const money = useCallback((n: number) => formatRs(Number(n || 0), 2), []);

  const exportPayrollPdf = useCallback(async () => {
    try {
      const url = `${API_BASE_URL}/api/payroll/export/pdf?month=${encodeURIComponent(month)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      const blob = await res.blob();
      downloadBlob(blob, `payroll_${month}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "PDF export failed"));
    }
  }, [month, msg]);

  const exportMonthDetailsCsv = useCallback(async () => {
    setExporting(true);
    try {
      const start = dayjs(month + "-01").startOf("month").format("YYYY-MM-DD");
      const end = dayjs(month + "-01").endOf("month").format("YYYY-MM-DD");

      const payrollPeriod = payrollPeriodForMonth(month);

      const [payroll, advances, advancesRows, assignEff, assignments] = await Promise.all([
        api.get<PayrollReportResponse>("/api/payroll/range-report", { query: { month, from_date: payrollPeriod.from, to_date: payrollPeriod.to } }),
        api.get<EmployeeAdvancesMonthSummary>("/api/advances/summary", { query: { month } }),
        api.get<EmployeeAdvanceMonthRow[]>("/api/advances/monthly", { query: { month } }),
        api.get<VehicleAssignmentEfficiencyResponse>("/api/vehicle-assignments/efficiency", { query: { period: "month", month } }),
        api.get<VehicleAssignment[]>("/api/vehicle-assignments/", { query: { status: "Complete", from_date: start, to_date: end, limit: 5000 } }),
      ]);

      const lines: string[] = [];

      lines.push(toCsvLine(["SECTION", "MONTH", month]));
      lines.push("");

      lines.push(toCsvLine(["SUMMARY"]));
      lines.push(toCsvLine(["payroll_due_unpaid", kpis.totalPayrollDueThisMonth]));
      lines.push(toCsvLine(["payroll_paid", kpis.totalPaidThisMonth]));
      lines.push(toCsvLine(["client_payments_cleared", kpis.clientClearedThisMonth]));
      lines.push(toCsvLine(["fuel_spend_on_assignments", kpis.assignmentCostThisMonth]));
      lines.push(toCsvLine(["km_covered", kpis.kmCoveredThisMonth]));
      lines.push(toCsvLine(["advances_taken_month", kpis.totalAdvancesTakenThisMonth]));
      lines.push(toCsvLine(["advances_total_lifetime", kpis.totalAdvancesTaken]));
      lines.push(toCsvLine(["pending_client_receivables", kpis.pendingClientReceivablesThisMonth]));
      lines.push("");

      const payrollAll = payroll?.rows ?? [];
      const payrollDue = payrollAll.filter((r) => String(r.paid_status || "unpaid").toLowerCase() !== "paid");
      const payrollPaid = payrollAll.filter((r) => String(r.paid_status || "unpaid").toLowerCase() === "paid");

      lines.push(toCsvLine(["PAYROLL_DUE_UNPAID"]));
      lines.push(
        toCsvLine([
          "employee_id",
          "name",
          "department",
          "shift_type",
          "gross_pay",
          "advance_deduction",
          "net_pay",
          "paid_status",
        ])
      );
      for (const r of payrollDue) {
        lines.push(
          toCsvLine([
            r.employee_id,
            r.name,
            r.department,
            r.shift_type,
            r.gross_pay,
            (r as unknown as { advance_deduction?: unknown }).advance_deduction ?? 0,
            r.net_pay,
            r.paid_status,
          ])
        );
      }
      lines.push("");

      lines.push(toCsvLine(["PAYROLL_PAID"]));
      lines.push(
        toCsvLine([
          "employee_id",
          "name",
          "department",
          "shift_type",
          "gross_pay",
          "advance_deduction",
          "net_pay",
          "paid_status",
        ])
      );
      for (const r of payrollPaid) {
        lines.push(
          toCsvLine([
            r.employee_id,
            r.name,
            r.department,
            r.shift_type,
            r.gross_pay,
            (r as unknown as { advance_deduction?: unknown }).advance_deduction ?? 0,
            r.net_pay,
            r.paid_status,
          ])
        );
      }
      lines.push("");

      lines.push(toCsvLine(["ADVANCES_TAKEN_MONTH"]));
      lines.push(toCsvLine(["advance_date", "employee_id", "employee_name", "amount", "note"]));
      for (const r of Array.isArray(advancesRows) ? advancesRows : []) {
        lines.push(toCsvLine([r.advance_date, r.employee_id, r.employee_name, r.amount, r.note ?? ""]));
      }
      lines.push("");

      lines.push(toCsvLine(["PAYROLL_REPORT"]));
      lines.push(
        toCsvLine([
          "employee_id",
          "name",
          "department",
          "shift_type",
          "gross_pay",
          "advance_deduction",
          "net_pay",
          "paid_status",
        ])
      );
      for (const r of payroll?.rows ?? []) {
        lines.push(
          toCsvLine([
            r.employee_id,
            r.name,
            r.department,
            r.shift_type,
            r.gross_pay,
            (r as unknown as { advance_deduction?: unknown }).advance_deduction ?? 0,
            r.net_pay,
            r.paid_status,
          ])
        );
      }
      lines.push("");

      lines.push(toCsvLine(["ADVANCES_MONTH_SUMMARY"]));
      lines.push(toCsvLine(["employee_db_id", "amount"]));
      const by = advances?.by_employee_db_id ?? {};
      for (const [employeeDbId, amount] of Object.entries(by)) {
        lines.push(toCsvLine([employeeDbId, amount]));
      }
      lines.push("");

      lines.push(toCsvLine(["VEHICLE_ASSIGNMENTS_EFFICIENCY"]));
      lines.push(toCsvLine(["total_km", assignEff?.total_km ?? 0]));
      lines.push(toCsvLine(["total_amount", assignEff?.total_amount ?? 0]));
      lines.push("");

      lines.push(toCsvLine(["VEHICLE_ASSIGNMENTS_LIST"]));
      lines.push(toCsvLine(["id", "assignment_date", "vehicle_id", "status", "distance_km", "rate_per_km", "amount", "route_from", "route_to"]));
      for (const a of Array.isArray(assignments) ? assignments : []) {
        lines.push(
          toCsvLine([
            a.id,
            a.assignment_date,
            a.vehicle_id,
            a.status,
            a.distance_km ?? "",
            a.rate_per_km ?? "",
            a.amount ?? "",
            a.route_from,
            a.route_to,
          ])
        );
      }

      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `accounts_export_${month}.csv`);
      msg.success("Export created");
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  }, [kpis, month, msg]);

  const exportMonthDetailsPdf = useCallback(async () => {
    setExporting(true);
    try {
      const url = `${API_BASE_URL}/api/exports/accounts/monthly/pdf?month=${encodeURIComponent(month)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      const blob = await res.blob();
      downloadBlob(blob, `accounts_export_${month}.pdf`);
      msg.success("Export created");
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  }, [month, msg]);

  const payrollDueLineConfig = useMemo(() => ({
    data: payrollDueTrend,
    xField: "month",
    yField: "value",
    height: 220,
    autoFit: true,
    smooth: true,
    color: "#ef4444",
    padding: [12, 12, 24, 56] as [number, number, number, number],
    tooltip: {
      formatter: (d: { month: string; value: number }) => ({ name: "Due", value: formatRs(Number(d.value || 0), 2) }),
    },
    xAxis: {
      tickLine: null,
      label: {
        formatter: (v: string) => dayjs(v + "-01").format("MMM"),
      },
    },
    yAxis: {
      label: {
        formatter: (v: string) => formatRs(Number(v || 0), 0),
      },
      grid: null,
    },
  }), [payrollDueTrend]);

  const clearedPaymentsLineConfig = useMemo(() => ({
    data: clearedPaymentsTrend,
    xField: "month",
    yField: "value",
    height: 220,
    autoFit: true,
    smooth: true,
    padding: [12, 12, 24, 56] as [number, number, number, number],
    tooltip: {
      formatter: (d: { month: string; value: number }) => ({
        name: "Cleared",
        value: formatRs(Number(d.value || 0), 2),
      }),
    },
    xAxis: {
      tickLine: null,
      label: {
        formatter: (v: string) => dayjs(v + "-01").format("MMM"),
      },
    },
    yAxis: {
      label: {
        formatter: (v: string) => formatRs(Number(v || 0), 0),
      },
      grid: null,
    },
    color: "#fa8c16",
  }), [clearedPaymentsTrend]);

  const exportPayrollCsv = useCallback(async () => {
    try {
      const period = payrollPeriodForMonth(month);
      const rep = await api.get<PayrollReportResponse>("/api/payroll/range-report", { query: { month, from_date: period.from, to_date: period.to } });
      const headers = [
        "employee_id",
        "name",
        "department",
        "shift_type",
        "gross_pay",
        "advance_deduction",
        "net_pay",
        "paid_status",
      ];
      const lines = [headers.join(",")];
      for (const r of rep?.rows ?? []) {
        const row = [
          r.employee_id,
          r.name,
          r.department,
          r.shift_type,
          String(r.gross_pay ?? 0),
          String((r as unknown as { advance_deduction?: unknown }).advance_deduction ?? 0),
          String(r.net_pay ?? 0),
          String(r.paid_status ?? "unpaid"),
        ];
        lines.push(row.map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
          return s;
        }).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `payroll_${month}.csv`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "CSV export failed"));
    }
  }, [month, msg]);

  return (
    <>
      {msgCtx}
      <Card
        title={title}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
            <Dropdown
              menu={{
                items: [
                  { key: "csv", label: "Export CSV (Month)", onClick: () => void exportMonthDetailsCsv() },
                  { key: "pdf", label: "Export PDF (Month)", onClick: () => void exportMonthDetailsPdf() },
                ],
              }}
              placement="bottomRight"
            >
              <Button loading={exporting}>
                Export
              </Button>
            </Dropdown>
            <Button type="primary" onClick={() => setDrawerOpen(true)}>
              Open Search
            </Button>
          </Space>
        }
      >
        <Space wrap style={{ width: "100%", justifyContent: "space-between", marginBottom: 12 }}>
          <DatePicker
            picker="month"
            value={dayjs(month + "-01")}
            onChange={(d) => setMonth((d ?? dayjs()).format("YYYY-MM"))}
            style={{ width: 220 }}
          />
          <Segmented
            value={paidFilter}
            options={[
              { label: "All", value: "all" },
              { label: "Paid", value: "paid" },
              { label: "Unpaid", value: "unpaid" },
            ]}
            onChange={(v) => setPaidFilter(v as "all" | "paid" | "unpaid")}
          />
        </Space>

        <Card size="small" style={{ borderRadius: 12, marginBottom: 12 }}>
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12}>
              <Card size="small" style={{ borderRadius: 12, height: 96, background: "#ecfeff", border: "1px solid #a5f3fc" }}>
                <Statistic
                  title="Net Salary (Marked)"
                  value={kpis.netSalaryMarkedThisMonth}
                  prefix="Rs"
                  precision={2}
                  styles={{ content: { color: "#0e7490"  }}}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card size="small" style={{ borderRadius: 12, height: 96, background: "#fef2f2", border: "1px solid #fecaca" }}>
                <Statistic title="Payroll Due (Unpaid)" value={kpis.totalPayrollDueThisMonth} prefix="Rs" precision={2} styles={{ content: { color: "#b91c1c"  }}} />
              </Card>
            </Col>
          </Row>
        </Card>
      </Card>

      <Drawer
        title="Search Employee"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={860}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={() => void load()}
            placeholder="Search by employee id, name, email, mobile..."
            prefix={<SearchOutlined />}
            allowClear
          />

          <Button type="primary" onClick={() => void load()} loading={loading} block>
            Search
          </Button>

          <List
            bordered
            loading={loading}
            dataSource={filteredEmployees}
            renderItem={(e) => (
              <List.Item
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setDrawerOpen(false);
                  router.push(`/accounts-advances/employees/${e.id}`);
                }}
              >
                <List.Item.Meta
                  title={`${e.employee_id || e.serial_no || e.fss_no} — ${e.name || `${e.first_name || ""} ${e.last_name || ""}`.trim()}`}
                  description={(() => {
                    const p = payrollByEmployeeId[e.employee_id];
                    const st = p?.paid_status ?? "unpaid";
                    const paidTxt = st === "paid" ? `Paid (${month}): ${money(p?.net_pay ?? 0)}` : `Unpaid (${month})`;
                    const adv = advanceSummaryByEmployeeDbId[e.id];
                    const advTxt = `Total Advances: ${money(adv?.total_advanced ?? 0)}`;
                    return `${e.category || e.department || "-"} • ${e.rank || e.designation || "-"} • ${paidTxt} • ${advTxt}`;
                  })()}
                />
              </List.Item>
            )}
          />
        </Space>
      </Drawer>
    </>
  );
}
