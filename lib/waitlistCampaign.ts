export const WAITLIST_CAMPAIGN = {
  name: "NeuroTrader 60-day launch waitlist",
  launchDateIso: "2026-11-02T00:00:00-04:00",
  launchDateLabel: {
    en: "November 2, 2026",
    es: "2 de noviembre de 2026",
  },
  launchDateTimeLabel: {
    en: "November 2, 2026 at 12:00 AM AST",
    es: "2 de noviembre de 2026 a las 12:00 AM AST",
  },
  discountLimit: 500,
  discountPercent: 30,
  discountPlan: "annual",
} as const;

export type WaitlistCampaign = typeof WAITLIST_CAMPAIGN;

export function normalizeWaitlistEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function isValidWaitlistEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeWaitlistEmail(email));
}

export function sanitizeWaitlistName(name: string) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function isAnnualDiscountReserved(position?: number | null) {
  return typeof position === "number" && position > 0 && position <= WAITLIST_CAMPAIGN.discountLimit;
}

export function waitlistSpotsRemaining(reservedCount: number) {
  const count = Number.isFinite(reservedCount) ? Math.max(0, Math.floor(reservedCount)) : 0;
  return Math.max(0, WAITLIST_CAMPAIGN.discountLimit - count);
}

export function waitlistProgressPercent(reservedCount: number) {
  const count = Number.isFinite(reservedCount) ? Math.max(0, Math.floor(reservedCount)) : 0;
  return Math.min(100, Math.round((count / WAITLIST_CAMPAIGN.discountLimit) * 100));
}
