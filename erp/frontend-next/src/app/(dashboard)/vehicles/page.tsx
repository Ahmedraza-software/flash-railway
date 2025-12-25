"use client";

import {
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Image,
  Input,
  List,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import type { Vehicle, VehicleCreate, VehicleUpdate } from "@/lib/types";

type TableFilters = {
  search?: string;
  status?: string;
  vehicle_type?: string;
  category?: string;
  compliance?: string;
  year?: number;
};

type FormValues = VehicleCreate;

type VehicleDocument = {
  id: number;
  vehicle_id: string;
  name: string;
  filename: string;
  url: string;
  mime_type: string;
  created_at: string;
  updated_at?: string | null;
};

type VehicleImage = {
  id: number;
  vehicle_id: string;
  filename: string;
  url: string;
  mime_type: string;
  created_at: string;
  updated_at?: string | null;
};

type PendingDoc = { name: string; file: File };

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

export default function VehiclesPage() {
  const [msg, msgCtx] = message.useMessage();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Vehicle[]>([]);

  const [filters, setFilters] = useState<TableFilters>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "view">("create");
  const [active, setActive] = useState<Vehicle | null>(null);
  const [form] = Form.useForm<FormValues>();

  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<VehicleDocument[]>([]);

  const [imagesLoading, setImagesLoading] = useState(false);
  const [images, setImages] = useState<VehicleImage[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);

  const [addDocOpen, setAddDocOpen] = useState(false);
  const [addDocName, setAddDocName] = useState("");
  const [addDocFile, setAddDocFile] = useState<File | null>(null);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Vehicle[]>("/api/vehicles/", { query: { limit: 500 } });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load vehicles"));
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setDrawerMode("create");
    setActive(null);
    form.resetFields();
    setDocs([]);
    setImages([]);
    setPendingImages([]);
    setPendingDocs([]);
    setAddDocOpen(false);
    setAddDocName("");
    setAddDocFile(null);
    form.setFieldsValue({
      vehicle_id: "",
      vehicle_type: "",
      category: "",
      make_model: "",
      license_plate: "",
      chassis_number: null,
      asset_tag: null,
      year: new Date().getFullYear(),
      status: "Active",
      compliance: "Compliant",
      government_permit: "",
    });
    setDrawerOpen(true);
  }, [form]);

  const loadDocs = useCallback(
    async (vehicleId: string) => {
      setDocsLoading(true);
      try {
        const list = await api.get<VehicleDocument[]>(`/api/vehicles/${encodeURIComponent(vehicleId)}/documents`);
        setDocs(Array.isArray(list) ? list : []);
      } catch {
        setDocs([]);
      } finally {
        setDocsLoading(false);
      }
    },
    []
  );

  const loadImages = useCallback(async (vehicleId: string) => {
    setImagesLoading(true);
    try {
      const list = await api.get<VehicleImage[]>(`/api/vehicles/${encodeURIComponent(vehicleId)}/images`);
      setImages(Array.isArray(list) ? list : []);
    } catch {
      setImages([]);
    } finally {
      setImagesLoading(false);
    }
  }, []);

  const openEdit = useCallback(
    (v: Vehicle) => {
      setDrawerMode("edit");
      setActive(v);
      form.resetFields();
      setPendingImages([]);
      setPendingDocs([]);
      setAddDocOpen(false);
      setAddDocName("");
      setAddDocFile(null);
      form.setFieldsValue({
        vehicle_id: v.vehicle_id,
        vehicle_type: v.vehicle_type,
        category: v.category,
        make_model: v.make_model,
        license_plate: v.license_plate,
        chassis_number: v.chassis_number ?? null,
        asset_tag: v.asset_tag ?? null,
        year: v.year,
        status: v.status,
        compliance: v.compliance,
        government_permit: v.government_permit,
      });
      void loadDocs(v.vehicle_id);
      void loadImages(v.vehicle_id);
      setDrawerOpen(true);
    },
    [form, loadDocs, loadImages]
  );

  const openView = useCallback(
    (v: Vehicle) => {
      setDrawerMode("view");
      setActive(v);
      form.resetFields();
      setPendingImages([]);
      setPendingDocs([]);
      setAddDocOpen(false);
      setAddDocName("");
      setAddDocFile(null);
      form.setFieldsValue({
        vehicle_id: v.vehicle_id,
        vehicle_type: v.vehicle_type,
        category: v.category,
        make_model: v.make_model,
        license_plate: v.license_plate,
        chassis_number: v.chassis_number ?? null,
        asset_tag: v.asset_tag ?? null,
        year: v.year,
        status: v.status,
        compliance: v.compliance,
        government_permit: v.government_permit,
      });
      void loadDocs(v.vehicle_id);
      void loadImages(v.vehicle_id);
      setDrawerOpen(true);
    },
    [form, loadDocs, loadImages]
  );

  const uploadDoc = useCallback(async (vehicleId: string, name: string, file: File) => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("file", file);

    const res = await fetch(
      `${API_BASE_URL}/api/vehicles/${encodeURIComponent(vehicleId)}/documents`,
      {
        method: "POST",
        body: fd,
      }
    );

    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      let m = "Upload failed";
      if (data && typeof data === "object" && "detail" in data) m = String((data as { detail?: unknown }).detail);
      throw new Error(m);
    }
  }, []);

  const uploadImage = useCallback(async (vehicleId: string, file: File) => {
    const fd = new FormData();
    fd.set("file", file);

    const res = await fetch(`${API_BASE_URL}/api/vehicles/${encodeURIComponent(vehicleId)}/images`, {
      method: "POST",
      body: fd,
    });

    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      let m = "Image upload failed";
      if (data && typeof data === "object" && "detail" in data) m = String((data as { detail?: unknown }).detail);
      throw new Error(m);
    }
  }, []);

  const deleteDoc = useCallback(
    async (vehicleId: string, docId: number) => {
      await api.del<{ message: string }>(
        `/api/vehicles/${encodeURIComponent(vehicleId)}/documents/${docId}`
      );
      await loadDocs(vehicleId);
    },
    [loadDocs]
  );

  const deleteImage = useCallback(
    async (vehicleId: string, imageId: number) => {
      await api.del<{ message: string }>(
        `/api/vehicles/${encodeURIComponent(vehicleId)}/images/${imageId}`
      );
      await loadImages(vehicleId);
    },
    [loadImages]
  );

  const addPendingDoc = useCallback(() => {
    const name = addDocName.trim();
    if (!name) {
      msg.error("Document name is required");
      return;
    }
    if (!addDocFile) {
      msg.error("Please choose a PDF or image");
      return;
    }

    setPendingDocs((p) => [...p, { name, file: addDocFile }]);
    setAddDocName("");
    setAddDocFile(null);
    setAddDocOpen(false);
  }, [addDocFile, addDocName, msg]);

  const onSubmit = useCallback(async () => {
    const values = await form.validateFields();

    try {
      if (drawerMode === "create") {
        await api.post<Vehicle>("/api/vehicles/", values);
        for (const img of pendingImages) {
          await uploadImage(values.vehicle_id, img);
        }
        for (const d of pendingDocs) {
          await uploadDoc(values.vehicle_id, d.name, d.file);
        }
        msg.success("Vehicle created");
      } else {
        if (!active) return;
        const patch: VehicleUpdate = {
          vehicle_type: values.vehicle_type,
          category: values.category,
          make_model: values.make_model,
          license_plate: values.license_plate,
          chassis_number: values.chassis_number,
          asset_tag: values.asset_tag,
          year: values.year,
          status: values.status,
          compliance: values.compliance,
          government_permit: values.government_permit,
        };
        await api.put<Vehicle>(`/api/vehicles/${encodeURIComponent(active.vehicle_id)}`, patch);
        for (const img of pendingImages) {
          await uploadImage(active.vehicle_id, img);
        }
        for (const d of pendingDocs) {
          await uploadDoc(active.vehicle_id, d.name, d.file);
        }
        msg.success("Vehicle updated");
      }
      setDrawerOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [active, drawerMode, form, load, msg, pendingDocs, pendingImages, uploadDoc, uploadImage]);

  const onDelete = useCallback(
    async (v: Vehicle) => {
      try {
        await api.del<{ message: string }>(`/api/vehicles/${encodeURIComponent(v.vehicle_id)}`);
        msg.success("Vehicle deleted");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Delete failed"));
      }
    },
    [load, msg]
  );

  const filteredRows = useMemo(() => {
    const q = (filters.search ?? "").trim().toLowerCase();
    const st = (filters.status ?? "").trim().toLowerCase();
    const vt = (filters.vehicle_type ?? "").trim().toLowerCase();
    const cat = (filters.category ?? "").trim().toLowerCase();
    const comp = (filters.compliance ?? "").trim().toLowerCase();
    const yr = filters.year;

    return rows.filter((r) => {
      if (st && String(r.status ?? "").toLowerCase() !== st) return false;
      if (vt && String(r.vehicle_type ?? "").toLowerCase() !== vt) return false;
      if (cat && String(r.category ?? "").toLowerCase() !== cat) return false;
      if (comp && String(r.compliance ?? "").toLowerCase() !== comp) return false;
      if (typeof yr === "number" && Number.isFinite(yr) && Number(r.year ?? 0) !== yr) return false;
      if (!q) return true;
      const hay = `${r.vehicle_id} ${r.license_plate} ${r.make_model} ${r.vehicle_type} ${r.category} ${r.asset_tag ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filters.category, filters.compliance, filters.search, filters.status, filters.vehicle_type, filters.year, rows]);

  const vehicleTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = String(r.vehicle_type ?? "").trim();
      if (v) set.add(v);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ label: v, value: v.toLowerCase() }));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = String(r.category ?? "").trim();
      if (v) set.add(v);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ label: v, value: v.toLowerCase() }));
  }, [rows]);

  const complianceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = String(r.compliance ?? "").trim();
      if (v) set.add(v);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ label: v, value: v.toLowerCase() }));
  }, [rows]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      const y = Number(r.year);
      if (Number.isFinite(y) && y > 0) set.add(y);
    }
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ label: String(y), value: y }));
  }, [rows]);

  const columns = useMemo<ColumnsType<Vehicle>>(
    () => [
      {
        title: "ID",
        dataIndex: "vehicle_id",
        width: 110,
        render: (v) => <Tag color="blue">{String(v)}</Tag>,
      },
      { title: "Plate", dataIndex: "license_plate", width: 120, ellipsis: true },
      { title: "Model", dataIndex: "make_model", ellipsis: true },
      { title: "Type", dataIndex: "vehicle_type", width: 120, ellipsis: true },
      { title: "Cat", dataIndex: "category", width: 90, ellipsis: true },
      { title: "Year", dataIndex: "year", width: 80 },
      {
        title: "Status",
        dataIndex: "status",
        width: 100,
        render: (v) => {
          const s = String(v ?? "");
          const color = s.toLowerCase() === "active" ? "green" : "default";
          return <Tag color={color}>{s}</Tag>;
        },
      },
      {
        title: "Comp",
        dataIndex: "compliance",
        width: 120,
        ellipsis: true,
        render: (v) => {
          const s = String(v ?? "");
          const color = s.toLowerCase().includes("non") ? "red" : "green";
          return <Tag color={color}>{s}</Tag>;
        },
      },
      {
        key: "actions",
        title: "",
        width: 118,
        fixed: "right",
        render: (_, r) => (
          <Space size={4}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
            <Button size="small" icon={<EditOutlined />} style={{ color: "#183c70" }} onClick={() => openEdit(r)} />
            <Popconfirm title="Delete this vehicle?" onConfirm={() => void onDelete(r)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [onDelete, openEdit, openView]
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
                  Vehicles
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
                    style={{ width: 110 }}
                    value={filters.status}
                    onChange={(v) => setFilters((p) => ({ ...p, status: v ?? undefined }))}
                    options={[
                      { label: "Active", value: "active" },
                      { label: "Inactive", value: "inactive" },
                    ]}
                  />
                  <Select
                    size="small"
                    allowClear
                    placeholder="Type"
                    style={{ width: 120 }}
                    value={filters.vehicle_type}
                    onChange={(v) => setFilters((p) => ({ ...p, vehicle_type: v ?? undefined }))}
                    options={vehicleTypeOptions}
                  />
                  <Select
                    size="small"
                    allowClear
                    placeholder="Category"
                    style={{ width: 120 }}
                    value={filters.category}
                    onChange={(v) => setFilters((p) => ({ ...p, category: v ?? undefined }))}
                    options={categoryOptions}
                  />
                  <Select
                    size="small"
                    allowClear
                    placeholder="Compliance"
                    style={{ width: 135 }}
                    value={filters.compliance}
                    onChange={(v) => setFilters((p) => ({ ...p, compliance: v ?? undefined }))}
                    options={complianceOptions}
                  />
                  <Select
                    size="small"
                    allowClear
                    placeholder="Year"
                    style={{ width: 90 }}
                    value={filters.year}
                    onChange={(v) => setFilters((p) => ({ ...p, year: v ?? undefined }))}
                    options={yearOptions}
                  />
                  <Button
                    size="small"
                    icon={<CloseCircleOutlined />}
                    onClick={() => setFilters({})}
                  >
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
            scroll={{ x: 980 }}
          />
        </Space>
      </Card>

      <Drawer
        title={
          drawerMode === "create"
            ? "New Vehicle"
            : drawerMode === "edit"
              ? `Edit Vehicle: ${active?.vehicle_id ?? ""}`
              : `View Vehicle: ${active?.vehicle_id ?? ""}`
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
        <Form form={form} layout="vertical" disabled={drawerMode === "view"}>
          <Row gutter={[12, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="vehicle_id" label="Vehicle ID" rules={[{ required: true }]}>
                <Input disabled={drawerMode === "edit"} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="license_plate" label="License Plate" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="chassis_number" label="Chassis Number">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="make_model" label="Make / Model" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="asset_tag" label="Asset Tag">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="vehicle_type" label="Vehicle Type" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="year" label="Year" rules={[{ required: true }]}>
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "Active", value: "Active" },
                    { label: "Inactive", value: "Inactive" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="compliance" label="Compliance" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "Compliant", value: "Compliant" },
                    { label: "Non-Compliant", value: "Non-Compliant" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="government_permit" label="Government Permit" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <div style={{ marginTop: 8 }}>
          <Typography.Title level={5} style={{ margin: "8px 0" }}>
            Images
          </Typography.Title>

          {drawerMode !== "view" ? (
            <div style={{ marginBottom: 8 }}>
              <Upload
                accept="image/*"
                multiple
                beforeUpload={(f) => {
                  setPendingImages((p) => [...p, f as File]);
                  return false;
                }}
                onRemove={(f) => {
                  setPendingImages((p) => p.filter((x) => x.name !== f.name));
                  return true;
                }}
                fileList={pendingImages.map((f) => ({ uid: f.name, name: f.name, status: "done" }))}
              >
                <Button size="small" icon={<FileOutlined />}>
                  Add Images
                </Button>
              </Upload>
              <Typography.Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                Images will be uploaded when you click Save.
              </Typography.Text>
            </div>
          ) : null}

          <Card size="small" variant="outlined" style={{ borderRadius: 0, marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
            {imagesLoading ? (
              <Typography.Text type="secondary">Loading...</Typography.Text>
            ) : images.length === 0 ? (
              <Typography.Text type="secondary">No images</Typography.Text>
            ) : (
              <Space size={8} wrap>
                {images.map((img) => (
                  <div key={img.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <a href={`${API_BASE_URL}${img.url}`} target="_blank" rel="noreferrer">
                      <Image
                        src={`${API_BASE_URL}${img.url}`}
                        alt={img.filename}
                        width={110}
                        height={80}
                        style={{ objectFit: "cover", borderRadius: 10 }}
                        preview={false}
                      />
                    </a>
                    {drawerMode === "edit" && active ? (
                      <Popconfirm
                        title="Delete this image?"
                        onConfirm={() => void deleteImage(active.vehicle_id, img.id)}
                      >
                        <Button size="small" danger>
                          Delete
                        </Button>
                      </Popconfirm>
                    ) : null}
                  </div>
                ))}
              </Space>
            )}
          </Card>

          <Typography.Title level={5} style={{ margin: "8px 0" }}>
            Documents
          </Typography.Title>

          {drawerMode !== "view" ? (
            <div style={{ marginBottom: 8 }}>
              {!addDocOpen ? (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setAddDocOpen(true)}>
                  Add Doc
                </Button>
              ) : (
                <Space size={6} wrap>
                  <Input
                    size="small"
                    placeholder="Document name"
                    style={{ width: 220 }}
                    value={addDocName}
                    onChange={(e) => setAddDocName(e.target.value)}
                  />
                  <Upload
                    accept="image/*,application/pdf"
                    maxCount={1}
                    beforeUpload={(f) => {
                      setAddDocFile(f as File);
                      return false;
                    }}
                    onRemove={() => {
                      setAddDocFile(null);
                      return true;
                    }}
                    fileList={
                      addDocFile
                        ? [
                            {
                              uid: "doc",
                              name: addDocFile.name,
                              status: "done",
                            },
                          ]
                        : []
                    }
                  >
                    <Button size="small" icon={<FileOutlined />}>Choose file</Button>
                  </Upload>
                  <Button size="small" type="primary" onClick={addPendingDoc}>
                    Add
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setAddDocOpen(false);
                      setAddDocName("");
                      setAddDocFile(null);
                    }}
                  >
                    Cancel
                  </Button>
                </Space>
              )}
            </div>
          ) : null}

          {pendingDocs.length > 0 ? (
            <Card size="small" variant="outlined" style={{ borderRadius: 0, marginBottom: 8 }} styles={{ body: { padding: 12 } }}>
              <Typography.Text type="secondary">Pending uploads</Typography.Text>
              <List
                size="small"
                dataSource={pendingDocs}
                renderItem={(d, idx) => (
                  <List.Item
                    actions={
                      drawerMode !== "view"
                        ? [
                            <Button
                              key="remove"
                              size="small"
                              danger
                              onClick={() => setPendingDocs((p) => p.filter((_, i) => i !== idx))}
                            >
                              Remove
                            </Button>,
                          ]
                        : []
                    }
                  >
                    <List.Item.Meta title={d.name} description={d.file.name} />
                  </List.Item>
                )}
              />
            </Card>
          ) : null}

          <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
            <List
              size="small"
              loading={docsLoading}
              dataSource={docs}
              locale={{ emptyText: "No documents" }}
              renderItem={(d) => (
                <List.Item
                  actions={[
                    <a
                      key="open"
                      href={`${API_BASE_URL}${d.url}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>,
                    ...(drawerMode === "edit" && active
                      ? [
                          <Popconfirm
                            key="del"
                            title="Delete this document?"
                            onConfirm={() => void deleteDoc(active.vehicle_id, d.id)}
                          >
                            <Button size="small" danger>
                              Delete
                            </Button>
                          </Popconfirm>,
                        ]
                      : []),
                  ]}
                >
                  <List.Item.Meta title={d.name} description={d.filename} />
                </List.Item>
              )}
            />
          </Card>
        </div>
      </Drawer>
    </>
  );
}
