"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  Typography,
  Row,
  Col,
  Button,
  Space,
  Spin,
  message,
  Descriptions,
  Tag,
  Divider,
  Avatar,
} from "antd";
import {
  ArrowLeftOutlined,
  EditOutlined,
  UserOutlined,
  IdcardOutlined,
  PhoneOutlined,
  HomeOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  BankOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";

const { Title, Text } = Typography;

interface BankAccount {
  bank_name: string;
  account_title: string;
  account_number: string;
  branch?: string;
}

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
  designation: string | null;
  allocation_status: string | null;
  avatar_url: string | null;
  cnic_attachment: string | null;
  domicile_attachment: string | null;
  sho_verified_attachment: string | null;
  ssp_verified_attachment: string | null;
  khidmat_verified_attachment: string | null;
  police_trg_attachment: string | null;
  bank_accounts: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [exporting, setExporting] = useState(false);

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Employee2>(`/api/employees2/${params.id}`);
      setEmployee(data);
      if (data.bank_accounts) {
        try {
          setBankAccounts(JSON.parse(data.bank_accounts));
        } catch {
          setBankAccounts([]);
        }
      }
    } catch {
      message.error("Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/employees2/${params.id}/export-pdf`,
        {
          method: "GET",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Employee_${employee?.name || params.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success("PDF exported successfully");
    } catch {
      message.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <Title level={4}>Employee not found</Title>
        <Button onClick={() => router.push("/employees2")}>Back to List</Button>
      </div>
    );
  }

  const val = (v: string | null | undefined) => v || "-";

  const AttachmentLink = ({ url, label }: { url: string | null; label: string }) => {
    if (!url) return null;
    return (
      <a href={`http://127.0.0.1:8000${url}`} target="_blank" rel="noopener noreferrer">
        <Tag icon={<PaperClipOutlined />} color="blue">{label}</Tag>
      </a>
    );
  };

  return (
    <div style={{ padding: 16, background: "#f5f5f5", minHeight: "100vh" }}>
      {/* Header */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/employees2")}>
                Back
              </Button>
              <Divider type="vertical" />
              <Avatar 
                size={40} 
                src={employee.avatar_url ? `http://127.0.0.1:8000${employee.avatar_url}` : undefined}
                icon={<UserOutlined />}
              />
              <div>
                <Title level={4} style={{ margin: 0 }}>{employee.name}</Title>
                <Space size={4}>
                  {employee.category && <Tag color="blue">{employee.category}</Tag>}
                  {employee.allocation_status && (
                    <Tag color={employee.allocation_status === "Free" ? "green" : "orange"}>
                      {employee.allocation_status}
                    </Tag>
                  )}
                </Space>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<FilePdfOutlined />} onClick={handleExportPDF} loading={exporting}>
                Export PDF
              </Button>
              <Button type="primary" icon={<EditOutlined />} onClick={() => router.push(`/employees2/${employee.id}/edit`)}>
                Edit
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Main Content - Compact Grid */}
      <Row gutter={[12, 12]}>
        {/* Basic Info */}
        <Col xs={24} lg={8}>
          <Card 
            size="small" 
            title={<><UserOutlined /> Basic Information</>}
            style={{ height: "100%" }}
          >
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="Serial #">{val(employee.serial_no)}</Descriptions.Item>
              <Descriptions.Item label="FSS #">{val(employee.fss_no)}</Descriptions.Item>
              <Descriptions.Item label="Rank">{val(employee.rank)}</Descriptions.Item>
              <Descriptions.Item label="Salary">{val(employee.salary)}</Descriptions.Item>
              <Descriptions.Item label="Status">{val(employee.status)}</Descriptions.Item>
              <Descriptions.Item label="Unit">{val(employee.unit)}</Descriptions.Item>
              <Descriptions.Item label="Service Rank">{val(employee.service_rank)}</Descriptions.Item>
              <Descriptions.Item label="Blood Group">{val(employee.blood_group)}</Descriptions.Item>
              <Descriptions.Item label="Father">{val(employee.father_name)}</Descriptions.Item>
              <Descriptions.Item label="Duty Location">{val(employee.duty_location)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* Identity & Documents */}
        <Col xs={24} lg={8}>
          <Card 
            size="small" 
            title={<><IdcardOutlined /> Identity & Documents</>}
            style={{ height: "100%" }}
          >
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="CNIC">
                {val(employee.cnic)}
                {employee.cnic_attachment && <AttachmentLink url={employee.cnic_attachment} label="Doc" />}
              </Descriptions.Item>
              <Descriptions.Item label="CNIC Expiry">{val(employee.cnic_expiry)}</Descriptions.Item>
              <Descriptions.Item label="DOB">{val(employee.dob)}</Descriptions.Item>
              <Descriptions.Item label="Domicile">
                {val(employee.domicile)}
                {employee.domicile_attachment && <AttachmentLink url={employee.domicile_attachment} label="Doc" />}
              </Descriptions.Item>
              <Descriptions.Item label="EOBI #">{val(employee.eobi_no)}</Descriptions.Item>
              <Descriptions.Item label="Insurance">{val(employee.insurance)}</Descriptions.Item>
              <Descriptions.Item label="Social Security">{val(employee.social_security)}</Descriptions.Item>
              <Descriptions.Item label="Vol #">{val(employee.vol_no)}</Descriptions.Item>
              <Descriptions.Item label="Photo on Doc">{val(employee.photo_on_doc)}</Descriptions.Item>
              <Descriptions.Item label="Docs Held">{val(employee.documents_held)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* Contact & Verification */}
        <Col xs={24} lg={8}>
          <Card 
            size="small" 
            title={<><PhoneOutlined /> Contact & Verification</>}
            style={{ height: "100%" }}
          >
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="Mobile">{val(employee.mobile_no)}</Descriptions.Item>
              <Descriptions.Item label="Home">{val(employee.home_contact)}</Descriptions.Item>
              <Descriptions.Item label="SHO Verified">
                {val(employee.verified_by_sho)}
                {employee.sho_verified_attachment && <AttachmentLink url={employee.sho_verified_attachment} label="Doc" />}
              </Descriptions.Item>
              <Descriptions.Item label="SSP Verified">
                {val(employee.verified_by_ssp)}
                {employee.ssp_verified_attachment && <AttachmentLink url={employee.ssp_verified_attachment} label="Doc" />}
              </Descriptions.Item>
              <Descriptions.Item label="Khidmat Verified" span={2}>
                {val(employee.verified_by_khidmat_markaz)}
                {employee.khidmat_verified_attachment && <AttachmentLink url={employee.khidmat_verified_attachment} label="Doc" />}
              </Descriptions.Item>
              <Descriptions.Item label="Enrolled">{val(employee.enrolled)}</Descriptions.Item>
              <Descriptions.Item label="Re-Enrolled">{val(employee.re_enrolled)}</Descriptions.Item>
              <Descriptions.Item label="Police Trg" span={2}>
                {val(employee.police_trg_ltr_date)}
                {employee.police_trg_attachment && <AttachmentLink url={employee.police_trg_attachment} label="Doc" />}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* Address */}
        <Col xs={24} lg={8}>
          <Card 
            size="small" 
            title={<><HomeOutlined /> Address</>}
          >
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="Village">{val(employee.village)}</Descriptions.Item>
              <Descriptions.Item label="Post Office">{val(employee.post_office)}</Descriptions.Item>
              <Descriptions.Item label="Thana">{val(employee.thana)}</Descriptions.Item>
              <Descriptions.Item label="Tehsil">{val(employee.tehsil)}</Descriptions.Item>
              <Descriptions.Item label="District">{val(employee.district)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* Other Info */}
        <Col xs={24} lg={8}>
          <Card 
            size="small" 
            title={<><FileTextOutlined /> Other Information</>}
          >
            <Descriptions column={2} size="small" colon={false}>
              <Descriptions.Item label="Status 2">{val(employee.status2)}</Descriptions.Item>
              <Descriptions.Item label="Unit 2">{val(employee.unit2)}</Descriptions.Item>
              <Descriptions.Item label="Rank 2">{val(employee.rank2)}</Descriptions.Item>
              <Descriptions.Item label="Vaccination">{val(employee.vaccination_cert)}</Descriptions.Item>
              <Descriptions.Item label="Payments">{val(employee.payments)}</Descriptions.Item>
              <Descriptions.Item label="Docs To">{val(employee.documents_handed_over_to)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* Bank Accounts */}
        <Col xs={24} lg={8}>
          <Card 
            size="small" 
            title={<><BankOutlined /> Bank Accounts</>}
          >
            {bankAccounts.length === 0 ? (
              <Text type="secondary">No bank accounts</Text>
            ) : (
              bankAccounts.map((acc, idx) => (
                <div key={idx} style={{ marginBottom: idx < bankAccounts.length - 1 ? 8 : 0, padding: 8, background: "#fafafa", borderRadius: 4 }}>
                  <Text strong>{acc.bank_name}</Text>
                  {acc.branch && <Text type="secondary"> - {acc.branch}</Text>}
                  <br />
                  <Text type="secondary">Title:</Text> {acc.account_title}<br />
                  <Text type="secondary">Account:</Text> {acc.account_number}
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
