"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
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
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  FilePdfOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import type {
  Employee,
  EmployeeCreate,
  EmployeeDocumentOut,
  EmployeeListResponse,
  EmployeeWarning,
  EmployeeWarningDocumentOut,
  EmployeeUpdate,
} from "@/lib/types";

type TableFilters = {
  search?: string;
  department?: string;
  designation?: string;
  employment_status?: string;
};

type DateFieldKeys =
  | "date_of_birth"
  | "cnic_expiry_date"
  | "service_enrollment_date"
  | "service_reenrollment_date"
  | "particulars_verified_by_sho_on"
  | "particulars_verified_by_ssp_on"
  | "police_khidmat_verification_on";

type FormValues = Omit<EmployeeCreate, DateFieldKeys | "languages_spoken" | "retired_from"> & {
  date_of_birth?: string | dayjs.Dayjs | null;
  cnic_expiry_date?: string | dayjs.Dayjs | null;
  service_enrollment_date?: string | dayjs.Dayjs | null;
  service_reenrollment_date?: string | dayjs.Dayjs | null;
  particulars_verified_by_sho_on?: string | dayjs.Dayjs | null;
  particulars_verified_by_ssp_on?: string | dayjs.Dayjs | null;
  police_khidmat_verification_on?: string | dayjs.Dayjs | null;
  languages_spoken?: string[];
  retired_from?: string[];
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

function fullName(e: Employee): string {
  return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
}

function valueAsText(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") return v.trim() || "-";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.map((x) => valueAsText(x)).join(", ") : "-";
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s && s !== "{}" ? s : "-";
    } catch {
      return "-";
    }
  }
  return String(v);
}

function normalizeLanguagesSpoken(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s.trim().length > 0);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return undefined;
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter((x) => x.trim().length > 0);
    } catch {
      // ignore
    }
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  }
  return undefined;
}

function normalizeLanguagesProficiency(
  v: unknown
): Array<{ language: string; level: string }> | undefined {
  if (Array.isArray(v)) {
    const out = v
      .map((it) => {
        if (!it || typeof it !== "object") return null;
        const obj = it as { language?: unknown; level?: unknown };
        const language = typeof obj.language === "string" ? obj.language.trim() : String(obj.language ?? "").trim();
        const level = typeof obj.level === "string" ? obj.level.trim() : String(obj.level ?? "").trim();
        if (!language || !level) return null;
        return { language, level };
      })
      .filter(Boolean) as Array<{ language: string; level: string }>;
    return out.length ? out : undefined;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return undefined;
    try {
      const parsed = JSON.parse(s) as unknown;
      return normalizeLanguagesProficiency(parsed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export default function EmployeesPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const roleOptions = ["Supervisor", "Guard", "Driver", "Cook", "Sweeper"];
  const retiredFromOptions = ["Army", "Navy", "PAF", "Police", "FC", "MJD", "Civ"];

  const [newEmployeeHover, setNewEmployeeHover] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);

  const [allocatedEmployeeDbIds, setAllocatedEmployeeDbIds] = useState<Set<number>>(new Set());

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [filters, setFilters] = useState<TableFilters>({});

  const [departments, setDepartments] = useState<string[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "view">("create");
  const [active, setActive] = useState<Employee | null>(null);
  const [form] = Form.useForm<FormValues>();

  const readOnly = drawerMode === "view";

  const [activeTabKey, setActiveTabKey] = useState("basic");

  const [warningsLoading, setWarningsLoading] = useState(false);
  const [warnings, setWarnings] = useState<EmployeeWarning[]>([]);
  const [newWarningNumber, setNewWarningNumber] = useState("");
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningForm] = Form.useForm<{
    warning_number: string;
    found_with?: string;
    supervisor_signature?: string;
    supervisor_signature_date?: dayjs.Dayjs | null;
  }>();
  const [warningSignatureFile, setWarningSignatureFile] = useState<File | null>(null);
  const [warningDocsLoading, setWarningDocsLoading] = useState<Record<number, boolean>>({});
  const [warningDocs, setWarningDocs] = useState<Record<number, EmployeeWarningDocumentOut[]>>({});
  const warningFileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const warningDocsList = useMemo(() => {
    const base = API_BASE_URL || "";
    const out: Record<number, Array<EmployeeWarningDocumentOut & { _absUrl: string }>> = {};
    for (const [k, v] of Object.entries(warningDocs)) {
      const id = Number(k);
      out[id] = (v ?? []).map((d) => ({ ...d, _absUrl: d.url?.startsWith("http") ? d.url : `${base}${d.url}` }));
    }
    return out;
  }, [warningDocs]);

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

  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([
    "employee_id",
    "name",
    "department",
    "mobile_number",
    "cnic",
    "warnings",
    "employment_status",
    "created_at",
    "actions",
  ]);

  // Bulk delete state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const openCreate = useCallback(() => {
    router.push("/employees/new");
  }, [router]);

  const openEdit = useCallback(
    (e: Employee) => {
      router.push(`/employees/${encodeURIComponent(String(e.employee_id))}/edit`);
    },
    [router]
  );

  const exportEmployeeProfileAsPdf = useCallback(
    async (row: Employee) => {
      try {
        const employeeKey = String(row.employee_id || "");
        if (!employeeKey) return;

        const employee = await api.get<Employee>(`/api/employees/${encodeURIComponent(employeeKey)}`);
        const employeeDbId = Number(employee?.id);
        if (!employeeDbId) throw new Error("Employee DB id missing");

        const base = API_BASE_URL || "";

        const docs = await api.get<EmployeeDocumentOut[]>(`/api/employees/by-db-id/${employeeDbId}/documents`);
        const docsAbs = (Array.isArray(docs) ? docs : []).map((d) => ({
          ...d,
          _absUrl: d.url?.startsWith("http") ? d.url : `${base}${d.url}`,
        }));

        const warnings = await api.get<EmployeeWarning[]>(`/api/employees/by-db-id/${employeeDbId}/warnings`);
        const warningsArr = Array.isArray(warnings) ? warnings : [];

        const warningDocs: Record<number, Array<EmployeeWarningDocumentOut & { _absUrl: string }>> = {};
        for (const w of warningsArr) {
          const wid = Number(w.id);
          if (!wid) continue;
          const wdocs = await api.get<EmployeeWarningDocumentOut[]>(`/api/employees/warnings/${wid}/documents`);
          warningDocs[wid] = (Array.isArray(wdocs) ? wdocs : []).map((d) => ({
            ...d,
            _absUrl: d.url?.startsWith("http") ? d.url : `${base}${d.url}`,
          }));
        }

        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

        const pageSize: [number, number] = [595.28, 841.89];
        const margin = 48;
        const contentTop = 120;
        const contentBottom = 56;
        const contentWidth = pageSize[0] - margin * 2;

        let page = pdf.addPage(pageSize);
        let y = pageSize[1] - contentTop;

        const headerColor = rgb(0.09, 0.24, 0.44);
        const lightRow = rgb(0.97, 0.98, 0.99);
        const border = rgb(0.85, 0.88, 0.92);
        const textMuted = rgb(0.35, 0.39, 0.45);

        const tryEmbedLogo = async () => {
          try {
            const ab = await fetchArrayBuffer("/Logo-removebg-preview.png");
            return await pdf.embedPng(ab);
          } catch {
            return null;
          }
        };

        const logoImg = await tryEmbedLogo();

        const drawHeader = (title: string, subtitle?: string) => {
          page.drawRectangle({ x: 0, y: pageSize[1] - 92, width: pageSize[0], height: 92, color: headerColor });

          const leftX = margin;
          const topY = pageSize[1] - 26;

          let xCursor = leftX;
          if (logoImg) {
            const targetH = 44;
            const scale = targetH / logoImg.height;
            const w = logoImg.width * scale;
            const h = logoImg.height * scale;
            page.drawImage(logoImg, { x: xCursor, y: pageSize[1] - 72, width: w, height: h });
            xCursor += w + 12;
          }

          page.drawText("Flash ERP", { x: xCursor, y: topY, size: 14, font: bold, color: rgb(1, 1, 1) });
          page.drawText(title, { x: xCursor, y: topY - 18, size: 18, font: bold, color: rgb(1, 1, 1) });
          if (subtitle) {
            page.drawText(subtitle, { x: xCursor, y: topY - 34, size: 10, font, color: rgb(1, 1, 1) });
          }

          page.drawText(dayjs().format("YYYY-MM-DD HH:mm"), {
            x: pageSize[0] - margin - 140,
            y: pageSize[1] - 34,
            size: 10,
            font,
            color: rgb(1, 1, 1),
          });

          y = pageSize[1] - contentTop;
        };

        const newPage = () => {
          page = pdf.addPage(pageSize);
          drawHeader("Employee Profile", `${String(employee.employee_id || "-")} • ${fullName(employee)}`);
        };

        const ensureSpace = (need: number) => {
          if (y - need < contentBottom) newPage();
        };

        const drawSectionTitle = (t: string) => {
          ensureSpace(28);
          y -= 4;
          page.drawText(String(t), { x: margin, y, size: 13, font: bold, color: rgb(0, 0, 0) });
          y -= 10;
          page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, thickness: 1, color: border });
          y -= 10;
        };

        const drawKeyValueGrid = (rows: Array<{ k: string; v: string }>) => {
          const colGap = 12;
          const colW = (contentWidth - colGap) / 2;
          const rowH = 18;
          const labelW = 120;

          for (let i = 0; i < rows.length; i++) {
            ensureSpace(rowH + 6);
            const r = rows[i];
            const col = i % 2;
            const x = margin + col * (colW + colGap);
            const isEven = Math.floor(i / 2) % 2 === 0;

            if (col === 0) {
              page.drawRectangle({ x: margin, y: y - rowH + 4, width: contentWidth, height: rowH + 6, color: isEven ? lightRow : rgb(1, 1, 1) });
              page.drawLine({ start: { x: margin, y: y - rowH + 4 }, end: { x: margin + contentWidth, y: y - rowH + 4 }, thickness: 1, color: border });
            }

            page.drawText(`${r.k}:`, { x, y, size: 9.5, font: bold, color: textMuted, maxWidth: labelW });
            page.drawText(String(r.v || "-"), { x: x + labelW + 6, y, size: 9.5, font, color: rgb(0, 0, 0), maxWidth: colW - labelW - 8 });

            if (col === 1) {
              y -= rowH + 6;
            }
          }

          if (rows.length % 2 === 1) {
            y -= rowH + 6;
          }
        };

        drawHeader("Employee Profile", `${String(employee.employee_id || "-")} • ${fullName(employee)}`);

        drawSectionTitle("SUMMARY");
        drawKeyValueGrid([
          { k: "Employee", v: fullName(employee) || "-" },
          { k: "Employee ID", v: String(employee.employee_id || "-") },
          { k: "FSS#", v: String((employee as any).fss_number || "-") },
          { k: "CNIC", v: String(employee.cnic || "-") },
          { k: "Mobile", v: String(employee.mobile_number || "-") },
          { k: "Email", v: String(employee.email || "-") },
        ]);

        drawSectionTitle("DETAILS");
        const skip = new Set(["id", "created_at", "updated_at", "warning_count"]);
        const entries = Object.entries(employee as unknown as Record<string, unknown>)
          .filter(([k]) => !skip.has(k))
          .sort(([a], [b]) => a.localeCompare(b));

        const detailRows = entries.map(([k, v]) => ({ k: k.replace(/_/g, " "), v: valueAsText(v) }));
        drawKeyValueGrid(detailRows);

        drawSectionTitle("EMPLOYEE DOCUMENTS");
        if (!docsAbs.length) {
          drawKeyValueGrid([{ k: "Documents", v: "No documents" }]);
        } else {
          const rows = docsAbs.map((d, idx) => ({
            k: String(idx + 1),
            v: `${String(d.name || "Document")} - ${String(d.filename || d.url || "-")}`,
          }));
          drawKeyValueGrid(rows);
        }

        drawSectionTitle("WARNINGS");
        if (!warningsArr.length) {
          drawKeyValueGrid([{ k: "Warnings", v: "No warnings" }]);
        } else {
          for (const w of warningsArr) {
            const wid = Number(w.id);
            const wdocs = warningDocs[wid] || [];
            drawKeyValueGrid([
              { k: "Warning", v: String(w.warning_number || "-") },
              { k: "Found with", v: String((w as any).found_with || "-") },
              { k: "Supervisor signature", v: String((w as any).supervisor_signature || "-") },
              { k: "Signature date", v: String((w as any).supervisor_signature_date || "-") },
            ]);

            if (!wdocs.length) {
              drawKeyValueGrid([{ k: "Attachments", v: "none" }]);
            } else {
              const rows = wdocs.map((d, idx) => {
                const name = d.filename || d.url;
                const when = d.created_at ? ` (${String(d.created_at)})` : "";
                return { k: String(idx + 1), v: `${name}${when}` };
              });
              drawSectionTitle("WARNING ATTACHMENTS");
              drawKeyValueGrid(rows);
            }

            y -= 6;
          }
        }

        const appendAttachment = async (name: string, url: string) => {
          const ext = fileExt(name);
          if (ext === "pdf") {
            const ab = await fetchArrayBuffer(url);
            const src = await PDFDocument.load(ab);
            const pages = await pdf.copyPages(src, src.getPageIndices());
            pages.forEach((p) => pdf.addPage(p));
            return;
          }
          if (isImageExt(ext)) {
            const ab = await fetchArrayBuffer(url);
            const img = ext === "png" ? await pdf.embedPng(ab) : await pdf.embedJpg(ab);
            const p = pdf.addPage(pageSize);
            const margin = 56;
            const maxW = pageSize[0] - margin * 2;
            const maxH = pageSize[1] - margin * 2 - 40;
            const scale = Math.min(maxW / img.width, maxH / img.height);
            const wScaled = img.width * scale;
            const hScaled = img.height * scale;
            const x = (pageSize[0] - wScaled) / 2;
            const yImg = (pageSize[1] - hScaled) / 2 - 10;
            p.drawText(`Attachment: ${name}`, { x: margin, y: pageSize[1] - 40, size: 11, font: bold, color: rgb(0, 0, 0) });
            p.drawImage(img, { x, y: yImg, width: wScaled, height: hScaled });
            return;
          }
          const p = pdf.addPage(pageSize);
          p.drawText(`Attachment: ${name}`, { x: 56, y: 780, size: 12, font: bold, color: rgb(0, 0, 0) });
          p.drawText(String(url), { x: 56, y: 760, size: 9, font, color: rgb(0, 0, 0), maxWidth: pageSize[0] - 112 });
        };

        for (const d of docsAbs) {
          const url = (d as any)._absUrl || d.url;
          const name = d.filename || d.url;
          if (!url) continue;
          await appendAttachment(name, url);
        }

        for (const w of warningsArr) {
          const wid = Number(w.id);
          const wdocs = warningDocs[wid] || [];
          for (const d of wdocs) {
            const url = d._absUrl || d.url;
            const name = d.filename || d.url;
            if (!url) continue;
            await appendAttachment(name, url);
          }
        }

        const bytes = await pdf.save();
        downloadBlob(
          new Blob([bytes], { type: "application/pdf" }),
          `${String(employee.employee_id || "employee")}-profile.pdf`
        );
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to export profile PDF"));
      }
    },
    [msg]
  );

  const openView = useCallback(
    (e: Employee) => {
      router.push(`/employees/${encodeURIComponent(String(e.employee_id))}`);
    },
    [router]
  );

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  const attachDoc = useCallback((name: string) => {
    setActiveTabKey("documents");
    setDocName(name);
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!active?.id) {
      setDocs([]);
      return;
    }
    setDocsLoading(true);
    try {
      const res = await api.get<EmployeeDocumentOut[]>(`/api/employees/by-db-id/${active.id}/documents`);
      setDocs(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      setDocs([]);
      msg.error(errorMessage(e, "Failed to load employee documents"));
    } finally {
      setDocsLoading(false);
    }
  }, [active?.id, msg]);

  const loadWarnings = useCallback(async () => {
    if (!active?.id) {
      setWarnings([]);
      return;
    }
    setWarningsLoading(true);
    try {
      const res = await api.get<EmployeeWarning[]>(`/api/employees/by-db-id/${active.id}/warnings`);
      setWarnings(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      setWarnings([]);
      msg.error(errorMessage(e, "Failed to load employee warnings"));
    } finally {
      setWarningsLoading(false);
    }
  }, [active?.id, msg]);

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
      if (readOnly) return;
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
    [loadWarningDocuments, msg, readOnly]
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
        drawLine("Employee", active ? fullName(active) : "-");
        drawLine("Employee ID", String(active?.employee_id || "-"));
        drawLine("FSS#", String(active?.fss_number || "-"));
        y -= 6;
        drawLine("Warning", String(w.warning_number || "-"));
        drawLine("Found with", String(w.found_with || "-"));
        drawLine("Supervisor signature", String(w.supervisor_signature || "-"));
        drawLine("Signature date", String(w.supervisor_signature_date || "-"));

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

          for (const d of docsForWarning) {
            const url = d._absUrl || d.url;
            const name = d.filename || d.url;
            const ext = fileExt(name);

            if (!url) {
              const p = baseDoc.addPage([595.28, 841.89]);
              p.drawText(`Attachment: ${name}`, { x: 56, y: 780, size: 12, font: bold, color: rgb(0, 0, 0) });
              p.drawText("Missing URL", { x: 56, y: 760, size: 11, font, color: rgb(0, 0, 0) });
              continue;
            }

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
            p.drawText("(Not embeddable. Use the link to download.)", {
              x: 56,
              y: 760,
              size: 11,
              font,
              color: rgb(0, 0, 0),
            });
            p.drawText(String(url), { x: 56, y: 740, size: 9, font, color: rgb(0, 0, 0), maxWidth: 595.28 - 112 });
          }
        }

        const bytes = await baseDoc.save();
        const blob = new Blob([bytes], { type: "application/pdf" });
        const fname = `${String(active?.employee_id || "employee")}-warning-${String(w.warning_number || warningId)}.pdf`;
        downloadBlob(blob, fname);
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to export PDF"));
      }
    },
    [active, msg, warningDocsList]
  );

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const resp = await api.get<EmployeeListResponse>("/api/employees/", {
        query: {
          skip,
          limit: pageSize,
          search: filters.search,
          department: filters.department,
          designation: filters.designation,
          employment_status: filters.employment_status,
          with_total: true,
        },
      });

      setRows(resp.employees || []);
      setTotal(resp.total || 0);

      // Load currently allocated employees (computed)
      try {
        const alloc = await api.get<{ employee_db_ids: number[] }>("/api/employees/allocated/active");
        const ids = Array.isArray(alloc?.employee_db_ids) ? alloc.employee_db_ids : [];
        setAllocatedEmployeeDbIds(new Set(ids.map((x) => Number(x)).filter((x) => Number.isFinite(x))));
      } catch {
        setAllocatedEmployeeDbIds(new Set());
      }
    } catch (err: unknown) {
      msg.error(errorMessage(err, "Failed to load employees"));
    } finally {
      setLoading(false);
    }
  }, [filters, msg, page, pageSize]);

  const openWarningModal = useCallback(() => {
    if (readOnly) return;
    if (!active?.id) {
      msg.error("Save employee first");
      return;
    }
    if (warnings.length >= 3) {
      msg.error("Maximum 3 warnings allowed");
      return;
    }
    const level = warnings.length === 0 ? "FIRST" : warnings.length === 1 ? "SECOND" : "THIRD";
    const suggested = (newWarningNumber || "").trim() || level;

    warningForm.resetFields();
    warningForm.setFieldsValue({ warning_number: suggested } as unknown as {
      warning_number: string;
      found_with?: string;
      supervisor_signature?: string;
      supervisor_signature_date?: dayjs.Dayjs | null;
    });
    setWarningSignatureFile(null);
    setWarningModalOpen(true);
  }, [active?.id, msg, newWarningNumber, readOnly, warningForm, warnings.length]);

  const submitWarningModal = useCallback(async () => {
    if (readOnly) return;
    if (!active?.id) return;

    const values = await warningForm.validateFields();
    const warningNumber = (values.warning_number || "").trim();
    if (!warningNumber) {
      msg.error("Warning number is required");
      return;
    }

    setWarningsLoading(true);
    try {
      const created = await api.post<EmployeeWarning>(`/api/employees/by-db-id/${active.id}/warnings`, {
        warning_number: warningNumber,
        found_with: (values.found_with || "").trim() || undefined,
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

      setNewWarningNumber("");
      setWarningModalOpen(false);
      await loadWarnings();
      if (warningId) {
        await loadWarningDocuments(warningId);
      }
      void fetchEmployees();
      msg.success("Warning added");
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to add warning"));
    } finally {
      setWarningsLoading(false);
    }
  }, [active?.id, fetchEmployees, loadWarningDocuments, loadWarnings, msg, readOnly, uploadWarningFiles, warningForm, warningSignatureFile]);

  const createWarning = useCallback(async () => {
    if (readOnly) return;
    if (!active?.id) {
      msg.error("Save employee first");
      return;
    }
    if (warnings.length >= 3) {
      msg.error("Maximum 3 warnings allowed");
      return;
    }
    const wno = newWarningNumber.trim();
    if (!wno) {
      msg.error("Warning number is required");
      return;
    }
    setWarningsLoading(true);
    try {
      const created = await api.post<EmployeeWarning>(`/api/employees/by-db-id/${active.id}/warnings`, {
        warning_number: wno,
      });
      setNewWarningNumber("");
      await loadWarnings();
      if (created?.id) {
        await loadWarningDocuments(Number(created.id));
      }
      void fetchEmployees();
      msg.success("Warning added");
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to add warning"));
    } finally {
      setWarningsLoading(false);
    }
  }, [active?.id, fetchEmployees, loadWarningDocuments, loadWarnings, msg, newWarningNumber, readOnly, warnings.length]);

  const deleteWarning = useCallback(
    async (warningId: number) => {
      if (readOnly) return;
      if (!active?.id) return;
      setWarningsLoading(true);
      try {
        await api.del(`/api/employees/by-db-id/${active.id}/warnings/${warningId}`);
        setWarningDocs((p) => {
          const cp = { ...p };
          delete cp[warningId];
          return cp;
        });
        await loadWarnings();
        void fetchEmployees();
        msg.success("Warning deleted");
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to delete warning"));
      } finally {
        setWarningsLoading(false);
      }
    },
    [active?.id, fetchEmployees, loadWarnings, msg, readOnly]
  );

  const deleteWarningDocument = useCallback(
    async (warningId: number, docId: number) => {
      if (readOnly) return;
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
    [loadWarningDocuments, msg, readOnly]
  );

  useEffect(() => {
    if (!drawerOpen) return;
    if (!active?.id) return;
    void loadDocuments();
  }, [active?.id, drawerOpen, loadDocuments]);

  useEffect(() => {
    if (!drawerOpen) return;
    if (!active?.id) return;
    void loadWarnings();
  }, [active?.id, drawerOpen, loadWarnings]);

  const uploadDocument = useCallback(async () => {
    if (!docFile) {
      msg.error("Please choose a file");
      return;
    }
    if (!docName.trim()) {
      msg.error("Please enter document name");
      return;
    }

    if (!active?.id) {
      setPendingDocs((p) => [...p, { name: docName.trim(), file: docFile }]);
      setDocName("");
      setDocFile(null);
      msg.success("Document added. It will upload after you save the employee.");
      return;
    }

    setDocsLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", docName.trim());
      formData.append("file", docFile);

      const res = await fetch(`${API_BASE_URL}/api/employees/by-db-id/${active.id}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);

      setDocName("");
      setDocFile(null);
      msg.success("Document uploaded");
      await loadDocuments();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Upload failed"));
    } finally {
      setDocsLoading(false);
    }
  }, [active?.id, docFile, docName, loadDocuments, msg]);

  const removePendingDoc = useCallback((idx: number) => {
    setPendingDocs((p) => p.filter((_, i) => i !== idx));
  }, []);

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
      } finally {
        setDocsLoading(false);
      }
    },
    [msg, pendingDocs]
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
        await loadDocuments();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Upload failed"));
      } finally {
        setDocsLoading(false);
      }
    },
    [loadDocuments, msg]
  );

  const deleteDocument = useCallback(async (doc: EmployeeDocumentOut) => {
    if (!active?.id) return;
    setDocsLoading(true);
    try {
      await api.del(`/api/employees/by-db-id/${active.id}/documents/${doc.id}`);
      msg.success("Document deleted");
      await loadDocuments();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Delete failed"));
    } finally {
      setDocsLoading(false);
    }
  }, [active?.id, loadDocuments, msg]);

  const fetchMeta = useCallback(async () => {
    try {
      const [deptRes, desigRes] = await Promise.all([
        api.get<{ departments: string[] }>("/api/employees/departments/list"),
        api.get<{ designations: string[] }>("/api/employees/designations/list"),
      ]);
      const dept = Array.isArray(deptRes.departments) ? deptRes.departments : [];
      const desig = Array.isArray(desigRes.designations) ? desigRes.designations : [];
      setDepartments(Array.from(new Set([...dept, ...roleOptions])));
      setDesignations(Array.from(new Set([...desig, ...roleOptions])));
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load filter lists"));
    }
  }, [msg]);

  const markActiveEmployeeLeft = useCallback(async () => {
    if (!active?.employee_id) return;
    try {
      const url = `${API_BASE_URL}/api/employees/${encodeURIComponent(active.employee_id)}/mark-left`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      const updated = (await res.json()) as Employee;
      setActive(updated);
      form.setFieldValue("employment_status", updated.employment_status);
      msg.success("Employee marked as Left");
      void fetchEmployees();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to update status"));
    }
  }, [active?.employee_id, fetchEmployees, form, msg]);

  const exportActiveEmployeeClearancePdf = useCallback(async () => {
    if (!active?.employee_id) return;
    try {
      const url = `${API_BASE_URL}/api/employees/${encodeURIComponent(active.employee_id)}/clearance/pdf`;
      let res: Response;
      try {
        res = await fetch(url);
      } catch (e: unknown) {
        msg.error(`Failed to fetch: ${url}`);
        throw e;
      }
      if (!res.ok) throw new Error(`Export failed (${res.status}) - ${url}`);
      const blob = await res.blob();
      downloadBlob(blob, `employee_clearance_${active.employee_id}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    }
  }, [active?.employee_id, msg]);

  useEffect(() => {
    void fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  const onDelete = useCallback(async (e: Employee) => {
    try {
      await api.del(`/api/employees/${encodeURIComponent(e.employee_id)}`);
      msg.success("Employee deleted");
      void fetchEmployees();
    } catch (err: unknown) {
      msg.error(errorMessage(err, "Delete failed"));
    }
  }, [fetchEmployees, msg]);

  const onBulkDelete = useCallback(async () => {
    if (selectedRowKeys.length === 0) return;
    
    const selectedEmployees = rows.filter(emp => selectedRowKeys.includes(emp.employee_id));
    const employeeIds = selectedEmployees.map(emp => emp.employee_id);
    
    Modal.confirm({
      title: 'Delete Selected Employees',
      content: (
        <div>
          <p>Are you sure you want to delete the following {selectedEmployees.length} employee(s)?</p>
          <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
            {selectedEmployees.map(emp => (
              <div key={emp.employee_id} style={{ padding: '4px 0' }}>
                <Tag color="blue">{emp.employee_id}</Tag> {fullName(emp)}
              </div>
            ))}
          </div>
        </div>
      ),
      okText: 'Delete All',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        setBulkDeleteLoading(true);
        try {
          const result = await api.post<{
            message: string;
            deleted_count: number;
            deleted_ids: string[];
            warning?: string;
          }>('/api/employees/delete-multiple', employeeIds);
          
          msg.success(`${result.deleted_count} employee(s) deleted successfully`);
          if (result.warning) {
            msg.warning(result.warning);
          }
          
          setSelectedRowKeys([]);
          void fetchEmployees();
        } catch (err: unknown) {
          msg.error(errorMessage(err, "Bulk delete failed"));
        } finally {
          setBulkDeleteLoading(false);
        }
      }
    });
  }, [selectedRowKeys, rows, msg, fetchEmployees]);

  const onSubmit = useCallback(async () => {
    const values = await form.validateFields();

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
    };

    try {
      if (drawerMode === "create") {
        const created = await api.post<Employee>("/api/employees/", payload);
        if (created?.id) {
          await uploadPendingDocs(Number(created.id));
        }
        msg.success("Employee created");
      } else if (drawerMode === "edit" && active) {
        const updatePayload: EmployeeUpdate = payload;
        await api.put<Employee>(
          `/api/employees/${encodeURIComponent(active.employee_id)}`,
          updatePayload
        );
        msg.success("Employee updated");
      }

      setDrawerOpen(false);
      void fetchEmployees();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [active, drawerMode, fetchEmployees, form, msg, uploadPendingDocs]);

  const allColumns = useMemo<ColumnsType<Employee>>(() => {
    return [
      {
        key: "employee_id",
        title: "Employee ID",
        dataIndex: "employee_id",
        width: 110,
        render: (v: string) => <Tag color="blue">{v}</Tag>,
      },
      {
        key: "name",
        title: "Name",
        render: (_, r) => (
          <Tooltip
            placement="topLeft"
            title={
              <div style={{ maxWidth: 320 }}>
                <div>{fullName(r)}</div>
                <div style={{ opacity: 0.85 }}>{r.email || "-"}</div>
                {(r as any)?.fss_number ? <div style={{ opacity: 0.85 }}>{`FSS# ${(r as any).fss_number}`}</div> : null}
              </div>
            }
          >
            <div className="employees-name-cell">
              <Typography.Text strong ellipsis>
                {fullName(r)}
              </Typography.Text>
              <Typography.Text type="secondary" className="employees-name-cell__meta" ellipsis>
                {(r.designation || "-") + (r.department ? ` • ${r.department}` : "")}
              </Typography.Text>
            </div>
          </Tooltip>
        ),
        sorter: (a, b) => fullName(a).localeCompare(fullName(b)),
        width: 260,
        ellipsis: true,
      },
      {
        key: "department",
        title: "Department",
        dataIndex: "department",
        width: 130,
        ellipsis: true,
        render: (v: string) => (v ? <Tag>{v}</Tag> : <Typography.Text type="secondary">-</Typography.Text>),
      },
      {
        key: "mobile_number",
        title: "Mobile",
        dataIndex: "mobile_number",
        width: 120,
        ellipsis: true,
      },
      {
        key: "cnic",
        title: "CNIC",
        dataIndex: "cnic",
        width: 130,
        ellipsis: true,
        render: (v: string) => (v ? <Typography.Text>{v}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>),
      },
      {
        key: "warnings",
        title: "Warnings",
        width: 85,
        render: (_, r: Employee) => {
          const c = Number(r.warning_count ?? 0);
          if (!Number.isFinite(c) || c <= 0) return <Typography.Text type="secondary">0</Typography.Text>;
          return c >= 3 ? <Tag color="red">{c}</Tag> : <Tag color="orange">{c}</Tag>;
        },
      },
      {
        key: "employment_status",
        title: "Status",
        dataIndex: "employment_status",
        width: 140,
        render: (v: string, r: Employee) => {
          const val = (v ?? "").toLowerCase();
          const color = val === "active" ? "green" : val === "inactive" ? "red" : "gold";
          return (
            <Space size={6} wrap>
              <Tag color={color}>{String(v ?? "-")}</Tag>
              {allocatedEmployeeDbIds.has(Number(r.id)) ? (
                <Tag color="purple">Allocated</Tag>
              ) : null}
            </Space>
          );
        },
      },
      {
        key: "created_at",
        title: "Created",
        dataIndex: "created_at",
        width: 100,
        render: (v: string) => (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {v ? dayjs(v).format("YYYY-MM-DD") : "-"}
          </Typography.Text>
        ),
        sorter: (a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf(),
      },
      {
        key: "actions",
        title: "Actions",
        width: 110,
        render: (_, r) => (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
            <Button size="small" icon={<EditOutlined />} style={{ color: "#183c70" }} onClick={() => openEdit(r)} />
            <Button size="small" icon={<FilePdfOutlined />} onClick={() => void exportEmployeeProfileAsPdf(r)} />
            <Popconfirm
              title="Delete employee"
              description={`Delete ${fullName(r)} (${r.employee_id})?`}
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => void onDelete(r)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ];
  }, [allocatedEmployeeDbIds, exportEmployeeProfileAsPdf, onDelete, openEdit, openView]);

  const columns = useMemo(() => {
    const set = new Set(visibleColumnKeys);
    return allColumns.filter((c) => (c.key ? set.has(String(c.key)) : true));
  }, [allColumns, visibleColumnKeys]);

  const columnOptions = useMemo(() => {
    return allColumns
      .filter((c) => c.key && c.key !== "actions")
      .map((c) => ({
        label: String(c.title),
        key: String(c.key),
      }));
  }, [allColumns]);

  const columnMenuItems = useMemo(() => {
    return columnOptions.map((o) => ({
      key: o.key,
      label: (
        <Space style={{ width: 220, justifyContent: "space-between" }}>
          <span>{o.label}</span>
          <Switch
            size="small"
            checked={visibleColumnKeys.includes(o.key)}
            onChange={(checked) => {
              setVisibleColumnKeys((prev) => {
                const s = new Set(prev);
                if (checked) s.add(o.key);
                else s.delete(o.key);
                s.add("actions");
                return Array.from(s);
              });
            }}
          />
        </Space>
      ),
    }));
  }, [columnOptions, visibleColumnKeys]);

  const toolbar = (
    <Space orientation="vertical" size={8} style={{ width: "100%" }}>
      <Row gutter={[8, 8]} align="middle" justify="space-between">
        <Col flex="0 0 auto">
          <Typography.Title level={4} style={{ margin: 0 }}>
            Employees
          </Typography.Title>
        </Col>
        <Col flex="0 0 auto">
          <Space>
            <Button
              icon={<UploadOutlined />}
              onClick={() => router.push("/employees/import-csv")}
              style={{ borderRadius: 0 }}
            >
              Import CSV
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreate}
              onMouseEnter={() => setNewEmployeeHover(true)}
              onMouseLeave={() => setNewEmployeeHover(false)}
              style={{
                background: newEmployeeHover ? "#3F69A7" : "#4F79B7",
                borderColor: newEmployeeHover ? "#3F69A7" : "#4F79B7",
                color: "#ffffff",
                borderRadius: 0,
                transition: "background 150ms ease, border-color 150ms ease",
              }}
            >
              New Employee
            </Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[8, 8]} align="middle" justify="space-between" className="employees-filters">
        <Col flex="1 1 320px">
          <Input
            value={filters.search}
            onChange={(e) => {
              setFilters((p) => ({ ...p, search: e.target.value || undefined }));
              setPage(1);
            }}
            placeholder="Search by name, employee id, email, mobile"
            allowClear
            size="middle"
            style={{ borderRadius: 0 }}
          />
        </Col>

        <Col flex="0 1 180px">
          <Select
            value={filters.department}
            classNames={{ popup: { root: "employees-filter-dropdown" } }}
            onChange={(v) => {
              setFilters((p) => ({ ...p, department: v || undefined }));
              setPage(1);
            }}
            placeholder="Department"
            allowClear
            options={departments.map((d) => ({ label: d, value: d }))}
            showSearch
            optionFilterProp="label"
            size="middle"
            style={{ width: "100%", borderRadius: 0 }}
          />
        </Col>

        <Col flex="0 1 180px">
          <Select
            value={filters.designation}
            classNames={{ popup: { root: "employees-filter-dropdown" } }}
            onChange={(v) => {
              setFilters((p) => ({ ...p, designation: v || undefined }));
              setPage(1);
            }}
            placeholder="Designation"
            allowClear
            options={designations.map((d) => ({ label: d, value: d }))}
            showSearch
            optionFilterProp="label"
            size="middle"
            style={{ width: "100%", borderRadius: 0 }}
          />
        </Col>

        <Col flex="0 1 140px">
          <Select
            value={filters.employment_status}
            classNames={{ popup: { root: "employees-filter-dropdown" } }}
            onChange={(v) => {
              setFilters((p) => ({ ...p, employment_status: v || undefined }));
              setPage(1);
            }}
            placeholder="Status"
            allowClear
            options={["Active", "Inactive", "Left"].map((s) => ({ label: s, value: s }))}
            size="middle"
            style={{ width: "100%", borderRadius: 0 }}
          />
        </Col>

        <Col flex="0 0 auto">
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void fetchEmployees()}
              size="middle"
              style={{ borderRadius: 0 }}
            >
              Refresh
            </Button>
            <Dropdown
              trigger={["click"]}
              menu={{ items: columnMenuItems }}
              placement="bottomRight"
              classNames={{ root: "employees-columns-dropdown" }}
            >
              <Button icon={<SettingOutlined />} size="middle" style={{ borderRadius: 0 }}>
                Columns <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
        </Col>
      </Row>

      {selectedRowKeys.length > 0 && (
        <Row gutter={[8, 8]} align="middle" justify="space-between">
          <Col flex="1 1 auto">
            <Space>
              <Typography.Text strong>
                {selectedRowKeys.length} employee(s) selected
              </Typography.Text>
              <Button 
                size="small" 
                onClick={() => setSelectedRowKeys([])}
              >
                Clear Selection
              </Button>
            </Space>
          </Col>
          <Col flex="0 0 auto">
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={onBulkDelete}
              loading={bulkDeleteLoading}
              size="middle"
              style={{ borderRadius: 0 }}
            >
              Delete Selected ({selectedRowKeys.length})
            </Button>
          </Col>
        </Row>
      )}
    </Space>
  );

  const drawerTitle =
    drawerMode === "create"
      ? "Create Employee"
      : drawerMode === "edit"
      ? `Edit Employee (${active?.employee_id ?? ""})`
      : `View Employee (${active?.employee_id ?? ""})`;

  const docsList = useMemo(() => {
    const base = API_BASE_URL || "";
    return (docs ?? []).map((d) => ({
      ...d,
      _absUrl: d.url?.startsWith("http") ? d.url : `${base}${d.url}`,
    }));
  }, [docs]);

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 10 } }}>
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          {toolbar}
          <Divider style={{ margin: "6px 0" }} />

          <div className="employees-table">
            <Table<Employee>
              className="employees-table__table"
              rowKey={(r) => r.employee_id}
              rowClassName={(r) => (Number(r.warning_count ?? 0) >= 3 ? "employees-table__row--warning" : "")}
              columns={columns}
              dataSource={rows}
              loading={loading}
              size="small"
              tableLayout="fixed"
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                selections: [
                  Table.SELECTION_ALL,
                  Table.SELECTION_INVERT,
                  Table.SELECTION_NONE,
                ],
              }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50, 100],
                showTotal: (t) => `${t} employees`,
                onChange: (p, ps) => {
                  setPage(p);
                  setPageSize(ps);
                },
              }}
            />
          </div>
        </Space>
      </Card>

      <Drawer
        title={drawerTitle}
        open={drawerOpen}
        onClose={closeDrawer}
        size="large"
        style={{ width: 720 }}
        destroyOnClose={false}
        placement="right"
        extra={
          <Space>
            <Button onClick={closeDrawer}>Cancel</Button>
            {drawerMode === "view" && active?.employment_status !== "Left" ? (
              <Popconfirm
                title="Mark employee as Left"
                description="This will set employment status to Left. You can then export clearance PDF."
                okText="Set Left"
                onConfirm={() => void markActiveEmployeeLeft()}
              >
                <Button danger>Set status to Left</Button>
              </Popconfirm>
            ) : null}
            {drawerMode === "view" && active?.employment_status === "Left" ? (
              <Button type="primary" onClick={() => void exportActiveEmployeeClearancePdf()}>
                Export Clearance PDF
              </Button>
            ) : null}
            {drawerMode !== "view" && (
              <Button type="primary" onClick={() => void onSubmit()}>
                Save
              </Button>
            )}
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          disabled={readOnly}
          initialValues={{ employment_status: "Active" }}
        >
          <Tabs
            activeKey={activeTabKey}
            onChange={(k) => setActiveTabKey(k)}
            items={[
              {
                key: "basic",
                label: "Basic",
                children: (
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="first_name" label="First name" rules={[{ required: true }]}>
                        <Input placeholder="First name" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="last_name" label="Last name" rules={[{ required: true }]}>
                        <Input placeholder="Last name" />
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
                        <Select
                          allowClear
                          options={["Male", "Female", "Other"].map((v) => ({ label: v, value: v }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="date_of_birth" label="Date of birth" getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}>
                        <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="cnic"
                        label={
                          <Space size={8}>
                            <span>CNIC</span>
                            <Button size="small" type="link" onClick={() => attachDoc("CNIC")} disabled={readOnly}>
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
                            <Button size="small" type="link" onClick={() => attachDoc("Domicile")} disabled={readOnly}>
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
                      <Form.Item name="languages_spoken" label="Languages Spoken">
                        <Select
                          mode="tags"
                          tokenSeparators={[","]}
                          placeholder="e.g. Urdu, English"
                          options={[]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label="Languages + Expertise Level">
                        <Form.List name="languages_proficiency">
                          {(fields, { add, remove }) => (
                            <Space direction="vertical" size={8} style={{ width: "100%" }}>
                              {fields.map((field) => (
                                <Space key={field.key} style={{ display: "flex", width: "100%" }} align="baseline">
                                  <Form.Item
                                    {...field}
                                    name={[field.name, "language"]}
                                    rules={[{ required: true, message: "Language required" }]}
                                    style={{ flex: 1, marginBottom: 0 }}
                                  >
                                    <Input placeholder="Language (e.g. Urdu)" />
                                  </Form.Item>
                                  <Form.Item
                                    {...field}
                                    name={[field.name, "level"]}
                                    rules={[{ required: true, message: "Level required" }]}
                                    style={{ width: 220, marginBottom: 0 }}
                                  >
                                    <Select
                                      placeholder="Level"
                                      options={[
                                        "Beginner",
                                        "Intermediate",
                                        "Advanced",
                                        "Fluent",
                                        "Native",
                                      ].map((v) => ({ label: v, value: v }))}
                                    />
                                  </Form.Item>
                                  {!readOnly && (
                                    <Button danger onClick={() => remove(field.name)}>
                                      Remove
                                    </Button>
                                  )}
                                </Space>
                              ))}

                              {!readOnly && (
                                <Button onClick={() => add({ language: "", level: "" })}>
                                  Add Language
                                </Button>
                              )}
                            </Space>
                          )}
                        </Form.List>
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
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="department" label="Department">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={departments.map((d) => ({ label: d, value: d }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="designation" label="Designation">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={designations.map((d) => ({ label: d, value: d }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="enrolled_as" label="Enrolled as">
                        <Select allowClear options={roleOptions.map((v) => ({ label: v, value: v }))} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="employment_type" label="Employment type">
                        <Input />
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
                      <Form.Item name="introduced_by" label="Introduced by">
                        <Input placeholder="Name / phone" />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item name="remarks" label="Remarks">
                        <Input.TextArea rows={3} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: "contact",
                label: "Contact",
                children: (
                  <Row gutter={12}>
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
                    <Col span={24}>
                      <Form.Item
                        name="previous_employment"
                        label={
                          <Space size={8}>
                            <span>Previous employment</span>
                            <Button
                              size="small"
                              type="link"
                              onClick={() => attachDoc("Previous employment")}
                              disabled={readOnly}
                            >
                              Attach Doc
                            </Button>
                          </Space>
                        }
                      >
                        <Input.TextArea rows={3} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="permanent_address" label="Permanent address">
                        <Input.TextArea rows={2} placeholder="e.g. Flat 12, Rose Apartments" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="temporary_address" label="Temporary address">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Divider style={{ margin: "8px 0" }} />
                    </Col>
                    <Col span={24}>
                      <Typography.Text strong>Permanent address details</Typography.Text>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="permanent_village" label="Village">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="permanent_post_office" label="Post office">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="permanent_thana" label="Thana">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="permanent_tehsil" label="Tehsil">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="permanent_district" label="District">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Divider style={{ margin: "8px 0" }} />
                    </Col>
                    <Col span={24}>
                      <Typography.Text strong>Present address details</Typography.Text>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="present_village" label="Village">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="present_post_office" label="Post office">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="present_thana" label="Thana">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="present_tehsil" label="Tehsil">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="present_district" label="District">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="city" label="City">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="state" label="State">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="postal_code" label="Postal code">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: "service",
                label: "Service",
                children: (
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Item
                          name="retired_from"
                          label={
                            <Space size={8}>
                              <span>Retired from</span>
                              <Button size="small" type="link" onClick={() => attachDoc("Retirement book")} disabled={readOnly}>
                                Attach Retirement book
                              </Button>
                            </Space>
                          }
                        >
                          <Checkbox.Group options={retiredFromOptions} />
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
                          <Input.TextArea rows={2} placeholder="Type here..." />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Space>
                ),
              },
              {
                key: "family",
                label: "Family",
                children: (
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="sons_names" label="Sons names">
                        <Input.TextArea rows={2} placeholder="Comma separated or line breaks" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="daughters_names" label="Daughters names">
                        <Input.TextArea rows={2} placeholder="Comma separated or line breaks" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="brothers_names" label="Brothers names">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="sisters_names" label="Sisters names">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: "verification",
                label: "Verification & Signatures",
                children: (
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item
                        name="particulars_verified_by_sho_on"
                        label={
                          <Space size={8}>
                            <span>Particulars verified by SHO on</span>
                            <Button size="small" type="link" onClick={() => attachDoc("SHO Verification")} disabled={readOnly}>
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
                            <Button size="small" type="link" onClick={() => attachDoc("SSP Verification")} disabled={readOnly}>
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
                              onClick={() => attachDoc("Police Khidmat Verification")}
                              disabled={readOnly}
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
                              onClick={() => attachDoc("Signature of individual")}
                              disabled={readOnly}
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
                      <Form.Item name="fss_number" label="FSS number">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="fss_name" label="FSS name">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="fss_so" label="FSS S/O">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="fingerprint_attested_by" label="Fingerprints attested by">
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
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Typography.Text type="secondary">
                      Upload one-by-one for each finger. These will be saved as documents.
                    </Typography.Text>
                    <Row gutter={12}>
                      {([
                        { key: "thumb", label: "Thumb" },
                        { key: "index", label: "Index" },
                        { key: "middle", label: "Middle" },
                        { key: "ring", label: "Ring" },
                        { key: "little", label: "Little" },
                      ] as const).map((f) => (
                        <Col span={12} key={f.key}>
                          <Card size="small" style={{ borderRadius: 12 }}>
                            <Space direction="vertical" size={8} style={{ width: "100%" }}>
                              <Typography.Text strong>{f.label}</Typography.Text>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  setFingerFiles((p) => ({ ...p, [f.key]: e.target.files?.[0] ?? null }))
                                }
                                disabled={readOnly}
                              />
                              <Button
                                type="primary"
                                onClick={() => {
                                  const file = fingerFiles[f.key];
                                  if (!file) {
                                    msg.error("Please choose a file");
                                    return;
                                  }
                                  void uploadNamedDoc(active?.id ?? null, `Fingerprint - ${f.label}`, file);
                                }}
                                loading={docsLoading}
                                disabled={readOnly}
                              >
                                {active?.id ? "Upload" : "Add"}
                              </Button>
                            </Space>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </Space>
                ),
              },
              {
                key: "pay",
                label: "Payroll",
                children: (
                  <Row gutter={12}>
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
                    <Col span={12}>
                      <Form.Item name="bank_name" label="Bank name">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="account_number" label="Account number">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="account_type" label="Account type">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="tax_id" label="Tax ID">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: "compliance",
                label: "Compliance",
                children: (
                  <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item
                          name="basic_security_training"
                          label={
                            <Space size={8}>
                              <span>Basic security training</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("Basic security training")}
                                disabled={readOnly}
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
                        <Form.Item
                          name="agreement"
                          label={
                            <Space size={8}>
                              <span>Agreement</span>
                              <Button size="small" type="link" onClick={() => attachDoc("Agreement")} disabled={readOnly}>
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
                        <Form.Item
                          name="fire_safety_training"
                          label={
                            <Space size={8}>
                              <span>Fire safety training</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("Fire safety training")}
                                disabled={readOnly}
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
                        <Form.Item
                          name="first_aid_certification"
                          label={
                            <Space size={8}>
                              <span>First aid certification</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("First aid certification")}
                                disabled={readOnly}
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
                        <Form.Item
                          name="guard_card"
                          label={
                            <Space size={8}>
                              <span>Guard card</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("Guard card")}
                                disabled={readOnly}
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
                        <Form.Item
                          name="police_clearance"
                          label={
                            <Space size={8}>
                              <span>Police clearance</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("Police clearance")}
                                disabled={readOnly}
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
                        <Form.Item
                          name="fingerprint_check"
                          label={
                            <Space size={8}>
                              <span>Fingerprint check</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("Fingerprint check")}
                                disabled={readOnly}
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
                        <Form.Item
                          name="background_screening"
                          label={
                            <Space size={8}>
                              <span>Background screening</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("Background screening")}
                                disabled={readOnly}
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
                        <Form.Item
                          name="reference_verification"
                          label={
                            <Space size={8}>
                              <span>Reference verification</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("Reference verification")}
                                disabled={readOnly}
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
                    </Row>

                    <Divider style={{ margin: 0 }} />

                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item
                          name="security_clearance"
                          label={
                            <Space size={8}>
                              <span>Security clearance</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() => attachDoc("Security clearance")}
                                disabled={readOnly}
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
                  </Space>
                ),
              },
              {
                key: "documents",
                label: "Documents",
                children: (
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Card size="small" style={{ borderRadius: 12 }}>
                      <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        <Typography.Text strong>Upload Document</Typography.Text>
                        <Input
                          value={docName}
                          onChange={(e) => setDocName(e.target.value)}
                          placeholder="Document name (your choice)"
                          disabled={readOnly}
                        />
                        <input
                          ref={docFileInputRef}
                          type="file"
                          style={{ display: "none" }}
                          onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                          disabled={readOnly}
                        />
                        <Space>
                          <Button onClick={() => docFileInputRef.current?.click()} disabled={readOnly}>
                            Choose file
                          </Button>
                          <Typography.Text type="secondary">
                            {docFile ? docFile.name : "No file selected"}
                          </Typography.Text>
                        </Space>
                        <Button type="primary" onClick={() => void uploadDocument()} loading={docsLoading} disabled={readOnly}>
                          {active?.id ? "Upload" : "Add"}
                        </Button>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          You can upload PDF, images, or any other file.
                        </Typography.Text>
                        {!active?.id && pendingDocs.length ? (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Pending documents will upload after you save the employee.
                          </Typography.Text>
                        ) : null}
                      </Space>
                    </Card>

                    <Card size="small" style={{ borderRadius: 12 }}>
                      <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <Typography.Text strong>{active?.id ? "Documents" : "Pending Documents"}</Typography.Text>
                          {active?.id ? (
                            <Button onClick={() => void loadDocuments()} loading={docsLoading}>
                              Refresh
                            </Button>
                          ) : null}
                        </Space>

                        {active?.id ? (
                          docsLoading ? (
                            <Spin />
                          ) : docsList.length === 0 ? (
                            <Typography.Text type="secondary">No documents uploaded yet.</Typography.Text>
                          ) : (
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
                                    ...(readOnly
                                      ? []
                                      : [
                                          <Popconfirm
                                            key="delete"
                                            title="Delete document?"
                                            okText="Delete"
                                            okButtonProps={{ danger: true }}
                                            onConfirm={() => void deleteDocument(d)}
                                          >
                                            <Button danger>Delete</Button>
                                          </Popconfirm>,
                                        ]),
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
                          )
                        ) : pendingDocs.length === 0 ? (
                          <Typography.Text type="secondary">No pending documents.</Typography.Text>
                        ) : (
                          <List
                            dataSource={pendingDocs}
                            renderItem={(d, idx) => (
                              <List.Item
                                actions={
                                  readOnly
                                    ? []
                                    : [
                                        <Button key="remove" danger onClick={() => removePendingDoc(idx)}>
                                          Remove
                                        </Button>,
                                      ]
                                }
                              >
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
                  </Space>
                ),
              },
              {
                key: "warnings",
                label: "Warnings",
                children: (
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {!active?.id ? (
                      <Typography.Text type="secondary">Save employee first to add warnings.</Typography.Text>
                    ) : (
                      <>
                        <Card size="small" style={{ borderRadius: 12 }}>
                          <Space direction="vertical" size={8} style={{ width: "100%" }}>
                            <Space style={{ width: "100%", justifyContent: "space-between" }}>
                              <Typography.Text strong>
                                Add Warning ({warnings.length}/3)
                              </Typography.Text>
                              <Button
                                type="primary"
                                size="small"
                                onClick={() => openWarningModal()}
                                disabled={readOnly}
                                loading={warningsLoading}
                              >
                                Add
                              </Button>
                            </Space>
                            <Input
                              value={newWarningNumber}
                              onChange={(e) => setNewWarningNumber(e.target.value)}
                              placeholder="Warning number"
                              disabled={readOnly}
                            />
                            {warnings.length >= 3 ? (
                              <Typography.Text type="danger">Max 3 warnings reached. Employee will be highlighted red.</Typography.Text>
                            ) : null}
                          </Space>
                        </Card>

                        <Card size="small" style={{ borderRadius: 12 }}>
                          <Space direction="vertical" size={10} style={{ width: "100%" }}>
                            <Space style={{ width: "100%", justifyContent: "space-between" }}>
                              <Typography.Text strong>Warnings</Typography.Text>
                              <Button size="small" onClick={() => void loadWarnings()} loading={warningsLoading}>
                                Refresh
                              </Button>
                            </Space>

                            {warningsLoading ? (
                              <Spin />
                            ) : warnings.length === 0 ? (
                              <Typography.Text type="secondary">No warnings.</Typography.Text>
                            ) : (
                              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                                {warnings.map((w) => (
                                  <Card key={w.id} size="small" style={{ borderRadius: 12, background: "#fafafa" }}>
                                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                                        <Typography.Text strong>{w.warning_number}</Typography.Text>
                                        <Space size={8}>
                                          <Button size="small" onClick={() => void exportWarningAsPdf(w)}>
                                            Export PDF
                                          </Button>
                                          {!readOnly ? (
                                            <Popconfirm
                                              title="Delete warning"
                                              description="This will also delete its attachments."
                                              okText="Delete"
                                              okButtonProps={{ danger: true }}
                                              onConfirm={() => void deleteWarning(Number(w.id))}
                                            >
                                              <Button size="small" danger>
                                                Delete
                                              </Button>
                                            </Popconfirm>
                                          ) : null}
                                        </Space>
                                      </Space>

                                      {w.found_with ? (
                                        <Typography.Text>
                                          You were found with {w.found_with}.
                                        </Typography.Text>
                                      ) : null}

                                      <Typography.Text>
                                        You are ordered to improve your conduct in future, otherwise strict action would be taken against you. Your service would be terminated automatically in fifth warning.
                                      </Typography.Text>

                                      {w.supervisor_signature || w.supervisor_signature_date ? (
                                        <Space direction="vertical" size={0} style={{ width: "100%" }}>
                                          {w.supervisor_signature ? (
                                            <Typography.Text type="secondary">
                                              Supervisor signature: {w.supervisor_signature}
                                            </Typography.Text>
                                          ) : null}
                                          {w.supervisor_signature_date ? (
                                            <Typography.Text type="secondary">
                                              Signature date: {w.supervisor_signature_date}
                                            </Typography.Text>
                                          ) : null}
                                        </Space>
                                      ) : null}

                                      <input
                                        ref={(el) => {
                                          warningFileInputRefs.current[Number(w.id)] = el;
                                        }}
                                        type="file"
                                        multiple
                                        disabled={readOnly}
                                        style={{ display: "none" }}
                                        onChange={(e) => {
                                          const files = Array.from(e.target.files ?? []);
                                          e.currentTarget.value = "";
                                          void uploadWarningFiles(Number(w.id), files);
                                        }}
                                      />

                                      <Button
                                        size="small"
                                        disabled={readOnly}
                                        loading={Boolean(warningDocsLoading[Number(w.id)])}
                                        onClick={() => warningFileInputRefs.current[Number(w.id)]?.click()}
                                      >
                                        Choose files
                                      </Button>

                                      {warningDocsLoading[Number(w.id)] ? (
                                        <Spin />
                                      ) : (warningDocsList[Number(w.id)] ?? []).length === 0 ? (
                                        <Typography.Text type="secondary">No attachments.</Typography.Text>
                                      ) : (
                                        <List
                                          size="small"
                                          dataSource={warningDocsList[Number(w.id)]}
                                          renderItem={(d) => (
                                            <List.Item
                                              actions={[
                                                <a key="open" href={d._absUrl} target="_blank" rel="noopener noreferrer">
                                                  Open
                                                </a>,
                                                <a key="download" href={d._absUrl} download={d.filename || "document"}>
                                                  Download
                                                </a>,
                                                !readOnly ? (
                                                  <a key="delete" onClick={() => void deleteWarningDocument(Number(w.id), Number(d.id))}>
                                                    Delete
                                                  </a>
                                                ) : null,
                                              ].filter(Boolean)}
                                            >
                                              <Typography.Text type="secondary">{d.filename}</Typography.Text>
                                            </List.Item>
                                          )}
                                        />
                                      )}
                                    </Space>
                                  </Card>
                                ))}
                              </Space>
                            )}
                          </Space>
                        </Card>
                      </>
                    )}
                  </Space>
                ),
              },
            ]}
          />

          <Modal
            open={warningModalOpen}
            title="WARNING"
            onCancel={() => setWarningModalOpen(false)}
            onOk={() => void submitWarningModal()}
            okText="Save Warning"
            confirmLoading={warningsLoading}
            destroyOnClose
          >
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Form form={warningForm} layout="vertical" size="small" preserve={false}>
                <Row gutter={12}>
                  <Col span={12}>
                    <Typography.Text strong>1. FSS #</Typography.Text>
                    <div>
                      <Typography.Text>{active?.fss_number || "-"}</Typography.Text>
                    </div>
                  </Col>
                  <Col span={12}>
                    <Typography.Text strong>Supv/Guard</Typography.Text>
                    <div>
                      <Typography.Text>{(active ? fullName(active) : "") || "-"}</Typography.Text>
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

                <Card size="small" style={{ borderRadius: 12, background: "#fafafa" }}>
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    <Typography.Text>
                      2. You are order to improve your conduct in future, otherwise strict action would be taken against you. Your services would be terminated automatically on third warning.
                    </Typography.Text>
                  </Space>
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
                    disabled={readOnly}
                  />
                </Form.Item>
              </Form>
            </Space>
          </Modal>

          {drawerMode === "view" && active && (
            <Card style={{ marginTop: 12 }}>
              <Row gutter={12}>
                <Col span={12}>
                  <Typography.Text type="secondary">Employee ID</Typography.Text>
                  <div>
                    <Tag color="blue">{active.employee_id}</Tag>
                  </div>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">Created</Typography.Text>
                  <div>{dayjs(active.created_at).format("YYYY-MM-DD HH:mm")}</div>
                </Col>
              </Row>
            </Card>
          )}
        </Form>
      </Drawer>
    </>
  );
}
