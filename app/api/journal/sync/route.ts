import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { applyJournalSessionStatusTags } from "@/lib/journalSessionStatus";

export const runtime = "nodejs";

async function resolveActiveAccountId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.active_account_id ?? null;
}

type SyncBody = {
  date: string; // YYYY-MM-DD
  accountId?: string | null;
};

/* ---------------- helpers ---------------- */

function safeNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// commissions/fees ALWAYS positive cost
function safeCost(v: any): number {
  return Math.abs(safeNum(v));
}

function dayRangeUTC(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function timeHHMMSSFromISO(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(11, 19);
  } catch {
    return "";
  }
}

function calcDTE(tradeDate: string, expiry: string | null): number | null {
  if (!expiry) return null;
  const base = new Date(tradeDate + "T00:00:00Z");
  const exp = new Date(expiry + "T00:00:00Z");
  const diff = Math.round((exp.getTime() - base.getTime()) / 86400000);
  return Number.isFinite(diff) ? diff : null;
}

type StatementSummary = {
  dates?: string[];
  openPositions?: number;
  openPnlDay?: number | null;
  grossPnl?: number | null;
  netPnl?: number | null;
  endingCashBalance?: number | null;
  endingNetLiquidatingValue?: number | null;
  reconciled?: boolean | null;
};

type StatementSnapshot = {
  endingBalance: number | null;
  summary: StatementSummary | null;
};

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function resolveStatementSnapshot(params: {
  userId: string;
  trades: any[];
  startISO: string;
  endISO: string;
}): Promise<StatementSnapshot> {
  const importBatchIds = Array.from(
    new Set(
      params.trades
        .map((trade) => String(trade?.import_batch_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (!importBatchIds.length) return { endingBalance: null, summary: null };

  const { data, error } = await supabaseAdmin
    .from("broker_transactions")
    .select("balance,executed_at,raw")
    .eq("user_id", params.userId)
    .in("import_batch_id", importBatchIds)
    .not("balance", "is", null)
    .gte("executed_at", params.startISO)
    .lt("executed_at", params.endISO)
    .order("executed_at", { ascending: false })
    .limit(1);

  if (error || !data?.length) return { endingBalance: null, summary: null };
  const row = data[0] as any;
  const balance = finiteNumberOrNull(row?.balance);
  const rawSummary = row?.raw?.statementSummary;
  const summary = rawSummary && typeof rawSummary === "object"
    ? (rawSummary as StatementSummary)
    : null;
  return {
    endingBalance: balance == null ? null : Number(balance.toFixed(2)),
    summary,
  };
}

/* ---------------- multipliers ---------------- */

const FUT_MONTH_CODES = "FGHJKMNQUVXZ";

// Expand as you want
const FUTURES_MULTIPLIERS: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
  SI: 5000,
  HG: 25000,
};

function futureRoot(symbol: string) {
  const s0 = (symbol || "").trim().toUpperCase().replace(/^\//, "");
  const s = s0.replace(/\s+/g, "");

  // Common: ESH6, MNQH26, M2KH6, ESZ2025
  const re1 = new RegExp(`^([A-Z0-9]{1,8})([${FUT_MONTH_CODES}])(\\d{1,4})$`);
  const m1 = s.match(re1);
  if (m1) return m1[1];

  // Fallback: take first token
  const m2 = s.match(/^([A-Z0-9]{1,8})/);
  return m2?.[1] ?? s0;
}

function contractMultiplier(kind: string, symbol: string) {
  const k = String(kind || "").toLowerCase();
  if (k === "option") return 100;
  if (k === "future" || k === "futures") {
    const root = futureRoot(symbol);
    return FUTURES_MULTIPLIERS[root] ?? 1;
  }
  return 1;
}

/* ---------------- types ---------------- */

type InstrumentType = "stock" | "option" | "future" | "crypto" | "forex" | "other";
type SideType = "long" | "short";
type PremiumSide = "none" | "debit" | "credit";
type OptionStrategy = "single";

type UiTradeRow = {
  id: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  premiumSide?: PremiumSide;
  optionStrategy?: OptionStrategy;
  price: string;
  quantity: string;
  time: string;
  dte?: number | null;
  expiry?: string | null;
  closureReason?: "expiration";
  inferredFromStatement?: boolean;
  playbookStrategyAssignment?: unknown;
};

function tradeRowSignature(raw: any): string {
  return [
    String(raw?.symbol ?? "").trim().toUpperCase(),
    String(raw?.kind ?? "").trim().toLowerCase(),
    String(raw?.side ?? "").trim().toLowerCase(),
    String(raw?.time ?? "").trim().toUpperCase(),
    String(raw?.price ?? "").trim(),
    String(raw?.quantity ?? "").trim(),
  ].join("|");
}

function restoreStrategyAssignments(rows: UiTradeRow[], previousRows: unknown): UiTradeRow[] {
  if (!Array.isArray(previousRows) || previousRows.length === 0) return rows;
  const queues = new Map<string, any[]>();
  previousRows.forEach((row) => {
    const key = tradeRowSignature(row);
    queues.set(key, [...(queues.get(key) ?? []), row]);
  });
  return rows.map((row) => {
    const key = tradeRowSignature(row);
    const queue = queues.get(key) ?? [];
    const previous = queue.shift();
    queues.set(key, queue);
    return previous?.playbookStrategyAssignment
      ? { ...row, playbookStrategyAssignment: previous.playbookStrategyAssignment }
      : row;
  });
}

/* ---------------- normalize ---------------- */

function normalizeInstrumentType(raw: any): InstrumentType {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("option")) return "option";
  if (s.includes("future")) return "future";
  if (s.includes("stock") || s.includes("equity")) return "stock";
  if (s.includes("crypto")) return "crypto";
  if (s.includes("forex") || s.includes("fx")) return "forex";
  return "other";
}

function normalizeSide(raw: any): "BUY" | "SELL" | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s === "B" || s === "BUY" || s === "BOT") return "BUY";
  if (s === "S" || s === "SELL" || s === "SOLD") return "SELL";
  if (s.includes("BUY")) return "BUY";
  if (s.includes("SELL")) return "SELL";
  if (s.includes("BOT")) return "BUY";
  if (s.includes("SOLD")) return "SELL";
  return null;
}

function fmtQty(n: number) {
  if (!Number.isFinite(n)) return "0";
  // keep integers clean
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(Number(n.toFixed(6)));
}
function fmtPx(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(6)));
}

function premiumFromPosition(kind: InstrumentType, side: SideType): PremiumSide {
  if (kind !== "option") return "none";
  return side === "short" ? "credit" : "debit";
}

function journalPremiumLabel(p: PremiumSide) {
  if (p === "credit") return "Credit";
  if (p === "debit") return "Debit";
  return "—";
}

/* ---------------- FIFO PnL + trade splitting ---------------- */

type Lot = { qty: number; price: number }; // qty signed: +long, -short

function closeLotsFIFO(lots: Lot[], closeQtyAbs: number, closePrice: number, mult: number, sign: 1 | -1) {
  // sign = +1 for closing long lots, -1 for closing short lots
  let realized = 0;
  let remaining = closeQtyAbs;

  while (remaining > 1e-9 && lots.length > 0) {
    const lot = lots[0];
    const lotSign: 1 | -1 = lot.qty >= 0 ? 1 : -1;
    // If data is inconsistent, break (shouldn't happen if we split correctly)
    if (lotSign !== sign) break;

    const lotAbs = Math.abs(lot.qty);
    const used = Math.min(lotAbs, remaining);

    realized += (closePrice - lot.price) * used * mult * sign;

    const newAbs = lotAbs - used;
    if (newAbs <= 1e-9) {
      lots.shift();
    } else {
      lot.qty = sign * newAbs;
    }

    remaining -= used;
  }

  return realized;
}

/* ---------------- route ---------------- */

export async function POST(req: NextRequest) {
  try {
    /* ---------- auth ---------- */
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;

    /* ---------- body ---------- */
    const body = (await req.json()) as SyncBody;
    const date = body?.date;
    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });
    const requestedAccountId = body?.accountId ? String(body.accountId) : "";
    const accountId = requestedAccountId || (await resolveActiveAccountId(userId));

    const { startISO, endISO } = dayRangeUTC(date);

    const applyAccountFilter = (query: any) => {
      if (accountId) return query.eq("account_id", accountId);
      return query.is("account_id", null);
    };

    /* ---------- load trades (fills) ---------- */
    const tradesQuery = applyAccountFilter(
      supabaseAdmin
      .from("trades")
      .select(
        `
        id,
        symbol,
        instrument_type,
        contract_code,
        option_expiration,
        option_strike,
        option_right,
        qty,
        price,
        side,
        executed_at,
        commissions,
        fees,
        import_batch_id
      `
      )
      .eq("user_id", userId)
      .gte("executed_at", startISO)
      .lt("executed_at", endISO)
      .order("executed_at", { ascending: true })
    );

    const { data: trades, error } = await tradesQuery;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!trades || trades.length === 0) {
      const recentQuery = applyAccountFilter(
        supabaseAdmin
          .from("trades")
          .select("executed_at")
          .eq("user_id", userId)
          .order("executed_at", { ascending: false })
          .limit(100)
      );
      const [{ data: recentTrades }, { count: otherAccountCount }] = await Promise.all([
        recentQuery,
        supabaseAdmin
          .from("trades")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("executed_at", startISO)
          .lt("executed_at", endISO)
          .neq("account_id", accountId ?? "00000000-0000-0000-0000-000000000000"),
      ]);
      const availableDates = Array.from(
        new Set(
          (recentTrades ?? [])
            .map((trade: any) => String(trade?.executed_at ?? "").slice(0, 10))
            .filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value))
        )
      ).slice(0, 8);
      return NextResponse.json({
        date,
        account_id: accountId ?? null,
        trades_found: 0,
        entries: [],
        exits: [],
        pnl_gross: 0,
        pnl_net: 0,
        commissions: 0,
        fees: 0,
        available_import_dates: availableDates,
        same_date_other_account_count: otherAccountCount ?? 0,
        message: "No trades found for this date",
      });
    }

    const statementSnapshot = await resolveStatementSnapshot({
      userId,
      trades: trades as any[],
      startISO,
      endISO,
    });
    const statementEndingBalance = statementSnapshot.endingBalance;

    /* ---------- preserve textual notes ---------- */
    const existingNotesQuery = applyAccountFilter(
      supabaseAdmin
      .from("journal_entries")
      .select("notes,tags")
      .eq("user_id", userId)
      .eq("date", date)
    );
    const { data: existing } = await existingNotesQuery.maybeSingle();

    let premarket = "";
    let live = "";
    let post = "";
    let existingNotesPayload: Record<string, unknown> = {};

    if (existing?.notes) {
      try {
        const parsed = JSON.parse(existing.notes);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          existingNotesPayload = parsed as Record<string, unknown>;
        }
        premarket = parsed?.premarket ?? "";
        live = parsed?.live ?? "";
        post = parsed?.post ?? "";
      } catch {
        // ignore
      }
    }

    /* ---------- build entries/exits per-fill with position tracking ---------- */
    const entries: UiTradeRow[] = [];
    const exits: UiTradeRow[] = [];

    // position + lots per contract key
    const posByKey = new Map<string, number>(); // signed qty (+long, -short)
    const lotsByKey = new Map<string, Lot[]>(); // FIFO lots for pnl
    const optionMetaByKey = new Map<string, { symbol: string; expiry: string | null }>();

    let pnlGross = 0;
    let totalCommissions = 0;
    let totalFees = 0;

    for (const t of trades as any[]) {
      const instrumentType = normalizeInstrumentType(t.instrument_type);
      const symbolRaw = String(t.contract_code || t.symbol || "").trim().toUpperCase();
      const symbol = symbolRaw || "UNKNOWN";

      const action = normalizeSide(t.side);
      if (!action) continue;

      const qtyAbs = Math.abs(safeNum(t.qty));
      const px = safeNum(t.price);
      if (!Number.isFinite(qtyAbs) || qtyAbs <= 0 || !Number.isFinite(px) || px === 0) continue;

      const executedAt = String(t.executed_at || "");
      const time = timeHHMMSSFromISO(executedAt);

      const expiry = t.option_expiration ? String(t.option_expiration) : null;
      const dte = instrumentType === "option" ? calcDTE(date, expiry) : null;

      const mult = contractMultiplier(instrumentType, symbol);

      // costs (accumulate, but pnlGross is BEFORE costs)
      totalCommissions += safeCost(t.commissions);
      totalFees += safeCost(t.fees);

      const key = instrumentType === "option" ? symbol : symbol; // keep explicit for future changes
      if (instrumentType === "option") optionMetaByKey.set(key, { symbol, expiry });

      const prevPos = posByKey.get(key) ?? 0;
      const delta = action === "BUY" ? qtyAbs : -qtyAbs;
      const nextPosRaw = prevPos + delta;
      const nextPos = Math.abs(nextPosRaw) < 1e-9 ? 0 : nextPosRaw;

      // ensure lots array exists
      if (!lotsByKey.has(key)) lotsByKey.set(key, []);
      const lots = lotsByKey.get(key)!;

      // helper to push UI rows
      const pushEntry = (side: SideType, q: number) => {
        const premiumSide = premiumFromPosition(instrumentType, side);
        entries.push({
          id: String(t.id) + ":E:" + entries.length,
          symbol,
          kind: instrumentType,
          side,
          premiumSide,
          optionStrategy: instrumentType === "option" ? "single" : undefined,
          price: fmtPx(px),
          quantity: fmtQty(q),
          time,
          dte,
          expiry: expiry,
        });
      };

      const pushExit = (side: SideType, q: number) => {
        const premiumSide = premiumFromPosition(instrumentType, side);
        exits.push({
          id: String(t.id) + ":X:" + exits.length,
          symbol,
          kind: instrumentType,
          side,
          premiumSide,
          optionStrategy: instrumentType === "option" ? "single" : undefined,
          price: fmtPx(px),
          quantity: fmtQty(q),
          time,
          dte,
          expiry: expiry,
        });
      };

      // Split logic (objective):
      // prevPos > 0 => currently long
      // prevPos < 0 => currently short
      // delta > 0 => buy
      // delta < 0 => sell
      if (prevPos === 0) {
        // pure open
        if (delta > 0) {
          pushEntry("long", qtyAbs);
          lots.push({ qty: qtyAbs, price: px });
        } else {
          pushEntry("short", qtyAbs);
          lots.push({ qty: -qtyAbs, price: px });
        }
      } else if (prevPos > 0) {
        if (delta > 0) {
          // add to long
          pushEntry("long", qtyAbs);
          lots.push({ qty: qtyAbs, price: px });
        } else {
          // sell: close some/all long, maybe flip to short
          const closeQty = Math.min(prevPos, Math.abs(delta));
          if (closeQty > 0) {
            pushExit("long", closeQty);
            pnlGross += closeLotsFIFO(lots, closeQty, px, mult, +1);
          }
          const rem = Math.abs(delta) - closeQty;
          if (rem > 1e-9) {
            // flipped to short
            pushEntry("short", rem);
            lots.push({ qty: -rem, price: px });
          }
        }
      } else {
        // prevPos < 0 (short)
        const prevAbs = Math.abs(prevPos);
        if (delta < 0) {
          // sell more: add to short
          pushEntry("short", qtyAbs);
          lots.push({ qty: -qtyAbs, price: px });
        } else {
          // buy: close some/all short, maybe flip to long
          const closeQty = Math.min(prevAbs, delta);
          if (closeQty > 0) {
            pushExit("short", closeQty);
            pnlGross += closeLotsFIFO(lots, closeQty, px, mult, -1);
          }
          const rem = delta - closeQty;
          if (rem > 1e-9) {
            pushEntry("long", rem);
            lots.push({ qty: rem, price: px });
          }
        }
      }

      posByKey.set(key, nextPos);
      if (nextPos === 0) {
        // Reset lots when flat so new trades aren't treated as averaging down.
        lotsByKey.set(key, []);
      }
    }

    const statementSummary = statementSnapshot.summary;
    const statementOpenPositions = Number(statementSummary?.openPositions ?? 0);
    const endingCash = finiteNumberOrNull(statementSummary?.endingCashBalance);
    const endingNetLiquidatingValue = finiteNumberOrNull(
      statementSummary?.endingNetLiquidatingValue
    );
    const residualPositionValue =
      endingCash != null && endingNetLiquidatingValue != null
        ? Number((endingNetLiquidatingValue - endingCash).toFixed(2))
        : null;
    const expiredOptionKeys = Array.from(posByKey.entries()).filter(([key, position]) => {
      const meta = optionMetaByKey.get(key);
      return Math.abs(position) > 1e-9 && !!meta?.expiry && meta.expiry <= date;
    });
    const canInferExpiration =
      statementOpenPositions > 0 &&
      statementSummary?.reconciled === true &&
      statementOpenPositions === expiredOptionKeys.length &&
      residualPositionValue != null &&
      (expiredOptionKeys.length === 1 || Math.abs(residualPositionValue) <= 0.05);

    if (canInferExpiration) {
      for (const [key, position] of expiredOptionKeys) {
        const meta = optionMetaByKey.get(key)!;
        const qty = Math.abs(position);
        const sign: 1 | -1 = position > 0 ? 1 : -1;
        const settlementPrice =
          expiredOptionKeys.length === 1
            ? Math.max(0, (residualPositionValue! * sign) / (qty * 100))
            : 0;
        const lots = lotsByKey.get(key) ?? [];
        pnlGross += closeLotsFIFO(lots, qty, settlementPrice, 100, sign);
        exits.push({
          id: `statement-expiration:${date}:${key}`,
          symbol: meta.symbol,
          kind: "option",
          side: sign > 0 ? "long" : "short",
          premiumSide: sign > 0 ? "debit" : "credit",
          optionStrategy: "single",
          price: fmtPx(settlementPrice),
          quantity: fmtQty(qty),
          time: "16:00:00",
          dte: calcDTE(date, meta.expiry),
          expiry: meta.expiry,
          closureReason: "expiration",
          inferredFromStatement: true,
        });
        posByKey.set(key, 0);
        lotsByKey.set(key, []);
      }
    }

    pnlGross = Number(pnlGross.toFixed(2));
    totalCommissions = Number(totalCommissions.toFixed(2));
    totalFees = Number(totalFees.toFixed(2));
    let pnlNet = Number((pnlGross - totalCommissions - totalFees).toFixed(2));
    const statementGrossPnl = finiteNumberOrNull(statementSummary?.grossPnl);
    const statementNetPnl = finiteNumberOrNull(statementSummary?.netPnl);
    const useStatementPnl =
      statementOpenPositions > 0 &&
      statementSummary?.reconciled === true &&
      statementGrossPnl != null &&
      statementNetPnl != null;
    if (useStatementPnl) {
      pnlGross = Number(statementGrossPnl.toFixed(2));
      pnlNet = Number(statementNetPnl.toFixed(2));
    }

    /* ---------- prepare journal_trades ---------- */
    const jtRows = [
      ...entries.map((r) => ({
        user_id: userId,
        account_id: accountId ?? null,
        journal_date: date,
        leg: "entry",
        symbol: String(r.symbol ?? "").trim(),
        kind: String(r.kind ?? "other"),
        side: String(r.side ?? "long"),
        premium: journalPremiumLabel(r.premiumSide ?? "none"),
        strategy: r.kind === "option" ? "Single / naked" : "—",
        price: safeNum(r.price),
        quantity: safeNum(r.quantity),
        time: String(r.time ?? ""),
        dte: r.dte ?? null,
        emotions: null,
        strategy_checklist: null,
      })),
      ...exits.map((r) => ({
        user_id: userId,
        account_id: accountId ?? null,
        journal_date: date,
        leg: "exit",
        symbol: String(r.symbol ?? "").trim(),
        kind: String(r.kind ?? "other"),
        side: String(r.side ?? "long"),
        premium: journalPremiumLabel(r.premiumSide ?? "none"),
        strategy: r.kind === "option" ? "Single / naked" : "—",
        price: safeNum(r.price),
        quantity: safeNum(r.quantity),
        time: String(r.time ?? ""),
        dte: r.dte ?? null,
        emotions: null,
        strategy_checklist: null,
      })),
    ].filter((x) => x.symbol);

    /* ---------- write notes (keep the same shape the UI uses) ---------- */
    const entriesWithStrategy = restoreStrategyAssignments(
      entries,
      existingNotesPayload.entries
    );
    const notes = JSON.stringify({
      ...existingNotesPayload,
      session_status: "traded",
      premarket,
      live,
      post,
      entries: entriesWithStrategy,
      exits,
      costs: {
        commissions: totalCommissions,
        fees: totalFees,
      },
      pnl: {
        gross: pnlGross,
        net: pnlNet,
        source: useStatementPnl ? "broker_statement_reconciled" : "fills_fifo",
      },
      ...(statementSummary
        ? {
            broker_reconciliation: {
              openPositions: statementOpenPositions,
              openPnlDay: finiteNumberOrNull(statementSummary.openPnlDay),
              inferredExpirationExits: canInferExpiration ? expiredOptionKeys.length : 0,
              reconciled: statementSummary.reconciled ?? null,
            },
          }
        : {}),
      ...(statementEndingBalance != null
        ? {
            account_balance: {
              endingBalance: statementEndingBalance,
              asOfDate: date,
              source: "broker_statement",
            },
          }
        : {}),
      synced_at: new Date().toISOString(),
    });

    /* ---------- persist the summary and fills atomically ---------- */
    // Store NET PnL in journal_entries.pnl so analytics & summaries match the broker.
    // The database function replaces the journal summary and fill rows in one transaction.
    const { error: journalEntryError } = await supabaseAdmin.rpc("ntj_save_journal_day", {
      p_user_id: userId,
      p_account_id: accountId ?? null,
      p_date: date,
      p_entry: {
          user_id: userId,
          account_id: accountId ?? null,
          date,
          pnl: pnlNet,
          instrument: entries[0]?.symbol ?? "UNKNOWN",
          direction: (entries[0]?.side ?? "long") as any,
          entry_price: entries[0]?.price ? safeNum(entries[0].price) : null,
          exit_price: exits[0]?.price ? safeNum(exits[0].price) : null,
          size: entries[0]?.quantity ? safeNum(entries[0].quantity) : null,
          notes,
          tags: applyJournalSessionStatusTags((existing as any)?.tags, "traded"),
          respected_plan: true,
        },
      p_trades: jtRows,
    });
    if (journalEntryError) {
      return NextResponse.json({ error: journalEntryError.message }, { status: 500 });
    }

    return NextResponse.json({
      date,
      account_id: accountId ?? null,
      trades_found: trades.length,
      entries_count: entries.length,
      exits_count: exits.length,
      groups: new Set([...entries, ...exits].map((row) => `${row.symbol}:${row.kind}`)).size,
      updated: jtRows.length,
      pnl_gross: pnlGross,
      pnl_net: pnlNet,
      commissions: totalCommissions,
      fees: totalFees,
      ending_balance: statementEndingBalance,
      pnl_source: useStatementPnl ? "broker_statement_reconciled" : "fills_fifo",
      inferred_expiration_exits: canInferExpiration ? expiredOptionKeys.length : 0,
      entries,
      exits,
      message: "Journal synced successfully (fills-level + futures multipliers).",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
