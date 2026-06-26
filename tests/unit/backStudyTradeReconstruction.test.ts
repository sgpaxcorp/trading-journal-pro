import { describe, expect, it } from "vitest";
import {
  buildInstrumentKeyFromTrade,
  buildTradeViewsForSession,
  normalizeBackStudyTradeRows,
  parseOptionSymbol,
  splitRoundTripTradesForGroup,
  type BackStudyTradeRow,
} from "@/lib/backStudy/tradeReconstruction";

const row = (overrides: Partial<BackStudyTradeRow>): BackStudyTradeRow => ({
  id: overrides.id ?? `${overrides.symbol}-${overrides.time}-${overrides.price}`,
  symbol: overrides.symbol ?? "SPXW251121C6565",
  kind: overrides.kind ?? "option",
  side: overrides.side ?? "long",
  price: overrides.price ?? 10,
  quantity: overrides.quantity ?? 1,
  time: overrides.time ?? "09:35",
  ...overrides,
});

describe("back-study trade reconstruction", () => {
  it("parses TOS and OCC option symbols into exact contract details", () => {
    expect(parseOptionSymbol("SPXW251121C6565")).toMatchObject({
      underlying: "SPXW",
      right: "C",
      strike: 6565,
    });

    expect(parseOptionSymbol("AAPL260116C00250000")).toMatchObject({
      underlying: "AAPL",
      right: "C",
      strike: 250,
    });
  });

  it("keeps separate option contracts in separate reconstructed trades", () => {
    const session = {
      date: "2026-01-16",
      entries: normalizeBackStudyTradeRows([
        row({ id: "e1", symbol: "AAPL260116C00250000", time: "09:35", price: 2, quantity: 1 }),
        row({ id: "e2", symbol: "AAPL260116C00255000", time: "09:40", price: 1.1, quantity: 1 }),
      ]),
      exits: normalizeBackStudyTradeRows([
        row({ id: "x1", symbol: "AAPL260116C00250000", time: "10:00", price: 2.4, quantity: 1 }),
        row({ id: "x2", symbol: "AAPL260116C00255000", time: "10:15", price: 1.6, quantity: 1 }),
      ]),
    };

    const trades = buildTradeViewsForSession(session);

    expect(trades).toHaveLength(2);
    expect(trades.map((trade) => buildInstrumentKeyFromTrade(trade))).toEqual([
      "AAPL|2026-01-16|C|250",
      "AAPL|2026-01-16|C|255",
    ]);
    expect(trades[0].sourceRowIds).toEqual(["e1", "x1"]);
    expect(trades[1].sourceRowIds).toEqual(["e2", "x2"]);
  });

  it("splits multiple round trips inside the same symbol and preserves partial exits", () => {
    const entries = [
      row({ id: "e1", symbol: "SPY", kind: "stock", time: "09:35", quantity: 3, price: 400 }),
      row({ id: "e2", symbol: "SPY", kind: "stock", time: "10:30", quantity: 1, price: 402 }),
    ];
    const exits = [
      row({ id: "x1", symbol: "SPY", kind: "stock", time: "09:50", quantity: 1, price: 401 }),
      row({ id: "x2", symbol: "SPY", kind: "stock", time: "10:05", quantity: 2, price: 403 }),
      row({ id: "x3", symbol: "SPY", kind: "stock", time: "10:45", quantity: 1, price: 404 }),
    ];

    const trades = splitRoundTripTradesForGroup({ date: "2026-02-02", entries, exits }, "SPY", "stock", entries, exits);

    expect(trades).toHaveLength(2);
    expect(trades[0].entryQty).toBe(3);
    expect(trades[0].exitQty).toBe(3);
    expect(trades[0].sourceRowIds).toEqual(["e1", "x1", "x2"]);
    expect(trades[1].sourceRowIds).toEqual(["e2", "x3"]);
  });
});
