"use client";

import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  InputNumber,
  Form,
  Image,
  Input,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, EyeOutlined, MinusCircleOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { useRouter } from "next/navigation";
import type {
  Employee,
  RestrictedItem,
  RestrictedItemCreate,
  RestrictedItemImage,
  RestrictedSerialUnit,
  RestrictedTransaction,
} from "@/lib/types";

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

type DrawerMode = "create" | "edit" | "view";

type FormValues = RestrictedItemCreate;

type ActionKind = "issue" | "return" | "lost" | "found" | "available" | "damaged" | "maintenance" | "cleaning";

type AllocateLine = {
  item_code?: string;
  quantity?: number;
  serial_numbers?: string[];
};

type AllocateFormValues = {
  employee_id?: string;
  notes?: string;
  lines?: AllocateLine[];
};

export default function RestrictedInventoryPage() {
  const [msg, msgCtx] = message.useMessage();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RestrictedItem[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);

  const [allocOpen, setAllocOpen] = useState(false);
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocSerialsLoading, setAllocSerialsLoading] = useState<Record<string, boolean>>({});
  const [allocSerialsByItem, setAllocSerialsByItem] = useState<Record<string, string[]>>({});
  const [allocForm] = Form.useForm<AllocateFormValues>();

  const [allocItemSearch, setAllocItemSearch] = useState<string>("");
  const [allocSelectedCodes, setAllocSelectedCodes] = useState<string[]>([]);
  const [allocQtyByCode, setAllocQtyByCode] = useState<Record<string, number>>({});
  const [allocSerialsSelectedByCode, setAllocSerialsSelectedByCode] = useState<Record<string, string[]>>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [active, setActive] = useState<RestrictedItem | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [itemCodeTouched, setItemCodeTouched] = useState(false);

  const [imagesLoading, setImagesLoading] = useState(false);
  const [images, setImages] = useState<RestrictedItemImage[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);

  const [serialsLoading, setSerialsLoading] = useState(false);
  const [serials, setSerials] = useState<RestrictedSerialUnit[]>([]);
  const [newSerial, setNewSerial] = useState("");
  const [pendingSerials, setPendingSerials] = useState<string[]>([]);
  const [pendingSerialInput, setPendingSerialInput] = useState("");

  const [txLoading, setTxLoading] = useState(false);
  const [txs, setTxs] = useState<RestrictedTransaction[]>([]);

  const [actionEmp, setActionEmp] = useState<string | undefined>(undefined);
  const [actionQty, setActionQty] = useState<number | null>(null);
  const [actionSerials, setActionSerials] = useState<string[]>([]);
  const [actionKind, setActionKind] = useState<ActionKind>("issue");
  const [actionNote, setActionNote] = useState("");

  const watchIsSerialTracked = Form.useWatch("is_serial_tracked", form);
  const watchQtyOnHand = Form.useWatch("quantity_on_hand", form);

  const loadEmployees = useCallback(async () => {
    try {
      const data = await api.get<{ employees: Employee[] }>("/api/employees/", { query: { limit: 500 } });
      setEmployees(Array.isArray(data?.employees) ? data.employees : []);
    } catch {
      setEmployees([]);
    }
  }, []);

  const loadAllocSerials = useCallback(
    async (itemCode: string) => {
      if (!itemCode) return;
      if (allocSerialsByItem[itemCode]) return;

      setAllocSerialsLoading((p) => ({ ...p, [itemCode]: true }));
      try {
        const list = await api.get<RestrictedSerialUnit[]>(
          `/api/restricted-inventory/items/${encodeURIComponent(itemCode)}/serials`
        );
        const inStock = (Array.isArray(list) ? list : [])
          .filter((s) => s.status === "in_stock")
          .map((s) => s.serial_number);
        setAllocSerialsByItem((p) => ({ ...p, [itemCode]: inStock }));
      } catch {
        setAllocSerialsByItem((p) => ({ ...p, [itemCode]: [] }));
      } finally {
        setAllocSerialsLoading((p) => ({ ...p, [itemCode]: false }));
      }
    },
    [allocSerialsByItem]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<RestrictedItem[]>("/api/restricted-inventory/items");
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load restricted inventory"));
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void load();
    void loadEmployees();
  }, [load, loadEmployees]);

  const resetActionForm = useCallback(() => {
    setActionEmp(undefined);
    setActionQty(null);
    setActionSerials([]);
    setActionKind("issue");
    setActionNote("");
  }, []);

  const loadImages = useCallback(async (itemCode: string) => {
    setImagesLoading(true);
    try {
      const list = await api.get<RestrictedItemImage[]>(`/api/restricted-inventory/items/${encodeURIComponent(itemCode)}/images`);
      setImages(Array.isArray(list) ? list : []);
    } catch {
      setImages([]);
    } finally {
      setImagesLoading(false);
    }
  }, []);

  const loadSerials = useCallback(async (itemCode: string) => {
    setSerialsLoading(true);
    try {
      const list = await api.get<RestrictedSerialUnit[]>(`/api/restricted-inventory/items/${encodeURIComponent(itemCode)}/serials`);
      setSerials(Array.isArray(list) ? list : []);
    } catch {
      setSerials([]);
    } finally {
      setSerialsLoading(false);
    }
  }, []);

  const loadTx = useCallback(async (itemCode: string) => {
    setTxLoading(true);
    try {
      const list = await api.get<RestrictedTransaction[]>("/api/restricted-inventory/transactions", {
        query: { item_code: itemCode, limit: 200 },
      });
      setTxs(Array.isArray(list) ? list : []);
    } catch {
      setTxs([]);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const itemsByCode = useMemo(() => {
    const m = new Map<string, RestrictedItem>();
    for (const r of rows) m.set(String(r.item_code), r);
    return m;
  }, [rows]);

  const openCreate = useCallback(() => {
    const nextCodeForCategory = (category: string): string => {
      const prefix =
        category === "ammo"
          ? "AMMO-"
          : category === "tactical"
            ? "TAC-"
            : category === "equipment"
              ? "EQP-"
              : "GUN-";

      let max = 0;
      for (const r of rows) {
        const code = String(r.item_code || "");
        if (!code.startsWith(prefix)) continue;
        const tail = code.slice(prefix.length);
        const n = Number.parseInt(tail, 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
      const next = max + 1;
      return `${prefix}${String(next).padStart(4, "0")}`;
    };

    setDrawerMode("create");
    setActive(null);
    form.resetFields();
    setImages([]);
    setSerials([]);
    setTxs([]);
    setPendingImages([]);
    setNewSerial("");
    setPendingSerials([]);
    setPendingSerialInput("");
    setItemCodeTouched(false);
    resetActionForm();
    form.setFieldsValue({
      item_code: nextCodeForCategory("firearm"),
      category: "firearm",
      name: "",
      description: null,
      is_serial_tracked: true,
      unit_name: "unit",
      quantity_on_hand: 0,
      min_quantity: null,
      make_model: null,
      caliber: null,
      storage_location: null,
      requires_maintenance: false,
      requires_cleaning: false,
      status: "Active",
    });
    setDrawerOpen(true);
  }, [form, resetActionForm, rows]);

  const openAllocate = useCallback(() => {
    setAllocSerialsByItem({});
    setAllocSerialsLoading({});
    setAllocItemSearch("");
    setAllocSelectedCodes([]);
    setAllocQtyByCode({});
    setAllocSerialsSelectedByCode({});
    allocForm.resetFields();
    allocForm.setFieldsValue({ employee_id: undefined, notes: "", lines: [{}] });
    setAllocOpen(true);
  }, [allocForm]);

  const submitAllocation = useCallback(async () => {
    const values = await allocForm.validateFields(["employee_id", "notes", "date"]);
    const employeeId = String(values.employee_id || "").trim();
    const note = String(values.notes || "").trim();
    const allocDate = values.date as Dayjs | undefined;

    if (!employeeId) {
      msg.error("Employee is required");
      return;
    }

    if (allocSelectedCodes.length === 0) {
      msg.error("Please select at least one item");
      return;
    }

    const dateNote = allocDate ? `Allocation Date: ${allocDate.format("YYYY-MM-DD")}` : "";
    const finalNote = [dateNote, note].filter(Boolean).join(" | ") || undefined;

    setAllocLoading(true);
    try {
      for (const code of allocSelectedCodes) {
        const item = itemsByCode.get(code);
        if (!item) continue;

        if (item.is_serial_tracked) {
          const sns = allocSerialsSelectedByCode[code] ?? [];
          if (!sns.length) {
            msg.error(`Select serial(s) for ${code}`);
            setAllocLoading(false);
            return;
          }
          await api.post(`/api/restricted-inventory/items/${encodeURIComponent(code)}/issue`, {
            employee_id: employeeId,
            serial_numbers: sns,
            notes: finalNote,
          });
        } else {
          const qty = Number(allocQtyByCode[code] ?? 0);
          if (!Number.isFinite(qty) || qty <= 0) {
            msg.error(`Enter quantity for ${code}`);
            setAllocLoading(false);
            return;
          }
          await api.post(`/api/restricted-inventory/items/${encodeURIComponent(code)}/issue`, {
            employee_id: employeeId,
            quantity: qty,
            notes: finalNote,
          });
        }
      }

      msg.success("Allocated");
      setAllocOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Allocation failed"));
    } finally {
      setAllocLoading(false);
    }
  }, [allocForm, allocQtyByCode, allocSelectedCodes, allocSerialsSelectedByCode, itemsByCode, load, msg]);

  const openEdit = useCallback(
    (r: RestrictedItem) => {
      setDrawerMode("edit");
      setActive(r);
      form.resetFields();
      form.setFieldsValue({
        item_code: r.item_code,
        category: r.category,
        name: r.name,
        description: r.description ?? null,
        is_serial_tracked: r.is_serial_tracked,
        unit_name: r.unit_name,
        quantity_on_hand: r.quantity_on_hand,
        min_quantity: r.min_quantity ?? null,
        make_model: r.make_model ?? null,
        caliber: r.caliber ?? null,
        storage_location: r.storage_location ?? null,
        requires_maintenance: r.requires_maintenance,
        requires_cleaning: r.requires_cleaning,
        status: r.status,
      });
      setPendingImages([]);
      setNewSerial("");
      resetActionForm();
      void loadImages(r.item_code);
      if (r.is_serial_tracked) void loadSerials(r.item_code);
      void loadTx(r.item_code);
      setDrawerOpen(true);
    },
    [form, loadImages, loadSerials, loadTx, resetActionForm]
  );

  const openView = useCallback(
    (r: RestrictedItem) => {
      setDrawerMode("view");
      setActive(r);
      form.resetFields();
      form.setFieldsValue({
        item_code: r.item_code,
        category: r.category,
        name: r.name,
        description: r.description ?? null,
        is_serial_tracked: r.is_serial_tracked,
        unit_name: r.unit_name,
        quantity_on_hand: r.quantity_on_hand,
        min_quantity: r.min_quantity ?? null,
        make_model: r.make_model ?? null,
        caliber: r.caliber ?? null,
        storage_location: r.storage_location ?? null,
        requires_maintenance: r.requires_maintenance,
        requires_cleaning: r.requires_cleaning,
        status: r.status,
      });
      setPendingImages([]);
      setNewSerial("");
      resetActionForm();
      void loadImages(r.item_code);
      if (r.is_serial_tracked) void loadSerials(r.item_code);
      void loadTx(r.item_code);
      setDrawerOpen(true);
    },
    [form, loadImages, loadSerials, loadTx, resetActionForm]
  );

  const onDelete = useCallback(
    async (r: RestrictedItem) => {
      try {
        await api.del<{ message: string }>(`/api/restricted-inventory/items/${encodeURIComponent(r.item_code)}`);
        msg.success("Item deleted");
        await load();
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Delete failed"));
      }
    },
    [load, msg]
  );

  const uploadImage = useCallback(async (itemCode: string, file: File) => {
    const fd = new FormData();
    fd.set("file", file);

    const res = await fetch(`${API_BASE_URL}/api/restricted-inventory/items/${encodeURIComponent(itemCode)}/images`, {
      method: "POST",
      body: fd,
    });

    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      let m = "Image upload failed";
      if (data && typeof data === "object" && "detail" in data) m = String((data as { detail?: unknown }).detail);
      throw new Error(m);
    }
  }, []);

  const deleteImage = useCallback(async (itemCode: string, imageId: number) => {
    await api.del<{ message: string }>(
      `/api/restricted-inventory/items/${encodeURIComponent(itemCode)}/images/${imageId}`
    );
    await loadImages(itemCode);
  }, [loadImages]);

  const addSerial = useCallback(async () => {
    if (!active) return;
    const sn = newSerial.trim();
    if (!sn) {
      msg.error("Serial number is required");
      return;
    }
    try {
      await api.post<RestrictedSerialUnit>(
        `/api/restricted-inventory/items/${encodeURIComponent(active.item_code)}/serials`,
        { serial_number: sn }
      );
      setNewSerial("");
      msg.success("Serial added");
      await loadSerials(active.item_code);
      await loadTx(active.item_code);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to add serial"));
    }
  }, [active, loadSerials, loadTx, msg, newSerial]);

  const addPendingSerial = useCallback(() => {
    const sn = pendingSerialInput.trim();
    if (!sn) {
      msg.error("Serial number is required");
      return;
    }

    const nextQty = Number(watchQtyOnHand ?? 0);
    if (Number.isFinite(nextQty) && nextQty > 0 && pendingSerials.length >= nextQty) {
      msg.error("You have already added serials equal to Qty On Hand");
      return;
    }

    if (pendingSerials.includes(sn)) {
      msg.error("This serial is already added");
      return;
    }

    setPendingSerials((p) => [...p, sn]);
    setPendingSerialInput("");
  }, [msg, pendingSerialInput, pendingSerials, watchQtyOnHand]);

  const removePendingSerial = useCallback((idx: number) => {
    setPendingSerials((p) => p.filter((_, i) => i !== idx));
  }, []);

  const onSubmit = useCallback(async () => {
    const values = await form.validateFields();

    try {
      if (drawerMode === "create") {
        const qty = Number(values.quantity_on_hand ?? 0);
        if (values.is_serial_tracked && Number.isFinite(qty) && qty > 0) {
          if (pendingSerials.length !== qty) {
            msg.error(`Please add ${qty} serial number(s) (currently ${pendingSerials.length}).`);
            return;
          }
        }

        await api.post<RestrictedItem>("/api/restricted-inventory/items", values);
        for (const img of pendingImages) {
          await uploadImage(values.item_code, img);
        }

        if (values.is_serial_tracked && pendingSerials.length) {
          for (const sn of pendingSerials) {
            await api.post<RestrictedSerialUnit>(
              `/api/restricted-inventory/items/${encodeURIComponent(values.item_code)}/serials`,
              { serial_number: sn }
            );
          }
        }
        msg.success("Item created");
      } else {
        if (!active) return;
        await api.put<RestrictedItem>(`/api/restricted-inventory/items/${encodeURIComponent(active.item_code)}`, {
          category: values.category,
          name: values.name,
          description: values.description,
          is_serial_tracked: values.is_serial_tracked,
          unit_name: values.unit_name,
          quantity_on_hand: values.quantity_on_hand,
          min_quantity: values.min_quantity,
          make_model: values.make_model,
          caliber: values.caliber,
          storage_location: values.storage_location,
          requires_maintenance: values.requires_maintenance,
          requires_cleaning: values.requires_cleaning,
          status: values.status,
        });
        for (const img of pendingImages) {
          await uploadImage(active.item_code, img);
        }
        msg.success("Item updated");
      }
      setDrawerOpen(false);
      await load();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Save failed"));
    }
  }, [active, drawerMode, form, load, msg, pendingImages, pendingSerials, uploadImage]);

  const doAction = useCallback(
    async (kind: ActionKind) => {
      if (!active) return;

      try {
        const payload: Record<string, unknown> = { notes: actionNote.trim() || undefined };

        if (active.is_serial_tracked) {
          payload.serial_numbers = actionSerials;
          payload.employee_id = actionEmp;
        } else {
          payload.quantity = actionQty;
          payload.employee_id = actionEmp;
        }

        await api.post<RestrictedTransaction[]>(
          `/api/restricted-inventory/items/${encodeURIComponent(active.item_code)}/${kind}`,
          payload
        );

        msg.success("Saved");
        resetActionForm();
        await load();
        await loadTx(active.item_code);
        if (active.is_serial_tracked) await loadSerials(active.item_code);
      } catch (e: unknown) {
        msg.error(errorMessage(e, "Action failed"));
      }
    },
    [active, actionEmp, actionNote, actionQty, actionSerials, load, loadSerials, loadTx, msg, resetActionForm]
  );

  const onSerialSelectionChange = useCallback(
    (selectedRowKeys: React.Key[], selectedRows: RestrictedSerialUnit[]) => {
      const sns = selectedRows.map((r) => r.serial_number);
      setActionSerials(sns);

      const empIds = Array.from(
        new Set(
          selectedRows
            .map((r) => (r.issued_to_employee_id ? String(r.issued_to_employee_id) : ""))
            .filter((x) => Boolean(x))
        )
      );
      if (!actionEmp && empIds.length === 1) {
        setActionEmp(empIds[0]);
      }

      if (selectedRowKeys.length === 0) {
        setActionEmp(undefined);
      }
    },
    [actionEmp]
  );

  const columns = useMemo<ColumnsType<RestrictedItem>>(
    () => [
      {
        title: "Code",
        dataIndex: "item_code",
        width: 120,
        render: (v) => <Tag color="blue">{String(v)}</Tag>,
      },
      { title: "Type", dataIndex: "category", width: 110, ellipsis: true },
      { title: "Name", dataIndex: "name", ellipsis: true },
      {
        title: "Stock",
        width: 110,
        render: (_, r) =>
          r.is_serial_tracked ? (
            <Tag color={
              typeof r.min_quantity === "number" && typeof r.serial_in_stock === "number" && r.serial_in_stock <= r.min_quantity
                ? "red"
                : "purple"
            }>
              Serial ({r.serial_in_stock ?? 0}/{r.serial_total ?? 0})
            </Tag>
          ) : (
            <Tag color={r.quantity_on_hand <= (r.min_quantity ?? -1) ? "red" : "green"}>
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

  const employeeOptions = useMemo(() => {
    return employees.map((e) => ({
      value: e.employee_id,
      label: `${e.employee_id} - ${e.first_name} ${e.last_name}`,
    }));
  }, [employees]);

  const itemOptions = useMemo(() => {
    return rows.map((r) => ({
      label: `${r.item_code} - ${r.name}`,
      value: r.item_code,
    }));
  }, [rows]);

  const allocFilteredItemOptions = useMemo(() => {
    const q = String(allocItemSearch || "").trim().toLowerCase();
    if (!q) return itemOptions;
    return itemOptions.filter((o) => String(o.label || "").toLowerCase().includes(q));
  }, [allocItemSearch, itemOptions]);

  const allocFilteredItems = useMemo(() => {
    const q = String(allocItemSearch || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.item_code} ${r.name} ${r.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allocItemSearch, rows]);

  const allocTableColumns: ColumnsType<RestrictedItem> = useMemo(
    () => [
      {
        title: "Item",
        key: "item",
        render: (_, r) => (
          <Typography.Text>
            <b>{r.item_code}</b> {r.name ? `- ${r.name}` : ""}
          </Typography.Text>
        ),
        ellipsis: true,
      },
      {
        title: "Tracking",
        key: "tracking",
        width: 120,
        render: (_, r) => (r.is_serial_tracked ? <Tag color="purple">Serial</Tag> : <Tag color="green">Quantity</Tag>),
      },
      {
        title: "Available",
        key: "available",
        width: 120,
        render: (_, r) =>
          r.is_serial_tracked ? (
            <Tag color="gold">{Number(r.serial_in_stock ?? 0)}</Tag>
          ) : (
            <Tag color="gold">
              {Number(r.quantity_on_hand ?? 0)} {r.unit_name}
            </Tag>
          ),
      },
      {
        title: "Allocate",
        key: "allocate",
        width: 280,
        render: (_, r) => {
          const code = r.item_code;
          const selected = allocSelectedCodes.includes(code);
          if (!selected) return <Typography.Text type="secondary">Select row</Typography.Text>;

          if (r.is_serial_tracked) {
            const itemCode = code;
            return (
              <Select
                mode="multiple"
                placeholder="Select serials"
                style={{ width: "100%" }}
                loading={Boolean(itemCode && allocSerialsLoading[itemCode])}
                value={allocSerialsSelectedByCode[itemCode] ?? []}
                options={(allocSerialsByItem[itemCode] ?? []).map((sn) => ({ label: sn, value: sn }))}
                onChange={(v) => {
                  const sns = (Array.isArray(v) ? v : []).map(String);
                  setAllocSerialsSelectedByCode((p) => ({ ...p, [itemCode]: sns }));
                }}
              />
            );
          }

          return (
            <InputNumber
              min={1}
              style={{ width: "100%" }}
              value={allocQtyByCode[code] ?? 1}
              onChange={(v) => setAllocQtyByCode((p) => ({ ...p, [code]: Number(v ?? 0) }))}
            />
          );
        },
      },
    ],
    [
      allocQtyByCode,
      allocSelectedCodes,
      allocSerialsByItem,
      allocSerialsLoading,
      allocSerialsSelectedByCode,
    ]
  );

  return (
    <>
      {msgCtx}
      <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          <Row gutter={[8, 8]} align="middle">
            <Col flex="auto">
              <Space size={8} wrap>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Restricted Weapons
                </Typography.Title>
                <Badge count={rows.length} showZero color="#1677ff" style={{ boxShadow: "none" }} />
              </Space>
            </Col>
            <Col>
              <Space size={6} wrap>
                <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button onClick={openAllocate}>
                  Allocate Weapon
                </Button>
                <Button onClick={() => router.push("/restricted-inventory/employee-allocations")}>
                  Employee Allocations
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  New
                </Button>
              </Space>
            </Col>
          </Row>

          <Table
            rowKey={(r) => r.id}
            size="small"
            loading={loading}
            dataSource={rows}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            rowClassName={(r) => {
              if (r.is_serial_tracked) {
                if (typeof r.min_quantity === "number" && typeof r.serial_in_stock === "number" && r.serial_in_stock <= r.min_quantity) {
                  return "row-low";
                }
                return "";
              }
              if (typeof r.min_quantity === "number" && Number(r.quantity_on_hand ?? 0) <= r.min_quantity) return "row-low";
              return "";
            }}
          />
        </Space>
      </Card>

      <style>{".row-low td { background: #fff2f0 !important; }"}</style>

      <Drawer
        title={
          drawerMode === "create"
            ? "New Restricted Item"
            : drawerMode === "edit"
              ? `Edit: ${active?.item_code ?? ""}`
              : `View: ${active?.item_code ?? ""}`
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="right"
        width={1020}
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
                  placeholder="GUN-0001 / AMMO-0001"
                  onChange={() => {
                    if (drawerMode === "create") setItemCodeTouched(true);
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "Firearm", value: "firearm" },
                    { label: "Ammo", value: "ammo" },
                    { label: "Tactical", value: "tactical" },
                    { label: "Equipment", value: "equipment" },
                  ]}
                  onChange={(v) => {
                    const category = String(v || "firearm");
                    if (drawerMode === "create" && !itemCodeTouched) {
                      const prefix =
                        category === "ammo"
                          ? "AMMO-"
                          : category === "tactical"
                            ? "TAC-"
                            : category === "equipment"
                              ? "EQP-"
                              : "GUN-";

                      let max = 0;
                      for (const r of rows) {
                        const code = String(r.item_code || "");
                        if (!code.startsWith(prefix)) continue;
                        const tail = code.slice(prefix.length);
                        const n = Number.parseInt(tail, 10);
                        if (Number.isFinite(n) && n > max) max = n;
                      }
                      const next = max + 1;
                      form.setFieldValue("item_code", `${prefix}${String(next).padStart(4, "0")}`);
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select options={[{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }]} />
              </Form.Item>
            </Col>

            <Col xs={24} md={16}>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input placeholder="Glock 19 / 9mm Ammo Box / Smoke Grenade" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="is_serial_tracked" label="Tracking" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: "Serial (guns)", value: true },
                    { label: "Quantity (ammo/items)", value: false },
                  ]}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="unit_name" label="Unit">
                <Input placeholder="unit / round / box" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="quantity_on_hand" label="Qty On Hand">
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="min_quantity" label="Min Qty">
                <Input type="number" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="make_model" label="Make / Model">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="caliber" label="Caliber">
                <Input placeholder="9mm / 5.56" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="storage_location" label="Storage Location">
                <Input placeholder="Armory / Locker 3" />
              </Form.Item>
            </Col>

            <Col xs={24}>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
              <Typography.Text strong>Images</Typography.Text>

              {drawerMode !== "view" ? (
                <div style={{ marginTop: 8 }}>
                  <Upload
                    accept="image/*"
                    multiple
                    beforeUpload={(f) => {
                      setPendingImages((p) => [...p, f as File]);
                      return false;
                    }}
                    onRemove={(f) => {
                      setPendingImages((p) => p.filter((x) => x.name !== f.name));
                      return true;
                    }}
                    fileList={pendingImages.map((f) => ({ uid: f.name, name: f.name, status: "done" }))}
                  >
                    <Button size="small">Add Images</Button>
                  </Upload>
                  <Typography.Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                    Images upload when you click Save.
                  </Typography.Text>
                </div>
              ) : null}

              <div style={{ marginTop: 8 }}>
                {imagesLoading ? (
                  <Typography.Text type="secondary">Loading...</Typography.Text>
                ) : images.length === 0 ? (
                  <Typography.Text type="secondary">No images</Typography.Text>
                ) : (
                  <Space size={8} wrap>
                    {images.map((img) => (
                      <div key={img.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <a href={`${API_BASE_URL}${img.url}`} target="_blank" rel="noreferrer">
                          <Image
                            src={`${API_BASE_URL}${img.url}`}
                            alt={img.filename}
                            width={110}
                            height={80}
                            style={{ objectFit: "cover", borderRadius: 10 }}
                            preview={false}
                          />
                        </a>
                        {drawerMode === "edit" && active ? (
                          <Popconfirm title="Delete this image?" onConfirm={() => void deleteImage(active.item_code, img.id)}>
                            <Button size="small" danger>
                              Delete
                            </Button>
                          </Popconfirm>
                        ) : null}
                      </div>
                    ))}
                  </Space>
                )}
              </div>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
              <Typography.Text strong>Serials / Stock</Typography.Text>

              {drawerMode === "create" ? (
                watchIsSerialTracked ? (
                  <>
                    <Typography.Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                      Add serials now. They will be created when you click Save.
                    </Typography.Text>

                    <Space size={6} style={{ marginTop: 8 }}>
                      <Input
                        size="small"
                        placeholder="Serial number"
                        style={{ width: 220 }}
                        value={pendingSerialInput}
                        onChange={(e) => setPendingSerialInput(e.target.value)}
                      />
                      <Button size="small" type="primary" onClick={addPendingSerial}>
                        Add
                      </Button>
                      <Typography.Text type="secondary">
                        {Number(watchQtyOnHand ?? 0) > 0
                          ? `${pendingSerials.length}/${Number(watchQtyOnHand ?? 0)}`
                          : `${pendingSerials.length}`}
                      </Typography.Text>
                    </Space>

                    <div style={{ marginTop: 10 }}>
                      {pendingSerials.length === 0 ? (
                        <Typography.Text type="secondary">No serials added yet.</Typography.Text>
                      ) : (
                        <Space direction="vertical" size={6} style={{ width: "100%" }}>
                          {pendingSerials.map((sn, idx) => (
                            <Row key={sn} gutter={[8, 8]} align="middle" justify="space-between">
                              <Col flex="auto">
                                <Tag color="blue">{sn}</Tag>
                              </Col>
                              <Col>
                                <Button size="small" danger onClick={() => removePendingSerial(idx)}>
                                  Remove
                                </Button>
                              </Col>
                            </Row>
                          ))}
                        </Space>
                      )}
                    </div>
                  </>
                ) : (
                  <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                    Quantity item: adjust stock via Qty On Hand + Save.
                  </Typography.Text>
                )
              ) : active?.is_serial_tracked ? (
                <>
                  {drawerMode !== "view" ? (
                    <Space size={6} style={{ marginTop: 8 }}>
                      <Input
                        size="small"
                        placeholder="Serial number"
                        style={{ width: 220 }}
                        value={newSerial}
                        onChange={(e) => setNewSerial(e.target.value)}
                      />
                      <Button size="small" type="primary" onClick={() => void addSerial()}>
                        Add
                      </Button>
                    </Space>
                  ) : null}

                  <div style={{ marginTop: 10 }}>
                    {serialsLoading ? (
                      <Typography.Text type="secondary">Loading...</Typography.Text>
                    ) : serials.length === 0 ? (
                      <Typography.Text type="secondary">No serials</Typography.Text>
                    ) : (
                      <Table<RestrictedSerialUnit>
                        rowKey={(r) => r.id}
                        size="small"
                        dataSource={drawerMode === "view" ? serials.filter((s) => s.status === "in_stock") : serials}
                        columns={serialColumns}
                        pagination={{ pageSize: 8, showSizeChanger: true }}
                        rowSelection={
                          drawerMode === "view"
                            ? undefined
                            : {
                                selectedRowKeys: actionSerials,
                                onChange: onSerialSelectionChange,
                                getCheckboxProps: (r) => ({
                                  disabled: actionKind === "issue" ? r.status !== "in_stock" : false,
                                }),
                              }
                        }
                        onRow={(r) => ({
                          onClick: () => {
                            if (drawerMode === "view") return;
                            setActionSerials((prev) => {
                              const has = prev.includes(r.serial_number);
                              const next = has ? prev.filter((x) => x !== r.serial_number) : [...prev, r.serial_number];
                              return next;
                            });
                            if (!actionEmp && r.issued_to_employee_id) {
                              setActionEmp(String(r.issued_to_employee_id));
                            }
                          },
                        })}
                      />
                    )}
                  </div>
                </>
              ) : (
                <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                  Quantity item: adjust stock via Qty On Hand + Save.
                </Typography.Text>
              )}
            </Card>
          </Col>

          <Col xs={24}>
            {active && drawerMode !== "view" ? (
              <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Typography.Text strong>Issue / Return / Lost / Maintenance</Typography.Text>

                <Row gutter={[8, 8]} style={{ marginTop: 8 }} align="middle">
                  <Col xs={24} md={6}>
                    <Select
                      size="small"
                      placeholder="Action"
                      style={{ width: "100%" }}
                      value={actionKind}
                      onChange={(v) => setActionKind(v)}
                      options={[
                        { label: "Issue", value: "issue" },
                        { label: "Return", value: "return" },
                        { label: "Lost", value: "lost" },
                        { label: "Found", value: "found" },
                        { label: "Available", value: "available" },
                        { label: "Damaged", value: "damaged" },
                        { label: "Maintenance", value: "maintenance" },
                        { label: "Cleaning", value: "cleaning" },
                      ]}
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <Select
                      size="small"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Employee"
                      style={{ width: "100%" }}
                      value={actionEmp}
                      onChange={(v) => setActionEmp(v ?? undefined)}
                      options={employeeOptions}
                    />
                  </Col>

                  <Col xs={24} md={8}>
                    {active.is_serial_tracked ? (
                      <Input
                        size="small"
                        disabled
                        placeholder="Select serial(s) from table"
                        value={actionSerials.length ? `${actionSerials.length} selected` : ""}
                      />
                    ) : (
                      <Input
                        size="small"
                        type="number"
                        placeholder="Quantity"
                        value={actionQty ?? undefined}
                        onChange={(e) => setActionQty(e.target.value ? Number(e.target.value) : null)}
                      />
                    )}
                  </Col>

                  <Col xs={24} md={8}>
                    <Input
                      size="small"
                      placeholder="Note"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                    />
                  </Col>

                  <Col xs={24}>
                    <Space size={6} wrap>
                      <Button
                        size="small"
                        type="primary"
                        disabled={
                          active.is_serial_tracked
                            ? actionSerials.length === 0 || !actionEmp
                            : actionQty === null || !actionEmp
                        }
                        onClick={() => void doAction(actionKind)}
                      >
                        Apply
                      </Button>
                      <Button size="small" onClick={resetActionForm}>
                        Clear
                      </Button>
                    </Space>
                  </Col>
                </Row>
              </Card>
            ) : null}
          </Col>

          <Col xs={24}>
            {active && drawerMode !== "view" ? (
              <Card size="small" variant="outlined" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
                <Row align="middle" justify="space-between" gutter={[8, 8]}>
                  <Col>
                    <Typography.Text strong>Transaction History</Typography.Text>
                  </Col>
                  <Col>
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadTx(active.item_code)}>
                      Refresh
                    </Button>
                  </Col>
                </Row>

                <Table<RestrictedTransaction>
                  rowKey={(r) => r.id}
                  size="small"
                  loading={txLoading}
                  dataSource={txs}
                  pagination={{ pageSize: 8, showSizeChanger: true }}
                  style={{ marginTop: 8 }}
                  columns={[
                    {
                      title: "Time",
                      dataIndex: "created_at",
                      width: 170,
                      render: (v) => <Typography.Text>{String(v).replace("T", " ").slice(0, 19)}</Typography.Text>,
                    },
                    {
                      title: "Action",
                      dataIndex: "action",
                      width: 120,
                      render: (v) => {
                        const s = String(v ?? "");
                        const c = s === "ISSUE" ? "gold" : s === "RETURN" ? "green" : s === "LOST" ? "red" : "blue";
                        return <Tag color={c}>{s}</Tag>;
                      },
                    },
                    { title: "Employee", dataIndex: "employee_id", width: 140, ellipsis: true },
                    { title: "Qty", dataIndex: "quantity", width: 90 },
                    { title: "Serial Unit", dataIndex: "serial_unit_id", width: 90 },
                    { title: "Note", dataIndex: "notes", ellipsis: true },
                  ]}
                />
              </Card>
            ) : null}
          </Col>
        </Row>
      </Drawer>

      <Drawer
        title="Allocate Weapon"
        open={allocOpen}
        onClose={() => setAllocOpen(false)}
        placement="right"
        width={820}
        extra={
          <Space size={8}>
            <Input
              placeholder="Search weapon"
              value={allocItemSearch}
              onChange={(e) => setAllocItemSearch(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            <Button onClick={() => setAllocOpen(false)}>Cancel</Button>
            <Button type="primary" loading={allocLoading} onClick={() => void submitAllocation()}>
              Allocate
            </Button>
          </Space>
        }
      >
        <Form form={allocForm} layout="vertical">
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              background: "#fff",
              paddingTop: 4,
              paddingBottom: 4,
              marginBottom: 8,
            }}
          >
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
                <Form.Item name="date" label="Date" initialValue={dayjs()} rules={[{ required: true }]}>
                  <DatePicker style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={10}>
                <Form.Item name="notes" label="Notes">
                  <Input placeholder="Optional notes" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <Table<RestrictedItem>
            rowKey={(r) => r.item_code}
            size="small"
            dataSource={allocFilteredItems}
            columns={allocTableColumns}
            pagination={false}
            rowSelection={{
              selectedRowKeys: allocSelectedCodes,
              onChange: (keys) => {
                const next = (Array.isArray(keys) ? keys : []).map((k) => String(k));
                setAllocSelectedCodes(next);

                setAllocQtyByCode((prev) => {
                  const out: Record<string, number> = { ...prev };
                  for (const k of next) {
                    if (out[k] == null) out[k] = 1;
                  }
                  for (const k of Object.keys(out)) {
                    if (!next.includes(k)) delete out[k];
                  }
                  return out;
                });

                setAllocSerialsSelectedByCode((prev) => {
                  const out: Record<string, string[]> = { ...prev };
                  for (const k of Object.keys(out)) {
                    if (!next.includes(k)) delete out[k];
                  }
                  return out;
                });

                // Prefetch serials for any selected serial-tracked items.
                for (const k of next) {
                  const it = itemsByCode.get(k);
                  if (it?.is_serial_tracked) void loadAllocSerials(k);
                }
              },
            }}
          />
        </Form>
      </Drawer>
    </>
  );
}
