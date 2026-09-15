import { NextRequest, NextResponse } from "next/server";

import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  hasCurrentLegalAcceptance,
} from "@/lib/legalConsent";
import {
  authenticateApiUser,
  loadPlatformAccessForUser,
} from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApiUser(req);
    if (!auth.ok) return auth.response;

    const access = await loadPlatformAccessForUser(auth.context.user);
    const legalAccepted = hasCurrentLegalAcceptance({
      termsVersion: access.profile?.legal_terms_version,
      privacyVersion: access.profile?.legal_privacy_version,
      acceptedAt: access.profile?.legal_accepted_at,
    });

    return NextResponse.json({
      access: {
        hasAppAccess: access.hasAppAccess,
        hasPlatformAccess: access.hasPlatformAccess,
        hasScopedAccess: access.hasScopedAccess,
      },
      legal: {
        accepted: legalAccepted,
        requiresAcceptance: !legalAccepted,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        acceptedAt: access.profile?.legal_accepted_at ?? null,
      },
    });
  } catch (err: any) {
    console.error("[mobile/bootstrap] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unable to initialize the mobile workspace." },
      { status: 500 }
    );
  }
}
