"use client";

import {
  Card,
  Col,
  DatePicker,
  message,
  Row,
  Space,
  Spin,
  Statistic,
  Typography,
} from "antd";
import {
  TeamOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type AnalyticsData = {
  period: { from_date: string; to_date: string; month: string };
  employees: {
    total: number;
    active: number;
    new_this_month: number;
  };
  payroll: {
    total_gross: number;
    total_net: number;
    total_salary: number;
    total_overtime: number;
    total_deductions: number;
    avg_salary: number;
  };
  attendance: {
    total_records: number;
    present: number;
    late: number;
    absent: number;
    leave: number;
    attendance_rate: number;
    punctuality_rate: number;
  };
  top_earners: Array<{ name: string; net_pay: number }>;
  top_overtime: Array<{ name: string; overtime_pay: number; overtime_hours: number }>;
  department_breakdown: Array<{ department: string; count: number; total_salary: number }>;
  monthly_trend: Array<{ month: string; gross: number; net: number; employees: number }>;
};

function formatMoney(v: number): string {
  if (v >= 1000000) return `Rs ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `Rs ${(v / 1000).toFixed(0)}K`;
  return `Rs ${v.toLocaleString()}`;
}

export default function PerformancePage() {
  const [msg, msgCtx] = message.useMessage();
  
  const defaultRange = useMemo(() => {
    const today = dayjs();
    if (today.date() >= 26) {
      const from = today.date(26);
      const to = from.add(1, "month").date(25);
      return [from, to] as const;
    }
    const to = today.date(25);
    const from = to.subtract(1, "month").date(26);
    return [from, to] as const;
  }, []);

  const [fromDate, setFromDate] = useState(defaultRange[0]);
  const [toDate, setToDate] = useState(defaultRange[1]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AnalyticsData>("/api/analytics/dashboard", {
        query: {
          from_date: fromDate.format("YYYY-MM-DD"),
          to_date: toDate.format("YYYY-MM-DD"),
        },
      });
      setData(res);
    } catch (e: unknown) {
      const errMsg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Failed to load";
      msg.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, msg]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {msgCtx}
      <div style={{ padding: 16, background: "#f5f5f5", minHeight: "100vh" }}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {/* Header */}
          <Card styles={{ body: { padding: "16px 20px" } }}>
            <Row justify="space-between" align="middle">
              <Col>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  Performance Dashboard
                </Typography.Title>
                <Typography.Text type="secondary">
                  {fromDate.format("MMM DD, YYYY")} - {toDate.format("MMM DD, YYYY")}
                </Typography.Text>
              </Col>
              <Col>
                <DatePicker.RangePicker
                  value={[fromDate, toDate] as any}
                  onChange={(r) => {
                    if (r?.[0] && r?.[1]) {
                      setFromDate(r[0]);
                      setToDate(r[1]);
                    }
                  }}
                />
              </Col>
            </Row>
          </Card>

          <Spin spinning={loading}>
            {/* Key Metrics */}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={6}>
                <Card styles={{ body: { padding: 20 } }}>
                  <Space>
                    <div style={{ 
                      width: 48, height: 48, borderRadius: 12, 
                      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <TeamOutlined style={{ fontSize: 24, color: "#fff" }} />
                    </div>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Total Employees</Typography.Text>
                      <Typography.Title level={3} style={{ margin: 0 }}>{data?.employees.total ?? 0}</Typography.Title>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card styles={{ body: { padding: 20 } }}>
                  <Space>
                    <div style={{ 
                      width: 48, height: 48, borderRadius: 12, 
                      background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <DollarOutlined style={{ fontSize: 24, color: "#fff" }} />
                    </div>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Total Gross</Typography.Text>
                      <Typography.Title level={3} style={{ margin: 0 }}>{formatMoney(data?.payroll.total_gross ?? 0)}</Typography.Title>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card styles={{ body: { padding: 20 } }}>
                  <Space>
                    <div style={{ 
                      width: 48, height: 48, borderRadius: 12, 
                      background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <CheckCircleOutlined style={{ fontSize: 24, color: "#fff" }} />
                    </div>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Attendance Rate</Typography.Text>
                      <Typography.Title level={3} style={{ margin: 0 }}>{((data?.attendance.attendance_rate ?? 0) * 100).toFixed(0)}%</Typography.Title>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card styles={{ body: { padding: 20 } }}>
                  <Space>
                    <div style={{ 
                      width: 48, height: 48, borderRadius: 12, 
                      background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <ClockCircleOutlined style={{ fontSize: 24, color: "#fff" }} />
                    </div>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Total Overtime</Typography.Text>
                      <Typography.Title level={3} style={{ margin: 0 }}>{formatMoney(data?.payroll.total_overtime ?? 0)}</Typography.Title>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>

            {/* Payroll Summary */}
            <Row gutter={[16, 16]}>
              <Col xs={24}>
                <Card title="Payroll Overview" styles={{ body: { padding: 20 } }}>
                  <Row gutter={[24, 16]}>
                    <Col xs={12} md={6}>
                      <Statistic 
                        title="Net Payable" 
                        value={data?.payroll.total_net ?? 0} 
                        prefix="Rs" 
                        valueStyle={{ color: "#52c41a", fontSize: 20 }}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic 
                        title="Total Salary" 
                        value={data?.payroll.total_salary ?? 0} 
                        prefix="Rs"
                        valueStyle={{ fontSize: 20 }}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic 
                        title="Deductions" 
                        value={data?.payroll.total_deductions ?? 0} 
                        prefix="Rs"
                        valueStyle={{ color: "#ff4d4f", fontSize: 20 }}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic 
                        title="Avg Salary" 
                        value={data?.payroll.avg_salary ?? 0} 
                        prefix="Rs"
                        valueStyle={{ fontSize: 20 }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>
          </Spin>
        </Space>
      </div>
    </>
  );
}
