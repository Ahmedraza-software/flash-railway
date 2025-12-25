"use client";

import {
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Input,
  InputNumber,
  message,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
  SaveOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";

type Payroll2Row = {
  employee_db_id: number;
  employee_id: string;
  name: string;
  serial_no?: string;
  fss_no?: string;
  eobi_no?: string;
  base_salary: number;
  working_days: number;
  day_rate: number;
  // Attendance counts
  presents_total: number;
  present_dates_prev: string[];
  present_dates_cur: string[];
  present_days: number;
  late_days: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  // Editable fields
  pre_days: number;
  cur_days: number;
  leave_encashment_days: number;
  // Calculated
  total_days: number;
  total_salary: number;
  // OT
  overtime_minutes: number;
  overtime_rate: number;
  overtime_pay: number;
  // Late
  late_minutes: number;
  late_deduction: number;
  // Other
  allow_other: number;
  gross_pay: number;
  // Deductions
  eobi: number;
  tax: number;
  fine_deduction: number;
  fine_adv_extra: number;
  fine_adv: number;
  advance_deduction: number;
  // Net
  net_pay: number;
  // Other
  remarks?: string | null;
  bank_cash?: string | null;
};

type Payroll2Response = {
  month: string;
  summary: {
    month: string;
    from_date: string;
    to_date: string;
    working_days: number;
    employees: number;
    total_gross: number;
    total_net: number;
    total_presents: number;
  };
  rows: Payroll2Row[];
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function compactMoney(n: number): string {
  if (n === 0) return "Rs 0";
  return `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
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

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}


export default function Payroll2Page() {
  const [msg, msgCtx] = message.useMessage();

  const defaultRange = useMemo(() => {
    const today = dayjs();
    if (today.date() >= 26) {
      const from = today.date(26);
      const to = from.add(1, "month").date(25);
      return [from, to] as const;
    }
    const to = today.date(25);
    const from = to.subtract(1, "month").date(26);
    return [from, to] as const;
  }, []);

  const [fromDate, setFromDate] = useState(defaultRange[0]);
  const [toDate, setToDate] = useState(defaultRange[1]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Payroll2Row[]>([]);
  const [search, setSearch] = useState("");
  const [summaryData, setSummaryData] = useState<Payroll2Response["summary"] | null>(null);

  const monthLabel = useMemo(() => toDate.format("YYYY-MM"), [toDate]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.employee_id} ${r.name} ${r.serial_no || ""} ${r.fss_no || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const summary = useMemo(() => {
    const totalGross = rows.reduce((a, r) => a + r.gross_pay, 0);
    const totalNet = rows.reduce((a, r) => a + r.net_pay, 0);
    const totalPresents = rows.reduce((a, r) => a + r.presents_total, 0);
    const totalOtPay = rows.reduce((a, r) => a + r.overtime_pay, 0);
    const employees = rows.length;
    return { totalGross, totalNet, totalPresents, totalOtPay, employees };
  }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rep = await api.get<Payroll2Response>("/api/payroll2/range-report", {
        query: {
          from_date: fromDate.format("YYYY-MM-DD"),
          to_date: toDate.format("YYYY-MM-DD"),
          month: monthLabel,
        },
      });

      const sorted = (rep.rows ?? []).sort((a, b) => {
        const aNum = parseInt(a.serial_no || "0", 10);
        const bNum = parseInt(b.serial_no || "0", 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.employee_id.localeCompare(b.employee_id);
      });
      setRows(sorted);
      setSummaryData(rep.summary);

      msg.success(`Loaded (${fromDate.format("YYYY-MM-DD")} to ${toDate.format("YYYY-MM-DD")})`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load payroll"));
    } finally {
      setLoading(false);
    }
  }, [fromDate, monthLabel, msg, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  // Recalculate row when editable fields change
  const updateRow = useCallback((employee_db_id: number, patch: Partial<Payroll2Row>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.employee_db_id !== employee_db_id) return r;
        const updated = { ...r, ...patch };
        
        // Recalculate total_days = presents_total + leave_encashment_days
        const total_days = (updated.presents_total || 0) + (updated.leave_encashment_days || 0);
        const total_salary = total_days * r.day_rate;
        const gross_pay = total_salary + r.overtime_rate + r.overtime_pay + (updated.allow_other || 0);
        const fine_adv = r.fine_deduction + r.advance_deduction + (updated.fine_adv_extra || 0);
        const net_pay = gross_pay - (updated.eobi || 0) - (updated.tax || 0) - fine_adv - r.late_deduction;
        
        return {
          ...updated,
          total_days,
          total_salary,
          gross_pay,
          fine_adv,
          net_pay,
        };
      })
    );
  }, []);

  const saveSheet = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        from_date: fromDate.format("YYYY-MM-DD"),
        to_date: toDate.format("YYYY-MM-DD"),
        entries: rows.map((r) => ({
          employee_db_id: r.employee_db_id,
          from_date: fromDate.format("YYYY-MM-DD"),
          to_date: toDate.format("YYYY-MM-DD"),
          pre_days_override: r.pre_days,
          cur_days_override: r.cur_days,
          leave_encashment_days: r.leave_encashment_days,
          allow_other: r.allow_other,
          eobi: r.eobi,
          tax: r.tax,
          fine_adv_extra: r.fine_adv_extra,
          remarks: r.remarks ?? null,
          bank_cash: r.bank_cash ?? null,
        })),
      };
      await api.put("/api/payroll/sheet-entries", payload);
      msg.success("Saved");
      void load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }, [fromDate, load, msg, rows, toDate]);

  const exportCsv = useCallback(() => {
    const headers = [
      "#", "FSS No.", "Name", "Salary", "Presents", "Pre Days", "Cur Days", "Leave Enc.",
      "Total Days", "Total Salary", "OT Rate", "OT Amount", "Allow/Other", "Gross",
      "EOBI#", "EOBI", "Tax", "Fine(Att)", "Fine/Adv", "Net", "Remarks", "Bank/Cash"
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.serial_no || "", r.fss_no || "", r.name, r.base_salary, r.presents_total,
        r.pre_days, r.cur_days, r.leave_encashment_days, r.total_days, r.total_salary,
        r.overtime_rate, r.overtime_pay, r.allow_other, r.gross_pay,
        r.eobi_no || "", r.eobi, r.tax, r.fine_deduction, r.fine_adv, r.net_pay,
        r.remarks || "", r.bank_cash || ""
      ].map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `payroll2_${monthLabel}.csv`);
  }, [monthLabel, rows]);

  const exportPdf = useCallback(async () => {
    try {
      msg.loading({ content: "Generating PDF...", key: "pdf" });
      const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;
      const response = await fetch(`${API_BASE_URL}/api/payroll2/export-pdf?from_date=${fromDate.format("YYYY-MM-DD")}&to_date=${toDate.format("YYYY-MM-DD")}&month=${monthLabel}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rows }),
      });
      if (!response.ok) throw new Error("Failed to generate PDF");
      const blob = await response.blob();
      downloadBlob(blob, `payroll2_${monthLabel}.pdf`);
      msg.success({ content: "PDF downloaded", key: "pdf" });
    } catch (e) {
      msg.error({ content: errorMessage(e, "Failed to export PDF"), key: "pdf" });
    }
  }, [fromDate, monthLabel, msg, rows, toDate]);


  const columns = useMemo((): ColumnsType<Payroll2Row> => {
    return [
      {
        key: "sr",
        title: "#",
        width: 45,
        fixed: "left",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{r.serial_no || ""}</Typography.Text>
        ),
      },
      {
        key: "fss_no",
        title: <div style={{ fontSize: 10, lineHeight: 1.05 }}>FSS<br />No.</div>,
        width: 65,
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{r.fss_no || ""}</Typography.Text>
        ),
      },
      {
        key: "name",
        title: "Employee Name",
        dataIndex: "name",
        width: 140,
        ellipsis: true,
        render: (v: string) => (
          <Typography.Text style={{ fontSize: 11 }} ellipsis={{ tooltip: v }}>{v}</Typography.Text>
        ),
      },
      {
        key: "base_salary",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Salary<br />Per Month</div>,
        width: 85,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{compactMoney(r.base_salary)}</Typography.Text>
        ),
      },
      {
        key: "presents_total",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "center" }}>Presents<br />Total</div>,
        width: 65,
        align: "center",
        render: (_: unknown, r: Payroll2Row) => {
          const prevDates = r.present_dates_prev || [];
          const curDates = r.present_dates_cur || [];
          const hasDates = prevDates.length > 0 || curDates.length > 0;
          
          const tooltipContent = hasDates ? (
            <div style={{ maxHeight: 250, overflowY: "auto", fontSize: 11, minWidth: 100 }}>
              {prevDates.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: "#faad14" }}>Previous Month ({prevDates.length})</div>
                  {prevDates.map((d, i) => (
                    <div key={`prev-${i}`} style={{ paddingLeft: 4 }}>{d}</div>
                  ))}
                </>
              )}
              {prevDates.length > 0 && curDates.length > 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", margin: "8px 0" }} />
              )}
              {curDates.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: "#52c41a" }}>Current Month ({curDates.length})</div>
                  {curDates.map((d, i) => (
                    <div key={`cur-${i}`} style={{ paddingLeft: 4 }}>{d}</div>
                  ))}
                </>
              )}
            </div>
          ) : "No attendance";
          
          return (
            <Tooltip title={tooltipContent} placement="right">
              <Tag color={r.presents_total > 0 ? "green" : "default"} style={{ fontSize: 11, cursor: "pointer" }}>
                {r.presents_total}
              </Tag>
            </Tooltip>
          );
        },
      },
      {
        key: "pre_days",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Pre.<br />Days</div>,
        width: 55,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <InputNumber
            size="small"
            min={0}
            controls={false}
            value={r.pre_days}
            style={{ width: 48 }}
            onChange={(v) => updateRow(r.employee_db_id, { pre_days: Number(v ?? 0) })}
          />
        ),
      },
      {
        key: "cur_days",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Cur.<br />Days</div>,
        width: 55,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <InputNumber
            size="small"
            min={0}
            controls={false}
            value={r.cur_days}
            style={{ width: 48 }}
            onChange={(v) => updateRow(r.employee_db_id, { cur_days: Number(v ?? 0) })}
          />
        ),
      },
      {
        key: "leave_encashment",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Leave<br />Enc.</div>,
        width: 55,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <InputNumber
            size="small"
            min={0}
            controls={false}
            value={r.leave_encashment_days}
            style={{ width: 48 }}
            onChange={(v) => updateRow(r.employee_db_id, { leave_encashment_days: Number(v ?? 0) })}
          />
        ),
      },
      {
        key: "total_days",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Total<br />Days</div>,
        width: 55,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{r.total_days}</Typography.Text>
        ),
      },
      {
        key: "total_salary",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Total<br />Salary</div>,
        width: 80,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{compactMoney(r.total_salary)}</Typography.Text>
        ),
      },
      {
        key: "ot_rate",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>O.T<br />Rate</div>,
        width: 65,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{compactMoney(r.overtime_rate)}</Typography.Text>
        ),
      },
      {
        key: "ot_amount",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>O.T<br />Amount</div>,
        width: 75,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{compactMoney(r.overtime_pay)}</Typography.Text>
        ),
      },
      {
        key: "allow_other",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Allow./<br />Other</div>,
        width: 75,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <InputNumber
            size="small"
            min={0}
            controls={false}
            value={r.allow_other}
            style={{ width: 65 }}
            onChange={(v) => updateRow(r.employee_db_id, { allow_other: Number(v ?? 0) })}
          />
        ),
      },
      {
        key: "gross",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Gross<br />Salary</div>,
        width: 85,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{compactMoney(r.gross_pay)}</Typography.Text>
        ),
      },
      {
        key: "eobi_no",
        title: <div style={{ fontSize: 10, lineHeight: 1.05 }}>EOBI<br />#</div>,
        width: 75,
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{r.eobi_no || ""}</Typography.Text>
        ),
      },
      {
        key: "eobi",
        title: "EOBI",
        width: 65,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <InputNumber
            size="small"
            min={0}
            controls={false}
            value={r.eobi}
            style={{ width: 60 }}
            onChange={(v) => updateRow(r.employee_db_id, { eobi: Number(v ?? 0) })}
          />
        ),
      },
      {
        key: "tax",
        title: "Tax",
        width: 65,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <InputNumber
            size="small"
            min={0}
            controls={false}
            value={r.tax}
            style={{ width: 60 }}
            onChange={(v) => updateRow(r.employee_db_id, { tax: Number(v ?? 0) })}
          />
        ),
      },
      {
        key: "fine_att",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Fine<br />(Att)</div>,
        width: 65,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text style={{ fontSize: 11 }}>{compactMoney(r.fine_deduction)}</Typography.Text>
        ),
      },
      {
        key: "fine_adv",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Fine/<br />Adv.</div>,
        width: 70,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <InputNumber
            size="small"
            min={0}
            controls={false}
            value={r.fine_adv_extra}
            style={{ width: 60 }}
            onChange={(v) => updateRow(r.employee_db_id, { fine_adv_extra: Number(v ?? 0) })}
          />
        ),
      },
      {
        key: "net",
        title: <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>Net<br />Payable</div>,
        width: 85,
        align: "right",
        render: (_: unknown, r: Payroll2Row) => (
          <Typography.Text strong style={{ fontSize: 11, color: r.net_pay >= 0 ? "#52c41a" : "#ff4d4f" }}>
            {compactMoney(r.net_pay)}
          </Typography.Text>
        ),
      },
      {
        key: "remarks",
        title: <div style={{ fontSize: 10, lineHeight: 1.05 }}>Remarks/<br />Signature</div>,
        width: 90,
        render: (_: unknown, r: Payroll2Row) => (
          <Input
            size="small"
            value={r.remarks ?? ""}
            style={{ fontSize: 11 }}
            onChange={(e) => updateRow(r.employee_db_id, { remarks: e.target.value })}
          />
        ),
      },
      {
        key: "bank_cash",
        title: <div style={{ fontSize: 10, lineHeight: 1.05 }}>Bank/<br />Cash</div>,
        width: 100,
        render: (_: unknown, r: Payroll2Row) => (
          <Input
            size="small"
            value={r.bank_cash ?? ""}
            style={{ fontSize: 11 }}
            onChange={(e) => updateRow(r.employee_db_id, { bank_cash: e.target.value })}
          />
        ),
      },
    ];
  }, [updateRow]);


  return (
    <>
      {msgCtx}
      <Card variant="borderless" className="flash-card" style={{ overflowX: "hidden" }} styles={{ body: { padding: 12 } }}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Row gutter={[12, 12]} align="middle">
            <Col flex="auto">
              <Space size={10} wrap>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  Payroll 2
                </Typography.Title>
                <Typography.Text type="secondary">
                  {fromDate.format("YYYY-MM-DD")} to {toDate.format("YYYY-MM-DD")}
                </Typography.Text>
              </Space>
            </Col>
            <Col>
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveSheet()}>
                  Save
                </Button>
                <Dropdown
                  menu={{
                    items: [
                      { key: "csv", label: "Export CSV", icon: <FileExcelOutlined />, onClick: exportCsv },
                      { key: "pdf", label: "Export PDF", icon: <FilePdfOutlined />, onClick: () => void exportPdf() },
                    ],
                  }}
                >
                  <Button icon={<DownloadOutlined />}>
                    Export
                  </Button>
                </Dropdown>
              </Space>
            </Col>
          </Row>

          <Card variant="outlined" className="flash-card" styles={{ body: { padding: 12 } }}>
            <Row gutter={[12, 12]} align="middle">
              <Col span={24}>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <DatePicker.RangePicker
                    value={[fromDate, toDate] as any}
                    onChange={(r) => {
                      const a = r?.[0] ?? defaultRange[0];
                      const b = r?.[1] ?? a;
                      setFromDate(a);
                      setToDate(b);
                    }}
                    style={{ width: 320 }}
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search employee"
                    allowClear
                    prefix={<SearchOutlined style={{ color: "rgba(0,0,0,0.35)" }} />}
                    style={{ width: 320 }}
                  />
                </div>
              </Col>
            </Row>
          </Card>

          <Row gutter={[12, 12]}>
            <Col xs={12} md={4}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic 
                  title="Total Gross" 
                  value={summary.totalGross} 
                  precision={0} 
                  prefix="Rs" 
                  styles={{ content: { fontSize: 16, lineHeight: "20px" }}} 
                />
              </Card>
            </Col>
            <Col xs={12} md={4}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic 
                  title="Total Net" 
                  value={summary.totalNet} 
                  precision={0} 
                  prefix="Rs" 
                  styles={{ content: { fontSize: 16, lineHeight: "20px" }}} 
                />
              </Card>
            </Col>
            <Col xs={12} md={4}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic 
                  title="Employees" 
                  value={summary.employees} 
                  styles={{ content: { fontSize: 16, lineHeight: "20px" }}} 
                />
              </Card>
            </Col>
            <Col xs={12} md={4}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic 
                  title="Total Presents" 
                  value={summary.totalPresents} 
                  valueStyle={{ color: "#52c41a" }}
                  styles={{ content: { fontSize: 16, lineHeight: "20px" }}} 
                />
              </Card>
            </Col>
            <Col xs={12} md={4}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic 
                  title="Working Days" 
                  value={summaryData?.working_days ?? 0} 
                  styles={{ content: { fontSize: 16, lineHeight: "20px" }}} 
                />
              </Card>
            </Col>
            <Col xs={12} md={4}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic 
                  title="OT Pay" 
                  value={summary.totalOtPay} 
                  precision={0} 
                  prefix="Rs" 
                  styles={{ content: { fontSize: 16, lineHeight: "20px" }}} 
                />
              </Card>
            </Col>
          </Row>

          <Table<Payroll2Row>
            rowKey={(r) => r.employee_id}
            columns={columns}
            dataSource={filteredRows}
            loading={loading}
            tableLayout="fixed"
            style={{ width: "100%" }}
            scroll={{ x: 1800 }}
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              pageSizeOptions: ["10", "15", "25", "50"],
              showTotal: (t) => `${t} employees`,
            }}
            size="small"
            bordered
          />
        </Space>
      </Card>
    </>
  );
}
