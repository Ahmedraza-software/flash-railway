"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";

export type AuthUser = {
  id: number;
  email: string;
  username: string;
  full_name?: string | null;
  is_active: boolean;
  is_superuser: boolean;
};

type AuthState = {
  user: AuthUser | null;
  roles: string[];
  permissions: Set<string>;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
  has: (perm: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("access_token");
    }
    setUser(null);
    setRoles([]);
    setPermissions(new Set());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;
      if (!token) {
        setUser(null);
        setRoles([]);
        setPermissions(new Set());
        return;
      }

      const me = await api.get<AuthUser>("/api/auth/me");
      const roleNames = await api.get<string[]>("/api/auth/me/roles");
      const perms = await api.get<string[]>("/api/auth/me/permissions");
      setUser(me);
      setRoles(Array.isArray(roleNames) ? roleNames : []);
      setPermissions(new Set(perms));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        logout();
      } else {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const has = useCallback(
    (perm: string) => {
      if (user?.is_superuser) return true;
      return permissions.has(perm);
    },
    [permissions, user?.is_superuser]
  );

  const value = useMemo<AuthState>(
    () => ({ user, roles, permissions, loading, refresh, logout, has }),
    [user, roles, permissions, loading, refresh, logout, has]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
