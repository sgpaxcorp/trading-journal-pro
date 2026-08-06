import { NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { sendPasswordChangedEmail } from "@/lib/email";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type Body = {
  locale?: string;
};

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limiter = await rateLimit(`password-changed-email:${auth.userId}:${getClientIp(req)}`, {
      limit: 6,
      windowMs: 60 * 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many password security email attempts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email,first_name,last_name")
      .eq("id", auth.userId)
      .maybeSingle();

    const email = String(profile?.email ?? auth.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "No valid account email found." }, { status: 400 });
    }

    const firstName = String(profile?.first_name ?? "").trim();
    const lastName = String(profile?.last_name ?? "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    await sendPasswordChangedEmail({
      email,
      name: fullName || null,
      userId: auth.userId,
      locale: String(body?.locale ?? "").trim() || null,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[auth/password-changed] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
