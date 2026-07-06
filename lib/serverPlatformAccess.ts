import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { hasAnyRecognizedAccessGrant } from "@/lib/accessGrants";
import {
  isActiveEntitlementStatus,
  isActiveProfileStatus,
  PLATFORM_ACCESS_ENTITLEMENT,
  shouldAllowLocalProfileAccessFallback,
} from "@/lib/accessControl";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type EntitlementRow = {
  entitlement_key?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ProfileRow = {
  id?: string | null;
  email?: string | null;
  subscription_status?: string | null;
  onboarding_completed?: boolean | null;
  plan?: string | null;
};

export type AuthenticatedApiUser = {
  token: string;
  user: User;
  userId: string;
};

export type PlatformAccessContext = AuthenticatedApiUser & {
  profile: ProfileRow | null;
  entitlements: EntitlementRow[];
  hasPlatformAccess: boolean;
  hasScopedAccess: boolean;
  hasAppAccess: boolean;
};

type AuthResult =
  | { ok: true; context: AuthenticatedApiUser }
  | { ok: false; response: NextResponse };

type AccessResult =
  | { ok: true; context: PlatformAccessContext }
  | { ok: false; response: NextResponse };

export function subscriptionRequiredResponse(message = "Active business access required.") {
  return NextResponse.json(
    {
      error: message,
      code: "platform_access_required",
    },
    { status: 403 }
  );
}

export async function authenticateApiUser(req: Request | NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return {
    ok: true,
    context: {
      token,
      user: authData.user,
      userId: authData.user.id,
    },
  };
}

export async function loadPlatformAccessForUser(user: User): Promise<Omit<PlatformAccessContext, keyof AuthenticatedApiUser>> {
  const userId = user.id;
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

  let emailMatchedProfile: ProfileRow | null = null;
  const allowLocalFallback = shouldAllowLocalProfileAccessFallback();

  if (!profile && allowLocalFallback && user.email) {
    const { data: emailProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, subscription_status, onboarding_completed, plan, email")
      .ilike("email", user.email)
      .order("created_at", { ascending: false })
      .limit(1);

    emailMatchedProfile = Array.isArray(emailProfiles) ? ((emailProfiles[0] as ProfileRow | undefined) ?? null) : null;
  }

  const effectiveProfile = ((profile as ProfileRow | null) ?? emailMatchedProfile) || null;
  const entitlementRows = Array.isArray(entitlements) ? (entitlements as EntitlementRow[]) : [];
  const hasPlatformAccess = entitlementRows.some(
    (row) =>
      String(row?.entitlement_key ?? "") === PLATFORM_ACCESS_ENTITLEMENT &&
      isActiveEntitlementStatus(row?.status)
  );
  const hasScopedAccess = hasAnyRecognizedAccessGrant(entitlementRows);
  const hasAppAccess =
    hasPlatformAccess ||
    hasScopedAccess ||
    (allowLocalFallback && isActiveProfileStatus(effectiveProfile?.subscription_status));

  return {
    profile: effectiveProfile,
    entitlements: entitlementRows,
    hasPlatformAccess,
    hasScopedAccess,
    hasAppAccess,
  };
}

export async function requirePlatformAccess(req: Request | NextRequest): Promise<AccessResult> {
  const auth = await authenticateApiUser(req);
  if (!auth.ok) return auth;

  const access = await loadPlatformAccessForUser(auth.context.user);
  if (!access.hasAppAccess) {
    return { ok: false, response: subscriptionRequiredResponse() };
  }

  return {
    ok: true,
    context: {
      ...auth.context,
      ...access,
    },
  };
}
