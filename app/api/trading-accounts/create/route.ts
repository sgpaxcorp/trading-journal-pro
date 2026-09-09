import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { isActiveEntitlementStatus, PLATFORM_ACCESS_ENTITLEMENT } from "@/lib/accessControl";
import { normalizePlanTier, planFromProfile } from "@/lib/planAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import {
  defaultFundedAccountProfile,
  fundedProfileToDatabase,
  getFundedProfileMissingFields,
  normalizeFundedAccountProfile,
  normalizeTradingAccountType,
} from "@/lib/fundedAccounts";

export const runtime = "nodejs";

const MAX_ACCOUNT_NAME_LENGTH = 80;
const MAX_BROKER_NAME_LENGTH = 80;

function maxAccountsForPlan(planRaw: string | null | undefined): number {
  const plan = normalizePlanTier(planRaw);
  if (plan === "advanced") return 999;
  return 5;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;
    const limiter = await rateLimit(`trading-account-create:${userId}:${getClientIp(req)}`, {
      limit: 12,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many account creation attempts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim().slice(0, MAX_ACCOUNT_NAME_LENGTH);
    const broker = String(body?.broker || "").trim().slice(0, MAX_BROKER_NAME_LENGTH) || null;
    const accountType = normalizeTradingAccountType(body?.accountType ?? body?.account_type);
    const requestedFundedProfile = accountType === "funded"
      ? normalizeFundedAccountProfile(body?.fundedProfile ?? body?.funded_profile) ??
        defaultFundedAccountProfile()
      : null;

    if (!name) {
      return NextResponse.json({ error: "Missing account name" }, { status: 400 });
    }
    const missingFundedFields = getFundedProfileMissingFields(requestedFundedProfile);
    if (accountType === "funded" && missingFundedFields.length) {
      return NextResponse.json(
        {
          error: "Complete and confirm the funded-account rules before creating the account.",
          fields: missingFundedFields,
        },
        { status: 400 }
      );
    }

    const entitlementRows = access.context.entitlements;
    const profile = access.context.profile;

    const platformEntitlement = entitlementRows.find(
      (row) => String((row as any)?.entitlement_key ?? "") === PLATFORM_ACCESS_ENTITLEMENT
    );
    const planFromEntitlement =
      platformEntitlement && isActiveEntitlementStatus((platformEntitlement as any).status)
        ? normalizePlanTier((platformEntitlement as any)?.metadata?.plan)
        : "none";
    const maxAccounts = maxAccountsForPlan(
      planFromEntitlement !== "none" ? planFromEntitlement : planFromProfile(profile as any)
    );

    const { data: existing, error: countErr } = await supabaseAdmin
      .from("trading_accounts")
      .select("id, is_default")
      .eq("user_id", userId);

    if (countErr) throw countErr;

    const currentCount = (existing ?? []).length;
    if (currentCount >= maxAccounts) {
      return NextResponse.json(
        { error: "Account limit reached for your plan." },
        { status: 403 }
      );
    }

    const isDefault = currentCount === 0;

    const { data: created, error: createErr } = await supabaseAdmin
      .from("trading_accounts")
      .insert({
        user_id: userId,
        name,
        broker,
        account_type: accountType,
        is_default: isDefault,
      })
      .select("id, user_id, name, broker, account_type, is_default, created_at, updated_at")
      .single();

    if (createErr) throw createErr;

    let fundedProfile = null;
    if (accountType === "funded" && created?.id) {
      const normalized = requestedFundedProfile ?? defaultFundedAccountProfile();
      const profileRow = {
        account_id: created.id,
        user_id: userId,
        ...fundedProfileToDatabase({ ...normalized, rulesVersion: 1 }),
        rules_version: 1,
      };
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from("funded_account_profiles")
        .insert(profileRow)
        .select("*")
        .single();
      if (profileErr) {
        await supabaseAdmin.from("trading_accounts").delete().eq("id", created.id).eq("user_id", userId);
        throw profileErr;
      }
      fundedProfile = normalizeFundedAccountProfile(profile);
      await supabaseAdmin.from("funded_account_events").insert({
        account_id: created.id,
        user_id: userId,
        event_type: "created",
        to_stage: fundedProfile?.stage ?? "evaluation",
        rules_version: 1,
        snapshot: profileRow,
      });
    }

    if (isDefault && created?.id) {
      await supabaseAdmin
        .from("user_preferences")
        .upsert(
          { user_id: userId, active_account_id: created.id, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    }

    return NextResponse.json({
      account: {
        ...created,
        account_type: accountType,
        funded_profile: fundedProfile,
      },
    });
  } catch (err: any) {
    console.error("[trading-accounts/create] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
