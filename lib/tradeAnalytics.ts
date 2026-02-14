// lib/tradeAnalytics.ts
// Shared trade analytics + KPI trade mapping (adapted from analytics-statistics page).

import type { InstrumentType } from "@/lib/journalNotes";
import type { Trade as KPITrade } from "@/lib/kpiLibrary";

export type JournalTradeRow = {
  journal_date: string;
  leg: string;
  symbol: string | null;
  kind: string | null;
  side: string | null;
  premium: string | null;
  strategy: string | null;
  price: number | null;
  quantity: number | null;
  time: string | null;
};

export type MatchedTrade = {
  date: string;
  symbol: string;
  kind: InstrumentType;
  side: "long" | "short";
  premium: "credit" | "debit" | "none";
  entryTimeMin: number | null;
  exitTimeMin: number | null;
  durationMin: number | null;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
};

export type TradeAnalytics = {
  matchedTrades: MatchedTrade[];
  tradeCount: number;
  tradeDays: number;
  hourBuckets: Array<{ hour: string; pnl: number; trades: number; winRate: number }>;
  hold: {
    avgHoldMins: number | null;
    medianHoldMins: number | null;
    minHoldMins: number | null;
    maxHoldMins: number | null;
    avgHoldWinMins: number | null;
    avgHoldLossMins: number | null;
    totalHoldHours: number | null;
  };
  avgPnlPerTrade: number | null;
  pnlPerHour: number | null;
};

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

const FUT_MONTH_CODES = "FGHJKMNQUVXZ";

function futureRoot(symbol: string) {
  const s0 = (symbol || "").trim().toUpperCase().replace(/^\//, "");
  const s = s0.replace(/\s+/g, "");
  const re1 = new RegExp(`^([A-Z0-9]{1,8})([${FUT_MONTH_CODES}])(\\d{1,4})$`);
  const m1 = s.match(re1);
  if (m1) return m1[1];
  const m2 = s.match(/^([A-Z0-9]{1,8})/);
  return m2?.[1] ?? s0;
}

function normalizeKind(kindRaw?: string | null): InstrumentType {
  const v = String(kindRaw ?? "").trim().toLowerCase();
  if (v.startsWith("opt")) return "option";
  if (v.startsWith("fut")) return "future";
  if (v.startsWith("sto")) return "stock";
  if (v.startsWith("cry")) return "crypto";
  if (v.startsWith("for")) return "forex";
  return "other";
}

function normalizeSide(sideRaw?: string | null): "long" | "short" {
  const v = String(sideRaw ?? "").trim().toLowerCase();
  return v === "short" ? "short" : "long";
}

function normalizePremiumSide(kind: InstrumentType, premiumRaw?: string | null): "credit" | "debit" | "none" {
  if (kind !== "option") return "none";
  const v = String(premiumRaw ?? "").trim().toLowerCase();
  if (v.startsWith("cr")) return "credit";
  if (v.startsWith("de")) return "debit";
  return "debit";
}

function pnlSign(kind: InstrumentType, side: "long" | "short", premium: "credit" | "debit" | "none"): number {
  if (kind === "option") return premium === "credit" ? -1 : 1;
  return side === "short" ? -1 : 1;
}

function getContractMultiplier(kind: InstrumentType, symbol: string) {
  if (kind === "option") return 100;
  if (kind === "future") {
    const root = futureRoot(symbol);
    return FUTURES_MULTIPLIERS[root] ?? 1;
  }
  return 1;
}

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNumberMaybe(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = keyFn(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

function parseClockToMinutes(raw?: string | null): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(min)) return null;
  const ampm = m[4]?.toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return hour * 60 + min;
}

function hourLabelFromMinutes(mins: number | null): string | null {
  if (mins == null || !Number.isFinite(mins)) return null;
  const h = Math.floor(mins / 60);
  if (!Number.isFinite(h)) return null;
  return `${String(h).padStart(2, "0")}:00`;
}

function dateTimeFromDateAndMinutes(date: string, mins: number | null): string | null {
  if (!date) return null;
  if (mins == null) return `${date}T00:00:00`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${date}T${hh}:${mm}:00`;
}

export function computeTradeAnalytics(
  tradeRows: JournalTradeRow[],
  sessions: Array<{ date: string; pnlNet: number }>
): TradeAnalytics {
  if (!tradeRows || tradeRows.length === 0) {
    return {
      matchedTrades: [],
      tradeCount: 0,
      tradeDays: 0,
      hourBuckets: [],
      hold: {
        avgHoldMins: null,
        medianHoldMins: null,
        minHoldMins: null,
        maxHoldMins: null,
        avgHoldWinMins: null,
        avgHoldLossMins: null,
        totalHoldHours: null,
      },
      avgPnlPerTrade: null,
      pnlPerHour: null,
    };
  }

  const dailyNet = new Map<string, number>();
  for (const s of sessions ?? []) {
    if (!s.date) continue;
    dailyNet.set(s.date, toNumberMaybe(s.pnlNet));
  }

  const rowsByDate = groupBy(tradeRows, (r) => r.journal_date || (r as any).date || "");
  const matchedTrades: MatchedTrade[] = [];

  for (const [date, rows] of Object.entries(rowsByDate)) {
    const entries = rows.filter((r) => !String(r.leg ?? "").toLowerCase().includes("exit"));
    const exits = rows.filter((r) => String(r.leg ?? "").toLowerCase().includes("exit"));

    const entryLots: Record<string, Array<{
      qtyLeft: number;
      price: number;
      timeMin: number | null;
      symbol: string;
      kind: InstrumentType;
      side: "long" | "short";
      premium: "credit" | "debit" | "none";
    }>> = {};

    for (const e of entries) {
      const symbol = String(e.symbol ?? "").trim().toUpperCase();
      if (!symbol) continue;
      const kind = normalizeKind(e.kind);
      const side = normalizeSide(e.side);
      const premium = normalizePremiumSide(kind, e.premium);
      const price = toNumberOrNull(e.price);
      const qty = toNumberOrNull(e.quantity);
      if (price == null || qty == null || qty <= 0) continue;
      const timeMin = parseClockToMinutes(e.time);
      const key = `${symbol}|${kind}|${side}|${premium}`;
      entryLots[key] ||= [];
      entryLots[key].push({ qtyLeft: qty, price, timeMin, symbol, kind, side, premium });
    }

    const sortedExits = exits.slice().sort((a, b) => {
      const ta = parseClockToMinutes(a.time);
      const tb = parseClockToMinutes(b.time);
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return ta - tb;
    });

    const matches: MatchedTrade[] = [];
    for (const x of sortedExits) {
      const symbol = String(x.symbol ?? "").trim().toUpperCase();
      if (!symbol) continue;
      const kind = normalizeKind(x.kind);
      const side = normalizeSide(x.side);
      const premium = normalizePremiumSide(kind, x.premium);
      const exitPrice = toNumberOrNull(x.price);
      let exitQty = toNumberOrNull(x.quantity);
      if (exitPrice == null || exitQty == null || exitQty <= 0) continue;
      const exitTimeMin = parseClockToMinutes(x.time);

      const key = `${symbol}|${kind}|${side}|${premium}`;
      const lots = entryLots[key];
      if (!lots || lots.length === 0) continue;

      const sign = pnlSign(kind, side, premium);
      const mult = getContractMultiplier(kind, symbol);

      while (exitQty > 0 && lots.length > 0) {
        const lot = lots[0];
        const closeQty = Math.min(lot.qtyLeft, exitQty);
        const pnl = (exitPrice - lot.price) * closeQty * sign * mult;
        const durationMin =
          lot.timeMin != null && exitTimeMin != null && exitTimeMin >= lot.timeMin
            ? exitTimeMin - lot.timeMin
            : null;

        matches.push({
          date,
          symbol,
          kind,
          side,
          premium,
          entryTimeMin: lot.timeMin,
          exitTimeMin,
          durationMin,
          qty: closeQty,
          entryPrice: lot.price,
          exitPrice,
          pnl,
        });

        lot.qtyLeft -= closeQty;
        exitQty -= closeQty;
        if (lot.qtyLeft <= 0) lots.shift();
      }
    }

    const computedNet = matches.reduce((s, t) => s + toNumberMaybe(t.pnl), 0);
    const dailyTarget = toNumberOrNull(dailyNet.get(date));
    if (dailyTarget != null && dailyTarget !== 0) {
      if (computedNet !== 0) {
        const scale = dailyTarget / computedNet;
        matches.forEach((t) => {
          t.pnl = Number((t.pnl * scale).toFixed(4));
        });
      } else {
        const totalQty = matches.reduce((s, t) => s + t.qty, 0) || 0;
        if (totalQty > 0) {
          matches.forEach((t) => {
            t.pnl = Number((dailyTarget * (t.qty / totalQty)).toFixed(4));
          });
        }
      }
    }

    matchedTrades.push(...matches);
  }

  const hourBucketsMap: Record<string, { pnl: number; trades: number; wins: number; losses: number }> = {};
  for (const t of matchedTrades) {
    const hour = hourLabelFromMinutes(t.exitTimeMin);
    if (!hour) continue;
    if (!hourBucketsMap[hour]) {
      hourBucketsMap[hour] = { pnl: 0, trades: 0, wins: 0, losses: 0 };
    }
    hourBucketsMap[hour].pnl += toNumberMaybe(t.pnl);
    hourBucketsMap[hour].trades += 1;
    if (t.pnl > 0) hourBucketsMap[hour].wins += 1;
    else if (t.pnl < 0) hourBucketsMap[hour].losses += 1;
  }

  const hourBuckets = Object.entries(hourBucketsMap)
    .map(([hour, b]) => {
      const denom = b.wins + b.losses;
      const winRate = denom > 0 ? (b.wins / denom) * 100 : 0;
      return { hour, pnl: b.pnl, trades: b.trades, winRate };
    })
    .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0));

  const durations = matchedTrades
    .map((t) => t.durationMin)
    .filter((n): n is number => n != null && Number.isFinite(n));

  const winDurations = matchedTrades
    .filter((t) => t.pnl > 0 && t.durationMin != null)
    .map((t) => t.durationMin as number);
  const lossDurations = matchedTrades
    .filter((t) => t.pnl < 0 && t.durationMin != null)
    .map((t) => t.durationMin as number);

  const avgHoldMins = durations.length ? mean(durations) : null;
  const medianHoldMins = durations.length ? median(durations) : null;
  const minHoldMins = durations.length ? Math.min(...durations) : null;
  const maxHoldMins = durations.length ? Math.max(...durations) : null;
  const avgHoldWinMins = winDurations.length ? mean(winDurations) : null;
  const avgHoldLossMins = lossDurations.length ? mean(lossDurations) : null;

  const totalHoldHours = durations.length ? sum(durations) / 60 : null;
  const totalNetPnl = matchedTrades.reduce((s, t) => s + toNumberMaybe(t.pnl), 0);
  const avgPnlPerTrade = matchedTrades.length ? totalNetPnl / matchedTrades.length : null;
  const pnlPerHour = totalHoldHours && totalHoldHours > 0 ? totalNetPnl / totalHoldHours : null;

  const tradeDays = new Set(matchedTrades.map((t) => t.date)).size;

  return {
    matchedTrades,
    tradeCount: matchedTrades.length,
    tradeDays,
    hourBuckets,
    hold: {
      avgHoldMins,
      medianHoldMins,
      minHoldMins,
      maxHoldMins,
      avgHoldWinMins,
      avgHoldLossMins,
      totalHoldHours,
    },
    avgPnlPerTrade,
    pnlPerHour,
  };
}

export function buildKpiTrades(tradeStats?: TradeAnalytics | null): KPITrade[] {
  const matched = tradeStats?.matchedTrades ?? [];
  return matched
    .map((t, idx) => {
      const entryTime = dateTimeFromDateAndMinutes(t.date, t.entryTimeMin);
      const exitTime = dateTimeFromDateAndMinutes(t.date, t.exitTimeMin);
      if (!entryTime || !exitTime) return null;

      return {
        trade_id: `${t.date}-${t.symbol}-${idx}`,
        symbol: t.symbol,
        asset_class: t.kind,
        side: t.side,
        quantity: t.qty,
        entry_time: entryTime,
        exit_time: exitTime,
        entry_price: t.entryPrice,
        exit_price: t.exitPrice,
        realized_pnl: t.pnl,
        fees_commissions: null,
        planned_risk: null,
      } as KPITrade;
    })
    .filter(Boolean) as KPITrade[];
}
