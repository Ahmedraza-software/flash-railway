"use client";

import { Button, Card, Space, Table, Tag, Typography, message, Modal, Form, Input, Select } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const { Option } = Select;

interface FinanceAccount {
  id: number;
  code: string;
  name: string;
  account_type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  parent_id?: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

const ACCOUNT_TYPE_COLORS = {
  ASSET: "blue",
  LIABILITY: "red",
  EQUITY: "purple",
  INCOME: "green",
  EXPENSE: "orange"
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

export default function ChartOfAccountsPage() {
  const [msg, msgCtx] = message.useMessage();
  
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null);
  const [form] = Form.useForm();

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<FinanceAccount[]>("/api/finance/accounts");
      setAccounts(Array.isArray(response) ? response : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load accounts"));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const handleCreateAccount = useCallback(async (values: any) => {
    try {
      await api.post("/api/finance/accounts", {
        code: values.code,
        name: values.name,
        account_type: values.account_type,
        parent_id: values.parent_id || null,
        is_system: false,
        is_active: true
      });
      
      msg.success("Account created successfully");
      setModalOpen(false);
      form.resetFields();
      void loadAccounts();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to create account"));
    }
  }, [msg, form, loadAccounts]);

  const handleUpdateAccount = useCallback(async (values: any) => {
    if (!editingAccount) return;
    
    try {
      await api.put(`/api/finance/accounts/${editingAccount.id}`, {
        name: values.name,
        account_type: values.account_type,
        parent_id: values.parent_id || null,
        is_active: values.is_active
      });
      
      msg.success("Account updated successfully");
      setModalOpen(false);
      setEditingAccount(null);
      form.resetFields();
      void loadAccounts();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to update account"));
    }
  }, [editingAccount, msg, form, loadAccounts]);

  const handleDeleteAccount = useCallback(async (account: FinanceAccount) => {
    if (account.is_system) {
      msg.warning("System accounts cannot be deleted");
      return;
    }

    Modal.confirm({
      title: "Delete Account",
      content: `Are you sure you want to delete account "${account.name}"?`,
      onOk: async () => {
        try {
          await api.del(`/api/finance/accounts/${account.id}`);
          msg.success("Account deleted successfully");
          void loadAccounts();
        } catch (e: unknown) {
          msg.error(errorMessage(e, "Failed to delete account"));
        }
      }
    });
  }, [msg, loadAccounts]);

  const openCreateModal = useCallback(() => {
    setEditingAccount(null);
    form.resetFields();
    setModalOpen(true);
  }, [form]);

  const openEditModal = useCallback((account: FinanceAccount) => {
    setEditingAccount(account);
    form.setFieldsValue({
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      parent_id: account.parent_id,
      is_active: account.is_active
    });
    setModalOpen(true);
  }, [form]);

  const columns: ColumnsType<FinanceAccount> = [
    {
      title: "Code",
      dataIndex: "code",
      key: "code",
      width: 120
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name"
    },
    {
      title: "Type",
      dataIndex: "account_type",
      key: "account_type",
      width: 120,
      render: (type: string) => (
        <Tag color={ACCOUNT_TYPE_COLORS[type as keyof typeof ACCOUNT_TYPE_COLORS]}>
          {type}
        </Tag>
      )
    },
    {
      title: "System",
      dataIndex: "is_system",
      key: "is_system",
      width: 80,
      render: (isSystem: boolean) => (
        <Tag color={isSystem ? "red" : "default"}>
          {isSystem ? "Yes" : "No"}
        </Tag>
      )
    },
    {
      title: "Active",
      dataIndex: "is_active",
      key: "is_active",
      width: 80,
      render: (isActive: boolean) => (
        <Tag color={isActive ? "green" : "red"}>
          {isActive ? "Yes" : "No"}
        </Tag>
      )
    },
    {
      title: "Actions",
      key: "actions",
      width: 120,
      render: (_, account) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(account)}
          />
          {!account.is_system && (
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteAccount(account)}
            />
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      {msgCtx}
      <Card
        title={
          <Space>
            <span>Chart of Accounts</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadAccounts()} loading={loading} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Add Account
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={accounts}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} accounts`
          }}
        />
      </Card>

      <Modal
        title={editingAccount ? "Edit Account" : "Add New Account"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingAccount(null);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingAccount ? handleUpdateAccount : handleCreateAccount}
        >
          {!editingAccount && (
            <Form.Item
              name="code"
              label="Account Code"
              rules={[{ required: true, message: "Please enter account code" }]}
            >
              <Input placeholder="e.g., EXP-001" />
            </Form.Item>
          )}

          <Form.Item
            name="name"
            label="Account Name"
            rules={[{ required: true, message: "Please enter account name" }]}
          >
            <Input placeholder="e.g., Office Expenses" />
          </Form.Item>

          <Form.Item
            name="account_type"
            label="Account Type"
            rules={[{ required: true, message: "Please select account type" }]}
          >
            <Select>
              {ACCOUNT_TYPES.map(type => (
                <Option key={type} value={type}>{type}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="parent_id" label="Parent Account">
            <Select allowClear placeholder="Select parent account">
              {accounts
                .filter(acc => acc.id !== editingAccount?.id)
                .map(account => (
                  <Option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </Option>
                ))}
            </Select>
          </Form.Item>

          {editingAccount && (
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Select>
                <Option value={true}>Active</Option>
                <Option value={false}>Inactive</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingAccount ? "Update" : "Create"} Account
              </Button>
              <Button onClick={() => {
                setModalOpen(false);
                setEditingAccount(null);
                form.resetFields();
              }}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}