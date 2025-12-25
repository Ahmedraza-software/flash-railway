"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  Button,
  Input,
  Space,
  Card,
  Typography,
  message,
  Modal,
  Form,
  Row,
  Col,
  Select,
  Upload,
  Spin,
  Popconfirm,
  Tabs,
} from "antd";
import {
  SearchOutlined,
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/api";

const { Title, Text } = Typography;

interface Employee2 {
  id: number;
  serial_no: string | null;
  fss_no: string | null;
  rank: string | null;
  name: string;
  father_name: string | null;
  salary: string | null;
  status: string | null;
  unit: string | null;
  service_rank: string | null;
  blood_group: string | null;
  status2: string | null;
  unit2: string | null;
  rank2: string | null;
  cnic: string | null;
  dob: string | null;
  cnic_expiry: string | null;
  documents_held: string | null;
  documents_handed_over_to: string | null;
  photo_on_doc: string | null;
  eobi_no: string | null;
  insurance: string | null;
  social_security: string | null;
  mobile_no: string | null;
  home_contact: string | null;
  verified_by_sho: string | null;
  verified_by_khidmat_markaz: string | null;
  domicile: string | null;
  verified_by_ssp: string | null;
  enrolled: string | null;
  re_enrolled: string | null;
  village: string | null;
  post_office: string | null;
  thana: string | null;
  tehsil: string | null;
  district: string | null;
  duty_location: string | null;
  police_trg_ltr_date: string | null;
  vaccination_cert: string | null;
  vol_no: string | null;
  payments: string | null;
  category: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function Employees2Page() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee2[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee2 | null>(null);
  const [form] = Form.useForm();
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: String((page - 1) * pageSize),
        limit: String(pageSize),
        with_total: "true",
      });
      if (search) params.append("search", search);
      if (selectedCategory) params.append("category", selectedCategory);
      if (selectedStatus) params.append("status", selectedStatus);

      const res = await api.get<{ employees: Employee2[]; total: number }>(
        `/api/employees2/?${params.toString()}`
      );
      setEmployees(res.employees);
      setTotal(res.total);
    } catch (err: unknown) {
      message.error("Failed to fetch employees");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, selectedCategory, selectedStatus]);

  const fetchFilters = useCallback(async () => {
    try {
      const [cats, stats] = await Promise.all([
        api.get<string[]>("/api/employees2/categories"),
        api.get<string[]>("/api/employees2/statuses"),
      ]);
      setCategories(cats);
      setStatuses(stats);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  const handleImportJson = async (file: File) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("access_token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api"}/employees2/import-json`,
        {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Import failed");
      message.success(`Imported ${data.created} employees (${data.skipped} skipped)`);
      fetchEmployees();
      fetchFilters();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await api.del("/api/employees2/");
      message.success("All employees deleted");
      fetchEmployees();
      fetchFilters();
    } catch {
      message.error("Failed to delete");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.del(`/api/employees2/${id}`);
      message.success("Employee deleted");
      fetchEmployees();
    } catch {
      message.error("Failed to delete");
    }
  };

  const openEditModal = (emp: Employee2) => {
    setEditingEmployee(emp);
    form.setFieldsValue(emp);
    setModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingEmployee(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingEmployee) {
        await api.put(`/api/employees2/${editingEmployee.id}`, values);
        message.success("Employee updated");
      } else {
        await api.post("/api/employees2/", values);
        message.success("Employee created");
      }
      setModalOpen(false);
      fetchEmployees();
    } catch {
      message.error("Failed to save");
    }
  };

  const columns: ColumnsType<Employee2> = [
    { title: "#", dataIndex: "serial_no", key: "serial_no", width: 60, fixed: "left" },
    { title: "FSS #", dataIndex: "fss_no", key: "fss_no", width: 80 },
    { title: "Rank", dataIndex: "rank", key: "rank", width: 100 },
    { title: "Name", dataIndex: "name", key: "name", width: 150, fixed: "left" },
    { title: "Father's Name", dataIndex: "father_name", key: "father_name", width: 150 },
    { title: "Salary", dataIndex: "salary", key: "salary", width: 80 },
    { title: "Status", dataIndex: "status", key: "status", width: 80 },
    { title: "Unit", dataIndex: "unit", key: "unit", width: 100 },
    { title: "Service Rank", dataIndex: "service_rank", key: "service_rank", width: 80 },
    { title: "Blood Gp", dataIndex: "blood_group", key: "blood_group", width: 70 },
    { title: "CNIC #", dataIndex: "cnic", key: "cnic", width: 140 },
    { title: "DOB", dataIndex: "dob", key: "dob", width: 90 },
    { title: "CNIC Expiry", dataIndex: "cnic_expiry", key: "cnic_expiry", width: 100 },
    { title: "Documents Held", dataIndex: "documents_held", key: "documents_held", width: 150 },
    { title: "Docs Handed To", dataIndex: "documents_handed_over_to", key: "documents_handed_over_to", width: 150 },
    { title: "Photo on Doc", dataIndex: "photo_on_doc", key: "photo_on_doc", width: 100 },
    { title: "EOBI #", dataIndex: "eobi_no", key: "eobi_no", width: 120 },
    { title: "Insurance", dataIndex: "insurance", key: "insurance", width: 80 },
    { title: "Social Security", dataIndex: "social_security", key: "social_security", width: 100 },
    { title: "Mobile #", dataIndex: "mobile_no", key: "mobile_no", width: 130 },
    { title: "Home Contact", dataIndex: "home_contact", key: "home_contact", width: 150 },
    { title: "Verified SHO", dataIndex: "verified_by_sho", key: "verified_by_sho", width: 100 },
    { title: "Verified Khidmat", dataIndex: "verified_by_khidmat_markaz", key: "verified_by_khidmat_markaz", width: 120 },
    { title: "Domicile", dataIndex: "domicile", key: "domicile", width: 100 },
    { title: "Verified SSP", dataIndex: "verified_by_ssp", key: "verified_by_ssp", width: 120 },
    { title: "Enrolled", dataIndex: "enrolled", key: "enrolled", width: 90 },
    { title: "Re Enrolled", dataIndex: "re_enrolled", key: "re_enrolled", width: 90 },
    { title: "Village", dataIndex: "village", key: "village", width: 150 },
    { title: "Post Office", dataIndex: "post_office", key: "post_office", width: 120 },
    { title: "Thana", dataIndex: "thana", key: "thana", width: 100 },
    { title: "Tehsil", dataIndex: "tehsil", key: "tehsil", width: 100 },
    { title: "District", dataIndex: "district", key: "district", width: 100 },
    { title: "Duty Location", dataIndex: "duty_location", key: "duty_location", width: 120 },
    { title: "Police Trg Ltr", dataIndex: "police_trg_ltr_date", key: "police_trg_ltr_date", width: 150 },
    { title: "Vaccination", dataIndex: "vaccination_cert", key: "vaccination_cert", width: 100 },
    { title: "Vol #", dataIndex: "vol_no", key: "vol_no", width: 80 },
    { title: "Payments", dataIndex: "payments", key: "payments", width: 100 },
    { title: "Category", dataIndex: "category", key: "category", width: 150 },
    {
      title: "Actions",
      key: "actions",
      width: 130,
      fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Button 
            size="small" 
            icon={<EyeOutlined />} 
            onClick={() => router.push(`/employees2/${record.id}`)}
          />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Popconfirm title="Delete?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Title level={4} style={{ margin: 0 }}>
                Employees 2 (Legacy Data)
              </Title>
              <Text type="secondary">Total: {total}</Text>
            </Col>
            <Col>
              <Space>
                <input
                  type="file"
                  accept=".json"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportJson(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  icon={<UploadOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                  loading={importing}
                >
                  Import JSON
                </Button>
                <Popconfirm title="Delete ALL employees?" onConfirm={handleDeleteAll}>
                  <Button danger icon={<DeleteOutlined />}>
                    Delete All
                  </Button>
                </Popconfirm>
                <Button icon={<ReloadOutlined />} onClick={fetchEmployees}>
                  Refresh
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                  Add
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={8}>
            <Col flex="auto">
              <Input
                placeholder="Search by name, FSS#, CNIC, mobile..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onPressEnter={() => {
                  setPage(1);
                  fetchEmployees();
                }}
                allowClear
              />
            </Col>
            <Col>
              <Select
                placeholder="Category"
                allowClear
                style={{ width: 180 }}
                value={selectedCategory}
                onChange={(v) => {
                  setSelectedCategory(v);
                  setPage(1);
                }}
                options={categories.map((c) => ({ label: c, value: c }))}
              />
            </Col>
            <Col>
              <Select
                placeholder="Status"
                allowClear
                style={{ width: 120 }}
                value={selectedStatus}
                onChange={(v) => {
                  setSelectedStatus(v);
                  setPage(1);
                }}
                options={statuses.map((s) => ({ label: s, value: s }))}
              />
            </Col>
          </Row>

          <Table
            columns={columns}
            dataSource={employees}
            rowKey="id"
            loading={loading}
            scroll={{ x: 4000 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50", "100"],
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            size="small"
          />
        </Space>
      </Card>

      <Modal
        title={editingEmployee ? "Edit Employee" : "Add Employee"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        width={900}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Tabs
            items={[
              {
                key: "basic",
                label: "Basic Info",
                children: (
                  <Row gutter={12}>
                    <Col span={6}><Form.Item name="serial_no" label="#"><Input /></Form.Item></Col>
                    <Col span={6}><Form.Item name="fss_no" label="FSS #"><Input /></Form.Item></Col>
                    <Col span={6}><Form.Item name="rank" label="Rank"><Input /></Form.Item></Col>
                    <Col span={6}><Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="father_name" label="Father's Name"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="salary" label="Salary"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="status" label="Status"><Input /></Form.Item></Col>
                    <Col span={6}><Form.Item name="unit" label="Unit"><Input /></Form.Item></Col>
                    <Col span={6}><Form.Item name="service_rank" label="Service Rank"><Input /></Form.Item></Col>
                    <Col span={6}><Form.Item name="blood_group" label="Blood Group"><Input /></Form.Item></Col>
                    <Col span={6}><Form.Item name="category" label="Category"><Input /></Form.Item></Col>
                  </Row>
                ),
              },
              {
                key: "identity",
                label: "Identity & Docs",
                children: (
                  <Row gutter={12}>
                    <Col span={8}><Form.Item name="cnic" label="CNIC #"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="dob" label="DOB"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="cnic_expiry" label="CNIC Expiry"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="documents_held" label="Documents Held"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="documents_handed_over_to" label="Docs Handed To"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="photo_on_doc" label="Photo on Doc"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="eobi_no" label="EOBI #"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="insurance" label="Insurance"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="social_security" label="Social Security"><Input /></Form.Item></Col>
                  </Row>
                ),
              },
              {
                key: "contact",
                label: "Contact",
                children: (
                  <Row gutter={12}>
                    <Col span={12}><Form.Item name="mobile_no" label="Mobile #"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="home_contact" label="Home Contact"><Input /></Form.Item></Col>
                  </Row>
                ),
              },
              {
                key: "verification",
                label: "Verification",
                children: (
                  <Row gutter={12}>
                    <Col span={8}><Form.Item name="verified_by_sho" label="Verified by SHO"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="verified_by_khidmat_markaz" label="Verified by Khidmat Markaz"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="verified_by_ssp" label="Verified by SSP"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="domicile" label="Domicile"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="enrolled" label="Enrolled"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="re_enrolled" label="Re Enrolled"><Input /></Form.Item></Col>
                  </Row>
                ),
              },
              {
                key: "address",
                label: "Address",
                children: (
                  <Row gutter={12}>
                    <Col span={8}><Form.Item name="village" label="Village"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="post_office" label="Post Office"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="thana" label="Thana"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="tehsil" label="Tehsil"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="district" label="District"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="duty_location" label="Duty Location"><Input /></Form.Item></Col>
                  </Row>
                ),
              },
              {
                key: "other",
                label: "Other",
                children: (
                  <Row gutter={12}>
                    <Col span={12}><Form.Item name="police_trg_ltr_date" label="Police Trg Ltr & Date"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="vaccination_cert" label="Vaccination Cert"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="vol_no" label="Vol #"><Input /></Form.Item></Col>
                    <Col span={8}><Form.Item name="payments" label="Payments"><Input /></Form.Item></Col>
                  </Row>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
}
