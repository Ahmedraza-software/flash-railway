"use client";

import { Button, Card, Col, Input, Modal, Popconfirm, Row, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

export default function RestrictedInventoryEmployeeAllocationDetailPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();
  const params = useParams<{ employeeId: string }>();

  const employeeId = useMemo(() => decodeURIComponent(String(params?.employeeId ?? "")).trim(), [params]);

  const [loading, setLoading] = useState(false);
  const [employeeName, setEmployeeName] = useState<string>("");
  const [issued, setIssued] = useState<EmployeeIssuedInventory | null>(null);
  const [search, setSearch] = useState("");
  const [serialActionLoading, setSerialActionLoading] = useState<Record<number, boolean>>({});
  const [qtyActionLoading, setQtyActionLoading] = useState<Record<string, boolean>>({});
  const [exportingPdf, setExportingPdf] = useState(false);

  const load = useCallback(async () => {
    const eid = String(employeeId || "").trim();
    if (!eid) {
      setIssued(null);
      setEmployeeName("");
      return;
    }

    setLoading(true);
    try {
      const [employeesRes, allIssuedRes] = await Promise.all([
        api.get<{ employees: Employee[] }>("/api/employees/", { query: { limit: 500 } }),
        api.get<EmployeeIssuedInventory[]>("/api/restricted-inventory/issued"),
      ]);

      const employees = Array.isArray(employeesRes?.employees) ? employeesRes.employees : [];
      const emp = employees.find((e) => String(e.employee_id) === eid);
      setEmployeeName(emp ? `${emp.first_name} ${emp.last_name}`.trim() : eid);

      const all = Array.isArray(allIssuedRes) ? allIssuedRes : [];
      const found = all.find((x) => String(x.employee_id) === eid) || null;
      setIssued(found);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load employee allocations"));
      setIssued(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId, msg]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredSerials = useMemo(() => {
    const list = issued?.serial_items ?? [];
    const q = String(search || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => `${r.item_code} ${r.item_name} ${r.serial_number} ${r.status}`.toLowerCase().includes(q));
  }, [issued?.serial_items, search]);

  const filteredQty = useMemo(() => {
    const list = issued?.quantity_items ?? [];
    const q = String(search || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => `${r.item_code} ${r.item_name} ${r.unit_name}`.toLowerCase().includes(q));
  }, [issued?.quantity_items, search]);

  const doSerialReturn = useCallback(
    async (serialUnitId: number) => {
      const eid = String(employeeId || "").trim();
      if (!eid) return;
      setSerialActionLoading((p) => ({ ...p, [serialUnitId]: true }));
      try {
        await api.post(`/api/restricted-inventory/employees/${encodeURIComponent(eid)}/serials/${serialUnitId}/return`, {
          notes: "Returned from Employee Allocation Detail",
        });
        msg.success("Returned");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Return failed"));
      } finally {
        setSerialActionLoading((p) => ({ ...p, [serialUnitId]: false }));
      }
    },
    [employeeId, load, msg]
  );

  const exportEmployeePdf = useCallback(async () => {
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
      const subtitle = `${employeeName || employeeId} (${employeeId})`;
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
            // ignore
          }
        }

        const titleX = marginX + (logoDataUrl ? logoSize + 12 : 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(title, titleX, y + 18);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(90);
        doc.text("Restricted Inventory", titleX, y + 34);
        doc.text(subtitle, titleX, y + 48);
        doc.text(`Generated: ${generatedAt}`, titleX, y + 62);

        const pageNum = data?.pageNumber ? Number(data.pageNumber) : 1;
        doc.text(`Page ${pageNum}`, pageW - marginX, y + 18, { align: "right" });
        doc.setTextColor(0);
      };

      let cursorY = headerTop + headerH + 14;

      const serialItems = filteredSerials;
      const qtyItems = filteredQty;

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
      }

      doc.save(`restricted-employee-${employeeId}-allocations-${dayjs().format("YYYYMMDD-HHmm")}.pdf`);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Export failed"));
    } finally {
      setExportingPdf(false);
    }
  }, [employeeId, employeeName, filteredQty, filteredSerials, msg]);

  const doQtyReturn = useCallback(
    async (itemCode: string, qty: number) => {
      const eid = String(employeeId || "").trim();
      if (!eid) return;
      const key = `${eid}__${itemCode}`;
      setQtyActionLoading((p) => ({ ...p, [key]: true }));
      try {
        await api.post(`/api/restricted-inventory/employees/${encodeURIComponent(eid)}/items/${encodeURIComponent(itemCode)}/return`, {
          quantity: qty,
          notes: "Returned from Employee Allocation Detail",
        });
        msg.success("Returned");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Return failed"));
      } finally {
        setQtyActionLoading((p) => ({ ...p, [key]: false }));
      }
    },
    [employeeId, load, msg]
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
        width: 160,
        render: (_, r) => (
          <Space size={6} wrap>
            <Button
              size="small"
              onClick={() => {
                Modal.info({
                  title: "Allocation Details",
                  content: (
                    <Space direction="vertical" size={6} style={{ width: "100%" }}>
                      <Typography.Text>
                        <b>Employee:</b> {employeeName} ({employeeId})
                      </Typography.Text>
                      <Typography.Text>
                        <b>Weapon:</b> {r.item_code} {r.item_name ? `- ${r.item_name}` : ""}
                      </Typography.Text>
                      <Typography.Text>
                        <b>Serial:</b> {r.serial_number}
                      </Typography.Text>
                      <Typography.Text>
                        <b>Status:</b> {r.status}
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
              title="Return this serial to stock and remove from employee?"
              okText="Return"
              cancelText="Cancel"
              onConfirm={() => void doSerialReturn(r.serial_unit_id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={Boolean(serialActionLoading[r.serial_unit_id])}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [doSerialReturn, employeeId, employeeName, serialActionLoading]
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
        width: 160,
        render: (_, r) => {
          const key = `${employeeId}__${r.item_code}`;
          return (
            <Popconfirm
              title="Return this quantity to stock and remove from employee?"
              okText="Return"
              cancelText="Cancel"
              onConfirm={() => void doQtyReturn(r.item_code, Number(r.quantity_issued ?? 0))}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={Boolean(qtyActionLoading[key])}>
                Delete
              </Button>
            </Popconfirm>
          );
        },
      },
    ],
    [doQtyReturn, employeeId, qtyActionLoading]
  );

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Space size={8} wrap>
                  <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/restricted-inventory/employee-allocations")}>
                    Back
                  </Button>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    Employee Allocations
                  </Typography.Title>
                </Space>

                <Space size={8} wrap>
                  <Typography.Text strong style={{ fontSize: 16 }}>
                    {employeeName || "-"}
                  </Typography.Text>
                  <Tag color="blue" style={{ marginInlineStart: 0 }}>
                    {employeeId || "-"}
                  </Tag>
                </Space>

                <Typography.Text type="secondary">Manage issued items for this employee</Typography.Text>
              </Space>
            </Col>
            <Col>
              <Space size={6} wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  loading={exportingPdf}
                  disabled={(filteredSerials.length + filteredQty.length) === 0}
                  onClick={() => void exportEmployeePdf()}
                >
                  Export PDF
                </Button>
              </Space>
            </Col>
          </Row>

          <Row gutter={[8, 8]} align="middle">
            <Col xs={24} md={10}>
              <Input
                placeholder="Search item / serial"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
            </Col>
          </Row>

          {issued ? (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {(issued.serial_items?.length ?? 0) > 0 ? (
                <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                  <Typography.Text strong>Serial Weapons (Guns)</Typography.Text>
                  <Table<IssuedSerialRow>
                    rowKey={(r) => r.serial_unit_id}
                    size="small"
                    loading={loading}
                    dataSource={filteredSerials}
                    columns={serialColumns}
                    pagination={false}
                  />
                </Card>
              ) : null}

              {(issued.quantity_items?.length ?? 0) > 0 ? (
                <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                  <Typography.Text strong>Quantity Items (Ammo / Equipment)</Typography.Text>
                  <Table<IssuedQtyRow>
                    rowKey={(r) => r.item_code}
                    size="small"
                    loading={loading}
                    dataSource={filteredQty}
                    columns={qtyColumns}
                    pagination={false}
                  />
                </Card>
              ) : null}
            </Space>
          ) : (
            <Typography.Text type="secondary">No allocations found</Typography.Text>
          )}
        </Space>
      </Card>
    </>
  );
}
