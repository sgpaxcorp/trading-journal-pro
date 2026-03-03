import crypto from "crypto";

const SNAPTRADE_BASE_URL = "https://api.snaptrade.com/api/v1";

type SnapTradeMethod = "GET" | "POST" | "PUT" | "DELETE";

export class SnaptradeApiError extends Error {
  status?: number;
  code?: string | number;
  detail?: string;
  raw?: any;

  constructor(message: string, opts?: { status?: number; code?: string | number; detail?: string; raw?: any }) {
    super(message);
    this.name = "SnaptradeApiError";
    this.status = opts?.status;
    this.code = opts?.code;
    this.detail = opts?.detail;
    this.raw = opts?.raw;
  }
}

export function formatSnaptradeError(err: any) {
  if (err instanceof SnaptradeApiError) {
    return {
      error: err.message,
      detail: err.detail ?? err.message,
      code: err.code ?? null,
      status: err.status ?? null,
    };
  }
  return { error: err?.message ?? "SnapTrade error" };
}

function buildQueryString(entries: Array<[string, string | number | boolean | null | undefined]>) {
  return entries
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function getSnapTradeKeys() {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!clientId || !consumerKey) {
    throw new Error("Missing SnapTrade env (SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY)");
  }
  return { clientId, consumerKey };
}

export async function snaptradeRequest<T>(
  path: string,
  method: SnapTradeMethod,
  opts?: {
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: Record<string, unknown> | null;
  }
): Promise<T> {
  const { clientId, consumerKey } = getSnapTradeKeys();
  const timestamp = Math.floor(Date.now() / 1000);
  const queryEntries: Array<[string, string | number | boolean | null | undefined]> = [
    ["clientId", clientId],
    ["timestamp", timestamp],
    ...Object.entries(opts?.query ?? {}),
  ];

  const queryString = buildQueryString(queryEntries);
  const requestPath = path.startsWith("/api/v1") ? path : `/api/v1${path.startsWith("/") ? "" : "/"}${path}`;
  const isRead = method === "GET" || method === "DELETE";
  const sigObject = {
    content: isRead ? "" : opts?.body ?? {},
    path: requestPath,
    query: queryString,
  };
  // Follow SnapTrade JS example (JSON.stringify with insertion order)
  const sigContent = JSON.stringify(sigObject);
  const signature = crypto
    .createHmac("sha256", encodeURI(consumerKey))
    .update(sigContent)
    .digest("base64");

  const url = `${SNAPTRADE_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}?${queryString}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Signature: signature,
    },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(opts?.body ?? {}),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = (data && (data.detail || data.error || data.message)) || `SnapTrade error ${res.status}`;
    const code = data && (data.code || data.status_code);
    throw new SnaptradeApiError(detail, { status: res.status, code, detail, raw: data });
  }
  return data as T;
}
