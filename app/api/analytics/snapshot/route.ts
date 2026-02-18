// app/api/analytics/snapshot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { buildSnapshotAndEdges, type SessionRow, type TradeRow } from "@/lib/analyticsEngine";

export const runtime = "nodejs";

const JOURNAL_TABLE = "journal_entries";
const USER_ID_COL = "user_id";
const DATE_COL = "date";
const PNL_COL = "pnl";
const NOTES_COL = "notes";
const TAGS_COL = "tags";
const PLAN_COL = "respected_plan";
const LEGACY_PLAN_COL = "respectedPlan";
const EMOTION_COL = "emotion";
const EMOTIONS_COL = "emotions";

function isMissingColumnError(err: any, column?: string) {
  if (!err) return false;
  if (err.code === "42703") return true;
  if (String(err.code || "").startsWith("PGRST")) {
    // PostgREST schema cache / unknown column errors
    return true;
  }
  const msg = String(err.message || "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("schema cache") && msg.includes("column")) return true;
  if (msg.includes("could not find") && msg.includes("column")) return true;
  if (msg.includes("does not exist") && msg.includes("column")) return true;
  if (column && msg.includes(column.toLowerCase())) return true;
  return false;
}

function normalizeStringArray(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((x) => String(x).trim()).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }
    if (trimmed.includes(",")) {
      return trimmed.split(",").map((x) => x.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return null;
}

function extractRespectedPlan(row: any): boolean | null {
  const raw =
    row?.[PLAN_COL] ??
    row?.[LEGACY_PLAN_COL] ??
    row?.plan_respected ??
    row?.planRespected ??
    row?.followedPlan ??
    row?.respectedPlan ??
    row?.respected_plan;
  if (raw == null) return null;
  return Boolean(raw);
}

function extractEmotions(row: any): string[] | null {
  const raw = row?.[EMOTIONS_COL] ?? row?.[EMOTION_COL] ?? row?.emotional_state ?? row?.emotions;
  return normalizeStringArray(raw);
}

function safeUpper(s: string) {
  return (s || "").trim().toUpperCase();
}

function normalizeKind(k: any): TradeRow["kind"] {
  const v = safeUpper(String(k || "other"));
  if (v === "OPTION") return "option";
  if (v === "FUTURE") return "future";
  if (v === "STOCK") return "stock";
  if (v === "CRYPTO") return "crypto";
  if (v === "FOREX") return "forex";
  return "other";
}

function normalizeSide(s: any): TradeRow["side"] {
  const v = safeUpper(String(s || "LONG"));
  return v === "SHORT" ? "short" : "long";
}

function timeBucket30m(raw?: string | null): string | null {
  if (!raw) return null;
  const parts = String(raw).trim().split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  const bucket = m < 30 ? 0 : 30;
  return `${String(h).padStart(2, "0")}:${bucket === 0 ? "00" : "30"}`;
}

function computeSessionStats(pnls: number[]) {
  const clean = pnls.filter((v) => Number.isFinite(v));
  const total = clean.reduce((a, b) => a + b, 0);
  const wins = clean.filter((v) => v > 0);
  const losses = clean.filter((v) => v < 0);
  const breakevens = clean.filter((v) => v === 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLossAbs = Math.abs(losses.reduce((a, b) => a + b, 0));
  const avgWin = wins.length ? grossProfit / wins.length : null;
  const avgLoss = losses.length ? grossLossAbs / losses.length : null;
  const maxWin = clean.length ? Math.max(...clean) : null;
  const maxLoss = clean.length ? Math.min(...clean) : null;
  const expectancy = clean.length ? total / clean.length : null;
  const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : null;
  return {
    total,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    grossProfit,
    grossLossAbs,
    avgWin,
    avgLoss,
    maxWin,
    maxLoss,
    expectancy,
    profitFactor,
  };
}

function stddev(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function downsideDeviation(values: number[]) {
  const neg = values.filter((v) => v < 0);
  if (!neg.length) return null;
  const squared = neg.map((v) => v * v);
  const mean = squared.reduce((a, b) => a + b, 0) / squared.length;
  return Math.sqrt(mean);
}

function computeStreaks(values: number[]) {
  let winStreak = 0;
  let lossStreak = 0;
  let maxWin = 0;
  let maxLoss = 0;
  for (const v of values) {
    if (v > 0) {
      winStreak += 1;
      lossStreak = 0;
    } else if (v < 0) {
      lossStreak += 1;
      winStreak = 0;
    } else {
      winStreak = 0;
      lossStreak = 0;
    }
    if (winStreak > maxWin) maxWin = winStreak;
    if (lossStreak > maxLoss) maxLoss = lossStreak;
  }
  return { maxWin, maxLoss };
}

function computeDrawdown(pnls: number[], startBalance = 0) {
  let cum = 0;
  let peak = Number.isFinite(startBalance) ? startBalance : 0;
  let maxDd = 0;
  let maxDdPct: number | null = null;
  for (const pnl of pnls) {
    cum += pnl;
    const equity = (Number.isFinite(startBalance) ? startBalance : 0) + cum;
    if (equity > peak) peak = equity;
    const dd = equity - peak; // <= 0
    if (dd < maxDd) maxDd = dd;
    if (peak > 0 && dd < 0) {
      const pct = (dd / peak) * 100;
      if (maxDdPct == null || pct < maxDdPct) maxDdPct = pct;
    }
  }
  return {
    maxDrawdown: maxDd < 0 ? maxDd : 0,
    maxDrawdownPct: maxDdPct,
  };
}

function parseNotesTrades(notesRaw: unknown): { entries: any[]; exits: any[] } {
  if (notesRaw && typeof notesRaw === "object") {
    const parsed = notesRaw as any;
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const exits = Array.isArray(parsed?.exits) ? parsed.exits : [];
    return { entries, exits };
  }
  if (typeof notesRaw !== "string") return { entries: [], exits: [] };
  try {
    const parsed = JSON.parse(notesRaw);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const exits = Array.isArray(parsed?.exits) ? parsed.exits : [];
    return { entries, exits };
  } catch {
    return { entries: [], exits: [] };
  }
}

function toTradeRow(t: any): TradeRow | null {
  const symbol = safeUpper(t?.symbol || "");
  if (!symbol) return null;

  const price = Number(t?.price);
  const quantity = Number(t?.quantity);
  if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) return null;

  return {
    symbol,
    kind: normalizeKind(t?.kind),
    side: normalizeSide(t?.side),
    price,
    quantity,
    time: typeof t?.time === "string" ? t.time : undefined,
    dte: t?.dte == null ? null : Number(t.dte),
    expiry: typeof t?.expiry === "string" ? t.expiry : null,
    optionStrategy: typeof t?.optionStrategy === "string" ? t.optionStrategy : typeof t?.strategy === "string" ? t.strategy : null,
  };
}

async function querySessions(ownerId: string, accountId?: string | null, useAccountFilter = true) {
  let q = supabaseAdmin
    .from(JOURNAL_TABLE)
    .select("*")
    .eq(USER_ID_COL, ownerId)
    .order(DATE_COL, { ascending: true });

  if (accountId && useAccountFilter) {
    q = q.eq("account_id", accountId);
  }

  let { data, error } = await q;

  if (
    error &&
    accountId &&
    useAccountFilter &&
    (error.code === "42703" || String(error.message || "").toLowerCase().includes("does not exist"))
  ) {
    const retry = await supabaseAdmin
      .from(JOURNAL_TABLE)
      .select("*")
      .eq(USER_ID_COL, ownerId)
      .order(DATE_COL, { ascending: true });
    data = retry.data as any[] | null;
    error = retry.error;
  }

  return { data: (data ?? []) as any[], error };
}

async function fetchSessions(userId: string, email?: string | null, accountId?: string | null): Promise<SessionRow[]> {
  let rows: any[] = [];
  let primary = await querySessions(userId, accountId, true);
  if (primary.error) throw primary.error;
  rows = primary.data;

  if (rows.length === 0 && accountId) {
    const fallback = await querySessions(userId, accountId, false);
    if (fallback.error) throw fallback.error;
    rows = fallback.data;
  }

  if (rows.length === 0 && email) {
    let alt = await querySessions(email, accountId, true);
    if (!alt.error && alt.data?.length) {
      rows = alt.data;
    } else if (accountId) {
      const altFallback = await querySessions(email, accountId, false);
      if (!altFallback.error && altFallback.data?.length) rows = altFallback.data;
    }
  }

  const out: SessionRow[] = rows.map((r) => {
    const date = String(r[DATE_COL] ?? "");
    const pnl = Number(r[PNL_COL] ?? 0);

    const { entries, exits } = parseNotesTrades(r[NOTES_COL]);

    const ent = (entries || []).map(toTradeRow).filter(Boolean) as TradeRow[];
    const ex = (exits || []).map(toTradeRow).filter(Boolean) as TradeRow[];

    const tags = normalizeStringArray(r[TAGS_COL]) ?? null;
    const emotions = extractEmotions(r);
    const respectedPlan = extractRespectedPlan(r);

    return {
      date,
      pnl: Number.isFinite(pnl) ? pnl : 0,
      respectedPlan,
      tags,
      emotions,
      entries: ent,
      exits: ex,
    };
  });

  return out.filter((s) => !!s.date);
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ snapshot: null, topEdges: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ snapshot: null, topEdges: [] }, { status: 401 });
    }

    const userId = authData.user.id;
    const email = authData.user.email ?? null;
    const { searchParams } = new URL(req.url);
    const requestedAccountId = searchParams.get("accountId") || "";
    const { data: pref } = await supabaseAdmin
      .from("user_preferences")
      .select("active_account_id")
      .eq("user_id", userId)
      .maybeSingle();
    const accountId = requestedAccountId || (pref as any)?.active_account_id || null;

    let { data: snap, error: snapErr } = await supabaseAdmin
      .from("analytics_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapErr) throw snapErr;

    const force = searchParams.get("force") === "1";
    const payloadMetaMethod = (snap as any)?.payload?.meta?.tradeCountMethod;
    const missingCritical =
      !snap ||
      snap.sessions_count == null ||
      snap.trades_count == null ||
      snap.total_pnl == null ||
      snap.payload == null ||
      (snap.sessions_count === 0 && snap.trades_count === 0 && snap.total_pnl === 0) ||
      payloadMetaMethod !== "round_trip_grouped";

    let sessionsCache: SessionRow[] | null = null;
    const ensureSessions = async () => {
      if (sessionsCache) return sessionsCache;
      sessionsCache = await fetchSessions(userId, email, accountId);
      return sessionsCache;
    };

    if (!snap || missingCritical || force) {
      const sessions = await ensureSessions();
      if (!sessions.length) {
        return NextResponse.json({ snapshot: null, topEdges: [] });
      }

      const { snapshot, edges } = buildSnapshotAndEdges({
        sessions,
        maxEdgesToStore: 1500,
      });

      const { error: upsertErr } = await supabaseAdmin
        .from("analytics_snapshots")
        .upsert(
          {
            user_id: userId,
            as_of_date: snapshot.as_of_date,
            range_start: snapshot.range_start,
            range_end: snapshot.range_end,
            sessions_count: snapshot.sessions_count,
            trades_count: snapshot.trades_count,
            total_pnl: snapshot.total_pnl,
            avg_pnl: snapshot.avg_pnl,
            median_pnl: snapshot.median_pnl,
            win_rate: snapshot.win_rate,
            profit_factor: snapshot.profit_factor,
            expectancy: snapshot.expectancy,
            pnl_std: snapshot.pnl_std,
            best_day: snapshot.best_day,
            best_day_pnl: snapshot.best_day_pnl,
            worst_day: snapshot.worst_day,
            worst_day_pnl: snapshot.worst_day_pnl,
            payload: snapshot.payload,
          },
          { onConflict: "user_id,as_of_date,range_start,range_end" }
        );

      if (upsertErr) throw upsertErr;

      let deleteQuery = supabaseAdmin
        .from("analytics_edges")
        .delete()
        .eq("user_id", userId)
        .eq("as_of_date", snapshot.as_of_date);
      if (accountId) {
        deleteQuery = deleteQuery.eq("account_id", accountId);
      }

      let { error: deleteErr } = await deleteQuery;
      if (deleteErr && accountId && isMissingColumnError(deleteErr, "account_id")) {
        const retry = await supabaseAdmin
          .from("analytics_edges")
          .delete()
          .eq("user_id", userId)
          .eq("as_of_date", snapshot.as_of_date);
        deleteErr = retry.error;
      }

      if (deleteErr) throw deleteErr;

      const batchSize = 500;
      let includeAccountId = Boolean(accountId);
      for (let i = 0; i < edges.length; i += batchSize) {
        const base = edges.slice(i, i + batchSize);
        const buildBatch = (withAccountId: boolean) =>
          base.map((e) => ({
            user_id: userId,
            account_id: withAccountId ? accountId : undefined,
            as_of_date: snapshot.as_of_date,
            symbol: e.symbol,
            kind: e.kind,
            side: e.side,
            dow: e.dow,
            time_bucket: e.time_bucket,
            dte_bucket: e.dte_bucket,
            plan_respected: e.plan_respected,
            has_fomo: e.has_fomo,
            has_revenge: e.has_revenge,
            n_sessions: e.n_sessions,
            n_trades: e.n_trades,
            wins: e.wins,
            losses: e.losses,
            win_rate: e.win_rate,
            win_rate_shrunk: e.win_rate_shrunk,
            avg_pnl: e.avg_pnl,
            expectancy: e.expectancy,
            profit_factor: e.profit_factor,
            avg_win: e.avg_win,
            avg_loss: e.avg_loss,
            edge_score: e.edge_score,
            confidence: e.confidence,
          }));

        let { error: insErr } = await supabaseAdmin
          .from("analytics_edges")
          .insert(buildBatch(includeAccountId));

        if (insErr && includeAccountId && isMissingColumnError(insErr, "account_id")) {
          includeAccountId = false;
          const retry = await supabaseAdmin.from("analytics_edges").insert(buildBatch(false));
          insErr = retry.error;
        }

        if (insErr) throw insErr;
      }

      snap = {
        user_id: userId,
        as_of_date: snapshot.as_of_date,
        range_start: snapshot.range_start,
        range_end: snapshot.range_end,
        sessions_count: snapshot.sessions_count,
        trades_count: snapshot.trades_count,
        total_pnl: snapshot.total_pnl,
        avg_pnl: snapshot.avg_pnl,
        median_pnl: snapshot.median_pnl,
        win_rate: snapshot.win_rate,
        profit_factor: snapshot.profit_factor,
        expectancy: snapshot.expectancy,
        pnl_std: snapshot.pnl_std,
        best_day: snapshot.best_day,
        best_day_pnl: snapshot.best_day_pnl,
        worst_day: snapshot.worst_day,
        worst_day_pnl: snapshot.worst_day_pnl,
        payload: snapshot.payload,
      } as any;
    }

    const asOf = snap.as_of_date;

    let edgesQuery = supabaseAdmin
      .from("analytics_edges")
      .select(
        "symbol, time_bucket, dow, dte_bucket, edge_score, confidence, n_sessions, n_trades, win_rate, win_rate_shrunk, expectancy, avg_pnl"
      )
      .eq("user_id", userId)
      .eq("as_of_date", asOf)
      .order("edge_score", { ascending: false })
      .limit(200);

    if (accountId) {
      edgesQuery = edgesQuery.eq("account_id", accountId);
    }

    let { data: edges, error: edgesErr } = await edgesQuery;
    if (edgesErr && accountId && isMissingColumnError(edgesErr, "account_id")) {
      const retry = await supabaseAdmin
        .from("analytics_edges")
        .select(
          "symbol, time_bucket, dow, dte_bucket, edge_score, confidence, n_sessions, n_trades, win_rate, win_rate_shrunk, expectancy, avg_pnl"
        )
        .eq("user_id", userId)
        .eq("as_of_date", asOf)
        .order("edge_score", { ascending: false })
        .limit(200);
      edges = retry.data as any[] | null;
      edgesErr = retry.error;
    }

    if (edgesErr) throw edgesErr;

    const payload = (snap as any)?.payload || {};
    const drawdownCurve = Array.isArray(payload?.drawdownCurve) ? payload.drawdownCurve : [];
    const maxDrawdown =
      drawdownCurve.length > 0
        ? Math.min(...drawdownCurve.map((d: any) => Number(d?.dd ?? d?.value ?? 0)))
        : null;

    const byHourMap = new Map<string, { pnl: number; trades: number; winRateSum: number; sessions: number }>();
    const byDowMap = new Map<string, { pnl: number; trades: number; winRateSum: number; sessions: number }>();
    const bySymbolMap = new Map<string, { pnl: number; trades: number; winRateSum: number; sessions: number }>();

    for (const row of edges ?? []) {
      const timeBucket = row?.time_bucket ? String(row.time_bucket) : null;
      const dow = row?.dow != null ? String(row.dow) : null;
      const symbol = row?.symbol ? String(row.symbol) : null;
      const sessions = Number(row?.n_sessions ?? 0) || 0;
      const trades = Number(row?.n_trades ?? 0) || 0;
      const avgPnl = Number(row?.avg_pnl ?? 0) || 0;
      const winRate = Number(row?.win_rate ?? row?.win_rate_shrunk ?? 0) || 0;
      const pnlTotal = avgPnl * sessions;

      if (timeBucket && !symbol && !dow) {
        const key = timeBucket;
        const agg = byHourMap.get(key) || { pnl: 0, trades: 0, winRateSum: 0, sessions: 0 };
        agg.pnl += pnlTotal;
        agg.trades += trades;
        agg.winRateSum += winRate * sessions;
        agg.sessions += sessions;
        byHourMap.set(key, agg);
      }

      if (dow && !symbol && !timeBucket) {
        const key = dow;
        const agg = byDowMap.get(key) || { pnl: 0, trades: 0, winRateSum: 0, sessions: 0 };
        agg.pnl += pnlTotal;
        agg.trades += trades;
        agg.winRateSum += winRate * sessions;
        agg.sessions += sessions;
        byDowMap.set(key, agg);
      }

      if (symbol && !timeBucket && !dow) {
        const key = symbol;
        const agg = bySymbolMap.get(key) || { pnl: 0, trades: 0, winRateSum: 0, sessions: 0 };
        agg.pnl += pnlTotal;
        agg.trades += trades;
        agg.winRateSum += winRate * sessions;
        agg.sessions += sessions;
        bySymbolMap.set(key, agg);
      }
    }

    let byHour = Array.from(byHourMap.entries()).map(([hour, agg]) => ({
      hour,
      pnl: Number(agg.pnl.toFixed(2)),
      trades: agg.trades,
      winRate: agg.sessions ? Number((agg.winRateSum / agg.sessions).toFixed(2)) : 0,
    }));

    let byDOW = Array.from(byDowMap.entries()).map(([dow, agg]) => ({
      dow,
      pnl: Number(agg.pnl.toFixed(2)),
      trades: agg.trades,
      winRate: agg.sessions ? Number((agg.winRateSum / agg.sessions).toFixed(2)) : 0,
    }));

    const bySymbol = Array.from(bySymbolMap.entries())
      .map(([symbol, agg]) => ({
        symbol,
        pnl: Number(agg.pnl.toFixed(2)),
        trades: agg.trades,
        winRate: agg.sessions ? Number((agg.winRateSum / agg.sessions).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 12);

    if (byDOW.length === 0 && Array.isArray(payload?.dowBars)) {
      byDOW = payload.dowBars.map((row: any) => ({
        dow: String(row?.label ?? row?.dow ?? ""),
        pnl: Number((Number(row?.avgPnl ?? 0) * Number(row?.sessions ?? 0)).toFixed(2)),
        trades: Number(row?.sessions ?? 0),
        winRate: Number(row?.winRate ?? 0),
      }));
    }

    if (byHour.length === 0) {
      const sessions = await ensureSessions();
      if (sessions.length) {
        const hourAgg = new Map<string, { pnl: number; trades: number; wins: number; sessions: number }>();
        for (const s of sessions) {
          const allTrades = [...(s.entries ?? []), ...(s.exits ?? [])];
          const firstTime = allTrades.find((t) => t.time)?.time;
          const bucket = timeBucket30m(firstTime ?? undefined);
          if (!bucket) continue;
          const pnl = Number(s.pnl ?? 0) || 0;
          const trades = allTrades.length;
          const agg = hourAgg.get(bucket) || { pnl: 0, trades: 0, wins: 0, sessions: 0 };
          agg.pnl += pnl;
          agg.trades += trades;
          agg.sessions += 1;
          if (pnl > 0) agg.wins += 1;
          hourAgg.set(bucket, agg);
        }
        byHour = Array.from(hourAgg.entries()).map(([hour, agg]) => ({
          hour,
          pnl: Number(agg.pnl.toFixed(2)),
          trades: agg.trades,
          winRate: agg.sessions ? Number(((agg.wins / agg.sessions) * 100).toFixed(2)) : 0,
        }));
      }
    }

    let summary = payload?.summary || {};
    let summaryUpdated = false;
    if (
      summary.avgWin == null ||
      summary.avgLoss == null ||
      summary.maxWin == null ||
      summary.maxLoss == null ||
      summary.wins == null ||
      summary.losses == null ||
      summary.breakevens == null ||
      summary.grossPnl == null ||
      summary.payoffRatio == null ||
      summary.maxDrawdown == null
    ) {
      const sessions = await ensureSessions();
      if (sessions.length) {
        const pnls = sessions.map((s) => Number(s.pnl ?? 0)).filter((v) => Number.isFinite(v));
        const stats = computeSessionStats(pnls);
        const streaks = computeStreaks(pnls);

        let startBalance = Number(summary.startBalance ?? 0);
        if (!Number.isFinite(startBalance) || startBalance <= 0) {
          let planQuery = supabaseAdmin
            .from("growth_plans")
            .select("starting_balance,created_at,updated_at")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1);
          if (accountId) planQuery = planQuery.eq("account_id", accountId);
          const { data: planRows } = await planQuery;
          const plan = (planRows ?? [])[0] as any | undefined;
          startBalance = Number(plan?.starting_balance ?? 0) || 0;
        }

        const dd = computeDrawdown(pnls, startBalance);
        const mean = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
        const sd = stddev(pnls);
        const downside = downsideDeviation(pnls);
        const sharpe = sd && sd > 0 ? (mean / sd) * Math.sqrt(pnls.length) : null;
        const sortino = downside && downside > 0 ? (mean / downside) * Math.sqrt(pnls.length) : null;
        const payoffRatio =
          stats.avgWin != null && stats.avgLoss != null && stats.avgLoss > 0
            ? stats.avgWin / stats.avgLoss
            : null;
        const recoveryFactor =
          dd.maxDrawdown != null && dd.maxDrawdown < 0 ? stats.total / Math.abs(dd.maxDrawdown) : null;

        let cagr: number | null = null;
        const firstDate = sessions[0]?.date;
        const lastDate = sessions[sessions.length - 1]?.date;
        if (startBalance > 0 && firstDate && lastDate) {
          const start = new Date(firstDate + "T00:00:00Z").getTime();
          const end = new Date(lastDate + "T00:00:00Z").getTime();
          const years = (end - start) / (365.25 * 24 * 3600 * 1000);
          const endBalance = startBalance + stats.total;
          if (years > 0 && endBalance > 0) {
            cagr = Math.pow(endBalance / startBalance, 1 / years) - 1;
          }
        }

        summary = {
          ...summary,
          grossPnl: Number(stats.grossProfit.toFixed(2)),
          avgWin: stats.avgWin != null ? Number(stats.avgWin.toFixed(2)) : null,
          avgLoss: stats.avgLoss != null ? Number(stats.avgLoss.toFixed(2)) : null,
          maxWin: stats.maxWin != null ? Number(stats.maxWin.toFixed(2)) : null,
          maxLoss: stats.maxLoss != null ? Number(stats.maxLoss.toFixed(2)) : null,
          wins: stats.wins,
          losses: stats.losses,
          breakevens: stats.breakevens,
          payoffRatio: payoffRatio != null ? Number(payoffRatio.toFixed(3)) : null,
          expectancy: stats.expectancy != null ? Number(stats.expectancy.toFixed(3)) : null,
          profitFactor: stats.profitFactor != null ? Number(stats.profitFactor.toFixed(3)) : null,
          maxDrawdown: Number(dd.maxDrawdown.toFixed(2)),
          maxDrawdownPct: dd.maxDrawdownPct != null ? Number(dd.maxDrawdownPct.toFixed(2)) : null,
          longestWinStreak: streaks.maxWin,
          longestLossStreak: streaks.maxLoss,
          sharpe: sharpe != null ? Number(sharpe.toFixed(3)) : null,
          sortino: sortino != null ? Number(sortino.toFixed(3)) : null,
          recoveryFactor: recoveryFactor != null ? Number(recoveryFactor.toFixed(3)) : null,
          cagr: cagr != null ? Number((cagr * 100).toFixed(3)) / 100 : null,
        };
        summaryUpdated = true;
      }
    }

    if (summaryUpdated) {
      const nextPayload = { ...(payload || {}), summary };
      await supabaseAdmin
        .from("analytics_snapshots")
        .update({ payload: nextPayload })
        .eq("user_id", userId)
        .eq("as_of_date", snap.as_of_date);
    }

    const normalized = {
      updatedAtIso: snap.as_of_date,
      totalSessions: snap.sessions_count ?? 0,
      totalTrades: snap.trades_count ?? 0,
      wins: summary?.wins ?? null,
      losses: summary?.losses ?? null,
      breakevens: summary?.breakevens ?? null,
      winRate: snap.win_rate ?? 0,
      grossPnl: summary?.grossPnl ?? null,
      netPnl: snap.total_pnl ?? 0,
      totalFees: summary?.totalFees ?? null,
      avgNetPerSession: snap.avg_pnl ?? 0,
      profitFactor: summary?.profitFactor ?? snap.profit_factor ?? null,
      expectancy: summary?.expectancy ?? snap.expectancy ?? 0,
      avgWin: summary?.avgWin ?? null,
      avgLoss: summary?.avgLoss ?? null,
      maxWin: summary?.maxWin ?? snap.best_day_pnl ?? null,
      maxLoss: summary?.maxLoss ?? snap.worst_day_pnl ?? null,
      maxDrawdown: summary?.maxDrawdown ?? (maxDrawdown != null ? Number(maxDrawdown.toFixed(2)) : null),
      maxDrawdownPct: summary?.maxDrawdownPct ?? null,
      longestWinStreak: summary?.longestWinStreak ?? null,
      longestLossStreak: summary?.longestLossStreak ?? null,
      recoveryFactor: summary?.recoveryFactor ?? null,
      sharpe: summary?.sharpe ?? null,
      sortino: summary?.sortino ?? null,
      payoffRatio: summary?.payoffRatio ?? null,
      cagr: summary?.cagr ?? null,
      byHour,
      byDOW,
      bySymbol,
    };

    return NextResponse.json({
      snapshot: normalized,
      topEdges: edges ?? [],
    });
  } catch (err: any) {
    console.error("[analytics/snapshot] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
