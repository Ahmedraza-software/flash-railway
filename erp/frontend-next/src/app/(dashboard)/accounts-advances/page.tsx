"use client";

import { Card, Col, Row, Statistic, Button, Space } from "antd";
import { TeamOutlined, DollarOutlined, CreditCardOutlined, FileTextOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRs } from "@/lib/money";
import dayjs from "dayjs";

interface AccountsSummary {
  employees: {
    total_count: number;
    paid_count: number;
    unpaid_count: number;
    total_payroll: number;
    total_advances: number;
  };
  expenses: {
    total_expenses: number;
    pending_expenses: number;
    approved_expenses: number;
    paid_expenses: number;
    expense_count: number;
  };
}

export default function AccountsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true);
      try {
        const month = dayjs().format("YYYY-MM");
        
        // Load expenses summary
        const expensesSummary = await api.get("/api/expenses/summary/monthly", {
          query: { month }
        });

        // For now, we'll use mock data for employees summary
        // In a real implementation, you'd create an endpoint for this
        const employeesSummary = {
          total_count: 0,
          paid_count: 0,
          unpaid_count: 0,
          total_payroll: 0,
          total_advances: 0
        };

        setSummary({
          employees: employeesSummary,
          expenses: expensesSummary || {
            total_expenses: 0,
            pending_expenses: 0,
            approved_expenses: 0,
            paid_expenses: 0,
            expense_count: 0
          }
        });
      } catch (error) {
        console.error("Failed to load accounts summary:", error);
        setSummary({
          employees: {
            total_count: 0,
            paid_count: 0,
            unpaid_count: 0,
            total_payroll: 0,
            total_advances: 0
          },
          expenses: {
            total_expenses: 0,
            pending_expenses: 0,
            approved_expenses: 0,
            paid_expenses: 0,
            expense_count: 0
          }
        });
      } finally {
        setLoading(false);
      }
    };

    void loadSummary();
  }, []);

  return (
    <div style={{ padding: "24px" }}>
      <Card
        title={
          <Space>
            <CreditCardOutlined />
            <span>Accounts & Advances</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Row gutter={[24, 24]}>
          {/* Employee Accounts Section */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space>
                  <TeamOutlined />
                  <span>Employee Accounts</span>
                </Space>
              }
              extra={
                <Button 
                  type="primary" 
                  onClick={() => router.push("/accounts-advances/employees")}
                >
                  View Details
                </Button>
              }
              style={{ height: "100%" }}
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="Total Employees"
                    value={summary?.employees.total_count || 0}
                    styles={{ content: { color: "#1677ff"  }}}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="Total Payroll"
                    value={summary?.employees.total_payroll || 0}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: "#52c41a"  }}}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="Paid Employees"
                    value={summary?.employees.paid_count || 0}
                    styles={{ content: { color: "#52c41a"  }}}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="Total Advances"
                    value={summary?.employees.total_advances || 0}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: "#fa8c16"  }}}
                  />
                </Col>
              </Row>
              
              <div style={{ marginTop: 16 }}>
                <p>Manage employee payroll, advances, and account records.</p>
              </div>
            </Card>
          </Col>

          {/* Expenses Section */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space>
                  <DollarOutlined />
                  <span>Expenses</span>
                </Space>
              }
              extra={
                <Button 
                  type="primary" 
                  onClick={() => router.push("/accounts-advances/expenses")}
                >
                  View Details
                </Button>
              }
              style={{ height: "100%" }}
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="Total Expenses"
                    value={summary?.expenses.total_expenses || 0}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: "#1677ff"  }}}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="Expense Count"
                    value={summary?.expenses.expense_count || 0}
                    styles={{ content: { color: "#722ed1"  }}}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="Pending"
                    value={summary?.expenses.pending_expenses || 0}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: "#fa8c16"  }}}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Statistic
                    title="Paid"
                    value={summary?.expenses.paid_expenses || 0}
                    prefix="Rs"
                    precision={2}
                    styles={{ content: { color: "#52c41a"  }}}
                  />
                </Col>
              </Row>
              
              <div style={{ marginTop: 16 }}>
                <p>Track and manage company expenses, approvals, and payments.</p>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Quick Actions */}
        <Card title="Quick Actions" style={{ marginTop: 24 }}>
          <Space wrap>
            <Button 
              icon={<TeamOutlined />} 
              onClick={() => router.push("/accounts-advances/employees")}
            >
              Employee Records
            </Button>
            <Button 
              icon={<DollarOutlined />} 
              onClick={() => router.push("/accounts-advances/expenses")}
            >
              Manage Expenses
            </Button>
            <Button 
              icon={<FileTextOutlined />} 
              onClick={() => router.push("/finance/accounts/chart")}
            >
              Chart of Accounts
            </Button>
            <Button 
              icon={<CreditCardOutlined />} 
              onClick={() => router.push("/finance/journals")}
            >
              Journal Entries
            </Button>
          </Space>
        </Card>
      </Card>
    </div>
  );
}