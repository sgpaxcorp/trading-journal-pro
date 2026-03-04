import crypto from "crypto";
import {
  BrokerOAuthConnection,
  getBrokerOAuthConnection,
  upsertBrokerOAuthConnection,
} from "@/lib/brokerOAuthStorage";

export class WebullApiError extends Error {
  status?: number;
  code?: string | number;
  detail?: string;
  raw?: any;

  constructor(message: string, opts?: { status?: number; code?: string | number; detail?: string; raw?: any }) {
    super(message);
    this.name = "WebullApiError";
    this.status = opts?.status;
    this.code = opts?.code;
    this.detail = opts?.detail;
    this.raw = opts?.raw;
  }
}

export function formatWebullError(err: any) {
  if (err instanceof WebullApiError) {
    return {
      error: err.message,
      detail: err.detail ?? err.message,
      code: err.code ?? null,
      status: err.status ?? null,
    };
  }
  const data = err?.response?.data || err?.body || err?.data || err?.response || err;
  const detail = data?.detail || data?.error || data?.message || err?.message || "Webull error";
  const code = data?.code || data?.status_code;
  const status = err?.response?.status || data?.status_code || data?.status;
  return {
    error: detail,
    detail,
    code: code ?? null,
    status: status ?? null,
  };
}

export type WebullTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  refresh_expires_in?: number;
};

function getWebullConfig() {
  const clientId = process.env.WEBULL_CLIENT_ID?.trim();
  const clientSecret = process.env.WEBULL_CLIENT_SECRET?.trim();
  const appKey = process.env.WEBULL_APP_KEY?.trim();
  const appSecret = process.env.WEBULL_APP_SECRET?.trim();
  const env = (process.env.WEBULL_ENV || "prod").trim().toLowerCase();

  if (!clientId || !clientSecret || !appKey || !appSecret) {
    throw new Error(
      "Missing Webull env (WEBULL_CLIENT_ID / WEBULL_CLIENT_SECRET / WEBULL_APP_KEY / WEBULL_APP_SECRET)"
    );
  }

  const authBase =
    process.env.WEBULL_AUTH_BASE?.trim() ||
    (env === "uat" ? "https://passport.uat.webullbroker.com" : "https://passport.webull.com");
  const apiBase =
    process.env.WEBULL_API_BASE?.trim() ||
    (env === "uat"
      ? "https://us-oauth-open-api.uat.webullbroker.com"
      : "https://us-oauth-open-api.webull.com");
  const apiPrefix = process.env.WEBULL_API_PREFIX?.trim() || "/oauth-openapi";
  const redirectUri = process.env.WEBULL_REDIRECT_URI?.trim() || "";
  const signRequests = (process.env.WEBULL_SIGN_REQUESTS || "true").toLowerCase() !== "false";

  if (!redirectUri) {
    throw new Error("Missing WEBULL_REDIRECT_URI env");
  }

  return {
    clientId,
    clientSecret,
    appKey,
    appSecret,
    env,
    authBase,
    apiBase,
    apiPrefix,
    redirectUri,
    signRequests,
  };
}

export function buildWebullAuthUrl(opts: { state: string; scope?: string; redirectUri?: string }) {
  const cfg = getWebullConfig();
  const url = new URL("/oauth2/authenticate/login", cfg.authBase);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri || cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", opts.state);
  if (opts.scope) url.searchParams.set("scope", opts.scope);
  return url.toString();
}

async function requestWebullToken(payload: Record<string, string>) {
  const cfg = getWebullConfig();
  const body = new URLSearchParams(payload);
  const res = await fetch(`${cfg.apiBase}/openapi/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as WebullTokenResponse & { error?: string; message?: string };
  if (!res.ok) {
    throw new WebullApiError(data?.message || data?.error || "Webull token error", {
      status: res.status,
      raw: data,
    });
  }
  return data;
}

export async function exchangeWebullCode(code: string, redirectUri?: string) {
  const cfg = getWebullConfig();
  return requestWebullToken({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri || cfg.redirectUri,
  });
}

export async function refreshWebullToken(refreshToken: string) {
  const cfg = getWebullConfig();
  return requestWebullToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
}

function toExpiryDate(seconds?: number, fallbackMinutes = 25): string | null {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return new Date(Date.now() + seconds * 1000).toISOString();
  }
  if (fallbackMinutes > 0) {
    return new Date(Date.now() + fallbackMinutes * 60 * 1000).toISOString();
  }
  return null;
}

function normalizeTokens(data: WebullTokenResponse, existing?: BrokerOAuthConnection) {
  const access = data.access_token || existing?.access_token || null;
  const refresh = data.refresh_token || existing?.refresh_token || null;
  const accessExpires = toExpiryDate(data.expires_in, 25);
  const refreshSeconds =
    typeof data.refresh_token_expires_in === "number"
      ? data.refresh_token_expires_in
      : typeof data.refresh_expires_in === "number"
        ? data.refresh_expires_in
        : undefined;
  const refreshExpires = toExpiryDate(refreshSeconds, 0);
  return {
    access_token: access,
    refresh_token: refresh,
    scope: data.scope || existing?.scope || null,
    access_expires_at: accessExpires,
    refresh_expires_at: refreshExpires,
  };
}

export async function saveWebullTokens(
  userId: string,
  data: WebullTokenResponse,
  existing?: BrokerOAuthConnection
) {
  const normalized = normalizeTokens(data, existing);
  return upsertBrokerOAuthConnection({
    user_id: userId,
    broker: "webull",
    access_token: normalized.access_token,
    refresh_token: normalized.refresh_token,
    scope: normalized.scope,
    access_expires_at: normalized.access_expires_at,
    refresh_expires_at: normalized.refresh_expires_at,
  });
}

function isTokenFresh(expiresAt: string | null | undefined) {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return Number.isFinite(ts) && ts > Date.now() + 60 * 1000;
}

export async function ensureWebullAccessToken(userId: string) {
  const existing = await getBrokerOAuthConnection(userId, "webull");
  if (!existing?.access_token) {
    throw new WebullApiError("Webull not connected", { status: 401 });
  }
  if (isTokenFresh(existing.access_expires_at)) {
    return { accessToken: existing.access_token, connection: existing };
  }
  if (!existing.refresh_token) {
    throw new WebullApiError("Webull refresh token missing", { status: 401 });
  }
  const refreshed = await refreshWebullToken(existing.refresh_token);
  const saved = await saveWebullTokens(userId, refreshed, existing);
  if (!saved.access_token) {
    throw new WebullApiError("Webull token refresh failed", { status: 401 });
  }
  return { accessToken: saved.access_token, connection: saved };
}

function md5Hex(value: string) {
  return crypto.createHash("md5").update(value).digest("hex").toUpperCase();
}

function hmacSha1Base64(key: string, value: string) {
  return crypto.createHmac("sha1", key).update(value).digest("base64");
}

function buildSignatureHeaders(url: URL, body: string | null) {
  const cfg = getWebullConfig();
  const nonce = crypto.randomBytes(8).toString("hex");
  const timestamp = new Date().toISOString();
  const signatureHeaders: Record<string, string> = {
    "x-app-key": cfg.appKey,
    "x-signature-algorithm": "HMAC-SHA1",
    "x-signature-version": "1.0",
    "x-signature-nonce": nonce,
    "x-timestamp": timestamp,
    host: url.host,
  };

  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  Object.entries(signatureHeaders).forEach(([key, value]) => {
    params[key] = value;
  });

  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const bodyMd5 = body ? md5Hex(body) : "";
  const signatureString = bodyMd5
    ? `${url.pathname}&${paramString}&${bodyMd5}`
    : `${url.pathname}&${paramString}`;

  const encoded = encodeURIComponent(signatureString);
  const signature = hmacSha1Base64(`${cfg.appSecret}&`, encoded);

  return { ...signatureHeaders, "x-signature": signature };
}

export async function webullRequest(
  userId: string,
  opts: {
    path: string;
    method?: string;
    query?: Record<string, string | number | undefined | null>;
    body?: any;
  }
) {
  const cfg = getWebullConfig();
  const { accessToken } = await ensureWebullAccessToken(userId);

  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  const url = new URL(`${cfg.apiPrefix}${path}`, cfg.apiBase);

  if (opts.query) {
    Object.entries(opts.query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }

  const method = (opts.method || "GET").toUpperCase();
  const body = opts.body !== undefined && opts.body !== null
    ? typeof opts.body === "string"
      ? opts.body
      : JSON.stringify(opts.body)
    : null;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (body) headers["Content-Type"] = "application/json";

  if (cfg.signRequests) {
    Object.assign(headers, buildSignatureHeaders(url, body));
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body || undefined,
  });
  const data = await res.json().catch(() => ({} as any));

  if (!res.ok) {
    throw new WebullApiError(data?.message || data?.error || data?.detail || "Webull API error", {
      status: res.status,
      raw: data,
    });
  }
  return data;
}
