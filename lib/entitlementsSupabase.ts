import { supabaseBrowser } from "@/lib/supaBaseClient";

export type EntitlementStatus =
  | "active"
  | "inactive"
  | "canceled"
  | "past_due"
  | "trialing";

export type UserEntitlement = {
  id: string;
  user_id: string;
  entitlement_key: string;
  status: EntitlementStatus;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  started_at?: string | null;
  ends_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function normalizeEntitlement(row: any): UserEntitlement {
  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? row?.userId ?? ""),
    entitlement_key: String(row?.entitlement_key ?? row?.key ?? ""),
    status: String(row?.status ?? "inactive") as EntitlementStatus,
    stripe_customer_id: row?.stripe_customer_id ?? null,
    stripe_subscription_id: row?.stripe_subscription_id ?? null,
    stripe_price_id: row?.stripe_price_id ?? null,
    started_at: row?.started_at ?? null,
    ends_at: row?.ends_at ?? null,
    metadata: (row?.metadata ?? null) as Record<string, unknown> | null,
  };
}

async function fetchEntitlementsViaApi(): Promise<UserEntitlement[] | null> {
  if (typeof window === "undefined") return null;
  try {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;

    const res = await fetch("/api/entitlements/list", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const rows = Array.isArray(body?.entitlements) ? body.entitlements : [];
    return rows.map(normalizeEntitlement);
  } catch {
    return null;
  }
}

export async function listMyEntitlements(userId: string): Promise<UserEntitlement[]> {
  if (!userId) return [];

  const { data, error } = await supabaseBrowser
    .from("user_entitlements")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    const fallback = await fetchEntitlementsViaApi();
    if (fallback) return fallback;
    return [];
  }

  return (data ?? []).map(normalizeEntitlement);
}

export async function hasEntitlement(
  userId: string,
  entitlementKey: string
): Promise<boolean> {
  if (!userId || !entitlementKey) return false;
  const entitlements = await listMyEntitlements(userId);
  return entitlements.some(
    (e) =>
      e.entitlement_key === entitlementKey &&
      (e.status === "active" || e.status === "trialing")
  );
}
