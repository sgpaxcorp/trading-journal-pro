import { describe, expect, it } from "vitest";

import {
  calendarDateToIso,
  getNextBillingEvent,
  getRenewalNoticeStage,
} from "../../lib/profitLossRenewals";

describe("profit and loss renewal schedules", () => {
  it("calculates the next annual anniversary from the original start date", () => {
    const event = getNextBillingEvent(
      { billing_cycle: "annual", starts_at: "2024-10-15", auto_renews: true },
      new Date(2026, 8, 15)
    );

    expect(event?.kind).toBe("renewal");
    expect(event && calendarDateToIso(event.date)).toBe("2026-10-15");
  });

  it("does not treat a new subscription start date as its renewal date", () => {
    const event = getNextBillingEvent(
      { billing_cycle: "annual", starts_at: "2026-09-15", auto_renews: true },
      new Date(2026, 8, 15)
    );

    expect(event && calendarDateToIso(event.date)).toBe("2027-09-15");
  });

  it("uses an explicit next-renewal date", () => {
    const event = getNextBillingEvent(
      {
        billing_cycle: "annual",
        starts_at: "2024-03-01",
        next_renewal_at: "2026-11-20",
        auto_renews: true,
      },
      new Date(2026, 8, 15)
    );

    expect(event && calendarDateToIso(event.date)).toBe("2026-11-20");
  });

  it("preserves end-of-month billing without overflowing into the next month", () => {
    const februaryEvent = getNextBillingEvent(
      { billing_cycle: "monthly", starts_at: "2026-01-31", auto_renews: true },
      new Date(2026, 1, 1)
    );
    const marchEvent = getNextBillingEvent(
      { billing_cycle: "monthly", starts_at: "2026-01-31", auto_renews: true },
      new Date(2026, 2, 1)
    );

    expect(februaryEvent && calendarDateToIso(februaryEvent.date)).toBe("2026-02-28");
    expect(marchEvent && calendarDateToIso(marchEvent.date)).toBe("2026-03-31");
  });

  it("treats a non-renewing subscription date as an expiration", () => {
    const event = getNextBillingEvent(
      {
        billing_cycle: "annual",
        next_renewal_at: "2026-10-15",
        auto_renews: false,
      },
      new Date(2026, 8, 15)
    );

    expect(event?.kind).toBe("expiration");
    expect(event && calendarDateToIso(event.date)).toBe("2026-10-15");
  });

  it("warns for any date in the next calendar month even when it is more than 30 days away", () => {
    const event = getNextBillingEvent(
      { billing_cycle: "annual", next_renewal_at: "2026-10-31", auto_renews: true },
      new Date(2026, 8, 1)
    );

    expect(event && getRenewalNoticeStage(event, new Date(2026, 8, 1), 7)).toBe("next_month");
  });

  it("does not schedule a renewal after the contract end date", () => {
    const event = getNextBillingEvent(
      {
        billing_cycle: "annual",
        starts_at: "2024-10-15",
        ends_at: "2026-09-30",
        auto_renews: true,
      },
      new Date(2026, 8, 15)
    );

    expect(event).toBeNull();
  });
});
