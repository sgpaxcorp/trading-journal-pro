import { describe, expect, it } from "vitest";

import {
  WAITLIST_CAMPAIGN,
  isAnnualDiscountReserved,
  isValidWaitlistEmail,
  normalizeWaitlistEmail,
  sanitizeWaitlistName,
  waitlistProgressPercent,
  waitlistSpotsRemaining,
} from "@/lib/waitlistCampaign";

describe("waitlist campaign", () => {
  it("keeps the launch campaign terms in one source of truth", () => {
    expect(WAITLIST_CAMPAIGN.discountLimit).toBe(500);
    expect(WAITLIST_CAMPAIGN.discountPercent).toBe(30);
    expect(WAITLIST_CAMPAIGN.discountPlan).toBe("annual");
    expect(WAITLIST_CAMPAIGN.launchDateIso).toBe("2026-11-02T00:00:00-04:00");
    expect(new Date(WAITLIST_CAMPAIGN.launchDateIso).toISOString()).toBe("2026-11-02T04:00:00.000Z");
    expect(WAITLIST_CAMPAIGN.launchDateTimeLabel.es).toContain("12:00 AM AST");
  });

  it("normalizes and validates waitlist emails", () => {
    expect(normalizeWaitlistEmail(" Trader@Example.COM ")).toBe("trader@example.com");
    expect(isValidWaitlistEmail("trader@example.com")).toBe(true);
    expect(isValidWaitlistEmail("not-an-email")).toBe(false);
  });

  it("reserves annual discounts only for the first 500 positions", () => {
    expect(isAnnualDiscountReserved(1)).toBe(true);
    expect(isAnnualDiscountReserved(500)).toBe(true);
    expect(isAnnualDiscountReserved(501)).toBe(false);
    expect(isAnnualDiscountReserved(null)).toBe(false);
  });

  it("derives remaining spots and progress safely", () => {
    expect(waitlistSpotsRemaining(0)).toBe(500);
    expect(waitlistSpotsRemaining(125)).toBe(375);
    expect(waitlistSpotsRemaining(600)).toBe(0);
    expect(waitlistProgressPercent(125)).toBe(25);
    expect(waitlistProgressPercent(600)).toBe(100);
  });

  it("keeps display names short and clean", () => {
    expect(sanitizeWaitlistName("  Steven   Otero  ")).toBe("Steven Otero");
    expect(sanitizeWaitlistName("x".repeat(180))).toHaveLength(120);
  });
});
