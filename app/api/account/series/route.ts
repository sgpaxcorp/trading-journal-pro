import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type CashflowRow = {
  id: string;
  user_id: string;
  date: string;
  type: "deposit" | "withdrawal";
  amount: number;
  created_at: string;
};

type SeriesPoint = { date: string; value: number };

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1);
}

function looksLikeYYYYMMDD(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function listDatesBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  if (!looksLikeYYYYMMDD(startIso) || !looksLikeYYYYMMDD(endIso)) return out;
  let cur = parseISODate(startIso);
  const end = parseISODate(endIso);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return out;
  while (cur.getTime() <= end.getTime()) {
    out.push(isoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function toNum(x: unknown, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function normalizeCashflowType(raw: unknown, amountRaw: number): "deposit" | "withdrawal" {
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

function mapCashflowRow(row: any): CashflowRow {
  const amountRaw = toNum(row?.amount ?? row?.amount_usd ?? row?.amountUsd ?? row?.usd_amount ?? row?.value ?? 0, 0);
  const type = normalizeCashflowType(row?.type ?? row?.cashflow_type ?? row?.kind ?? row?.txn_type ?? "", amountRaw);
  const amount = Math.abs(amountRaw);
  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? row?.userId ?? ""),
    date: resolveCashflowDate(row),
    type,
    amount,
    created_at: String(row?.created_at ?? row?.createdAt ?? ""),
  };
}

function cashflowSigned(cf: CashflowRow): number {
  if (!Number.isFinite(cf.amount) || cf.amount === 0) return 0;
  return cf.type === "withdrawal" ? -Math.abs(cf.amount) : Math.abs(cf.amount);
}

async function queryCashflows(table: string, userId: string) {
  let q = supabaseAdmin.from(table).select("*").eq("user_id", userId);
  let { data, error } = await q.order("date", { ascending: true }).order("created_at", { ascending: true });

  // If date column doesn't exist, retry without ordering by date
  if (error && (error.code === "42703" || String(error.message || "").toLowerCase().includes("does not exist"))) {
    const retry = await supabaseAdmin.from(table).select("*").eq("user_id", userId).order("created_at", { ascending: true });
    data = retry.data as any[] | null;
    error = retry.error;
  }

  return { data: (data ?? []) as any[], error };
}

async function listCashflowsForUser(userId: string, email?: string | null): Promise<CashflowRow[]> {
  // Primary: cashflows
  let rows: any[] = [];
  let primary = await queryCashflows("cashflows", userId);
  if (primary.error && primary.error.code === "42P01") {
    const legacy = await queryCashflows("ntj_cashflows", userId);
    if (legacy.error) throw legacy.error;
    rows = legacy.data;
  } else if (primary.error) {
    throw primary.error;
  } else {
    rows = primary.data;
    if (!rows.length) {
      const legacy = await queryCashflows("ntj_cashflows", userId);
      if (!legacy.error && legacy.data?.length) rows = legacy.data;
    }
  }

  if ((!rows || rows.length === 0) && email) {
    try {
      const emailRows = await queryCashflows("cashflows", email);
      if (!emailRows.error && emailRows.data?.length) rows = emailRows.data;
    } catch {
      // ignore
    }
  }

  return rows.map(mapCashflowRow);
}

async function listJournalEntries(userId: string, email?: string | null) {
  let { data, error } = await supabaseAdmin
    .from("journal_entries")
    .select("date, pnl")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) throw error;

  if ((!data || data.length === 0) && email) {
    try {
      const alt = await supabaseAdmin
        .from("journal_entries")
        .select("date, pnl")
        .eq("user_id", email)
        .order("date", { ascending: true });
      if (!alt.error && alt.data?.length) data = alt.data as any[];
    } catch {
      // ignore
    }
  }

  return (data ?? []) as any[];
}

function isWeekday(iso: string): boolean {
  const d = parseISODate(iso);
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ series: [], daily: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ series: [], daily: [] }, { status: 401 });
    }

    const userId = authData.user.id;
    const email = authData.user.email ?? null;

    const { data: planRows, error: planErr } = await supabaseAdmin
      .from("growth_plans")
      .select("starting_balance,target_balance,daily_target_pct,daily_goal_percent,loss_days_per_week,trading_days,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (planErr) throw planErr;

    const plan = (planRows ?? [])[0] as any | undefined;
    const startingBalance = toNum(plan?.starting_balance ?? 0, 0);
    const targetBalance = toNum(plan?.target_balance ?? 0, 0);
    const dailyTargetPct = toNum(plan?.daily_target_pct ?? plan?.daily_goal_percent ?? 0, 0);
    const lossDaysPerWeek = Math.max(0, Math.min(5, Math.floor(toNum(plan?.loss_days_per_week ?? 0, 0))));

    const planStartIso = (() => {
      const raw = String(plan?.created_at ?? plan?.updated_at ?? "");
      if (raw && raw.length >= 10) return raw.slice(0, 10);
      return "";
    })();

    const journalRows = await listJournalEntries(userId, email);
    const cashflows = await listCashflowsForUser(userId, email);

    const pnlByDate: Record<string, number> = {};
    let minDate = "";
    let maxDate = "";

    for (const r of journalRows ?? []) {
      const d = String(r?.date ?? "").slice(0, 10);
      if (!looksLikeYYYYMMDD(d)) continue;
      const pnl = toNum(r?.pnl ?? 0, 0);
      pnlByDate[d] = (pnlByDate[d] ?? 0) + pnl;
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }

    const cashByDate: Record<string, number> = {};
    for (const cf of cashflows ?? []) {
      const d = String(cf?.date ?? "").slice(0, 10);
      if (!looksLikeYYYYMMDD(d)) continue;
      const net = cashflowSigned(cf);
      cashByDate[d] = (cashByDate[d] ?? 0) + net;
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }

    const todayIso = isoDate(new Date());
    if (!maxDate || maxDate < todayIso) maxDate = todayIso;

    const startIso = planStartIso || minDate || todayIso;
    const dateList = listDatesBetween(startIso, maxDate);

    // Build actual series
    let cumPnl = 0;
    let cumCash = 0;
    const series: SeriesPoint[] = [];
    const daily: SeriesPoint[] = [];

    for (const d of dateList) {
      const dayPnl = pnlByDate[d] ?? 0;
      const dayCash = cashByDate[d] ?? 0;
      cumPnl += dayPnl;
      cumCash += dayCash;
      const value = startingBalance + cumPnl + cumCash;
      series.push({ date: d, value: Number(value.toFixed(2)) });
      if (pnlByDate[d] != null) {
        daily.push({ date: d, value: Number(dayPnl.toFixed(2)) });
      }
    }

    // Build projected series (trading days only + cashflow neutralization)
    let projBalance = startingBalance;
    let tradingIdx = 0;
    const projected: SeriesPoint[] = [];

    for (const d of dateList) {
      const dayCash = cashByDate[d] ?? 0;
      if (dayCash !== 0) projBalance += dayCash;

      if (isWeekday(d) && dailyTargetPct > 0) {
        const isLossDay = lossDaysPerWeek > 0 && (tradingIdx % 5) < lossDaysPerWeek;
        const r = dailyTargetPct / 100;
        projBalance = projBalance * (1 + (isLossDay ? -r : r));
        tradingIdx += 1;
      }
      projected.push({ date: d, value: Number(projBalance.toFixed(2)) });
    }

    const totalTradingPnl = cumPnl;
    const totalCashflowNet = cumCash;
    const currentBalance = startingBalance + totalTradingPnl + totalCashflowNet;

    return NextResponse.json({
      plan: {
        startingBalance,
        targetBalance,
        dailyTargetPct,
        planStartIso: startIso,
      },
      totals: {
        tradingPnl: Number(totalTradingPnl.toFixed(2)),
        cashflowNet: Number(totalCashflowNet.toFixed(2)),
        currentBalance: Number(currentBalance.toFixed(2)),
      },
      series,
      projected,
      daily,
    });
  } catch (err: any) {
    console.error("[account/series] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
