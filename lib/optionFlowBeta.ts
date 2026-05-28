export {
  getOptionFlowBetaApiPayload,
  getOptionFlowBetaCopy,
  resolveOptionFlowLang,
  type OptionFlowLang,
} from "@/lib/optionFlowBetaCopy";

const OPTION_FLOW_ENTITLEMENT_KEY = "option_flow";

export async function hasOptionFlowBetaAccess(userId?: string | null): Promise<boolean> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return false;

  const { isSmartToolsOwner } = await import("@/lib/smartToolsAccess");
  if (await isSmartToolsOwner({ userId: normalizedUserId })) return true;

  if (String(process.env.SMART_TOOLS_CLOSED_BETA ?? "true").toLowerCase() !== "false") {
    return false;
  }

  const { supabaseAdmin } = await import("@/lib/supaBaseAdmin");
  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("status")
    .eq("user_id", normalizedUserId)
    .eq("entitlement_key", OPTION_FLOW_ENTITLEMENT_KEY)
    .in("status", ["active", "trialing"])
    .limit(1);

  if (error) return false;
  return (data ?? []).length > 0;
}
