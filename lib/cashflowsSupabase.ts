// lib/cashflowsSupabase.ts
// Client-safe helpers for deposits & withdrawals stored in Supabase.
//
// Table expected: public.cashflows
// Columns:
// - id uuid (pk)
// - user_id uuid (auth.users.id)
// - date date (YYYY-MM-DD)
// - type text ('deposit' | 'withdrawal')
// - amount numeric (positive)
// - note text (nullable)
// - created_at timestamptz (default now())
//
// IMPORTANT: Cashflows are NOT trading P&L. Keep them separate from journal/trade stats.

import { supabaseBrowser } from "@/lib/supaBaseClient";

export type CashflowType = "deposit" | "withdrawal";

export type Cashflow = {
  id: string;
  user_id: string;
  account_id?: string | null;
  date: string; // YYYY-MM-DD
  type: CashflowType;
  amount: number; // positive number (we apply sign by type)
  note: string | null;
  created_at: string;
};

function toNum(x: unknown, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function normalizeCashflowType(raw: unknown, amountRaw: number): CashflowType {
  const t = String(raw ?? "").toLowerCase().trim();
  if (t.includes("with") || t.includes("wd")) return "withdrawal";
  if (t.includes("dep") || t.includes("add") || t.includes("fund")) return "deposit";
  if (amountRaw < 0) return "withdrawal";
  return "deposit";
}

function resolveCashflowDate(raw: any): string {
  const v = raw?.date ?? raw?.cashflow_date ?? raw?.created_at ?? raw?.createdAt ?? "";
  if (!v) return "";
  const s = String(v);
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function mapCashflowRow(row: any): Cashflow {
  const amountRaw = toNum(row?.amount ?? row?.amount_usd ?? row?.amountUsd ?? row?.usd_amount ?? row?.value ?? 0, 0);
  const type = normalizeCashflowType(row?.type ?? row?.cashflow_type ?? row?.kind ?? row?.txn_type ?? "", amountRaw);
  const amount = Math.abs(amountRaw);
  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? row?.userId ?? ""),
    account_id: row?.account_id ?? null,
    date: resolveCashflowDate(row),
    type,
    amount,
    note: row?.note ?? row?.memo ?? null,
    created_at: String(row?.created_at ?? row?.createdAt ?? ""),
  };
}

function isMissingRelation(err: any): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "42P01" || msg.includes("does not exist") || msg.includes("undefined table");
}

function isMissingColumn(err: any): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

export function signedCashflowAmount(cf: Pick<Cashflow, "type" | "amount"> & { amount?: any; type?: any }): number {
  const amountRaw = toNum((cf as any)?.amount ?? (cf as any)?.amount_usd ?? (cf as any)?.amountUsd ?? 0, 0);
  if (!Number.isFinite(amountRaw) || amountRaw === 0) return 0;
  const type = normalizeCashflowType((cf as any)?.type ?? (cf as any)?.cashflow_type ?? "", amountRaw);
  const amt = Math.abs(amountRaw);
  return type === "withdrawal" ? -amt : amt;
}

async function queryCashflowsTable(
  table: string,
  userId: string,
  opts?: { fromDate?: string; toDate?: string; accountId?: string | null }
): Promise<{ data: any[]; error: any | null }> {
  let q = supabaseBrowser.from(table).select("*").eq("user_id", userId);
  if (opts?.accountId) {
    q = q.eq("account_id", opts.accountId);
  }

  let { data, error } = await q.order("date", { ascending: false }).order("created_at", { ascending: false });

  // If date column doesn't exist, retry without date filters and sort only by created_at.
  if (error && isMissingColumn(error)) {
    const retry = await supabaseBrowser.from(table).select("*").eq("user_id", userId).order("created_at", { ascending: false });
    data = retry.data as any[] | null;
    error = retry.error;
  }

  return { data: (data ?? []) as any[], error };
}

type ListCashflowsOpts = {
  fromDate?: string;
  toDate?: string;
  accountId?: string | null;
  throwOnError?: boolean;
  forceServer?: boolean;
  skipServer?: boolean;
};

async function fetchCashflowsViaApi(opts?: ListCashflowsOpts): Promise<Cashflow[] | null> {
  if (typeof window === "undefined") return null;

  try {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;

    const params = new URLSearchParams();
    if (opts?.fromDate) params.set("fromDate", opts.fromDate);
    if (opts?.toDate) params.set("toDate", opts.toDate);
    if (opts?.accountId) params.set("accountId", opts.accountId);

    const url = `/api/cashflows/list${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    const body = await res.json();
    const rows = Array.isArray(body?.cashflows) ? (body.cashflows as any[]) : [];
    return rows.map(mapCashflowRow);
  } catch {
    return null;
  }
}

export async function listCashflows(userId: string, opts?: ListCashflowsOpts) {
  if (!userId) return [] as Cashflow[];

  // Primary table: cashflows
  let primary = await queryCashflowsTable("cashflows", userId, opts);

  // Fallback to legacy table if needed
  if (primary.error && isMissingRelation(primary.error)) {
    const legacy = await queryCashflowsTable("ntj_cashflows", userId, opts);
    if (legacy.error) {
      console.error("[cashflowsSupabase] listCashflows error:", legacy.error);
      if (!opts?.skipServer) {
        const apiRows = await fetchCashflowsViaApi(opts);
        if (apiRows) return apiRows;
      }
      if (opts?.throwOnError) throw legacy.error;
      return [] as Cashflow[];
    }
    const normalizedLegacy = legacy.data.map(mapCashflowRow);
    return normalizedLegacy.filter((r) => {
      if (!r.date) return true;
      if (opts?.fromDate && r.date < opts.fromDate) return false;
      if (opts?.toDate && r.date > opts.toDate) return false;
      return true;
    });
  }

  if (primary.error) {
    console.error("[cashflowsSupabase] listCashflows error:", primary.error);
    if (!opts?.skipServer) {
      const apiRows = await fetchCashflowsViaApi(opts);
      if (apiRows) return apiRows;
    }
    if (opts?.throwOnError) throw primary.error;
    return [] as Cashflow[];
  }

  let rows = primary.data ?? [];

  // If primary table is empty, try legacy table for backwards compatibility.
  if (!rows.length) {
    const legacy = await queryCashflowsTable("ntj_cashflows", userId, opts);
    if (!legacy.error && legacy.data?.length) {
      rows = legacy.data;
    } else if (!opts?.skipServer) {
      const apiRows = await fetchCashflowsViaApi({ ...opts, forceServer: false });
      if (apiRows) return apiRows;
    }
  }

  const normalized = rows.map(mapCashflowRow);

  const filtered = normalized.filter((r) => {
    if (!r.date) return true;
    if (opts?.fromDate && r.date < opts.fromDate) return false;
    if (opts?.toDate && r.date > opts.toDate) return false;
    return true;
  });

  if (!filtered.length && opts?.forceServer && !opts?.skipServer) {
    const apiRows = await fetchCashflowsViaApi(opts);
    if (apiRows) return apiRows;
  }

  return filtered;
}

export async function createCashflow(params: {
  userId: string;
  accountId?: string | null;
  date: string; // YYYY-MM-DD
  type: CashflowType;
  amount: number; // positive
  note?: string | null;
}) {
  const { userId, date, type, amount, accountId } = params;
  const note = params.note ?? null;

  if (!userId) throw new Error("Missing userId");
  if (!date) throw new Error("Missing date");
  if (type !== "deposit" && type !== "withdrawal") throw new Error("Invalid type");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be > 0");

  const payload = {
    user_id: userId,
    account_id: accountId ?? null,
    date,
    type,
    amount,
    note,
  };

  // Try primary table first
  let res = await supabaseBrowser
    .from("cashflows")
    .insert(payload)
    .select("*")
    .single();

  if (res.error && isMissingRelation(res.error)) {
    // Fallback to legacy table
    res = await supabaseBrowser
      .from("ntj_cashflows")
      .insert(payload)
      .select("*")
      .single();
  }

  if (res.error) {
    console.error("[cashflowsSupabase] createCashflow error:", res.error);
    throw res.error;
  }

  return mapCashflowRow(res.data);
}

export async function deleteCashflow(userId: string, cashflowId: string) {
  if (!userId) throw new Error("Missing userId");
  if (!cashflowId) throw new Error("Missing cashflowId");

  let res = await supabaseBrowser.from("cashflows").delete().eq("user_id", userId).eq("id", cashflowId);

  if (res.error && isMissingRelation(res.error)) {
    res = await supabaseBrowser.from("ntj_cashflows").delete().eq("user_id", userId).eq("id", cashflowId);
  }

  if (res.error) {
    console.error("[cashflowsSupabase] deleteCashflow error:", res.error);
    throw res.error;
  }

  return true;
}
