"use client";

import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Permission = { id: number; key: string; description?: string | null };

type Role = {
  id: number;
  name: string;
  description?: string | null;
  is_system: boolean;
  permissions: Permission[];
};

type AdminUser = {
  id: number;
  email: string;
  username: string;
  full_name?: string | null;
  is_active: boolean;
  is_superuser: boolean;
  roles: Role[];
};

const SEEDED_PASSWORDS: Record<string, string> = {
  superadmin: "SuperAdmin@123",
  employee_entry: "Employee@123",
  attendance_manager: "Attendance@123",
  hr_payroll: "HRPayroll@123",
  clients_view: "Clients@123",
  accounts_full: "Accounts@123",
  hr_payroll_accounts: "HRPayrollAccounts@123",
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        api.get<AdminUser[]>("/api/admin/users"),
        api.get<Role[]>("/api/admin/roles"),
      ]);
      setUsers(u);
      setRoles(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(
    () => [
      { title: "ID", dataIndex: "id", width: 80 },
      { title: "Username", dataIndex: "username" },
      {
        title: "Password",
        render: (_: unknown, row: AdminUser) => SEEDED_PASSWORDS[row.username] ?? "—",
      },
      { title: "Email", dataIndex: "email" },
      { title: "Name", dataIndex: "full_name" },
      { title: "Active", render: (_: unknown, row: AdminUser) => (row.is_active ? "Yes" : "No") },
      { title: "Superuser", render: (_: unknown, row: AdminUser) => (row.is_superuser ? "Yes" : "No") },
      { title: "Roles", render: (_: unknown, row: AdminUser) => row.roles.map((r) => r.name).join(", ") },
      {
        title: "Actions",
        render: (_: unknown, row: AdminUser) => (
          <Space>
            <Button
              onClick={() => {
                setEditing(row);
                form.setFieldsValue({
                  email: row.email,
                  username: row.username,
                  full_name: row.full_name,
                  is_active: row.is_active,
                  is_superuser: row.is_superuser,
                  role_ids: row.roles.map((r) => r.id),
                });
                setOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              danger
              onClick={async () => {
                await api.del<void>(`/api/admin/users/${row.id}`);
                message.success("User deleted");
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
      await api.put<AdminUser>(`/api/admin/users/${editing.id}`, v);
      message.success("User updated");
    } else {
      await api.post<AdminUser>("/api/admin/users", v);
      message.success("User created");
    }
    setOpen(false);
    setEditing(null);
    form.resetFields();
    await load();
  };

  return (
    <Card
      title={<Typography.Title level={4} style={{ margin: 0 }}>Users</Typography.Title>}
      extra={
        <Button
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setOpen(true);
          }}
        >
          New User
        </Button>
      }
    >
      <Table rowKey="id" loading={loading} dataSource={users} columns={columns} pagination={{ pageSize: 10 }} />

      <Modal
        title={editing ? "Edit User" : "Create User"}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={onSave}
        okText={editing ? "Save" : "Create"}
      >
        <Form form={form} layout="vertical" initialValues={{ is_active: true, is_superuser: false, role_ids: [] }}>
          <Form.Item name="email" label="Email" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="full_name" label="Full Name">
            <Input />
          </Form.Item>

          <Form.Item name="password" label={editing ? "Reset Password (optional)" : "Password"} rules={editing ? [] : [{ required: true }]}>
            <Input.Password />
          </Form.Item>

          <Form.Item name="role_ids" label="Roles">
            <Select
              mode="multiple"
              options={roles.map((r) => ({ label: r.name, value: r.id }))}
              placeholder="Select roles"
            />
          </Form.Item>

          <Form.Item label="Active" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="Superuser" name="is_superuser" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
