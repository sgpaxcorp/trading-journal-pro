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

  it("keeps separate broker trade sequences when a position fully closes and reopens", () => {
    const twoTrips: NormalizedOrderEvent[] = [
      {
        ...events[0],
        ts_utc: "2026-02-13T14:00:00Z",
        side: "BUY",
        pos_effect: "TO_OPEN",
        qty: 2,
        order_type: "LMT",
      },
      {
        ...events[4],
        ts_utc: "2026-02-13T14:05:00Z",
        side: "SELL",
        pos_effect: "TO_CLOSE",
        qty: 1,
        order_type: "LMT",
      },
      {
        ...events[4],
        ts_utc: "2026-02-13T14:10:00Z",
        side: "SELL",
        pos_effect: "TO_CLOSE",
        qty: 1,
        order_type: "LMT",
      },
      {
        ...events[0],
        ts_utc: "2026-02-13T14:30:00Z",
        side: "BUY",
        pos_effect: "TO_OPEN",
        qty: 1,
        order_type: "LMT",
      },
      {
        ...events[4],
        ts_utc: "2026-02-13T14:45:00Z",
        side: "SELL",
        pos_effect: "TO_CLOSE",
        qty: 1,
        order_type: "MKT",
      },
    ];

    const audit = auditOrderEvents(twoTrips);

    expect(audit.trade_count).toBe(2);
    expect(audit.trades.map((trade) => trade.entry_qty)).toEqual([2, 1]);
    expect(audit.trades.map((trade) => trade.exit_qty)).toEqual([2, 1]);
    expect(audit.trades[0].exit_ts).toBe("2026-02-13T14:10:00Z");
    expect(audit.trades[1].manual_market_exit).toBe(true);
  });

  it("audits automatic OCO protection and time without a stop after removal", () => {
    const protectedTrade: NormalizedOrderEvent[] = [
      {
        ...events[0],
        ts_utc: "2026-02-13T14:00:00Z",
        oco_id: "BRACKET-1",
      },
      {
        ...events[1],
        ts_utc: "2026-02-13T14:00:02Z",
        order_type: "LMT",
        limit_price: 6.5,
        stop_price: null,
        oco_id: "BRACKET-1",
      },
      {
        ...events[1],
        ts_utc: "2026-02-13T14:00:03Z",
        stop_price: 5,
        oco_id: "BRACKET-1",
      },
      {
        ...events[3],
        ts_utc: "2026-02-13T14:05:00Z",
        stop_price: 5,
        oco_id: "BRACKET-1",
      },
      {
        ...events[1],
        ts_utc: "2026-02-13T14:05:30Z",
        stop_price: 5.2,
        oco_id: "BRACKET-1",
      },
      {
        ...events[4],
        ts_utc: "2026-02-13T14:10:00Z",
        order_type: "LMT",
        limit_price: 6.5,
        stop_price: null,
        oco_id: "BRACKET-1",
      },
    ];

    const audit = auditOrderEvents(protectedTrade);

    expect(audit.protective_bracket_used).toBe(true);
    expect(audit.automatic_bracket_protection).toBe(true);
    expect(audit.stop_cancel_count).toBe(1);
    expect(audit.stop_reprotected_count).toBe(1);
    expect(audit.stop_removed_without_replacement).toBe(false);
    expect(audit.max_time_without_stop_sec).toBe(30);
    expect(audit.evidence.protection_gaps).toEqual([
      expect.objectContaining({ duration_sec: 30, restored: true }),
    ]);
  });
});
