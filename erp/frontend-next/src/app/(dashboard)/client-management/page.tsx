"use client";

import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
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
  Tabs,
  Tag,
  Typography,
  Descriptions,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  DownloadOutlined,
  UserOutlined,
  FileTextOutlined,
  TeamOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";

// Types
type Client = {
  id: number;
  client_code: string;
  client_name: string;
  client_type: string;
  industry_type?: string | null;
  status: string;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  created_at: string;
};

type FocalPerson = {
  id: number;
  client_id: number;
  name: string;
  designation?: string | null;
  phone_number?: string | null;
  email?: string | null;
  is_primary: boolean;
  reports_to_id?: number | null;
};

type Contract = {
  id: number;
  client_id: number;
  contract_number: string;
  start_date?: string | null;
  end_date?: string | null;
  contract_type?: string | null;
  monthly_cost: number;
  status: string;
  notes?: string | null;
  created_at: string;
};

type GuardAllocation = {
  id: number;
  contract_id: number;
  employee_db_id: number;
  employee_name?: string;
  employee_id?: string;
  start_date?: string | null;
  end_date?: string | null;
  status: string;
};

type ClientDetail = Client & {
  contacts: FocalPerson[];
  contracts: Contract[];
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function formatMoney(v: number): string {
  return `Rs ${v.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

export default function ClientManagementPage() {
  const [msg, msgCtx] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  
  // Client drawer
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [clientDrawerMode, setClientDrawerMode] = useState<"create" | "edit">("create");
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [clientForm] = Form.useForm();
  
  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  
  // Focal person drawer
  const [focalDrawerOpen, setFocalDrawerOpen] = useState(false);
  const [focalDrawerMode, setFocalDrawerMode] = useState<"create" | "edit">("create");
  const [activeFocal, setActiveFocal] = useState<FocalPerson | null>(null);
  const [focalForm] = Form.useForm();
  
  // Contract drawer
  const [contractDrawerOpen, setContractDrawerOpen] = useState(false);
  const [contractDrawerMode, setContractDrawerMode] = useState<"create" | "edit">("create");
  const [activeContract, setActiveContract] = useState<Contract | null>(null);
  const [contractForm] = Form.useForm();
  const [requiredGuards, setRequiredGuards] = useState(0);
  const [selectedGuards, setSelectedGuards] = useState<number[]>([]);
  const [allGuards, setAllGuards] = useState<any[]>([]);
  const [guardSearch, setGuardSearch] = useState("");
  
  // Guard allocation
  const [allocDrawerOpen, setAllocDrawerOpen] = useState(false);
  const [allocations, setAllocations] = useState<GuardAllocation[]>([]);
  const [allocLoading, setAllocLoading] = useState(false);
  const [availableGuards, setAvailableGuards] = useState<any[]>([]);

  // Load clients
  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Client[]>("/api/client-management/clients");
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      msg.error(errorMessage(e, "Failed to load clients"));
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  // Open client detail
  const openClientDetail = useCallback(async (clientId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const d = await api.get<ClientDetail>(`/api/client-management/clients/${clientId}`);
      setDetail(d);
    } catch (e) {
      msg.error(errorMessage(e, "Failed to load client"));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [msg]);

  // Create client
  const openCreateClient = useCallback(() => {
    setClientDrawerMode("create");
    setActiveClient(null);
    clientForm.resetFields();
    clientForm.setFieldsValue({
      client_type: "Corporate",
      status: "Active",
    });
    setClientDrawerOpen(true);
  }, [clientForm]);

  // Edit client
  const openEditClient = useCallback((c: Client) => {
    setClientDrawerMode("edit");
    setActiveClient(c);
    clientForm.setFieldsValue({
      client_code: c.client_code,
      client_name: c.client_name,
      client_type: c.client_type,
      industry_type: c.industry_type,
      status: c.status,
      location: c.location,
      address: c.address,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
    });
    setClientDrawerOpen(true);
  }, [clientForm]);

  // Save client
  const saveClient = useCallback(async () => {
    const values = await clientForm.validateFields();
    try {
      if (clientDrawerMode === "create") {
        await api.post("/api/client-management/clients", values);
        msg.success("Client created");
      } else if (activeClient) {
        await api.put(`/api/client-management/clients/${activeClient.id}`, values);
        msg.success("Client updated");
      }
      setClientDrawerOpen(false);
      await loadClients();
    } catch (e) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [activeClient, clientDrawerMode, clientForm, loadClients, msg]);

  // Delete client
  const deleteClient = useCallback(async (c: Client) => {
    try {
      await api.del(`/api/client-management/clients/${c.id}`);
      msg.success("Client deleted");
      await loadClients();
    } catch (e) {
      msg.error(errorMessage(e, "Delete failed"));
    }
  }, [loadClients, msg]);

  // Focal person functions
  const openCreateFocal = useCallback(() => {
    setFocalDrawerMode("create");
    setActiveFocal(null);
    focalForm.resetFields();
    focalForm.setFieldsValue({ is_primary: false });
    setFocalDrawerOpen(true);
  }, [focalForm]);

  const openEditFocal = useCallback((f: FocalPerson) => {
    setFocalDrawerMode("edit");
    setActiveFocal(f);
    focalForm.setFieldsValue({
      name: f.name,
      designation: f.designation,
      phone_number: f.phone_number,
      email: f.email,
      is_primary: f.is_primary,
      reports_to_id: f.reports_to_id,
    });
    setFocalDrawerOpen(true);
  }, [focalForm]);

  const saveFocal = useCallback(async () => {
    if (!detail) return;
    const values = await focalForm.validateFields();
    try {
      if (focalDrawerMode === "create") {
        await api.post(`/api/client-management/clients/${detail.id}/contacts`, values);
        msg.success("Focal person added");
      } else if (activeFocal) {
        await api.put(`/api/client-management/clients/${detail.id}/contacts/${activeFocal.id}`, values);
        msg.success("Focal person updated");
      }
      setFocalDrawerOpen(false);
      await openClientDetail(detail.id);
    } catch (e) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [activeFocal, detail, focalDrawerMode, focalForm, msg, openClientDetail]);

  const deleteFocal = useCallback(async (f: FocalPerson) => {
    if (!detail) return;
    try {
      await api.del(`/api/client-management/clients/${detail.id}/contacts/${f.id}`);
      msg.success("Focal person deleted");
      await openClientDetail(detail.id);
    } catch (e) {
      msg.error(errorMessage(e, "Delete failed"));
    }
  }, [detail, msg, openClientDetail]);

  // Contract functions
  const loadAvailableGuards = useCallback(async () => {
    try {
      const response = await api.get<{ employees: any[]; total: number }>("/api/employees2/?limit=500");
      const guards = response?.employees || [];
      // Filter to show only free guards
      const freeGuards = guards.filter((g: any) => 
        !g.allocation_status || g.allocation_status === "Free"
      );
      setAllGuards(freeGuards);
    } catch (e) {
      console.error("Failed to load guards", e);
    }
  }, []);

  const openCreateContract = useCallback(async () => {
    setContractDrawerMode("create");
    setActiveContract(null);
    contractForm.resetFields();
    contractForm.setFieldsValue({
      status: "Active",
      monthly_cost: 0,
      required_guards: 1,
    });
    setRequiredGuards(1);
    setSelectedGuards([]);
    setGuardSearch("");
    await loadAvailableGuards();
    setContractDrawerOpen(true);
  }, [contractForm, loadAvailableGuards]);

  const openEditContract = useCallback((c: Contract) => {
    setContractDrawerMode("edit");
    setActiveContract(c);
    contractForm.setFieldsValue({
      contract_number: c.contract_number,
      contract_type: c.contract_type,
      start_date: c.start_date ? dayjs(c.start_date) : null,
      end_date: c.end_date ? dayjs(c.end_date) : null,
      monthly_cost: c.monthly_cost,
      status: c.status,
      notes: c.notes,
    });
    setContractDrawerOpen(true);
  }, [contractForm]);

  const saveContract = useCallback(async () => {
    if (!detail) return;
    const values = await contractForm.validateFields();
    const payload = {
      ...values,
      start_date: values.start_date?.format("YYYY-MM-DD") || null,
      end_date: values.end_date?.format("YYYY-MM-DD") || null,
      required_guards: requiredGuards,
    };
    delete payload.required_guards; // Remove from contract payload
    
    try {
      if (contractDrawerMode === "create") {
        // Create contract first
        const created = await api.post<{ id: number }>(`/api/client-management/clients/${detail.id}/contracts`, payload);
        
        // Allocate selected guards
        for (const guardId of selectedGuards) {
          await api.post(`/api/client-management/contracts/${created.id}/allocations`, {
            employee_db_id: guardId,
            start_date: dayjs().format("YYYY-MM-DD"),
            status: "Active",
          });
        }
        msg.success(`Contract created with ${selectedGuards.length} guards allocated`);
      } else if (activeContract) {
        await api.put(`/api/client-management/clients/${detail.id}/contracts/${activeContract.id}`, payload);
        msg.success("Contract updated");
      }
      setContractDrawerOpen(false);
      await openClientDetail(detail.id);
    } catch (e) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [activeContract, contractDrawerMode, contractForm, detail, msg, openClientDetail, requiredGuards, selectedGuards]);

  const deleteContract = useCallback(async (c: Contract) => {
    if (!detail) return;
    try {
      await api.del(`/api/client-management/clients/${detail.id}/contracts/${c.id}`);
      msg.success("Contract deleted");
      await openClientDetail(detail.id);
    } catch (e) {
      msg.error(errorMessage(e, "Delete failed"));
    }
  }, [detail, msg, openClientDetail]);

  const endContract = useCallback(async (c: Contract) => {
    if (!detail) return;
    try {
      await api.put(`/api/client-management/clients/${detail.id}/contracts/${c.id}`, {
        status: "Ended",
        end_date: dayjs().format("YYYY-MM-DD"),
      });
      msg.success("Contract ended - allocated guards are now free");
      await openClientDetail(detail.id);
    } catch (e) {
      msg.error(errorMessage(e, "Failed to end contract"));
    }
  }, [detail, msg, openClientDetail]);

  // Guard allocation functions
  const openAllocations = useCallback(async (c: Contract) => {
    setActiveContract(c);
    setAllocDrawerOpen(true);
    setAllocLoading(true);
    try {
      const [allocs, guards] = await Promise.all([
        api.get<GuardAllocation[]>(`/api/client-management/contracts/${c.id}/allocations`),
        api.get<any[]>("/api/employees2"),
      ]);
      setAllocations(Array.isArray(allocs) ? allocs : []);
      // Filter to show only available guards (not allocated)
      const allocatedIds = new Set((allocs || []).map((a: any) => a.employee_db_id));
      setAvailableGuards((guards || []).filter((g: any) => !allocatedIds.has(g.id)));
    } catch (e) {
      msg.error(errorMessage(e, "Failed to load allocations"));
    } finally {
      setAllocLoading(false);
    }
  }, [msg]);

  const allocateGuard = useCallback(async (employeeId: number) => {
    if (!activeContract) return;
    try {
      await api.post(`/api/client-management/contracts/${activeContract.id}/allocations`, {
        employee_db_id: employeeId,
        start_date: dayjs().format("YYYY-MM-DD"),
        status: "Active",
      });
      msg.success("Guard allocated");
      await openAllocations(activeContract);
    } catch (e) {
      msg.error(errorMessage(e, "Allocation failed"));
    }
  }, [activeContract, msg, openAllocations]);

  const removeAllocation = useCallback(async (allocId: number) => {
    if (!activeContract) return;
    try {
      await api.del(`/api/client-management/contracts/${activeContract.id}/allocations/${allocId}`);
      msg.success("Guard removed - now free");
      await openAllocations(activeContract);
    } catch (e) {
      msg.error(errorMessage(e, "Remove failed"));
    }
  }, [activeContract, msg, openAllocations]);

  // Download invoice/receipt
  const downloadInvoice = useCallback(async (contractId: number, contractNumber: string) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_BASE_URL}/api/client-management/contracts/${contractId}/invoice-pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to generate invoice");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${contractNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      msg.error(errorMessage(e, "Download failed"));
    }
  }, [msg]);

  const downloadReceipt = useCallback(async (contractId: number, contractNumber: string) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_BASE_URL}/api/client-management/contracts/${contractId}/receipt-pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to generate receipt");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt_${contractNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      msg.error(errorMessage(e, "Download failed"));
    }
  }, [msg]);

  // Table columns
  const clientColumns = useMemo<ColumnsType<Client>>(() => [
    {
      title: "Code",
      dataIndex: "client_code",
      width: 100,
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "Client Name",
      dataIndex: "client_name",
      render: (v, r) => (
        <Typography.Link onClick={() => void openClientDetail(r.id)}>{v}</Typography.Link>
      ),
    },
    { title: "Type", dataIndex: "client_type", width: 120 },
    { title: "Location", dataIndex: "location", width: 150 },
    {
      title: "Status",
      dataIndex: "status",
      width: 100,
      render: (v) => (
        <Tag color={v === "Active" ? "green" : v === "Inactive" ? "default" : "red"}>{v}</Tag>
      ),
    },
    {
      title: "Actions",
      width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditClient(r)} />
          <Popconfirm title="Delete client?" onConfirm={() => void deleteClient(r)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ], [deleteClient, openClientDetail, openEditClient]);

  const focalColumns = useMemo<ColumnsType<FocalPerson>>(() => [
    { title: "Name", dataIndex: "name" },
    { title: "Designation", dataIndex: "designation" },
    { title: "Phone", dataIndex: "phone_number" },
    { title: "Email", dataIndex: "email" },
    {
      title: "Primary",
      dataIndex: "is_primary",
      width: 80,
      render: (v) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>,
    },
    {
      title: "",
      width: 80,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditFocal(r)} />
          <Popconfirm title="Delete?" onConfirm={() => void deleteFocal(r)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ], [deleteFocal, openEditFocal]);

  const contractColumns = useMemo<ColumnsType<Contract>>(() => [
    { title: "Contract #", dataIndex: "contract_number", width: 120 },
    { title: "Type", dataIndex: "contract_type", width: 100 },
    { title: "Start", dataIndex: "start_date", width: 100 },
    { title: "End", dataIndex: "end_date", width: 100 },
    {
      title: "Monthly Cost",
      dataIndex: "monthly_cost",
      width: 120,
      render: (v) => <Typography.Text strong>{formatMoney(v || 0)}</Typography.Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 90,
      render: (v) => (
        <Tag color={v === "Active" ? "green" : v === "Ended" ? "red" : "default"}>{v}</Tag>
      ),
    },
    {
      title: "Actions",
      width: 220,
      render: (_, r) => (
        <Space size={4} wrap>
          <Button size="small" icon={<TeamOutlined />} onClick={() => void openAllocations(r)}>
            Guards
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditContract(r)} />
          {r.status === "Active" && (
            <Popconfirm title="End this contract?" onConfirm={() => void endContract(r)}>
              <Button size="small" danger>End</Button>
            </Popconfirm>
          )}
          <Popconfirm title="Delete this contract?" onConfirm={() => void deleteContract(r)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => void downloadInvoice(r.id, r.contract_number)}>
            Invoice
          </Button>
        </Space>
      ),
    },
  ], [deleteContract, downloadInvoice, endContract, openAllocations, openEditContract]);

  return (
    <>
      {msgCtx}
      
      {/* Main Client List */}
      <Card styles={{ body: { padding: 16 } }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Client Management
            </Typography.Title>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateClient}>
              New Client
            </Button>
          </Col>
        </Row>
        <Table<Client>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={clients}
          columns={clientColumns}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </Card>

      {/* Client Create/Edit Drawer */}
      <Drawer
        title={clientDrawerMode === "create" ? "New Client" : "Edit Client"}
        open={clientDrawerOpen}
        onClose={() => setClientDrawerOpen(false)}
        width={600}
        extra={
          <Space>
            <Button onClick={() => setClientDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => void saveClient()}>Save</Button>
          </Space>
        }
      >
        <Form form={clientForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="client_code" label="Client Code" rules={[{ required: true }]}>
                <Input placeholder="CL-001" disabled={clientDrawerMode === "edit"} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="client_type" label="Type" rules={[{ required: true }]}>
                <Select options={[
                  { label: "Corporate", value: "Corporate" },
                  { label: "Individual", value: "Individual" },
                  { label: "Government", value: "Government" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="client_name" label="Client Name" rules={[{ required: true }]}>
                <Input placeholder="ABC Company" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="industry_type" label="Industry">
                <Input placeholder="Commercial / Residential / Bank" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select options={[
                  { label: "Active", value: "Active" },
                  { label: "Inactive", value: "Inactive" },
                  { label: "Blacklisted", value: "Blacklisted" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="location" label="Location">
                <Input placeholder="City / Area" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="address" label="Full Address">
                <Input.TextArea rows={2} placeholder="Complete address" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input placeholder="+92-XXX-XXXXXXX" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input placeholder="email@company.com" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notes" label="Notes">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      {/* Client Detail Modal */}
      <Modal
        title={detail?.client_name || "Client Details"}
        open={detailOpen}
        onCancel={() => { setDetailOpen(false); setDetail(null); }}
        footer={null}
        width={1000}
      >
        {detailLoading ? (
          <Typography.Text type="secondary">Loading...</Typography.Text>
        ) : detail ? (
          <Tabs
            items={[
              {
                key: "info",
                label: <><EnvironmentOutlined /> Info</>,
                children: (
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="Code">{detail.client_code}</Descriptions.Item>
                    <Descriptions.Item label="Type">{detail.client_type}</Descriptions.Item>
                    <Descriptions.Item label="Industry">{detail.industry_type || "-"}</Descriptions.Item>
                    <Descriptions.Item label="Status">
                      <Tag color={detail.status === "Active" ? "green" : "default"}>{detail.status}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Location">{detail.location || "-"}</Descriptions.Item>
                    <Descriptions.Item label="Phone">{detail.phone || "-"}</Descriptions.Item>
                    <Descriptions.Item label="Email">{detail.email || "-"}</Descriptions.Item>
                    <Descriptions.Item label="Address" span={2}>{detail.address || "-"}</Descriptions.Item>
                    <Descriptions.Item label="Notes" span={2}>{detail.notes || "-"}</Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: "focal",
                label: <><UserOutlined /> Focal Persons ({detail.contacts?.length || 0})</>,
                children: (
                  <>
                    <div style={{ marginBottom: 12, textAlign: "right" }}>
                      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreateFocal}>
                        Add Focal Person
                      </Button>
                    </div>
                    <Table<FocalPerson>
                      rowKey="id"
                      size="small"
                      dataSource={detail.contacts || []}
                      columns={focalColumns}
                      pagination={false}
                    />
                  </>
                ),
              },
              {
                key: "contracts",
                label: <><FileTextOutlined /> Contracts ({detail.contracts?.length || 0})</>,
                children: (
                  <>
                    <div style={{ marginBottom: 12, textAlign: "right" }}>
                      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreateContract}>
                        New Contract
                      </Button>
                    </div>
                    <Table<Contract>
                      rowKey="id"
                      size="small"
                      dataSource={detail.contracts || []}
                      columns={contractColumns}
                      pagination={false}
                    />
                  </>
                ),
              },
            ]}
          />
        ) : null}
      </Modal>

      {/* Focal Person Drawer */}
      <Drawer
        title={focalDrawerMode === "create" ? "Add Focal Person" : "Edit Focal Person"}
        open={focalDrawerOpen}
        onClose={() => setFocalDrawerOpen(false)}
        width={450}
        extra={
          <Space>
            <Button onClick={() => setFocalDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => void saveFocal()}>Save</Button>
          </Space>
        }
      >
        <Form form={focalForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Full name" />
          </Form.Item>
          <Form.Item name="designation" label="Designation">
            <Input placeholder="Manager / Director / Supervisor" />
          </Form.Item>
          <Form.Item name="phone_number" label="Phone">
            <Input placeholder="+92-XXX-XXXXXXX" />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input placeholder="email@company.com" />
          </Form.Item>
          <Form.Item name="is_primary" label="Primary Contact" valuePropName="checked">
            <Select options={[
              { label: "Yes", value: true },
              { label: "No", value: false },
            ]} />
          </Form.Item>
          <Form.Item name="reports_to_id" label="Reports To">
            <Select
              allowClear
              placeholder="Select supervisor"
              options={(detail?.contacts || []).filter(c => c.id !== activeFocal?.id).map(c => ({
                label: `${c.name} (${c.designation || "N/A"})`,
                value: c.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Contract Drawer */}
      <Drawer
        title={contractDrawerMode === "create" ? "New Contract" : "Edit Contract"}
        open={contractDrawerOpen}
        onClose={() => setContractDrawerOpen(false)}
        width={500}
        extra={
          <Space>
            <Button onClick={() => setContractDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => void saveContract()}>Save</Button>
          </Space>
        }
      >
        <Form form={contractForm} layout="vertical">
          <Form.Item name="contract_number" label="Contract Number" rules={[{ required: true }]}>
            <Input placeholder="CON-001" />
          </Form.Item>
          <Form.Item name="contract_type" label="Contract Type">
            <Select options={[
              { label: "Security Services", value: "Security Services" },
              { label: "Guarding", value: "Guarding" },
              { label: "Event Security", value: "Event Security" },
              { label: "Other", value: "Other" },
            ]} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="start_date" label="Start Date">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="end_date" label="End Date (Expiry)">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="monthly_cost" label="Monthly Cost (Rs)" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={0} placeholder="50000" />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={[
              { label: "Active", value: "Active" },
              { label: "Pending", value: "Pending" },
              { label: "Ended", value: "Ended" },
              { label: "Expired", value: "Expired" },
            ]} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          
          {/* Guard Selection - Only show in create mode */}
          {contractDrawerMode === "create" && (
            <>
              <Divider>Guard Allocation</Divider>
              <Form.Item label="Required Guards">
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  max={50}
                  value={requiredGuards}
                  onChange={(v) => {
                    setRequiredGuards(v || 0);
                    // If reducing required guards, trim selected guards
                    if ((v || 0) < selectedGuards.length) {
                      setSelectedGuards(selectedGuards.slice(0, v || 0));
                    }
                  }}
                  placeholder="Number of guards needed"
                />
              </Form.Item>
              
              {requiredGuards > 0 && (
                <>
                  <Form.Item label={`Select Guards (${selectedGuards.length}/${requiredGuards})`}>
                    <Input
                      placeholder="Search guards by name..."
                      value={guardSearch}
                      onChange={(e) => setGuardSearch(e.target.value)}
                      allowClear
                      prefix={<TeamOutlined />}
                    />
                  </Form.Item>
                  
                  {/* Selected Guards */}
                  {selectedGuards.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Selected:</Typography.Text>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {selectedGuards.map((gId) => {
                          const g = allGuards.find((x) => x.id === gId);
                          return (
                            <Tag
                              key={gId}
                              closable
                              onClose={() => setSelectedGuards(selectedGuards.filter((x) => x !== gId))}
                              color="blue"
                            >
                              {g?.name || `ID: ${gId}`}
                            </Tag>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Available Guards List */}
                  <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #d9d9d9", borderRadius: 6, padding: 8 }}>
                    {allGuards
                      .filter((g) => {
                        // Filter by search
                        if (guardSearch) {
                          const search = guardSearch.toLowerCase();
                          return (
                            (g.name || "").toLowerCase().includes(search) ||
                            (g.serial_no || "").toLowerCase().includes(search) ||
                            (g.fss_no || "").toLowerCase().includes(search)
                          );
                        }
                        return true;
                      })
                      .filter((g) => !selectedGuards.includes(g.id)) // Exclude already selected
                      .slice(0, guardSearch ? 20 : 5) // Show 5 by default, 20 when searching
                      .map((g) => (
                        <div
                          key={g.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 8px",
                            borderBottom: "1px solid #f0f0f0",
                          }}
                        >
                          <div>
                            <Typography.Text strong>{g.name}</Typography.Text>
                            <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                              {g.serial_no || g.fss_no || ""}
                            </Typography.Text>
                          </div>
                          <Button
                            size="small"
                            type="primary"
                            disabled={selectedGuards.length >= requiredGuards}
                            onClick={() => {
                              if (selectedGuards.length < requiredGuards) {
                                setSelectedGuards([...selectedGuards, g.id]);
                              }
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      ))}
                    {allGuards.filter((g) => !selectedGuards.includes(g.id)).length === 0 && (
                      <Typography.Text type="secondary">No available guards</Typography.Text>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </Form>
      </Drawer>

      {/* Guard Allocation Drawer */}
      <Drawer
        title={`Guard Allocation - ${activeContract?.contract_number || ""}`}
        open={allocDrawerOpen}
        onClose={() => setAllocDrawerOpen(false)}
        width={700}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Card size="small" title="Allocated Guards">
            <Table
              rowKey="id"
              size="small"
              loading={allocLoading}
              dataSource={allocations}
              pagination={false}
              columns={[
                { title: "Employee", dataIndex: "employee_name" },
                { title: "ID", dataIndex: "employee_id", width: 80 },
                { title: "Start", dataIndex: "start_date", width: 100 },
                {
                  title: "Status",
                  dataIndex: "status",
                  width: 80,
                  render: (v) => <Tag color={v === "Active" ? "green" : "default"}>{v}</Tag>,
                },
                {
                  title: "",
                  width: 80,
                  render: (_, r) => (
                    <Popconfirm title="Remove guard?" onConfirm={() => void removeAllocation(r.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]}
            />
          </Card>
          
          <Card size="small" title="Available Guards">
            <Table
              rowKey="id"
              size="small"
              loading={allocLoading}
              dataSource={availableGuards}
              pagination={{ pageSize: 5 }}
              columns={[
                { title: "Name", dataIndex: "name" },
                { title: "ID", dataIndex: "serial_no", width: 80 },
                { title: "Designation", dataIndex: "designation", width: 120 },
                {
                  title: "",
                  width: 100,
                  render: (_, r) => (
                    <Button size="small" type="primary" onClick={() => void allocateGuard(r.id)}>
                      Allocate
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </Space>
      </Drawer>
    </>
  );
}
