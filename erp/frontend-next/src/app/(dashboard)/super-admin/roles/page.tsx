"use client";

import { Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Permission = {
  id: number;
  key: string;
  description?: string | null;
};

type Role = {
  id: number;
  name: string;
  description?: string | null;
  is_system: boolean;
  permissions: Permission[];
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api.get<Role[]>("/api/admin/roles"),
        api.get<Permission[]>("/api/admin/permissions"),
      ]);
      setRoles(r);
      setPerms(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(
    () => [
      { title: "Name", dataIndex: "name" },
      { title: "Description", dataIndex: "description" },
      {
        title: "Permissions",
        render: (_: unknown, row: Role) => row.permissions.map((x) => x.key).join(", "),
      },
      {
        title: "Actions",
        render: (_: unknown, row: Role) => (
          <Space>
            <Button
              onClick={() => {
                setEditing(row);
                form.setFieldsValue({
                  name: row.name,
                  description: row.description,
                  permission_keys: row.permissions.map((p) => p.key),
                });
                setOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              danger
              disabled={row.is_system}
              onClick={async () => {
                await api.del<void>(`/api/admin/roles/${row.id}`);
                message.success("Role deleted");
                await load();
              }}
            >
              Delete
            </Button>
          </Space>
        ),
      },
    ],
    [form]
  );

  const onSave = async () => {
    const v = await form.validateFields();
    if (editing) {
      await api.put<Role>(`/api/admin/roles/${editing.id}`, v);
      message.success("Role updated");
    } else {
      await api.post<Role>("/api/admin/roles", v);
      message.success("Role created");
    }
    setOpen(false);
    setEditing(null);
    form.resetFields();
    await load();
  };

  return (
    <Card
      title={<Typography.Title level={4} style={{ margin: 0 }}>Roles</Typography.Title>}
      extra={
        <Button
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setOpen(true);
          }}
        >
          New Role
        </Button>
      }
    >
      <Table rowKey="id" loading={loading} dataSource={roles} columns={columns} pagination={{ pageSize: 10 }} />

      <Modal
        title={editing ? "Edit Role" : "Create Role"}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={onSave}
        okText={editing ? "Save" : "Create"}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item name="permission_keys" label="Permissions">
            <Select
              mode="multiple"
              options={perms.map((p) => ({ label: p.key, value: p.key }))}
              placeholder="Select permissions"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
