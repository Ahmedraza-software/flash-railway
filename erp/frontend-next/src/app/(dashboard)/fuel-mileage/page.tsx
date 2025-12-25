"use client";

import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  InputNumber,
  List,
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
  VehicleAssignmentAggRow,
  VehicleAssignmentAnalyticsResponse,
  VehicleAssignment,
  Vehicle,
} from "@/lib/types";

type AssignmentFilters = {
  period: "today" | "day" | "month" | "year";
  day?: dayjs.Dayjs | null;
  month?: dayjs.Dayjs | null;
  year?: number | null;
  vehicle_id?: string;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function tipTag(t: { level: string; title: string; detail: string }) {
  const lvl = (t.level ?? "info").toLowerCase();
  const color = lvl === "warning" ? "gold" : lvl === "success" ? "green" : lvl === "error" ? "red" : "blue";
  return <Tag color={color}>{t.level}</Tag>;
}

export default function FuelMileagePage() {
  const [msg, msgCtx] = message.useMessage();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [assignLoading, setAssignLoading] = useState(false);
  const [assignFilters, setAssignFilters] = useState<AssignmentFilters>({ period: "today" });
  const [assignAnalytics, setAssignAnalytics] = useState<VehicleAssignmentAnalyticsResponse | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<VehicleAssignment[]>([]);

  const loadVehicles = useCallback(async () => {
    try {
      const v = await api.get<Vehicle[]>("/api/vehicles/", { query: { limit: 1000 } });
      setVehicles(Array.isArray(v) ? v : []);
    } catch {
      setVehicles([]);
    }
  }, []);

  const assignmentRange = useMemo(() => {
    const p = assignFilters.period;
    if (p === "today") {
      const d = dayjs();
      return { from: d.format("YYYY-MM-DD"), to: d.format("YYYY-MM-DD") };
    }
    if (p === "day") {
      const d = assignFilters.day ?? dayjs();
      return { from: d.format("YYYY-MM-DD"), to: d.format("YYYY-MM-DD") };
    }
    if (p === "month") {
      const m = assignFilters.month ?? dayjs();
      return { from: m.startOf("month").format("YYYY-MM-DD"), to: m.endOf("month").format("YYYY-MM-DD") };
    }
    const y = Number(assignFilters.year ?? dayjs().year());
    const start = dayjs(`${y}-01-01`);
    return { from: start.format("YYYY-MM-DD"), to: start.endOf("year").format("YYYY-MM-DD") };
  }, [assignFilters.day, assignFilters.month, assignFilters.period, assignFilters.year]);

  const loadAssignmentAnalytics = useCallback(async () => {
    setAssignLoading(true);
    try {
      const q: Record<string, string | number | undefined> = {
        period: assignFilters.period,
        vehicle_id: assignFilters.vehicle_id,
      };

      if (assignFilters.period === "day") {
        q.day = (assignFilters.day ?? dayjs()).format("YYYY-MM-DD");
      } else if (assignFilters.period === "month") {
        q.month = (assignFilters.month ?? dayjs()).format("YYYY-MM");
      } else if (assignFilters.period === "year") {
        q.year = Number(assignFilters.year ?? dayjs().year());
      }

      const data = await api.get<VehicleAssignmentAnalyticsResponse>("/api/vehicle-assignments/analytics", {
        query: q,
      });
      setAssignAnalytics(data ?? null);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load assignment analytics"));
      setAssignAnalytics(null);
    } finally {
      setAssignLoading(false);
    }
  }, [assignFilters.day, assignFilters.month, assignFilters.period, assignFilters.vehicle_id, assignFilters.year, msg]);

  const loadAssignmentDetails = useCallback(async () => {
    setDetailLoading(true);
    try {
      const data = await api.get<VehicleAssignment[]>("/api/vehicle-assignments/", {
        query: {
          vehicle_id: assignFilters.vehicle_id,
          status: "Complete",
          from_date: assignmentRange.from,
          to_date: assignmentRange.to,
          limit: 2000,
        },
      });
      setDetailRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load assignment details"));
      setDetailRows([]);
    } finally {
      setDetailLoading(false);
    }
  }, [assignmentRange.from, assignmentRange.to, assignFilters.vehicle_id, msg]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    void loadAssignmentAnalytics();
  }, [loadAssignmentAnalytics]);

  useEffect(() => {
    void loadAssignmentDetails();
  }, [loadAssignmentDetails]);

  const vehicleOptions = useMemo(
    () =>
      vehicles
        .map((v) => ({
          label: `${v.vehicle_id} - ${v.license_plate} - ${v.make_model}`,
          value: v.vehicle_id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [vehicles]
  );

  const kmMax = useMemo(() => {
    const rows = assignAnalytics?.rows ?? [];
    let m = 0;
    for (const r of rows) m = Math.max(m, Number(r.total_km ?? 0));
    return m;
  }, [assignAnalytics?.rows]);

  const assignmentColumns = useMemo((): ColumnsType<VehicleAssignmentAggRow> => {
    return [
      {
        title: "Vehicle",
        dataIndex: "vehicle_id",
        width: 120,
        render: (v) => <Tag>{String(v)}</Tag>,
      },
      {
        title: "KM",
        dataIndex: "total_km",
        width: 90,
        align: "right",
        render: (v) => (typeof v === "number" ? v.toFixed(1) : "-"),
      },
      {
        title: "Amount",
        dataIndex: "total_amount",
        width: 120,
        align: "right",
        render: (v) => (typeof v === "number" ? `Rs ${v.toFixed(2)}` : "-"),
      },
      {
        title: "Rate/KM",
        dataIndex: "avg_rate_per_km",
        width: 110,
        align: "right",
        render: (v) => (typeof v === "number" ? v.toFixed(2) : "-"),
      },
      {
        title: "Cost/KM",
        dataIndex: "cost_per_km",
        width: 110,
        align: "right",
        render: (v) => (typeof v === "number" ? v.toFixed(2) : "-"),
      },
      {
        title: "KM chart",
        key: "km_chart",
        width: 180,
        render: (_, r) => {
          const km = Number(r.total_km ?? 0);
          const pct = kmMax > 0 ? Math.max(0, Math.min(100, (km / kmMax) * 100)) : 0;
          return (
            <div style={{ width: 160, height: 10, background: "#f0f0f0", borderRadius: 8 }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: 10,
                  background: "#1677ff",
                  borderRadius: 8,
                }}
              />
            </div>
          );
        },
      },
    ];
  }, [kmMax]);

  const assignKpis = useMemo(() => {
    const rows = assignAnalytics?.rows ?? [];
    const totalKm = rows.reduce((a, r) => a + Number(r.total_km ?? 0), 0);
    const totalAmount = rows.reduce((a, r) => a + Number(r.total_amount ?? 0), 0);
    const avgRate = totalKm > 0 ? totalAmount / totalKm : null;

    return {
      totalKm,
      totalAmount,
      avgRatePerKm: avgRate,
      vehicles: rows.length,
      assignments: rows.reduce((a, r) => a + Number(r.assignments ?? 0), 0),
    };
  }, [assignAnalytics?.rows]);

  const assignTips = useMemo(() => {
    const tips: Array<{ level: string; title: string; detail: string }> = [];
    const rows = assignAnalytics?.rows ?? [];
    if (!rows.length) {
      tips.push({ level: "info", title: "No data", detail: "No completed assignments found for this period." });
      return tips;
    }
    const best = assignAnalytics?.best_cost_per_km?.[0];
    const worst = assignAnalytics?.worst_cost_per_km?.[0];
    if (best?.cost_per_km != null) {
      tips.push({
        level: "success",
        title: "Best cost/km",
        detail: `${best.vehicle_id} has the lowest cost/km (${best.cost_per_km.toFixed(2)} Rs/km).`,
      });
    }
    if (worst?.cost_per_km != null) {
      tips.push({
        level: "warning",
        title: "High cost/km",
        detail: `${worst.vehicle_id} has the highest cost/km (${worst.cost_per_km.toFixed(2)} Rs/km). Review rate and routes.`,
      });
    }
    return tips;
  }, [assignAnalytics]);

  const detailColumns = useMemo((): ColumnsType<VehicleAssignment> => {
    return [
      {
        title: "Date",
        dataIndex: "assignment_date",
        width: 110,
        render: (v) => (v ? dayjs(String(v)).format("YYYY-MM-DD") : "-"),
      },
      {
        title: "Vehicle",
        dataIndex: "vehicle_id",
        width: 120,
        render: (v) => <Tag>{String(v)}</Tag>,
      },
      {
        title: "KM",
        dataIndex: "distance_km",
        width: 90,
        align: "right",
        render: (v) => (typeof v === "number" ? v.toFixed(1) : "-"),
      },
      {
        title: "Rate/KM",
        dataIndex: "rate_per_km",
        width: 100,
        align: "right",
        render: (v) => (typeof v === "number" ? v.toFixed(2) : "-"),
      },
      {
        title: "Amount",
        dataIndex: "amount",
        width: 120,
        align: "right",
        render: (v) => (typeof v === "number" ? `Rs ${v.toFixed(2)}` : "-"),
      },
      {
        title: "Route",
        key: "route",
        ellipsis: true,
        render: (_, r) => `${r.route_from ?? ""} → ${r.route_to ?? ""}`.trim() || "-",
      },
      {
        title: "Status",
        dataIndex: "status",
        width: 110,
        render: (v) => <Tag color={String(v).toLowerCase() === "complete" ? "green" : "default"}>{String(v)}</Tag>,
      },
    ];
  }, []);

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Space size={10} wrap>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Fuel & Mileage
                </Typography.Title>
                <Badge count={assignAnalytics?.rows?.length ?? 0} showZero color="#1677ff" style={{ boxShadow: "none" }} />
              </Space>
            </Col>
            <Col>
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void loadAssignmentAnalytics()}>
                  Refresh
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} md={16}>
              <Row gutter={[12, 12]}>
                <Col xs={12} md={8}>
                  <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                    <Typography.Text type="secondary">Total KM</Typography.Text>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {assignKpis.totalKm.toFixed(1)}
                    </Typography.Title>
                  </Card>
                </Col>
                <Col xs={12} md={8}>
                  <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                    <Typography.Text type="secondary">Total Cost</Typography.Text>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      Rs {assignKpis.totalAmount.toFixed(2)}
                    </Typography.Title>
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                    <Typography.Text type="secondary">Avg Rs/km</Typography.Text>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {assignKpis.avgRatePerKm != null ? assignKpis.avgRatePerKm.toFixed(2) : "-"}
                    </Typography.Title>
                  </Card>
                </Col>
                <Col xs={12} md={8}>
                  <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                    <Typography.Text type="secondary">Vehicles</Typography.Text>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {assignKpis.vehicles}
                    </Typography.Title>
                  </Card>
                </Col>
                <Col xs={12} md={8}>
                  <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                    <Typography.Text type="secondary">Assignments</Typography.Text>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {assignKpis.assignments}
                    </Typography.Title>
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                    <Typography.Text type="secondary">Period</Typography.Text>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {assignFilters.period.toUpperCase()}
                    </Typography.Title>
                  </Card>
                </Col>
              </Row>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  Tips
                </Typography.Title>
                <List
                  size="small"
                  dataSource={assignTips}
                  locale={{ emptyText: "No tips" }}
                  renderItem={(t) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space size={8}>
                            {tipTag(t)}
                            <span>{t.title}</span>
                          </Space>
                        }
                        description={t.detail}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>

          <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
            <Row gutter={[8, 8]} align="middle">
              <Col xs={24} md={6}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  Assignment KM/Cost
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  From Vehicle Assignments module
                </Typography.Text>
              </Col>
              <Col xs={24} md={4}>
                <Select
                  value={assignFilters.period}
                  onChange={(v) =>
                    setAssignFilters((p) => ({
                      ...p,
                      period: v as AssignmentFilters["period"],
                    }))
                  }
                  options={[
                    { label: "Today", value: "today" },
                    { label: "Day", value: "day" },
                    { label: "Month", value: "month" },
                    { label: "Year", value: "year" },
                  ]}
                />
              </Col>
              <Col xs={24} md={6}>
                {assignFilters.period === "day" ? (
                  <DatePicker
                    value={assignFilters.day ?? dayjs()}
                    onChange={(d) => setAssignFilters((p) => ({ ...p, day: d }))}
                    style={{ width: "100%" }}
                  />
                ) : assignFilters.period === "month" ? (
                  <DatePicker
                    picker="month"
                    value={assignFilters.month ?? dayjs()}
                    onChange={(d) => setAssignFilters((p) => ({ ...p, month: d }))}
                    style={{ width: "100%" }}
                  />
                ) : assignFilters.period === "year" ? (
                  <InputNumber
                    value={assignFilters.year ?? dayjs().year()}
                    onChange={(v) => setAssignFilters((p) => ({ ...p, year: (v as number) ?? null }))}
                    style={{ width: "100%" }}
                    min={2000}
                    max={2100}
                  />
                ) : (
                  <div />
                )}
              </Col>
              <Col xs={24} md={6}>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Vehicle (optional)"
                  value={assignFilters.vehicle_id}
                  onChange={(v) => setAssignFilters((p) => ({ ...p, vehicle_id: v ?? undefined }))}
                  options={vehicleOptions}
                />
              </Col>
              <Col xs={24} md={2}>
                <Button
                  loading={assignLoading || detailLoading}
                  onClick={() => {
                    void loadAssignmentAnalytics();
                    void loadAssignmentDetails();
                  }}
                  style={{ width: "100%" }}
                >
                  Load
                </Button>
              </Col>
            </Row>

            <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
              <Col xs={24} md={14}>
                <Table<VehicleAssignmentAggRow>
                  rowKey={(r) => r.vehicle_id}
                  size="small"
                  loading={assignLoading}
                  dataSource={assignAnalytics?.rows ?? []}
                  columns={assignmentColumns}
                  pagination={{ pageSize: 7, showSizeChanger: true }}
                  scroll={{ x: 820 }}
                />
              </Col>
              <Col xs={24} md={5}>
                <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    Best (Low Cost/KM)
                  </Typography.Title>
                  <List
                    size="small"
                    dataSource={assignAnalytics?.best_cost_per_km ?? []}
                    locale={{ emptyText: "No data" }}
                    renderItem={(r) => (
                      <List.Item>
                        <Space direction="vertical" size={0} style={{ width: "100%" }}>
                          <Typography.Text strong>{r.vehicle_id}</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {r.total_km.toFixed(1)} km • Rs {r.total_amount.toFixed(2)} • {r.cost_per_km?.toFixed(2)} Rs/km
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
              <Col xs={24} md={5}>
                <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    Worst (High Cost/KM)
                  </Typography.Title>
                  <List
                    size="small"
                    dataSource={assignAnalytics?.worst_cost_per_km ?? []}
                    locale={{ emptyText: "No data" }}
                    renderItem={(r) => (
                      <List.Item>
                        <Space direction="vertical" size={0} style={{ width: "100%" }}>
                          <Typography.Text strong>{r.vehicle_id}</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {r.total_km.toFixed(1)} km • Rs {r.total_amount.toFixed(2)} • {r.cost_per_km?.toFixed(2)} Rs/km
                          </Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
            </Row>
          </Card>

          <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              Details
            </Typography.Title>
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
              Date • Vehicle • KM • Rate/KM • Amount • Route
            </Typography.Text>
            <Table<VehicleAssignment>
              rowKey={(r) => r.id}
              size="small"
              loading={detailLoading}
              dataSource={detailRows}
              columns={detailColumns}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              scroll={{ x: 1050 }}
            />
          </Card>
        </Space>
      </Card>
    </>
  );
}
