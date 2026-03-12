import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import {
  isActiveEntitlementStatus,
  isActiveProfileStatus,
  PLATFORM_ACCESS_ENTITLEMENT,
  shouldAllowLocalProfileAccessFallback,
} from "@/lib/accessControl";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    const [{ data: profile }, { data: entitlements }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, subscription_status, onboarding_completed, plan, email")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_entitlements")
        .select("entitlement_key, status, metadata")
        .eq("user_id", userId),
    ]);

    let emailMatchedProfile: Record<string, any> | null = null;
    const allowLocalFallback = shouldAllowLocalProfileAccessFallback();

    if (!profile && allowLocalFallback && authData.user.email) {
      const { data: emailProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, subscription_status, onboarding_completed, plan, email")
        .ilike("email", authData.user.email)
        .order("created_at", { ascending: false })
        .limit(1);

      emailMatchedProfile = Array.isArray(emailProfiles) ? (emailProfiles[0] as Record<string, any> | null) : null;
    }

    const effectiveProfile = (profile as Record<string, any> | null) ?? emailMatchedProfile;

    const entitlementRows = Array.isArray(entitlements) ? entitlements : [];
    const hasPlatformAccess = entitlementRows.some(
      (row) =>
        String((row as any)?.entitlement_key ?? "") === PLATFORM_ACCESS_ENTITLEMENT &&
        isActiveEntitlementStatus((row as any)?.status)
    );

    const profileStatus = String((effectiveProfile as any)?.subscription_status ?? "");
    const hasAppAccess =
      hasPlatformAccess ||
      (allowLocalFallback && isActiveProfileStatus(profileStatus));

    return NextResponse.json({
      ok: true,
      userId,
      profile: {
        email: String((effectiveProfile as any)?.email ?? authData.user.email ?? ""),
        subscriptionStatus: profileStatus,
        onboardingCompleted: Boolean((effectiveProfile as any)?.onboarding_completed ?? false),
        plan: String((effectiveProfile as any)?.plan ?? ""),
        isProfileActive: isActiveProfileStatus(profileStatus),
      },
      entitlements: entitlementRows,
      hasPlatformAccess,
      hasAppAccess,
      diagnostics: {
        profileFoundById: Boolean(profile),
        profileFoundByEmail: Boolean(emailMatchedProfile),
        matchedProfileId: String((effectiveProfile as any)?.id ?? ""),
      },
    });
  } catch (err: any) {
    console.error("[access/status] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
