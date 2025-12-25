"use client";

import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";

type LoginResponse = {
  access_token: string;
  token_type: string;
};

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setError(null);
    setLoading(true);
    try {
      const form = new URLSearchParams();
      form.set("username", values.username);
      form.set("password", values.password);

      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });

      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : null;

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "detail" in data
            ? String((data as { detail?: unknown }).detail)
            : `Login failed (${res.status})`;
        throw new Error(msg);
      }

      const token = data as LoginResponse;
      window.localStorage.setItem("access_token", token.access_token);
      await refresh();
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Card style={{ width: 420 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Sign in
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Use one of the seeded accounts (e.g. <code>superadmin</code>) to continue.
        </Typography.Paragraph>

        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Login
          </Button>
        </Form>
      </Card>
    </div>
  );
}
