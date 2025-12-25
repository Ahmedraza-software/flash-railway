"use client";

import {
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";
import { api } from "@/lib/api";
import type { Employee, EmployeeCreate, EmployeeDocumentOut, EmployeeWarning } from "@/lib/types";

type FormValues = Omit<EmployeeCreate, "date_of_birth"> & {
  date_of_birth?: string | dayjs.Dayjs | null;
  cnic_expiry_date?: string | dayjs.Dayjs | null;
  service_enrollment_date?: string | dayjs.Dayjs | null;
  service_reenrollment_date?: string | dayjs.Dayjs | null;
  particulars_verified_by_sho_on?: string | dayjs.Dayjs | null;
  particulars_verified_by_ssp_on?: string | dayjs.Dayjs | null;
  police_khidmat_verification_on?: string | dayjs.Dayjs | null;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

export default function EmployeeCreatePage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const roleOptions = ["Supervisor", "Guard", "Driver", "Cook", "Sweeper"];
  const retiredFromOptions = ["Army", "Navy", "PAF", "Police", "FC", "MJ"];

  const defaultWarningNoticeText =
    "You are order to improve your conduct in future, otherwise strict action would be taken against you. Your services would be terminated automatically on third warning.";

  const [saving, setSaving] = useState(false);
  const [warningsSaving, setWarningsSaving] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState(
    "basic" as
      | "basic"
      | "job"
      | "languages"
      | "contact"
      | "service"
      | "family"
      | "verification"
      | "fingerprints"
      | "payroll"
      | "compliance"
      | "warnings"
      | "documents"
  );
  const [form] = Form.useForm<FormValues>();

  const [warningsDraft, setWarningsDraft] = useState<
    Array<{
      warning_number: string;
      found_with?: string;
      notice_text?: string;
      supervisor_signature?: string;
      supervisor_signature_date?: string;
      files: File[];
    }>
  >([]);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningForm] = Form.useForm<{
    warning_number: string;
    found_with: string;
    notice_text?: string;
    supervisor_signature?: string;
    supervisor_signature_date?: dayjs.Dayjs | null;
  }>();
  const [warningSignatureFile, setWarningSignatureFile] = useState<File | null>(null);

  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<EmployeeDocumentOut[]>([]);
  const [docName, setDocName] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDocs, setPendingDocs] = useState<Array<{ name: string; file: File }>>([]);

  const [serviceEnrollmentMode, setServiceEnrollmentMode] = useState<"today" | "manual">("today");
  const [fingerFiles, setFingerFiles] = useState<Record<string, File | null>>({
    thumb: null,
    index: null,
    middle: null,
    ring: null,
    little: null,
  });

  const docsList = useMemo(() => {
    const base = API_BASE_URL || "";
    return (docs ?? []).map((d) => ({ ...d, _absUrl: d.url.startsWith("http") ? d.url : `${base}${d.url}` }));
  }, [docs]);

  const loadDocuments = useCallback(async (employeeDbId: number) => {
    setDocsLoading(true);
    try {
      const res = await api.get<EmployeeDocumentOut[]>(`/api/employees/by-db-id/${employeeDbId}/documents`);
      setDocs(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      setDocs([]);
      msg.error(errorMessage(e, "Failed to load employee documents"));
    } finally {
      setDocsLoading(false);
    }
  }, [msg]);

  const uploadPendingDocs = useCallback(
    async (employeeDbId: number) => {
      if (!pendingDocs.length) return;
      setDocsLoading(true);
      try {
        for (const d of pendingDocs) {
          const fd = new FormData();
          fd.append("name", d.name);
          fd.append("file", d.file);

          const res = await fetch(`${API_BASE_URL}/api/employees/by-db-id/${employeeDbId}/documents`, {
            method: "POST",
            body: fd,
          });
          if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        }

        setPendingDocs([]);
        msg.success("Documents uploaded");
        await loadDocuments(employeeDbId);
      } finally {
        setDocsLoading(false);
      }
    },
    [loadDocuments, msg, pendingDocs]
  );

  const uploadNamedDoc = useCallback(
    async (employeeDbId: number | null, name: string, file: File) => {
      if (!name.trim()) {
        msg.error("Document name is required");
        return;
      }
      if (!file) {
        msg.error("Please choose a file");
        return;
      }

      if (!employeeDbId) {
        setPendingDocs((p) => [...p, { name: name.trim(), file }]);
        msg.success("Document added. It will upload after you save the employee.");
        return;
      }

      setDocsLoading(true);
      try {
        const fd = new FormData();
        fd.append("name", name.trim());
        fd.append("file", file);

        const res = await fetch(`${API_BASE_URL}/api/employees/by-db-id/${employeeDbId}/documents`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        msg.success("Uploaded");
        await loadDocuments(employeeDbId);
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Upload failed"));
      } finally {
        setDocsLoading(false);
      }
    },
    [loadDocuments, msg]
  );

  const uploadDocument = useCallback(async () => {
    if (!docFile) {
      msg.error("Please choose a file");
      return;
    }
    if (!docName.trim()) {
      msg.error("Please enter document name");
      return;
    }

    setPendingDocs((p) => [...p, { name: docName.trim(), file: docFile }]);
    setDocName("");
    setDocFile(null);
    msg.success("Document added. It will upload after you save the employee.");
  }, [docFile, docName, msg]);

  const uploadWarningsAfterCreate = useCallback(
    async (employeeDbId: number) => {
      if (!warningsDraft.length) return;
      setWarningsSaving(true);
      try {
        for (const w of warningsDraft) {
          const warningNumber = (w.warning_number || "").trim();
          if (!warningNumber) continue;

          const created = await api.post<EmployeeWarning>(`/api/employees/by-db-id/${employeeDbId}/warnings`, {
            warning_number: warningNumber,
            found_with: (w.found_with || "").trim() || undefined,
            notice_text: (w.notice_text || "").trim() || undefined,
            supervisor_signature: (w.supervisor_signature || "").trim() || undefined,
            supervisor_signature_date: (w.supervisor_signature_date || "").trim() || undefined,
          });

          const warningId = Number(created?.id);
          if (!warningId || !w.files?.length) continue;

          for (const file of w.files) {
            const fd = new FormData();
            fd.append("file", file);

            const res = await fetch(`${API_BASE_URL}/api/employees/warnings/${warningId}/documents`, {
              method: "POST",
              body: fd,
            });
            if (!res.ok) throw new Error(`Warning upload failed (${res.status})`);
          }
        }
        msg.success("Warnings uploaded");
        setWarningsDraft([]);
      } finally {
        setWarningsSaving(false);
      }
    },
    [msg, warningsDraft]
  );

  const openWarningModal = useCallback(() => {
    if (warningsDraft.length >= 3) {
      msg.error("Maximum 3 warnings allowed");
      return;
    }
    const level = warningsDraft.length === 0 ? "FIRST" : warningsDraft.length === 1 ? "SECOND" : "THIRD";
    warningForm.resetFields();
    warningForm.setFieldsValue({ warning_number: level, found_with: "", notice_text: defaultWarningNoticeText } as unknown as {
      warning_number: string;
      found_with: string;
      notice_text?: string;
      supervisor_signature?: string;
      supervisor_signature_date?: dayjs.Dayjs | null;
    });
    setWarningSignatureFile(null);
    setWarningModalOpen(true);
  }, [defaultWarningNoticeText, msg, warningForm, warningsDraft.length]);

  const submitWarningModal = useCallback(async () => {
    const values = await warningForm.validateFields();
    const warningNumber = (values.warning_number || "").trim();
    const foundWith = (values.found_with || "").trim();
    const noticeText = (values.notice_text || "").trim();
    if (!warningNumber) {
      msg.error("Warning level is required");
      return;
    }
    if (!foundWith) {
      msg.error("Please enter what the guard was found with");
      return;
    }

    const supervisorSignatureDate =
      values.supervisor_signature_date && dayjs.isDayjs(values.supervisor_signature_date)
        ? values.supervisor_signature_date.format("YYYY-MM-DD")
        : undefined;

    setWarningsDraft((p) => [
      ...p,
      {
        warning_number: warningNumber,
        found_with: foundWith,
        notice_text: noticeText || undefined,
        supervisor_signature: (values.supervisor_signature || "").trim() || undefined,
        supervisor_signature_date: supervisorSignatureDate,
        files: warningSignatureFile ? [warningSignatureFile] : [],
      },
    ]);

    setWarningModalOpen(false);
    setWarningSignatureFile(null);
    msg.success("Warning added");
  }, [msg, warningForm, warningSignatureFile]);

  const onSubmit = useCallback(async () => {
    const values = await form.validateFields();

    const fullNameRaw = String((values as unknown as { full_name?: unknown }).full_name ?? "").trim();
    const nameParts = fullNameRaw.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "-";

    const bankAccounts = Array.isArray((values as unknown as { bank_accounts?: unknown }).bank_accounts)
      ? ((values as unknown as { bank_accounts?: Array<Record<string, unknown>> }).bank_accounts ?? [])
      : [];
    const firstBank = bankAccounts[0] ?? {};

    const proficiency = Array.isArray((values as unknown as { languages_proficiency?: unknown }).languages_proficiency)
      ? ((values as unknown as { languages_proficiency?: Array<{ language: string; level: string }> }).languages_proficiency ?? [])
          .filter((x) => x && x.language && x.level)
      : undefined;
    const languagesFromProficiency = proficiency?.map((x) => x.language).filter(Boolean);
    const spokenFromTags = Array.isArray((values as unknown as { languages_spoken?: unknown }).languages_spoken)
      ? ((values as unknown as { languages_spoken?: string[] }).languages_spoken ?? []).filter(Boolean)
      : undefined;
    const mergedSpoken = Array.from(new Set([...(languagesFromProficiency ?? []), ...(spokenFromTags ?? [])])).filter(Boolean);

    const payload: EmployeeCreate = {
      ...(values as unknown as EmployeeCreate),
      first_name: firstName,
      last_name: lastName,
      bank_accounts: bankAccounts.length ? (bankAccounts as any) : undefined,
      bank_name: typeof firstBank.bank_name === "string" ? firstBank.bank_name : undefined,
      account_number: typeof firstBank.account_number === "string" ? firstBank.account_number : undefined,
      ifsc_code: typeof firstBank.ifsc_code === "string" ? firstBank.ifsc_code : undefined,
      account_type: typeof firstBank.account_type === "string" ? firstBank.account_type : undefined,
      tax_id: typeof firstBank.tax_id === "string" ? firstBank.tax_id : undefined,
      languages_spoken: mergedSpoken.length ? mergedSpoken : undefined,
      date_of_birth:
        values.date_of_birth && dayjs.isDayjs(values.date_of_birth)
          ? values.date_of_birth.format("YYYY-MM-DD")
          : (values.date_of_birth ?? undefined),
      cnic_expiry_date:
        values.cnic_expiry_date && dayjs.isDayjs(values.cnic_expiry_date)
          ? values.cnic_expiry_date.format("YYYY-MM-DD")
          : (values.cnic_expiry_date ?? undefined),
      service_enrollment_date:
        serviceEnrollmentMode === "today"
          ? dayjs().format("YYYY-MM-DD")
          : values.service_enrollment_date && dayjs.isDayjs(values.service_enrollment_date)
            ? values.service_enrollment_date.format("YYYY-MM-DD")
            : ((values.service_enrollment_date ?? undefined) as unknown as string | undefined),
      service_reenrollment_date:
        values.service_reenrollment_date && dayjs.isDayjs(values.service_reenrollment_date)
          ? values.service_reenrollment_date.format("YYYY-MM-DD")
          : (values.service_reenrollment_date ?? undefined),
      particulars_verified_by_sho_on:
        values.particulars_verified_by_sho_on && dayjs.isDayjs(values.particulars_verified_by_sho_on)
          ? values.particulars_verified_by_sho_on.format("YYYY-MM-DD")
          : (values.particulars_verified_by_sho_on ?? undefined),
      particulars_verified_by_ssp_on:
        values.particulars_verified_by_ssp_on && dayjs.isDayjs(values.particulars_verified_by_ssp_on)
          ? values.particulars_verified_by_ssp_on.format("YYYY-MM-DD")
          : (values.particulars_verified_by_ssp_on ?? undefined),
      police_khidmat_verification_on:
        values.police_khidmat_verification_on && dayjs.isDayjs(values.police_khidmat_verification_on)
          ? values.police_khidmat_verification_on.format("YYYY-MM-DD")
          : (values.police_khidmat_verification_on ?? undefined),
      police_training_letter_date:
        (values as any).police_training_letter_date && dayjs.isDayjs((values as any).police_training_letter_date)
          ? (values as any).police_training_letter_date.format("YYYY-MM-DD")
          : ((values as any).police_training_letter_date ?? undefined),
    };

    setSaving(true);
    try {
      const created = await api.post<Employee>("/api/employees/", payload);
      if (created?.id) {
        await uploadWarningsAfterCreate(Number(created.id));
        await uploadPendingDocs(Number(created.id));
        await loadDocuments(Number(created.id));
      }
      msg.success("Employee created");
      router.push("/employees");
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  }, [form, loadDocuments, msg, router, serviceEnrollmentMode, uploadPendingDocs, uploadWarningsAfterCreate]);

  return (
    <>
      {msgCtx}
      <div style={{ width: "100%", maxWidth: 1350, margin: "0 auto", paddingLeft: 12, paddingRight: 12 }}>
        <Card
          title={<Typography.Title level={4} style={{ margin: 0 }}>Create Employee</Typography.Title>}
          extra={
            <Space>
              <Button onClick={() => router.push("/employees")}>Cancel</Button>
              <Button type="primary" loading={saving || warningsSaving} onClick={() => void onSubmit()}>
                Save
              </Button>
            </Space>
          }
          style={{ borderRadius: 12, width: "100%" }}
          styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}
        >
          <Form
            form={form}
            layout="vertical"
            size="small"
            initialValues={{
              basic_security_training: false,
              fire_safety_training: false,
              first_aid_certification: false,
              agreement: false,
              police_clearance: false,
              fingerprint_check: false,
              background_screening: false,
              reference_verification: false,
              guard_card: false,
              employment_status: "Active",
            }}
          >
            <div style={{ overflowX: "hidden", paddingLeft: 6, paddingRight: 6 }}>
              <Tabs
                size="small"
                activeKey={activeTabKey}
                onChange={(k) => setActiveTabKey(k as typeof activeTabKey)}
                items={[
                  {
                    key: "basic",
                    label: "Basic",
                    children: (
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item name="full_name" label="Full name" rules={[{ required: true }]}>
                            <Input placeholder="Full name" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                            <Input placeholder="email@company.com" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="mobile_number" label="Personal phone number">
                            <Input placeholder="+92..." />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="gender" label="Gender">
                            <Select allowClear options={["Male", "Female", "Other"].map((v) => ({ label: v, value: v }))} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="date_of_birth"
                            label="Date of birth"
                            getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                          >
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="cnic"
                            label={
                              <Space size={8}>
                                <span>CNIC</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("CNIC");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Doc
                                </Button>
                              </Space>
                            }
                          >
                            <Input placeholder="xxxxx-xxxxxxx-x" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="domicile"
                            label={
                              <Space size={8}>
                                <span>Domicile</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("Domicile");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Doc
                                </Button>
                              </Space>
                            }
                          >
                            <Input placeholder="e.g. Punjab" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="cnic_expiry_date"
                            label="CNIC Expiry"
                            getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                          >
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="height_cm" label="Height (cm)">
                            <InputNumber min={0} style={{ width: "100%" }} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="employment_status" label="Employment status">
                            <Select options={["Active", "Inactive", "Left"].map((v) => ({ label: v, value: v }))} />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: "job",
                    label: "Job",
                    children: (
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item name="department" label="Department">
                            <Select
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={roleOptions.map((d) => ({ label: d, value: d }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="designation" label="Designation">
                            <Select
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={roleOptions.map((d) => ({ label: d, value: d }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="enrolled_as" label="Enrolled as">
                            <Select allowClear options={roleOptions.map((v) => ({ label: v, value: v }))} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="shift_type" label="Shift type">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="reporting_manager" label="Reporting manager">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="base_location" label="Deployed at">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="interviewed_by" label="Interviewed by">
                            <Input placeholder="Name / phone" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="remarks" label="Remarks">
                            <Input.TextArea rows={2} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="introduced_by" label="Introduced by">
                            <Input placeholder="Name / phone" />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: "contact",
                    label: "Contact",
                    children: (
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item name="emergency_contact_name" label="Emergency contact name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="emergency_contact_number" label="Emergency contact number">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="next_of_kin_name" label="Next of kin">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="next_of_kin_cnic" label="NOK CNIC">
                            <Input placeholder="xxxxx-xxxxxxx-x" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="next_of_kin_mobile_number" label="NOK mobile number">
                            <Input placeholder="+92..." />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="father_name" label="Father name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="home_contact_no" label="Home contact no">
                            <Input placeholder="Home phone" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="permanent_address" label="Permanent address">
                            <Input.TextArea rows={1} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="temporary_address" label="Temporary address">
                            <Input.TextArea rows={1} />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Divider style={{ margin: "6px 0" }} />
                        </Col>
                        <Col span={24}>
                          <Typography.Text strong>Permanent</Typography.Text>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="permanent_village" label="Village">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="permanent_post_office" label="Post office">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="permanent_thana" label="Thana">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="permanent_tehsil" label="Tehsil">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item name="permanent_district" label="District">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Divider style={{ margin: "6px 0" }} />
                        </Col>
                        <Col span={24}>
                          <Typography.Text strong>Present</Typography.Text>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="present_village" label="Village">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="present_post_office" label="Post office">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="present_thana" label="Thana">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="present_tehsil" label="Tehsil">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item name="present_district" label="District">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: "service",
                    label: "Employment History",
                    children: (
                      <Row gutter={8}>
                        <Col span={24}>
                          <Form.Item
                            name="retired_from"
                            label={
                              <Space size={8}>
                                <span>Retired from</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("Retirement book");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Retirement book
                                </Button>
                              </Space>
                            }
                          >
                            <Select
                              mode="tags"
                              allowClear
                              placeholder="Select or type custom"
                              options={retiredFromOptions.map((v) => ({ label: v, value: v }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="service_unit" label="Unit">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="service_rank" label="Rank">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Space size={8} style={{ marginBottom: 8 }}>
                            <Typography.Text strong>Date of enrollment</Typography.Text>
                            <Select
                              value={serviceEnrollmentMode}
                              onChange={(v) => setServiceEnrollmentMode(v)}
                              style={{ width: 160 }}
                              options={[
                                { label: "Today", value: "today" },
                                { label: "Manual", value: "manual" },
                              ]}
                            />
                          </Space>
                        </Col>
                        {serviceEnrollmentMode === "manual" ? (
                          <Col span={12}>
                            <Form.Item
                              name="service_enrollment_date"
                              label="Enrollment date"
                              getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                            >
                              <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                            </Form.Item>
                          </Col>
                        ) : null}
                        <Col span={12}>
                          <Form.Item
                            name="service_reenrollment_date"
                            label="Date of reenrollment"
                            getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                          >
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="medical_category" label="Medical category">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="discharge_cause" label="Cause of discharge">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="blood_group" label="Blood group">
                            <Input placeholder="e.g. A+, O-" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="civil_education_type" label="Civil education type">
                            <Select
                              allowClear
                              options={["Schooling", "Madrassa", "Misc"].map((v) => ({ label: v, value: v }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item name="civil_education_detail" label="Civil education detail (school/type)">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item name="original_doc_held" label="Original documents held">
                            <Input.TextArea rows={1} placeholder="Type here..." />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: "compliance",
                    label: "Compliance",
                    children: (
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item name="basic_security_training" label="Basic security training" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="agreement"
                            label={
                              <Space size={8}>
                                <span>Agreement</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("Agreement");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Doc
                                </Button>
                              </Space>
                            }
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="fire_safety_training" label="Fire safety training" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="first_aid_certification" label="First aid certification" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="guard_card" label="Guard card" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="police_clearance" label="Police clearance" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="fingerprint_check" label="Fingerprint check" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="background_screening" label="Background screening" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="reference_verification" label="Reference verification" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="security_clearance"
                            label={
                              <Space size={8}>
                                <span>Security clearance</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("Security clearance");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Doc
                                </Button>
                              </Space>
                            }
                          >
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: "family",
                    label: "Family",
                    children: (
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item name="sons_names" label="Sons names">
                            <Input.TextArea rows={1} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="daughters_names" label="Daughters names">
                            <Input.TextArea rows={1} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="brothers_names" label="Brothers names">
                            <Input.TextArea rows={1} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="sisters_names" label="Sisters names">
                            <Input.TextArea rows={1} />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: "verification",
                    label: "Verification & Signatures",
                    children: (
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item
                            name="particulars_verified_by_sho_on"
                            label={
                              <Space size={8}>
                                <span>Particulars verified by SHO on</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("SHO Verification");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Doc
                                </Button>
                              </Space>
                            }
                            getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                          >
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="particulars_verified_by_ssp_on"
                            label={
                              <Space size={8}>
                                <span>Particulars verified by SSP on</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("SSP Verification");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Doc
                                </Button>
                              </Space>
                            }
                            getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                          >
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="police_khidmat_verification_on"
                            label={
                              <Space size={8}>
                                <span>Police Khidmat verification on</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("Police Khidmat Verification");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Doc
                                </Button>
                              </Space>
                            }
                            getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                          >
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="signature_recording_officer" label="Signature of recording officer">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="signature_individual"
                            label={
                              <Space size={8}>
                                <span>Signature of individual</span>
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => {
                                    setActiveTabKey("documents");
                                    setDocName("Signature of individual");
                                    setTimeout(() => docFileInputRef.current?.click(), 0);
                                  }}
                                >
                                  Attach Doc
                                </Button>
                              </Space>
                            }
                          >
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="fss_number" label="FSSL">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="fss_name" label="FSSL name">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="fss_so" label="FSSL S/O">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="documents_handed_over_to" label="Documents handed over to">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="photo_on_document" label="Photo on document">
                            <Select allowClear options={["Yes", "No"].map((v) => ({ label: v, value: v }))} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="police_training_letter_date"
                            label="Police training letter date"
                            getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                          >
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="vaccination_certificate" label="Vaccination certificate">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="volume_no" label="Volume no">
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: "fingerprints",
                    label: "Fingerprints",
                    children: (
                      <>
                        <Row gutter={8}>
                          <Col span={12}>
                            <Form.Item name="fingerprint_attested_by" label="Fingerprints attested by">
                              <Input />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                          Upload one-by-one for each finger. These will be saved as documents.
                        </Typography.Text>
                        <Row gutter={8}>
                          {([
                            { key: "thumb", label: "Thumb" },
                            { key: "index", label: "Index" },
                            { key: "middle", label: "Middle" },
                            { key: "ring", label: "Ring" },
                            { key: "little", label: "Little" },
                          ] as const).map((f) => (
                            <Col span={12} key={f.key}>
                              <Card
                                size="small"
                                style={{ borderRadius: 12, background: "#fafafa" }}
                                styles={{ body: { padding: 8 } }}
                              >
                                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                  <Typography.Text strong>{f.label}</Typography.Text>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ maxWidth: "100%" }}
                                    onChange={(e) =>
                                      setFingerFiles((p) => ({ ...p, [f.key]: e.target.files?.[0] ?? null }))
                                    }
                                  />
                                  <Button
                                    type="primary"
                                    size="small"
                                    onClick={() => {
                                      const file = fingerFiles[f.key];
                                      if (!file) {
                                        msg.error("Please choose a file");
                                        return;
                                      }
                                      void uploadNamedDoc(null, `Fingerprint - ${f.label}`, file);
                                    }}
                                    loading={docsLoading}
                                  >
                                    Add
                                  </Button>
                                </Space>
                              </Card>
                            </Col>
                          ))}
                        </Row>
                      </>
                    ),
                  },
                  {
                    key: "payroll",
                    label: "Payroll",
                    children: (
                      <Row gutter={8}>
                        <Col span={8}>
                          <Form.Item name="basic_salary" label="Basic salary">
                            <Input placeholder="e.g. 50000" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="allowances" label="Allowances">
                            <Input placeholder="e.g. 5000" />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="total_salary" label="Total salary">
                            <Input placeholder="e.g. 55000" />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.List name="bank_accounts" initialValue={[{}]}>
                            {(fields, { add, remove }) => (
                              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                                  <Typography.Text strong>Bank accounts</Typography.Text>
                                  <Button size="small" onClick={() => add({})}>
                                    Add more
                                  </Button>
                                </Space>
                                {fields.map((field, idx) => (
                                  <Card key={field.key} size="small" style={{ borderRadius: 12 }}>
                                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                                        <Typography.Text strong>{`Bank #${idx + 1}`}</Typography.Text>
                                        {fields.length > 1 ? (
                                          <Button size="small" danger onClick={() => remove(field.name)}>
                                            Remove
                                          </Button>
                                        ) : null}
                                      </Space>
                                      <Row gutter={8}>
                                        <Col span={12}>
                                          <Form.Item name={[field.name, "bank_name"]} label="Bank name">
                                            <Input />
                                          </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                          <Form.Item name={[field.name, "account_number"]} label="Account number">
                                            <Input />
                                          </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                          <Form.Item name={[field.name, "account_type"]} label="Account type">
                                            <Input />
                                          </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                          <Form.Item name={[field.name, "tax_id"]} label="Tax ID">
                                            <Input />
                                          </Form.Item>
                                        </Col>
                                      </Row>
                                    </Space>
                                  </Card>
                                ))}
                              </Space>
                            )}
                          </Form.List>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="eobi_no" label="EOBI no">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="insurance" label="Insurance">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="social_security" label="Social security">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item name="payments" label="Payments">
                            <Input.TextArea rows={2} />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: "documents",
                    label: "Documents",
                    children: (
                      <>
                        <Row gutter={[8, 8]}>
                          <Col xs={24} md={12}>
                            <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 10 } }}>
                              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                <Typography.Text strong>Upload Document</Typography.Text>
                                <Input
                                  value={docName}
                                  onChange={(e) => setDocName(e.target.value)}
                                  placeholder="Document name (your choice)"
                                />
                                <input
                                  ref={docFileInputRef}
                                  type="file"
                                  style={{ display: "none" }}
                                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                                />
                                <Space>
                                  <Button size="small" onClick={() => docFileInputRef.current?.click()}>
                                    Choose file
                                  </Button>
                                  <Typography.Text type="secondary">
                                    {docFile ? docFile.name : "No file selected"}
                                  </Typography.Text>
                                </Space>
                                <Button
                                  type="primary"
                                  size="small"
                                  onClick={() => void uploadDocument()}
                                  loading={docsLoading}
                                >
                                  Add
                                </Button>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                  You can upload PDF, images, or any other file.
                                </Typography.Text>
                                {pendingDocs.length ? (
                                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    Pending documents will upload after you save the employee.
                                  </Typography.Text>
                                ) : null}
                              </Space>
                            </Card>
                          </Col>

                          <Col xs={24} md={12}>
                            <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 10 } }}>
                              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                <Typography.Text strong>Pending Documents</Typography.Text>
                                {docsLoading ? (
                                  <Spin />
                                ) : pendingDocs.length === 0 ? (
                                  <Typography.Text type="secondary">No pending documents.</Typography.Text>
                                ) : (
                                  <List
                                    dataSource={pendingDocs}
                                    renderItem={(d) => (
                                      <List.Item>
                                        <List.Item.Meta
                                          title={d.name}
                                          description={<Typography.Text type="secondary">{d.file.name}</Typography.Text>}
                                        />
                                      </List.Item>
                                    )}
                                  />
                                )}
                              </Space>
                            </Card>
                          </Col>
                        </Row>

                        {docsList.length ? (
                          <Card size="small" style={{ borderRadius: 12, marginTop: 8 }} styles={{ body: { padding: 10 } }}>
                            <Space direction="vertical" size={6} style={{ width: "100%" }}>
                              <Typography.Text strong>Uploaded (after save)</Typography.Text>
                              <List
                                dataSource={docsList}
                                renderItem={(d: EmployeeDocumentOut & { _absUrl: string }) => (
                                  <List.Item
                                    actions={[
                                      <a key="open" href={d._absUrl} target="_blank" rel="noopener noreferrer">
                                        Open
                                      </a>,
                                      <a key="download" href={d._absUrl} download={d.filename || "document"}>
                                        Download
                                      </a>,
                                    ]}
                                  >
                                    <List.Item.Meta
                                      title={d.name}
                                      description={
                                        <Typography.Text type="secondary">
                                          {d.filename} {d.mime_type ? `• ${d.mime_type}` : ""}
                                        </Typography.Text>
                                      }
                                    />
                                  </List.Item>
                                )}
                              />
                            </Space>
                          </Card>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    key: "warnings",
                    label: "Warnings",
                    children: (
                      <>
                        <Space direction="vertical" size={10} style={{ width: "100%" }}>
                          <Space style={{ width: "100%", justifyContent: "space-between" }}>
                            <Typography.Text strong>Warnings ({warningsDraft.length}/3)</Typography.Text>
                            <Button size="small" onClick={() => openWarningModal()}>
                              Add Warning
                            </Button>
                          </Space>

                          {warningsDraft.length === 0 ? (
                            <Typography.Text type="secondary">No warnings added.</Typography.Text>
                          ) : (
                            <Space direction="vertical" size={10} style={{ width: "100%" }}>
                              {warningsDraft.map((w, idx) => (
                                <Card key={idx} size="small" style={{ borderRadius: 12 }}>
                                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                                      <Typography.Text strong>{w.warning_number}</Typography.Text>
                                      <Button size="small" danger onClick={() => setWarningsDraft((p) => p.filter((_, i) => i !== idx))}>
                                        Remove
                                      </Button>
                                    </Space>

                                    <Typography.Text>You were found: {w.found_with || "-"}</Typography.Text>

                                    <Typography.Text>
                                      {(w.notice_text || defaultWarningNoticeText).trim()}
                                    </Typography.Text>

                                    {w.supervisor_signature ? (
                                      <Typography.Text type="secondary">Signature: {w.supervisor_signature}</Typography.Text>
                                    ) : null}
                                    {w.supervisor_signature_date ? (
                                      <Typography.Text type="secondary">Dated: {w.supervisor_signature_date}</Typography.Text>
                                    ) : null}

                                    {w.files?.length ? (
                                      <Typography.Text type="secondary">Attachment: {w.files[0]?.name}</Typography.Text>
                                    ) : (
                                      <Typography.Text type="secondary">No attachment selected.</Typography.Text>
                                    )}
                                  </Space>
                                </Card>
                              ))}
                            </Space>
                          )}
                        </Space>

                        <Modal
                          open={warningModalOpen}
                          title="WARNING"
                          onCancel={() => setWarningModalOpen(false)}
                          onOk={() => void submitWarningModal()}
                          okText="Add"
                          destroyOnClose
                        >
                          <Form form={warningForm} layout="vertical" size="small" preserve={false}>
                            <Row gutter={12}>
                              <Col span={12}>
                                <Typography.Text strong>1. FSSL</Typography.Text>
                                <div>
                                  <Typography.Text>{(form.getFieldValue("fss_number") as string) || "-"}</Typography.Text>
                                </div>
                              </Col>
                              <Col span={12}>
                                <Typography.Text strong>Supv/Guard</Typography.Text>
                                <div>
                                  <Typography.Text>
                                    {(form.getFieldValue("full_name") as string) || "-"}
                                  </Typography.Text>
                                </div>
                              </Col>
                            </Row>

                            <Divider style={{ margin: "8px 0" }} />

                            <Form.Item name="warning_number" label="Warning Level" rules={[{ required: true }]}>
                              <Radio.Group
                                options={[
                                  { label: "FIRST", value: "FIRST" },
                                  { label: "SECOND", value: "SECOND" },
                                  { label: "THIRD", value: "THIRD" },
                                ]}
                                optionType="button"
                                buttonStyle="solid"
                              />
                            </Form.Item>

                            <Form.Item
                              name="found_with"
                              label="You were found:"
                              rules={[{ required: true, message: "Please enter what the guard was found with" }]}
                            >
                              <Input.TextArea rows={3} placeholder="Enter details..." />
                            </Form.Item>

                            <Form.Item name="notice_text" label="Notice text (editable)">
                              <Input.TextArea rows={3} placeholder="Optional" />
                            </Form.Item>

                            <Card size="small" style={{ borderRadius: 12, background: "#fafafa" }}>
                              <Typography.Text>
                                2. {((warningForm.getFieldValue("notice_text") as string) || defaultWarningNoticeText).trim()}
                              </Typography.Text>
                            </Card>

                            <Divider style={{ margin: "8px 0" }} />

                            <Form.Item name="supervisor_signature" label="Signature of Supv/Guard">
                              <Input placeholder="Name / signature" />
                            </Form.Item>

                            <Form.Item
                              name="supervisor_signature_date"
                              label="Dated"
                              getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
                            >
                              <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                            </Form.Item>

                            <Form.Item label="Signature attachment">
                              <input
                                type="file"
                                onChange={(e) => {
                                  setWarningSignatureFile(e.target.files?.[0] ?? null);
                                  e.currentTarget.value = "";
                                }}
                              />
                            </Form.Item>
                          </Form>
                        </Modal>
                      </>
                    ),
                  },
                ]}
              />
            </div>
          </Form>
        </Card>
      </div>
    </>
  );
}
