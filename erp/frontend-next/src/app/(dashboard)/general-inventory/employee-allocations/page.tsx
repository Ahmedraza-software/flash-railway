"use client";

import { Button, Card, Col, Collapse, Input, Modal, Popconfirm, Row, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { api } from "@/lib/api";
import type { Employee } from "@/lib/types";

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

type AllocationRow = {
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

export default function GeneralInventoryEmployeeAllocationsPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [exportingPdf, setExportingPdf] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [employeesRes, itemsRes, txRes] = await Promise.all([
        api.get<{ employees: Employee[] }>("/api/employees/", { query: { limit: 500 } }),
        api.get<GeneralItem[]>("/api/general-inventory/items"),
        api.get<GeneralTxRow[]>("/api/general-inventory/transactions", { query: { limit: 5000 } }),
      ]);

      const employees = Array.isArray(employeesRes?.employees) ? employeesRes.employees : [];
      const items = Array.isArray(itemsRes) ? itemsRes : [];
      const txs = Array.isArray(txRes) ? txRes : [];

      const empById = new Map<string, Employee>();
      for (const e of employees) empById.set(String(e.employee_id), e);

      const itemByCode = new Map<string, GeneralItem>();
      for (const it of items) itemByCode.set(String(it.item_code), it);

      // Build current issued balances (ISSUE - RETURN) per employee + item.
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
        const prev = byKey.get(key) || {
          employee_id: employeeId,
          item_code: itemCode,
          qty: 0,
          lastIssueAt: "",
          lastIssueNote: "",
        };

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

      const allocs: AllocationRow[] = Array.from(byKey.entries())
        .map(([key, v]) => {
          if (!Number.isFinite(v.qty) || v.qty <= 0) return null;

          const emp = empById.get(v.employee_id);
          const empName = emp ? `${emp.first_name} ${emp.last_name}`.trim() : "";

          const item = itemByCode.get(v.item_code);
          return {
            id: key,
            employee_id: v.employee_id,
            employee_name: empName || v.employee_id,
            item_code: v.item_code,
            item_name: item?.name || v.item_code,
            unit_name: item?.unit_name || "",
            quantity: v.qty,
            notes: v.lastIssueNote,
            created_at: v.lastIssueAt,
          } satisfies AllocationRow;
        })
        .filter(Boolean) as AllocationRow[];

      allocs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setRows(allocs);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load allocations"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.employee_id} ${r.employee_name} ${r.item_code} ${r.item_name} ${r.notes} ${r.created_at}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const grouped = useMemo(() => {
    const byEmp = new Map<
      string,
      {
        employee_id: string;
        employee_name: string;
        items: AllocationRow[];
      }
    >();

    for (const r of filtered) {
      const k = r.employee_id;
      const prev = byEmp.get(k) || { employee_id: r.employee_id, employee_name: r.employee_name, items: [] as AllocationRow[] };
      prev.items.push(r);
      byEmp.set(k, prev);
    }

    const list = Array.from(byEmp.values());
    for (const g of list) {
      g.items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    list.sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)));
    return list;
  }, [filtered]);

  const doReturnToStock = useCallback(
    async (r: AllocationRow) => {
      setActionLoading((p) => ({ ...p, [r.id]: true }));
      try {
        await api.post(`/api/general-inventory/items/${encodeURIComponent(r.item_code)}/return`, {
          employee_id: r.employee_id,
          quantity: Number(r.quantity ?? 0),
          notes: "Returned from Employee Allocations",
        });
        msg.success("Returned to stock");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Failed to return"));
      } finally {
        setActionLoading((p) => ({ ...p, [r.id]: false }));
      }
    },
    [load, msg]
  );

  const exportAllPdf = useCallback(async () => {
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

      const title = "Employee Allocations";
      const subtitle = "General Inventory";
      const generatedAt = dayjs().format("YYYY-MM-DD HH:mm");

      const marginX = 40;
      const headerTop = 32;
      const logoSize = 44;
      const headerH = 68;

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
        doc.text(subtitle, titleX, y + 34);
        doc.text(`Generated: ${generatedAt}`, titleX, y + 48);
        if (search.trim()) {
          doc.text(`Search: ${search.trim()}`, titleX, y + 60);
        }

        const pageNum = data?.pageNumber ? Number(data.pageNumber) : 1;
        doc.text(`Page ${pageNum}`, pageW - marginX, y + 18, { align: "right" });
        doc.setTextColor(0);
      };

      // Group rows per employee and draw a separate table for each employee.
      const byEmp = new Map<string, { employeeLabel: string; items: AllocationRow[] }>();
      for (const r of filtered) {
        const key = r.employee_id;
        const employeeLabel = `${r.employee_name} (${r.employee_id})`;
        const prev = byEmp.get(key) || { employeeLabel, items: [] as AllocationRow[] };
        prev.items.push(r);
        byEmp.set(key, prev);
      }

      const groups = Array.from(byEmp.values());
      groups.sort((a, b) => a.employeeLabel.localeCompare(b.employeeLabel));
      for (const g of groups) {
        g.items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }

      let cursorY = headerTop + headerH + 14;

      for (const g of groups) {
        if (cursorY > pageH - 120) {
          doc.addPage();
          cursorY = headerTop + headerH + 14;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(g.employeeLabel, marginX, cursorY);
        cursorY += 10;

        const body = g.items.map((r) => [
          `${r.item_code}${r.item_name ? ` - ${r.item_name}` : ""}`,
          `${Number(r.quantity ?? 0)} ${String(r.unit_name || "unit")}`.trim(),
          r.notes ? String(r.notes) : "-",
          dayjs(String(r.created_at)).isValid()
            ? dayjs(String(r.created_at)).format("YYYY-MM-DD HH:mm")
            : String(r.created_at).replace("T", " ").slice(0, 19),
        ]);

        autoTable(doc, {
          head: [["Item", "Issued", "Note", "Date"]],
          body,
          startY: cursorY,
          margin: { left: marginX, right: marginX },
          styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6, overflow: "linebreak" },
          headStyles: { fillColor: [22, 119, 255], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { cellWidth: "auto" },
            1: { cellWidth: 90, halign: "right" },
            2: { cellWidth: 140 },
            3: { cellWidth: 110 },
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

        const finalY = (doc as any).lastAutoTable?.finalY;
        cursorY = (typeof finalY === "number" ? finalY : cursorY) + 16;
      }

      doc.save(`employee-allocations-general-inventory-${dayjs().format("YYYYMMDD-HHmm")}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    } finally {
      setExportingPdf(false);
    }
  }, [filtered, msg, search]);

  const columns: ColumnsType<AllocationRow> = useMemo(
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
        width: 150,
        render: (_, r) => <Tag color="gold">{Number(r.quantity ?? 0)} {r.unit_name || "unit"}</Tag>,
      },
      {
        title: "Note",
        dataIndex: "notes",
        key: "notes",
        width: 260,
        render: (v) => (v ? <Typography.Text>{String(v)}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>),
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
        title: "Action",
        key: "action",
        width: 180,
        render: (_, r) => (
          <Space size={6} wrap>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                Modal.info({
                  title: "Allocation Details",
                  content: (
                    <Space direction="vertical" size={6} style={{ width: "100%" }}>
                      <Typography.Text>
                        <b>Employee:</b> {r.employee_name} ({r.employee_id})
                      </Typography.Text>
                      <Typography.Text>
                        <b>Item:</b> {r.item_code} {r.item_name ? `- ${r.item_name}` : ""}
                      </Typography.Text>
                      <Typography.Text>
                        <b>Issued:</b> {Number(r.quantity ?? 0)} {r.unit_name || "unit"}
                      </Typography.Text>
                      <Typography.Text>
                        <b>Note:</b> {r.notes || "-"}
                      </Typography.Text>
                      <Typography.Text>
                        <b>Date:</b> {dayjs(r.created_at).isValid() ? dayjs(r.created_at).format("YYYY-MM-DD HH:mm") : r.created_at}
                      </Typography.Text>
                    </Space>
                  ),
                });
              }}
            >
              View
            </Button>

            <Popconfirm
              title="Return this issued quantity back to stock and remove from employee?"
              okText="Return"
              cancelText="Cancel"
              onConfirm={() => void doReturnToStock(r)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={Boolean(actionLoading[r.id])}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [actionLoading, doReturnToStock]
  );

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Typography.Title level={4} style={{ margin: 0 }}>
                Employee Allocations
              </Typography.Title>
              <Typography.Text type="secondary">All issued general inventory items by employee</Typography.Text>
            </Col>
            <Col>
              <Space size={6} wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/general-inventory")}>Back</Button>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  loading={exportingPdf}
                  disabled={filtered.length === 0}
                  onClick={() => void exportAllPdf()}
                >
                  Export PDF
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={[8, 8]} align="middle">
            <Col xs={24} md={10}>
              <Input
                placeholder="Search employee / item / note / date"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
            </Col>
          </Row>

          <Collapse
            size="small"
            accordion
            items={grouped.map((g) => ({
              key: g.employee_id,
              label: (
                <Space size={8} wrap>
                  <Typography.Text strong>{g.employee_name}</Typography.Text>
                  <Tag color="blue">{g.employee_id}</Tag>
                  <Tag color="gold">{g.items.length} item(s)</Tag>
                </Space>
              ),
              extra: (
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/general-inventory/employee-allocations/${encodeURIComponent(g.employee_id)}`);
                  }}
                >
                  Open
                </Button>
              ),
              children: (
                <Table<AllocationRow>
                  rowKey={(r) => r.id}
                  size="small"
                  loading={loading}
                  dataSource={g.items}
                  columns={columns}
                  pagination={false}
                />
              ),
            }))}
          />
        </Space>
      </Card>
    </>
  );
}
