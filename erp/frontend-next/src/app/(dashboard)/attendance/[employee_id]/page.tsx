"use client";

import { Button, Card, Col, DatePicker, Row, Space, Statistic, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { ArrowLeftOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";

type AttendanceDayRow = {
  date: string;
  status: string;
  leave_type?: string | null;
  overtime_minutes?: number | null;
  overtime_rate?: number | null;
  late_minutes?: number | null;
  late_deduction?: number | null;
  fine_amount?: number | null;
  note?: string | null;
};

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

export default function EmployeeAttendancePage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();
  const params = useParams<{ employee_id?: string }>();
  const employeeId = params?.employee_id ? decodeURIComponent(String(params.employee_id)) : "";

  const [fromDate, setFromDate] = useState(dayjs().startOf("month"));
  const [toDate, setToDate] = useState(dayjs());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<AttendanceDayRow[]>([]);
  const [employeeName, setEmployeeName] = useState<string>("");

  // Summary stats
  const summary = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, leave: 0, unmarked: 0 };
    for (const r of rows) {
      const st = (r.status || "").toLowerCase();
      if (st === "present") counts.present++;
      else if (st === "late") counts.late++;
      else if (st === "absent") counts.absent++;
      else if (st === "leave") counts.leave++;
      else counts.unmarked++;
    }
    return counts;
  }, [rows]);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const from = fromDate.format("YYYY-MM-DD");
      const to = toDate.format("YYYY-MM-DD");
      const res = await api.get<any>(`/api/attendance/employee/${encodeURIComponent(employeeId)}`, {
        query: { from_date: from, to_date: to },
      });
      setRows(Array.isArray(res?.rows) ? (res.rows as AttendanceDayRow[]) : []);
    } catch (e: unknown) {
      setRows([]);
      msg.error(errorMessage(e, "Failed to load employee attendance"));
    } finally {
      setLoading(false);
    }
  }, [employeeId, fromDate, msg, toDate]);

  // Load employee name
  const loadEmployeeName = useCallback(async () => {
    if (!employeeId) return;
    try {
      // Try to find employee by fss_no or serial_no
      const res = await api.get<any>("/api/employees2/", {
        query: { skip: 0, limit: 500 },
      });
      const employees = res?.employees || [];
      const emp = employees.find((e: any) => 
        String(e.fss_no || e.serial_no || e.id) === employeeId
      );
      if (emp) {
        setEmployeeName(emp.name || "");
      }
    } catch {
      // ignore
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
    void loadEmployeeName();
  }, [load, loadEmployeeName]);

  const exportPdf = useCallback(async () => {
    if (!employeeId) return;
    setExporting(true);
    try {
      const from = fromDate.format("YYYY-MM-DD");
      const to = toDate.format("YYYY-MM-DD");

      const url = `${API_BASE_URL}/api/attendance/employee/${encodeURIComponent(employeeId)}/export/pdf?from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      downloadBlob(blob, `attendance_${employeeId}_${from}_${to}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to export PDF"));
    } finally {
      setExporting(false);
    }
  }, [employeeId, fromDate, msg, toDate]);

  const columns = useMemo((): ColumnsType<AttendanceDayRow> => {
    return [
      {
        key: "date",
        title: "Date",
        dataIndex: "date",
        width: 120,
      },
      {
        key: "status",
        title: "Status",
        dataIndex: "status",
        width: 120,
        render: (v: string, r) => {
          const st = String(v || "").toLowerCase();
          if (st === "leave") {
            const lt = String(r.leave_type || "paid").toLowerCase();
            return (
              <Tag color={lt === "unpaid" ? "volcano" : "blue"}>
                Leave ({lt.toUpperCase()})
              </Tag>
            );
          }
          if (st === "present") return <Tag color="green">Present</Tag>;
          if (st === "late") return <Tag color="gold">Late</Tag>;
          if (st === "absent") return <Tag color="red">Absent</Tag>;
          return <Tag>-</Tag>;
        },
      },
      {
        key: "ot",
        title: "OT (mins)",
        dataIndex: "overtime_minutes",
        width: 110,
        render: (v: unknown) => (v === null || v === undefined ? "" : String(v)),
      },
      {
        key: "late",
        title: "Late (mins)",
        dataIndex: "late_minutes",
        width: 110,
        render: (v: unknown) => (v === null || v === undefined ? "" : String(v)),
      },
      {
        key: "fine",
        title: "Fine",
        dataIndex: "fine_amount",
        width: 90,
        render: (v: unknown) => (v === null || v === undefined ? "" : String(v)),
      },
      {
        key: "note",
        title: "Note",
        dataIndex: "note",
        render: (v: unknown) => (v === null || v === undefined ? "" : String(v)),
      },
    ];
  }, []);

  return (
    <>
      {msgCtx}
      <Card
        variant="borderless"
        style={{ borderRadius: 0, height: "calc(100vh - 24px)", overflow: "hidden" }}
        styles={{ body: { padding: 12, height: "100%", overflowY: "auto" } }}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Row gutter={[12, 12]} align="middle">
            <Col>
              <Button 
                icon={<ArrowLeftOutlined />} 
                onClick={() => router.push("/attendance")}
              >
                Back
              </Button>
            </Col>
            <Col flex="auto">
              <Typography.Title level={4} style={{ margin: 0 }}>
                {employeeName ? `${employeeName} (${employeeId})` : employeeId || "-"}
              </Typography.Title>
            </Col>
            <Col>
              <Space wrap>
                <DatePicker.RangePicker
                  value={[fromDate, toDate] as any}
                  onChange={(r) => {
                    const start = r?.[0] ?? dayjs();
                    const end = r?.[1] ?? start;
                    setFromDate(start);
                    setToDate(end);
                  }}
                />
                <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
                  Refresh
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => void exportPdf()} loading={exporting}>
                  Export PDF
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={[8, 8]}>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }}>
                <Statistic title="Present" value={summary.present} valueStyle={{ color: "#52c41a" }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }}>
                <Statistic title="Late" value={summary.late} valueStyle={{ color: "#faad14" }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }}>
                <Statistic title="Absent" value={summary.absent} valueStyle={{ color: "#ff4d4f" }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }}>
                <Statistic title="Leave" value={summary.leave} valueStyle={{ color: "#1890ff" }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }}>
                <Statistic title="Unmarked" value={summary.unmarked} valueStyle={{ color: "#8c8c8c" }} />
              </Card>
            </Col>
          </Row>

          <Table
            rowKey={(r) => r.date}
            size="small"
            loading={loading}
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 31 }}
          />
        </Space>
      </Card>
    </>
  );
}
