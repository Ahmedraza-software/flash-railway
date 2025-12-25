"use client";

import {
  Button,
  Card,
  Col,
  Divider,
  message,
  Row,
  Space,
  Spin,
  Tabs,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";
import { api } from "@/lib/api";
import type { Employee, EmployeeDocumentOut, EmployeeWarning, EmployeeWarningDocumentOut } from "@/lib/types";

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function fullName(e: Employee): string {
  return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
}

function val(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).trim() || "-";
}

function dateVal(v: unknown): string {
  if (!v) return "-";
  const s = String(v);
  const d = dayjs(s);
  return d.isValid() ? d.format("YYYY-MM-DD") : s;
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

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <div>
        {typeof value === "string" || typeof value === "number" ? (
          <Typography.Text>{value || "-"}</Typography.Text>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export default function EmployeeViewPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();
  const params = useParams<{ employee_id: string }>();
  const employeeId = decodeURIComponent(String(params?.employee_id || ""));

  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<EmployeeDocumentOut[]>([]);

  const [warningsLoading, setWarningsLoading] = useState(false);
  const [warnings, setWarnings] = useState<EmployeeWarning[]>([]);

  const [warningDocsLoading, setWarningDocsLoading] = useState<Record<number, boolean>>({});
  const [warningDocs, setWarningDocs] = useState<Record<number, EmployeeWarningDocumentOut[]>>({});

  const docsList = useMemo(() => {
    const base = API_BASE_URL || "";
    return (docs ?? []).map((d) => ({ ...d, _absUrl: d.url.startsWith("http") ? d.url : `${base}${d.url}` }));
  }, [docs]);

  const warningDocsList = useMemo(() => {
    const base = API_BASE_URL || "";
    const out: Record<number, Array<EmployeeWarningDocumentOut & { _absUrl: string }>> = {};
    for (const [k, v] of Object.entries(warningDocs)) {
      const id = Number(k);
      out[id] = (v ?? []).map((d) => ({ ...d, _absUrl: d.url.startsWith("http") ? d.url : `${base}${d.url}` }));
    }
    return out;
  }, [warningDocs]);

  const loadEmployee = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const e = await api.get<Employee>(`/api/employees/${encodeURIComponent(employeeId)}`);
      setEmployee(e);
    } catch (e: unknown) {
      setEmployee(null);
      msg.error(errorMessage(e, "Failed to load employee"));
    } finally {
      setLoading(false);
    }
  }, [employeeId, msg]);

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
        drawLine("Employee", employee ? fullName(employee) : "-");
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

  const loadWarnings = useCallback(async (employeeDbId: number) => {
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
  }, [msg]);

  useEffect(() => {
    void loadEmployee();
  }, [loadEmployee]);

  useEffect(() => {
    const id = Number(employee?.id);
    if (!id) return;
    void loadDocuments(id);
    void loadWarnings(id);
  }, [employee?.id, loadDocuments, loadWarnings]);

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
          title={<Typography.Title level={4} style={{ margin: 0 }}>Employee View</Typography.Title>}
          extra={
            <Space>
              <Button onClick={() => router.push("/employees")}>Back</Button>
              <Button type="primary" onClick={() => router.push(`/employees/${encodeURIComponent(employeeId)}/edit`)}>
                Edit
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
            <Tabs
              size="small"
              items={[
                {
                  key: "basic",
                  label: "Basic",
                  children: (
                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={12}>
                          <Field label="Employee ID" value={val(employee.employee_id)} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="Name" value={val(fullName(employee))} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="Email" value={val(employee.email)} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="Mobile" value={val(employee.mobile_number)} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="Gender" value={val(employee.gender)} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="Date of birth" value={dateVal(employee.date_of_birth)} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="CNIC" value={val(employee.cnic)} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="CNIC expiry" value={dateVal(employee.cnic_expiry_date)} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="Domicile" value={val((employee as unknown as { domicile?: string | null }).domicile)} />
                        </Col>
                        <Col xs={24} md={12}>
                          <Field label="Height (cm)" value={val(employee.height_cm)} />
                        </Col>
                      </Row>

                      <Divider style={{ margin: 0 }} />
                      <Typography.Text type="secondary">
                        Created: {employee.created_at ? dayjs(employee.created_at).format("YYYY-MM-DD HH:mm") : "-"}
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  key: "job",
                  label: "Job",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Department" value={val(employee.department)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Designation" value={val(employee.designation)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Enrolled as" value={val(employee.enrolled_as)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Employment type" value={val(employee.employment_type)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Shift type" value={val(employee.shift_type)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Reporting manager" value={val(employee.reporting_manager)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Base location" value={val(employee.base_location)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Interviewed by" value={val(employee.interviewed_by)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Introduced by" value={val(employee.introduced_by)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Security clearance" value={val(employee.security_clearance)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Employment status" value={val(employee.employment_status)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Last site assigned" value={val(employee.last_site_assigned)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Remarks" value={val(employee.remarks)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "languages",
                  label: "Languages",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Languages spoken" value={val(employee.languages_spoken)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field
                          label="Languages proficiency"
                          value={
                            Array.isArray(employee.languages_proficiency) && employee.languages_proficiency.length ? (
                              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                {employee.languages_proficiency.map((x, i) => (
                                  <Typography.Text key={i}>
                                    {x.language} - {x.level}
                                  </Typography.Text>
                                ))}
                              </Space>
                            ) : (
                              "-"
                            )
                          }
                        />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "contact",
                  label: "Contact",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Father name" value={val(employee.father_name)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Personal phone number" value={val(employee.personal_phone_number)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Emergency contact name" value={val(employee.emergency_contact_name)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Emergency contact number" value={val(employee.emergency_contact_number)} />
                      </Col>
                      <Col xs={24} md={24}>
                        <Field label="Previous employment" value={val(employee.previous_employment)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "address",
                  label: "Address",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Permanent address" value={val(employee.permanent_address)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Temporary address" value={val(employee.temporary_address)} />
                      </Col>

                      <Col xs={24} md={12}>
                        <Field label="Permanent village" value={val((employee as any).permanent_village)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Permanent post office" value={val((employee as any).permanent_post_office)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Permanent thana" value={val((employee as any).permanent_thana)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Permanent tehsil" value={val((employee as any).permanent_tehsil)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Permanent district" value={val((employee as any).permanent_district)} />
                      </Col>

                      <Col xs={24} md={12}>
                        <Field label="Present village" value={val((employee as any).present_village)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Present post office" value={val((employee as any).present_post_office)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Present thana" value={val((employee as any).present_thana)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Present tehsil" value={val((employee as any).present_tehsil)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Present district" value={val((employee as any).present_district)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "service",
                  label: "Service",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Retired from" value={val(employee.retired_from)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Service unit" value={val(employee.service_unit)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Service rank" value={val(employee.service_rank)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Service enrollment date" value={dateVal(employee.service_enrollment_date)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Service reenrollment date" value={dateVal(employee.service_reenrollment_date)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Medical category" value={val(employee.medical_category)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Discharge cause" value={val(employee.discharge_cause)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "family",
                  label: "Family",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Next of kin name" value={val(employee.next_of_kin_name)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Next of kin CNIC" value={val(employee.next_of_kin_cnic)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Next of kin mobile" value={val(employee.next_of_kin_mobile_number)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Sons names" value={val((employee as any).sons_names)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Daughters names" value={val((employee as any).daughters_names)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Brothers names" value={val((employee as any).brothers_names)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Sisters names" value={val((employee as any).sisters_names)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "verification",
                  label: "Verification",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Particulars verified by SHO on" value={dateVal((employee as any).particulars_verified_by_sho_on)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Particulars verified by SSP on" value={dateVal((employee as any).particulars_verified_by_ssp_on)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Police Khidmat verification on" value={dateVal((employee as any).police_khidmat_verification_on)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Signature recording officer" value={val((employee as any).signature_recording_officer)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Signature of individual" value={val((employee as any).signature_individual)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="FSSL" value={val((employee as any).fss_number)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="FSSL name" value={val((employee as any).fss_name)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="FSSL S/O" value={val((employee as any).fss_so)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Fingerprint attested by" value={val((employee as any).fingerprint_attested_by)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "fingerprints",
                  label: "Fingerprints",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Original doc held" value={val((employee as any).original_doc_held)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "payroll",
                  label: "Payroll",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Field label="Basic salary" value={val((employee as any).basic_salary)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Allowances" value={val((employee as any).allowances)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Total salary" value={val((employee as any).total_salary)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Bank name" value={val((employee as any).bank_name)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Account number" value={val((employee as any).account_number)} />
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label="Account type" value={val((employee as any).account_type)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "compliance",
                  label: "Compliance",
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={8}>
                        <Field label="Basic security training" value={val(employee.basic_security_training)} />
                      </Col>
                      <Col xs={24} md={8}>
                        <Field label="Fire safety training" value={val(employee.fire_safety_training)} />
                      </Col>
                      <Col xs={24} md={8}>
                        <Field label="First aid certification" value={val(employee.first_aid_certification)} />
                      </Col>
                      <Col xs={24} md={8}>
                        <Field label="Agreement" value={val((employee as any).agreement)} />
                      </Col>
                      <Col xs={24} md={8}>
                        <Field label="Guard card" value={val(employee.guard_card)} />
                      </Col>
                      <Col xs={24} md={8}>
                        <Field label="Police clearance" value={val(employee.police_clearance)} />
                      </Col>
                      <Col xs={24} md={8}>
                        <Field label="Fingerprint check" value={val(employee.fingerprint_check)} />
                      </Col>
                      <Col xs={24} md={8}>
                        <Field label="Background screening" value={val(employee.background_screening)} />
                      </Col>
                      <Col xs={24} md={8}>
                        <Field label="Reference verification" value={val(employee.reference_verification)} />
                      </Col>
                      <Col xs={24} md={24}>
                        <Field label="Other certificates" value={val(employee.other_certificates)} />
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: "documents",
                  label: "Documents",
                  children: docsLoading ? (
                    <Spin />
                  ) : docsList.length === 0 ? (
                    <Typography.Text type="secondary">No documents.</Typography.Text>
                  ) : (
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      {docsList.map((d) => (
                        <Card key={d.id} size="small" style={{ borderRadius: 12 }}>
                          <Space direction="vertical" size={2} style={{ width: "100%" }}>
                            <Typography.Text strong>{d.name}</Typography.Text>
                            <Typography.Text type="secondary">{d.filename}</Typography.Text>
                            <Space>
                              <a href={d._absUrl} target="_blank" rel="noopener noreferrer">Open</a>
                              <a href={d._absUrl} download={d.filename || "document"}>Download</a>
                            </Space>
                          </Space>
                        </Card>
                      ))}
                    </Space>
                  ),
                },
                {
                  key: "warnings",
                  label: "Warnings",
                  children: warningsLoading ? (
                    <Spin />
                  ) : warnings.length === 0 ? (
                    <Typography.Text type="secondary">No warnings.</Typography.Text>
                  ) : (
                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                      {warnings.map((w) => (
                        <Card key={w.id} size="small" style={{ borderRadius: 12, background: "#fafafa" }}>
                          <Space direction="vertical" size={6} style={{ width: "100%" }}>
                            <Space style={{ width: "100%", justifyContent: "space-between" }}>
                              <Typography.Text strong>{w.warning_number}</Typography.Text>
                              <Button size="small" onClick={() => void exportWarningAsPdf(w)} loading={Boolean(warningDocsLoading[Number(w.id)])}>
                                Export PDF
                              </Button>
                            </Space>
                            {w.found_with ? <Typography.Text>You were found: {w.found_with}</Typography.Text> : null}
                            <Typography.Text>
                              You are order to improve your conduct in future, otherwise strict action would be taken against you. Your services would be terminated automatically on third warning.
                            </Typography.Text>
                            {w.supervisor_signature ? (
                              <Typography.Text type="secondary">Signature: {w.supervisor_signature}</Typography.Text>
                            ) : null}
                            {w.supervisor_signature_date ? (
                              <Typography.Text type="secondary">Dated: {w.supervisor_signature_date}</Typography.Text>
                            ) : null}
                            {Boolean(warningDocsLoading[Number(w.id)]) ? (
                              <Typography.Text type="secondary">Loading attachments…</Typography.Text>
                            ) : (warningDocsList[Number(w.id)] ?? []).length ? (
                              <Typography.Text type="secondary">Attachments: {(warningDocsList[Number(w.id)] ?? []).map((d) => d.filename).filter(Boolean).join(", ")}</Typography.Text>
                            ) : (
                              <Typography.Text type="secondary">Attachments: none</Typography.Text>
                            )}
                          </Space>
                        </Card>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </div>
    </>
  );
}
