import { describe, expect, it } from "vitest";
import {
  PLAN_PRICES,
  advancedUpgradePriceLabel,
  planBilledAmount,
  planMonthlyPrice,
} from "@/lib/planCatalog";

describe("plan catalog pricing", () => {
  it("keeps the approved public launch prices in one source of truth", () => {
    expect(PLAN_PRICES).toEqual({
      core: { monthly: 19.99, annual: 199.9 },
      advanced: { monthly: 39.99, annual: 399.9 },
    });
  });

  it("uses the annual billed amount while showing its monthly equivalent", () => {
    expect(planBilledAmount("core", "annual")).toBe(199.9);
    expect(planBilledAmount("advanced", "annual")).toBe(399.9);
    expect(planMonthlyPrice("core", "annual")).toBeCloseTo(16.6583, 4);
    expect(planMonthlyPrice("advanced", "annual")).toBeCloseTo(33.325, 4);
  });

  it("derives upgrade labels instead of hardcoding the price difference", () => {
    expect(advancedUpgradePriceLabel("en", "monthly")).toBe("+$20.00 more / month");
    expect(advancedUpgradePriceLabel("es", "annual")).toBe(
      "+$16.67 más / mes facturado anual"
    );
  });
});
