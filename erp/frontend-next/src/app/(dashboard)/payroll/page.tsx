"use client";

import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  InputNumber,
  message,
  Row,
  Space,
  Statistic,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { formatRs, formatRsCompact } from "@/lib/money";
import type {
  PayrollPaidStatus,
  PayrollReportResponse,
  PayrollUiRow,
  PayrollSheetEntryBulkUpsert,
} from "@/lib/types";

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function toMoney(n: number): string {
  return formatRs(n, 2);
}

function compactMoney(n: number): string {
  return formatRsCompact(n);
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

export default function PayrollPage() {
  const [msg, msgCtx] = message.useMessage();

  const [stickyContainer, setStickyContainer] = useState<HTMLElement | null>(null);

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

  const [rows, setRows] = useState<PayrollUiRow[]>([]);
  const [search, setSearch] = useState("");

  const monthLabel = useMemo(() => toDate.format("YYYY-MM"), [toDate]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.employee_id} ${r.name} ${r.department} ${r.shift_type}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const summary = useMemo(() => {
    const totalGross = rows.reduce((a, r) => a + r.gross_calc, 0);
    const totalNet = rows.reduce((a, r) => a + r.net_calc, 0);
    const totalOtPay = rows.reduce((a, r) => a + Number(r.overtime_pay ?? 0), 0);
    const totalLateDed = rows.reduce((a, r) => a + Number((r as any).late_deduction ?? 0), 0);
    const totalAbsentDays = rows.reduce((a, r) => a + Number((r as any).absent_days ?? 0), 0);
    const totalOtMinutes = rows.reduce((a, r) => a + Number((r as any).overtime_minutes ?? 0), 0);
    const totalOtHours = totalOtMinutes / 60;
    const employees = rows.length;

    const paidTotal = rows.reduce((a, r) => (r.paid_status === "paid" ? a + Number(r.net_calc || 0) : a), 0);
    const unpaidTotal = rows.reduce((a, r) => (r.paid_status !== "paid" ? a + Number(r.net_calc || 0) : a), 0);
    return {
      totalGross,
      totalNet,
      totalOtPay,
      totalLateDed,
      totalAbsentDays,
      totalOtHours,
      employees,
      paidTotal,
      unpaidTotal,
    };
  }, [rows]);

  const buildUiRows = useCallback(
    (rep: PayrollReportResponse): PayrollUiRow[] => {
      return (rep.rows ?? []).map((r) => {
        const gross = Number(r.gross_pay ?? 0);
        const net = Number(r.net_pay ?? 0);

        const st = (r as unknown as { paid_status?: unknown }).paid_status;
        const paid_status: PayrollPaidStatus = st === "paid" ? "paid" : "unpaid";

        return {
          ...r,
          absent_deduction_calc: 0,
          unpaid_leave_deduction_calc: 0,
          gross_calc: gross,
          net_calc: net,
          paid_status,
        };
      });
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rep = await api.get<PayrollReportResponse>("/api/payroll/range-report", {
        query: {
          from_date: fromDate.format("YYYY-MM-DD"),
          to_date: toDate.format("YYYY-MM-DD"),
          month: monthLabel,
        },
      });

      const ui = buildUiRows(rep).sort((a, b) => {
        // Sort by serial_no numerically
        const aNum = parseInt(a.serial_no || "0", 10);
        const bNum = parseInt(b.serial_no || "0", 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        if (!isNaN(aNum)) return -1;
        if (!isNaN(bNum)) return 1;
        return a.employee_id.localeCompare(b.employee_id);
      });
      setRows(ui);

      msg.success(`Payroll loaded (${fromDate.format("YYYY-MM-DD")} to ${toDate.format("YYYY-MM-DD")})`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load payroll"));
    } finally {
      setLoading(false);
    }
  }, [buildUiRows, fromDate, monthLabel, msg, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setStickyContainer(document.querySelector(".ant-layout-content") as HTMLElement | null);
  }, []);

  const saveSheet = useCallback(async () => {
    setSaving(true);
    try {
      const payload: PayrollSheetEntryBulkUpsert = {
        from_date: fromDate.format("YYYY-MM-DD"),
        to_date: toDate.format("YYYY-MM-DD"),
        entries: rows.map((r) => ({
          employee_db_id: r.employee_db_id,
          from_date: fromDate.format("YYYY-MM-DD"),
          to_date: toDate.format("YYYY-MM-DD"),
          pre_days_override: Number(r.pre_days ?? 0),
          cur_days_override: Number(r.cur_days ?? 0),
          leave_encashment_days: Number(r.leave_encashment_days ?? 0),
          allow_other: Number(r.allow_other ?? 0),
          eobi: Number(r.eobi ?? 0),
          tax: Number(r.tax ?? 0),
          fine_adv_extra: Number((r as any).fine_adv_extra ?? 0),
          remarks: (r.remarks ?? null) as any,
          bank_cash: (r.bank_cash ?? null) as any,
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

  const exportPdf = useCallback(async () => {
    try {
      const url = `${API_BASE_URL}/api/payroll/export/pdf?month=${encodeURIComponent(monthLabel)}&from_date=${encodeURIComponent(
        fromDate.format("YYYY-MM-DD")
      )}&to_date=${encodeURIComponent(toDate.format("YYYY-MM-DD"))}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      const blob = await res.blob();
      downloadBlob(blob, `payroll_${monthLabel}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "PDF export failed"));
    }
  }, [fromDate, monthLabel, msg, toDate]);

  const exportCsv = useCallback(() => {
    const headers = [
      "employee_id",
      "name",
      "salary_per_month",
      "pre_days",
      "cur_days",
      "leave_encashment",
      "total_days",
      "total_salary",
      "ot_amount",
      "allowances",
      "allow_other",
      "gross_salary",
      "eobi",
      "tax",
      "fine_adv",
      "net_payable",
      "remarks",
      "bank_cash",
    ];

    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.employee_id,
          r.name,
          r.base_salary,
          r.pre_days ?? 0,
          r.cur_days ?? 0,
          r.leave_encashment_days ?? 0,
          r.total_days ?? 0,
          r.total_salary ?? 0,
          r.overtime_pay,
          r.allowances,
          r.allow_other ?? 0,
          r.gross_pay,
          r.eobi ?? 0,
          r.tax ?? 0,
          r.fine_adv ?? 0,
          r.net_pay,
          r.remarks ?? "",
          r.bank_cash ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `payroll_${monthLabel}.csv`);
  }, [monthLabel, rows]);

  const columns = useMemo((): ColumnsType<PayrollUiRow> => {
    return [
      {
        key: "sr",
        title: "#",
        width: 45,
        render: (_: unknown, r: PayrollUiRow) => {
          return <Typography.Text style={{ fontSize: 11 }}>{r.serial_no || ""}</Typography.Text>;
        },
      },
      {
        key: "fss_no",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05 }}>
            FSS
            <br />
            No.
          </div>
        ),
        width: 70,
        render: (_: unknown, r: PayrollUiRow) => {
          return <Typography.Text style={{ fontSize: 11 }}>{r.fss_no || ""}</Typography.Text>;
        },
      },
      {
        key: "name",
        title: "Employee Name",
        dataIndex: "name",
        width: 150,
        ellipsis: true,
        render: (v: string) => <Typography.Text style={{ fontSize: 11 }} ellipsis={{ tooltip: v }}>{v}</Typography.Text>,
      },
      {
        key: "base_salary",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Salary
            <br />
            Per Month
          </div>
        ),
        dataIndex: "base_salary",
        width: 92,
        align: "right",
        render: (v: number) => <Typography.Text style={{ fontSize: 11 }}>{compactMoney(Number(v ?? 0))}</Typography.Text>,
      },
      {
        key: "pre_days",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Pre.
            <br />
            Days
          </div>
        ),
        width: 55,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <InputNumber
              size="small"
              min={0}
              controls={false}
              value={Number(r.pre_days ?? 0)}
              style={{ width: 50 }}
              onChange={(v) =>
                setRows((prev) =>
                  prev.map((x) =>
                    x.employee_db_id === r.employee_db_id ? { ...x, pre_days: Number(v ?? 0) } : x
                  )
                )
              }
            />
          </div>
        ),
      },
      {
        key: "cur_days",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Cur.
            <br />
            Days
          </div>
        ),
        width: 55,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <InputNumber
              size="small"
              min={0}
              controls={false}
              value={Number(r.cur_days ?? 0)}
              style={{ width: 50 }}
              onChange={(v) =>
                setRows((prev) =>
                  prev.map((x) =>
                    x.employee_db_id === r.employee_db_id ? { ...x, cur_days: Number(v ?? 0) } : x
                  )
                )
              }
            />
          </div>
        ),
      },
      {
        key: "leave_encashment_days",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Leave
            <br />
            Encashment
          </div>
        ),
        width: 90,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <InputNumber
              size="small"
              min={0}
              controls={false}
              value={Number(r.leave_encashment_days ?? 0)}
              style={{ width: 70 }}
              onChange={(v) =>
                setRows((prev) =>
                  prev.map((x) =>
                    x.employee_db_id === r.employee_db_id ? { ...x, leave_encashment_days: Number(v ?? 0) } : x
                  )
                )
              }
            />
          </div>
        ),
      },
      {
        key: "total_days",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Total
            <br />
            Days
          </div>
        ),
        width: 60,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => <Typography.Text style={{ fontSize: 11 }}>{Number(r.total_days ?? 0)}</Typography.Text>,
      },
      {
        key: "total_salary",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Total
            <br />
            Salary
          </div>
        ),
        width: 82,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => <Typography.Text style={{ fontSize: 11 }}>{compactMoney(Number(r.total_salary ?? 0))}</Typography.Text>,
      },
      {
        key: "ot_rate",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            O.T
            <br />
            Rate
          </div>
        ),
        width: 70,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <Typography.Text style={{ fontSize: 11 }}>{compactMoney(Number(r.overtime_rate ?? 0))}</Typography.Text>
        ),
      },
      {
        key: "ot_amount",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            O.T
            <br />
            Amount
          </div>
        ),
        width: 85,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => <Typography.Text style={{ fontSize: 11 }}>{compactMoney(Number(r.overtime_pay ?? 0))}</Typography.Text>,
      },
      {
        key: "allow_other_total",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Allow. /
            <br />
            Other
          </div>
        ),
        width: 85,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <InputNumber
              size="small"
              min={0}
              controls={false}
              value={Number(r.allow_other ?? 0)}
              style={{ width: 70 }}
              onChange={(v) =>
                setRows((prev) =>
                  prev.map((x) =>
                    x.employee_db_id === r.employee_db_id ? { ...x, allow_other: Number(v ?? 0) } : x
                  )
                )
              }
            />
          </div>
        ),
      },
      {
        key: "gross",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Gross
            <br />
            Salary
          </div>
        ),
        width: 90,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => <Typography.Text style={{ fontSize: 11 }}>{compactMoney(Number(r.gross_pay ?? 0))}</Typography.Text>,
      },
      {
        key: "eobi_no",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05 }}>
            EOBI
            <br />
            #
          </div>
        ),
        width: 80,
        render: (_: unknown, r: PayrollUiRow) => (
          <Typography.Text style={{ fontSize: 11 }}>{r.eobi_no || ""}</Typography.Text>
        ),
      },
      {
        key: "eobi",
        title: "EOBI",
        width: 70,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <InputNumber
              size="small"
              min={0}
              controls={false}
              value={Number(r.eobi ?? 0)}
              style={{ width: 70 }}
              onChange={(v) =>
                setRows((prev) =>
                  prev.map((x) => (x.employee_db_id === r.employee_db_id ? { ...x, eobi: Number(v ?? 0) } : x))
                )
              }
            />
          </div>
        ),
      },
      {
        key: "tax",
        title: "Tax",
        width: 70,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <InputNumber
              size="small"
              min={0}
              controls={false}
              value={Number(r.tax ?? 0)}
              style={{ width: 70 }}
              onChange={(v) =>
                setRows((prev) =>
                  prev.map((x) => (x.employee_db_id === r.employee_db_id ? { ...x, tax: Number(v ?? 0) } : x))
                )
              }
            />
          </div>
        ),
      },
      {
        key: "fine_att",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Fine
            <br />
            (Att)
          </div>
        ),
        width: 70,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <Typography.Text style={{ fontSize: 11 }}>{compactMoney(Number(r.fine_deduction ?? 0))}</Typography.Text>
        ),
      },
      {
        key: "fine_adv",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Fine/
            <br />
            Adv.
          </div>
        ),
        width: 75,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <InputNumber
              size="small"
              min={0}
              controls={false}
              value={Number((r as any).fine_adv_extra ?? 0)}
              style={{ width: 70 }}
              onChange={(v) =>
                setRows((prev) =>
                  prev.map((x) =>
                    x.employee_db_id === r.employee_db_id ? ({ ...x, fine_adv_extra: Number(v ?? 0) } as any) : x
                  )
                )
              }
            />
          </div>
        ),
      },
      {
        key: "net",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05, textAlign: "right" }}>
            Net
            <br />
            Payable
          </div>
        ),
        width: 90,
        align: "right",
        render: (_: unknown, r: PayrollUiRow) => (
          <Typography.Text strong style={{ fontSize: 11 }}>{compactMoney(Number(r.net_pay ?? 0))}</Typography.Text>
        ),
      },
      {
        key: "remarks",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05 }}>
            Remarks/
            <br />
            Signature
          </div>
        ),
        width: 95,
        render: (_: unknown, r: PayrollUiRow) => (
          <Input
            size="small"
            value={r.remarks ?? ""}
            style={{ fontSize: 11 }}
            onChange={(e) =>
              setRows((prev) =>
                prev.map((x) => (x.employee_db_id === r.employee_db_id ? { ...x, remarks: e.target.value } : x))
              )
            }
          />
        ),
      },
      {
        key: "bank_cash",
        title: (
          <div style={{ fontSize: 10, lineHeight: 1.05 }}>
            Bank/
            <br />
            Cash
          </div>
        ),
        width: 140,
        render: (_: unknown, r: PayrollUiRow) => (
          <Input
            size="small"
            value={r.bank_cash ?? ""}
            placeholder={[r.bank_name, r.account_number].filter(Boolean).join(" - ")}
            style={{ fontSize: 11 }}
            onChange={(e) =>
              setRows((prev) =>
                prev.map((x) => (x.employee_db_id === r.employee_db_id ? { ...x, bank_cash: e.target.value } : x))
              )
            }
          />
        ),
      },
    ];
  }, [compactMoney, toMoney]);

  return (
    <>
      {msgCtx}
      <Card variant="borderless" className="flash-card" style={{ overflowX: "hidden" }} styles={{ body: { padding: 12 } }}>
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Row gutter={[12, 12]} align="middle">
            <Col flex="auto">
              <Space size={10} wrap>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  Payroll
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
                <Button type="primary" loading={saving} onClick={() => void saveSheet()}>
                  Save
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => void exportPdf()}>
                  PDF
                </Button>
                <Button icon={<DownloadOutlined />} onClick={exportCsv}>
                  CSV
                </Button>
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
            <Col xs={12} md={6}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Statistic title="Total Gross" value={summary.totalGross} precision={2} prefix="Rs" styles={{ content: { fontSize: 16, lineHeight: "20px"  }}} />
                </Space>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic title="Total Net" value={summary.totalNet} precision={2} prefix="Rs" styles={{ content: { fontSize: 16, lineHeight: "20px"  }}} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic title="Employees" value={summary.employees} styles={{ content: { fontSize: 16, lineHeight: "20px"  }}} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic title="OT Pay" value={summary.totalOtPay} precision={2} prefix="Rs" styles={{ content: { fontSize: 16, lineHeight: "20px"  }}} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic title="Late Ded" value={summary.totalLateDed} precision={2} prefix="Rs" styles={{ content: { fontSize: 16, lineHeight: "20px"  }}} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic title="Absent" value={summary.totalAbsentDays} styles={{ content: { fontSize: 16, lineHeight: "20px"  }}} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small" variant="outlined" className="flash-card" styles={{ body: { padding: 10 } }}>
                <Statistic title="OT Hours" value={summary.totalOtHours} precision={2} styles={{ content: { fontSize: 16, lineHeight: "20px"  }}} />
              </Card>
            </Col>
          </Row>

          <Table<PayrollUiRow>
            rowKey={(r) => r.employee_id}
            columns={columns}
            dataSource={filteredRows}
            loading={loading}
            tableLayout="fixed"
            style={{ width: "100%", overflowX: "hidden" }}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (t) => `${t} employees`,
            }}
            size="small"
            sticky={stickyContainer ? { getContainer: () => stickyContainer } : true}
            bordered
          />
        </Space>
      </Card>
    </>
  );
}
