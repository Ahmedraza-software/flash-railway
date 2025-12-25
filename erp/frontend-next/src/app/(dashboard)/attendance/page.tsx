"use client";

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  InputNumber,
  List,
  Modal,
  message,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import {
  DownloadOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type {
  AttendanceBulkUpsert,
  AttendanceListResponse,
  AttendanceRow,
  AttendanceStatus,
  Employee2,
  Employee2ListResponse,
  LeavePeriodAlert,
  LeavePeriodCreate,
  LeavePeriodOut,
  LeaveType,
} from "@/lib/types";
import { API_BASE_URL } from "@/lib/config";

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function toMinutesFromHours(hours?: number): number | null {
  if (hours === undefined || hours === null) return null;
  if (Number.isNaN(hours)) return null;
  const mins = Math.round(hours * 60);
  return mins > 0 ? mins : 0;
}

function hoursFromMinutes(mins?: number | null): number | undefined {
  if (mins === undefined || mins === null) return undefined;
  return Math.round((mins / 60) * 100) / 100;
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

export default function AttendancePage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const [fromDate, setFromDate] = useState(dayjs());
  const [toDate, setToDate] = useState(dayjs());
  const singleDayMode = useMemo(
    () => dayjs(fromDate).format("YYYY-MM-DD") === dayjs(toDate).format("YYYY-MM-DD"),
    [fromDate, toDate]
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<{
    from_date: string;
    to_date: string;
    total: number;
    unmarked: number;
    present: number;
    late: number;
    absent: number;
    leave: number;
    fine_total: number;
  } | null>(null);

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [initialStatusByEmployeeId, setInitialStatusByEmployeeId] = useState<Record<string, AttendanceStatus>>({});
  const [search, setSearch] = useState<string>("");

  const [leaveAlertsLoading, setLeaveAlertsLoading] = useState(false);
  const [leaveAlerts, setLeaveAlerts] = useState<LeavePeriodAlert[]>([]);

  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveEmployeeId, setLeaveEmployeeId] = useState<string | null>(null);
  const [leaveRange, setLeaveRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => [fromDate, toDate]);
  const [leaveType, setLeaveType] = useState<LeaveType>("paid");
  const [leaveReason, setLeaveReason] = useState<string>("");
  const [leaveSaving, setLeaveSaving] = useState(false);

  const [leaveInfoOpen, setLeaveInfoOpen] = useState(false);
  const [leaveInfoLoading, setLeaveInfoLoading] = useState(false);
  const [leaveInfo, setLeaveInfo] = useState<LeavePeriodOut | null>(null);

  const [departments, setDepartments] = useState<string[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [department, setDepartment] = useState<string | undefined>(undefined);
  const [designation, setDesignation] = useState<string | undefined>(undefined);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (department && (r.department ?? "") !== department) return false;
      if (designation && !r.name) {
        // no-op
      }
      if (q) {
        const hay = `${r.employee_id} ${r.name} ${r.department ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [department, designation, rows, search]);

  const kpiRows = useMemo(() => {
    return rows.filter((r) => {
      if (department && (r.department ?? "") !== department) return false;
      return true;
    });
  }, [department, rows]);

  const statusCounts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = {
      unmarked: 0,
      present: 0,
      late: 0,
      absent: 0,
      leave: 0,
    };
    for (const r of kpiRows) c[r.status] += 1;
    return c;
  }, [kpiRows]);

  const fineTotal = useMemo(() => {
    return kpiRows.reduce((sum, r) => sum + Number(r.fine_amount ?? 0), 0);
  }, [kpiRows]);

  const effectiveRange = useMemo(() => {
    return [fromDate, toDate];
  }, [fromDate, toDate]);

  const setRow = useCallback((employee_id: string, patch: Partial<AttendanceRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.employee_id === employee_id ? { ...r, ...patch } : r))
    );
    setDirty(true);
  }, []);

  const normalizeRowForStatus = useCallback((employee_id: string, status: AttendanceStatus) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.employee_id !== employee_id) return r;

        const next: AttendanceRow = { ...r, status };

        if (status !== "present") {
          next.overtime_hours = undefined;
          next.overtime_rate = undefined;
          next.late_hours = undefined;
          next.late_deduction = undefined;
        }
        if (status !== "leave") {
          next.leave_type = "";
        }

        return next;
      })
    );
    setDirty(true);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [deptRes, desigRes] = await Promise.all([
        api.get<{ departments: string[] }>("/api/employees/departments/list"),
        api.get<{ designations: string[] }>("/api/employees/designations/list"),
      ]);
      setDepartments(deptRes.departments ?? []);
      setDesignations(desigRes.designations ?? []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load lists"));
    }
  }, [msg]);

  const loadLeaveAlerts = useCallback(async () => {
    setLeaveAlertsLoading(true);
    try {
      const asOf = dayjs(toDate).format("YYYY-MM-DD");
      const res = await api.get<LeavePeriodAlert[]>("/api/leave-periods/alerts", {
        query: { as_of: asOf },
      });
      setLeaveAlerts(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      setLeaveAlerts([]);
    } finally {
      setLeaveAlertsLoading(false);
    }
  }, [toDate]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const from = dayjs(fromDate).format("YYYY-MM-DD");
      const to = dayjs(toDate).format("YYYY-MM-DD");
      const res = await api.get<any>("/api/attendance/summary", {
        query: {
          from_date: from,
          to_date: to,
          department,
          designation,
        },
      });
      setSummary({
        from_date: String(res?.from_date || from),
        to_date: String(res?.to_date || to),
        total: Number(res?.total ?? 0),
        unmarked: Number(res?.unmarked ?? 0),
        present: Number(res?.present ?? 0),
        late: Number(res?.late ?? 0),
        absent: Number(res?.absent ?? 0),
        leave: Number(res?.leave ?? 0),
        fine_total: Number(res?.fine_total ?? 0),
      });
    } catch (e: unknown) {
      setSummary(null);
      msg.error(errorMessage(e, "Failed to load attendance summary"));
    } finally {
      setSummaryLoading(false);
    }
  }, [department, designation, fromDate, msg, toDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = fromDate.format("YYYY-MM-DD");

      // Load employees (we want everyone existing up to the selected date)
      const allEmployees: Employee2[] = [];
      let skip = 0;
      const limit = 200;
      while (true) {
        const res = await api.get<Employee2ListResponse>("/api/employees2/", {
          query: { skip, limit, with_total: false },
        });
        const batch = res.employees ?? [];
        allEmployees.push(...batch);
        if (batch.length < limit) break;
        skip += limit;
      }

      const att = await api.get<AttendanceListResponse>("/api/attendance/", {
        query: { date: dateStr },
      });

      const byEmployeeId = new Map(att.records.map((r) => [r.employee_id, r]));
      const initial: Record<string, AttendanceStatus> = {};

      const nextRows: AttendanceRow[] = allEmployees
        .map((e) => {
          const empId = String(e.fss_no || e.serial_no || e.id);
          const rec = byEmployeeId.get(empId);
          const st = (rec?.status ?? "unmarked").toString().toLowerCase();
          const status: AttendanceStatus =
            st === "absent"
              ? "absent"
              : st === "leave"
                ? "leave"
                : st === "late"
                  ? "late"
                  : st === "present"
                    ? "present"
                    : "unmarked";

          initial[empId] = status;

          return {
            employee_id: empId,
            serial_no: e.serial_no,
            name: e.name,
            rank: e.rank,
            emp_status: e.status,
            unit: e.unit,
            department: e.category,
            shift_type: e.unit,
            status,
            leave_type:
              status === "leave"
                ? ((rec?.leave_type ?? "paid").toString().toLowerCase() === "unpaid"
                    ? "unpaid"
                    : "paid")
                : "",
            overtime_hours: status === "present" ? hoursFromMinutes(rec?.overtime_minutes ?? null) : undefined,
            overtime_rate: status === "present" ? (rec?.overtime_rate ?? undefined) : undefined,
            late_hours: status === "present" ? hoursFromMinutes(rec?.late_minutes ?? null) : undefined,
            late_deduction: status === "present" ? (rec?.late_deduction ?? undefined) : undefined,
            fine_amount: Number(rec?.fine_amount ?? 0) || 0,
            note: rec?.note ?? "",
          };
        })
        .sort((a, b) => {
          const numA = parseInt(a.serial_no || "999999", 10);
          const numB = parseInt(b.serial_no || "999999", 10);
          return numA - numB;
        });

      setRows(nextRows);
      setInitialStatusByEmployeeId(initial);
      setDirty(false);
      msg.success(`Loaded ${nextRows.length} employees for ${dateStr}`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load attendance"));
    } finally {
      setLoading(false);
    }
  }, [fromDate, msg]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadLeaveAlerts();
  }, [loadLeaveAlerts]);

  useEffect(() => {
    if (singleDayMode) {
      void load();
    }
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (!singleDayMode) {
        msg.warning("Select a single day (From = To) to edit and save attendance.");
        return;
      }

      const dateStr = fromDate.format("YYYY-MM-DD");

      const payload: AttendanceBulkUpsert = {
        date: dateStr,
        records: rows
          .filter((r) => {
            if (r.status !== "unmarked") return true;
            const initial = initialStatusByEmployeeId[r.employee_id] ?? "unmarked";
            return initial !== "unmarked";
          })
          .map((r) => {
          const overtime_minutes = r.status === "present" ? toMinutesFromHours(r.overtime_hours) : null;
          const late_minutes = r.status === "present" ? toMinutesFromHours(r.late_hours) : null;

          return {
            employee_id: r.employee_id,
            status: r.status,
            note: r.note || null,
            overtime_minutes,
            overtime_rate: r.status === "present" ? (r.overtime_rate ?? null) : null,
            late_minutes,
            late_deduction: r.status === "present" ? (r.late_deduction ?? null) : null,
            leave_type: r.status === "leave" ? (r.leave_type || "paid") : null,
            fine_amount: Number(r.fine_amount ?? 0) || 0,
          };
        }),
      };

      await api.put<AttendanceListResponse>("/api/attendance/", payload);
      msg.success("Attendance saved");
      await load();
      void loadSummary();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  }, [fromDate, initialStatusByEmployeeId, load, loadSummary, msg, rows, singleDayMode]);

  const exportPdf = useCallback(async () => {
    try {
      const dateStr = fromDate.format("YYYY-MM-DD");
      const url = singleDayMode
        ? `${API_BASE_URL}/api/attendance/export/pdf?date=${encodeURIComponent(dateStr)}`
        : `${API_BASE_URL}/api/attendance/export/pdf?from_date=${encodeURIComponent(
            fromDate.format("YYYY-MM-DD")
          )}&to_date=${encodeURIComponent(toDate.format("YYYY-MM-DD"))}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      const blob = await res.blob();
      downloadBlob(blob, singleDayMode ? `attendance_${dateStr}.pdf` : `attendance_${fromDate.format("YYYY-MM")}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "PDF export failed"));
    }
  }, [fromDate, msg, singleDayMode, toDate]);

  const exportCsv = useCallback(() => {
    const dateStr = fromDate.format("YYYY-MM-DD");
    const headers = [
      "employee_id",
      "name",
      "department",
      "shift_type",
      "status",
      "leave_type",
      "overtime_hours",
      "overtime_rate",
      "late_hours",
      "late_deduction",
      "note",
    ];

    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.employee_id,
          r.name,
          r.department ?? "",
          r.shift_type ?? "",
          r.status,
          r.leave_type ?? "",
          r.overtime_hours ?? "",
          r.overtime_rate ?? "",
          r.late_hours ?? "",
          r.late_deduction ?? "",
          r.note ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `attendance_${dateStr}.csv`);
  }, [fromDate, rows]);

  const openLeaveModal = useCallback(
    (employee_id: string) => {
      setLeaveEmployeeId(employee_id);
      setLeaveRange([fromDate, toDate]);
      setLeaveType("paid");
      setLeaveReason("");
      setLeaveModalOpen(true);
    },
    [fromDate, toDate]
  );

  const submitLeavePeriod = useCallback(async () => {
    if (!leaveEmployeeId) return;
    setLeaveSaving(true);
    try {
      const payload: LeavePeriodCreate = {
        employee_id: leaveEmployeeId,
        from_date: leaveRange[0].format("YYYY-MM-DD"),
        to_date: leaveRange[1].format("YYYY-MM-DD"),
        leave_type: leaveType,
        reason: leaveReason.trim() ? leaveReason.trim() : null,
      };

      await api.post<any>("/api/leave-periods/", payload);
      msg.success("Long leave saved");
      setLeaveModalOpen(false);
      await load();
      void loadSummary();
      void loadLeaveAlerts();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to save long leave"));
    } finally {
      setLeaveSaving(false);
    }
  }, [leaveEmployeeId, leaveRange, leaveReason, leaveType, load, loadLeaveAlerts, loadSummary, msg]);

  const openLeaveInfo = useCallback(
    async (employee_id: string) => {
      setLeaveInfoOpen(true);
      setLeaveInfoLoading(true);
      setLeaveInfo(null);
      try {
        const activeOn = fromDate.format("YYYY-MM-DD");
        const res = await api.get<LeavePeriodOut[]>("/api/leave-periods/", {
          query: { employee_id, active_on: activeOn },
        });
        const first = Array.isArray(res) && res.length > 0 ? res[0] : null;
        setLeaveInfo(first);
      } catch (e: unknown) {
        setLeaveInfo(null);
      } finally {
        setLeaveInfoLoading(false);
      }
    },
    [fromDate]
  );

  const columns = useMemo((): ColumnsType<AttendanceRow> => {
    return [
      {
        key: "serial_no",
        title: "#",
        dataIndex: "serial_no",
        width: 60,
        render: (v: string) => v || "-",
      },
      {
        key: "name",
        title: "Name",
        dataIndex: "name",
        width: 160,
        ellipsis: true,
        render: (v: string, r) => (
          <Space size={6}>
            <Typography.Link
              onClick={() => router.push(`/attendance/${encodeURIComponent(r.employee_id)}`)}
              style={{ cursor: "pointer" }}
            >
              {v}
            </Typography.Link>
            {r.status === "leave" ? (
              <Tag
                color={r.leave_type === "unpaid" ? "volcano" : "blue"}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void openLeaveInfo(r.employee_id);
                }}
              >
                Long Leave ({(r.leave_type || "paid").toUpperCase()})
              </Tag>
            ) : null}
          </Space>
        ),
      },
      {
        key: "rank",
        title: "Rank",
        dataIndex: "rank",
        width: 100,
        ellipsis: true,
        render: (v: string) => v || "-",
      },
      {
        key: "emp_status",
        title: "Status",
        dataIndex: "emp_status",
        width: 80,
        ellipsis: true,
        render: (v: string) => v || "-",
      },
      {
        key: "unit",
        title: "Unit",
        dataIndex: "unit",
        width: 100,
        ellipsis: true,
        render: (v: string) => v || "-",
      },
      {
        key: "department",
        title: "Category",
        dataIndex: "department",
        width: 130,
        ellipsis: true,
        render: (v: string) => v || "-",
      },
      {
        key: "attendance_status",
        title: "Attendance",
        width: 170,
        render: (_, r) => (
          <Segmented
            value={r.status}
            disabled={!singleDayMode}
            options={[
              {
                label: <span style={{ padding: "0 2px", display: "inline-block" }}>-</span>,
                value: "unmarked",
              },
              {
                label: <span style={{ padding: "0 2px", display: "inline-block" }}>P</span>,
                value: "present",
              },
              {
                label: <span style={{ padding: "0 2px", display: "inline-block" }}>Late</span>,
                value: "late",
              },
              {
                label: <span style={{ padding: "0 2px", display: "inline-block" }}>A</span>,
                value: "absent",
              },
              {
                label: <span style={{ padding: "0 2px", display: "inline-block" }}>L</span>,
                value: "leave",
              },
            ]}
            onChange={(v) => normalizeRowForStatus(r.employee_id, v as AttendanceStatus)}
            size="small"
            style={{ minWidth: 150 }}
          />
        ),
      },
      {
        key: "long_leave",
        title: "Long Leave",
        width: 120,
        render: (_, r) => (
          <Button size="small" onClick={() => openLeaveModal(r.employee_id)} disabled={!singleDayMode}>
            Long Leave
          </Button>
        ),
      },
      {
        key: "leave_type",
        title: "Leave type",
        width: 120,
        render: (_, r) => (
          <Select
            size="small"
            value={r.leave_type || undefined}
            disabled={!singleDayMode || r.status !== "leave"}
            placeholder="Paid"
            style={{ width: "100%" }}
            options={[
              { label: "Paid", value: "paid" },
              { label: "Unpaid", value: "unpaid" },
            ]}
            onChange={(v) => setRow(r.employee_id, { leave_type: v })}
          />
        ),
      },
      {
        key: "ot",
        title: "OT",
        width: 150,
        render: (_, r) => (
          <Space size={6} style={{ width: "100%" }}>
            <InputNumber
              size="small"
              min={0}
              step={0.5}
              value={r.overtime_hours}
              disabled={!singleDayMode || r.status !== "present"}
              style={{ width: 64 }}
              placeholder="hrs"
              onChange={(v) => setRow(r.employee_id, { overtime_hours: v ?? undefined })}
            />
            <InputNumber
              size="small"
              min={0}
              step={10}
              value={r.overtime_rate}
              disabled={!singleDayMode || r.status !== "present"}
              style={{ width: 72 }}
              placeholder="rate"
              onChange={(v) => setRow(r.employee_id, { overtime_rate: v ?? undefined })}
            />
          </Space>
        ),
      },
      {
        key: "late",
        title: "Late",
        width: 170,
        render: (_, r) => (
          <Space size={6} style={{ width: "100%" }}>
            <InputNumber
              size="small"
              min={0}
              step={0.25}
              value={r.late_hours}
              disabled={!singleDayMode || r.status !== "present"}
              style={{ width: 64 }}
              placeholder="hrs"
              onChange={(v) => setRow(r.employee_id, { late_hours: v ?? undefined })}
            />
            <InputNumber
              size="small"
              min={0}
              step={50}
              value={r.late_deduction}
              disabled={!singleDayMode || (r.status !== "present" && r.status !== "late")}
              style={{ width: 92 }}
              placeholder="deduct"
              onChange={(v) => setRow(r.employee_id, { late_deduction: v ?? undefined })}
            />
          </Space>
        ),
      },
      {
        key: "fine",
        title: "Fine",
        width: 100,
        render: (_, r) => (
          <InputNumber
            size="small"
            min={0}
            step={50}
            value={r.fine_amount}
            disabled={!singleDayMode}
            style={{ width: "100%" }}
            placeholder="0"
            onChange={(v) => setRow(r.employee_id, { fine_amount: Number(v ?? 0) })}
          />
        ),
      },
      {
        key: "note",
        title: "Note",
        width: 160,
        ellipsis: true,
        render: (_, r) => (
          <Input
            size="small"
            value={r.note}
            disabled={!singleDayMode}
            placeholder="Optional"
            onChange={(e) => setRow(r.employee_id, { note: e.target.value })}
          />
        ),
      },
    ];
  }, [normalizeRowForStatus, openLeaveInfo, openLeaveModal, router, setRow]);

  return (
    <>
      {msgCtx}
      <Card
        variant="borderless"
        style={{ borderRadius: 0, height: "calc(100vh - 24px)", overflow: "hidden" }}
        styles={{ body: { padding: 12, height: "100%", overflowY: "auto" } }}
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Modal
            title="Mark Long Leave"
            open={leaveModalOpen}
            onCancel={() => setLeaveModalOpen(false)}
            onOk={() => void submitLeavePeriod()}
            okText="Save"
            confirmLoading={leaveSaving}
            destroyOnClose
          >
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div>
                <Typography.Text strong>Employee ID</Typography.Text>
                <div>
                  <Typography.Text>{leaveEmployeeId ?? "-"}</Typography.Text>
                </div>
              </div>
              <div>
                <Typography.Text strong>Leave Dates</Typography.Text>
                <DatePicker.RangePicker
                  value={leaveRange as any}
                  onChange={(r) => {
                    const start = r?.[0] ?? fromDate;
                    const end = r?.[1] ?? start;
                    setLeaveRange([start, end]);
                  }}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <Typography.Text strong>Leave Type</Typography.Text>
                <Select
                  value={leaveType}
                  onChange={(v) => setLeaveType(v)}
                  style={{ width: "100%" }}
                  options={[
                    { label: "Paid", value: "paid" },
                    { label: "Unpaid", value: "unpaid" },
                  ]}
                />
              </div>
              <div>
                <Typography.Text strong>Reason (optional)</Typography.Text>
                <Input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="Optional" />
              </div>
            </Space>
          </Modal>

          <Modal
            title="Long Leave Details"
            open={leaveInfoOpen}
            onCancel={() => setLeaveInfoOpen(false)}
            footer={null}
            destroyOnClose
          >
            <Space direction="vertical" style={{ width: "100%" }} size={8}>
              {leaveInfoLoading ? (
                <Typography.Text>Loading...</Typography.Text>
              ) : leaveInfo ? (
                <>
                  <Typography.Text>
                    <strong>From:</strong> {leaveInfo.from_date}
                  </Typography.Text>
                  <Typography.Text>
                    <strong>To:</strong> {leaveInfo.to_date}
                  </Typography.Text>
                  <Typography.Text>
                    <strong>Type:</strong> {(leaveInfo.leave_type || "paid").toUpperCase()}
                  </Typography.Text>
                  <Typography.Text>
                    <strong>Reason:</strong> {leaveInfo.reason || "-"}
                  </Typography.Text>
                </>
              ) : (
                <Typography.Text type="secondary">No long leave period found for this employee on the selected day.</Typography.Text>
              )}
            </Space>
          </Modal>

          {leaveAlertsLoading || leaveAlerts.length > 0 ? (
            <Card size="small" style={{ borderRadius: 0 }}>
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                <Typography.Text strong>Long Leave Alerts</Typography.Text>
                <List
                  size="small"
                  loading={leaveAlertsLoading}
                  dataSource={leaveAlerts}
                  renderItem={(a) => (
                    <List.Item>
                      <Alert
                        type="warning"
                        showIcon
                        message={`Employee ${a.employee_id} leave ended (${a.to_date})`}
                        description={a.message}
                      />
                    </List.Item>
                  )}
                />
              </Space>
            </Card>
          ) : null}

          <Row gutter={[12, 12]} align="middle">
            <Col flex="auto">
              <Space size={12} wrap>
                <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>
                  <Typography.Text>Attendance</Typography.Text>
                </div>
              </Space>
            </Col>
            <Col>
              <Space wrap>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    if (singleDayMode) void load();
                    void loadSummary();
                  }}
                >
                  Refresh
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => void exportPdf()}>
                  Export PDF
                </Button>
                <Button icon={<DownloadOutlined />} onClick={exportCsv}>
                  Export CSV
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  disabled={!singleDayMode}
                  onClick={() => void save()}
                >
                  Save
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={[8, 8]} align="stretch">
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Statistic title="Total" value={kpiRows.length} loading={loading} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Statistic title="Unmarked" value={statusCounts.unmarked} loading={loading} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Statistic
                  title="Present"
                  value={statusCounts.present}
                  styles={{ content: { color: "#1677ff" } }}
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Statistic
                  title="Absent"
                  value={statusCounts.absent}
                  styles={{ content: { color: "#cf1322" } }}
                  loading={loading}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Statistic title="Leave" value={statusCounts.leave} loading={loading} />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Statistic title="Fine Total" value={fineTotal} loading={loading} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={6}>
              <DatePicker.RangePicker
                value={effectiveRange as any}
                onChange={(r) => {
                  const start = r?.[0] ?? dayjs();
                  const end = r?.[1] ?? start;
                  setFromDate(start);
                  setToDate(end);
                }}
                style={{ width: "100%" }}
              />
              <div style={{ marginTop: 6 }}>
                <Typography.Text type="secondary">
                  {singleDayMode
                    ? `Editing day: ${fromDate.format("YYYY-MM-DD")}`
                    : `Range mode: KPIs show ${fromDate.format("YYYY-MM-DD")} → ${toDate.format(
                        "YYYY-MM-DD"
                      )}. Select a single day (From=To) to edit the table.`}
                </Typography.Text>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ID, name, department"
                allowClear
              />
            </Col>
            <Col xs={24} md={5}>
              <Select
                value={department}
                onChange={(v) => setDepartment(v || undefined)}
                placeholder="Department"
                allowClear
                showSearch
                optionFilterProp="label"
                options={departments.map((d) => ({ label: d, value: d }))}
              />
            </Col>
            <Col xs={24} md={5}>
              <Select
                value={designation}
                onChange={(v) => setDesignation(v || undefined)}
                placeholder="Designation (optional)"
                allowClear
                showSearch
                optionFilterProp="label"
                options={designations.map((d) => ({ label: d, value: d }))}
              />
            </Col>
          </Row>

          <Typography.Text type="secondary">
            Tip: Use status buttons per employee. When you select Present, you can enter OT hours + rate and Late hours + deduction. When you select Leave, pick Paid/Unpaid.
          </Typography.Text>

          <Table<AttendanceRow>
            rowKey={(r) => r.employee_id}
            columns={columns}
            dataSource={filteredRows}
            loading={loading}
            pagination={{
              defaultPageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50", "100"],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
            }}
            scroll={{ x: 1400 }}
            tableLayout="fixed"
            size="small"
          />
        </Space>
      </Card>
    </>
  );
}
