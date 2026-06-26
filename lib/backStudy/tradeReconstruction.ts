import type { InstrumentType } from "@/lib/journalNotes";

export type BackStudySide = "long" | "short";

export type BackStudyTradeRow = {
  id?: string;
  symbol: string;
  kind: InstrumentType;
  side: BackStudySide;
  price: string | number;
  quantity: string | number;
  time: string;
  dte?: number | null;
  expiry?: string | null;
  premiumSide?: string | null;
  optionStrategy?: string | null;
  instrumentKey?: string | null;
  right?: string | null;
  strike?: number | null;
};

export type BackStudySessionWithTrades = {
  date: string;
  entries: BackStudyTradeRow[];
  exits: BackStudyTradeRow[];
};

export type BackStudyTradeView = {
  id: string;
  sequence: number;
  date: string;
  symbol: string;
  kind: InstrumentType;
  entryTime: string;
  exitTime: string;
  entryPrice: number | null;
  exitPrice: number | null;
  entryAvgPrice: number | null;
  exitAvgPrice: number | null;
  entryQty: number;
  exitQty: number;
  entries: BackStudyTradeRow[];
  exits: BackStudyTradeRow[];
  underlyingSymbol: string;
  contractSymbol?: string;
  sourceRowIds: string[];
  instrumentKey: string | null;
  instrumentKeySource: "row" | "symbol" | "row_fields" | null;
  instrumentKeyAmbiguous: boolean;
};

type ParsedOptionSymbol = {
  underlying: string;
  expiry: Date;
  right: "C" | "P";
  strike: number;
};

function safeUpper(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

function normalizeSide(raw: unknown): BackStudySide {
  const s = String(raw ?? "").toLowerCase();
  return s === "short" ? "short" : "long";
}

function normalizeRight(raw: unknown): "C" | "P" | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "C" || s === "CALL") return "C";
  if (s === "P" || s === "PUT") return "P";
  return null;
}

function normalizeKind(raw: unknown): InstrumentType {
  const s = String(raw ?? "stock").trim().toLowerCase();
  if (s === "option" || s === "future" || s === "crypto" || s === "forex" || s === "stock" || s === "other") {
    return s as InstrumentType;
  }
  return "stock" as InstrumentType;
}

function normalizeExpiry(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function toNumber(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatStrike(raw: number): string {
  return Number.isInteger(raw) ? String(raw) : String(raw).replace(/0+$/, "").replace(/\.$/, "");
}

function parseYyMmDd(raw: string): Date | null {
  const yy = Number(raw.slice(0, 2));
  const mm = Number(raw.slice(2, 4));
  const dd = Number(raw.slice(4, 6));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
  const expiry = new Date(Date.UTC(2000 + yy, mm - 1, dd));
  return Number.isFinite(expiry.getTime()) ? expiry : null;
}

export function parseOptionSymbol(raw: string): ParsedOptionSymbol | null {
  const compact = safeUpper(raw).replace(/^[.\-/]/, "").replace(/\s+/g, "");
  if (!compact) return null;

  const occ = compact.match(/^([A-Z]{1,6}W?)(\d{6})([CP])(\d{8})$/);
  if (occ) {
    const expiry = parseYyMmDd(occ[2]);
    const strike = Number(occ[4]) / 1000;
    if (!expiry || !Number.isFinite(strike)) return null;
    return { underlying: occ[1], expiry, right: occ[3] as "C" | "P", strike };
  }

  const tos = compact.match(/^([A-Z]{1,6}W?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (!tos) return null;
  const expiry = parseYyMmDd(tos[2]);
  const strike = Number(tos[4]);
  if (!expiry || !Number.isFinite(strike)) return null;
  return { underlying: tos[1], expiry, right: tos[3] as "C" | "P", strike };
}

export function parseGenericOptionUnderlying(raw: string): string | null {
  const parsed = parseOptionSymbol(raw);
  if (parsed) return parsed.underlying;
  const s = safeUpper(raw).replace(/\s+/g, "");
  const m = s.match(/^([A-Z]{1,6})\d{6}[CP]\d+/);
  return m ? m[1] : null;
}

export function normalizeBackStudyTradeRows(rows: unknown[]): BackStudyTradeRow[] {
  return rows.map((raw, index) => {
    const r = (raw ?? {}) as Record<string, any>;
    const symbol = String(r.symbol ?? "");
    const kind = normalizeKind(r.kind ?? r.instrumentType ?? r.asset_kind);
    const right = normalizeRight(r.right ?? r.putCall ?? r.put_call ?? r.optionRight);
    const strike = toNumber(r.strike ?? r.optionStrike);
    const expiry = normalizeExpiry(r.expiry ?? r.expiration ?? r.expires_at);

    return {
      id:
        r.id != null
          ? String(r.id)
          : [symbol.trim(), String(kind), String(r.time ?? "").trim(), String(r.price ?? "").trim(), index]
              .filter(Boolean)
              .join("-"),
      symbol,
      kind,
      side: normalizeSide(r.side),
      price: r.price ?? "",
      quantity: r.quantity ?? "",
      time: String(r.time ?? ""),
      dte: r.dte ?? null,
      expiry,
      premiumSide: r.premiumSide ?? r.premium ?? null,
      optionStrategy: r.optionStrategy ?? r.strategy ?? null,
      instrumentKey: r.instrumentKey ?? r.instrument_key ?? null,
      right,
      strike,
    };
  });
}

function parseTimeToMinutesFlexible(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ampm = m[3];
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (ampm === "AM" && hour === 12) hour = 0;
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function rowQuantity(row: BackStudyTradeRow): number {
  const qty = toNumber(row.quantity);
  return qty != null && Number.isFinite(qty) ? Math.abs(qty) : 0;
}

function averageTradePrice(rows: BackStudyTradeRow[]): number | null {
  const weighted = rows
    .map((row) => ({ price: toNumber(row.price), qty: rowQuantity(row) }))
    .filter((row): row is { price: number; qty: number } => row.price != null && row.qty > 0);

  if (weighted.length) {
    const totalQty = weighted.reduce((sum, row) => sum + row.qty, 0);
    if (totalQty > 0) {
      return weighted.reduce((sum, row) => sum + row.price * row.qty, 0) / totalQty;
    }
  }

  const prices = rows
    .map((row) => toNumber(row.price))
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (!prices.length) return null;
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

function sortRowsByTime<T extends BackStudyTradeRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = parseTimeToMinutesFlexible(a.time || "");
    const tb = parseTimeToMinutesFlexible(b.time || "");
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });
}

function resolveInstrumentFromRows(
  symbol: string,
  kind: InstrumentType,
  rows: BackStudyTradeRow[]
): Pick<
  BackStudyTradeView,
  "underlyingSymbol" | "contractSymbol" | "instrumentKey" | "instrumentKeySource" | "instrumentKeyAmbiguous"
> {
  if (kind !== "option") {
    return {
      underlyingSymbol: safeUpper(symbol) || symbol,
      contractSymbol: undefined,
      instrumentKey: null,
      instrumentKeySource: null,
      instrumentKeyAmbiguous: false,
    };
  }

  const explicit = rows.map((row) => String(row.instrumentKey ?? "").trim()).find(Boolean);
  if (explicit) {
    return {
      underlyingSymbol: explicit.split("|")[0] || safeUpper(symbol),
      contractSymbol: safeUpper(symbol),
      instrumentKey: explicit,
      instrumentKeySource: "row",
      instrumentKeyAmbiguous: false,
    };
  }

  const symbolParsed = parseOptionSymbol(symbol);
  if (symbolParsed) {
    const expiry = symbolParsed.expiry.toISOString().slice(0, 10);
    const underlying = symbolParsed.underlying.replace(/W$/, "");
    return {
      underlyingSymbol: underlying,
      contractSymbol: safeUpper(symbol),
      instrumentKey: `${underlying}|${expiry}|${symbolParsed.right}|${formatStrike(symbolParsed.strike)}`,
      instrumentKeySource: "symbol",
      instrumentKeyAmbiguous: false,
    };
  }

  const rowWithContract = rows.find((row) => row.expiry && row.right && row.strike != null);
  if (rowWithContract?.expiry && rowWithContract.right && rowWithContract.strike != null) {
    const parsedUnderlying = parseGenericOptionUnderlying(symbol);
    const underlying = (parsedUnderlying || safeUpper(symbol)).replace(/W$/, "");
    return {
      underlyingSymbol: underlying,
      contractSymbol: safeUpper(symbol),
      instrumentKey: `${underlying}|${rowWithContract.expiry}|${rowWithContract.right}|${formatStrike(
        Number(rowWithContract.strike)
      )}`,
      instrumentKeySource: "row_fields",
      instrumentKeyAmbiguous: false,
    };
  }

  const generic = parseGenericOptionUnderlying(symbol);
  return {
    underlyingSymbol: generic ? generic.replace(/W$/, "") : safeUpper(symbol),
    contractSymbol: safeUpper(symbol),
    instrumentKey: null,
    instrumentKeySource: null,
    instrumentKeyAmbiguous: true,
  };
}

function buildTradeViewFromLegs(
  session: BackStudySessionWithTrades,
  symbol: string,
  kindRaw: string,
  entries: BackStudyTradeRow[],
  exits: BackStudyTradeRow[],
  sequence: number
): BackStudyTradeView | null {
  if (!entries.length && !exits.length) return null;

  const entSorted = sortRowsByTime(entries);
  const exSorted = sortRowsByTime(exits);
  const entryRow = entSorted[0] || exSorted[0];
  const exitRow = exSorted[exSorted.length - 1] || entSorted[entSorted.length - 1] || entryRow;
  if (!entryRow || !exitRow) return null;

  const kind = normalizeKind(entryRow?.kind || exSorted[0]?.kind || kindRaw || "stock");
  const entryTime = entryRow?.time || "09:30";
  const exitTime = exitRow?.time || entryTime;
  const entryPrice = toNumber(entryRow?.price);
  const exitPrice = toNumber(exitRow?.price);
  const entryAvgPrice = averageTradePrice(entSorted);
  const exitAvgPrice = averageTradePrice(exSorted);
  const entryQty = entSorted.reduce((sum, row) => sum + rowQuantity(row), 0);
  const exitQty = exSorted.reduce((sum, row) => sum + rowQuantity(row), 0);
  const instrument = resolveInstrumentFromRows(symbol, kind, [...entSorted, ...exSorted]);
  const sourceRowIds = [...entSorted, ...exSorted]
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  const sourceKey = sourceRowIds.length ? sourceRowIds.join(":") : `${entryTime}-${exitTime}`;
  const id = `${session.date}-${symbol}-${kind}-${sequence}-${sourceKey}`;

  return {
    id,
    sequence,
    date: session.date,
    symbol,
    kind,
    entryTime,
    exitTime,
    entryPrice,
    exitPrice,
    entryAvgPrice: entryAvgPrice != null && Number.isFinite(entryAvgPrice) ? entryAvgPrice : null,
    exitAvgPrice: exitAvgPrice != null && Number.isFinite(exitAvgPrice) ? exitAvgPrice : null,
    entryQty: Number.isFinite(entryQty) ? entryQty : 0,
    exitQty: Number.isFinite(exitQty) ? exitQty : 0,
    entries: entSorted,
    exits: exSorted,
    sourceRowIds,
    ...instrument,
  };
}

export function splitRoundTripTradesForGroup(
  session: BackStudySessionWithTrades,
  symbol: string,
  kindRaw: string,
  entries: BackStudyTradeRow[],
  exits: BackStudyTradeRow[]
): BackStudyTradeView[] {
  type TradeEvent = {
    leg: "entry" | "exit";
    row: BackStudyTradeRow;
    minutes: number | null;
    order: number;
  };

  const events: TradeEvent[] = [
    ...entries.map((row, order) => ({
      leg: "entry" as const,
      row,
      minutes: parseTimeToMinutesFlexible(row.time || ""),
      order,
    })),
    ...exits.map((row, order) => ({
      leg: "exit" as const,
      row,
      minutes: parseTimeToMinutesFlexible(row.time || ""),
      order: entries.length + order,
    })),
  ].sort((a, b) => {
    if (a.minutes == null && b.minutes == null) return a.order - b.order;
    if (a.minutes == null) return 1;
    if (b.minutes == null) return -1;
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    if (a.leg !== b.leg) return a.leg === "entry" ? -1 : 1;
    return a.order - b.order;
  });

  const out: BackStudyTradeView[] = [];
  let currentEntries: BackStudyTradeRow[] = [];
  let currentExits: BackStudyTradeRow[] = [];
  let openQty = 0;
  let hasKnownQty = false;
  let sequence = 1;

  const flush = () => {
    const trade = buildTradeViewFromLegs(session, symbol, kindRaw, currentEntries, currentExits, sequence);
    if (trade) {
      out.push(trade);
      sequence += 1;
    }
    currentEntries = [];
    currentExits = [];
    openQty = 0;
    hasKnownQty = false;
  };

  events.forEach((event) => {
    if (event.leg === "entry") {
      if (currentEntries.length && currentExits.length && (!hasKnownQty || openQty <= 0)) {
        flush();
      }

      currentEntries.push(event.row);
      const qty = rowQuantity(event.row);
      if (qty > 0) {
        openQty += qty;
        hasKnownQty = true;
      } else if (!hasKnownQty && openQty <= 0) {
        openQty = 1;
      }
      return;
    }

    currentExits.push(event.row);
    const qty = rowQuantity(event.row);
    if (qty > 0) {
      openQty -= qty;
      hasKnownQty = true;
    } else if (!hasKnownQty) {
      openQty = 0;
    }

    if (hasKnownQty && openQty <= 0) {
      flush();
    }
  });

  flush();
  return out;
}

function tradeGroupKey(row: BackStudyTradeRow): string {
  const normalizedSymbol = safeUpper(row.symbol);
  const exactContract =
    row.instrumentKey ||
    (row.expiry && row.right && row.strike != null
      ? `${normalizeExpiry(row.expiry)}|${row.right}|${formatStrike(Number(row.strike))}`
      : "");

  return [
    normalizedSymbol,
    row.kind || "stock",
    row.side || "long",
    row.premiumSide || "",
    row.optionStrategy || "",
    exactContract,
  ].join("|");
}

function renumberTrade(trade: BackStudyTradeView, sequence: number): BackStudyTradeView {
  const sourceKey = trade.sourceRowIds.length ? trade.sourceRowIds.join(":") : `${trade.entryTime}-${trade.exitTime}`;
  return {
    ...trade,
    sequence,
    id: `${trade.date}-${trade.symbol}-${trade.kind}-${sequence}-${sourceKey}`,
  };
}

export function buildTradeViewsForSession(session: BackStudySessionWithTrades): BackStudyTradeView[] {
  const groups = new Map<string, { symbol: string; kindRaw: string; entries: BackStudyTradeRow[]; exits: BackStudyTradeRow[] }>();

  const add = (row: BackStudyTradeRow, leg: "entry" | "exit") => {
    const symbol = safeUpper(row.symbol);
    if (!symbol) return;
    const key = tradeGroupKey({ ...row, symbol });
    const existing = groups.get(key) ?? { symbol, kindRaw: String(row.kind || "stock"), entries: [], exits: [] };
    existing[leg === "entry" ? "entries" : "exits"].push({ ...row, symbol });
    groups.set(key, existing);
  };

  (session.entries || []).forEach((row) => add(row, "entry"));
  (session.exits || []).forEach((row) => add(row, "exit"));

  return Array.from(groups.values())
    .flatMap((group) =>
      splitRoundTripTradesForGroup(session, group.symbol, group.kindRaw, group.entries, group.exits)
    )
    .sort((a, b) => {
      const at = parseTimeToMinutesFlexible(a.entryTime) ?? 24 * 60;
      const bt = parseTimeToMinutesFlexible(b.entryTime) ?? 24 * 60;
      if (at !== bt) return at - bt;
      return a.symbol.localeCompare(b.symbol);
    })
    .map((trade, index) => renumberTrade(trade, index + 1));
}

export function buildInstrumentKeyFromTrade(trade: BackStudyTradeView): string | null {
  return trade.kind === "option" ? trade.instrumentKey : null;
}
