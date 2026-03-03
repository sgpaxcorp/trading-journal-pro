import crypto from "crypto";

const SNAPTRADE_BASE_URL = "https://api.snaptrade.com/api/v1";

type SnapTradeMethod = "GET" | "POST" | "PUT" | "DELETE";

function stableStringify(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${entries.join(",")}}`;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const keys = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== null).sort();
  return keys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
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
  const query = {
    ...(opts?.query ?? {}),
    clientId,
    timestamp,
  };

  const queryString = buildQuery(query);
  const requestPath = path.startsWith("/api/v1") ? path : `/api/v1${path.startsWith("/") ? "" : "/"}${path}`;
  const sigObject = {
    content: opts?.body ?? {},
    path: requestPath,
    query: queryString,
  };
  const sigContent = stableStringify(sigObject);
  const signature = crypto.createHmac("sha256", consumerKey).update(sigContent).digest("base64");

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
    const err = (data && (data.error || data.message)) || `SnapTrade error ${res.status}`;
    throw new Error(err);
  }
  return data as T;
}
