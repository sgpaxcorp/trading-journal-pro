// app/api/analytics/rebuild/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { buildSnapshotAndEdges, type SessionRow, type TradeRow } from "@/lib/analyticsEngine";

export const runtime = "nodejs";

/**
 * ⚠️ AJUSTA ESTOS NOMBRES SEGÚN TU DB REAL
 * - Si tus trades están en JSON dentro de notes, pon JOURNAL_TABLE y NOTES_COLUMN.
 * - Si tienes tabla separada de trades, modifica fetchSessions().
 */
const JOURNAL_TABLE = "journal_entries";     // <- CAMBIA si tu tabla se llama distinto
const USER_ID_COL = "user_id";              // <- col del owner
const DATE_COL = "date";                    // <- "YYYY-MM-DD"
const PNL_COL = "pnl";                      // <- numeric
const NOTES_COL = "notes";                  // <- string JSON {entries:[], exits:[]}
const TAGS_COL = "tags";                    // <- text[] opcional
const PLAN_COL = "respectedPlan";           // <- boolean opcional (ajusta si es respected_plan)
const EMOTIONS_COL = "emotions";            // <- text[] opcional

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

async function fetchSessions(userId: string): Promise<SessionRow[]> {
  // Ajusta el select según tu tabla real
  const { data, error } = await supabaseAdmin
    .from(JOURNAL_TABLE)
    .select(`${DATE_COL}, ${PNL_COL}, ${NOTES_COL}, ${TAGS_COL}, ${PLAN_COL}, ${EMOTIONS_COL}`)
    .eq(USER_ID_COL, userId)
    .order(DATE_COL, { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as any[];
  const out: SessionRow[] = rows.map((r) => {
    const date = String(r[DATE_COL] ?? "");
    const pnl = Number(r[PNL_COL] ?? 0);

    const { entries, exits } = parseNotesTrades(r[NOTES_COL]);

    const ent = (entries || []).map(toTradeRow).filter(Boolean) as TradeRow[];
    const ex = (exits || []).map(toTradeRow).filter(Boolean) as TradeRow[];

    const tags = Array.isArray(r[TAGS_COL]) ? (r[TAGS_COL] as string[]) : null;
    const emotions = Array.isArray(r[EMOTIONS_COL]) ? (r[EMOTIONS_COL] as string[]) : null;

    const respectedPlan =
      r[PLAN_COL] == null ? null : Boolean(r[PLAN_COL]);

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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    }

    // Validate user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = authData.user.id; // UUID from Supabase Auth
    const body = await req.json().catch(() => ({}));

    const asOfDate = typeof body?.asOfDate === "string" ? body.asOfDate : undefined;
    const rangeStart = typeof body?.rangeStart === "string" ? body.rangeStart : null;
    const rangeEnd = typeof body?.rangeEnd === "string" ? body.rangeEnd : null;

    const sessions = await fetchSessions(userId);

    const { snapshot, edges } = buildSnapshotAndEdges({
      sessions,
      asOfDate,
      rangeStart,
      rangeEnd,
      maxEdgesToStore: 1500,
    });

    // 1) Upsert snapshot
    const { error: snapErr } = await supabaseAdmin
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

    if (snapErr) throw snapErr;

    // 2) Replace edges for that date (fast + avoids conflict issues)
    const { error: delErr } = await supabaseAdmin
      .from("analytics_edges")
      .delete()
      .eq("user_id", userId)
      .eq("as_of_date", snapshot.as_of_date);

    if (delErr) throw delErr;

    // 3) Insert edges in batches
    const batchSize = 500;
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize).map((e) => ({
        user_id: userId,
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

      const { error: insErr } = await supabaseAdmin
        .from("analytics_edges")
        .insert(batch);

      if (insErr) throw insErr;
    }

    return NextResponse.json({
      ok: true,
      userId,
      snapshotDate: snapshot.as_of_date,
      sessions: snapshot.sessions_count,
      edgesInserted: edges.length,
    });
  } catch (err: any) {
    console.error("[analytics/rebuild] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
