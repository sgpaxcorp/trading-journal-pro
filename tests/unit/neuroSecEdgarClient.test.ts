import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MemorySecEdgarCache, SecEdgarClient } from "@/lib/neuroSecEdgarClient";

const userAgent = "NeuroTrader investment research operations@neurotrader.test";

describe("SEC EDGAR client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires contact identification and refuses a rate above SEC fair-access limits", () => {
    expect(() => new SecEdgarClient({ userAgent: "anonymous bot" })).toThrow(/contact/i);
    expect(() => new SecEdgarClient({ userAgent, requestsPerSecond: 11 })).toThrow(/between 1 and 10/i);
  });

  it("deduplicates concurrent requests and serves unchanged data from cache", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ cik: "1" }), {
      status: 200,
      headers: { "content-type": "application/json", etag: '"v1"' },
    }));
    const client = new SecEdgarClient({
      userAgent,
      cache: new MemorySecEdgarCache(),
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async () => undefined,
    });

    const [first, duplicate] = await Promise.all([
      client.getSubmissions("1"),
      client.getSubmissions("1"),
    ]);
    const cached = await client.getSubmissions("1");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.data).toEqual({ cik: "1" });
    expect(duplicate.receipt.contentSha256).toBe(first.receipt.contentSha256);
    expect(cached.receipt.fromCache).toBe(true);
  });

  it("retries throttled responses with backoff and never changes the resource host", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new SecEdgarClient({
      userAgent,
      fetchImpl: fetchImpl as typeof fetch,
      sleep,
      maxRetries: 2,
    });

    const result = await client.getCompanyFacts("320193", 0);

    expect(result.data).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
    await expect(client.getJson("https://example.com/not-sec.json")).rejects.toThrow(/official HTTPS SEC/i);
  });
});
