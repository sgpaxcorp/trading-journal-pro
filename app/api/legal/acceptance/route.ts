import { NextRequest, NextResponse } from "next/server";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  isCurrentLegalAcceptancePayload,
  type LegalAcceptanceSource,
} from "@/lib/legalConsent";
import { recordLegalAcceptance, getLegalAcceptanceStatus } from "@/lib/serverLegalAcceptance";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

async function getAuthedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { user: null, error: "Unauthorized" };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: "Unauthorized" };

  return { user: data.user, error: null };
}

function normalizeSource(raw: unknown): LegalAcceptanceSource {
  const value = String(raw ?? "").trim();
  if (value === "signup" || value === "start" || value === "checkout" || value === "addon_checkout") {
    return value;
  }
  return "in_app_update";
}

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const status = await getLegalAcceptanceStatus(user.id);
    return NextResponse.json({
      ...status,
      requiresAcceptance: !status.accepted,
    });
  } catch (err: any) {
    console.error("[legal/acceptance] GET error:", err);
    return NextResponse.json(
      {
        error: "Could not verify legal acceptance.",
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        requiresAcceptance: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (!isCurrentLegalAcceptancePayload(body)) {
      return NextResponse.json(
        {
          error: "You must accept the current Terms & Conditions and Privacy Policy.",
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
        },
        { status: 400 }
      );
    }

    const accepted = await recordLegalAcceptance({
      userId: user.id,
      source: normalizeSource(body?.source),
      req,
      metadata: {
        disclosureVersion: String(body?.disclosureVersion ?? ""),
        location: String(body?.location ?? ""),
      },
    });

    return NextResponse.json({ ok: true, ...accepted });
  } catch (err: any) {
    console.error("[legal/acceptance] POST error:", err);
    return NextResponse.json(
      { error: "Could not record legal acceptance." },
      { status: 500 }
    );
  }
}
