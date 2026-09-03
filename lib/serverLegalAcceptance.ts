import "server-only";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  type LegalAcceptanceSource,
  hasCurrentLegalAcceptance,
} from "@/lib/legalConsent";

function cleanHeaderValue(value: string | null, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength) || null;
}

function resolveRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return cleanHeaderValue(forwarded.split(",")[0] ?? "", 80);
  }
  return (
    cleanHeaderValue(req.headers.get("x-real-ip"), 80) ||
    cleanHeaderValue(req.headers.get("cf-connecting-ip"), 80)
  );
}

export async function getLegalAcceptanceStatus(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("legal_terms_version, legal_privacy_version, legal_accepted_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const accepted = hasCurrentLegalAcceptance({
    termsVersion: (data as any)?.legal_terms_version,
    privacyVersion: (data as any)?.legal_privacy_version,
    acceptedAt: (data as any)?.legal_accepted_at,
  });

  return {
    accepted,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    acceptedAt: ((data as any)?.legal_accepted_at as string | null) ?? null,
  };
}

export async function recordLegalAcceptance(args: {
  userId: string;
  source: LegalAcceptanceSource;
  req: Request;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const ip = resolveRequestIp(args.req);
  const userAgent = cleanHeaderValue(args.req.headers.get("user-agent"), 500);
  const isCheckout = args.source === "checkout" || args.source === "addon_checkout";
  const profilePayload: Record<string, unknown> = {
    legal_terms_version: CURRENT_TERMS_VERSION,
    legal_privacy_version: CURRENT_PRIVACY_VERSION,
    legal_accepted_at: now,
    legal_acceptance_ip: ip,
    legal_acceptance_user_agent: userAgent,
  };

  if (isCheckout) {
    profilePayload.legal_checkout_accepted_at = now;
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update(profilePayload)
    .eq("id", args.userId);

  if (profileError) throw profileError;

  const { error: eventError } = await supabaseAdmin
    .from("legal_acceptance_events")
    .insert({
      user_id: args.userId,
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      source: args.source,
      accepted_at: now,
      ip,
      user_agent: userAgent,
      metadata: args.metadata ?? {},
    });

  if (eventError) throw eventError;

  return {
    acceptedAt: now,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
  };
}
