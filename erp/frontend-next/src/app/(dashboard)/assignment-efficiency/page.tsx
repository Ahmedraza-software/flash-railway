"use client";

import {
  Button,
  Card,
  Col,
  DatePicker,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  Employee,
  Vehicle,
  VehicleAssignment,
  VehicleAssignmentAnalyticsResponse,
} from "@/lib/types";

type Filters = {
  period: "today" | "day" | "month" | "year";
  day?: dayjs.Dayjs | null;
  month?: dayjs.Dayjs | null;
  year?: number | null;
  vehicle_id?: string;
};

type DriverSummaryRow = {
  employee_id: string;
  driver_name?: string | null;
  assignments: number;
  total_km: number;
  total_amount: number;
  avg_cost_per_km: number | null;
  delta_vs_vehicle_avg: number | null;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function fmt(n: number | null | undefined, d = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "-";
  return n.toFixed(d);
}

export default function AssignmentEfficiencyPage() {
  const [msg, msgCtx] = message.useMessage();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [filters, setFilters] = useState<Filters>({ period: "today" });

  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [vehicleAssignments, setVehicleAssignments] = useState<VehicleAssignment[]>([]);

  const [countsLoading, setCountsLoading] = useState(false);
  const [vehicleTripCounts, setVehicleTripCounts] = useState<Record<string, number>>({});

  const employeeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.employee_id, `${e.first_name} ${e.last_name}`.trim());
    return m;
  }, [employees]);

  const vehicleCompareRows = useMemo(() => {
    return vehicleAssignments
      .map((a) => {
        const km = typeof a.distance_km === "number" ? a.distance_km : null;
        const amount = typeof a.amount === "number" ? a.amount : null;
        const costPerKm = km && km > 0 && amount != null ? amount / km : null;
        const driverId = (a.employee_ids && a.employee_ids.length ? a.employee_ids[0] : null) as string | null;
        const driverName = driverId ? employeeNameById.get(driverId) : null;
        return {
          ...a,
          _driver_id: driverId,
          _driver_name: driverName,
          _cost_per_km: costPerKm,
        };
      })
      .sort((a, b) => String(b.assignment_date ?? "").localeCompare(String(a.assignment_date ?? "")));
  }, [employeeNameById, vehicleAssignments]);

  const vehicleBaselineAvg = useMemo(() => {
    const rows = vehicleCompareRows as Array<{ _cost_per_km?: number | null }>;
    const vals = rows.map((r) => r._cost_per_km).filter((v): v is number => typeof v === "number" && v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [vehicleCompareRows]);

  const driverSummary = useMemo<DriverSummaryRow[]>(() => {
    const vAvg = vehicleBaselineAvg;
    const by: Record<string, DriverSummaryRow> = {};
    for (const r of vehicleCompareRows) {
      const eid = (r as unknown as { _driver_id?: string | null })._driver_id;
      if (!eid) continue;
      const km = typeof r.distance_km === "number" ? r.distance_km : 0;
      const amt = typeof r.amount === "number" ? r.amount : 0;
      if (!by[eid]) {
        by[eid] = {
          employee_id: eid,
          driver_name: employeeNameById.get(eid) ?? null,
          assignments: 0,
          total_km: 0,
          total_amount: 0,
          avg_cost_per_km: null,
          delta_vs_vehicle_avg: null,
        };
      }
      by[eid].assignments += 1;
      by[eid].total_km += km;
      by[eid].total_amount += amt;
    }
    const out = Object.values(by).map((d) => {
      d.avg_cost_per_km = d.total_km > 0 ? d.total_amount / d.total_km : null;
      d.delta_vs_vehicle_avg = d.avg_cost_per_km != null && vAvg != null ? d.avg_cost_per_km - vAvg : null;
      return d;
    });
    return out.sort((a, b) => (b.avg_cost_per_km ?? 0) - (a.avg_cost_per_km ?? 0));
  }, [employeeNameById, vehicleBaselineAvg, vehicleCompareRows]);

  const loadLookups = useCallback(async () => {
    try {
      const [v, e] = await Promise.all([
        api.get<Vehicle[]>("/api/vehicles/", { query: { limit: 1000 } }),
        api.get<Employee[]>("/api/employees/", { query: { skip: 0, limit: 2000, with_total: false } }),
      ]);
      setVehicles(Array.isArray(v) ? v : []);
      setEmployees(Array.isArray(e) ? e : []);
    } catch {
      setVehicles([]);
      setEmployees([]);
    }
  }, []);

  const periodRange = useMemo(() => {
    const p = filters.period;
    if (p === "today") {
      const d = dayjs();
      return { from: d.format("YYYY-MM-DD"), to: d.format("YYYY-MM-DD") };
    }
    if (p === "day") {
      const d = filters.day ?? dayjs();
      return { from: d.format("YYYY-MM-DD"), to: d.format("YYYY-MM-DD") };
    }
    if (p === "month") {
      const m = filters.month ?? dayjs();
      return { from: m.startOf("month").format("YYYY-MM-DD"), to: m.endOf("month").format("YYYY-MM-DD") };
    }
    const y = Number(filters.year ?? dayjs().year());
    const start = dayjs(`${y}-01-01`);
    return { from: start.format("YYYY-MM-DD"), to: start.endOf("year").format("YYYY-MM-DD") };
  }, [filters.day, filters.month, filters.period, filters.year]);

  const loadVehicleCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const q: Record<string, string | number | undefined> = {
        period: filters.period,
      };
      if (filters.period === "day") {
        q.day = (filters.day ?? dayjs()).format("YYYY-MM-DD");
      } else if (filters.period === "month") {
        q.month = (filters.month ?? dayjs()).format("YYYY-MM");
      } else if (filters.period === "year") {
        q.year = Number(filters.year ?? dayjs().year());
      }

      const res = await api.get<VehicleAssignmentAnalyticsResponse>("/api/vehicle-assignments/analytics", { query: q });
      const m: Record<string, number> = {};
      for (const r of res?.rows ?? []) {
        m[String(r.vehicle_id)] = Number(r.assignments ?? 0);
      }
      setVehicleTripCounts(m);
    } catch {
      setVehicleTripCounts({});
    } finally {
      setCountsLoading(false);
    }
  }, [filters.day, filters.month, filters.period, filters.year]);

  const loadVehicleAssignments = useCallback(async () => {
    if (!filters.vehicle_id) {
      setVehicleAssignments([]);
      return;
    }
    setVehicleLoading(true);
    try {
      const list = await api.get<VehicleAssignment[]>("/api/vehicle-assignments/", {
        query: {
          vehicle_id: filters.vehicle_id,
          status: "Complete",
          from_date: periodRange.from,
          to_date: periodRange.to,
          limit: 5000,
        },
      });
      setVehicleAssignments(Array.isArray(list) ? list : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load vehicle assignments"));
      setVehicleAssignments([]);
    } finally {
      setVehicleLoading(false);
    }
  }, [filters.vehicle_id, msg, periodRange.from, periodRange.to]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadVehicleAssignments();
  }, [loadVehicleAssignments]);

  useEffect(() => {
    void loadVehicleCounts();
  }, [loadVehicleCounts]);

  const vehicleOptions = useMemo(
    () =>
      vehicles
        .map((v) => ({
          label: `${v.vehicle_id} - ${v.license_plate} - ${v.make_model} (${vehicleTripCounts[v.vehicle_id] ?? 0})`,
          value: v.vehicle_id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [vehicleTripCounts, vehicles]
  );

  const driverSummaryColumns = useMemo<ColumnsType<DriverSummaryRow>>(
    () => [
      {
        title: "Driver",
        dataIndex: "employee_id",
        render: (v, r) => (
          <Typography.Text>
            <b>{String(v)}</b>
            {r.driver_name ? ` (${r.driver_name})` : ""}
          </Typography.Text>
        ),
      },
      {
        title: "Trips",
        dataIndex: "assignments",
        width: 70,
        align: "right",
      },
      {
        title: "KM",
        dataIndex: "total_km",
        width: 80,
        align: "right",
        render: (v) => fmt(v, 1),
      },
      {
        title: "Rs/km",
        dataIndex: "avg_cost_per_km",
        width: 80,
        align: "right",
        render: (v) => fmt(v, 2),
      },
      {
        title: "+/-",
        dataIndex: "delta_vs_vehicle_avg",
        width: 70,
        align: "right",
        render: (v) => {
          if (typeof v !== "number") return "-";
          const c = v > 0 ? "red" : "green";
          return <Tag color={c}>{v.toFixed(2)}</Tag>;
        },
      },
    ],
    []
  );

  const vehicleCompareColumns = useMemo<ColumnsType<VehicleAssignment>>(
    () => [
      {
        title: "Date",
        dataIndex: "assignment_date",
        width: 95,
        render: (v) => (v ? dayjs(String(v)).format("YYYY-MM-DD") : "-"),
      },
      {
        title: "Driver",
        key: "driver",
        width: 170,
        render: (_, r) => {
          const driverId = (r.employee_ids && r.employee_ids.length ? r.employee_ids[0] : null) as string | null;
          if (!driverId) return "-";
          const name = employeeNameById.get(driverId);
          return (
            <Typography.Text>
              <b>{driverId}</b>
              {name ? ` (${name})` : ""}
            </Typography.Text>
          );
        },
      },
      {
        title: "KM",
        dataIndex: "distance_km",
        width: 75,
        align: "right",
        render: (v) => fmt(typeof v === "number" ? v : null, 1),
      },
      {
        title: "Amount",
        dataIndex: "amount",
        width: 95,
        align: "right",
        render: (v) => (typeof v === "number" ? `Rs ${v.toFixed(0)}` : "-"),
      },
      {
        title: "Rs/KM",
        key: "cost_per_km",
        width: 80,
        align: "right",
        render: (_, r) => {
          const km = typeof r.distance_km === "number" ? r.distance_km : null;
          const amt = typeof r.amount === "number" ? r.amount : null;
          const cpk = km && km > 0 && amt != null ? amt / km : null;
          return fmt(cpk, 2);
        },
      },
    ],
    [employeeNameById]
  );

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Typography.Title level={4} style={{ margin: 0 }}>
                Vehicle Driver Cost Comparison
              </Typography.Title>
            </Col>
            <Col>
              <Button
                icon={<ReloadOutlined />}
                loading={vehicleLoading || countsLoading}
                onClick={() => {
                  void loadVehicleCounts();
                  void loadVehicleAssignments();
                }}
              >
                Refresh
              </Button>
            </Col>
          </Row>

          <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
            <Row gutter={[8, 8]} align="middle">
              <Col xs={24} md={4}>
                <Select
                  value={filters.period}
                  onChange={(v) => setFilters((p) => ({ ...p, period: v as Filters["period"] }))}
                  options={[
                    { label: "Today", value: "today" },
                    { label: "Day", value: "day" },
                    { label: "Month", value: "month" },
                    { label: "Year", value: "year" },
                  ]}
                />
              </Col>

              <Col xs={24} md={6}>
                {filters.period === "day" ? (
                  <DatePicker
                    value={filters.day ?? dayjs()}
                    onChange={(d) => setFilters((p) => ({ ...p, day: d }))}
                    style={{ width: "100%" }}
                  />
                ) : filters.period === "month" ? (
                  <DatePicker
                    picker="month"
                    value={filters.month ?? dayjs()}
                    onChange={(d) => setFilters((p) => ({ ...p, month: d }))}
                    style={{ width: "100%" }}
                  />
                ) : filters.period === "year" ? (
                  <InputNumber
                    value={filters.year ?? dayjs().year()}
                    onChange={(v) => setFilters((p) => ({ ...p, year: (v as number) ?? null }))}
                    style={{ width: "100%" }}
                    min={2000}
                    max={2100}
                  />
                ) : (
                  <div />
                )}
              </Col>

              <Col xs={24} md={10}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={countsLoading ? "Loading..." : "Select Vehicle"}
                  value={filters.vehicle_id}
                  onChange={(v) => setFilters((p) => ({ ...p, vehicle_id: v ?? undefined }))}
                  options={vehicleOptions}
                />
              </Col>

              <Col xs={24} md={4}>
                <Button
                  type="primary"
                  loading={vehicleLoading}
                  onClick={() => void loadVehicleAssignments()}
                  style={{ width: "100%" }}
                  disabled={!filters.vehicle_id}
                >
                  Load
                </Button>
              </Col>
            </Row>
          </Card>

          {filters.vehicle_id ? (
            <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
              <Row gutter={[12, 12]}>
                <Col xs={24} lg={9}>
                  <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                    <Typography.Title level={5} style={{ marginTop: 0 }}>
                      Drivers
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                      Baseline avg cost/km: {vehicleBaselineAvg != null ? vehicleBaselineAvg.toFixed(2) : "-"}
                    </Typography.Text>
                    <Table<DriverSummaryRow>
                      rowKey={(r) => r.employee_id}
                      size="small"
                      loading={vehicleLoading}
                      dataSource={driverSummary}
                      columns={driverSummaryColumns}
                      pagination={{ pageSize: 7, showSizeChanger: true }}
                    />
                  </Card>
                </Col>

                <Col xs={24} lg={15}>
                  <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                    <Typography.Title level={5} style={{ marginTop: 0 }}>
                      Assignments
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                      Red = higher cost/km than normal, Green = lower.
                    </Typography.Text>
                    <Table<VehicleAssignment>
                      rowKey={(r) => r.id}
                      size="small"
                      loading={vehicleLoading}
                      dataSource={vehicleCompareRows as unknown as VehicleAssignment[]}
                      columns={vehicleCompareColumns}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                      rowClassName={(r) => {
                        const km = typeof r.distance_km === "number" ? r.distance_km : null;
                        const amt = typeof r.amount === "number" ? r.amount : null;
                        const cpk = km && km > 0 && amt != null ? amt / km : null;
                        if (cpk == null || vehicleBaselineAvg == null || vehicleBaselineAvg <= 0) return "";
                        const ratio = cpk / vehicleBaselineAvg;
                        if (ratio >= 1.2) return "row-danger";
                        if (ratio <= 0.9) return "row-ok";
                        return "";
                      }}
                    />
                    <style>{
                      ".row-danger td { background: #fff1f0 !important; }\n.row-ok td { background: #f6ffed !important; }"
                    }</style>
                  </Card>
                </Col>
              </Row>
            </Card>
          ) : (
            <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
              <Typography.Text type="secondary">Select a vehicle to see driver cost per KM comparison.</Typography.Text>
            </Card>
          )}
        </Space>
      </Card>
    </>
  );
}
