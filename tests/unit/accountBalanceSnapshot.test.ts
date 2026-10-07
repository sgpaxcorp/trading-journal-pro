import { describe, expect, it } from "vitest";
import {
  advanceActualAccountBalance,
  endingBalanceFromJournalNotes,
  resolveAccountEquity,
  resolveAccountSeriesRange,
} from "@/lib/accountBalanceSnapshot";

describe("account balance snapshots", () => {
  it("reads an ending balance only for its matching journal date", () => {
    const notes = JSON.stringify({
      account_balance: {
        endingBalance: 1027.56,
        asOfDate: "2026-09-08",
        source: "broker_statement",
      },
    });

    expect(endingBalanceFromJournalNotes(notes, "2026-09-08")).toBe(1027.56);
    expect(endingBalanceFromJournalNotes(notes, "2026-09-09")).toBeNull();
  });

  it("uses the broker ending balance as the authoritative close for that day", () => {
    expect(
      advanceActualAccountBalance({
        currentBalance: 1000,
        tradingPnl: 19.35,
        cashflow: 0,
        endingBalance: 1027.56,
      })
    ).toBe(1027.56);
  });

  it("continues from the latest statement balance on following days", () => {
    expect(
      advanceActualAccountBalance({
        currentBalance: 1027.56,
        tradingPnl: -10,
        cashflow: 0,
      })
    ).toBe(1017.56);
  });

  it("prefers synchronized account equity without adding cashflow twice", () => {
    expect(
      resolveAccountEquity({
        startingBalance: 1008.21,
        tradingPnl: -618.73,
        cashflow: 1000,
        syncedCurrentBalance: 1022.43,
      })
    ).toEqual({
      accountEquity: 1022.43,
      estimatedEquity: 1389.48,
      reconciliationAdjustment: -367.05,
      source: "synced",
    });
  });

  it("falls back to the ledger estimate when no synchronized balance exists", () => {
    expect(
      resolveAccountEquity({
        startingBalance: 1008.21,
        tradingPnl: -618.73,
        cashflow: 1000,
      })
    ).toMatchObject({
      accountEquity: 1389.48,
      estimatedEquity: 1389.48,
      source: "calculated",
    });
  });

  it("includes actual activity that happened before a future plan start", () => {
    expect(
      resolveAccountSeriesRange({
        planStartIso: "2026-09-14",
        earliestActivityIso: "2026-09-08",
        latestActivityIso: "2026-09-08",
        todayIso: "2026-09-08",
      })
    ).toEqual({
      startIso: "2026-09-08",
      endIso: "2026-09-08",
      hasPrePlanActivity: true,
      earliestActivityIso: "2026-09-08",
    });
  });

  it("uses the plan start when no earlier account activity exists", () => {
    expect(
      resolveAccountSeriesRange({
        planStartIso: "2026-09-14",
        todayIso: "2026-09-08",
      })
    ).toMatchObject({
      startIso: "2026-09-14",
      endIso: "2026-09-14",
      hasPrePlanActivity: false,
    });
  });
});
