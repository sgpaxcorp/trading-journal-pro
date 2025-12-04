// lib/tradingStats.ts
import type { JournalEntry } from "@/lib/journalLocal";

/** Tipos de trade soportados */
export type TradeKind =
  | "stock"
  | "option"
  | "future"
  | "crypto"
  | "forex"
  | "other";

export type TradeDirection = "long" | "short";

/** Trade row guardado en notes */
export type TradeRow = {
  id: string;
  symbol: string;       // ej. TSLA, SPX 6990, ESU5
  kind: TradeKind;      // stock/option/future/etc
  direction: TradeDirection;
  price: number;        // entry o exit price
  quantity: number;     // contratos/acciones
  time: string;         // "HH:MM" or "09:35 AM"
  entryId?: string;     // en exits, referencia a entry.id
};

/** Multiplicadores por instrumento (ajústalos a tu gusto) */
export const KIND_MULTIPLIERS: Record<TradeKind, number> = {
  stock: 1,        // $1 por punto (acciones)
  option: 100,     // opciones US = 100 shares
  future: 50,      // ejemplo ES = $50 x punto (ajusta)
  crypto: 1,
  forex: 1,
  other: 1,
};

/** Normaliza símbolo */
export function normSymbol(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

export function makePosKey(symbol: string, kind: TradeKind, direction: TradeDirection) {
  return `${normSymbol(symbol)}__${kind}__${direction}`;
}

/**
 * Calcula PnL por posición basado en entries/exits.
 * - Weighted average entry & exit
 * - direction: long => (exit-avgEntry), short => (avgEntry-exit)
 */
export function computePnLByPosition(
  entryTrades: TradeRow[],
  exitTrades: TradeRow[]
) {
  // agrupar entries por posición
  const entriesByKey: Record<string, TradeRow[]> = {};
  for (const e of entryTrades) {
    const symbol = normSymbol(e.symbol);
    if (!symbol) continue;
    const key = makePosKey(symbol, e.kind, e.direction);
    if (!entriesByKey[key]) entriesByKey[key] = [];
    entriesByKey[key].push({ ...e, symbol });
  }

  // agrupar exits por key usando el entryId o la misma key
  const exitsByKey: Record<string, TradeRow[]> = {};
  for (const x of exitTrades) {
    const symbol = normSymbol(x.symbol);
    if (!symbol) continue;
    const key = makePosKey(symbol, x.kind, x.direction);
    if (!exitsByKey[key]) exitsByKey[key] = [];
    exitsByKey[key].push({ ...x, symbol });
  }

  const positions = Object.keys(entriesByKey);

  type PosResult = {
    key: string;
    symbol: string;
    kind: TradeKind;
    direction: TradeDirection;
    entryQty: number;
    exitQty: number;
    avgEntry: number;
    avgExit: number;
    multiplier: number;
    pnl: number;
    openQty: number;
  };

  const results: PosResult[] = [];

  for (const key of positions) {
    const ent = entriesByKey[key];
    const ex = exitsByKey[key] || [];

    const symbol = ent[0].symbol;
    const kind = ent[0].kind;
    const direction = ent[0].direction;

    const entryQty = ent.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const exitQty = ex.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

    const avgEntry =
      entryQty > 0
        ? ent.reduce((s, r) => s + (r.price * r.quantity), 0) / entryQty
        : 0;

    const avgExit =
      exitQty > 0
        ? ex.reduce((s, r) => s + (r.price * r.quantity), 0) / exitQty
        : 0;

    const multiplier = KIND_MULTIPLIERS[kind] ?? 1;

    const perUnit =
      direction === "short" ? (avgEntry - avgExit) : (avgExit - avgEntry);

    const pnl = perUnit * exitQty * multiplier;

    results.push({
      key,
      symbol,
      kind,
      direction,
      entryQty,
      exitQty,
      avgEntry,
      avgExit,
      multiplier,
      pnl,
      openQty: Math.max(0, entryQty - exitQty),
    });
  }

  const total = results.reduce((s, r) => s + r.pnl, 0);

  return { total, positions: results };
}

/**
 * Agrega stats por ticker (para Analytics Instruments).
 * Lee entries/exits desde notes JSON.
 */
export function aggregateByTicker(entries: JournalEntry[]) {
  type Acc = {
    symbol: string;
    kind: TradeKind;
    sessions: number;
    wins: number;
    losses: number;
    sumPnl: number;
  };

  const map: Record<string, Acc> = {};

  for (const e of entries) {
    const pnl = Number(e.pnl ?? 0);

    // intenta leer trades desde notes
    let trades: { entries?: TradeRow[]; exits?: TradeRow[] } | null = null;
    try {
      const parsed = JSON.parse(String(e.notes ?? "{}"));
      if (parsed && typeof parsed === "object") trades = parsed;
    } catch {}

    const allSymbols: { symbol: string; kind: TradeKind }[] = [];

    (trades?.entries || []).forEach((t) => {
      const symbol = normSymbol(t.symbol);
      if (!symbol) return;
      allSymbols.push({ symbol, kind: t.kind || "other" });
    });
    (trades?.exits || []).forEach((t) => {
      const symbol = normSymbol(t.symbol);
      if (!symbol) return;
      allSymbols.push({ symbol, kind: t.kind || "other" });
    });

    // si no hay trades, fallback a instrument
    if (allSymbols.length === 0 && e.instrument) {
      allSymbols.push({ symbol: normSymbol(e.instrument), kind: "other" });
    }

    // registra 1 sesión por símbolo/kind
    const uniq = new Set(allSymbols.map((x) => `${x.symbol}__${x.kind}`));

    for (const u of uniq) {
      const [symbol, kindStr] = u.split("__");
      const kind = (kindStr as TradeKind) || "other";
      const k = `${symbol}__${kind}`;

      if (!map[k]) {
        map[k] = {
          symbol,
          kind,
          sessions: 0,
          wins: 0,
          losses: 0,
          sumPnl: 0,
        };
      }

      map[k].sessions += 1;
      map[k].sumPnl += pnl;
      if (pnl > 0) map[k].wins += 1;
      if (pnl < 0) map[k].losses += 1;
    }
  }

  const items = Object.values(map).map((a) => {
    const winRate = a.sessions > 0 ? (a.wins / a.sessions) * 100 : 0;
    const avgPnl = a.sessions > 0 ? a.sumPnl / a.sessions : 0;
    return { ...a, winRate, avgPnl };
  });

  items.sort((a, b) => b.winRate - a.winRate);

  const mostSupportive = items.filter((i) => i.sessions >= 3).slice(0, 5);
  const toReview = items.filter((i) => i.sessions >= 3).slice(-5);

  return { items, mostSupportive, toReview };
}
