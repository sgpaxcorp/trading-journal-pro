import { describe, expect, it } from "vitest";

import {
  addTradingRunway,
  getNyseFullClosureDates,
  inferTradingRunway,
  listTradingSessionsBetween,
} from "../../lib/tradingCalendar";

describe("trading calendar", () => {
  it("excludes the observed Independence Day closure for stocks and options", () => {
    expect(listTradingSessionsBetween("2026-07-02", "2026-07-06", "stocks")).toEqual([
      "2026-07-02",
      "2026-07-06",
    ]);
    expect(listTradingSessionsBetween("2026-07-02", "2026-07-06", "options")).toEqual([
      "2026-07-02",
      "2026-07-06",
    ]);
  });

  it("keeps product-specific futures weekdays and 24/7 crypto sessions", () => {
    expect(listTradingSessionsBetween("2026-07-02", "2026-07-06", "futures")).toEqual([
      "2026-07-02",
      "2026-07-03",
      "2026-07-06",
    ]);
    expect(listTradingSessionsBetween("2026-07-02", "2026-07-06", "crypto")).toHaveLength(5);
  });

  it("counts early-close dates as sessions", () => {
    expect(listTradingSessionsBetween("2026-11-27", "2026-11-27", "stocks")).toEqual([
      "2026-11-27",
    ]);
  });

  it("does not observe a Saturday New Year's Day on the prior Friday", () => {
    expect(getNyseFullClosureDates(2028)).not.toContain("2027-12-31");
    expect(listTradingSessionsBetween("2027-12-31", "2027-12-31", "stocks")).toEqual([
      "2027-12-31",
    ]);
  });

  it("adds and infers calendar runway without overflowing short months", () => {
    expect(addTradingRunway("2026-01-31", 1, "months")).toBe("2026-02-28");
    expect(addTradingRunway("2026-08-12", 1, "years")).toBe("2027-08-12");
    expect(inferTradingRunway("2026-08-12", "2027-08-12")).toEqual({ amount: 1, unit: "years" });
  });
});
