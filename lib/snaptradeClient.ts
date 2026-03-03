import crypto from "crypto";

const SNAPTRADE_BASE_URL = "https://api.snaptrade.com/api/v1";

type SnapTradeMethod = "GET" | "POST" | "PUT" | "DELETE";

function buildQueryString(params: Record<string, string | number | boolean | null | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  const sorted = entries.sort(([a], [b]) => a.localeCompare(b));
  const qs = new URLSearchParams();
  for (const [key, value] of sorted) {
    qs.set(key, String(value));
  }
  return qs.toString();
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
    clientId,
    timestamp,
    ...(opts?.query ?? {}),
  };

  const queryString = buildQueryString(query);
  const requestPath = path.startsWith("/api/v1") ? path : `/api/v1${path.startsWith("/") ? "" : "/"}${path}`;
  const sigObject = {
    content: opts?.body ?? {},
    path: requestPath,
    query: queryString,
  };
  // SnapTrade docs use JSON.stringify for the signed content
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
    const err = (data && (data.error || data.message)) || `SnapTrade error ${res.status}`;
    throw new Error(err);
  }
  return data as T;
}
