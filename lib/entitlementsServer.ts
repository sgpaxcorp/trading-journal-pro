import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { isActiveEntitlementStatus } from "@/lib/accessControl";

export async function hasActiveEntitlement(
  userId: string,
  entitlementKey: string
): Promise<boolean> {
  if (!userId || !entitlementKey) return false;
  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("status")
    .eq("user_id", userId)
    .eq("entitlement_key", entitlementKey)
    .maybeSingle();

  if (error || !data) return false;
  return isActiveEntitlementStatus((data as any).status);
}
