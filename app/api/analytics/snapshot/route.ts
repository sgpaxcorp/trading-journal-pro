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
  const msg = String(err.message || "").toLowerCase();
  if (!msg) return false;
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
    const missingCritical =
      !snap ||
      snap.sessions_count == null ||
      snap.trades_count == null ||
      snap.total_pnl == null ||
      snap.payload == null ||
      (snap.sessions_count === 0 && snap.trades_count === 0 && snap.total_pnl === 0);

    if (!snap || missingCritical || force) {
      const sessions = await fetchSessions(userId, email, accountId);
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
        ? Math.min(...drawdownCurve.map((d: any) => Number(d?.value ?? 0)))
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

    const byHour = Array.from(byHourMap.entries()).map(([hour, agg]) => ({
      hour,
      pnl: Number(agg.pnl.toFixed(2)),
      trades: agg.trades,
      winRate: agg.sessions ? Number((agg.winRateSum / agg.sessions).toFixed(2)) : 0,
    }));

    const byDOW = Array.from(byDowMap.entries()).map(([dow, agg]) => ({
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

    const normalized = {
      updatedAtIso: snap.as_of_date,
      totalSessions: snap.sessions_count ?? 0,
      totalTrades: snap.trades_count ?? 0,
      winRate: snap.win_rate ?? 0,
      netPnl: snap.total_pnl ?? 0,
      avgNetPerSession: snap.avg_pnl ?? 0,
      profitFactor: snap.profit_factor ?? null,
      expectancy: snap.expectancy ?? 0,
      maxWin: snap.best_day_pnl ?? null,
      maxLoss: snap.worst_day_pnl ?? null,
      maxDrawdown: maxDrawdown != null ? Number(maxDrawdown.toFixed(2)) : null,
      maxDrawdownPct: null,
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
