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
  Popconfirm,
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
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";
import { api } from "@/lib/api";
import type {
  Employee,
  EmployeeDocumentOut,
  EmployeeUpdate,
  EmployeeWarning,
  EmployeeWarningDocumentOut,
} from "@/lib/types";

type DateFieldKeys =
  | "date_of_birth"
  | "cnic_expiry_date"
  | "particulars_verified_by_sho_on"
  | "particulars_verified_by_ssp_on"
  | "police_khidmat_verification_on"
  | "service_enrollment_date"
  | "service_reenrollment_date";

type FormValues = Omit<EmployeeUpdate, DateFieldKeys> & {
  date_of_birth?: dayjs.Dayjs | null;
  cnic_expiry_date?: dayjs.Dayjs | null;
  particulars_verified_by_sho_on?: dayjs.Dayjs | null;
  particulars_verified_by_ssp_on?: dayjs.Dayjs | null;
  police_khidmat_verification_on?: dayjs.Dayjs | null;
  service_enrollment_date?: dayjs.Dayjs | null;
  service_reenrollment_date?: dayjs.Dayjs | null;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function fileExt(name: string): string {
  const s = (name || "").toLowerCase();
  const i = s.lastIndexOf(".");
  return i >= 0 ? s.slice(i + 1) : "";
}

function isImageExt(ext: string): boolean {
  return ["png", "jpg", "jpeg", "webp"].includes(ext);
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return await res.arrayBuffer();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function EmployeeEditPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();
  const params = useParams<{ employee_id: string }>();
  const employeeId = decodeURIComponent(String(params?.employee_id || ""));

  const roleOptions = ["Supervisor", "Guard", "Driver", "Cook", "Sweeper"];
  const retiredFromOptions = ["Army", "Navy", "PAF", "Police", "FC", "MJ"];

  const defaultWarningNoticeText =
    "You are order to improve your conduct in future, otherwise strict action would be taken against you. Your services would be terminated automatically on third warning.";

  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [activeTabKey, setActiveTabKey] = useState(
    "basic" as
      | "basic"
      | "job"
      | "languages"
      | "contact"
      | "service"
      | "compliance"
      | "family"
      | "verification"
      | "fingerprints"
      | "payroll"
      | "warnings"
      | "documents"
  );

  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<EmployeeDocumentOut[]>([]);
  const [docName, setDocName] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);

  const [serviceEnrollmentMode, setServiceEnrollmentMode] = useState<"today" | "manual">("manual");
  const [fingerFiles, setFingerFiles] = useState<Record<string, File | null>>({
    thumb: null,
    index: null,
    middle: null,
    ring: null,
    little: null,
  });

  const [warningsLoading, setWarningsLoading] = useState(false);
  const [warnings, setWarnings] = useState<EmployeeWarning[]>([]);
  const [warningDocsLoading, setWarningDocsLoading] = useState<Record<number, boolean>>({});
  const [warningDocs, setWarningDocs] = useState<Record<number, EmployeeWarningDocumentOut[]>>({});

  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningForm] = Form.useForm<{
    warning_number: string;
    found_with: string;
    notice_text?: string;
    supervisor_signature?: string;
    supervisor_signature_date?: dayjs.Dayjs | null;
  }>();
  const [warningSignatureFile, setWarningSignatureFile] = useState<File | null>(null);

  const docsList = useMemo(() => {
    const base = API_BASE_URL || "";
    return (docs ?? []).map((d) => ({ ...d, _absUrl: d.url.startsWith("http") ? d.url : `${base}${d.url}` }));
  }, [docs]);

  const warningDocsList = useMemo(() => {
    const base = API_BASE_URL || "";
    const out: Record<number, Array<EmployeeWarningDocumentOut & { _absUrl: string }>> = {};
    Object.entries(warningDocs ?? {}).forEach(([k, arr]) => {
      const id = Number(k);
      out[id] = (arr ?? []).map((d) => ({ ...d, _absUrl: d.url.startsWith("http") ? d.url : `${base}${d.url}` }));
    });
    return out;
  }, [warningDocs]);

  const exportWarningAsPdf = useCallback(
    async (w: EmployeeWarning) => {
      const warningId = Number(w.id);
      if (!warningId) return;

      try {
        const baseDoc = await PDFDocument.create();
        const font = await baseDoc.embedFont(StandardFonts.Helvetica);
        const bold = await baseDoc.embedFont(StandardFonts.HelveticaBold);

        const page = baseDoc.addPage([595.28, 841.89]);
        const { width, height } = page.getSize();
        let y = height - 48;

        const drawLine = (label: string, value: string, isTitle?: boolean) => {
          const left = 56;
          const right = width - 56;
          const text = `${label}${label ? ": " : ""}${value}`;
          page.drawText(text, {
            x: left,
            y,
            size: isTitle ? 16 : 11,
            font: isTitle ? bold : font,
            color: rgb(0, 0, 0),
            maxWidth: right - left,
          });
          y -= isTitle ? 22 : 16;
        };

        drawLine("", "EMPLOYEE WARNING", true);
        y -= 6;
        drawLine("Employee", employee ? `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() : "-");
        drawLine("Employee ID", String(employee?.employee_id || "-"));
        drawLine("FSS#", String((employee as any)?.fss_number || "-"));
        y -= 6;
        drawLine("Warning", String(w.warning_number || "-"));
        drawLine("Found with", String(w.found_with || "-"));
        drawLine("Supervisor signature", String((w as any).supervisor_signature || "-"));
        drawLine("Signature date", String((w as any).supervisor_signature_date || "-"));

        const docsForWarning = warningDocsList[warningId] || [];
        if (docsForWarning.length) {
          y -= 10;
          drawLine("", "Attached documents are:", true);
          const left = 56;
          const right = width - 56;
          for (let i = 0; i < docsForWarning.length; i++) {
            const d = docsForWarning[i];
            const name = d.filename || d.url;
            const when = d.created_at ? ` (${String(d.created_at)})` : "";
            const line = `${i + 1}. ${name}${when}`;
            page.drawText(line, { x: left, y, size: 10, font, color: rgb(0, 0, 0), maxWidth: right - left });
            y -= 14;
          }
        }

        for (const d of docsForWarning) {
          const url = d._absUrl || d.url;
          const name = d.filename || d.url;
          const ext = fileExt(name);

          if (ext === "pdf") {
            const ab = await fetchArrayBuffer(url);
            const src = await PDFDocument.load(ab);
            const pages = await baseDoc.copyPages(src, src.getPageIndices());
            pages.forEach((p) => baseDoc.addPage(p));
            continue;
          }

          if (isImageExt(ext)) {
            const ab = await fetchArrayBuffer(url);
            const img = ext === "png" ? await baseDoc.embedPng(ab) : await baseDoc.embedJpg(ab);
            const p = baseDoc.addPage([595.28, 841.89]);
            const margin = 56;
            const maxW = 595.28 - margin * 2;
            const maxH = 841.89 - margin * 2;
            const scale = Math.min(maxW / img.width, maxH / img.height);
            const wScaled = img.width * scale;
            const hScaled = img.height * scale;
            const x = (595.28 - wScaled) / 2;
            const yImg = (841.89 - hScaled) / 2;
            p.drawText(`Attachment: ${name}`, { x: margin, y: 841.89 - 34, size: 11, font, color: rgb(0, 0, 0) });
            p.drawImage(img, { x, y: yImg, width: wScaled, height: hScaled });
            continue;
          }

          const p = baseDoc.addPage([595.28, 841.89]);
          p.drawText(`Attachment: ${name}`, { x: 56, y: 780, size: 12, font: bold, color: rgb(0, 0, 0) });
          p.drawText(String(url), { x: 56, y: 760, size: 9, font, color: rgb(0, 0, 0), maxWidth: 595.28 - 112 });
        }

        const bytes = await baseDoc.save();
        downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${String(employee?.employee_id || "employee")}-warning-${String(w.warning_number || warningId)}.pdf`);
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to export PDF"));
      }
    },
    [employee, msg, warningDocsList]
  );

  const loadEmployee = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const e = await api.get<Employee>(`/api/employees/${encodeURIComponent(employeeId)}`);
      setEmployee(e);

      const fullName = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
      const bankAccountsInit = Array.isArray((e as any).bank_accounts)
        ? ((e as any).bank_accounts as Array<Record<string, unknown>>)
        : e.bank_name || e.account_number || e.account_type || e.tax_id
          ? [
              {
                bank_name: e.bank_name ?? undefined,
                account_number: e.account_number ?? undefined,
                ifsc_code: (e as any).ifsc_code ?? undefined,
                account_type: e.account_type ?? undefined,
                tax_id: e.tax_id ?? undefined,
              },
            ]
          : [{}];

      const safe: FormValues = {
        ...(e as unknown as FormValues),
        ...( { full_name: fullName, bank_accounts: bankAccountsInit } as any ),
        languages_spoken: (e as any).languages_spoken ?? undefined,
        retired_from: (e as any).retired_from ?? undefined,
        date_of_birth: e.date_of_birth ? dayjs(e.date_of_birth) : undefined,
        cnic_expiry_date: e.cnic_expiry_date ? dayjs(e.cnic_expiry_date) : undefined,
        particulars_verified_by_sho_on: (e as any).particulars_verified_by_sho_on ? dayjs((e as any).particulars_verified_by_sho_on) : undefined,
        particulars_verified_by_ssp_on: (e as any).particulars_verified_by_ssp_on ? dayjs((e as any).particulars_verified_by_ssp_on) : undefined,
        police_khidmat_verification_on: (e as any).police_khidmat_verification_on ? dayjs((e as any).police_khidmat_verification_on) : undefined,
      };
      form.setFieldsValue(safe);
    } catch (e: unknown) {
      setEmployee(null);
      msg.error(errorMessage(e, "Failed to load employee"));
    } finally {
      setLoading(false);
    }
  }, [employeeId, form, msg]);

  const loadDocuments = useCallback(async () => {
    const employeeDbId = Number(employee?.id);
    if (!employeeDbId) return;
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
  }, [employee?.id, msg]);

  const loadWarnings = useCallback(async () => {
    const employeeDbId = Number(employee?.id);
    if (!employeeDbId) return;
    setWarningsLoading(true);
    try {
      const res = await api.get<EmployeeWarning[]>(`/api/employees/by-db-id/${employeeDbId}/warnings`);
      setWarnings(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      setWarnings([]);
      msg.error(errorMessage(e, "Failed to load employee warnings"));
    } finally {
      setWarningsLoading(false);
    }
  }, [employee?.id, msg]);

  const loadWarningDocuments = useCallback(
    async (warningId: number) => {
      if (!warningId) return;
      setWarningDocsLoading((p) => ({ ...p, [warningId]: true }));
      try {
        const res = await api.get<EmployeeWarningDocumentOut[]>(`/api/employees/warnings/${warningId}/documents`);
        setWarningDocs((p) => ({ ...p, [warningId]: Array.isArray(res) ? res : [] }));
      } catch (e: unknown) {
        setWarningDocs((p) => ({ ...p, [warningId]: [] }));
        msg.error(errorMessage(e, "Failed to load warning documents"));
      } finally {
        setWarningDocsLoading((p) => ({ ...p, [warningId]: false }));
      }
    },
    [msg]
  );

  const uploadWarningFiles = useCallback(
    async (warningId: number, files: File[]) => {
      if (!warningId || !files.length) return;
      setWarningDocsLoading((p) => ({ ...p, [warningId]: true }));
      try {
        for (const file of files) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(`${API_BASE_URL}/api/employees/warnings/${warningId}/documents`, {
            method: "POST",
            body: fd,
          });
          if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        }
        await loadWarningDocuments(warningId);
        msg.success("Uploaded");
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Upload failed"));
      } finally {
        setWarningDocsLoading((p) => ({ ...p, [warningId]: false }));
      }
    },
    [loadWarningDocuments, msg]
  );

  const deleteWarningDocument = useCallback(
    async (warningId: number, docId: number) => {
      setWarningDocsLoading((p) => ({ ...p, [warningId]: true }));
      try {
        await api.del(`/api/employees/warnings/${warningId}/documents/${docId}`);
        await loadWarningDocuments(warningId);
        msg.success("Deleted");
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Delete failed"));
      } finally {
        setWarningDocsLoading((p) => ({ ...p, [warningId]: false }));
      }
    },
    [loadWarningDocuments, msg]
  );

  const deleteWarning = useCallback(
    async (warningId: number) => {
      const employeeDbId = Number(employee?.id);
      if (!employeeDbId) return;
      setWarningsLoading(true);
      try {
        await api.del(`/api/employees/by-db-id/${employeeDbId}/warnings/${warningId}`);
        setWarningDocs((p) => {
          const cp = { ...p };
          delete cp[warningId];
          return cp;
        });
        await loadWarnings();
        msg.success("Warning deleted");
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to delete warning"));
      } finally {
        setWarningsLoading(false);
      }
    },
    [employee?.id, loadWarnings, msg]
  );

  const uploadDocument = useCallback(async () => {
    const employeeDbId = Number(employee?.id);
    if (!employeeDbId) return;
    if (!docFile) return msg.error("Please choose a file");
    if (!docName.trim()) return msg.error("Please enter document name");

    setDocsLoading(true);
    try {
      const fd = new FormData();
      fd.append("name", docName.trim());
      fd.append("file", docFile);
      const res = await fetch(`${API_BASE_URL}/api/employees/by-db-id/${employeeDbId}/documents`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      setDocName("");
      setDocFile(null);
      msg.success("Uploaded");
      await loadDocuments();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Upload failed"));
    } finally {
      setDocsLoading(false);
    }
  }, [docFile, docName, employee?.id, loadDocuments, msg]);

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
        msg.error("Save employee first");
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
        await loadDocuments();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Upload failed"));
      } finally {
        setDocsLoading(false);
      }
    },
    [loadDocuments, msg]
  );

  const attachDoc = useCallback((name: string) => {
    setActiveTabKey("documents");
    setDocName(name);
    setTimeout(() => docFileInputRef.current?.click(), 0);
  }, []);

  const openWarningModal = useCallback(() => {
    if (!employee?.id) {
      msg.error("Save employee first");
      return;
    }
    if (warnings.length >= 3) {
      msg.error("Maximum 3 warnings allowed");
      return;
    }
    const level = warnings.length === 0 ? "FIRST" : warnings.length === 1 ? "SECOND" : "THIRD";
    warningForm.resetFields();
    warningForm.setFieldsValue({ warning_number: level, found_with: "", notice_text: defaultWarningNoticeText } as any);
    setWarningSignatureFile(null);
    setWarningModalOpen(true);
  }, [defaultWarningNoticeText, employee?.id, msg, warningForm, warnings.length]);

  const submitWarningModal = useCallback(async () => {
    if (!employee?.id) return;
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

    setWarningsLoading(true);
    try {
      const created = await api.post<EmployeeWarning>(`/api/employees/by-db-id/${employee.id}/warnings`, {
        warning_number: warningNumber,
        found_with: foundWith,
        notice_text: noticeText || undefined,
        supervisor_signature: (values.supervisor_signature || "").trim() || undefined,
        supervisor_signature_date:
          values.supervisor_signature_date && dayjs.isDayjs(values.supervisor_signature_date)
            ? values.supervisor_signature_date.format("YYYY-MM-DD")
            : undefined,
      });

      const warningId = Number(created?.id);
      if (warningId && warningSignatureFile) {
        await uploadWarningFiles(warningId, [warningSignatureFile]);
      }

      setWarningModalOpen(false);
      await loadWarnings();
      if (warningId) {
        await loadWarningDocuments(warningId);
      }
      msg.success("Warning added");
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to add warning"));
    } finally {
      setWarningsLoading(false);
    }
  }, [employee?.id, loadWarningDocuments, loadWarnings, msg, uploadWarningFiles, warningForm, warningSignatureFile]);

  const onSubmit = useCallback(async () => {
    if (!employeeId) return;
    const v = await form.validateFields();

    const fullNameRaw = String((v as unknown as { full_name?: unknown }).full_name ?? "").trim();
    const nameParts = fullNameRaw.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "-";

    const bankAccounts = Array.isArray((v as unknown as { bank_accounts?: unknown }).bank_accounts)
      ? ((v as unknown as { bank_accounts?: Array<Record<string, unknown>> }).bank_accounts ?? [])
      : [];
    const firstBank = bankAccounts[0] ?? {};

    const payload: EmployeeUpdate = {
      ...(v as EmployeeUpdate),
      first_name: firstName,
      last_name: lastName,
      bank_accounts: bankAccounts.length ? (bankAccounts as any) : undefined,
      bank_name: typeof firstBank.bank_name === "string" ? firstBank.bank_name : undefined,
      account_number: typeof firstBank.account_number === "string" ? firstBank.account_number : undefined,
      ifsc_code: typeof firstBank.ifsc_code === "string" ? firstBank.ifsc_code : undefined,
      account_type: typeof firstBank.account_type === "string" ? firstBank.account_type : undefined,
      tax_id: typeof firstBank.tax_id === "string" ? firstBank.tax_id : undefined,
      date_of_birth: v.date_of_birth && dayjs.isDayjs(v.date_of_birth) ? v.date_of_birth.format("YYYY-MM-DD") : (v.date_of_birth as any),
      cnic_expiry_date: v.cnic_expiry_date && dayjs.isDayjs(v.cnic_expiry_date) ? v.cnic_expiry_date.format("YYYY-MM-DD") : (v.cnic_expiry_date as any),
      particulars_verified_by_sho_on:
        v.particulars_verified_by_sho_on && dayjs.isDayjs(v.particulars_verified_by_sho_on)
          ? v.particulars_verified_by_sho_on.format("YYYY-MM-DD")
          : (v.particulars_verified_by_sho_on as any),
      particulars_verified_by_ssp_on:
        v.particulars_verified_by_ssp_on && dayjs.isDayjs(v.particulars_verified_by_ssp_on)
          ? v.particulars_verified_by_ssp_on.format("YYYY-MM-DD")
          : (v.particulars_verified_by_ssp_on as any),
      police_khidmat_verification_on:
        v.police_khidmat_verification_on && dayjs.isDayjs(v.police_khidmat_verification_on)
          ? v.police_khidmat_verification_on.format("YYYY-MM-DD")
          : (v.police_khidmat_verification_on as any),
      police_training_letter_date:
        (v as any).police_training_letter_date && dayjs.isDayjs((v as any).police_training_letter_date)
          ? (v as any).police_training_letter_date.format("YYYY-MM-DD")
          : ((v as any).police_training_letter_date as any),
    };

    setSaving(true);
    try {
      await api.put<Employee>(`/api/employees/${encodeURIComponent(employeeId)}`, payload);
      msg.success("Employee updated");
      router.push(`/employees/${encodeURIComponent(employeeId)}`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  }, [employeeId, form, msg, router]);

  useEffect(() => {
    void loadEmployee();
  }, [loadEmployee]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadWarnings();
  }, [loadWarnings]);

  useEffect(() => {
    warnings.forEach((w) => {
      const id = Number(w.id);
      if (!id) return;
      if (!warningDocs[id]) {
        void loadWarningDocuments(id);
      }
    });
  }, [loadWarningDocuments, warningDocs, warnings]);

  return (
    <>
      {msgCtx}
      <div style={{ width: "100%", maxWidth: 1350, margin: "0 auto", paddingLeft: 12, paddingRight: 12 }}>
        <Card
          title={<Typography.Title level={4} style={{ margin: 0 }}>Edit Employee</Typography.Title>}
          extra={
            <Space>
              <Button onClick={() => router.push("/employees")}>Back</Button>
              <Button type="primary" loading={saving} onClick={() => void onSubmit()}>
                Save
              </Button>
            </Space>
          }
          style={{ borderRadius: 12, width: "100%" }}
          styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}
        >
          {loading ? (
            <Spin />
          ) : !employee ? (
            <Typography.Text type="secondary">Employee not found.</Typography.Text>
          ) : (
            <Form form={form} layout="vertical" size="small">
              <Tabs
                size="small"
                activeKey={activeTabKey}
                onChange={(k) => setActiveTabKey(k)}
                items={[
                  {
                    key: "basic",
                    label: "Basic",
                    children: (
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item name="full_name" label="Full name" rules={[{ required: true }]}>
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="mobile_number" label="Personal phone number">
                            <Input />
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
                          <Form.Item name="cnic" label={
                            <Space size={8}>
                              <span>CNIC</span>
                              <Button size="small" type="link" onClick={() => attachDoc("CNIC")}>Attach Doc</Button>
                            </Space>
                          }>
                            <Input placeholder="xxxxx-xxxxxxx-x" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="domicile" label={
                            <Space size={8}>
                              <span>Domicile</span>
                              <Button size="small" type="link" onClick={() => attachDoc("Domicile")}>Attach Doc</Button>
                            </Space>
                          }>
                            <Input placeholder="e.g. Punjab" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="height_cm" label="Height (cm)">
                            <InputNumber min={0} style={{ width: "100%" }} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="cnic_expiry_date" label="CNIC Expiry" getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}>
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
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
                    key: "languages",
                    label: "Languages",
                    children: (
                      <Row gutter={8}>
                        <Col span={24}>
                          <Form.Item name="languages_spoken" label="Languages spoken">
                            <Select
                              mode="tags"
                              allowClear
                              placeholder="Type and press enter"
                              options={["Urdu", "English", "Punjabi", "Pashto", "Sindhi", "Balochi"].map((v) => ({ label: v, value: v }))}
                            />
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
                          <Form.Item name="retired_from" label={
                            <Space size={8}>
                              <span>Retired from</span>
                              <Button size="small" type="link" onClick={() => attachDoc("Retirement book")}>Attach Retirement book</Button>
                            </Space>
                          }>
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
                            <Select allowClear options={["Schooling", "Madrassa", "Misc"].map((v) => ({ label: v, value: v }))} />
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
                                <Button size="small" type="link" onClick={() => attachDoc("Agreement")}>Attach Doc</Button>
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
                                <Button size="small" type="link" onClick={() => attachDoc("Security clearance")}>Attach Doc</Button>
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
                                <Button size="small" type="link" onClick={() => attachDoc("SHO Verification")}>Attach Doc</Button>
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
                                <Button size="small" type="link" onClick={() => attachDoc("SSP Verification")}>Attach Doc</Button>
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
                                <Button size="small" type="link" onClick={() => attachDoc("Police Khidmat Verification")}>Attach Doc</Button>
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
                                <Button size="small" type="link" onClick={() => attachDoc("Signature of individual")}>Attach Doc</Button>
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
                              <Card size="small" style={{ borderRadius: 12, background: "#fafafa" }} styles={{ body: { padding: 8 } }}>
                                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                  <Typography.Text strong>{f.label}</Typography.Text>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ maxWidth: "100%" }}
                                    onChange={(e) => setFingerFiles((p) => ({ ...p, [f.key]: e.target.files?.[0] ?? null }))}
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
                                      void uploadNamedDoc(Number(employee?.id) || null, `Fingerprint - ${f.label}`, file);
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
                    key: "warnings",
                    label: "Warnings",
                    children: (
                      <Space direction="vertical" size={10} style={{ width: "100%" }}>
                        <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 10 } }}>
                          <Space style={{ width: "100%", justifyContent: "space-between" }}>
                            <Typography.Text strong>Add Warning ({warnings.length}/3)</Typography.Text>
                            <Button type="primary" size="small" onClick={() => openWarningModal()} loading={warningsLoading}>
                              Add
                            </Button>
                          </Space>
                        </Card>

                        {warningsLoading ? (
                          <Spin />
                        ) : warnings.length === 0 ? (
                          <Typography.Text type="secondary">No warnings.</Typography.Text>
                        ) : (
                          <Space direction="vertical" size={10} style={{ width: "100%" }}>
                            {warnings.map((w) => {
                              const warningId = Number(w.id);
                              const docsForWarning = warningDocsList[warningId] || [];
                              const docsLoadingForWarning = !!warningDocsLoading[warningId];

                              return (
                                <Card
                                  key={warningId}
                                  size="small"
                                  style={{ borderRadius: 12 }}
                                  title={`Warning: ${w.warning_number || "-"}`}
                                  extra={
                                    <Space size={8}>
                                      <Button size="small" onClick={() => void exportWarningAsPdf(w)} loading={docsLoadingForWarning}>
                                        Export PDF
                                      </Button>
                                      <Popconfirm title="Delete warning?" onConfirm={() => void deleteWarning(warningId)}>
                                        <Button danger size="small">Delete</Button>
                                      </Popconfirm>
                                    </Space>
                                  }
                                >
                                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                                    <Typography.Text strong>Found with</Typography.Text>
                                    <Typography.Text>{w.found_with || "-"}</Typography.Text>

                                    <Typography.Text strong>Notice</Typography.Text>
                                    <Typography.Text>{(w.notice_text || defaultWarningNoticeText).trim()}</Typography.Text>

                                    <Row gutter={8}>
                                      <Col span={12}>
                                        <Typography.Text type="secondary">Supervisor signature</Typography.Text>
                                        <div><Typography.Text>{w.supervisor_signature || "-"}</Typography.Text></div>
                                      </Col>
                                      <Col span={12}>
                                        <Typography.Text type="secondary">Signature date</Typography.Text>
                                        <div><Typography.Text>{w.supervisor_signature_date || "-"}</Typography.Text></div>
                                      </Col>
                                    </Row>

                                    <Divider style={{ margin: "6px 0" }} />

                                    <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                      <Typography.Text strong>Attachments</Typography.Text>
                                      <input
                                        type="file"
                                        onChange={(e) => {
                                          const files = Array.from(e.target.files || []);
                                          e.currentTarget.value = "";
                                          void uploadWarningFiles(warningId, files);
                                        }}
                                      />
                                      {docsLoadingForWarning ? (
                                        <Spin />
                                      ) : docsForWarning.length === 0 ? (
                                        <Typography.Text type="secondary">No attachments.</Typography.Text>
                                      ) : (
                                        <List
                                          size="small"
                                          dataSource={docsForWarning}
                                          renderItem={(d) => (
                                            <List.Item
                                              actions={[
                                                <a key="open" href={d._absUrl} target="_blank" rel="noopener noreferrer">Open</a>,
                                                <a key="download" href={d._absUrl} download={d.filename || "document"}>Download</a>,
                                                <Popconfirm
                                                  key="del"
                                                  title="Delete attachment?"
                                                  onConfirm={() => void deleteWarningDocument(warningId, Number(d.id))}
                                                >
                                                  <Button danger size="small">Delete</Button>
                                                </Popconfirm>,
                                              ]}
                                            >
                                              <List.Item.Meta title={d.filename || d.url} description={<Typography.Text type="secondary">{d.created_at || ""}</Typography.Text>} />
                                            </List.Item>
                                          )}
                                        />
                                      )}
                                    </Space>
                                  </Space>
                                </Card>
                              );
                            })}
                          </Space>
                        )}
                      </Space>
                    ),
                  },
                  {
                    key: "documents",
                    label: "Documents",
                    children: (
                      <Space direction="vertical" size={10} style={{ width: "100%" }}>
                        <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 10 } }}>
                          <Space direction="vertical" size={6} style={{ width: "100%" }}>
                            <Typography.Text strong>Upload</Typography.Text>
                            <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Document name" />
                            <input
                              ref={docFileInputRef}
                              type="file"
                              onChange={(e) => {
                                setDocFile(e.target.files?.[0] ?? null);
                                e.currentTarget.value = "";
                              }}
                            />
                            <Button type="primary" size="small" loading={docsLoading} onClick={() => void uploadDocument()}>
                              Upload
                            </Button>
                          </Space>
                        </Card>

                        {docsLoading ? (
                          <Spin />
                        ) : docsList.length === 0 ? (
                          <Typography.Text type="secondary">No documents.</Typography.Text>
                        ) : (
                          <List
                            size="small"
                            dataSource={docsList}
                            renderItem={(d) => (
                              <List.Item
                                actions={[
                                  <a key="open" href={d._absUrl} target="_blank" rel="noopener noreferrer">Open</a>,
                                  <a key="download" href={d._absUrl} download={d.filename || "document"}>Download</a>,
                                ]}
                              >
                                <List.Item.Meta title={d.name} description={<Typography.Text type="secondary">{d.filename}</Typography.Text>} />
                              </List.Item>
                            )}
                          />
                        )}
                      </Space>
                    ),
                  },
                ]}
              />
            </Form>
          )}
        </Card>
      </div>

      <Modal
        open={warningModalOpen}
        onCancel={() => setWarningModalOpen(false)}
        title="Employee Warning Form"
        okText="Submit"
        onOk={() => void submitWarningModal()}
        okButtonProps={{ loading: warningsLoading }}
        width={920}
        destroyOnClose
      >
        <Form form={warningForm} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={12}>
              <Typography.Text type="secondary" style={{ display: "block" }}>
                FSSL
              </Typography.Text>
              <Typography.Text strong>{employee?.fss_number || "-"}</Typography.Text>
            </Col>
            <Col span={12}>
              <Typography.Text type="secondary" style={{ display: "block" }}>
                Name
              </Typography.Text>
              <Typography.Text strong>{(form.getFieldValue("full_name") as string) || "-"}</Typography.Text>
            </Col>
          </Row>

          <Divider style={{ margin: "10px 0" }} />

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="warning_number" label="Warning level" rules={[{ required: true }]}>
                <Radio.Group>
                  <Radio value="FIRST">FIRST WARNING</Radio>
                  <Radio value="SECOND">SECOND WARNING</Radio>
                  <Radio value="THIRD">THIRD WARNING</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="found_with"
            label="Guard found with"
            rules={[{ required: true, message: "Please enter what the guard was found with" }]}
          >
            <Input.TextArea rows={3} placeholder="e.g. found with mobile on duty / sleeping / etc." />
          </Form.Item>

          <Form.Item name="notice_text" label="Notice text (editable)">
            <Input.TextArea rows={3} placeholder="Optional" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="supervisor_signature" label="Supervisor signature (name)">
                <Input placeholder="Supervisor name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supervisor_signature_date" label="Supervisor signature date" getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}>
                <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Supervisor signature attachment">
            <input
              type="file"
              onChange={(e) => {
                setWarningSignatureFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
            />
            <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
              Upload a photo/scan of the signature.
            </Typography.Text>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
