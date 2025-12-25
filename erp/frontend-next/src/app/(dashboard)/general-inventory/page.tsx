"use client";

import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import type { Employee } from "@/lib/types";

type GeneralItem = {
  id: number;
  item_code: string;
  category: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  unit_name: string;
  quantity_on_hand: number;
  min_quantity?: number | null;
  storage_location?: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

type GeneralItemCreate = {
  item_code: string;
  category: string;
  name: string;
  description?: string | null;
  quantity_on_hand: number;
  min_quantity?: number | null;
  storage_location?: string | null;
  status: string;
};

type DrawerMode = "create" | "edit" | "view";

type AllocateLine = {
  item_code?: string;
  quantity?: number;
};

type AllocateFormValues = {
  employee_id?: string;
  notes?: string;
  lines?: AllocateLine[];
  selected_item_codes?: string[];
  quantities?: Record<string, number>;
  allocation_date?: Dayjs;
};

type GeneralTxRow = {
  id: number;
  item_code: string;
  employee_id?: string | null;
  action: string;
  quantity?: number | null;
  notes?: string | null;
  created_at: string;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

function categoryToPrefix(category: string): string {
  const raw = String(category || "").trim();
  if (!raw) return "ITM";

  const parts = raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const letters = parts
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const prefix = (letters || raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase()).slice(0, 3);
  return prefix || "ITM";
}

function suggestItemCode(category: string, rows: Array<{ item_code: string; category: string }>): string {
  const prefix = categoryToPrefix(category);
  let max = 0;
  const re = new RegExp(`^${prefix}[-_ ]?(\\d+)$`, "i");

  for (const r of rows) {
    const code = String(r?.item_code || "").trim();
    const m = code.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }

  const next = String(max + 1).padStart(4, "0");
  return `${prefix}-${next}`;
}

export default function GeneralInventoryPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GeneralItem[]>([]);

  const [exportingPdf, setExportingPdf] = useState(false);

  const [listSearch, setListSearch] = useState("");
  const [listCategory, setListCategory] = useState<string | undefined>(undefined);
  const [listStatus, setListStatus] = useState<string | undefined>(undefined);

  const [employees, setEmployees] = useState<Employee[]>([]);

  const [allocOpen, setAllocOpen] = useState(false);
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocForm] = Form.useForm<AllocateFormValues>();
  const [allocItemSearch, setAllocItemSearch] = useState("");

  const selectedAllocItemCodes = Form.useWatch("selected_item_codes", allocForm) as string[] | undefined;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [active, setActive] = useState<GeneralItem | null>(null);
  const [form] = Form.useForm<GeneralItemCreate>();
  const [itemCodeTouched, setItemCodeTouched] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const baseCategoryOptions = useMemo(
    () => [
      { label: "Uniform", value: "uniform" },
      { label: "Boot", value: "boot" },
      { label: "Cap", value: "cap" },
      { label: "Belt", value: "belt" },
      { label: "Title Shoulder", value: "title_shoulder" },
      { label: "Pak Flag", value: "pak_flag" },
      { label: "Wings", value: "wings" },
      { label: "Karate Sign", value: "karate_sign" },
      { label: "Civil Clothes", value: "civil_clothes" },
      { label: "Vest Coat Black", value: "vest_coat_black" },
      { label: "Rain Coat", value: "rain_coat" },
      { label: "Jersey Pullover", value: "jersey_pullover" },
      { label: "Jacket Cold Weather", value: "jacket_cold_weather" },
      { label: "Sling", value: "sling" },
      { label: "Pouch Ammo", value: "pouch_ammo" },
      { label: "Bag", value: "bag" },
      { label: "Walkie Talkie", value: "walkie_talkie" },
      { label: "Flashlight", value: "flashlight" },
      { label: "Other", value: "other" },
    ],
    []
  );

  const [categories, setCategories] = useState<string[]>([]);
  const [customCategory, setCustomCategory] = useState("");

  const nameWatch = Form.useWatch("name", form);

  const loadEmployees = useCallback(async () => {
    try {
      const data = await api.get<{ employees: Employee[] }>("/api/employees/", { query: { limit: 500 } });
      setEmployees(Array.isArray(data?.employees) ? data.employees : []);
    } catch {
      setEmployees([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<GeneralItem[]>("/api/general-inventory/items");
      setRows(Array.isArray(data) ? data : []);

      try {
        const cats = await api.get<string[]>("/api/general-inventory/categories");
        setCategories(Array.isArray(cats) ? cats : []);
      } catch {
        setCategories([]);
      }
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void load();
    void loadEmployees();
  }, [load, loadEmployees]);

  const openAllocate = useCallback(() => {
    setAllocItemSearch("");
    allocForm.resetFields();
    allocForm.setFieldsValue({
      employee_id: undefined,
      notes: "",
      selected_item_codes: [],
      quantities: {},
      allocation_date: dayjs(),
    });
    setAllocOpen(true);
  }, [allocForm]);

  const itemsByCode = useMemo(() => {
    const m = new Map<string, GeneralItem>();
    for (const r of rows) m.set(r.item_code, r);
    return m;
  }, [rows]);

  const itemOptions = useMemo(() => {
    return rows
      .map((r) => ({ value: r.item_code, label: `${r.item_code} - ${r.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const allocFilteredRows = useMemo(() => {
    const q = String(allocItemSearch || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.name ?? ""} ${r.item_code ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allocItemSearch, rows]);

  const submitAllocation = useCallback(async () => {
    const v = await allocForm.validateFields();
    const employee_id = (v.employee_id || "").trim();
    if (!employee_id) {
      msg.error("Employee is required");
      return;
    }

    const selected = Array.isArray(v.selected_item_codes) ? v.selected_item_codes : [];
    if (selected.length === 0) {
      msg.error("Please select at least one item");
      return;
    }

    setAllocLoading(true);
    try {
      // Warn if employee already received same item within last 6 months
      try {
        const cutoff = dayjs().subtract(6, "month");
        const txs = await api.get<GeneralTxRow[]>("/api/general-inventory/transactions", {
          query: { employee_id, limit: 500 },
        });

        const issues = (Array.isArray(txs) ? txs : []).filter((t) => String(t.action || "") === "ISSUE");
        const recent = issues.filter((t) => {
          const d = dayjs(String(t.created_at));
          return d.isValid() && d.isAfter(cutoff);
        });

        const byItem = new Map<string, { totalQty: number; lastAt: string }>();
        for (const t of recent) {
          const code = String(t.item_code || "").trim();
          if (!code) continue;
          const prev = byItem.get(code);
          const qty = Number(t.quantity ?? 0);
          const createdAt = String(t.created_at || "");

          if (!prev) {
            byItem.set(code, { totalQty: Number.isFinite(qty) ? qty : 0, lastAt: createdAt });
            continue;
          }

          prev.totalQty += Number.isFinite(qty) ? qty : 0;
          if (dayjs(createdAt).isAfter(dayjs(prev.lastAt))) prev.lastAt = createdAt;
        }

        const warnings = selected
          .map((c) => String(c || "").trim())
          .filter(Boolean)
          .map((code) => ({ code, info: byItem.get(code) }))
          .filter((x) => Boolean(x.info))
          .map((x) => ({
            code: x.code,
            name: itemsByCode.get(x.code)?.name || x.code,
            info: x.info as { totalQty: number; lastAt: string },
          })) as Array<{ code: string; name: string; info: { totalQty: number; lastAt: string } }>;

        if (warnings.length > 0) {
          const ok = await new Promise<boolean>((resolve) => {
            Modal.confirm({
              title: (
                <Space size={8}>
                  <ExclamationCircleOutlined style={{ color: "#faad14", fontSize: 16 }} />
                  <Typography.Text strong>Already issued in last 6 months</Typography.Text>
                </Space>
              ),
              icon: null,
              content: (
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Typography.Text type="secondary">
                    This employee has already taken the following item(s) recently:
                  </Typography.Text>

                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    {warnings.map((w) => {
                      const dt = dayjs(w.info.lastAt);
                      const when = dt.isValid() ? dt.format("YYYY-MM-DD HH:mm") : String(w.info.lastAt);
                      return (
                        <Card
                          key={w.code}
                          size="small"
                          variant="outlined"
                          style={{ borderRadius: 0 }}
                          styles={{ body: { padding: 10 } }}
                        >
                          <Row gutter={[8, 4]} align="middle">
                            <Col flex="none">
                              <Tag color="gold">{w.code}</Tag>
                            </Col>
                            <Col flex="auto">
                              <Typography.Text strong>{w.name}</Typography.Text>
                              <Typography.Text style={{ display: "block" }}>
                                Taken qty <Typography.Text strong>{Number(w.info.totalQty ?? 0)}</Typography.Text>
                              </Typography.Text>
                            </Col>
                            <Col flex="none">
                              <Tag color="blue" icon={<ClockCircleOutlined />}>
                                {when}
                              </Tag>
                            </Col>
                          </Row>
                        </Card>
                      );
                    })}
                  </Space>

                  <Typography.Text>Do you want to allocate again?</Typography.Text>
                </Space>
              ),
              okText: "Allocate",
              cancelText: "Cancel",
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });

          if (!ok) {
            setAllocLoading(false);
            return;
          }
        }
      } catch {
        // ignore history check errors (do not block allocation)
      }

      for (const code of selected) {
        const itemCode = String(code || "").trim();
        if (!itemCode) continue;

        const qty = Number((v.quantities as any)?.[itemCode] ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Enter quantity for ${itemCode}`);

        const item = itemsByCode.get(itemCode);
        if (!item) throw new Error(`Item not found: ${itemCode}`);

        const availableQty = Number(item.quantity_on_hand ?? 0);
        if (qty > availableQty) throw new Error(`Not available stock quantity for ${itemCode}`);

        await api.post(`/api/general-inventory/items/${encodeURIComponent(itemCode)}/issue`, {
          employee_id,
          quantity: qty,
          notes: v.notes?.trim() || undefined,
        });
      }

      msg.success("Allocated");
      setAllocOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Allocation failed"));
    } finally {
      setAllocLoading(false);
    }
  }, [allocForm, itemsByCode, load, msg]);

  const openCreate = useCallback(() => {
    setDrawerMode("create");
    setActive(null);
    setItemCodeTouched(false);
    setImageFile(null);
    setImagePreviewUrl(null);
    form.resetFields();
    const initialName = "uniform";
    form.setFieldsValue({
      item_code: suggestItemCode(initialName, rows),
      category: initialName,
      name: initialName,
      description: null,
      quantity_on_hand: 0,
      min_quantity: null,
      storage_location: null,
      status: "Active",
    });
    setDrawerOpen(true);
  }, [form, rows]);

  const openEdit = useCallback(
    (r: GeneralItem) => {
      setDrawerMode("edit");
      setActive(r);
      setItemCodeTouched(false);
      setImageFile(null);
      const base = API_BASE_URL || "";
      const abs = r.image_url ? (r.image_url.startsWith("http") ? r.image_url : `${base}${r.image_url}`) : null;
      setImagePreviewUrl(abs);
      form.resetFields();
      form.setFieldsValue({
        item_code: r.item_code,
        category: r.category,
        name: r.name,
        description: r.description ?? null,
        quantity_on_hand: r.quantity_on_hand,
        min_quantity: r.min_quantity ?? null,
        storage_location: r.storage_location ?? null,
        status: r.status,
      });
      setDrawerOpen(true);
    },
    [form]
  );

  const openView = useCallback(
    (r: GeneralItem) => {
      setDrawerMode("view");
      setActive(r);
      setItemCodeTouched(false);
      setImageFile(null);
      const base = API_BASE_URL || "";
      const abs = r.image_url ? (r.image_url.startsWith("http") ? r.image_url : `${base}${r.image_url}`) : null;
      setImagePreviewUrl(abs);
      form.resetFields();
      form.setFieldsValue({
        item_code: r.item_code,
        category: r.category,
        name: r.name,
        description: r.description ?? null,
        quantity_on_hand: r.quantity_on_hand,
        min_quantity: r.min_quantity ?? null,
        storage_location: r.storage_location ?? null,
        status: r.status,
      });
      setDrawerOpen(true);
    },
    [form]
  );

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(imagePreviewUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (!drawerOpen) return;
    if (drawerMode !== "create") return;
    if (itemCodeTouched) return;

    const n = String(nameWatch || "").trim();
    if (!n) return;
    form.setFieldValue("category", n);
    form.setFieldValue("item_code", suggestItemCode(n, rows));
  }, [drawerMode, drawerOpen, form, itemCodeTouched, nameWatch, rows]);

  const onSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();

      if ((values as any)?.name && !(values as any)?.category) {
        (values as any).category = (values as any).name;
      }

      let saved: GeneralItem | null = null;
      if (drawerMode === "create") {
        saved = await api.post<GeneralItem>("/api/general-inventory/items", values);
        msg.success("Item created");
      } else {
        if (!active) return;
        saved = await api.put<GeneralItem>(`/api/general-inventory/items/${encodeURIComponent(active.item_code)}`, {
          category: (values as any).category,
          name: (values as any).name,
          description: (values as any).description,
          quantity_on_hand: (values as any).quantity_on_hand,
          min_quantity: (values as any).min_quantity,
          storage_location: (values as any).storage_location,
          status: (values as any).status,
        });
        msg.success("Item updated");
      }

      const itemCode = saved?.item_code || active?.item_code;
      if (imageFile && itemCode) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;

        const res = await fetch(`${API_BASE_URL}/api/general-inventory/items/${encodeURIComponent(itemCode)}/image`, {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: fd,
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `Image upload failed (${res.status})`);
        }

        const updated = (await res.json()) as GeneralItem;
        setActive(updated);
        const base = API_BASE_URL || "";
        const abs = updated.image_url ? (updated.image_url.startsWith("http") ? updated.image_url : `${base}${updated.image_url}`) : null;
        setImagePreviewUrl(abs);
        setImageFile(null);
      }

      setDrawerOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [active, drawerMode, form, imageFile, load, msg]);

  const onDelete = useCallback(
    async (r: GeneralItem) => {
      try {
        await api.del<{ message: string }>(`/api/general-inventory/items/${encodeURIComponent(r.item_code)}`);
        msg.success("Item deleted");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Delete failed"));
      }
    },
    [load, msg]
  );

  const columns = useMemo<ColumnsType<GeneralItem>>(
    () => [
      {
        title: "Code",
        dataIndex: "item_code",
        width: 140,
        render: (v) => <Tag color="blue">{String(v)}</Tag>,
      },
      { title: "Category", dataIndex: "category", width: 140, ellipsis: true },
      { title: "Name", dataIndex: "name", ellipsis: true },
      {
        title: "Stock",
        width: 140,
        render: (_, r) => (
          <Tag color={typeof r.min_quantity === "number" && r.quantity_on_hand <= r.min_quantity ? "red" : "green"}>
            {Number(r.quantity_on_hand ?? 0).toFixed(0)} {r.unit_name}
          </Tag>
        ),
      },
      {
        key: "actions",
        title: "",
        width: 118,
        render: (_, r) => (
          <Space size={4}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
            <Button size="small" icon={<EditOutlined />} style={{ color: "#183c70" }} onClick={() => openEdit(r)} />
            <Popconfirm title="Delete this item?" onConfirm={() => void onDelete(r)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [onDelete, openEdit, openView]
  );

  const categoryFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = String(r.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ label: c, value: c }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = String(listSearch || "").trim().toLowerCase();
    return rows.filter((r) => {
      if (listCategory && String(r.category || "") !== listCategory) return false;
      if (listStatus && String(r.status || "") !== listStatus) return false;
      if (!q) return true;

      const hay = `${r.item_code} ${r.category} ${r.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [listCategory, listSearch, listStatus, rows]);

  const employeeOptions = useMemo(() => {
    return employees.map((e) => ({
      value: e.employee_id,
      label: `${e.employee_id} - ${e.first_name} ${e.last_name}`,
    }));
  }, [employees]);

  const exportPdf = useCallback(async () => {
    setExportingPdf(true);
    try {
      const imgToDataUrl = async (url: string): Promise<string> => {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Logo not found");
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Failed to read logo"));
          reader.readAsDataURL(blob);
        });
      };

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      let logoDataUrl: string | null = null;
      try {
        logoDataUrl = await imgToDataUrl("/logo-removebg-preview.png");
      } catch {
        logoDataUrl = null;
      }

      const title = "General Inventory";
      const generatedAt = dayjs().format("YYYY-MM-DD HH:mm");

      const marginX = 40;
      const headerTop = 32;
      const logoSize = 44;
      const headerH = 62;

      const drawHeader = (data: any) => {
        const y = headerTop;

        doc.setDrawColor(230);
        doc.setLineWidth(1);
        doc.line(marginX, y + headerH, pageW - marginX, y + headerH);

        if (logoDataUrl) {
          try {
            doc.addImage(logoDataUrl, "PNG", marginX, y, logoSize, logoSize);
          } catch {
            // ignore image errors
          }
        }

        const titleX = marginX + (logoDataUrl ? logoSize + 12 : 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(title, titleX, y + 18);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(90);
        doc.text(`Generated: ${generatedAt}`, titleX, y + 34);

        const filters = [
          listCategory ? `Category: ${String(listCategory)}` : null,
          listStatus ? `Status: ${String(listStatus)}` : null,
          listSearch ? `Search: ${String(listSearch)}` : null,
        ].filter(Boolean) as string[];
        if (filters.length > 0) {
          doc.text(filters.join("   "), titleX, y + 48);
        }

        doc.setTextColor(0);

        const pageNum = data?.pageNumber ? Number(data.pageNumber) : 1;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(90);
        doc.text(`Page ${pageNum}`, pageW - marginX, y + 18, { align: "right" });
        doc.setTextColor(0);
      };

      const body = filteredRows.map((r) => [
        String(r.item_code || ""),
        String(r.category || ""),
        String(r.name || ""),
        `${Number(r.quantity_on_hand ?? 0)} ${String(r.unit_name || "")}`.trim(),
      ]);

      autoTable(doc, {
        head: [["Code", "Category", "Name", "Stock"]],
        body,
        startY: headerTop + headerH + 14,
        margin: { left: marginX, right: marginX },
        styles: { font: "helvetica", fontSize: 10, cellPadding: 6, overflow: "linebreak" },
        headStyles: { fillColor: [22, 119, 255], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 120 },
          2: { cellWidth: "auto" },
          3: { cellWidth: 110, halign: "right" },
        },
        didDrawPage: (data) => {
          drawHeader(data as any);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(120);
          doc.text("Flash ERP", marginX, pageH - 24);
          doc.text("Confidential", pageW - marginX, pageH - 24, { align: "right" });
          doc.setTextColor(0);
        },
      });

      doc.save(`general-inventory-${dayjs().format("YYYYMMDD-HHmm")}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    } finally {
      setExportingPdf(false);
    }
  }, [filteredRows, listCategory, listSearch, listStatus, msg]);

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Space size={8} wrap>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  General Inventory
                </Typography.Title>
                <Badge count={filteredRows.length} showZero color="#1677ff" style={{ boxShadow: "none" }} />
                {filteredRows.length !== rows.length ? (
                  <Typography.Text type="secondary">of {rows.length}</Typography.Text>
                ) : null}
              </Space>
            </Col>
            <Col>
              <Space size={6} wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button loading={exportingPdf} disabled={filteredRows.length === 0} onClick={() => void exportPdf()}>
                  Export PDF
                </Button>
                <Button onClick={openAllocate}>
                  Allocate Items
                </Button>
                <Button onClick={() => router.push("/general-inventory/employee-allocations")}>
                  Employee Allocations
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  New
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={[8, 8]} align="middle">
            <Col xs={24} md={10}>
              <Input
                placeholder="Search code / category / name"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} md={7}>
              <Select
                placeholder="Filter category"
                value={listCategory}
                onChange={(v) => setListCategory(v)}
                allowClear
                options={categoryFilterOptions}
                style={{ width: "100%" }}
              />
            </Col>
            <Col xs={24} md={5}>
              <Select
                placeholder="Filter status"
                value={listStatus}
                onChange={(v) => setListStatus(v)}
                allowClear
                options={[
                  { label: "Active", value: "Active" },
                  { label: "Inactive", value: "Inactive" },
                ]}
                style={{ width: "100%" }}
              />
            </Col>
            <Col xs={24} md={2} style={{ textAlign: "right" }}>
              <Button
                onClick={() => {
                  setListSearch("");
                  setListCategory(undefined);
                  setListStatus(undefined);
                }}
              >
                Clear
              </Button>
            </Col>
          </Row>

          <Table
            rowKey={(r) => r.id}
            size="small"
            loading={loading}
            dataSource={filteredRows}
            columns={columns}
            pagination={false}
            rowClassName={(r) => {
              if (typeof r.min_quantity === "number" && Number(r.quantity_on_hand ?? 0) <= r.min_quantity) return "row-low";
              return "";
            }}
          />
        </Space>
      </Card>

      <style>
        {".row-low td { background: #fff2f0 !important; }\n.alloc-sticky { position: sticky; top: 0; z-index: 2; background: #fff; padding-top: 4px; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #f0f0f0; }"}
      </style>

      <Drawer
        title={
          drawerMode === "create"
            ? "New General Item"
            : drawerMode === "edit"
              ? `Edit: ${active?.item_code ?? ""}`
              : `View: ${active?.item_code ?? ""}`
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="right"
        width={860}
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
            <Col xs={24} md={8}>
              <Form.Item name="item_code" label="Item Code" rules={[{ required: true }]}>
                <Input
                  disabled={drawerMode === "edit"}
                  placeholder="AUTO"
                  onChange={() => {
                    if (drawerMode === "create") setItemCodeTouched(true);
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={Array.from(
                    new Map(
                      [
                        ...baseCategoryOptions,
                        ...categories.map((c) => ({ label: c, value: c })),
                      ].map((o) => [String(o.value), o])
                    ).values()
                  )}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <div style={{ display: "flex", gap: 8, padding: 8 }}>
                        <Input
                          placeholder="Add custom name"
                          value={customCategory}
                          onChange={(e) => setCustomCategory(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const v = customCategory.trim();
                            if (!v) return;
                            setCategories((prev) => (prev.includes(v) ? prev : [v, ...prev]));
                            form.setFieldValue("name", v);
                            form.setFieldValue("category", v);
                            if (drawerMode === "create" && !itemCodeTouched) {
                              form.setFieldValue("item_code", suggestItemCode(v, rows));
                            }
                            setCustomCategory("");
                          }}
                        />
                        <Button
                          type="primary"
                          onClick={() => {
                            const v = customCategory.trim();
                            if (!v) return;
                            setCategories((prev) => (prev.includes(v) ? prev : [v, ...prev]));
                            form.setFieldValue("name", v);
                            form.setFieldValue("category", v);
                            if (drawerMode === "create" && !itemCodeTouched) {
                              form.setFieldValue("item_code", suggestItemCode(v, rows));
                            }
                            setCustomCategory("");
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    </>
                  )}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select options={[{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }]} />
              </Form.Item>
            </Col>

            <Form.Item name="category" hidden rules={[{ required: true }]}>
              <Input />
            </Form.Item>

            <Col xs={24} md={8}>
              <Form.Item label="Image">
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={drawerMode === "view"}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setImageFile(f);
                      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
                        try {
                          URL.revokeObjectURL(imagePreviewUrl);
                        } catch {
                          // ignore
                        }
                      }
                      setImagePreviewUrl(f ? URL.createObjectURL(f) : null);
                    }}
                  />
                  {imagePreviewUrl ? (
                    <Image
                      src={imagePreviewUrl}
                      alt="Item"
                      width={160}
                      height={160}
                      style={{ objectFit: "cover", border: "1px solid #f0f0f0" }}
                    />
                  ) : (
                    <Typography.Text type="secondary">No image</Typography.Text>
                  )}
                </Space>
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="quantity_on_hand" label="Qty On Hand" rules={[{ required: true }]}>
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="min_quantity" label="Min Qty">
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="storage_location" label="Storage Location">
                <Input placeholder="Office / Store" />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      <Drawer
        title="Allocate Items"
        open={allocOpen}
        onClose={() => setAllocOpen(false)}
        placement="right"
        width={820}
        extra={
          <Space size={8} wrap>
            <Input
              placeholder="Search item name / code"
              value={allocItemSearch}
              onChange={(e) => setAllocItemSearch(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
            <Button onClick={() => setAllocOpen(false)}>Cancel</Button>
            <Button type="primary" loading={allocLoading} onClick={() => void submitAllocation()}>
              Allocate
            </Button>
          </Space>
        }
      >
        <Form form={allocForm} layout="vertical">
          <div className="alloc-sticky">
            <Row gutter={[12, 0]}>
              <Col xs={24} md={14}>
                <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select employee"
                    options={employeeOptions}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={10}>
                <Form.Item name="notes" label="Notes">
                  <Input placeholder="Optional notes" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 0]}>
              <Col xs={24} md={10}>
                <Form.Item name="allocation_date" label="Date" rules={[{ required: true }]}>
                  <DatePicker showTime style={{ width: "100%" }} disabled />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <Form.Item name="selected_item_codes" style={{ marginBottom: 0 }}>
            <Table<GeneralItem>
              className="alloc-items-table"
              rowKey={(r) => r.item_code}
              size="small"
              dataSource={allocFilteredRows}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedAllocItemCodes || [],
                onChange: (keys) => {
                  allocForm.setFieldValue(
                    "selected_item_codes",
                    (keys as Array<string | number>).map((k) => String(k))
                  );
                },
              }}
              columns={[
                {
                  title: "Item",
                  dataIndex: "item_code",
                  width: 280,
                  render: (_, r) => (
                    <Space direction="vertical" size={0}>
                      <Typography.Text strong>{r.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {r.item_code}
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  title: "Available",
                  width: 120,
                  render: (_, r) => <Typography.Text>{Number(r.quantity_on_hand ?? 0)}</Typography.Text>,
                },
                {
                  title: "Qty",
                  width: 160,
                  render: (_, r) => {
                    const code = String(r.item_code);
                    const isSelected = (selectedAllocItemCodes || []).includes(code);
                    const availableQty = Number(r.quantity_on_hand ?? 0);

                    return (
                      <Form.Item
                        name={["quantities", code]}
                        style={{ marginBottom: 0 }}
                        rules={[
                          {
                            validator: async (_, value) => {
                              if (!isSelected) return Promise.resolve();
                              const qty = Number(value ?? 0);
                              if (!Number.isFinite(qty) || qty <= 0) {
                                return Promise.reject(new Error("Enter qty"));
                              }
                              if (qty > availableQty) {
                                return Promise.reject(new Error("Not available that qty stock"));
                              }
                              return Promise.resolve();
                            },
                          },
                        ]}
                      >
                        <InputNumber min={1} disabled={!isSelected} style={{ width: "100%" }} />
                      </Form.Item>
                    );
                  },
                },
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
