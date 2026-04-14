import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { sendAccountRecoveryEmail } from "@/lib/email";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rate = rateLimit(`auth-account-recovery:${getClientIp(req)}`, {
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

    const origin = new URL(req.url).origin;
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${origin}/reset-password`,
      },
    });

    if (!error && data?.properties?.action_link) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const name = [String((profile as any)?.first_name ?? "").trim(), String((profile as any)?.last_name ?? "").trim()]
        .filter(Boolean)
        .join(" ");

      await sendAccountRecoveryEmail({
        email,
        name: name || undefined,
        accountEmail: email,
        resetUrl: data.properties.action_link,
      });
    } else if (error) {
      console.warn("[auth/account-recovery] suppressed error:", error.message);
    }

    return NextResponse.json({
      ok: true,
      message: "If that account exists, a recovery email is on the way.",
    });
  } catch (err: any) {
    console.error("[auth/account-recovery] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
