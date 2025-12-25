"use client";

import { Button, Card, Form, Input, Modal, Table, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Permission = {
  id: number;
  key: string;
  description?: string | null;
};

export default function PermissionsPage() {
  const [rows, setRows] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Permission[]>("/api/admin/permissions");
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(
    () => [
      { title: "Key", dataIndex: "key" },
      { title: "Description", dataIndex: "description" },
    ],
    []
  );

  const onCreate = async () => {
    const v = await form.validateFields();
    await api.post<Permission>("/api/admin/permissions", v);
    message.success("Permission created");
    setOpen(false);
    form.resetFields();
    await load();
  };

  return (
    <Card
      title={<Typography.Title level={4} style={{ margin: 0 }}>Permissions</Typography.Title>}
      extra={<Button onClick={() => setOpen(true)}>New Permission</Button>}
    >
      <Table rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={{ pageSize: 20 }} />

      <Modal title="Create Permission" open={open} onCancel={() => setOpen(false)} onOk={onCreate} okText="Create">
        <Form form={form} layout="vertical">
          <Form.Item name="key" label="Key" rules={[{ required: true }]}>
            <Input placeholder="e.g. attendance:manage" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
