import { describe, expect, it } from "vitest";

import { DemoMarketDataProvider, MarketDataProviderRegistry } from "@/lib/neuroMarketDataProvider";

describe("market data provider abstraction", () => {
  it("exposes quotes, prices and corporate actions through one provider contract", async () => {
    const provider = new DemoMarketDataProvider([{ ticker: "ACME", quote: { price: 42, volume: 1000, observedAt: "2026-09-16T20:00:00.000Z" }, historicalPrices: [{ date: "2026-09-15", close: 40 }], corporateActions: [] }]);
    expect((await provider.getQuote("acme")).price).toBe(42);
    expect(await provider.getHistoricalPrices("ACME", "2026-09-01", "2026-09-30")).toHaveLength(1);
    expect((await provider.getTradingVolume("ACME")).value).toBe(1000);
  });

  it("enforces declared licensing capabilities before downstream use", () => {
    const registry = new MarketDataProviderRegistry().register(new DemoMarketDataProvider());
    expect(() => registry.assertUsage("demo_market_data", "store")).not.toThrow();
    expect(() => registry.assertUsage("demo_market_data", "redistribute")).toThrow(/do not permit redistribute/i);
  });
});
