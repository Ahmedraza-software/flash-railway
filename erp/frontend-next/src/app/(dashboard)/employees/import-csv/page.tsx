"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Space, Typography, Alert, Table, Spin, message, Upload, Row, Col } from "antd";
import { ArrowLeftOutlined, UploadOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

const { Title, Text, Paragraph } = Typography;

export default function ImportEmployeesCSV() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);

  const handlePreview = async () => {
    if (!googleSheetUrl.trim()) {
      message.error("Please enter a Google Sheets URL");
      return;
    }

    setLoading(true);
    setPreviewData(null);
    setImportResult(null);

    try {
      const params = new URLSearchParams({
        url: googleSheetUrl,
        mode: "preview",
      });
      
      const result = await api.post(`/api/employees/import/google-sheet?${params.toString()}`);

      setPreviewData(result);
      message.success(`Preview complete: ${result.created} employees ready to import`);
    } catch (error: any) {
      message.error(error.message || "Failed to preview CSV");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!googleSheetUrl.trim()) {
      message.error("Please enter a Google Sheets URL");
      return;
    }

    setLoading(true);
    setImportResult(null);

    try {
      const params = new URLSearchParams({
        url: googleSheetUrl,
        mode: "import",
      });
      
      const result = await api.post(`/api/employees/import/google-sheet?${params.toString()}`);

      setImportResult(result);
      message.success(`Import complete: ${result.created} employees created`);
    } catch (error: any) {
      message.error(error.message || "Failed to import CSV");
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "FSS #",
      "Rank",
      "Name",
      "Father's Name",
      "Salary",
      "Status",
      "Unit",
      "Rank",
      "Blood Gp",
      "Status",
      "Unit",
      "Rank",
      "CNIC #",
      "DOB",
      "CNIC Expr",
      "Documents held",
      "Documents Reciving /Handed Over To",
      "Photo on Docu",
      "EOBI #",
      "Insurance",
      "Social Security",
      "Mob #",
      "Home Contact Number",
      "Verified by SHO",
      "Verified by Khidmat Markaz",
      "Domicile",
      "Verified by SSP",
      "Enrolled",
      "Re Enrolled",
      "Village",
      "Post Office",
      "Thana",
      "Tehsil",
      "District",
      "Duty Location",
      "Police Trg Ltr & Date",
      "Vacanation Cert",
      "Vol #",
      "Payment's",
      "Number",
      "Date of Entry",
      "Card",
    ];

    const csvContent = headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee_import_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Card variant="borderless" style={{ borderRadius: 0 }} styles={{ body: { padding: 12 } }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Row gutter={[12, 12]} align="middle">
          <Col flex="auto">
            <Space direction="vertical" size={2}>
              <Title level={4} style={{ margin: 0 }}>
                Import Employees from CSV
              </Title>
              <Text type="secondary">Import employee data from Google Sheets CSV export</Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/employees")}>
                Back
              </Button>
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
                Download Template
              </Button>
            </Space>
          </Col>
        </Row>

        <Alert
          message="How to Import"
          description={
            <Space direction="vertical" size={4}>
              <Text>1. Open your Google Sheet with employee data</Text>
              <Text>2. Go to File → Share → Publish to web → Select "Comma-separated values (.csv)"</Text>
              <Text>3. Copy the published CSV URL and paste it below</Text>
              <Text>4. Click "Preview" to check the data, then "Import" to add employees</Text>
            </Space>
          }
          type="info"
          showIcon
        />

        <Card size="small" title="Google Sheets CSV URL">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=..."
              value={googleSheetUrl}
              onChange={(e) => setGoogleSheetUrl(e.target.value)}
              size="large"
            />
            <Space>
              <Button type="primary" onClick={handlePreview} loading={loading} disabled={!googleSheetUrl.trim()}>
                Preview Import
              </Button>
              <Button
                type="default"
                onClick={handleImport}
                loading={loading}
                disabled={!googleSheetUrl.trim() || !previewData}
              >
                Import Employees
              </Button>
            </Space>
          </Space>
        </Card>

        {loading && (
          <Card>
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <Spin size="large" />
              <Paragraph style={{ marginTop: 16 }}>Processing CSV data...</Paragraph>
            </div>
          </Card>
        )}

        {previewData && !loading && (
          <Card
            size="small"
            title={
              <Space>
                <CheckCircleOutlined style={{ color: "#52c41a" }} />
                Preview Results
              </Space>
            }
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Row gutter={[16, 16]}>
                <Col span={8}>
                  <Card size="small" style={{ background: "#f0f9ff", border: "1px solid #bae6fd" }}>
                    <Text type="secondary">Total Rows</Text>
                    <Title level={3} style={{ margin: 0, color: "#0369a1" }}>
                      {previewData.rows}
                    </Title>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                    <Text type="secondary">New Employees</Text>
                    <Title level={3} style={{ margin: 0, color: "#15803d" }}>
                      {previewData.created}
                    </Title>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ background: "#fef3c7", border: "1px solid #fde68a" }}>
                    <Text type="secondary">Skipped (Duplicates)</Text>
                    <Title level={3} style={{ margin: 0, color: "#b45309" }}>
                      {previewData.skipped}
                    </Title>
                  </Card>
                </Col>
              </Row>

              {previewData.errors && previewData.errors.length > 0 && (
                <Alert
                  message="Errors Found"
                  description={
                    <Space direction="vertical" size={4}>
                      {previewData.errors.slice(0, 10).map((err: string, idx: number) => (
                        <Text key={idx} type="danger">
                          {err}
                        </Text>
                      ))}
                      {previewData.errors.length > 10 && (
                        <Text type="secondary">... and {previewData.errors.length - 10} more errors</Text>
                      )}
                    </Space>
                  }
                  type="warning"
                  showIcon
                />
              )}

              <Alert
                message="Ready to Import"
                description={`${previewData.created} employees will be created. Click "Import Employees" to proceed.`}
                type="success"
                showIcon
              />
            </Space>
          </Card>
        )}

        {importResult && !loading && (
          <Card
            size="small"
            title={
              <Space>
                <CheckCircleOutlined style={{ color: "#52c41a" }} />
                Import Complete
              </Space>
            }
          >
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Row gutter={[16, 16]}>
                <Col span={8}>
                  <Card size="small" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                    <Text type="secondary">Created</Text>
                    <Title level={3} style={{ margin: 0, color: "#15803d" }}>
                      {importResult.created}
                    </Title>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ background: "#fef3c7", border: "1px solid #fde68a" }}>
                    <Text type="secondary">Skipped</Text>
                    <Title level={3} style={{ margin: 0, color: "#b45309" }}>
                      {importResult.skipped}
                    </Title>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                    <Text type="secondary">Errors</Text>
                    <Title level={3} style={{ margin: 0, color: "#b91c1c" }}>
                      {importResult.errors?.length || 0}
                    </Title>
                  </Card>
                </Col>
              </Row>

              {importResult.errors && importResult.errors.length > 0 && (
                <Alert
                  message="Some Errors Occurred"
                  description={
                    <Space direction="vertical" size={4}>
                      {importResult.errors.slice(0, 10).map((err: string, idx: number) => (
                        <Text key={idx} type="danger">
                          {err}
                        </Text>
                      ))}
                      {importResult.errors.length > 10 && (
                        <Text type="secondary">... and {importResult.errors.length - 10} more errors</Text>
                      )}
                    </Space>
                  }
                  type="error"
                  showIcon
                />
              )}

              <Alert
                message="Import Successful"
                description={`${importResult.created} employees have been successfully imported into the system.`}
                type="success"
                showIcon
                action={
                  <Button size="small" type="primary" onClick={() => router.push("/employees")}>
                    View Employees
                  </Button>
                }
              />
            </Space>
          </Card>
        )}

        <Card size="small" title="Supported Fields">
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Text strong>The CSV import supports all employee fields including:</Text>
            <Row gutter={[16, 8]}>
              <Col span={8}>
                <Space direction="vertical" size={2}>
                  <Text>• FSS Number</Text>
                  <Text>• Name & Father's Name</Text>
                  <Text>• CNIC & Expiry</Text>
                  <Text>• Date of Birth</Text>
                  <Text>• Blood Group</Text>
                </Space>
              </Col>
              <Col span={8}>
                <Space direction="vertical" size={2}>
                  <Text>• Salary & Designation</Text>
                  <Text>• Service Unit & Rank</Text>
                  <Text>• EOBI Number</Text>
                  <Text>• Social Security</Text>
                  <Text>• Insurance</Text>
                </Space>
              </Col>
              <Col span={8}>
                <Space direction="vertical" size={2}>
                  <Text>• Mobile & Home Contact</Text>
                  <Text>• Address Details</Text>
                  <Text>• Verification Dates</Text>
                  <Text>• Documents Info</Text>
                  <Text>• And more...</Text>
                </Space>
              </Col>
            </Row>
          </Space>
        </Card>
      </Space>
    </Card>
  );
}
