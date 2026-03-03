import { Snaptrade } from "snaptrade-typescript-sdk";

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

  const data = err?.response?.data || err?.body || err?.data || err?.response || err;
  const detail = data?.detail || data?.error || data?.message || err?.message || "SnapTrade error";
  const code = data?.code || data?.status_code;
  const status = err?.response?.status || data?.status_code;
  return {
    error: detail,
    detail,
    code: code ?? null,
    status: status ?? null,
  };
}

let client: Snaptrade | null = null;

function getSnaptradeClient() {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!clientId || !consumerKey) {
    throw new Error("Missing SnapTrade env (SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY)");
  }
  if (!client) {
    client = new Snaptrade({ clientId, consumerKey });
  }
  return client;
}

async function unwrap<T>(promise: Promise<{ data: T }>): Promise<T> {
  const res = await promise;
  return res.data as T;
}

export async function snaptradeRegisterUser(userId: string) {
  const api = getSnaptradeClient();
  return unwrap<{ userId?: string; userSecret: string }>(api.authentication.registerSnapTradeUser({ userId }));
}

export async function snaptradeDeleteUser(userId: string) {
  const api = getSnaptradeClient();
  return unwrap<unknown>(api.authentication.deleteSnapTradeUser({ userId }));
}

export async function snaptradeLogin(params: {
  userId: string;
  userSecret: string;
  broker?: string;
  immediateRedirect?: boolean;
  customRedirect?: string;
  connectionType?: "read" | "trade";
  darkMode?: boolean;
  reconnect?: boolean;
  showCloseButton?: boolean;
  connectionPortalVersion?: string;
}) {
  const api = getSnaptradeClient();
  return unwrap<{ redirectURI?: string; redirectUri?: string; url?: string; sessionId?: string }>(
    api.authentication.loginSnapTradeUser(params)
  );
}

export async function snaptradeListAccounts(userId: string, userSecret: string) {
  const api = getSnaptradeClient();
  return unwrap<any[]>(api.accountInformation.listUserAccounts({ userId, userSecret }));
}

export async function snaptradeGetHoldings(userId: string, userSecret: string, accountId: string) {
  const api = getSnaptradeClient();
  return unwrap<any>(api.accountInformation.getUserHoldings({ userId, userSecret, accountId }));
}

export async function snaptradeGetBalances(userId: string, userSecret: string, accountId: string) {
  const api = getSnaptradeClient();
  return unwrap<any>(api.accountInformation.getUserAccountBalance({ userId, userSecret, accountId }));
}

export async function snaptradeGetActivities(
  userId: string,
  userSecret: string,
  accountId: string,
  startDate: string,
  endDate: string,
  opts?: { limit?: number; offset?: number }
) {
  const api = getSnaptradeClient();
  return unwrap<any>(
    api.accountInformation.getAccountActivities({
      userId,
      userSecret,
      accountId,
      startDate,
      endDate,
      limit: opts?.limit,
      offset: opts?.offset,
    })
  );
}

export async function snaptradeGetOrders(userId: string, userSecret: string, accountId: string, days?: number) {
  const api = getSnaptradeClient();
  return unwrap<any>(
    api.accountInformation.getUserAccountOrders({
      userId,
      userSecret,
      accountId,
      days,
    })
  );
}
