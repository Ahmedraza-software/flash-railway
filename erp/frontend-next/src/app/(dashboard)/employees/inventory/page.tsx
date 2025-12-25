"use client";

import { Button, Card, Col, Collapse, DatePicker, Input, Pagination, Row, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import type { Employee2 } from "@/lib/types";

type RestrictedIssuedSerialRow = {
  serial_unit_id: number;
  item_code: string;
  item_name: string;
  category: string;
  serial_number: string;
  status: string;
  created_at: string;
};

type RestrictedIssuedQtyRow = {
  item_code: string;
  item_name: string;
  category: string;
  unit_name: string;
  quantity_issued: number;
};

type RestrictedIssuedInventory = {
  employee_id: string;
  serial_items: RestrictedIssuedSerialRow[];
  quantity_items: RestrictedIssuedQtyRow[];
};

type GeneralItem = {
  item_code: string;
  name: string;
  unit_name: string;
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

type RestrictedTxRow = {
  id: number;
  item_code: string;
  employee_id?: string | null;
  serial_unit_id?: number | null;
  action: string;
  quantity?: number | null;
  notes?: string | null;
  created_at: string;
};

type GeneralAllocationRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  item_code: string;
  item_name: string;
  unit_name: string;
  quantity: number;
  notes: string;
  created_at: string;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

export default function EmployeeInventoryPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee2[]>([]);
  const [restrictedIssued, setRestrictedIssued] = useState<RestrictedIssuedInventory[]>([]);
  const [generalRows, setGeneralRows] = useState<GeneralAllocationRow[]>([]);
  const [search, setSearch] = useState("");
  const [exportingByEmployee, setExportingByEmployee] = useState<Record<string, boolean>>({});
  const [exportingAllPdf, setExportingAllPdf] = useState(false);
  const [dateRange, setDateRange] = useState<any>(null);
  const [restrictedTx, setRestrictedTx] = useState<RestrictedTxRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [employeesRes, restrictedRes, itemsRes, txRes, restrictedTxRes] = await Promise.all([
        api.get<{ employees: Employee2[] }>("/api/employees2/", { query: { limit: 500 } }),
        api.get<RestrictedIssuedInventory[]>("/api/restricted-inventory/issued"),
        api.get<GeneralItem[]>("/api/general-inventory/items"),
        api.get<GeneralTxRow[]>("/api/general-inventory/transactions", { query: { limit: 5000 } }),
        api.get<RestrictedTxRow[]>("/api/restricted-inventory/transactions", { query: { limit: 5000 } }),
      ]);

      const emps = Array.isArray(employeesRes?.employees) ? employeesRes.employees : [];
      setEmployees(emps);
      setRestrictedIssued(Array.isArray(restrictedRes) ? restrictedRes : []);
      setRestrictedTx(Array.isArray(restrictedTxRes) ? restrictedTxRes : []);

      const itemByCode = new Map<string, GeneralItem>();
      for (const it of Array.isArray(itemsRes) ? itemsRes : []) itemByCode.set(String(it.item_code), it);

      const empById = new Map<string, Employee2>();
      for (const e of emps) empById.set(String(e.fss_no || e.serial_no || e.id), e);

      const txs = Array.isArray(txRes) ? txRes : [];

      const byKey = new Map<
        string,
        {
          employee_id: string;
          item_code: string;
          qty: number;
          lastIssueAt: string;
          lastIssueNote: string;
        }
      >();

      for (const t of txs) {
        const action = String(t.action || "").toUpperCase();
        if (action !== "ISSUE" && action !== "RETURN") continue;

        const employeeId = String(t.employee_id || "").trim();
        const itemCode = String(t.item_code || "").trim();
        if (!employeeId || !itemCode) continue;

        const qty = Number(t.quantity ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const key = `${employeeId}__${itemCode}`;
        const prev = byKey.get(key) || { employee_id: employeeId, item_code: itemCode, qty: 0, lastIssueAt: "", lastIssueNote: "" };

        if (action === "ISSUE") {
          prev.qty += qty;
          const createdAt = String(t.created_at || "");
          if (!prev.lastIssueAt || String(createdAt).localeCompare(String(prev.lastIssueAt)) > 0) {
            prev.lastIssueAt = createdAt;
            prev.lastIssueNote = String(t.notes || "");
          }
        } else {
          prev.qty -= qty;
        }
        byKey.set(key, prev);
      }

      const rowsOut: GeneralAllocationRow[] = Array.from(byKey.values())
        .filter((v) => Number(v.qty) > 0)
        .map((v) => {
          const emp = empById.get(String(v.employee_id));
          const employee_name = emp ? emp.name : v.employee_id;
          const item = itemByCode.get(String(v.item_code));
          return {
            id: `${v.employee_id}__${v.item_code}`,
            employee_id: v.employee_id,
            employee_name,
            item_code: v.item_code,
            item_name: item?.name || v.item_code,
            unit_name: item?.unit_name || "unit",
            quantity: Number(v.qty),
            notes: v.lastIssueNote || "-",
            created_at: v.lastIssueAt,
          };
        });

      rowsOut.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setGeneralRows(rowsOut);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load employee inventory"));
      setEmployees([]);
      setRestrictedIssued([]);
      setGeneralRows([]);
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void load();
  }, [load]);

  const empNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(String(e.fss_no || e.serial_no || e.id), e.name);
    return m;
  }, [employees]);

  const empSerialNoById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(String(e.fss_no || e.serial_no || e.id), String(e.serial_no || ""));
    return m;
  }, [employees]);

  const byEmployee = useMemo(() => {
    const restrictedMap = new Map<string, RestrictedIssuedInventory>();
    for (const r of restrictedIssued) restrictedMap.set(String(r.employee_id), r);

    const restrictedLastIssueBySerial = new Map<number, string>();
    const restrictedLastIssueByQtyKey = new Map<string, string>();

    for (const t of Array.isArray(restrictedTx) ? restrictedTx : []) {
      const action = String(t.action || "").toUpperCase();
      if (action !== "ISSUE") continue;

      const createdAt = String(t.created_at || "");
      const serialId = Number(t.serial_unit_id ?? 0);
      if (Number.isFinite(serialId) && serialId > 0) {
        const prev = restrictedLastIssueBySerial.get(serialId);
        if (!prev || String(createdAt).localeCompare(String(prev)) > 0) {
          restrictedLastIssueBySerial.set(serialId, createdAt);
        }
      }

      const employeeId = String(t.employee_id || "").trim();
      const itemCode = String(t.item_code || "").trim();
      if (employeeId && itemCode && !serialId) {
        const key = `${employeeId}__${itemCode}`;
        const prev = restrictedLastIssueByQtyKey.get(key);
        if (!prev || String(createdAt).localeCompare(String(prev)) > 0) {
          restrictedLastIssueByQtyKey.set(key, createdAt);
        }
      }
    }

    const generalMap = new Map<string, GeneralAllocationRow[]>();
    for (const r of generalRows) {
      const eid = String(r.employee_id);
      const prev = generalMap.get(eid) || [];
      prev.push(r);
      generalMap.set(eid, prev);
    }

    const allEmployeeIds = new Set<string>();
    for (const e of employees) allEmployeeIds.add(String(e.fss_no || e.serial_no || e.id));
    for (const r of restrictedIssued) allEmployeeIds.add(String(r.employee_id));
    for (const r of generalRows) allEmployeeIds.add(String(r.employee_id));

    const q = String(search || "").trim().toLowerCase();

    const start = dateRange?.[0] ? dayjs(dateRange[0]).startOf("day") : null;
    const end = dateRange?.[1] ? dayjs(dateRange[1]).endOf("day") : null;
    const inRange = (ts: string | null | undefined): boolean => {
      if (!start && !end) return true;
      const d = dayjs(String(ts || ""));
      if (!d.isValid()) return true;
      if (start && d.isBefore(start)) return false;
      if (end && d.isAfter(end)) return false;
      return true;
    };

    const out = Array.from(allEmployeeIds)
      .map((eid) => {
        const employee_name = empNameById.get(eid) || eid;
        const serial_no = empSerialNoById.get(eid) || "";
        const restrictedBase = restrictedMap.get(eid) || { employee_id: eid, serial_items: [], quantity_items: [] };

        const serial_items = (restrictedBase.serial_items ?? [])
          .map((s) => {
            const mapped = restrictedLastIssueBySerial.get(Number((s as any).serial_unit_id ?? 0));
            return { ...s, created_at: mapped || (s as any).created_at };
          })
          .filter((s) => inRange((s as any)?.created_at));

        const qty_items = (restrictedBase.quantity_items ?? []).filter((it) => {
          if (!start && !end) return true;
          const key = `${eid}__${String((it as any).item_code || "")}`;
          const lastIssueAt = restrictedLastIssueByQtyKey.get(key);
          if (!lastIssueAt) return false;
          return inRange(lastIssueAt);
        });

        const restricted = {
          ...restrictedBase,
          serial_items,
          quantity_items: qty_items,
        };
        const general = (generalMap.get(eid) || []).filter((r) => inRange((r as any)?.created_at));
        const restrictedCount = Number((restricted.serial_items?.length ?? 0) + (restricted.quantity_items?.length ?? 0));
        const generalCount = Number(general?.length ?? 0);
        const totalCount = restrictedCount + generalCount;
        return { employee_id: eid, employee_name, serial_no, restricted, general, _totalCount: totalCount };
      })
      .filter((g) => {
        if (!start && !end) return true;
        return Number((g as any)._totalCount ?? 0) > 0;
      })
      .filter((g) => {
        if (!q) return true;
        const hay = `${g.employee_name} ${g.employee_id}`.toLowerCase();
        if (hay.includes(q)) return true;
        for (const s of g.restricted.serial_items ?? []) {
          if (`${s.item_code} ${s.item_name} ${s.serial_number} ${s.status}`.toLowerCase().includes(q)) return true;
        }
        for (const it of g.restricted.quantity_items ?? []) {
          if (`${it.item_code} ${it.item_name} ${it.unit_name}`.toLowerCase().includes(q)) return true;
        }
        for (const it of g.general ?? []) {
          if (`${it.item_code} ${it.item_name} ${it.notes} ${it.created_at}`.toLowerCase().includes(q)) return true;
        }
        return false;
      });

    out.sort((a, b) => {
      const aNum = parseInt(a.serial_no, 10);
      const bNum = parseInt(b.serial_no, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return a.employee_name.localeCompare(b.employee_name);
    });
    return out;
  }, [dateRange, empNameById, empSerialNoById, employees, generalRows, restrictedIssued, restrictedTx, search]);

  const exportAllProfessionalPdf = useCallback(async () => {
    setExportingAllPdf(true);
    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;
      const url = `${API_BASE_URL}/api/exports/inventory/employees/pdf?include_zero=true`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = href;
      a.download = `employee-inventory-${dayjs().format("YYYYMMDD-HHmm")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    } finally {
      setExportingAllPdf(false);
    }
  }, [msg]);

  const generalColumns: ColumnsType<GeneralAllocationRow> = useMemo(
    () => [
      {
        title: "Item",
        key: "item",
        render: (_, r) => (
          <Typography.Text>
            <b>{r.item_code}</b> {r.item_name ? `- ${r.item_name}` : ""}
          </Typography.Text>
        ),
        ellipsis: true,
      },
      {
        title: "Issued",
        key: "issued",
        width: 160,
        render: (_, r) => <Tag color="gold">{Number(r.quantity ?? 0)} {r.unit_name || "unit"}</Tag>,
      },
      {
        title: "Note",
        dataIndex: "notes",
        key: "notes",
        ellipsis: true,
      },
      {
        title: "Date",
        dataIndex: "created_at",
        key: "created_at",
        width: 180,
        render: (v) => {
          const d = dayjs(String(v));
          return <Typography.Text>{d.isValid() ? d.format("YYYY-MM-DD HH:mm") : String(v).replace("T", " ").slice(0, 19)}</Typography.Text>;
        },
      },
      {
        title: "",
        key: "open",
        width: 70,
        render: (_, r) => (
          <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/general-inventory/employee-allocations/${encodeURIComponent(r.employee_id)}`)} />
        ),
      },
    ],
    [router]
  );

  const restrictedSerialColumns: ColumnsType<RestrictedIssuedSerialRow> = useMemo(
    () => [
      {
        title: "Weapon",
        key: "weapon",
        render: (_, r) => (
          <Typography.Text>
            <b>{r.item_code}</b> {r.item_name ? `- ${r.item_name}` : ""}
          </Typography.Text>
        ),
        ellipsis: true,
      },
      {
        title: "Serial",
        dataIndex: "serial_number",
        width: 160,
        render: (v) => <Tag color="blue">{String(v)}</Tag>,
      },
      {
        title: "Status",
        dataIndex: "status",
        width: 110,
        render: (v) => {
          const s = String(v ?? "");
          const c = s === "in_stock" ? "green" : s === "issued" ? "gold" : s === "maintenance" ? "purple" : "red";
          return <Tag color={c}>{s}</Tag>;
        },
      },
      {
        title: "Date",
        dataIndex: "created_at",
        width: 180,
        render: (v) => {
          const d = dayjs(String(v));
          return <Typography.Text>{d.isValid() ? d.format("YYYY-MM-DD HH:mm") : String(v).replace("T", " ").slice(0, 19)}</Typography.Text>;
        },
      },
      {
        title: "",
        key: "open",
        width: 70,
        render: (_, r) => (
          <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/restricted-inventory/employee-allocations/${encodeURIComponent(String((r as any).employee_id || ""))}`)} />
        ),
      },
    ],
    [router]
  );

  const restrictedQtyColumns: ColumnsType<RestrictedIssuedQtyRow> = useMemo(
    () => [
      {
        title: "Item",
        key: "item",
        render: (_, r) => (
          <Typography.Text>
            <b>{r.item_code}</b> {r.item_name ? `- ${r.item_name}` : ""}
          </Typography.Text>
        ),
        ellipsis: true,
      },
      {
        title: "Issued",
        key: "issued",
        width: 160,
        render: (_, r) => <Tag color="gold">{Number(r.quantity_issued ?? 0)} {r.unit_name || "unit"}</Tag>,
      },
      {
        title: "",
        key: "open",
        width: 70,
        render: (_, r) => (
          <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/restricted-inventory/employee-allocations/${encodeURIComponent(String((r as any).employee_id || ""))}`)} />
        ),
      },
    ],
    [router]
  );

  const exportEmployeePdf = useCallback(
    async (employeeId: string) => {
      const eid = String(employeeId || "").trim();
      if (!eid) return;
      setExportingByEmployee((p) => ({ ...p, [eid]: true }));
      try {
        const group = byEmployee.find((x) => x.employee_id === eid);
        if (!group) {
          msg.error("Employee not found");
          return;
        }

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

        const marginX = 40;
        const headerTop = 32;
        const logoSize = 44;
        const headerH = 68;
        const generatedAt = dayjs().format("YYYY-MM-DD HH:mm");

        const drawHeader = (data: any) => {
          const y = headerTop;
          doc.setDrawColor(230);
          doc.setLineWidth(1);
          doc.line(marginX, y + headerH, pageW - marginX, y + headerH);

          if (logoDataUrl) {
            try {
              doc.addImage(logoDataUrl, "PNG", marginX, y, logoSize, logoSize);
            } catch {
              // ignore
            }
          }

          const titleX = marginX + (logoDataUrl ? logoSize + 12 : 0);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text("Employee Inventory", titleX, y + 18);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(90);
          doc.text(`${group.employee_name} (${group.employee_id})`, titleX, y + 34);
          doc.text(`Generated: ${generatedAt}`, titleX, y + 48);

          const pageNum = data?.pageNumber ? Number(data.pageNumber) : 1;
          doc.text(`Page ${pageNum}`, pageW - marginX, y + 18, { align: "right" });
          doc.setTextColor(0);
        };

        let cursorY = headerTop + headerH + 14;

        const serialItems = Array.isArray(group.restricted.serial_items) ? group.restricted.serial_items : [];
        const qtyItems = Array.isArray(group.restricted.quantity_items) ? group.restricted.quantity_items : [];
        const generalItems = Array.isArray(group.general) ? group.general : [];

        if (serialItems.length) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(60);
          doc.text("Restricted Inventory - Serial Weapons (Guns)", marginX, cursorY);
          doc.setTextColor(0);
          cursorY += 8;

          autoTable(doc, {
            head: [["Weapon", "Serial", "Status", "Date"]],
            body: serialItems.map((r) => [
              `${r.item_code}${r.item_name ? ` - ${r.item_name}` : ""}`,
              String(r.serial_number || ""),
              String(r.status || ""),
              dayjs(String(r.created_at)).isValid() ? dayjs(String(r.created_at)).format("YYYY-MM-DD HH:mm") : String(r.created_at).replace("T", " ").slice(0, 19),
            ]),
            startY: cursorY,
            margin: { left: marginX, right: marginX },
            styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6, overflow: "linebreak" },
            headStyles: { fillColor: [22, 119, 255], textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 130 }, 2: { cellWidth: 80 }, 3: { cellWidth: 110 } },
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

          const finalY = (doc as any).lastAutoTable?.finalY;
          cursorY = (typeof finalY === "number" ? finalY : cursorY) + 16;
        }

        if (qtyItems.length) {
          if (cursorY > pageH - 120) {
            doc.addPage();
            cursorY = headerTop + headerH + 14;
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(60);
          doc.text("Restricted Inventory - Quantity Items", marginX, cursorY);
          doc.setTextColor(0);
          cursorY += 8;

          autoTable(doc, {
            head: [["Item", "Issued"]],
            body: qtyItems.map((r) => [
              `${r.item_code}${r.item_name ? ` - ${r.item_name}` : ""}`,
              `${Number(r.quantity_issued ?? 0)} ${String(r.unit_name || "unit")}`.trim(),
            ]),
            startY: cursorY,
            margin: { left: marginX, right: marginX },
            styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6, overflow: "linebreak" },
            headStyles: { fillColor: [22, 119, 255], textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 140, halign: "right" } },
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

          const finalY = (doc as any).lastAutoTable?.finalY;
          cursorY = (typeof finalY === "number" ? finalY : cursorY) + 16;
        }

        if (generalItems.length) {
          if (cursorY > pageH - 120) {
            doc.addPage();
            cursorY = headerTop + headerH + 14;
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(60);
          doc.text("General Inventory - Issued Items", marginX, cursorY);
          doc.setTextColor(0);
          cursorY += 8;

          autoTable(doc, {
            head: [["Item", "Issued", "Note", "Date"]],
            body: generalItems.map((r) => [
              `${r.item_code}${r.item_name ? ` - ${r.item_name}` : ""}`,
              `${Number(r.quantity ?? 0)} ${String(r.unit_name || "unit")}`.trim(),
              r.notes ? String(r.notes) : "-",
              dayjs(String(r.created_at)).isValid() ? dayjs(String(r.created_at)).format("YYYY-MM-DD HH:mm") : String(r.created_at).replace("T", " ").slice(0, 19),
            ]),
            startY: cursorY,
            margin: { left: marginX, right: marginX },
            styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6, overflow: "linebreak" },
            headStyles: { fillColor: [22, 119, 255], textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 90, halign: "right" }, 2: { cellWidth: 140 }, 3: { cellWidth: 110 } },
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
        }

        doc.save(`employee-${group.employee_id}-inventory-${dayjs().format("YYYYMMDD-HHmm")}.pdf`);
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Export failed"));
      } finally {
        setExportingByEmployee((p) => ({ ...p, [eid]: false }));
      }
    },
    [byEmployee, msg]
  );

  const collapseItems = useMemo(() => {
    return byEmployee.map((g) => {
      const restrictedCount = Number((g.restricted.serial_items?.length ?? 0) + (g.restricted.quantity_items?.length ?? 0));
      const generalCount = Number(g.general?.length ?? 0);
      const total = restrictedCount + generalCount;
      return {
        key: g.employee_id,
        label: (
          <Space size={8} wrap>
            <Tag color="green">#{g.serial_no || "-"}</Tag>
            <Typography.Text strong>{g.employee_name}</Typography.Text>
            <Tag color="gold">{total} item(s)</Tag>
          </Space>
        ),
        extra: (
          <Space size={6}>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={Boolean(exportingByEmployee[g.employee_id])}
              disabled={total === 0}
              onClick={(e) => {
                e.stopPropagation();
                void exportEmployeePdf(g.employee_id);
              }}
            >
              PDF
            </Button>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/restricted-inventory/employee-allocations/${encodeURIComponent(g.employee_id)}`);
              }}
            >
              Open
            </Button>
          </Space>
        ),
        children: (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {(g.restricted.serial_items?.length ?? 0) > 0 ? (
              <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Typography.Text strong>Restricted Inventory - Serial Weapons (Guns)</Typography.Text>
                <Table<RestrictedIssuedSerialRow>
                  rowKey={(r) => r.serial_unit_id}
                  size="small"
                  loading={loading}
                  dataSource={(g.restricted.serial_items ?? []).map((r) => ({ ...(r as any), employee_id: g.employee_id })) as any}
                  columns={restrictedSerialColumns}
                  pagination={false}
                  style={{ marginTop: 8 }}
                />
              </Card>
            ) : null}

            {(g.restricted.quantity_items?.length ?? 0) > 0 ? (
              <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Typography.Text strong>Restricted Inventory - Quantity Items (Ammo / Equipment)</Typography.Text>
                <Table<RestrictedIssuedQtyRow>
                  rowKey={(r) => r.item_code}
                  size="small"
                  loading={loading}
                  dataSource={(g.restricted.quantity_items ?? []).map((r) => ({ ...(r as any), employee_id: g.employee_id })) as any}
                  columns={restrictedQtyColumns}
                  pagination={false}
                  style={{ marginTop: 8 }}
                />
              </Card>
            ) : null}

            {(g.general?.length ?? 0) > 0 ? (
              <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Typography.Text strong>General Inventory - Issued Items</Typography.Text>
                <Table<GeneralAllocationRow>
                  rowKey={(r) => r.id}
                  size="small"
                  loading={loading}
                  dataSource={g.general}
                  columns={generalColumns}
                  pagination={false}
                  style={{ marginTop: 8 }}
                />
              </Card>
            ) : null}
          </Space>
        ),
      };
    });
  }, [byEmployee, exportEmployeePdf, exportingByEmployee, generalColumns, loading, restrictedQtyColumns, restrictedSerialColumns, router]);

  const paginatedCollapseItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return collapseItems.slice(start, end);
  }, [collapseItems, page, pageSize]);

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Typography.Title level={4} style={{ margin: 0 }}>
                Employee Inventory
              </Typography.Title>
              <Typography.Text type="secondary">All issued restricted + general inventory by employee</Typography.Text>
            </Col>
            <Col>
              <Space size={6} wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/employees2")}>Back</Button>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={[8, 8]} align="middle">
            <Col xs={24} md={10}>
              <Input placeholder="Search employee / item / serial" value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
            </Col>
            <Col xs={24} md={8}>
              <DatePicker.RangePicker
                style={{ width: "100%" }}
                value={dateRange}
                onChange={(v) => setDateRange(v)}
                allowClear
              />
            </Col>
            <Col flex="auto" />
            <Col>
              <Button
                icon={<DownloadOutlined />}
                loading={exportingAllPdf}
                onClick={() => void exportAllProfessionalPdf()}
              >
                Export All PDF
              </Button>
            </Col>
          </Row>

          <div style={{ maxHeight: "calc(100vh - 280px)", overflow: "auto" }}>
            <Collapse size="small" accordion items={paginatedCollapseItems} />
          </div>

          <Row justify="end" style={{ marginTop: 12 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={byEmployee.length}
              showSizeChanger
              pageSizeOptions={["10", "20", "50", "100"]}
              showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} employees`}
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
            />
          </Row>
        </Space>
      </Card>
    </>
  );
}
