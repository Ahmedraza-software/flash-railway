"use client";

import { ConfigProvider } from "antd";
 import { AuthProvider } from "@/lib/auth";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#0400FF",
            colorInfo: "#5990FF",
            colorSuccess: "#76D39B",
            colorWarning: "#DFAF2B",
            colorError: "#7A1F2B",
            colorBgBase: "#FFFFFF",
            colorBgLayout: "#FFFFFF",
            colorBgContainer: "#FFFFFF",
            borderRadius: 12,
            borderRadiusLG: 16,
            borderRadiusSM: 10,
            borderRadiusXS: 8,
            fontFamily:
              "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
          },
        }}
      >
        {children}
      </ConfigProvider>
    </AuthProvider>
  );
}
