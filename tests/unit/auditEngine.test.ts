import { describe, it, expect } from "vitest";
import { auditOrderEvents } from "@/lib/audit/auditEngine";
import type { NormalizedOrderEvent } from "@/lib/brokers/types";

const events: NormalizedOrderEvent[] = [
  {
    date: "2026-02-13",
    ts_utc: "2026-02-13T14:00:00Z",
    event_type: "ORDER_FILLED",
    status: "FILLED",
    side: "BUY",
    pos_effect: "TO_OPEN",
    qty: 1,
    symbol: "SPX",
    instrument_key: "SPX|2026-02-13|C|7000",
    asset_kind: "option",
    order_type: "LMT",
    limit_price: 5.7,
    stop_price: null,
    oco_id: "OCO1",
    replace_id: null,
  },
  {
    date: "2026-02-13",
    ts_utc: "2026-02-13T14:05:00Z",
    event_type: "ORDER_PLACED",
    status: "WORKING",
    side: "SELL",
    pos_effect: "TO_CLOSE",
    qty: 1,
    symbol: "SPX",
    instrument_key: "SPX|2026-02-13|C|7000",
    asset_kind: "option",
    order_type: "STP",
    limit_price: null,
    stop_price: 5.0,
    oco_id: "OCO1",
    replace_id: null,
  },
  {
    date: "2026-02-13",
    ts_utc: "2026-02-13T14:10:00Z",
    event_type: "ORDER_REPLACED",
    status: "REPLACED",
    side: "SELL",
    pos_effect: "TO_CLOSE",
    qty: 1,
    symbol: "SPX",
    instrument_key: "SPX|2026-02-13|C|7000",
    asset_kind: "option",
    order_type: "STP",
    limit_price: null,
    stop_price: 4.5,
    oco_id: "OCO1",
    replace_id: "RE1",
  },
  {
    date: "2026-02-13",
    ts_utc: "2026-02-13T14:12:00Z",
    event_type: "ORDER_CANCELED",
    status: "CANCELED",
    side: "SELL",
    pos_effect: "TO_CLOSE",
    qty: 1,
    symbol: "SPX",
    instrument_key: "SPX|2026-02-13|C|7000",
    asset_kind: "option",
    order_type: "STP",
    limit_price: null,
    stop_price: 4.5,
    oco_id: "OCO1",
    replace_id: "RE1",
  },
  {
    date: "2026-02-13",
    ts_utc: "2026-02-13T14:15:00Z",
    event_type: "ORDER_FILLED",
    status: "FILLED",
    side: "SELL",
    pos_effect: "TO_CLOSE",
    qty: 1,
    symbol: "SPX",
    instrument_key: "SPX|2026-02-13|C|7000",
    asset_kind: "option",
    order_type: "MKT",
    limit_price: null,
    stop_price: null,
    oco_id: "OCO1",
    replace_id: null,
  },
];

describe("auditOrderEvents", () => {
  it("computes deterministic metrics", () => {
    const audit = auditOrderEvents(events);
    expect(audit.trade_count).toBe(1);
    expect(audit.trades.length).toBe(1);
    expect(audit.oco_used).toBe(true);
    expect(audit.stop_present).toBe(true);
    expect(audit.stop_mod_count).toBe(1);
    expect(audit.cancel_count).toBe(1);
    expect(audit.replace_count).toBeGreaterThan(0);
    expect(audit.manual_market_exit).toBe(true);
    expect(audit.stop_market_filled).toBe(false);
    expect(audit.market_exit_used).toBe(true);
    expect(audit.time_to_first_stop_sec).toBe(300);
    expect(audit.insights.length).toBeGreaterThan(0);
    expect(audit.summary.length).toBeGreaterThan(0);
    expect(audit.trades[0].time_to_first_stop_sec).toBe(300);
  });
});
