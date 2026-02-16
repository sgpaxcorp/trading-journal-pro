import type { NormalizedOrderEvent } from "@/lib/brokers/types";

export type AuditEvidence = {
  stop_events: Array<{
    ts_utc: string;
    stop_price: number | null;
    status: string | null;
    oco_id: string | null;
    replace_id: string | null;
  }>;
  cancel_events: Array<{
    ts_utc: string;
    status: string | null;
    replace_id: string | null;
  }>;
  fills: Array<{
    ts_utc: string;
    side: string | null;
    pos_effect: string | null;
    qty: number | null;
    order_type: string | null;
    limit_price: number | null;
    stop_price: number | null;
  }>;
};

export type AuditMetrics = {
  trade_count: number;
  trades: TradeSequence[];
  oco_used: boolean;
  stop_present: boolean;
  stop_mod_count: number;
  cancel_count: number;
  replace_count: number;
  market_exit_used: boolean;
  manual_market_exit: boolean;
  stop_market_filled: boolean;
  time_to_first_stop_sec: number | null;
  insights: string[];
  summary: string;
  evidence: AuditEvidence;
};

export type TradeSequence = {
  index: number;
  direction: "long" | "short" | "unknown";
  entry_ts: string | null;
  exit_ts: string | null;
  entry_count: number;
  exit_count: number;
  entry_qty: number;
  exit_qty: number;
  stop_mod_count: number;
  time_to_first_stop_sec: number | null;
  oco_used: boolean;
  cancel_count: number;
  replace_count: number;
  manual_market_exit: boolean;
  stop_market_filled: boolean;
  summary: string;
};

function toMs(ts: string): number {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : 0;
}

export function auditOrderEvents(events: NormalizedOrderEvent[]): AuditMetrics {
  const ordered = [...events].sort((a, b) => toMs(a.ts_utc) - toMs(b.ts_utc));
  const trades = buildTradeSequences(ordered);

  const stopEvents = ordered.filter((e) => e.stop_price != null);
  const cancelEvents = ordered.filter(
    (e) => e.event_type === "ORDER_CANCELED" || String(e.status || "").toUpperCase().includes("CANCEL")
  );
  const replaceEvents = ordered.filter(
    (e) => e.event_type === "ORDER_REPLACED" || !!e.replace_id
  );
  const fillEvents = ordered.filter((e) => e.event_type === "ORDER_FILLED");

  const entryFill = fillEvents.find((e) => String(e.pos_effect || "").toUpperCase() === "TO_OPEN");
  let timeToFirstStop: number | null = null;
  const entryMs = entryFill ? toMs(entryFill.ts_utc) : null;
  const stopCloseEvents = stopEvents.filter(
    (e) => String(e.pos_effect || "").toUpperCase() === "TO_CLOSE"
  );
  const stopCloseAfterEntry =
    entryMs != null
      ? stopCloseEvents.filter((e) => toMs(e.ts_utc) > entryMs)
      : stopCloseEvents;
  const stopCloseWithOco = stopCloseAfterEntry.filter((e) => !!e.oco_id);
  const stopCloseRelevant = stopCloseWithOco.length ? stopCloseWithOco : stopCloseAfterEntry;

  let stopModCount = 0;
  let lastStop: number | null = null;
  for (const e of stopCloseRelevant) {
    const price = e.stop_price ?? null;
    if (price == null) continue;
    if (lastStop == null) {
      lastStop = price;
      continue;
    }
    if (Math.abs(price - lastStop) > 1e-9) {
      stopModCount += 1;
      lastStop = price;
    }
  }

  if (entryMs != null && stopCloseRelevant.length) {
    const firstStop = stopCloseRelevant[0];
    const diff = Math.max(0, toMs(firstStop.ts_utc) - entryMs);
    timeToFirstStop = Math.round(diff / 1000);
  }

  const closeFills = fillEvents.filter(
    (e) => String(e.pos_effect || "").toUpperCase() === "TO_CLOSE"
  );
  const stopMarketFilled = closeFills.some((e) => {
    const ot = String(e.order_type || "").toUpperCase();
    const st = String(e.status || "").toUpperCase();
    return ot.includes("STP") || st.includes("STOP") || e.stop_price != null;
  });
  const manualMarketExit = closeFills.some((e) => {
    const ot = String(e.order_type || "").toUpperCase();
    const st = String(e.status || "").toUpperCase();
    const hasStop = ot.includes("STP") || st.includes("STOP") || e.stop_price != null;
    return ot === "MKT" && !hasStop;
  });
  const marketExitUsed = manualMarketExit || stopMarketFilled;

  const insights: string[] = [];
  if (!entryFill) {
    insights.push("No entry fill detected; stop timing metrics are indeterminate.");
  }
  if (stopCloseRelevant.length) {
    insights.push("TO_CLOSE stop orders detected after entry.");
  } else {
    insights.push("No TO_CLOSE stop orders detected after entry.");
  }
  if (stopModCount > 0) {
    insights.push(`Stop modified ${stopModCount} time(s).`);
  }
  if (ocoUsed(ordered)) {
    insights.push("OCO linkage detected.");
  } else {
    insights.push("No OCO linkage detected.");
  }
  if (cancelEvents.length > 0) {
    insights.push(`Canceled orders: ${cancelEvents.length}.`);
  }
  if (replaceEvents.length > 0) {
    insights.push(`Replaced orders: ${replaceEvents.length}.`);
  }
  if (manualMarketExit) {
    insights.push("Manual market exit detected (MKT close).");
  }
  if (stopMarketFilled) {
    insights.push("Stop-related market fill detected.");
  }
  if (timeToFirstStop != null) {
    insights.push(`First TO_CLOSE stop placed ${timeToFirstStop}s after entry.`);
  }

  const summary = insights.slice(0, 3).join(" ");

  return {
    trade_count: trades.length,
    trades,
    oco_used: ocoUsed(ordered),
    stop_present: stopCloseEvents.length > 0,
    stop_mod_count: stopModCount,
    cancel_count: cancelEvents.length,
    replace_count: replaceEvents.length,
    market_exit_used: marketExitUsed,
    manual_market_exit: manualMarketExit,
    stop_market_filled: stopMarketFilled,
    time_to_first_stop_sec: timeToFirstStop,
    insights,
    summary,
    evidence: {
      stop_events: stopEvents.map((e) => ({
        ts_utc: e.ts_utc,
        stop_price: e.stop_price ?? null,
        status: e.status ?? null,
        oco_id: e.oco_id ?? null,
        replace_id: e.replace_id ?? null,
      })),
      cancel_events: cancelEvents.map((e) => ({
        ts_utc: e.ts_utc,
        status: e.status ?? null,
        replace_id: e.replace_id ?? null,
      })),
      fills: fillEvents.map((e) => ({
        ts_utc: e.ts_utc,
        side: e.side ?? null,
        pos_effect: e.pos_effect ?? null,
        qty: e.qty ?? null,
        order_type: e.order_type ?? null,
        limit_price: e.limit_price ?? null,
        stop_price: e.stop_price ?? null,
      })),
    },
  };
}

function ocoUsed(events: NormalizedOrderEvent[]): boolean {
  return events.some((e) => !!e.oco_id);
}

function buildTradeSequences(events: NormalizedOrderEvent[]): TradeSequence[] {
  const trades: TradeSequence[] = [];
  let currentIndex: number | null = null;
  let openQty = 0;

  const startTrade = (entry: NormalizedOrderEvent) => {
    const direction =
      String(entry.side || "").toUpperCase() === "SELL" ? "short" : "long";
    const trade: TradeSequence = {
      index: trades.length + 1,
      direction,
      entry_ts: entry.ts_utc,
      exit_ts: null,
      entry_count: 0,
      exit_count: 0,
      entry_qty: 0,
      exit_qty: 0,
      stop_mod_count: 0,
      time_to_first_stop_sec: null,
      oco_used: false,
      cancel_count: 0,
      replace_count: 0,
      manual_market_exit: false,
      stop_market_filled: false,
      summary: "",
    };
    trades.push(trade);
    currentIndex = trades.length - 1;
    openQty = 0;
  };

  const signedQty = (e: NormalizedOrderEvent) => {
    const qtyRaw = typeof e.qty === "number" ? e.qty : 0;
    const qty = Math.abs(qtyRaw);
    const side = String(e.side || "").toUpperCase();
    if (side === "BUY") return qty;
    if (side === "SELL") return -qty;
    return 0;
  };

  const stopEventsByTrade = new Map<number, NormalizedOrderEvent[]>();

  const getCurrentTrade = (): TradeSequence | null => {
    if (currentIndex == null) return null;
    return trades[currentIndex] ?? null;
  };

  for (const e of events) {
    const pos = String(e.pos_effect || "").toUpperCase();

    if (e.event_type === "ORDER_FILLED") {
      if (pos === "TO_OPEN") {
        if (currentIndex == null || openQty === 0) {
          startTrade(e);
        }
        const trade = getCurrentTrade();
        if (!trade) continue;
        trade.entry_count += 1;
        trade.entry_qty += Math.abs(typeof e.qty === "number" ? e.qty : 0);
        openQty += signedQty(e);
        trade.oco_used = trade.oco_used || !!e.oco_id;
      } else if (pos === "TO_CLOSE") {
        const trade = getCurrentTrade();
        if (!trade) continue;
        trade.exit_count += 1;
        trade.exit_qty += Math.abs(typeof e.qty === "number" ? e.qty : 0);
        openQty += signedQty(e);
        trade.oco_used = trade.oco_used || !!e.oco_id;

        const ot = String(e.order_type || "").toUpperCase();
        const st = String(e.status || "").toUpperCase();
        const hasStop = ot.includes("STP") || st.includes("STOP") || e.stop_price != null;
        if (ot === "MKT" && !hasStop) {
          trade.manual_market_exit = true;
        }
        if (hasStop && ot.includes("MKT")) {
          trade.stop_market_filled = true;
        }

        if (openQty === 0) {
          trade.exit_ts = e.ts_utc;
          currentIndex = null;
        } else if (
          (openQty > 0 && trade.direction === "short") ||
          (openQty < 0 && trade.direction === "long")
        ) {
          trade.exit_ts = e.ts_utc;
          openQty = 0;
          currentIndex = null;
        }
      }
    }

    const trade = getCurrentTrade();
    if (trade) {
      if (e.stop_price != null && pos === "TO_CLOSE") {
        const list = stopEventsByTrade.get(trade.index) ?? [];
        list.push(e);
        stopEventsByTrade.set(trade.index, list);
        trade.oco_used = trade.oco_used || !!e.oco_id;
      }

      if (e.event_type === "ORDER_CANCELED" || String(e.status || "").toUpperCase().includes("CANCEL")) {
        trade.cancel_count += 1;
      }
      if (e.event_type === "ORDER_REPLACED" || !!e.replace_id) {
        trade.replace_count += 1;
      }
    }
  }

  for (const trade of trades) {
    const stops = stopEventsByTrade.get(trade.index) ?? [];
    const entryMs = trade.entry_ts ? toMs(trade.entry_ts) : null;
    const stopCloseAfterEntry =
      entryMs != null ? stops.filter((s) => toMs(s.ts_utc) > entryMs) : stops;
    const stopCloseWithOco = stopCloseAfterEntry.filter((s) => !!s.oco_id);
    const stopCloseRelevant = stopCloseWithOco.length ? stopCloseWithOco : stopCloseAfterEntry;

    let stopModCount = 0;
    let lastStop: number | null = null;
    for (const s of stopCloseRelevant) {
      const price = s.stop_price ?? null;
      if (price == null) continue;
      if (lastStop == null) {
        lastStop = price;
        continue;
      }
      if (Math.abs(price - lastStop) > 1e-9) {
        stopModCount += 1;
        lastStop = price;
      }
    }
    trade.stop_mod_count = stopModCount;

    if (entryMs != null && stopCloseRelevant.length) {
      const firstStop = stopCloseRelevant[0];
      const diff = Math.max(0, toMs(firstStop.ts_utc) - entryMs);
      trade.time_to_first_stop_sec = Math.round(diff / 1000);
    }

    const parts: string[] = [];
    parts.push(`Trade ${trade.index}:`);
    parts.push(`entries ${trade.entry_count}, exits ${trade.exit_count}.`);
    if (trade.oco_used) parts.push("OCO used.");
    if (trade.stop_mod_count > 0) parts.push(`stop modified ${trade.stop_mod_count}x.`);
    if (trade.manual_market_exit) parts.push("manual MKT exit.");
    if (trade.stop_market_filled) parts.push("stop-filled MKT exit.");
    trade.summary = parts.join(" ");
  }

  return trades;
}
