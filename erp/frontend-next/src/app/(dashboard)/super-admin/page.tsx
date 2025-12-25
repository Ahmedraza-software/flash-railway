"use client";

import { Card, Typography } from "antd";

export default function SuperAdminHome() {
  return (
    <Card>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Super Admin
      </Typography.Title>
      <Typography.Paragraph>
        Use the sidebar to manage users, roles, and permissions.
      </Typography.Paragraph>
    </Card>
  );
}
