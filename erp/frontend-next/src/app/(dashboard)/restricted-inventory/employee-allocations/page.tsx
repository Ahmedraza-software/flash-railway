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

type IssuedSerialRow = {
  serial_unit_id: number;
  item_code: string;
  item_name: string;
  category: string;
  serial_number: string;
  status: string;
  created_at: string;
};

type IssuedQtyRow = {
  item_code: string;
  item_name: string;
  category: string;
  unit_name: string;
  quantity_issued: number;
};

type EmployeeIssuedInventory = {
  employee_id: string;
  serial_items: IssuedSerialRow[];
  quantity_items: IssuedQtyRow[];
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

export default function RestrictedInventoryEmployeeAllocationsPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [issued, setIssued] = useState<EmployeeIssuedInventory[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [serialActionLoading, setSerialActionLoading] = useState<Record<number, boolean>>({});
  const [qtyActionLoading, setQtyActionLoading] = useState<Record<string, boolean>>({});
  const [exportingPdf, setExportingPdf] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [employeesRes, issuedRes] = await Promise.all([
        api.get<{ employees: Employee[] }>("/api/employees/", { query: { limit: 500 } }),
        api.get<EmployeeIssuedInventory[]>("/api/restricted-inventory/issued"),
      ]);
      setEmployees(Array.isArray(employeesRes?.employees) ? employeesRes.employees : []);
      setIssued(Array.isArray(issuedRes) ? issuedRes : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load employee allocations"));
      setIssued([]);
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void load();
  }, [load]);

  const empNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(String(e.employee_id), `${e.first_name} ${e.last_name}`.trim());
    return m;
  }, [employees]);

  const filteredGroups = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    const groups = (Array.isArray(issued) ? issued : []).map((g) => {
      const name = empNameById.get(String(g.employee_id)) || String(g.employee_id);
      return { ...g, employee_name: name };
    });

    const out = groups.filter((g) => {
      if (!q) return true;
      const hay = `${g.employee_name} ${g.employee_id}`.toLowerCase();
      if (hay.includes(q)) return true;
      for (const s of g.serial_items ?? []) {
        const h = `${s.item_code} ${s.item_name} ${s.serial_number} ${s.status}`.toLowerCase();
        if (h.includes(q)) return true;
      }
      for (const it of g.quantity_items ?? []) {
        const h = `${it.item_code} ${it.item_name} ${it.unit_name}`.toLowerCase();
        if (h.includes(q)) return true;
      }
      return false;
    });

    out.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
    return out;
  }, [empNameById, issued, search]);

  const doSerialReturn = useCallback(
    async (employeeId: string, serialUnitId: number) => {
      setSerialActionLoading((p) => ({ ...p, [serialUnitId]: true }));
      try {
        await api.post(
          `/api/restricted-inventory/employees/${encodeURIComponent(employeeId)}/serials/${serialUnitId}/return`,
          { notes: "Returned from Employee Allocations" }
        );
        msg.success("Returned");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Return failed"));
      } finally {
        setSerialActionLoading((p) => ({ ...p, [serialUnitId]: false }));
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
      const subtitle = "Restricted Inventory";
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

      const groups = filteredGroups.map((g) => {
        const employeeLabel = `${(g as any).employee_name || g.employee_id} (${g.employee_id})`;
        return { employeeLabel, g };
      });
      groups.sort((a, b) => a.employeeLabel.localeCompare(b.employeeLabel));

      let cursorY = headerTop + headerH + 14;

      for (const { employeeLabel, g } of groups) {
        const serialItems = Array.isArray(g.serial_items) ? g.serial_items : [];
        const qtyItems = Array.isArray(g.quantity_items) ? g.quantity_items : [];

        if (cursorY > pageH - 120) {
          doc.addPage();
          cursorY = headerTop + headerH + 14;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(employeeLabel, marginX, cursorY);
        cursorY += 10;

        if (serialItems.length) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(60);
          doc.text("Serial Weapons (Guns)", marginX, cursorY);
          doc.setTextColor(0);
          cursorY += 8;

          const body = serialItems.map((r) => [
            `${r.item_code}${r.item_name ? ` - ${r.item_name}` : ""}`,
            String(r.serial_number || ""),
            String(r.status || ""),
            dayjs(String(r.created_at)).isValid() ? dayjs(String(r.created_at)).format("YYYY-MM-DD HH:mm") : String(r.created_at).replace("T", " ").slice(0, 19),
          ]);

          autoTable(doc, {
            head: [["Weapon", "Serial", "Status", "Date"]],
            body,
            startY: cursorY,
            margin: { left: marginX, right: marginX },
            styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6, overflow: "linebreak" },
            headStyles: { fillColor: [22, 119, 255], textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
              0: { cellWidth: "auto" },
              1: { cellWidth: 130 },
              2: { cellWidth: 80 },
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
          cursorY = (typeof finalY === "number" ? finalY : cursorY) + 12;
        }

        if (qtyItems.length) {
          if (cursorY > pageH - 120) {
            doc.addPage();
            cursorY = headerTop + headerH + 14;
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(60);
          doc.text("Quantity Items (Ammo / Equipment)", marginX, cursorY);
          doc.setTextColor(0);
          cursorY += 8;

          const body = qtyItems.map((r) => [
            `${r.item_code}${r.item_name ? ` - ${r.item_name}` : ""}`,
            `${Number(r.quantity_issued ?? 0)} ${String(r.unit_name || "unit")}`.trim(),
          ]);

          autoTable(doc, {
            head: [["Item", "Issued"]],
            body,
            startY: cursorY,
            margin: { left: marginX, right: marginX },
            styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6, overflow: "linebreak" },
            headStyles: { fillColor: [22, 119, 255], textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
              0: { cellWidth: "auto" },
              1: { cellWidth: 140, halign: "right" },
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

        cursorY += 8;
      }

      doc.save(`restricted-employee-allocations-${dayjs().format("YYYYMMDD-HHmm")}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    } finally {
      setExportingPdf(false);
    }
  }, [filteredGroups, msg, search]);

  const doQtyReturn = useCallback(
    async (employeeId: string, itemCode: string, qty: number) => {
      const key = `${employeeId}__${itemCode}`;
      setQtyActionLoading((p) => ({ ...p, [key]: true }));
      try {
        await api.post(
          `/api/restricted-inventory/employees/${encodeURIComponent(employeeId)}/items/${encodeURIComponent(itemCode)}/return`,
          { quantity: qty, notes: "Returned from Employee Allocations" }
        );
        msg.success("Returned");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Return failed"));
      } finally {
        setQtyActionLoading((p) => ({ ...p, [key]: false }));
      }
    },
    [load, msg]
  );

  const serialColumns: ColumnsType<IssuedSerialRow> = useMemo(
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
        key: "serial_number",
        width: 180,
        render: (v) => <Tag color="blue">{String(v)}</Tag>,
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
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
        width: 140,
        render: (_, r) => (
          <Popconfirm
            title="Return this serial to stock and remove from employee?"
            okText="Return"
            cancelText="Cancel"
            onConfirm={() => void doSerialReturn(String((r as any).employee_id || ""), r.serial_unit_id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={Boolean(serialActionLoading[r.serial_unit_id])}>
              Delete
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [doSerialReturn, serialActionLoading]
  );

  const qtyColumns: ColumnsType<IssuedQtyRow> = useMemo(
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
        title: "Action",
        key: "action",
        width: 140,
        render: (_, r) => {
          const employeeId = String((r as any).employee_id || "");
          const key = `${employeeId}__${r.item_code}`;
          return (
            <Popconfirm
              title="Return this quantity to stock and remove from employee?"
              okText="Return"
              cancelText="Cancel"
              onConfirm={() => void doQtyReturn(employeeId, r.item_code, Number(r.quantity_issued ?? 0))}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={Boolean(qtyActionLoading[key])}>
                Delete
              </Button>
            </Popconfirm>
          );
        },
      },
    ],
    [doQtyReturn, qtyActionLoading]
  );

  const collapseItems = useMemo(() => {
    return filteredGroups.map((g) => {
      const employeeLabel = `${(g as any).employee_name || g.employee_id}`;
      const itemCount = Number((g.serial_items?.length ?? 0) + (g.quantity_items?.length ?? 0));
      return {
        key: g.employee_id,
        label: (
          <Space size={8} wrap>
            <Typography.Text strong>{employeeLabel}</Typography.Text>
            <Tag color="blue">{g.employee_id}</Tag>
            <Tag color="gold">{itemCount} item(s)</Tag>
          </Space>
        ),
        extra: (
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
        ),
        children: (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {(g.serial_items?.length ?? 0) > 0 ? (
              <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Typography.Text strong>Serial Weapons (Guns)</Typography.Text>
                <Table<IssuedSerialRow>
                  rowKey={(r) => r.serial_unit_id}
                  size="small"
                  loading={loading}
                  dataSource={(g.serial_items ?? []).map((r) => ({ ...(r as any), employee_id: g.employee_id })) as any}
                  columns={serialColumns}
                  pagination={false}
                />
              </Card>
            ) : null}

            {(g.quantity_items?.length ?? 0) > 0 ? (
              <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Typography.Text strong>Quantity Items (Ammo / Equipment)</Typography.Text>
                <Table<IssuedQtyRow>
                  rowKey={(r) => r.item_code}
                  size="small"
                  loading={loading}
                  dataSource={(g.quantity_items ?? []).map((r) => ({ ...(r as any), employee_id: g.employee_id })) as any}
                  columns={qtyColumns}
                  pagination={false}
                />
              </Card>
            ) : null}
          </Space>
        ),
      };
    });
  }, [doQtyReturn, filteredGroups, loading, qtyColumns, router, serialColumns]);

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
              <Typography.Text type="secondary">All issued restricted inventory by employee</Typography.Text>
            </Col>
            <Col>
              <Space size={6} wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/restricted-inventory")}>Back</Button>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  loading={exportingPdf}
                  disabled={filteredGroups.length === 0}
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
                placeholder="Search employee / item / serial"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
            </Col>
          </Row>

          <Collapse size="small" accordion items={collapseItems} />
        </Space>
      </Card>
    </>
  );
}
