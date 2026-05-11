import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { sendEmailConfirmationEmail } from "@/lib/email";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Body = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  address?: string;
  plan?: string;
  source?: "signup" | "start";
};

function splitFullName(fullName: string) {
  const clean = fullName.trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };
  const parts = clean.split(" ");
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

export async function POST(req: NextRequest) {
  const rate = await rateLimit(`auth-signup:${getClientIp(req)}`, {
    limit: 8,
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
    const body = (await req.json().catch(() => ({}))) as Body;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const plan = String(body?.plan ?? "core").toLowerCase() === "advanced" ? "advanced" : "core";
    const source = body?.source === "start" ? "start" : "signup";
    const derivedName = splitFullName(String(body?.fullName ?? ""));
    const firstName = String(body?.firstName ?? derivedName.firstName ?? "").trim();
    const lastName = String(body?.lastName ?? derivedName.lastName ?? "").trim();
    const fullName = `${firstName} ${lastName}`.trim() || String(body?.fullName ?? "").trim() || "Trader";
    const phone = String(body?.phone ?? "").trim() || null;
    const postalAddress = String(body?.address ?? "").trim() || null;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const continueUrl = source === "start" ? `${origin}/start?step=2` : `${origin}/signup?verify=1`;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo: `${origin}/signin?confirmed=1`,
        data: {
          full_name: fullName,
          first_name: firstName || null,
          last_name: lastName || null,
          phone,
          postal_address: postalAddress,
          plan,
          selected_plan_initial: plan,
          subscription_status: "pending",
        },
      },
    });

    if (error || !data?.user || !data?.properties?.email_otp) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to create account." },
        { status: 400 }
      );
    }

    const userId = data.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        phone,
        postal_address: postalAddress,
        plan,
        subscription_status: "pending",
        onboarding_completed: false,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      console.error("[auth/signup] profile upsert error:", profileError);
    }

    await sendEmailConfirmationEmail({
      email,
      name: firstName || fullName,
      confirmationCode: data.properties.email_otp,
      continueUrl,
    });

    return NextResponse.json({
      ok: true,
      userId,
      email,
    });
  } catch (err: any) {
    console.error("[auth/signup] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
