"use client";

import { Avatar, Layout, Menu, Typography, theme, type MenuProps } from "antd";
import {
  BarChartOutlined,
  CalendarOutlined,
  CarOutlined,
  DollarOutlined,
  DashboardOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";

const { Header, Sider, Content } = Layout;

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, roles, has, loading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();

  const hideDashboard = useMemo(() => roles.includes("EmployeeEntry"), [roles]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return `${salutation}, ${user?.full_name || user?.username || "User"}`;
  }, [user?.full_name, user?.username]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    if (hideDashboard && pathname?.startsWith("/dashboard")) {
      router.replace("/employees");
    }
  }, [hideDashboard, loading, pathname, router, user]);

  const sidebarBg = "#4a6fa5";
  
  const rootSubmenuKeys = useMemo(() => ["hrm", "clients", "fleet", "inventory", "accounts", "super-admin"], []);
  const submenuToRootKey = useMemo(() => ({
    "vehicle-assignments": "fleet",
  }) as Record<string, string>, []);

  const selectedKeys = useMemo(() => {
    if (!pathname) return ["employees"];
    if (pathname.startsWith("/dashboard")) return hideDashboard ? ["employees"] : ["dashboard"];
    if (pathname.startsWith("/employees/inventory")) return ["employees-inventory"];
    if (pathname.startsWith("/employees")) return ["employees"];
    if (pathname.startsWith("/attendance")) return ["attendance"];
    if (pathname.startsWith("/payroll2")) return ["payroll2"];
    if (pathname.startsWith("/payroll")) return ["payroll"];
    if (pathname.startsWith("/performance")) return ["performance"];
    if (pathname.startsWith("/client-management")) return ["client-management"];
    if (pathname.startsWith("/accounts-advances/expenses")) return ["accounts-expenses"];
    if (pathname.startsWith("/accounts-advances")) return ["accounts-employee-records"];
    if (pathname.startsWith("/super-admin/users")) return ["super-admin-users"];
    if (pathname.startsWith("/super-admin/roles")) return ["super-admin-roles"];
    if (pathname.startsWith("/super-admin/permissions")) return ["super-admin-permissions"];
    if (pathname.startsWith("/super-admin")) return ["super-admin-home"];
    if (pathname.startsWith("/general-inventory")) return ["general-inventory"];
    if (pathname.startsWith("/restricted-inventory")) return ["restricted-inventory"];
    if (pathname.startsWith("/vehicles")) return ["vehicles"];
    if (pathname.startsWith("/vehicle-assignments")) return ["vehicle-assignments"];
    if (pathname.startsWith("/vehicle-maintenance")) return ["vehicle-maintenance"];
    if (pathname.startsWith("/fuel-mileage")) return ["fuel-mileage"];
    return ["employees"];
  }, [hideDashboard, pathname]);

  const activeRootKey = useMemo(() => {
    const key = selectedKeys[0];
    if (["employees", "employees-inventory", "attendance", "payroll", "performance"].includes(key)) return "hrm";
    if (["client-management"].includes(key)) return "clients";
    if (["accounts-employee-records", "accounts-expenses"].includes(key)) return "accounts";
    if (["vehicles", "vehicle-assignments", "vehicle-maintenance", "fuel-mileage"].includes(key)) return "fleet";
    if (["general-inventory", "restricted-inventory"].includes(key)) return "inventory";
    return "hrm";
  }, [selectedKeys]);

  const menuItems = useMemo<NonNullable<MenuProps["items"]>>(() => {
    const items: NonNullable<MenuProps["items"]> = [];

    const addDivider = () => {
      if (items.length === 0) return;
      const last = items[items.length - 1];
      if (last && typeof last === "object" && "type" in last && last.type === "divider") return;
      items.push({ type: "divider" });
    };

    if (!hideDashboard) {
      items.push({
        key: "dashboard",
        icon: <DashboardOutlined />,
        label: <Link href="/dashboard">Dashboard</Link>,
      });
    }

    const hrmChildren: NonNullable<MenuProps["items"]> = [];
    if (has("employees:view")) {
      // Hidden for now
      // hrmChildren.push({
      //   key: "employees",
      //   icon: <TeamOutlined />,
      //   label: <Link href="/employees">Employees</Link>,
      // });
      hrmChildren.push({
        key: "employees2",
        icon: <TeamOutlined />,
        label: <Link href="/employees2">Master Profiles</Link>,
      });
      if (has("inventory:view")) {
        hrmChildren.push({
          key: "employees-inventory",
          icon: <SafetyCertificateOutlined />,
          label: <Link href="/employees/inventory">Employee Inventory</Link>,
        });
      }
    }
    if (has("attendance:manage")) {
      hrmChildren.push({
        key: "attendance",
        icon: <CalendarOutlined />,
        label: <Link href="/attendance">Attendance</Link>,
      });
    }
    if (has("payroll:view")) {
      // Hidden for now
      // hrmChildren.push({
      //   key: "payroll",
      //   icon: <DollarOutlined />,
      //   label: <Link href="/payroll">Payroll</Link>,
      // });
      hrmChildren.push({
        key: "payroll2",
        icon: <DollarOutlined />,
        label: <Link href="/payroll2">Salaries</Link>,
      });
    }

    if (has("performance:view")) {
      hrmChildren.push({
        key: "performance",
        icon: <BarChartOutlined />,
        label: <Link href="/performance">Performance</Link>,
      });
    }

    if (hrmChildren.length > 0) {
      items.push({
        key: "hrm",
        icon: <UserOutlined />,
        label: "HRM",
        children: hrmChildren,
      });
      addDivider();
    }

    if (has("clients:view")) {
      items.push({
        key: "clients",
        icon: <UserOutlined />,
        label: "Clients",
        children: [
          {
            key: "client-management",
            icon: <UserOutlined />,
            label: <Link href="/client-management">Client Management</Link>,
          },
        ],
      });
      addDivider();
    }

    if (has("accounts:full")) {
      items.push({
        key: "accounts",
        icon: <DollarOutlined />,
        label: "Accounts/Advances",
        children: [
          {
            key: "accounts-employee-records",
            icon: <TeamOutlined />,
            label: <Link href="/accounts-advances/employees">Employee Records</Link>,
          },
          {
            key: "accounts-expenses",
            icon: <DollarOutlined />,
            label: <Link href="/accounts-advances/expenses">Expenses</Link>,
          },
        ],
      });
      addDivider();
    }

    if (has("fleet:view")) {
      items.push({
        key: "fleet",
        icon: <CarOutlined />,
        label: "Fleet Management",
        children: [
          {
            key: "vehicles",
            icon: <CarOutlined />,
            label: <Link href="/vehicles">Vehicles</Link>,
          },
          {
            key: "vehicle-assignments",
            icon: <TeamOutlined />,
            label: <Link href="/vehicle-assignments">Vehicle Assignments</Link>,
            children: [
              {
                key: "vehicle-assignments-efficiency",
                icon: <BarChartOutlined />,
                label: <Link href="/vehicle-assignments/efficiency">Assignment Efficiency</Link>,
              },
            ],
          },
          {
            key: "vehicle-maintenance",
            icon: <ToolOutlined />,
            label: <Link href="/vehicle-maintenance">Vehicle Maintenance</Link>,
          },
          {
            key: "fuel-mileage",
            icon: <DashboardOutlined />,
            label: <Link href="/fuel-mileage">Fuel & Mileage</Link>,
          },
        ],
      });
      addDivider();
    }

    if (has("inventory:view")) {
      items.push({
        key: "inventory",
        icon: <SafetyCertificateOutlined />,
        label: "Inventory",
        children: [
          {
            key: "general-inventory",
            icon: <SafetyCertificateOutlined />,
            label: <Link href="/general-inventory">General Inventory</Link>,
          },
          {
            key: "restricted-inventory",
            icon: <SafetyCertificateOutlined />,
            label: <Link href="/restricted-inventory">Restricted Weapons</Link>,
          },
        ],
      });
      addDivider();
    }

    if (has("rbac:admin")) {
      items.push({
        key: "super-admin",
        icon: <UserOutlined />,
        label: "Super Admin",
        children: [
          { key: "super-admin-home", label: <Link href="/super-admin">Overview</Link> },
          { key: "super-admin-users", label: <Link href="/super-admin/users">Users</Link> },
          { key: "super-admin-roles", label: <Link href="/super-admin/roles">Roles</Link> },
          { key: "super-admin-permissions", label: <Link href="/super-admin/permissions">Permissions</Link> },
        ],
      });
      addDivider();
    }

    items.push({
      key: "logout",
      icon: <UserOutlined />,
      label: (
        <span
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          Logout
        </span>
      ),
    });

    return items;
  }, [has, hideDashboard, logout, router]);

  const sidebarLogoSize = 120;
  const sidebarHeaderHeight = 124;
  const sidebarMenuTopGap = 0;

  const collapsedLogoSize = 48;

  const [openKeys, setOpenKeys] = useState<string[]>([activeRootKey]);

  const avatarUrl = "https://i.pravatar.cc/96?img=12";

  return (
    <Layout
      style={{
        height: "100vh",
        overflow: "hidden",
        padding: 0,
        background: token.colorBgLayout,
      }}
    >
      <style jsx global>{`
        .ant-layout-sider {
          background: ${sidebarBg} !important;
          box-shadow: none !important;
        }
        .ant-layout-sider-children {
          box-shadow: none !important;
        }
        .ant-layout-sider-trigger {
          box-shadow: none !important;
          background: ${sidebarBg} !important;
          color: #ffffff !important;
          border-top: none !important;
        }
        .ant-layout-sider-trigger:hover {
          background: ${sidebarBg} !important;
          color: #ffffff !important;
        }
        .ant-layout-sider-trigger .anticon {
          color: #ffffff !important;
        }
        .ant-layout-sider-zero-width-trigger {
          background: ${sidebarBg} !important;
          color: #ffffff !important;
          box-shadow: none !important;
        }
        .ant-layout-sider .ant-menu {
          background: ${sidebarBg} !important;
          box-shadow: none !important;
        }
        .ant-layout-sider .ant-menu-sub {
          background: ${sidebarBg} !important;
        }
        .ant-layout-sider .ant-menu-title-content,
        .ant-layout-sider .ant-menu-item,
        .ant-layout-sider .ant-menu-submenu-title,
        .ant-layout-sider .ant-menu-item a {
          color: rgba(255, 255, 255, 0.95) !important;
        }
        .ant-layout-sider .ant-menu-item .anticon,
        .ant-layout-sider .ant-menu-submenu-title .anticon,
        .ant-layout-sider .ant-menu-submenu-arrow {
          color: rgba(255, 255, 255, 0.95) !important;
        }
        .ant-layout-sider .ant-menu-item,
        .ant-layout-sider .ant-menu-submenu-title {
          background: ${sidebarBg} !important;
          border-radius: 0 !important;
        }
        .ant-layout-sider .ant-menu-item:hover,
        .ant-layout-sider .ant-menu-submenu-title:hover,
        .ant-layout-sider .ant-menu-item-active {
          background: ${sidebarBg} !important;
        }
        .ant-layout-sider .ant-menu-item-selected {
          background: ${sidebarBg} !important;
          border-inline-start: 3px solid rgba(255, 255, 255, 0.95);
        }
        .ant-layout-sider .ant-menu-item-selected .ant-menu-title-content,
        .ant-layout-sider .ant-menu-item-selected a,
        .ant-layout-sider .ant-menu-item-selected .anticon {
          color: rgba(255, 255, 255, 0.95) !important;
        }
        .ant-layout-sider .ant-menu-item-divider {
          background: rgba(255, 255, 255, 0.35) !important;
          margin: 8px 12px !important;
        }
      `}</style>

      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsedWidth={96}
        width={256}
        style={{
          background: sidebarBg,
          borderRight: "none",
          height: "100vh",
          borderRadius: 0,
          overflow: "hidden",
          marginRight: 0,
        }}
      >
        <div
          style={{
            height: sidebarHeaderHeight,
            display: "flex",
            alignItems: "center",
            padding: 0,
            fontWeight: 700,
            letterSpacing: 0.2,
            color: "#ffffff",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "transparent",
              borderRadius: 0,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={collapsed ? "/sidebar-logo-collapsed.png" : "/logo-removebg-preview.png"}
              alt="Logo"
              width={collapsed ? collapsedLogoSize : sidebarLogoSize}
              height={collapsed ? collapsedLogoSize : sidebarLogoSize}
              style={{ display: "block" }}
            />
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={(keys) => {
            const latestOpenedKey = keys.find((k) => !openKeys.includes(k));

            if (!latestOpenedKey) {
              setOpenKeys(keys);
              return;
            }

            if (rootSubmenuKeys.includes(latestOpenedKey)) {
              setOpenKeys([latestOpenedKey]);
              return;
            }

            const root = submenuToRootKey[latestOpenedKey] ?? activeRootKey;
            setOpenKeys([root, latestOpenedKey]);
          }}
          style={{
            height: `calc(100% - ${sidebarHeaderHeight}px - ${sidebarMenuTopGap}px)`,
            overflow: "hidden",
            background: sidebarBg,
            paddingTop: sidebarMenuTopGap,
          }}
          items={menuItems}
        />
      </Sider>

      <Layout style={{ height: "100vh", overflow: "hidden" }}>
        <Header
          style={{
            background: "transparent",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 56,
          }}
        >
          <Typography.Title level={3} style={{ margin: 0 }}>
            {greeting}
          </Typography.Title>
          <Avatar
            size={36}
            style={{ background: token.colorPrimary, cursor: "pointer" }}
            src={avatarUrl}
          >
            U
          </Avatar>
        </Header>

        <Content
          className="flash-dashboard-bg"
          style={{
            padding: 16,
            background: token.colorBgLayout,
            overflow: "auto",
            height: "calc(100% - 56px)",
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
