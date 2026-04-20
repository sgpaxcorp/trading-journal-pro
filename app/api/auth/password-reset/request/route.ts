import { NextRequest, NextResponse } from "next/server";
import { resolvePasswordRecoveryRedirect } from "@/lib/authRedirects";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { sendPasswordResetEmail } from "@/lib/email";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

type RecoveryProfileRow = {
  first_name?: string | null;
  last_name?: string | null;
};

export async function POST(req: NextRequest) {
  const rate = rateLimit(`auth-password-reset:${getClientIp(req)}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          ...rateLimitHeaders(rate),
        },
      }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    const redirectTo = resolvePasswordRecoveryRedirect(req.url, body?.redirectTo);
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo,
      },
    });

    if (!error && data?.properties?.action_link) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<RecoveryProfileRow>();

      const name = [String(profile?.first_name ?? "").trim(), String(profile?.last_name ?? "").trim()]
        .filter(Boolean)
        .join(" ");

      await sendPasswordResetEmail({
        email,
        name: name || undefined,
        resetUrl: data.properties.action_link,
      });
    } else if (error) {
      console.warn("[auth/password-reset] suppressed error:", error.message);
    }

    return NextResponse.json({
      ok: true,
      message: "If that account exists, a password reset email is on the way.",
    });
  } catch (err: unknown) {
    console.error("[auth/password-reset] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
