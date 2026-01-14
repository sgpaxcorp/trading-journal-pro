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

export function signedCashflowAmount(cf: Pick<Cashflow, "type" | "amount">): number {
  const amt = Math.abs(toNum(cf.amount, 0));
  return cf.type === "withdrawal" ? -amt : amt;
}

export async function listCashflows(
  userId: string,
  opts?: { fromDate?: string; toDate?: string; throwOnError?: boolean }
) {
  if (!userId) return [] as Cashflow[];

  let q = supabaseBrowser
    .from("cashflows")
    .select("id,user_id,date,type,amount,note,created_at")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts?.fromDate) q = q.gte("date", opts.fromDate);
  if (opts?.toDate) q = q.lte("date", opts.toDate);

  const { data, error } = await q;

  if (error) {
    console.error("[cashflowsSupabase] listCashflows error:", error);
    if (opts?.throwOnError) throw error;
    return [] as Cashflow[];
  }

  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    date: String(r.date),
    type: (r.type as CashflowType) || "deposit",
    amount: toNum(r.amount, 0),
    note: r.note ?? null,
    created_at: String(r.created_at ?? ""),
  }));
}

export async function createCashflow(params: {
  userId: string;
  date: string; // YYYY-MM-DD
  type: CashflowType;
  amount: number; // positive
  note?: string | null;
}) {
  const { userId, date, type, amount } = params;
  const note = params.note ?? null;

  if (!userId) throw new Error("Missing userId");
  if (!date) throw new Error("Missing date");
  if (type !== "deposit" && type !== "withdrawal") throw new Error("Invalid type");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be > 0");

  const payload = {
    user_id: userId,
    date,
    type,
    amount,
    note,
  };

  const { data, error } = await supabaseBrowser
    .from("cashflows")
    .insert(payload)
    .select("id,user_id,date,type,amount,note,created_at")
    .single();

  if (error) {
    console.error("[cashflowsSupabase] createCashflow error:", error);
    throw error;
  }

  return {
    id: String((data as any).id),
    user_id: String((data as any).user_id),
    date: String((data as any).date),
    type: ((data as any).type as CashflowType) || type,
    amount: toNum((data as any).amount, amount),
    note: (data as any).note ?? null,
    created_at: String((data as any).created_at ?? ""),
  } as Cashflow;
}

export async function deleteCashflow(userId: string, cashflowId: string) {
  if (!userId) throw new Error("Missing userId");
  if (!cashflowId) throw new Error("Missing cashflowId");

  const { error } = await supabaseBrowser
    .from("cashflows")
    .delete()
    .eq("user_id", userId)
    .eq("id", cashflowId);

  if (error) {
    console.error("[cashflowsSupabase] deleteCashflow error:", error);
    throw error;
  }

  return true;
}
