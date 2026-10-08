import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchOptionFlowDailyBars } from "@/lib/optionFlowMarketData";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Option Flow market data", () => {
  it("retries Yahoo's secondary chart endpoint after a rate limit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        chart: {
          result: [{
            timestamp: [Date.parse("2026-10-05T16:00:00Z") / 1000],
            indicators: {
              quote: [{
                open: [180], high: [185], low: [179], close: [184], volume: [12_500_000],
              }],
              adjclose: [{ adjclose: [184] }],
            },
            meta: { currency: "USD", fullExchangeName: "NYSE" },
          }],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const bars = await fetchOptionFlowDailyBars({
      underlying: "PLTR",
      startDate: "2026-10-05",
      endDate: "2026-10-05",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("query1.finance.yahoo.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("query2.finance.yahoo.com");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      cache: "force-cache",
      next: { revalidate: 900 },
    });
    expect(bars).toEqual([
      expect.objectContaining({
        symbol: "PLTR",
        sessionDate: "2026-10-05",
        open: 180,
        high: 185,
        low: 179,
        close: 184,
        adjustedClose: 184,
        volume: 12_500_000,
        currency: "USD",
        sourceId: "yahoo",
      }),
    ]);
  });
});
