export const PLATFORM_ACCESS_ENTITLEMENT = "platform_access" as const;

const ACTIVE_PROFILE_STATUSES = new Set(["active", "trialing", "paid"]);
const ACTIVE_ENTITLEMENT_STATUSES = new Set(["active", "trialing"]);

export function normalizeAccessStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isActiveProfileStatus(value: unknown): boolean {
  return ACTIVE_PROFILE_STATUSES.has(normalizeAccessStatus(value));
}

export function isActiveEntitlementStatus(value: unknown): boolean {
  return ACTIVE_ENTITLEMENT_STATUSES.has(normalizeAccessStatus(value));
}

export function normalizeSubscriptionStatusToEntitlement(value: unknown): string {
  const normalized = normalizeAccessStatus(value);
  if (normalized === "paid") return "active";
  return normalized || "inactive";
}

export function shouldAllowLocalProfileAccessFallback(): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      return true;
    }
  }

  return false;
}
