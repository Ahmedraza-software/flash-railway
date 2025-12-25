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
  Form,
  Input,
  Divider,
  Upload,
  Avatar,
  Modal,
} from "antd";
import {
  ArrowLeftOutlined,
  SaveOutlined,
  UserOutlined,
  IdcardOutlined,
  PhoneOutlined,
  HomeOutlined,
  FileTextOutlined,
  UploadOutlined,
  PaperClipOutlined,
  PlusOutlined,
  DeleteOutlined,
  BankOutlined,
  CameraOutlined,
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
  avatar_url: string | null;
  cnic_attachment: string | null;
  domicile_attachment: string | null;
  sho_verified_attachment: string | null;
  ssp_verified_attachment: string | null;
  khidmat_verified_attachment: string | null;
  police_trg_attachment: string | null;
  bank_accounts: string | null;
}

export default function EditEmployeePage() {
  const params = useParams();
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employee, setEmployee] = useState<Employee2 | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Employee2>(`/api/employees2/${params.id}`);
      setEmployee(data);
      form.setFieldsValue(data);
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
  }, [params.id, form]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      values.bank_accounts = JSON.stringify(bankAccounts);
      await api.put(`/api/employees2/${params.id}`, values);
      message.success("Employee updated");
      router.push(`/employees2/${params.id}`);
    } catch {
      message.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (fieldType: string, file: File) => {
    setUploading(fieldType);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("access_token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/employees2/${params.id}/upload/${fieldType}`,
        {
          method: "POST",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: formData,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      message.success("File uploaded");
      fetchEmployee();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const addBankAccount = () => {
    setBankAccounts([...bankAccounts, { bank_name: "", account_title: "", account_number: "", branch: "" }]);
  };

  const removeBankAccount = (index: number) => {
    setBankAccounts(bankAccounts.filter((_, i) => i !== index));
  };

  const updateBankAccount = (index: number, field: keyof BankAccount, value: string) => {
    const updated = [...bankAccounts];
    updated[index] = { ...updated[index], [field]: value };
    setBankAccounts(updated);
  };

  const AttachmentButton = ({ fieldType, label, currentUrl }: { fieldType: string; label: string; currentUrl: string | null }) => (
    <Space size={4}>
      <Upload
        showUploadList={false}
        beforeUpload={(file) => { handleUpload(fieldType, file); return false; }}
        accept="image/*,.pdf"
      >
        <Button 
          size="small" 
          icon={<PaperClipOutlined />} 
          loading={uploading === fieldType}
          type={currentUrl ? "primary" : "default"}
          ghost={!!currentUrl}
        />
      </Upload>
      {currentUrl && (
        <a href={`http://127.0.0.1:8000${currentUrl}`} target="_blank" rel="noopener noreferrer">
          <Button size="small" type="link" style={{padding:0}}>View</Button>
        </a>
      )}
    </Space>
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 12, background: "#f5f5f5", minHeight: "100vh" }}>
      {/* Header */}
      <Card size="small" style={{ marginBottom: 8 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(`/employees2/${params.id}`)}>Back</Button>
              <Divider type="vertical" />
              <Title level={5} style={{ margin: 0 }}>Edit Employee</Title>
            </Space>
          </Col>
          <Col>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>Save</Button>
          </Col>
        </Row>
      </Card>

      <Form form={form} layout="vertical" size="small">
        <Row gutter={[8, 8]}>
          {/* Avatar + Basic Info */}
          <Col xs={24} lg={8}>
            <Card size="small" title={<><UserOutlined /> Basic Info</>}>
              {/* Avatar Upload */}
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <Upload
                  showUploadList={false}
                  beforeUpload={(file) => { handleUpload("avatar", file); return false; }}
                  accept="image/*"
                >
                  <div style={{ cursor: "pointer", position: "relative", display: "inline-block" }}>
                    <Avatar 
                      size={80} 
                      src={employee?.avatar_url ? `http://127.0.0.1:8000${employee.avatar_url}` : undefined}
                      icon={<UserOutlined />}
                    />
                    <div style={{ 
                      position: "absolute", bottom: 0, right: 0, 
                      background: "#1890ff", borderRadius: "50%", 
                      width: 24, height: 24, display: "flex", 
                      alignItems: "center", justifyContent: "center" 
                    }}>
                      <CameraOutlined style={{ color: "#fff", fontSize: 12 }} />
                    </div>
                  </div>
                </Upload>
                {uploading === "avatar" && <Spin size="small" style={{ marginLeft: 8 }} />}
              </div>
              <Row gutter={[8, 0]}>
                <Col span={8}><Form.Item name="serial_no" label="#" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="fss_no" label="FSS #" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="rank" label="Rank" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="name" label="Name" rules={[{required:true}]} style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="father_name" label="Father" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="salary" label="Salary" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="status" label="Status" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="unit" label="Unit" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="service_rank" label="Svc Rank" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="blood_group" label="Blood" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="category" label="Category" style={{marginBottom:0}}><Input /></Form.Item></Col>
              </Row>
            </Card>
          </Col>

          {/* Identity & Docs with Attachments */}
          <Col xs={24} lg={8}>
            <Card size="small" title={<><IdcardOutlined /> Identity & Docs</>}>
              <Row gutter={[8, 0]}>
                <Col span={16}><Form.Item name="cnic" label="CNIC" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8} style={{display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <AttachmentButton fieldType="cnic" label="CNIC" currentUrl={employee?.cnic_attachment || null} />
                </Col>
                <Col span={12}><Form.Item name="cnic_expiry" label="CNIC Expiry" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="dob" label="DOB" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={16}><Form.Item name="domicile" label="Domicile" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8} style={{display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <AttachmentButton fieldType="domicile" label="Domicile" currentUrl={employee?.domicile_attachment || null} />
                </Col>
                <Col span={12}><Form.Item name="eobi_no" label="EOBI #" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="insurance" label="Insurance" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="social_security" label="Social Sec" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="vol_no" label="Vol #" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="photo_on_doc" label="Photo Doc" style={{marginBottom:0}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="documents_held" label="Docs Held" style={{marginBottom:0}}><Input /></Form.Item></Col>
              </Row>
            </Card>
          </Col>

          {/* Contact & Verification with Attachments */}
          <Col xs={24} lg={8}>
            <Card size="small" title={<><PhoneOutlined /> Contact & Verification</>}>
              <Row gutter={[8, 0]}>
                <Col span={12}><Form.Item name="mobile_no" label="Mobile" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="home_contact" label="Home" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={16}><Form.Item name="verified_by_sho" label="SHO Verified" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8} style={{display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <AttachmentButton fieldType="sho_verified" label="SHO" currentUrl={employee?.sho_verified_attachment || null} />
                </Col>
                <Col span={16}><Form.Item name="verified_by_ssp" label="SSP Verified" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8} style={{display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <AttachmentButton fieldType="ssp_verified" label="SSP" currentUrl={employee?.ssp_verified_attachment || null} />
                </Col>
                <Col span={16}><Form.Item name="verified_by_khidmat_markaz" label="Khidmat Verified" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8} style={{display:"flex",alignItems:"flex-end",paddingBottom:8}}>
                  <AttachmentButton fieldType="khidmat_verified" label="Khidmat" currentUrl={employee?.khidmat_verified_attachment || null} />
                </Col>
                <Col span={12}><Form.Item name="enrolled" label="Enrolled" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="re_enrolled" label="Re-Enrolled" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={16}><Form.Item name="police_trg_ltr_date" label="Police Trg" style={{marginBottom:0}}><Input /></Form.Item></Col>
                <Col span={8} style={{display:"flex",alignItems:"flex-end"}}>
                  <AttachmentButton fieldType="police_trg" label="Police Trg" currentUrl={employee?.police_trg_attachment || null} />
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Address */}
          <Col xs={24} lg={8}>
            <Card size="small" title={<><HomeOutlined /> Address</>}>
              <Row gutter={[8, 0]}>
                <Col span={12}><Form.Item name="village" label="Village" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="post_office" label="Post Office" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="thana" label="Thana" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="tehsil" label="Tehsil" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="district" label="District" style={{marginBottom:0}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="duty_location" label="Duty Loc" style={{marginBottom:0}}><Input /></Form.Item></Col>
              </Row>
            </Card>
          </Col>

          {/* Other */}
          <Col xs={24} lg={8}>
            <Card size="small" title={<><FileTextOutlined /> Other</>}>
              <Row gutter={[8, 0]}>
                <Col span={8}><Form.Item name="status2" label="Status 2" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="unit2" label="Unit 2" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={8}><Form.Item name="rank2" label="Rank 2" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="vaccination_cert" label="Vaccination" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="payments" label="Payments" style={{marginBottom:8}}><Input /></Form.Item></Col>
                <Col span={24}><Form.Item name="documents_handed_over_to" label="Docs Handed To" style={{marginBottom:0}}><Input /></Form.Item></Col>
              </Row>
            </Card>
          </Col>

          {/* Bank Accounts */}
          <Col xs={24} lg={8}>
            <Card 
              size="small" 
              title={<><BankOutlined /> Bank Accounts</>}
              extra={<Button size="small" icon={<PlusOutlined />} onClick={addBankAccount}>Add</Button>}
            >
              {bankAccounts.length === 0 ? (
                <Text type="secondary">No bank accounts added</Text>
              ) : (
                bankAccounts.map((acc, idx) => (
                  <div key={idx} style={{ marginBottom: idx < bankAccounts.length - 1 ? 8 : 0, padding: 8, background: "#fafafa", borderRadius: 4 }}>
                    <Row gutter={[4, 4]} align="middle">
                      <Col span={11}>
                        <Input 
                          size="small" 
                          placeholder="Bank Name" 
                          value={acc.bank_name} 
                          onChange={(e) => updateBankAccount(idx, "bank_name", e.target.value)} 
                        />
                      </Col>
                      <Col span={11}>
                        <Input 
                          size="small" 
                          placeholder="Account Title" 
                          value={acc.account_title} 
                          onChange={(e) => updateBankAccount(idx, "account_title", e.target.value)} 
                        />
                      </Col>
                      <Col span={2}>
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeBankAccount(idx)} />
                      </Col>
                      <Col span={12}>
                        <Input 
                          size="small" 
                          placeholder="Account #" 
                          value={acc.account_number} 
                          onChange={(e) => updateBankAccount(idx, "account_number", e.target.value)} 
                        />
                      </Col>
                      <Col span={12}>
                        <Input 
                          size="small" 
                          placeholder="Branch" 
                          value={acc.branch} 
                          onChange={(e) => updateBankAccount(idx, "branch", e.target.value)} 
                        />
                      </Col>
                    </Row>
                  </div>
                ))
              )}
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
}
