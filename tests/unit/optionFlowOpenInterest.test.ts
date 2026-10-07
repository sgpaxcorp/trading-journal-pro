import { describe, expect, it } from "vitest";

import {
  buildOccOptionSymbol,
  buildOptionFlowOpenInterestIntelligence,
  normalizeOccOptionSymbol,
  type OptionFlowContractSnapshot,
} from "@/lib/optionFlowIntelligence";

function snapshot(overrides: Partial<OptionFlowContractSnapshot> = {}): OptionFlowContractSnapshot {
  return {
    contractSymbol: "PLTR261120C00050000",
    underlyingSymbol: "PLTR",
    expiry: "2026-11-20",
    strike: 50,
    optionType: "C",
    snapshotKind: "oi_reconciliation",
    priceSessionDate: "2026-10-05",
    openInterestAsOfDate: "2026-10-05",
    observedAt: "2026-10-06T12:15:00.000Z",
    sourceId: "massive",
    openInterest: 1_200,
    volume: 600,
    lastPrice: 3,
    oiTemporalStatus: "verified_prior_close",
    ...overrides,
  };
}

describe("Option Flow open-interest intelligence", () => {
  it("normalizes and constructs canonical OCC symbols", () => {
    expect(normalizeOccOptionSymbol("O:PLTR261120C00050000")).toBe("PLTR261120C00050000");
    expect(buildOccOptionSymbol({
      root: "PLTR",
      expiry: "2026-11-20",
      strike: 50,
      optionType: "C",
    })).toBe("PLTR261120C00050000");
    expect(buildOccOptionSymbol({ root: "PLTR", expiry: null, strike: 50, optionType: "C" })).toBeNull();
  });

  it("compares OI only across distinct verified effective sessions", () => {
    const result = buildOptionFlowOpenInterestIntelligence([
      snapshot({
        priceSessionDate: "2026-10-02",
        openInterestAsOfDate: "2026-10-02",
        observedAt: "2026-10-05T12:15:00.000Z",
        openInterest: 1_000,
        lastPrice: 2.5,
      }),
      snapshot(),
    ], "2026-10-06T12:20:00.000Z");

    expect(result.coverage.contractsWithComparableOpenInterest).toBe(1);
    expect(result.totals.confirmedOpenInterestChange).toBe(200);
    expect(result.contracts[0]).toMatchObject({
      openInterest: 1_200,
      previousOpenInterest: 1_000,
      openInterestChange: 200,
      openInterestChangePct: 20,
      priceChangePct: 20,
      volumeToOpenInterest: 0.5,
      relationship: "price_up_oi_up",
      evidenceQuality: "verified",
    });
  });

  it("does not manufacture an OI change from repeated intraday observations", () => {
    const result = buildOptionFlowOpenInterestIntelligence([
      snapshot({
        snapshotKind: "imported_flow",
        openInterestAsOfDate: null,
        observedAt: "2026-10-05T15:00:00.000Z",
        openInterest: 1_000,
        oiTemporalStatus: "date_not_verified",
      }),
      snapshot({
        snapshotKind: "imported_flow",
        openInterestAsOfDate: null,
        observedAt: "2026-10-05T19:00:00.000Z",
        openInterest: 1_200,
        oiTemporalStatus: "date_not_verified",
      }),
    ]);

    expect(result.coverage.contractsWithComparableOpenInterest).toBe(0);
    expect(result.contracts[0].openInterestChange).toBeNull();
    expect(result.contracts[0].relationship).toBe("insufficient_evidence");
    expect(result.contracts[0].evidenceQuality).toBe("unverified");
  });

  it("preserves a source-reported change without presenting it as provider verified", () => {
    const result = buildOptionFlowOpenInterestIntelligence([
      snapshot({
        snapshotKind: "imported_flow",
        openInterest: null,
        openInterestAsOfDate: null,
        reportedOpenInterestChange: 275,
        oiTemporalStatus: "reported_by_source",
        sourceId: "import:unusualwhales",
      }),
    ]);

    expect(result.contracts[0]).toMatchObject({
      openInterestChange: 275,
      evidenceQuality: "reported",
      sourceId: "import:unusualwhales",
    });
    expect(result.totals.confirmedOpenInterestChange).toBeNull();
    expect(result.totals.reportedOpenInterestChange).toBe(275);
  });

  it("calculates dated imported snapshots but keeps their quality reported", () => {
    const result = buildOptionFlowOpenInterestIntelligence([
      snapshot({
        openInterestAsOfDate: "2026-10-02",
        observedAt: "2026-10-05T12:00:00.000Z",
        openInterest: 900,
        oiTemporalStatus: "reported_by_source",
        sourceId: "import:other",
      }),
      snapshot({
        openInterestAsOfDate: "2026-10-05",
        observedAt: "2026-10-06T12:00:00.000Z",
        openInterest: 1_200,
        oiTemporalStatus: "reported_by_source",
        sourceId: "import:other",
      }),
    ]);

    expect(result.contracts[0]).toMatchObject({
      openInterestChange: 300,
      evidenceQuality: "reported",
    });
    expect(result.totals.confirmedOpenInterestChange).toBeNull();
    expect(result.totals.reportedOpenInterestChange).toBe(300);
  });

  it("does not promote a mixed-source comparison to verified evidence", () => {
    const result = buildOptionFlowOpenInterestIntelligence([
      snapshot({
        openInterestAsOfDate: "2026-10-02",
        observedAt: "2026-10-05T12:00:00.000Z",
        openInterest: 900,
        oiTemporalStatus: "reported_by_source",
        sourceId: "import:other",
      }),
      snapshot({
        openInterestAsOfDate: "2026-10-05",
        observedAt: "2026-10-06T12:00:00.000Z",
        openInterest: 1_200,
        oiTemporalStatus: "verified_prior_close",
        sourceId: "massive",
      }),
    ]);

    expect(result.contracts[0]).toMatchObject({
      openInterestChange: 300,
      evidenceQuality: "reported",
    });
    expect(result.totals.confirmedOpenInterestChange).toBeNull();
    expect(result.totals.reportedOpenInterestChange).toBe(300);
  });
});
