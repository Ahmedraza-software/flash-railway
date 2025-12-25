import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(params: Record<string, QueryValue>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Record<string, QueryValue>;
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}${buildQuery(opts.query ?? {})}`;

  const token = typeof window !== "undefined" ? window.localStorage.getItem("access_token") : null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const onAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeoutId);
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (typeof data === "object" && data !== null && "detail" in data) {
      const maybeDetail = (data as { detail?: unknown }).detail;
      if (typeof maybeDetail === "string") msg = maybeDetail;
      else if (maybeDetail !== undefined && maybeDetail !== null) {
        msg = String(maybeDetail);
      }
    }
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

export const api = {
  get: request,
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  deleteBulk: <T>(path: string, body: unknown) => request<T>(path, { method: "DELETE", body }),
};
