"use client";

import {
  ArrowLeftOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  message,
  Modal,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";

import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";

type Client = {
  id: number;
  client_code: string;
  client_name: string;
  client_type: string;
  industry_type?: string | null;
  status: string;
  registration_number?: string | null;
  vat_gst_number?: string | null;
  website?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type SuggestedEmployee = {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  languages: string[];
};

type ClientSiteGuardAllocation = {
  id: number;
  site_id: number;
  requirement_id?: number | null;
  employee_db_id: number;
  start_date?: string | null;
  end_date?: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

type ClientContact = {
  id: number;
  client_id: number;
  name: string;
  designation?: string | null;
  phone_number?: string | null;
  email?: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at?: string | null;
};

type ClientSite = {
  id: number;
  client_id: number;
  site_name: string;
  site_type?: string | null;
  site_address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  risk_level?: string | null;
  status: string;
  site_instructions?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ClientInvoice = {
  id: number;
  client_id: number;
  contract_id?: number | null;
  site_id?: number | null;
  invoice_number: string;
  invoice_date: string;
  billing_period: string;
  net_payable: number;
  payment_status: string;
  payment_date?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ClientDocument = {
  id: number;
  client_id: number;
  document_type: string;
  file_url: string;
  expiry_date?: string | null;
  remarks?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ClientDetail = Client & {
  contacts: ClientContact[];
  addresses: unknown[];
  sites: ClientSite[];
  invoices: ClientInvoice[];
  documents: ClientDocument[];
};

type ClientGuardRequirement = {
  id: number;
  site_id: number;
  site_name?: string;
  site_status?: string | null;
  guard_type: string;
  number_of_guards: number;
  shift_type?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  preferred_language?: string | null;
  monthly_amount?: number | null;
  weekly_off_rules?: string | null;
  special_instructions?: string | null;
  created_at: string;
  updated_at?: string | null;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

export default function ClientDetailPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();
  const params = useParams<{ client_id?: string }>();

  const [requirementForm] = Form.useForm<{
    site_id: number;
    site_name?: string;
    site_address?: string | null;
    city?: string | null;
    risk_level?: string | null;
    guard_type: string;
    number_of_guards: number;
    preferred_language?: string | null;
    monthly_amount?: number | null;
    duration?: [Dayjs, Dayjs] | null;
  }>();

  const clientId = useMemo(() => {
    const raw = params?.client_id;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [params?.client_id]);

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ClientDetail | null>(null);

  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [requirements, setRequirements] = useState<ClientGuardRequirement[]>([]);
  const [allContracts, setAllContracts] = useState<ClientGuardRequirement[]>([]);
  const [selectedRequirementId, setSelectedRequirementId] = useState<number | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);

  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [suggestedEmployees, setSuggestedEmployees] = useState<SuggestedEmployee[]>([]);
  const [allocations, setAllocations] = useState<ClientSiteGuardAllocation[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);

  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [reqModalMode, setReqModalMode] = useState<"create" | "extend">("create");
  const [reqUseNewSite, setReqUseNewSite] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const d = await api.get<ClientDetail>(`/api/client-management/clients/${clientId}`);
      setDetail(d);
      const firstSite = d?.sites?.[0]?.id ?? null;
      setSelectedSiteId(firstSite);
      setSelectedRequirementId(null);
    } catch (e: unknown) {
      setDetail(null);
      msg.error(errorMessage(e, "Failed to load client"));
    } finally {
      setLoading(false);
    }
  }, [clientId, msg]);

  const loadAllContracts = useCallback(async () => {
    if (!clientId) return;
    try {
      const rows = await api.get<ClientGuardRequirement[]>(
        `/api/client-management/clients/${clientId}/contract-requirements`
      );
      setAllContracts(Array.isArray(rows) ? rows : []);
    } catch {
      setAllContracts([]);
    }
  }, [clientId]);

  const loadRequirements = useCallback(async (siteId: number) => {
    try {
      const rows = await api.get<ClientGuardRequirement[]>(`/api/client-management/sites/${siteId}/requirements`);
      const list = Array.isArray(rows) ? rows : [];
      setRequirements(list);
      setSelectedRequirementId(list?.[0]?.id ?? null);
    } catch {
      setRequirements([]);
      setSelectedRequirementId(null);
    }
  }, []);

  const loadAllocations = useCallback(async (siteId: number) => {
    try {
      const rows = await api.get<ClientSiteGuardAllocation[]>(`/api/client-management/sites/${siteId}/allocations`);
      setAllocations(Array.isArray(rows) ? rows : []);
    } catch {
      setAllocations([]);
    }
  }, []);

  const loadSuggestedEmployees = useCallback(async (siteId: number, requirementId: number) => {
    try {
      const rows = await api.get<SuggestedEmployee[]>(
        `/api/client-management/sites/${siteId}/requirements/${requirementId}/suggested-employees`
      );
      setSuggestedEmployees(Array.isArray(rows) ? rows : []);
    } catch {
      setSuggestedEmployees([]);
    }
  }, []);

  const selectedRequirement = useMemo(() => {
    if (!selectedRequirementId) return null;
    return requirements.find((r) => r.id === selectedRequirementId) ?? null;
  }, [requirements, selectedRequirementId]);

  const selectedRequirementEnded = useMemo(() => {
    const end = selectedRequirement?.end_date;
    if (!end) return false;
    const d = dayjs(end);
    if (!d.isValid()) return false;
    return d.endOf("day").isBefore(dayjs());
  }, [selectedRequirement?.end_date]);

  const selectedSiteName = useMemo(() => {
    if (!selectedSiteId) return "-";
    return detail?.sites?.find((s) => s.id === selectedSiteId)?.site_name ?? "-";
  }, [detail?.sites, selectedSiteId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    void loadAllContracts();
  }, [loadAllContracts]);

  useEffect(() => {
    if (!selectedSiteId) {
      setRequirements([]);
      setSelectedRequirementId(null);
      return;
    }
    void loadRequirements(selectedSiteId);
    void loadAllocations(selectedSiteId);
  }, [loadAllocations, loadRequirements, selectedSiteId]);

  useEffect(() => {
    if (!selectedSiteId || !selectedRequirementId) {
      setSuggestedEmployees([]);
      setSelectedEmployeeIds([]);
      return;
    }
    void loadSuggestedEmployees(selectedSiteId, selectedRequirementId);
  }, [loadSuggestedEmployees, selectedRequirementId, selectedSiteId]);

  const completeRequirement = useCallback(async () => {
    if (!selectedSiteId || !selectedRequirementId) {
      msg.error("Please select Site and Requirement first");
      return;
    }
    setAllocLoading(true);
    try {
      const res = await api.post<{ message: string; invoice_number: string; released: number }>(
        `/api/client-management/sites/${selectedSiteId}/requirements/${selectedRequirementId}/complete`,
        {}
      );
      msg.success(`${res.message} (Invoice: ${res.invoice_number})`);
      await loadDetail();
      await loadAllContracts();
      await loadAllocations(selectedSiteId);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Complete failed"));
    } finally {
      setAllocLoading(false);
    }
  }, [loadAllContracts, loadAllocations, loadDetail, msg, selectedRequirementId, selectedSiteId]);

  const openAllocateModal = useCallback(() => {
    if (!selectedSiteId || !selectedRequirementId || !selectedRequirement) {
      msg.error("Please select Site and Requirement first");
      return;
    }
    setSelectedEmployeeIds([]);
    setAllocModalOpen(true);
  }, [msg, selectedRequirement, selectedRequirementId, selectedSiteId]);

  const submitAllocate = useCallback(async () => {
    if (!selectedSiteId || !selectedRequirementId || !selectedRequirement) {
      msg.error("Please select Site and Requirement first");
      return;
    }
    const need = Number(selectedRequirement.number_of_guards || 0);
    if (!need || need <= 0) {
      msg.error("Invalid number of guards");
      return;
    }
    if (selectedEmployeeIds.length !== need) {
      msg.error(`Please select exactly ${need} employee(s)`);
      return;
    }

    setAllocLoading(true);
    try {
      for (const empId of selectedEmployeeIds) {
        await api.post(`/api/client-management/sites/${selectedSiteId}/allocations`, {
          employee_db_id: empId,
          requirement_id: selectedRequirementId,
          start_date: selectedRequirement.start_date ?? null,
          end_date: selectedRequirement.end_date ?? null,
        });
      }
      msg.success("Guards allocated");
      setAllocModalOpen(false);
      await loadAllocations(selectedSiteId);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Allocation failed"));
    } finally {
      setAllocLoading(false);
    }
  }, [loadAllocations, msg, selectedEmployeeIds, selectedRequirement, selectedRequirementId, selectedSiteId]);

  const markInvoicePaid = useCallback(
    async (invoiceId: number) => {
      if (!clientId) return;
      setLoading(true);
      try {
        await api.put(`/api/client-management/clients/${clientId}/invoices/${invoiceId}`, {
          payment_status: "Paid",
        });
        msg.success("Payment marked as Paid");
        await loadDetail();
        if (selectedSiteId) await loadAllocations(selectedSiteId);
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to mark Paid"));
      } finally {
        setLoading(false);
      }
    },
    [clientId, loadAllocations, loadDetail, msg, selectedSiteId]
  );

  const openCreateRequirement = useCallback(() => {
    const firstSiteId = detail?.sites?.[0]?.id ?? null;
    const siteId = selectedSiteId ?? firstSiteId;

    setReqModalMode("create");
    requirementForm.resetFields();

    const hasValidSelectedSite = !!siteId;
    setReqUseNewSite(!hasValidSelectedSite);

    if (siteId) {
      if (selectedSiteId !== siteId) setSelectedSiteId(siteId);
      requirementForm.setFieldsValue({ site_id: siteId });
    } else {
      // No sites yet: allow creating a site inside the modal
      requirementForm.setFieldsValue({
        site_name: "",
        site_address: null,
        city: null,
        risk_level: "Low",
      });
    }

    requirementForm.setFieldsValue({
      guard_type: "Unarmed",
      number_of_guards: 1,
      preferred_language: null,
      monthly_amount: null,
    });
    setReqModalOpen(true);
  }, [detail?.sites, msg, requirementForm, selectedSiteId]);

  const openExtendRequirement = useCallback(() => {
    if (!selectedSiteId || !selectedRequirement) {
      msg.error("Please select a requirement first");
      return;
    }
    if (!selectedRequirementEnded) {
      msg.error("You can extend only after the contract duration ends");
      return;
    }
    setReqModalMode("extend");
    requirementForm.resetFields();
    requirementForm.setFieldsValue({
      site_id: selectedSiteId,
      guard_type: selectedRequirement.guard_type,
      number_of_guards: selectedRequirement.number_of_guards,
      preferred_language: selectedRequirement.preferred_language ?? null,
      monthly_amount: selectedRequirement.monthly_amount ?? null,
    });
    setReqModalOpen(true);
  }, [msg, requirementForm, selectedRequirement, selectedRequirementEnded, selectedSiteId]);

  const submitRequirement = useCallback(async () => {
    const values = await requirementForm.validateFields();

    let siteId = Number(values.site_id);
    if (reqUseNewSite || !Number.isFinite(siteId) || siteId <= 0) {
      if (!clientId) {
        msg.error("Invalid client");
        return;
      }
      const siteName = (values.site_name || "").trim();
      if (!siteName) {
        msg.error("Please enter Site Name");
        return;
      }

      const created = await api.post<{ id: number }>(`/api/client-management/clients/${clientId}/sites`, {
        site_name: siteName,
        site_address: values.site_address || null,
        city: values.city || null,
        risk_level: values.risk_level || "Low",
        status: "Active",
      });
      siteId = Number(created?.id);
      if (!Number.isFinite(siteId)) {
        throw new Error("Failed to create site");
      }
      setSelectedSiteId(siteId);
      await loadDetail();
    }

    const duration = values.duration;

    const start = duration && Array.isArray(duration) ? duration[0] : null;
    const end = duration && Array.isArray(duration) ? duration[1] : null;
    const startDate = start && dayjs.isDayjs(start) ? start.format("YYYY-MM-DD") : null;
    const endDate = end && dayjs.isDayjs(end) ? end.format("YYYY-MM-DD") : null;

    setAllocLoading(true);
    try {
      await api.post(`/api/client-management/sites/${siteId}/requirements`, {
        guard_type: values.guard_type,
        number_of_guards: Number(values.number_of_guards || 1),
        start_date: startDate,
        end_date: endDate,
        preferred_language: values.preferred_language || null,
        monthly_amount: values.monthly_amount ?? null,
      });
      msg.success(reqModalMode === "extend" ? "Contract extended" : "Contract created");
      setReqModalOpen(false);
      setSelectedSiteId(siteId);
      await loadRequirements(siteId);
      await loadAllContracts();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to save contract"));
    } finally {
      setAllocLoading(false);
    }
  }, [clientId, loadAllContracts, loadDetail, loadRequirements, msg, reqModalMode, reqUseNewSite, requirementForm]);

  const downloadInvoicePdf = useCallback(
    async (invoiceId: number, invoiceNumber: string) => {
      if (!clientId) return;
      try {
        const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;
        const res = await fetch(
          `${API_BASE_URL}/api/client-management/clients/${clientId}/invoices/${invoiceId}/pdf`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }
        );

        const contentType = res.headers.get("content-type") || "";
        if (!res.ok || !contentType.toLowerCase().includes("application/pdf")) {
          let detail = `Failed (${res.status})`;
          try {
            const txt = await res.text();
            try {
              const j = JSON.parse(txt) as { detail?: unknown; message?: unknown };
              detail = String(j.detail ?? j.message ?? detail);
            } catch {
              if (txt) detail = txt;
            }
          } catch {
            // ignore
          }
          throw new Error(detail);
        }

        const ab = await res.arrayBuffer();
        const head = new TextDecoder("ascii").decode(ab.slice(0, 4));
        if (head !== "%PDF") {
          throw new Error("Server did not return a valid PDF");
        }

        const blob = new Blob([ab], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${invoiceNumber || "invoice"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to download PDF"));
      }
    },
    [clientId, msg]
  );

  const contactsColumns = useMemo<ColumnsType<ClientContact>>(
    () => [
      { title: "Name", dataIndex: "name" },
      { title: "Designation", dataIndex: "designation" },
      { title: "Phone", dataIndex: "phone_number" },
      { title: "Email", dataIndex: "email" },
      {
        title: "Primary",
        dataIndex: "is_primary",
        width: 90,
        render: (v) => (v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
      },
    ],
    []
  );

  const sitesColumns = useMemo<ColumnsType<ClientSite>>(
    () => [
      { title: "Site", dataIndex: "site_name" },
      { title: "Type", dataIndex: "site_type", width: 140 },
      { title: "City", dataIndex: "city", width: 140 },
      { title: "Risk", dataIndex: "risk_level", width: 120 },
      { title: "Status", dataIndex: "status", width: 120 },
    ],
    []
  );

  const invoicesColumns = useMemo<ColumnsType<ClientInvoice>>(
    () => [
      { title: "Invoice #", dataIndex: "invoice_number" },
      { title: "Date", dataIndex: "invoice_date", width: 140 },
      { title: "Period", dataIndex: "billing_period", width: 210 },
      {
        title: "Net",
        dataIndex: "net_payable",
        width: 140,
        render: (v) => <Tag color="purple">{Number(v ?? 0).toFixed(2)}</Tag>,
      },
      { title: "Status", dataIndex: "payment_status", width: 120 },
      {
        title: "",
        width: 220,
        render: (_, r) => {
          const st = String(r.payment_status ?? "").toLowerCase();
          const canMarkPaid = st !== "paid";
          return (
            <Space size={8}>
              <Button size="small" onClick={() => void downloadInvoicePdf(r.id, r.invoice_number)}>
                PDF
              </Button>
              <Button size="small" type={canMarkPaid ? "primary" : "default"} disabled={!canMarkPaid} onClick={() => void markInvoicePaid(r.id)}>
                Mark Paid
              </Button>
            </Space>
          );
        },
      },
    ],
    [downloadInvoicePdf, markInvoicePaid]
  );

  const allocationRows = useMemo(() => {
    if (!selectedRequirementId) return [];
    return (allocations || []).filter((a) => Number(a.requirement_id ?? 0) === Number(selectedRequirementId));
  }, [allocations, selectedRequirementId]);

  const allocationsColumns = useMemo<ColumnsType<ClientSiteGuardAllocation>>(
    () => [
      { title: "Employee DB Id", dataIndex: "employee_db_id", width: 140 },
      { title: "Start", dataIndex: "start_date", width: 120, render: (v) => (v ? String(v) : "-") },
      { title: "End", dataIndex: "end_date", width: 120, render: (v) => (v ? String(v) : "-") },
      {
        title: "Status",
        dataIndex: "status",
        width: 120,
        render: (v) => {
          const s = String(v || "");
          return s === "Allocated" ? <Tag color="green">Allocated</Tag> : <Tag>Released</Tag>;
        },
      },
    ],
    []
  );

  const allContractsColumns = useMemo<ColumnsType<ClientGuardRequirement>>(
    () => [
      {
        title: "Site",
        dataIndex: "site_name",
        render: (v, r) => v || (r.site_id ? `Site #${r.site_id}` : "-"),
      },
      { title: "Guard Type", dataIndex: "guard_type", width: 140 },
      { title: "Guards", dataIndex: "number_of_guards", width: 90 },
      {
        title: "Start",
        dataIndex: "start_date",
        width: 120,
        render: (v) => (v ? String(v) : "-"),
      },
      {
        title: "End",
        dataIndex: "end_date",
        width: 120,
        render: (v) => (v ? String(v) : "-"),
      },
      {
        title: "Monthly",
        dataIndex: "monthly_amount",
        width: 130,
        render: (v) => (v == null ? "-" : <Tag color="purple">{Number(v ?? 0).toFixed(2)}</Tag>),
      },
      {
        title: "Status",
        key: "status",
        width: 120,
        render: (_, r) => {
          const end = r.end_date ? dayjs(r.end_date) : null;
          const ended = end && end.isValid() ? end.endOf("day").isBefore(dayjs()) : false;
          return ended ? <Tag color="default">Ended</Tag> : <Tag color="green">Active</Tag>;
        },
      },
    ],
    []
  );

  const documentsColumns = useMemo<ColumnsType<ClientDocument>>(
    () => [
      { title: "Type", dataIndex: "document_type", width: 160 },
      { title: "URL", dataIndex: "file_url", ellipsis: true },
      { title: "Expiry", dataIndex: "expiry_date", width: 140 },
    ],
    []
  );

  const invoiceTotals = useMemo(() => {
    const invoices = detail?.invoices ?? [];
    return invoices.reduce(
      (a, inv) => {
        const amt = Number(inv?.net_payable ?? 0);
        const st = String(inv?.payment_status ?? "").toLowerCase();
        if (st === "paid") a.received += amt;
        else a.pending += amt;
        return a;
      },
      { received: 0, pending: 0 }
    );
  }, [detail?.invoices]);

  const header = (
    <Row gutter={[12, 12]} align="middle">
      <Col flex="auto">
        <Space size={10} wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/client-management")} />
          <Typography.Title level={3} style={{ margin: 0 }}>
            {detail?.client_name ?? "Client"}
          </Typography.Title>
          {detail?.client_code ? <Tag color="blue">{detail.client_code}</Tag> : null}
          <Badge
            count={detail?.status ?? ""}
            showZero={false}
            color={detail?.status === "Active" ? "#16a34a" : "#d97706"}
            style={{ boxShadow: "none" }}
          />
        </Space>
      </Col>
      <Col>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadDetail()} loading={loading}>
            Refresh
          </Button>
        </Space>
      </Col>
    </Row>
  );

  const overview = (
    <Card variant="borderless" style={{ borderRadius: 16 }} styles={{ body: { padding: 16 } }}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Typography.Text type="secondary">Client Name</Typography.Text>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {detail?.client_name ?? "-"}
            </Typography.Title>
          </Col>
          <Col xs={24} md={12}>
            <Typography.Text type="secondary">Status</Typography.Text>
            <div>
              <Tag color={(detail?.status ?? "") === "Active" ? "green" : "gold"}>{detail?.status ?? "-"}</Tag>
            </div>
          </Col>
        </Row>

        <Descriptions
          bordered
          colon={false}
          size="middle"
          column={{ xs: 1, sm: 2, md: 2, lg: 2 }}
          labelStyle={{ width: 200, fontWeight: 600 }}
        >
          <Descriptions.Item label="Client Code">{detail?.client_code ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Client Type">{detail?.client_type ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Industry Type">{detail?.industry_type ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Registration / Tax ID">{detail?.registration_number ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="VAT / GST Number">{detail?.vat_gst_number ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Website">
            {detail?.website ? (
              <Typography.Link href={detail.website} target="_blank" rel="noreferrer">
                {detail.website}
              </Typography.Link>
            ) : (
              "-"
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Notes / Remarks" span={2}>
            <Typography.Text>{detail?.notes ?? "-"}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>

        <Divider style={{ margin: "0" }} />
        <Typography.Title level={5} style={{ margin: 0 }}>
          Contacts
        </Typography.Title>
        <Table<ClientContact>
          size="small"
          rowKey={(r) => r.id}
          dataSource={detail?.contacts ?? []}
          pagination={false}
          loading={loading}
          columns={contactsColumns}
        />
      </Space>
    </Card>
  );

  const allocationsCard = (
    <Card id="contracts" variant="borderless" style={{ borderRadius: 16 }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Allocations
        </Typography.Title>
        <Space size={8}>
          <Button onClick={openCreateRequirement}>
            Create Contract
          </Button>
          <Button onClick={openExtendRequirement}>
            Extend Contract
          </Button>
          <Button onClick={openAllocateModal}>
            Allocate Guards
          </Button>
          <Button
            type="primary"
            onClick={() => void completeRequirement()}
            loading={allocLoading}
          >
            Get Payment
          </Button>
        </Space>
      </Space>
    </Card>
  );

  return (
    <>
      {msgCtx}
      <Modal
        title={reqModalMode === "extend" ? "Extend Contract" : "Create Contract"}
        open={reqModalOpen}
        onCancel={() => setReqModalOpen(false)}
        onOk={() => void submitRequirement()}
        okText={reqModalMode === "extend" ? "Extend" : "Create"}
        confirmLoading={allocLoading}
      >
        <Form form={requirementForm} layout="vertical">
          <Row gutter={[12, 0]}>
            <Col xs={24} md={12}>
              {reqModalMode === "create" ? (
                <Form.Item>
                  <Checkbox
                    checked={reqUseNewSite}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setReqUseNewSite(checked);
                      if (checked) {
                        requirementForm.setFieldsValue({ site_id: 0 });
                      } else {
                        const firstSiteId = detail?.sites?.[0]?.id ?? null;
                        const siteId = selectedSiteId ?? firstSiteId;
                        if (siteId) requirementForm.setFieldsValue({ site_id: siteId });
                      }
                    }}
                  >
                    Add new site
                  </Checkbox>
                </Form.Item>
              ) : null}

              {!reqUseNewSite && selectedSiteId && selectedSiteName !== "-" ? (
                <Form.Item label="Where (Site)">
                  <Typography.Text strong>{selectedSiteName}</Typography.Text>
                </Form.Item>
              ) : (
                <>
                  <Form.Item name="site_name" label="Site Name" rules={[{ required: true }]}>
                    <Input placeholder="Enter site name" />
                  </Form.Item>
                  <Form.Item name="site_address" label="Site Address">
                    <Input placeholder="Address" />
                  </Form.Item>
                  <Form.Item name="city" label="City">
                    <Input placeholder="City" />
                  </Form.Item>
                  <Form.Item name="risk_level" label="Risk Level" initialValue="Low">
                    <Select
                      options={[
                        { label: "Low", value: "Low" },
                        { label: "Medium", value: "Medium" },
                        { label: "High", value: "High" },
                      ]}
                    />
                  </Form.Item>
                </>
              )}

              <Form.Item name="site_id" hidden>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="guard_type" label="Guard Type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "Unarmed", value: "Unarmed" },
                    { label: "Armed", value: "Armed" },
                    { label: "Supervisor", value: "Supervisor" },
                    { label: "Female Guard", value: "Female Guard" },
                  ]}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="number_of_guards" label="How many guards" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="monthly_amount" label="Monthly Amount">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="preferred_language" label="Preferred Language">
                <Input placeholder="Any" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="duration" label="Duration" rules={[{ required: true }]}>
                <DatePicker.RangePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Allocate Guards"
        open={allocModalOpen}
        onCancel={() => setAllocModalOpen(false)}
        onOk={() => void submitAllocate()}
        okText="Allocate"
        confirmLoading={allocLoading}
        width={800}
      >
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            Select exactly {selectedRequirement?.number_of_guards ?? 0} employee(s) for this contract.
          </Typography.Text>
          <Table<SuggestedEmployee>
            size="small"
            rowKey={(r) => r.id}
            dataSource={suggestedEmployees}
            pagination={false}
            rowSelection={{
              selectedRowKeys: selectedEmployeeIds,
              onChange: (keys) => setSelectedEmployeeIds(keys.map((k) => Number(k))),
            }}
            columns={[
              { title: "Employee ID", dataIndex: "employee_id", width: 140 },
              {
                title: "Name",
                key: "name",
                render: (_, r) => `${r.first_name || ""} ${r.last_name || ""}`.trim() || "-",
              },
              {
                title: "Languages",
                dataIndex: "languages",
                render: (v) => (Array.isArray(v) && v.length ? v.join(", ") : "-"),
              },
            ]}
          />
        </Space>
      </Modal>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {header}
        {overview}

        <Row gutter={[12, 12]}>
          <Col xs={24}>
            {allocationsCard}
          </Col>
        </Row>

        <Card variant="borderless" style={{ borderRadius: 16 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Allocated Guards (Selected Contract)
          </Typography.Title>
          <Divider style={{ margin: "8px 0" }} />
          <Table<ClientSiteGuardAllocation>
            size="small"
            rowKey={(r) => r.id}
            dataSource={allocationRows}
            pagination={false}
            loading={loading}
            columns={allocationsColumns}
          />
        </Card>

        <Card variant="borderless" style={{ borderRadius: 16 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            All Contracts
          </Typography.Title>
          <Divider style={{ margin: "8px 0" }} />
          <Table<ClientGuardRequirement>
            size="small"
            rowKey={(r) => r.id}
            dataSource={allContracts}
            pagination={false}
            loading={loading}
            columns={allContractsColumns}
          />
        </Card>

        <Card variant="borderless" style={{ borderRadius: 16 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Sites
          </Typography.Title>
          <Divider style={{ margin: "8px 0" }} />
          <Table<ClientSite>
            size="small"
            rowKey={(r) => r.id}
            dataSource={detail?.sites ?? []}
            pagination={false}
            loading={loading}
            columns={sitesColumns}
          />
        </Card>

        <Card variant="borderless" style={{ borderRadius: 16 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Invoices
          </Typography.Title>
          <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
            <Col xs={24} md={12}>
              <Statistic title="Total Received from Client" value={invoiceTotals.received} prefix="Rs" precision={2} />
            </Col>
            <Col xs={24} md={12}>
              <Statistic title="Total Pending (Payment Not Done)" value={invoiceTotals.pending} prefix="Rs" precision={2} />
            </Col>
          </Row>
          <Divider style={{ margin: "8px 0" }} />
          <Table<ClientInvoice>
            size="small"
            rowKey={(r) => r.id}
            dataSource={detail?.invoices ?? []}
            pagination={false}
            loading={loading}
            columns={invoicesColumns}
          />
        </Card>

        <Card variant="borderless" style={{ borderRadius: 16 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Documents
          </Typography.Title>
          <Divider style={{ margin: "8px 0" }} />
          <Table<ClientDocument>
            size="small"
            rowKey={(r) => r.id}
            dataSource={detail?.documents ?? []}
            pagination={false}
            loading={loading}
            columns={documentsColumns}
          />
        </Card>
      </Space>
    </>
  );
}
