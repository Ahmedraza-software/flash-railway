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
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import type {
  Employee,
  Vehicle,
  VehicleMaintenance,
  VehicleMaintenanceCreate,
  VehicleMaintenanceUpdate,
} from "@/lib/types";

type FormValues = Omit<VehicleMaintenanceCreate, "maintenance_date"> & {
  maintenance_date?: dayjs.Dayjs | null;
};

type TableFilters = {
  search?: string;
  vehicle_id?: string;
  employee_id?: string;
  vendor?: string;
  date?: dayjs.Dayjs | null;
  month?: dayjs.Dayjs | null;
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

export default function VehicleMaintenancePage() {
  const [msg, msgCtx] = message.useMessage();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<VehicleMaintenance[]>([]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [filters, setFilters] = useState<TableFilters>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "view">("create");
  const [active, setActive] = useState<VehicleMaintenance | null>(null);
  const [form] = Form.useForm<FormValues>();

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
      const data = await api.get<VehicleMaintenance[]>("/api/vehicle-maintenance/", {
        query: {
          vehicle_id: filters.vehicle_id,
          employee_id: filters.employee_id,
        },
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load maintenance records"));
    } finally {
      setLoading(false);
    }
  }, [filters.employee_id, filters.vehicle_id, msg]);

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
      employee_id: null,
      description: null,
      maintenance_date: dayjs(),
      cost: null,
      odometer_km: null,
      service_vendor: null,
    });
    setDrawerOpen(true);
  }, [form]);

  const openEdit = useCallback(
    (r: VehicleMaintenance) => {
      setDrawerMode("edit");
      setActive(r);
      form.resetFields();
      form.setFieldsValue({
        vehicle_id: r.vehicle_id,
        employee_id: r.employee_id ?? null,
        description: r.description ?? null,
        maintenance_date: r.maintenance_date ? dayjs(r.maintenance_date) : null,
        cost: r.cost ?? null,
        odometer_km: r.odometer_km ?? null,
        service_vendor: r.service_vendor ?? null,
      });
      setDrawerOpen(true);
    },
    [form]
  );

  const openView = useCallback(
    (r: VehicleMaintenance) => {
      setDrawerMode("view");
      setActive(r);
      form.resetFields();
      form.setFieldsValue({
        vehicle_id: r.vehicle_id,
        employee_id: r.employee_id ?? null,
        description: r.description ?? null,
        maintenance_date: r.maintenance_date ? dayjs(r.maintenance_date) : null,
        cost: r.cost ?? null,
        odometer_km: r.odometer_km ?? null,
        service_vendor: r.service_vendor ?? null,
      });
      setDrawerOpen(true);
    },
    [form]
  );

  const onSubmit = useCallback(async () => {
    const values = await form.validateFields();
    try {
      const payload: VehicleMaintenanceCreate = {
        vehicle_id: values.vehicle_id,
        employee_id: values.employee_id ?? null,
        description: values.description ?? null,
        maintenance_date: values.maintenance_date ? values.maintenance_date.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        cost: values.cost ?? null,
        odometer_km: values.odometer_km ?? null,
        service_vendor: values.service_vendor ?? null,
      };

      if (drawerMode === "create") {
        await api.post<VehicleMaintenance>("/api/vehicle-maintenance/", payload);
        msg.success("Maintenance record created");
      } else {
        if (!active) return;
        const patch: VehicleMaintenanceUpdate = payload;
        await api.put<VehicleMaintenance>(`/api/vehicle-maintenance/${active.id}`, patch);
        msg.success("Maintenance record updated");
      }

      setDrawerOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [active, drawerMode, form, load, msg]);

  const onDelete = useCallback(
    async (r: VehicleMaintenance) => {
      try {
        await api.del<{ message: string }>(`/api/vehicle-maintenance/${r.id}`);
        msg.success("Maintenance record deleted");
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

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = String(r.service_vendor ?? "").trim();
      if (v) set.add(v);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ label: v, value: v }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = (filters.search ?? "").trim().toLowerCase();
    const veh = (filters.vehicle_id ?? "").trim();
    const emp = (filters.employee_id ?? "").trim();
    const vend = (filters.vendor ?? "").trim().toLowerCase();
    const date = filters.date ? filters.date.format("YYYY-MM-DD") : "";
    const month = filters.month ? filters.month.format("YYYY-MM") : "";

    return rows.filter((r) => {
      if (veh && String(r.vehicle_id ?? "") !== veh) return false;
      if (emp && String(r.employee_id ?? "") !== emp) return false;
      if (vend && String(r.service_vendor ?? "").toLowerCase() !== vend) return false;

      const d = r.maintenance_date ? String(r.maintenance_date) : "";
      if (date && d !== date) return false;
      if (month && (!d || !d.startsWith(month))) return false;

      if (!q) return true;
      const hay = `${r.vehicle_id ?? ""} ${r.employee_id ?? ""} ${r.description ?? ""} ${r.service_vendor ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filters.date, filters.employee_id, filters.month, filters.search, filters.vehicle_id, filters.vendor, rows]);

  const exportCsv = useCallback(() => {
    const header = [
      "id",
      "vehicle_id",
      "maintenance_date",
      "employee_id",
      "service_vendor",
      "odometer_km",
      "cost",
      "description",
      "created_at",
      "updated_at",
    ];

    const esc = (v: unknown) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [header.join(",")];
    for (const r of filteredRows) {
      lines.push(
        [
          r.id,
          r.vehicle_id,
          r.maintenance_date,
          r.employee_id ?? "",
          r.service_vendor ?? "",
          r.odometer_km ?? "",
          r.cost ?? "",
          r.description ?? "",
          r.created_at,
          r.updated_at ?? "",
        ]
          .map(esc)
          .join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const suffix = filters.month
      ? filters.month.format("YYYY-MM")
      : filters.date
        ? filters.date.format("YYYY-MM-DD")
        : dayjs().format("YYYY-MM-DD");
    a.href = url;
    a.download = `vehicle_maintenance_${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [filteredRows, filters.date, filters.month]);

  const downloadReceiptPdf = useCallback((r: VehicleMaintenance) => {
    const a = document.createElement("a");
    a.href = `${API_BASE_URL}/api/vehicle-maintenance/${r.id}/receipt`;
    a.download = `maintenance_receipt_${r.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const exportPdf = useCallback(() => {
    const qs = new URLSearchParams();
    if (filters.vehicle_id) qs.set("vehicle_id", filters.vehicle_id);
    if (filters.employee_id) qs.set("employee_id", filters.employee_id);
    if (filters.vendor) qs.set("vendor", filters.vendor);
    if (filters.date) qs.set("date", filters.date.format("YYYY-MM-DD"));
    if (filters.month) qs.set("month", filters.month.format("YYYY-MM"));

    const a = document.createElement("a");
    a.href = `${API_BASE_URL}/api/vehicle-maintenance/export/pdf?${qs.toString()}`;
    a.download = "vehicle_maintenance_report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [filters.date, filters.employee_id, filters.month, filters.vehicle_id, filters.vendor]);

  const columns = useMemo<ColumnsType<VehicleMaintenance>>(
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
        width: 160,
        render: (v) => <Tag>{String(v)}</Tag>,
      },
      {
        title: "Date",
        dataIndex: "maintenance_date",
        width: 120,
        render: (v) => (v ? dayjs(String(v)).format("YYYY-MM-DD") : "-"),
      },
      {
        title: "Employee",
        dataIndex: "employee_id",
        width: 130,
        render: (v) => (v ? <Tag color="geekblue">{String(v)}</Tag> : <Typography.Text type="secondary">-</Typography.Text>),
      },
      {
        title: "Vendor",
        dataIndex: "service_vendor",
        width: 160,
        ellipsis: true,
        render: (v) => (v ? String(v) : <Typography.Text type="secondary">-</Typography.Text>),
      },
      {
        title: "Odo (km)",
        dataIndex: "odometer_km",
        width: 110,
        render: (v) => (typeof v === "number" ? String(v) : <Typography.Text type="secondary">-</Typography.Text>),
      },
      {
        title: "Cost",
        dataIndex: "cost",
        width: 110,
        render: (v) =>
          typeof v === "number" ? (
            <span>Rs {v.toFixed(2)}</span>
          ) : (
            <Typography.Text type="secondary">-</Typography.Text>
          ),
      },
      {
        title: "Description",
        dataIndex: "description",
        ellipsis: true,
        render: (v) => (v ? String(v) : <Typography.Text type="secondary">-</Typography.Text>),
      },
      {
        key: "actions",
        title: "",
        width: 160,
        fixed: "right",
        render: (_, r) => (
          <Space size={4}>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadReceiptPdf(r)} />
            <Button size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
            <Button size="small" icon={<EditOutlined />} style={{ color: "#183c70" }} onClick={() => openEdit(r)} />
            <Popconfirm title="Delete this record?" onConfirm={() => void onDelete(r)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [downloadReceiptPdf, onDelete, openEdit, openView]
  );

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Space size={8} wrap>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Vehicle Maintenance
                </Typography.Title>
                <Badge count={filteredRows.length} showZero color="#1677ff" style={{ boxShadow: "none" }} />
              </Space>
            </Col>
            <Col>
              <Space size={6} wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button icon={<DownloadOutlined />} onClick={exportPdf}>
                  Export PDF
                </Button>
                <Button icon={<DownloadOutlined />} onClick={exportCsv}>
                  Export CSV
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
                  <DatePicker
                    size="small"
                    allowClear
                    placeholder="Date"
                    value={filters.date ?? null}
                    onChange={(v) => setFilters((p) => ({ ...p, date: v, month: p.month }))}
                  />
                  <DatePicker
                    size="small"
                    picker="month"
                    allowClear
                    placeholder="Month"
                    value={filters.month ?? null}
                    onChange={(v) => setFilters((p) => ({ ...p, month: v, date: p.date }))}
                  />
                  <Select
                    size="small"
                    allowClear
                    placeholder="Vehicle"
                    style={{ width: 180 }}
                    showSearch
                    optionFilterProp="label"
                    value={filters.vehicle_id}
                    onChange={(v) => setFilters((p) => ({ ...p, vehicle_id: v ?? undefined }))}
                    options={vehicleOptions}
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
                  <Select
                    size="small"
                    allowClear
                    placeholder="Vendor"
                    style={{ width: 180 }}
                    showSearch
                    optionFilterProp="label"
                    value={filters.vendor}
                    onChange={(v) => setFilters((p) => ({ ...p, vendor: v ?? undefined }))}
                    options={vendorOptions}
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
            scroll={{ x: 1100 }}
          />
        </Space>
      </Card>

      <Drawer
        title={
          drawerMode === "create"
            ? "New Maintenance"
            : drawerMode === "edit"
              ? `Edit Maintenance #${active?.id ?? ""}`
              : `View Maintenance #${active?.id ?? ""}`
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
                { key: "vehicle", label: "Vehicle", children: <Tag>{active.vehicle_id}</Tag> },
                {
                  key: "date",
                  label: "Maintenance Date",
                  children: active.maintenance_date ? dayjs(active.maintenance_date).format("YYYY-MM-DD") : "-",
                },
                {
                  key: "employee",
                  label: "Employee",
                  children: active.employee_id ? <Tag color="geekblue">{active.employee_id}</Tag> : "-",
                },
                { key: "vendor", label: "Vendor", children: active.service_vendor ?? "-" },
                { key: "odo", label: "Odometer (km)", children: active.odometer_km ?? "-" },
                { key: "cost", label: "Cost", children: typeof active.cost === "number" ? active.cost.toFixed(2) : "-" },
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
                  options={vehicleOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="maintenance_date" label="Maintenance Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="employee_id" label="Employee">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Optional"
                  options={employeeOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="service_vendor" label="Service Vendor">
                <Input placeholder="Optional" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="odometer_km" label="Odometer (km)">
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="cost" label="Cost">
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} placeholder="Optional" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>
    </>
  );
}
