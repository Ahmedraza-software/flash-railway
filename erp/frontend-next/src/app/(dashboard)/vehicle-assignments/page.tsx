"use client";

import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type {
  Employee,
  Vehicle,
  VehicleAssignment,
  VehicleAssignmentCreate,
  VehicleAssignmentUpdate,
} from "@/lib/types";

type FormValues = Omit<VehicleAssignmentCreate, "assignment_date"> & {
  assignment_date?: dayjs.Dayjs | null;
};

type TableFilters = {
  search?: string;
  status?: string;
  vehicle_id?: string;
  employee_id?: string;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function employeeLabel(e: Employee): string {
  const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
  return name ? `${name} (${e.employee_id})` : e.employee_id;
}

export default function VehicleAssignmentsPage() {
  const [msg, msgCtx] = message.useMessage();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<VehicleAssignment[]>([]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [filters, setFilters] = useState<TableFilters>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "view">("create");
  const [active, setActive] = useState<VehicleAssignment | null>(null);
  const [form] = Form.useForm<FormValues>();

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<VehicleAssignment | null>(null);
  const [completeKm, setCompleteKm] = useState<number | null>(null);
  const [completeAmount, setCompleteAmount] = useState<number | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const [veh, emp] = await Promise.all([
        api.get<Vehicle[]>("/api/vehicles/", { query: { limit: 500 } }),
        api.get<{ employees: Employee[] }>("/api/employees/", {
          query: { skip: 0, limit: 500, with_total: false },
        }),
      ]);

      setVehicles(Array.isArray(veh) ? veh : []);
      setEmployees(Array.isArray(emp?.employees) ? emp.employees : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load vehicles/employees"));
    }
  }, [msg]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<VehicleAssignment[]>("/api/vehicle-assignments/");
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load assignments"));
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setDrawerMode("create");
    setActive(null);
    form.resetFields();
    form.setFieldsValue({
      vehicle_id: "",
      employee_ids: [],
      route_stops: [],
      route_from: null,
      route_to: null,
      assignment_date: dayjs(),
      notes: null,
    });
    setDrawerOpen(true);
  }, [form]);

  const openEdit = useCallback(
    (a: VehicleAssignment) => {
      setDrawerMode("edit");
      setActive(a);
      form.resetFields();
      form.setFieldsValue({
        vehicle_id: a.vehicle_id,
        employee_ids: Array.isArray(a.employee_ids) ? a.employee_ids : [],
        route_stops: Array.isArray(a.route_stops) ? a.route_stops : [],
        route_from: a.route_from ?? null,
        route_to: a.route_to ?? null,
        assignment_date: a.assignment_date ? dayjs(a.assignment_date) : null,
        notes: a.notes ?? null,
      });
      setDrawerOpen(true);
    },
    [form]
  );

  const openView = useCallback(
    (a: VehicleAssignment) => {
      setDrawerMode("view");
      setActive(a);
      form.resetFields();
      form.setFieldsValue({
        vehicle_id: a.vehicle_id,
        employee_ids: Array.isArray(a.employee_ids) ? a.employee_ids : [],
        route_stops: Array.isArray(a.route_stops) ? a.route_stops : [],
        route_from: a.route_from ?? null,
        route_to: a.route_to ?? null,
        assignment_date: a.assignment_date ? dayjs(a.assignment_date) : null,
        notes: a.notes ?? null,
      });
      setDrawerOpen(true);
    },
    [form]
  );

  const onSubmit = useCallback(async () => {
    const values = await form.validateFields();
    try {
      const rawStops = Array.isArray(values.route_stops) ? values.route_stops : [];
      const route_stops = rawStops.map((s) => String(s).trim()).filter(Boolean);

      const assignment_date = values.assignment_date ? values.assignment_date.format("YYYY-MM-DD") : undefined;

      const payload: VehicleAssignmentCreate = {
        vehicle_id: values.vehicle_id,
        employee_ids: values.employee_ids,
        route_stops: route_stops.length >= 2 ? route_stops : undefined,
        route_from: route_stops.length >= 2 ? undefined : (values.route_from ?? undefined),
        route_to: route_stops.length >= 2 ? undefined : (values.route_to ?? undefined),
        assignment_date: (assignment_date as string | undefined) ?? null,
        notes: values.notes ?? null,
      };

      if (drawerMode === "create") {
        await api.post<VehicleAssignment>("/api/vehicle-assignments/", payload);
        msg.success("Assignment created");
      } else {
        if (!active) return;
        const patch: VehicleAssignmentUpdate = {
          vehicle_id: payload.vehicle_id,
          employee_ids: payload.employee_ids,
          route_stops: payload.route_stops,
          route_from: payload.route_from,
          route_to: payload.route_to,
          assignment_date: payload.assignment_date,
          notes: payload.notes ?? null,
        };
        await api.put<VehicleAssignment>(`/api/vehicle-assignments/${active.id}`, patch);
        msg.success("Assignment updated");
      }
      setDrawerOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [active, drawerMode, form, load, msg]);

  const openComplete = useCallback((a: VehicleAssignment) => {
    setCompleteTarget(a);
    setCompleteKm(typeof a.distance_km === "number" ? a.distance_km : null);
    setCompleteAmount(typeof a.amount === "number" ? a.amount : null);
    setCompleteOpen(true);
  }, []);

  const confirmComplete = useCallback(async () => {
    if (!completeTarget) return;
    if (completeKm === null || completeAmount === null) {
      msg.error("KM and amount are required");
      return;
    }
    try {
      await api.put<VehicleAssignment>(`/api/vehicle-assignments/${completeTarget.id}`, {
        status: "Complete",
        distance_km: completeKm,
        amount: completeAmount,
      });
      msg.success("Assignment completed");
      setCompleteOpen(false);
      setCompleteTarget(null);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to complete"));
    }
  }, [completeAmount, completeKm, completeTarget, load, msg]);

  const markIncomplete = useCallback(
    async (a: VehicleAssignment) => {
      try {
        await api.put<VehicleAssignment>(`/api/vehicle-assignments/${a.id}`, { status: "Incomplete" });
        msg.success("Marked incomplete");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to update status"));
      }
    },
    [load, msg]
  );

  const onDelete = useCallback(
    async (a: VehicleAssignment) => {
      try {
        await api.del<{ message: string }>(`/api/vehicle-assignments/${a.id}`);
        msg.success("Assignment deleted");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Delete failed"));
      }
    },
    [load, msg]
  );

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

  const employeeOptions = useMemo(
    () =>
      employees
        .map((e) => ({
          label: employeeLabel(e),
          value: e.employee_id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [employees]
  );

  const vehicleOptionsForFilter = vehicleOptions;

  const vehicleOptionsForAssignment = useMemo(() => {
    const locked = new Set<string>();
    for (const a of rows) {
      const st = String(a.status ?? "").toLowerCase();
      if (!st.startsWith("complete")) locked.add(String(a.vehicle_id ?? ""));
    }

    const allowedVehicleId = drawerMode === "edit" || drawerMode === "view" ? active?.vehicle_id : undefined;

    return vehicles
      .filter((v) => {
        const status = String(v.status ?? "").toLowerCase();
        if (status.includes("maintenance")) return false;
        if (status === "inactive") return false;

        const vid = String(v.vehicle_id ?? "");
        if (allowedVehicleId && vid === allowedVehicleId) return true;
        if (locked.has(vid)) return false;

        return true;
      })
      .map((v) => ({
        label: `${v.vehicle_id} - ${v.license_plate} - ${v.make_model}`,
        value: v.vehicle_id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [active?.vehicle_id, drawerMode, rows, vehicles]);

  const columns = useMemo<ColumnsType<VehicleAssignment>>(
    () => [
      {
        title: "ID",
        dataIndex: "id",
        width: 80,
        render: (v) => <Tag color="blue">{String(v)}</Tag>,
      },
      {
        title: "Vehicle",
        dataIndex: "vehicle_id",
        width: 140,
        render: (v) => <Tag>{String(v)}</Tag>,
      },
      {
        title: "Status",
        dataIndex: "status",
        width: 120,
        render: (v) => {
          const s = String(v ?? "");
          const isDone = s.toLowerCase().startsWith("complete");
          return <Tag color={isDone ? "green" : "default"}>{isDone ? "Complete" : "Incomplete"}</Tag>;
        },
      },
      {
        title: "Employees",
        dataIndex: "employee_ids",
        render: (ids: string[]) => {
          const list = Array.isArray(ids) ? ids : [];
          if (!list.length) return <Typography.Text type="secondary">-</Typography.Text>;
          return (
            <Space size={4} wrap>
              {list.slice(0, 3).map((id) => (
                <Tag key={id} color="geekblue">
                  {id}
                </Tag>
              ))}
              {list.length > 3 ? <Tag>+{list.length - 3}</Tag> : null}
            </Space>
          );
        },
      },
      { title: "From", dataIndex: "route_from", ellipsis: true },
      { title: "To", dataIndex: "route_to", ellipsis: true },
      {
        title: "KM",
        dataIndex: "distance_km",
        width: 90,
        render: (v, r) => {
          const done = String(r.status ?? "").toLowerCase().startsWith("complete");
          if (!done) return <Typography.Text type="secondary">-</Typography.Text>;
          return typeof v === "number" ? v.toFixed(1) : <Typography.Text type="secondary">-</Typography.Text>;
        },
      },
      {
        title: "Rate",
        dataIndex: "rate_per_km",
        width: 90,
        render: (v, r) => {
          const done = String(r.status ?? "").toLowerCase().startsWith("complete");
          if (!done) return <Typography.Text type="secondary">-</Typography.Text>;
          return typeof v === "number" ? v.toFixed(2) : <Typography.Text type="secondary">-</Typography.Text>;
        },
      },
      {
        title: "Amount",
        dataIndex: "amount",
        width: 110,
        render: (v, r) => {
          const done = String(r.status ?? "").toLowerCase().startsWith("complete");
          if (!done) return <Typography.Text type="secondary">-</Typography.Text>;
          return typeof v === "number" ? v.toFixed(2) : <Typography.Text type="secondary">-</Typography.Text>;
        },
      },
      {
        key: "actions",
        title: "",
        width: 170,
        fixed: "right",
        render: (_, r) => (
          <Space size={4}>
            {String(r.status ?? "").toLowerCase().startsWith("complete") ? (
              <Button size="small" icon={<UndoOutlined />} onClick={() => void markIncomplete(r)} />
            ) : (
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openComplete(r)} />
            )}
            <Button size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
            <Button size="small" icon={<EditOutlined />} style={{ color: "#183c70" }} onClick={() => openEdit(r)} />
            <Popconfirm title="Delete this assignment?" onConfirm={() => void onDelete(r)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [markIncomplete, onDelete, openComplete, openEdit, openView]
  );

  const filteredRows = useMemo(() => {
    const q = (filters.search ?? "").trim().toLowerCase();
    const st = (filters.status ?? "").trim().toLowerCase();
    const veh = (filters.vehicle_id ?? "").trim();
    const emp = (filters.employee_id ?? "").trim();

    return rows.filter((r) => {
      if (st) {
        const rSt = String(r.status ?? "").toLowerCase();
        const want = st === "complete" ? "complete" : "incomplete";
        if (!rSt.startsWith(want)) return false;
      }
      if (veh && String(r.vehicle_id ?? "") !== veh) return false;
      if (emp) {
        const ids = Array.isArray(r.employee_ids) ? r.employee_ids : [];
        if (!ids.includes(emp)) return false;
      }
      if (!q) return true;
      const ids = Array.isArray(r.employee_ids) ? r.employee_ids.join(" ") : "";
      const hay = `${r.vehicle_id ?? ""} ${r.route_from ?? ""} ${r.route_to ?? ""} ${r.notes ?? ""} ${ids}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filters.employee_id, filters.search, filters.status, filters.vehicle_id, rows]);

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Space size={8} wrap>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Vehicle Assignments
                </Typography.Title>
                <Badge count={filteredRows.length} showZero color="#1677ff" style={{ boxShadow: "none" }} />
              </Space>
            </Col>
            <Col>
              <Space size={6} wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  New
                </Button>
              </Space>
            </Col>
          </Row>

          <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
            <Row gutter={[8, 8]} align="middle" justify="end">
              <Col flex="auto" />
              <Col>
                <Space size={6} wrap={false}>
                  <Input
                    size="small"
                    allowClear
                    placeholder="Search"
                    style={{ width: 220 }}
                    value={filters.search}
                    onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                  />
                  <Select
                    size="small"
                    allowClear
                    placeholder="Status"
                    style={{ width: 120 }}
                    value={filters.status}
                    onChange={(v) => setFilters((p) => ({ ...p, status: v ?? undefined }))}
                    options={[
                      { label: "Incomplete", value: "incomplete" },
                      { label: "Complete", value: "complete" },
                    ]}
                  />
                  <Select
                    size="small"
                    allowClear
                    placeholder="Vehicle"
                    style={{ width: 160 }}
                    showSearch
                    optionFilterProp="label"
                    value={filters.vehicle_id}
                    onChange={(v) => setFilters((p) => ({ ...p, vehicle_id: v ?? undefined }))}
                    options={vehicleOptionsForFilter}
                  />
                  <Select
                    size="small"
                    allowClear
                    placeholder="Employee"
                    style={{ width: 180 }}
                    showSearch
                    optionFilterProp="label"
                    value={filters.employee_id}
                    onChange={(v) => setFilters((p) => ({ ...p, employee_id: v ?? undefined }))}
                    options={employeeOptions}
                  />
                  <Button size="small" onClick={() => setFilters({})}>
                    Clear
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          <Table
            rowKey={(r) => r.id}
            size="small"
            loading={loading}
            dataSource={filteredRows}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 1200 }}
          />
        </Space>
      </Card>

      <Drawer
        title={
          drawerMode === "create"
            ? "New Assignment"
            : drawerMode === "edit"
              ? `Edit Assignment #${active?.id ?? ""}`
              : `View Assignment #${active?.id ?? ""}`
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="large"
        style={{ width: 720 }}
        extra={
          <Space size={8}>
            <Button onClick={() => setDrawerOpen(false)}>{drawerMode === "view" ? "Close" : "Cancel"}</Button>
            {drawerMode !== "view" ? (
              <Button type="primary" onClick={() => void onSubmit()}>
                Save
              </Button>
            ) : null}
          </Space>
        }
      >
        {drawerMode === "view" && active ? (
          <Card size="small" variant="outlined" style={{ borderRadius: 0, marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
            <Descriptions
              size="small"
              column={2}
              items={[
                {
                  key: "date",
                  label: "Assignment Date",
                  children: active.assignment_date ? dayjs(active.assignment_date).format("YYYY-MM-DD") : "-",
                },
                {
                  key: "status",
                  label: "Status",
                  children: (
                    <Tag color={String(active.status ?? "").toLowerCase().startsWith("complete") ? "green" : "default"}>
                      {String(active.status ?? "").toLowerCase().startsWith("complete") ? "Complete" : "Incomplete"}
                    </Tag>
                  ),
                },
                {
                  key: "assigned",
                  label: "Assigned Time",
                  children: active.start_time ? dayjs(active.start_time).format("YYYY-MM-DD HH:mm") : "-",
                },
                {
                  key: "completed",
                  label: "Completed Time",
                  children: active.end_time ? dayjs(active.end_time).format("YYYY-MM-DD HH:mm") : "-",
                },
                {
                  key: "km",
                  label: "KM",
                  children: typeof active.distance_km === "number" ? active.distance_km.toFixed(1) : "-",
                },
                {
                  key: "amount",
                  label: "Amount",
                  children: typeof active.amount === "number" ? active.amount.toFixed(2) : "-",
                },
                {
                  key: "rate",
                  label: "Rate / KM",
                  children:
                    typeof active.rate_per_km === "number"
                      ? active.rate_per_km.toFixed(4)
                      : typeof active.amount === "number" && typeof active.distance_km === "number" && active.distance_km > 0
                        ? (active.amount / active.distance_km).toFixed(4)
                        : "-",
                },
              ]}
            />
          </Card>
        ) : null}

        <Form form={form} layout="vertical" disabled={drawerMode === "view"}>
          <Row gutter={[12, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="vehicle_id" label="Vehicle" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select vehicle"
                  options={vehicleOptionsForAssignment}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="employee_ids" label="Employees" rules={[{ required: true }]}>
                <Select
                  mode="multiple"
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select employees"
                  options={employeeOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="assignment_date" label="Assignment Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item
                name="route_stops"
                label="Route Stops"
                rules={[
                  {
                    validator: async (_, value) => {
                      const v = Array.isArray(value) ? value.map((s) => String(s).trim()).filter(Boolean) : [];
                      if (v.length >= 2) return;
                      throw new Error("Add at least 2 stops");
                    },
                  },
                ]}
              >
                <Select
                  mode="tags"
                  tokenSeparators={[","]}
                  placeholder="Type a stop and press Enter (e.g. Office, Site A, Site B)"
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notes" label="Notes">
                <Input.TextArea rows={3} placeholder="Optional notes" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      <Modal
        title={completeTarget ? `Complete Assignment #${completeTarget.id}` : "Complete Assignment"}
        open={completeOpen}
        onCancel={() => {
          setCompleteOpen(false);
          setCompleteTarget(null);
        }}
        onOk={() => void confirmComplete()}
        okText="Complete"
      >
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          <div>
            <Typography.Text type="secondary">KM</Typography.Text>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              value={completeKm}
              onChange={(v) => setCompleteKm(typeof v === "number" ? v : null)}
            />
          </div>
          <div>
            <Typography.Text type="secondary">Total Amount</Typography.Text>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              value={completeAmount}
              onChange={(v) => setCompleteAmount(typeof v === "number" ? v : null)}
            />
          </div>
          <div>
            <Typography.Text type="secondary">Rate / KM</Typography.Text>
            <div>
              {completeKm !== null && completeAmount !== null && completeKm > 0
                ? (completeAmount / completeKm).toFixed(4)
                : "-"}
            </div>
          </div>
        </Space>
      </Modal>
    </>
  );
}
