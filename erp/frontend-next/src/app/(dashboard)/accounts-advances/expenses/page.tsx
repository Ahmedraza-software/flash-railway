"use client";

import { Button, Card, Col, DatePicker, Drawer, Form, Input, InputNumber, message, Modal, Row, Select, Space, Statistic, Table, Tag, Typography, Upload, Tooltip, Divider, Dropdown } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, DollarOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CreditCardOutlined, UndoOutlined, EyeOutlined, UploadOutlined, DownloadOutlined, FileTextOutlined, FilePdfOutlined, ExportOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRs } from "@/lib/money";

const { TextArea } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface Expense {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  vendor_name?: string;
  receipt_number?: string;
  notes?: string;
  attachment_url?: string;
  employee_id?: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  journal_entry_id?: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  approved_at?: string;
  paid_at?: string;
}

interface ExpenseSummary {
  total_expenses: number;
  pending_expenses: number;
  approved_expenses: number;
  paid_expenses: number;
  expense_count: number;
  categories: Record<string, number>;
}

interface Employee {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
}

const EXPENSE_CATEGORIES = [
  "Office Supplies",
  "Travel & Transportation", 
  "Utilities",
  "Rent",
  "Marketing & Advertising",
  "Professional Services",
  "Equipment & Maintenance",
  "Insurance",
  "Training & Development",
  "Meals & Entertainment",
  "Communication",
  "Other"
];

const STATUS_COLORS = {
  PENDING: { color: "#fa8c16", bg: "#fff7e6", border: "#ffd591" },
  APPROVED: { color: "#1677ff", bg: "#f0f5ff", border: "#adc6ff" },
  REJECTED: { color: "#ff4d4f", bg: "#fff2f0", border: "#ffb3b3" },
  PAID: { color: "#52c41a", bg: "#f6ffed", border: "#b7eb8f" }
};

function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

export default function ExpensesPage() {
  const [msg, msgCtx] = message.useMessage();
  
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewDrawerOpen, setViewDrawerOpen] = useState(false);
  const [exportDrawerOpen, setExportDrawerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [form] = Form.useForm();
  const [exportForm] = Form.useForm();
  const [uploadedFile, setUploadedFile] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [expensesRes, summaryRes, employeesRes] = await Promise.all([
        api.get<Expense[]>("/api/expenses/", {
          query: {
            from_date: dayjs(month + "-01").startOf("month").format("YYYY-MM-DD"),
            to_date: dayjs(month + "-01").endOf("month").format("YYYY-MM-DD"),
            status: statusFilter === "all" ? undefined : statusFilter,
            category: categoryFilter === "all" ? undefined : categoryFilter,
            limit: 1000
          }
        }),
        api.get<ExpenseSummary>("/api/expenses/summary/monthly", {
          query: { month }
        }),
        api.get<{ employees: Employee[] }>("/api/employees/", {
          query: { limit: 1000 }
        })
      ]);

      // Parse amounts as numbers
      const parsedExpenses = Array.isArray(expensesRes) 
        ? expensesRes.map(exp => ({
            ...exp,
            amount: typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount
          }))
        : [];
      
      setExpenses(parsedExpenses);
      setSummary(summaryRes || null);
      setEmployees(Array.isArray(employeesRes?.employees) ? employeesRes.employees : []);
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to load expenses"));
      setExpenses([]);
      setSummary(null);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [month, statusFilter, categoryFilter, msg]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateExpense = useCallback(async (values: any) => {
    try {
      let attachmentUrl = values.attachment_url;
      
      // Upload file if one was selected
      if (uploadedFile && uploadedFile instanceof File) {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        
        try {
          // Upload to a simple endpoint (we'll create this)
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          
          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            attachmentUrl = uploadData.url || uploadData.path;
          } else {
            msg.warning('File upload failed, saving without attachment');
            attachmentUrl = null;
          }
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
          msg.warning('File upload failed, saving without attachment');
          attachmentUrl = null;
        }
      }
      
      await api.post("/api/expenses/", {
        expense_date: values.expense_date.format("YYYY-MM-DD"),
        category: values.category,
        description: values.description,
        amount: values.amount,
        vendor_name: values.vendor_name || null,
        receipt_number: values.receipt_number || null,
        notes: values.notes || null,
        attachment_url: attachmentUrl || null,
        employee_id: values.employee_id || null
      });
      
      msg.success("Expense created successfully");
      setDrawerOpen(false);
      setUploadedFile(null);
      form.resetFields();
      void loadData();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to create expense"));
    }
  }, [msg, form, loadData, uploadedFile]);

  const handleUpdateExpense = useCallback(async (values: any) => {
    if (!editingExpense) return;
    
    try {
      let attachmentUrl = values.attachment_url;
      
      // Upload file if one was selected
      if (uploadedFile && uploadedFile instanceof File) {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        
        try {
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          
          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            attachmentUrl = uploadData.url || uploadData.path;
          } else {
            msg.warning('File upload failed, keeping existing attachment');
            attachmentUrl = editingExpense.attachment_url;
          }
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
          msg.warning('File upload failed, keeping existing attachment');
          attachmentUrl = editingExpense.attachment_url;
        }
      }
      
      await api.put(`/api/expenses/${editingExpense.id}`, {
        expense_date: values.expense_date.format("YYYY-MM-DD"),
        category: values.category,
        description: values.description,
        amount: values.amount,
        vendor_name: values.vendor_name || null,
        receipt_number: values.receipt_number || null,
        notes: values.notes || null,
        attachment_url: attachmentUrl || null,
        employee_id: values.employee_id || null
      });
      
      msg.success("Expense updated successfully");
      setDrawerOpen(false);
      setEditingExpense(null);
      setUploadedFile(null);
      form.resetFields();
      void loadData();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to update expense"));
    }
  }, [editingExpense, msg, form, loadData, uploadedFile]);

  const handleApproveExpense = useCallback(async (expense: Expense) => {
    try {
      await api.post(`/api/expenses/${expense.id}/approve`);
      msg.success("Expense approved successfully");
      void loadData();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to approve expense"));
    }
  }, [msg, loadData]);

  const handlePayExpense = useCallback(async (expense: Expense) => {
    try {
      await api.post(`/api/expenses/${expense.id}/pay`);
      msg.success("Expense paid successfully");
      void loadData();
    } catch (e: unknown) {
      msg.error(errorMessage(e, "Failed to pay expense"));
    }
  }, [msg, loadData]);

  const handleUndoPayment = useCallback(async (expense: Expense) => {
    Modal.confirm({
      title: "Undo Payment",
      content: "Are you sure you want to undo this payment? The expense will be marked as approved.",
      onOk: async () => {
        try {
          await api.post(`/api/expenses/${expense.id}/undo-payment`);
          msg.success("Payment undone successfully");
          void loadData();
        } catch (e: unknown) {
          msg.error(errorMessage(e, "Failed to undo payment"));
        }
      }
    });
  }, [msg, loadData]);

  const handleDeleteExpense = useCallback(async (expense: Expense) => {
    Modal.confirm({
      title: "Delete Expense",
      content: "Are you sure you want to delete this expense?",
      onOk: async () => {
        try {
          await api.del(`/api/expenses/${expense.id}`);
          msg.success("Expense deleted successfully");
          void loadData();
        } catch (e: unknown) {
          msg.error(errorMessage(e, "Failed to delete expense"));
        }
      }
    });
  }, [msg, loadData]);

  const openCreateDrawer = useCallback(() => {
    setEditingExpense(null);
    setUploadedFile(null);
    form.resetFields();
    form.setFieldsValue({
      expense_date: dayjs(),
      category: "Other"
    });
    setDrawerOpen(true);
  }, [form]);

  const openEditDrawer = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setUploadedFile(null);
    form.setFieldsValue({
      expense_date: dayjs(expense.expense_date),
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      vendor_name: expense.vendor_name,
      receipt_number: expense.receipt_number,
      notes: expense.notes,
      attachment_url: expense.attachment_url,
      employee_id: expense.employee_id
    });
    setDrawerOpen(true);
  }, [form]);

  const openViewDrawer = useCallback((expense: Expense) => {
    setViewingExpense(expense);
    setViewDrawerOpen(true);
  }, []);

  const exportExpenseToPDF = useCallback(async (expense: Expense) => {
    try {
      const response = await fetch(`http://localhost:8000/api/expenses/${expense.id}/export/pdf`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expense_${expense.id}_${dayjs(expense.expense_date).format('YYYYMMDD')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      msg.success('Expense exported to PDF');
    } catch (e: unknown) {
      msg.error(errorMessage(e, 'Failed to export PDF'));
    }
  }, [msg]);

  const exportExpenseToCSV = useCallback((expense: Expense) => {
    try {
      const csvData = [
        ['Field', 'Value'],
        ['ID', expense.id],
        ['Date', dayjs(expense.expense_date).format('YYYY-MM-DD')],
        ['Category', expense.category],
        ['Description', expense.description],
        ['Amount', expense.amount],
        ['Vendor', expense.vendor_name || ''],
        ['Receipt Number', expense.receipt_number || ''],
        ['Status', expense.status],
        ['Notes', expense.notes || ''],
        ['Created At', dayjs(expense.created_at).format('YYYY-MM-DD HH:mm:ss')],
        ['Approved At', expense.approved_at ? dayjs(expense.approved_at).format('YYYY-MM-DD HH:mm:ss') : ''],
        ['Paid At', expense.paid_at ? dayjs(expense.paid_at).format('YYYY-MM-DD HH:mm:ss') : '']
      ];
      
      const csvContent = csvData.map(row => 
        row.map(cell => {
          const str = String(cell);
          return str.includes(',') || str.includes('"') || str.includes('\n') 
            ? `"${str.replace(/"/g, '""')}"` 
            : str;
        }).join(',')
      ).join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expense_${expense.id}_${dayjs(expense.expense_date).format('YYYYMMDD')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      msg.success('Expense exported to CSV');
    } catch (e: unknown) {
      msg.error(errorMessage(e, 'Failed to export CSV'));
    }
  }, [msg]);

  const handleBulkExport = useCallback(async (values: any) => {
    setExporting(true);
    try {
      const fromDate = values.date_range[0].format('YYYY-MM-DD');
      const toDate = values.date_range[1].format('YYYY-MM-DD');
      const format = values.format;
      
      console.log('Export params:', { fromDate, toDate, format });
      
      if (format === 'pdf') {
        const response = await fetch(
          `http://localhost:8000/api/expenses/export/pdf?from_date=${fromDate}&to_date=${toDate}`
        );
        if (!response.ok) {
          const errorText = await response.text();
          let errorMsg = 'Export failed';
          try {
            const errorData = JSON.parse(errorText);
            errorMsg = errorData.detail || errorMsg;
          } catch {
            errorMsg = errorText || errorMsg;
          }
          throw new Error(errorMsg);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expenses_${fromDate}_to_${toDate}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        // CSV export - use direct fetch to avoid api wrapper issues
        const token = typeof window !== 'undefined' ? window.localStorage.getItem('access_token') : null;
        const url = `http://localhost:8000/api/expenses/?from_date=${fromDate}&to_date=${toDate}&limit=1000`;
        console.log('Fetching expenses from:', url);
        
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log('Error response:', errorText);
          let errorMsg = 'Failed to fetch expenses';
          try {
            const errorData = JSON.parse(errorText);
            // Handle FastAPI validation errors
            if (errorData.detail) {
              if (Array.isArray(errorData.detail)) {
                errorMsg = errorData.detail.map((err: any) => 
                  `${err.loc?.join('.')} - ${err.msg}`
                ).join(', ');
              } else if (typeof errorData.detail === 'string') {
                errorMsg = errorData.detail;
              } else {
                errorMsg = JSON.stringify(errorData.detail);
              }
            }
          } catch {
            errorMsg = errorText || errorMsg;
          }
          throw new Error(errorMsg);
        }
        
        const expensesRes = await response.json();
        console.log('Fetched expenses:', expensesRes.length);
        
        const expensesList = Array.isArray(expensesRes) 
          ? expensesRes.map(exp => ({
              ...exp,
              amount: typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount
            }))
          : [];
        
        if (expensesList.length === 0) {
          msg.warning('No expenses found for the selected date range');
          setExporting(false);
          return;
        }
        
        const csvData = [
          ['ID', 'Date', 'Category', 'Description', 'Amount', 'Vendor', 'Receipt Number', 'Status', 'Notes', 'Created At', 'Approved At', 'Paid At']
        ];
        
        expensesList.forEach(exp => {
          csvData.push([
            String(exp.id),
            dayjs(exp.expense_date).format('YYYY-MM-DD'),
            exp.category,
            exp.description,
            String(exp.amount),
            exp.vendor_name || '',
            exp.receipt_number || '',
            exp.status,
            (exp.notes || '').replace(/\n/g, ' '),
            dayjs(exp.created_at).format('YYYY-MM-DD HH:mm:ss'),
            exp.approved_at ? dayjs(exp.approved_at).format('YYYY-MM-DD HH:mm:ss') : '',
            exp.paid_at ? dayjs(exp.paid_at).format('YYYY-MM-DD HH:mm:ss') : ''
          ]);
        });
        
        const csvContent = csvData.map(row => 
          row.map(cell => {
            const str = String(cell);
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(',')
        ).join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url2 = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url2;
        a.download = `expenses_${fromDate}_to_${toDate}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url2);
      }
      
      msg.success('Expenses exported successfully');
      setExportDrawerOpen(false);
      exportForm.resetFields();
    } catch (e: unknown) {
      console.error('Export error details:', e);
      msg.error(errorMessage(e, 'Failed to export expenses'));
    } finally {
      setExporting(false);
    }
  }, [msg, exportForm]);

  const columns: ColumnsType<Expense> = [
    {
      title: "Date",
      dataIndex: "expense_date",
      key: "expense_date",
      width: 120,
      render: (date: string) => (
        <span style={{ fontWeight: 500 }}>
          {dayjs(date).format("MMM DD, YYYY")}
        </span>
      )
    },
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      width: 140,
      render: (category: string) => (
        <Tag color="blue" style={{ borderRadius: 6 }}>
          {category}
        </Tag>
      )
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (description: string) => (
        <Tooltip title={description}>
          <span style={{ fontWeight: 500 }}>{description}</span>
        </Tooltip>
      )
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      width: 140,
      render: (amount: number) => (
        <span style={{ 
          fontWeight: 600, 
          fontSize: '16px',
          color: '#1677ff'
        }}>
          {formatRs(amount, 2)}
        </span>
      )
    },
    {
      title: "Vendor",
      dataIndex: "vendor_name",
      key: "vendor_name",
      width: 140,
      render: (vendor: string) => vendor || <span style={{ color: '#999' }}>-</span>
    },
    {
      title: "Attach",
      dataIndex: "attachment_url",
      key: "attachment_url",
      width: 80,
      align: 'center' as const,
      render: (url: string) => url ? (
        <Tooltip title="Has attachment">
          <DownloadOutlined style={{ color: '#1677ff', fontSize: '16px' }} />
        </Tooltip>
      ) : (
        <span style={{ color: '#d9d9d9' }}>-</span>
      )
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => {
        const statusConfig = STATUS_COLORS[status as keyof typeof STATUS_COLORS];
        return (
          <Tag 
            color={statusConfig.color}
            style={{ 
              backgroundColor: statusConfig.bg,
              border: `1px solid ${statusConfig.border}`,
              borderRadius: 8,
              fontWeight: 500,
              padding: '4px 12px'
            }}
          >
            {status}
          </Tag>
        );
      }
    },
    {
      title: "Actions",
      key: "actions",
      width: 260,
      render: (_, expense) => (
        <Space size="small" wrap>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openViewDrawer(expense)}
              style={{ borderColor: '#1677ff', color: '#1677ff' }}
            />
          </Tooltip>
          
          {/* Export dropdown */}
          <Dropdown
            menu={{
              items: [
                {
                  key: 'pdf',
                  label: 'Export PDF',
                  icon: <FilePdfOutlined />,
                  onClick: () => exportExpenseToPDF(expense)
                },
                {
                  key: 'csv',
                  label: 'Export CSV',
                  icon: <FileTextOutlined />,
                  onClick: () => exportExpenseToCSV(expense)
                }
              ]
            }}
            placement="bottomRight"
          >
            <Button
              size="small"
              icon={<DownloadOutlined />}
              style={{ borderColor: '#52c41a', color: '#52c41a' }}
            />
          </Dropdown>
          
          {/* Edit button for all statuses except rejected */}
          {expense.status !== "REJECTED" && (
            <Tooltip title="Edit">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditDrawer(expense)}
                style={{ borderColor: '#fa8c16', color: '#fa8c16' }}
              />
            </Tooltip>
          )}
          
          {expense.status === "PENDING" && (
            <Tooltip title="Approve">
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleApproveExpense(expense)}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              />
            </Tooltip>
          )}
          
          {(expense.status === "APPROVED" || expense.status === "PENDING") && (
            <Tooltip title="Pay">
              <Button
                size="small"
                type="primary"
                icon={<CreditCardOutlined />}
                onClick={() => handlePayExpense(expense)}
                style={{ backgroundColor: '#1677ff', borderColor: '#1677ff' }}
              />
            </Tooltip>
          )}
          
          {expense.status === "PAID" && (
            <Tooltip title="Undo Payment">
              <Button
                size="small"
                icon={<UndoOutlined />}
                onClick={() => handleUndoPayment(expense)}
                style={{ borderColor: '#fa8c16', color: '#fa8c16' }}
              />
            </Tooltip>
          )}
          
          <Tooltip title="Delete">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteExpense(expense)}
            />
          </Tooltip>
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
            <DollarOutlined style={{ color: '#1677ff', fontSize: '20px' }} />
            <span style={{ fontSize: '18px', fontWeight: 600 }}>Expenses Management</span>
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={() => void loadData()} 
              loading={loading}
              style={{ borderRadius: 8 }}
            />
            <Button 
              icon={<DownloadOutlined />} 
              onClick={() => setExportDrawerOpen(true)}
              style={{ borderRadius: 8 }}
            >
              Export
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={openCreateDrawer}
              style={{ 
                borderRadius: 8,
                background: 'linear-gradient(135deg, #1677ff 0%, #69c0ff 100%)',
                border: 'none',
                boxShadow: '0 2px 8px rgba(22, 119, 255, 0.3)'
              }}
            >
              Add Expense
            </Button>
          </Space>
        }
        style={{ 
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
        }}
      >
        <Space wrap style={{ width: "100%", justifyContent: "space-between", marginBottom: 20 }}>
          <Space wrap>
            <DatePicker
              picker="month"
              value={dayjs(month + "-01")}
              onChange={(d) => setMonth((d ?? dayjs()).format("YYYY-MM"))}
              style={{ width: 140, borderRadius: 8 }}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140, borderRadius: 8 }}
            >
              <Option value="all">All Status</Option>
              <Option value="PENDING">Pending</Option>
              <Option value="APPROVED">Approved</Option>
              <Option value="PAID">Paid</Option>
              <Option value="REJECTED">Rejected</Option>
            </Select>
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              style={{ width: 180, borderRadius: 8 }}
            >
              <Option value="all">All Categories</Option>
              {EXPENSE_CATEGORIES.map(cat => (
                <Option key={cat} value={cat}>{cat}</Option>
              ))}
            </Select>
          </Space>
        </Space>

        {summary && (
          <Card 
            size="small" 
            style={{ 
              marginBottom: 20,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%)',
              border: '1px solid #91d5ff'
            }}
          >
            <Row gutter={[20, 16]}>
              <Col xs={24} sm={12} md={6}>
                <Card
                  size="small"
                  style={{
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #1677ff 0%, #69c0ff 100%)',
                    border: 'none',
                    color: 'white'
                  }}
                >
                  <Statistic
                    title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>Total Expenses</span>}
                    value={summary.total_expenses}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: 'white', fontWeight: 600  }}}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card
                  size="small"
                  style={{
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #fa8c16 0%, #ffc069 100%)',
                    border: 'none',
                    color: 'white'
                  }}
                >
                  <Statistic
                    title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>Pending</span>}
                    value={summary.pending_expenses}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: 'white', fontWeight: 600  }}}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card
                  size="small"
                  style={{
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #722ed1 0%, #b37feb 100%)',
                    border: 'none',
                    color: 'white'
                  }}
                >
                  <Statistic
                    title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>Approved</span>}
                    value={summary.approved_expenses}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: 'white', fontWeight: 600  }}}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card
                  size="small"
                  style={{
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
                    border: 'none',
                    color: 'white'
                  }}
                >
                  <Statistic
                    title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>Paid</span>}
                    value={summary.paid_expenses}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: 'white', fontWeight: 600  }}}
                  />
                </Card>
              </Col>
            </Row>
          </Card>
        )}

        <Table
          columns={columns}
          dataSource={expenses}
          rowKey="id"
          loading={loading}
          style={{ borderRadius: 8 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} expenses`
          }}
        />
      </Card>

      {/* Create/Edit Drawer */}
      <Drawer
        title={
          <Space>
            <DollarOutlined style={{ color: '#1677ff' }} />
            <span style={{ fontSize: '16px', fontWeight: 600 }}>
              {editingExpense ? "Edit Expense" : "Add New Expense"}
            </span>
          </Space>
        }
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingExpense(null);
          setUploadedFile(null);
          form.resetFields();
        }}
        width={650}
        destroyOnClose
        style={{ borderRadius: '12px 0 0 12px' }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingExpense ? handleUpdateExpense : handleCreateExpense}
          style={{ paddingTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="expense_date"
                label={<span style={{ fontWeight: 500 }}>Expense Date</span>}
                rules={[{ required: true, message: "Please select expense date" }]}
              >
                <DatePicker 
                  style={{ width: "100%", borderRadius: 8 }} 
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category"
                label={<span style={{ fontWeight: 500 }}>Category</span>}
                rules={[{ required: true, message: "Please select category" }]}
              >
                <Select size="large" style={{ borderRadius: 8 }}>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <Option key={cat} value={cat}>{cat}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label={<span style={{ fontWeight: 500 }}>Description</span>}
            rules={[{ required: true, message: "Please enter description" }]}
          >
            <Input 
              size="large" 
              style={{ borderRadius: 8 }}
              placeholder="Enter expense description"
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="amount"
                label={<span style={{ fontWeight: 500 }}>Amount</span>}
                rules={[
                  { required: true, message: "Please enter amount" },
                  { type: "number", min: 0.01, message: "Amount must be greater than 0" }
                ]}
              >
                <InputNumber
                  style={{ width: "100%", borderRadius: 8 }}
                  size="large"
                  prefix="Rs"
                  precision={2}
                  min={0.01}
                  placeholder="0.00"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                name="vendor_name" 
                label={<span style={{ fontWeight: 500 }}>Vendor Name</span>}
              >
                <Input 
                  size="large" 
                  style={{ borderRadius: 8 }}
                  placeholder="Enter vendor name"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                name="receipt_number" 
                label={<span style={{ fontWeight: 500 }}>Receipt Number</span>}
              >
                <Input 
                  size="large" 
                  style={{ borderRadius: 8 }}
                  placeholder="Enter receipt number"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                name="employee_id" 
                label={<span style={{ fontWeight: 500 }}>Employee</span>}
              >
                <Select 
                  allowClear 
                  placeholder="Select employee" 
                  showSearch
                  size="large"
                  style={{ borderRadius: 8 }}
                >
                  {employees.map(emp => (
                    <Option key={emp.id} value={emp.id}>
                      {emp.employee_id} - {emp.first_name} {emp.last_name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item 
            name="attachment_url" 
            label={<span style={{ fontWeight: 500 }}>Attachment</span>}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input
                style={{ width: '100%', borderRadius: 8 }}
                size="large"
                placeholder="Enter attachment URL (or upload file below)"
                disabled={!!uploadedFile}
              />
              <Upload
                maxCount={1}
                beforeUpload={(file) => {
                  // Validate file size (max 10MB)
                  const isLt10M = file.size / 1024 / 1024 < 10;
                  if (!isLt10M) {
                    msg.error('File must be smaller than 10MB!');
                    return false;
                  }
                  
                  // Store file for upload
                  setUploadedFile(file);
                  msg.success(`${file.name} selected successfully`);
                  
                  return false; // Prevent auto upload
                }}
                onRemove={() => {
                  setUploadedFile(null);
                }}
                fileList={uploadedFile ? [{
                  uid: '-1',
                  name: uploadedFile.name,
                  status: 'done',
                  url: ''
                }] : []}
              >
                <Button 
                  icon={<UploadOutlined />}
                  size="large"
                  style={{ 
                    borderRadius: 8,
                    width: '100%'
                  }}
                >
                  Click to Upload File (Max 10MB)
                </Button>
              </Upload>
              {editingExpense?.attachment_url && !uploadedFile && (
                <div style={{ 
                  padding: '8px 12px', 
                  background: '#f0f9ff', 
                  borderRadius: 8,
                  border: '1px solid #91d5ff'
                }}>
                  <Space>
                    <DownloadOutlined style={{ color: '#1677ff' }} />
                    <a 
                      href={editingExpense.attachment_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: '#1677ff', fontWeight: 500 }}
                    >
                      View Current Attachment
                    </a>
                  </Space>
                </div>
              )}
            </Space>
          </Form.Item>

          <Form.Item 
            name="notes" 
            label={<span style={{ fontWeight: 500 }}>Notes</span>}
          >
            <TextArea 
              rows={3} 
              style={{ borderRadius: 8 }}
              placeholder="Enter additional notes"
            />
          </Form.Item>

          <Divider />

          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit"
                size="large"
                style={{ 
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #1677ff 0%, #69c0ff 100%)',
                  border: 'none',
                  minWidth: 120
                }}
              >
                {editingExpense ? "Update" : "Create"} Expense
              </Button>
              <Button 
                onClick={() => {
                  setDrawerOpen(false);
                  setEditingExpense(null);
                  setUploadedFile(null);
                  form.resetFields();
                }}
                size="large"
                style={{ borderRadius: 8, minWidth: 80 }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>

      {/* View Details Drawer */}
      <Drawer
        title={
          <Space>
            <EyeOutlined style={{ color: '#1677ff' }} />
            <span style={{ fontSize: '16px', fontWeight: 600 }}>Expense Details</span>
          </Space>
        }
        open={viewDrawerOpen}
        onClose={() => {
          setViewDrawerOpen(false);
          setViewingExpense(null);
        }}
        width={600}
        destroyOnClose
      >
        {viewingExpense && (
          <div style={{ padding: '16px 0' }}>
            <Card 
              style={{ 
                marginBottom: 20,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%)',
                border: '1px solid #91d5ff'
              }}
            >
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <div>
                    <span style={{ color: '#666', fontSize: '14px' }}>Amount</span>
                    <div style={{ 
                      fontSize: '24px', 
                      fontWeight: 600, 
                      color: '#1677ff',
                      marginTop: 4
                    }}>
                      {formatRs(viewingExpense.amount, 2)}
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div>
                    <span style={{ color: '#666', fontSize: '14px' }}>Status</span>
                    <div style={{ marginTop: 4 }}>
                      <Tag 
                        color={STATUS_COLORS[viewingExpense.status].color}
                        style={{ 
                          backgroundColor: STATUS_COLORS[viewingExpense.status].bg,
                          border: `1px solid ${STATUS_COLORS[viewingExpense.status].border}`,
                          borderRadius: 8,
                          fontWeight: 500,
                          padding: '4px 12px',
                          fontSize: '14px'
                        }}
                      >
                        {viewingExpense.status}
                      </Tag>
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>

            <Card style={{ borderRadius: 12 }}>
              <Row gutter={[16, 24]}>
                <Col span={24}>
                  <div>
                    <span style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>Description</span>
                    <div style={{ fontSize: '16px', marginTop: 4, fontWeight: 500 }}>
                      {viewingExpense.description}
                    </div>
                  </div>
                </Col>
                
                <Col span={12}>
                  <div>
                    <span style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>Date</span>
                    <div style={{ fontSize: '16px', marginTop: 4 }}>
                      {dayjs(viewingExpense.expense_date).format("MMMM DD, YYYY")}
                    </div>
                  </div>
                </Col>
                
                <Col span={12}>
                  <div>
                    <span style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>Category</span>
                    <div style={{ marginTop: 4 }}>
                      <Tag color="blue" style={{ borderRadius: 6 }}>
                        {viewingExpense.category}
                      </Tag>
                    </div>
                  </div>
                </Col>

                {viewingExpense.vendor_name && (
                  <Col span={12}>
                    <div>
                      <span style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>Vendor</span>
                      <div style={{ fontSize: '16px', marginTop: 4 }}>
                        {viewingExpense.vendor_name}
                      </div>
                    </div>
                  </Col>
                )}

                {viewingExpense.receipt_number && (
                  <Col span={12}>
                    <div>
                      <span style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>Receipt Number</span>
                      <div style={{ fontSize: '16px', marginTop: 4 }}>
                        {viewingExpense.receipt_number}
                      </div>
                    </div>
                  </Col>
                )}

                {viewingExpense.attachment_url && (
                  <Col span={24}>
                    <div>
                      <span style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>Attachment</span>
                      <div style={{ marginTop: 8 }}>
                        <Button 
                          icon={<DownloadOutlined />}
                          onClick={() => {
                            if (viewingExpense.attachment_url) {
                              // Check if it's a full URL or a path
                              const url = viewingExpense.attachment_url.startsWith('http') 
                                ? viewingExpense.attachment_url 
                                : `http://localhost:8000${viewingExpense.attachment_url}`;
                              window.open(url, '_blank');
                            }
                          }}
                          style={{ borderRadius: 8 }}
                        >
                          View Attachment
                        </Button>
                      </div>
                    </div>
                  </Col>
                )}

                {viewingExpense.notes && (
                  <Col span={24}>
                    <div>
                      <span style={{ color: '#666', fontSize: '14px', fontWeight: 500 }}>Notes</span>
                      <div style={{ 
                        fontSize: '16px', 
                        marginTop: 4,
                        padding: '12px',
                        backgroundColor: '#f9f9f9',
                        borderRadius: 8,
                        border: '1px solid #e8e8e8'
                      }}>
                        {viewingExpense.notes}
                      </div>
                    </div>
                  </Col>
                )}

                <Col span={24}>
                  <Divider />
                  <Row gutter={16}>
                    <Col span={8}>
                      <div>
                        <span style={{ color: '#666', fontSize: '12px' }}>Created</span>
                        <div style={{ fontSize: '14px', marginTop: 2 }}>
                          {dayjs(viewingExpense.created_at).format("MMM DD, YYYY HH:mm")}
                        </div>
                      </div>
                    </Col>
                    {viewingExpense.approved_at && (
                      <Col span={8}>
                        <div>
                          <span style={{ color: '#666', fontSize: '12px' }}>Approved</span>
                          <div style={{ fontSize: '14px', marginTop: 2 }}>
                            {dayjs(viewingExpense.approved_at).format("MMM DD, YYYY HH:mm")}
                          </div>
                        </div>
                      </Col>
                    )}
                    {viewingExpense.paid_at && (
                      <Col span={8}>
                        <div>
                          <span style={{ color: '#666', fontSize: '12px' }}>Paid</span>
                          <div style={{ fontSize: '14px', marginTop: 2 }}>
                            {dayjs(viewingExpense.paid_at).format("MMM DD, YYYY HH:mm")}
                          </div>
                        </div>
                      </Col>
                    )}
                  </Row>
                </Col>
              </Row>
            </Card>

            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <Space>
                {/* Edit button available for all statuses except rejected */}
                {viewingExpense.status !== "REJECTED" && (
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => {
                      setViewDrawerOpen(false);
                      openEditDrawer(viewingExpense);
                    }}
                    style={{ borderRadius: 8 }}
                  >
                    Edit
                  </Button>
                )}
                
                {viewingExpense.status === "PENDING" && (
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={() => {
                      setViewDrawerOpen(false);
                      handleApproveExpense(viewingExpense);
                    }}
                    style={{ 
                      backgroundColor: '#52c41a', 
                      borderColor: '#52c41a',
                      borderRadius: 8
                    }}
                  >
                    Approve
                  </Button>
                )}
                
                {(viewingExpense.status === "APPROVED" || viewingExpense.status === "PENDING") && (
                  <Button
                    type="primary"
                    icon={<CreditCardOutlined />}
                    onClick={() => {
                      setViewDrawerOpen(false);
                      handlePayExpense(viewingExpense);
                    }}
                    style={{ borderRadius: 8 }}
                  >
                    Pay Expense
                  </Button>
                )}
                
                {viewingExpense.status === "PAID" && (
                  <Button
                    icon={<UndoOutlined />}
                    onClick={() => {
                      setViewDrawerOpen(false);
                      handleUndoPayment(viewingExpense);
                    }}
                    style={{ 
                      borderColor: '#fa8c16', 
                      color: '#fa8c16',
                      borderRadius: 8
                    }}
                  >
                    Undo Payment
                  </Button>
                )}
                
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    setViewDrawerOpen(false);
                    handleDeleteExpense(viewingExpense);
                  }}
                  style={{ borderRadius: 8 }}
                >
                  Delete
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Drawer>

      {/* Bulk Export Drawer */}
      <Drawer
        title={
          <Space>
            <DownloadOutlined style={{ color: '#52c41a' }} />
            <span style={{ fontSize: '16px', fontWeight: 600 }}>Export Expenses</span>
          </Space>
        }
        open={exportDrawerOpen}
        onClose={() => {
          setExportDrawerOpen(false);
          exportForm.resetFields();
        }}
        width={500}
        destroyOnClose
      >
        <Form
          form={exportForm}
          layout="vertical"
          onFinish={handleBulkExport}
          initialValues={{
            date_range: [dayjs().startOf('month'), dayjs().endOf('month')],
            format: 'csv'
          }}
        >
          <Form.Item
            name="date_range"
            label={<span style={{ fontWeight: 500 }}>Date Range</span>}
            rules={[{ required: true, message: "Please select date range" }]}
          >
            <RangePicker 
              style={{ width: '100%', borderRadius: 8 }}
              size="large"
              format="YYYY-MM-DD"
            />
          </Form.Item>

          <Form.Item
            name="format"
            label={<span style={{ fontWeight: 500 }}>Export Format</span>}
            rules={[{ required: true, message: "Please select format" }]}
          >
            <Select size="large" style={{ borderRadius: 8 }}>
              <Option value="csv">
                <Space>
                  <FileTextOutlined />
                  CSV (Excel Compatible)
                </Space>
              </Option>
              <Option value="pdf">
                <Space>
                  <FilePdfOutlined />
                  PDF Document
                </Space>
              </Option>
            </Select>
          </Form.Item>

          <Divider />

          <div style={{ 
            padding: '16px', 
            background: '#f0f9ff', 
            borderRadius: 8,
            marginBottom: 20
          }}>
            <Typography.Text style={{ color: '#666' }}>
              <strong>Export includes:</strong>
              <ul style={{ marginTop: 8, marginBottom: 0 }}>
                <li>All expense details (date, category, amount, vendor, etc.)</li>
                <li>Status information (pending, approved, paid)</li>
                <li>Timestamps (created, approved, paid dates)</li>
                <li>Notes and receipt numbers</li>
              </ul>
            </Typography.Text>
          </div>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit"
                size="large"
                loading={exporting}
                icon={<DownloadOutlined />}
                style={{ 
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
                  border: 'none',
                  minWidth: 120
                }}
              >
                Export
              </Button>
              <Button 
                onClick={() => {
                  setExportDrawerOpen(false);
                  exportForm.resetFields();
                }}
                size="large"
                style={{ borderRadius: 8, minWidth: 80 }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}