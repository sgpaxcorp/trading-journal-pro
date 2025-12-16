// hooks/useAutoPnL.ts
"use client";

import { InstrumentType } from "@/lib/journalNotes";
import { useMemo } from "react";

export type TradeType =
  | "stock"
  | "option"
  | "future"
  | "crypto"
  | "forex"
  | "other";

export type Direction = "long" | "short";

export type EntryTradeRow = {
  id: string;
  symbol: string;
  tradeType: TradeType;
  direction: Direction;
  price: string;     // user input
  quantity: string;  // user input
  time: string;      // "HH:MM AM/PM"
};

export type ExitTradeRow = {
  id: string;
  entryId: string;   // links to an entry group
  symbol: string;
  tradeType: TradeType;
  direction: Direction;
  price: string;
  quantity: string;
  time: string;
};

export type PnLLine = {
  key: string;
  symbol: string;
  tradeType: TradeType;
  direction: Direction;
  qtyIn: number;
  qtyOut: number;
  avgEntry: number;
  avgExit: number;
  pnl: number;
};

export type PnLComputeResult = {
  total: number;
  lines: PnLLine[];
};

const toNum = (x: string | number | undefined, fb = 0) => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fb;
};

const normSymbol = (s: string) => (s || "").trim().toUpperCase();

function getMultiplier(symbol: string, tradeType: TradeType): number {
  const sym = normSymbol(symbol);

  if (tradeType === "option") return 100; // equity/index options
  if (tradeType === "stock" || tradeType === "crypto" || tradeType === "forex")
    return 1;

  if (tradeType === "future") {
    // common futures tick/point values (extend as you like)
    if (sym.startsWith("ES")) return 50;
    if (sym.startsWith("MES")) return 5;
    if (sym.startsWith("NQ")) return 20;
    if (sym.startsWith("MNQ")) return 2;
    if (sym.startsWith("RTY")) return 50;
    if (sym.startsWith("M2K")) return 5;
    if (sym.startsWith("YM")) return 5;
    if (sym.startsWith("MYM")) return 0.5;
    if (sym.startsWith("CL")) return 1000;
    if (sym.startsWith("GC")) return 100;
    return 1;
  }

  return 1;
}

type GroupAgg = {
  key: string;
  symbol: string;
  tradeType: TradeType;
  direction: Direction;
  qtyIn: number;
  sumEntryPxQty: number; // for weighted avg
  exits: { px: number; qty: number }[];
};

export function useAutoPnL(
entryTrades: { id: string; symbol: string; kind: InstrumentType; side: "long" | "short"; price: string; quantity: string; time: string; }[], exitTrades: { id: string; symbol: string; kind: InstrumentType; side: "long" | "short"; price: string; quantity: string; time: string; }[], direction: string | undefined, entries: EntryTradeRow[], exits: ExitTradeRow[]): PnLComputeResult {
  return useMemo(() => {
    const groups = new Map<string, GroupAgg>();

    // --- aggregate entries (avg down/up automatically) ---
    for (const e of entries || []) {
      const symbol = normSymbol(e.symbol);
      const tradeType = e.tradeType;
      const direction = e.direction;
      if (!symbol || !tradeType || !direction) continue;

      const px = toNum(e.price);
      const qty = toNum(e.quantity);
      if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;

      const key = `${symbol}__${tradeType}__${direction}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          symbol,
          tradeType,
          direction,
          qtyIn: 0,
          sumEntryPxQty: 0,
          exits: [],
        });
      }
      const g = groups.get(key)!;
      g.qtyIn += qty;
      g.sumEntryPxQty += px * qty;
    }

    // --- attach exits to same key ---
    for (const x of exits || []) {
      const symbol = normSymbol(x.symbol);
      const tradeType = x.tradeType;
      const direction = x.direction;
      if (!symbol || !tradeType || !direction) continue;

      const px = toNum(x.price);
      const qty = toNum(x.quantity);
      if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;

      const key = `${symbol}__${tradeType}__${direction}`;
      if (!groups.has(key)) {
        // exit without entry: ignore gracefully
        continue;
      }
      groups.get(key)!.exits.push({ px, qty });
    }

    // --- compute pnl lines ---
    const lines: PnLLine[] = [];
    let total = 0;

    for (const g of groups.values()) {
      const avgEntry =
        g.qtyIn > 0 ? g.sumEntryPxQty / g.qtyIn : 0;

      const qtyOut = g.exits.reduce((s, r) => s + r.qty, 0);
      const sumExitPxQty = g.exits.reduce((s, r) => s + r.px * r.qty, 0);
      const avgExit = qtyOut > 0 ? sumExitPxQty / qtyOut : 0;

      const mult = getMultiplier(g.symbol, g.tradeType);
      const sign = g.direction === "long" ? 1 : -1;

      const pnl =
        qtyOut > 0
          ? (avgExit - avgEntry) * qtyOut * mult * sign
          : 0;

      total += pnl;
      lines.push({
        key: g.key,
        symbol: g.symbol,
        tradeType: g.tradeType,
        direction: g.direction,
        qtyIn: g.qtyIn,
        qtyOut,
        avgEntry,
        avgExit,
        pnl,
      });
    }

    return { total, lines };
  }, [entries, exits]);
}
