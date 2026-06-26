import "server-only";

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type AdminAuthOptions = {
  action?: string;
  limit?: number;
  windowMs?: number;
};

type AdminAuthResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

function parseAdminEmails(envValue?: string | null) {
  return (envValue || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isAdminAccount(userId: string, email?: string | null): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, active")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);
  if (!error && (data ?? []).length > 0) return true;

  const allowList = parseAdminEmails(process.env.ADMIN_EMAILS);
  return Boolean(email && allowList.includes(email.toLowerCase()));
}

export async function requireAdminUser(
  req: NextRequest,
  options: AdminAuthOptions = {}
): Promise<AdminAuthResult> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const allowed = await isAdminAccount(authData.user.id, authData.user.email);
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const action = options.action || "read";
  const limiter = await rateLimit(`admin:${action}:${authData.user.id}:${getClientIp(req)}`, {
    limit: options.limit ?? 120,
    windowMs: options.windowMs ?? 60_000,
  });
  if (!limiter.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(limiter),
          },
        }
      ),
    };
  }

  return { ok: true, user: authData.user };
}

export function requireAdminActionSecret(req: NextRequest, body: any) {
  const expected = String(process.env.ADMIN_ACTION_SECRET || "").trim();
  if (!expected) return null;

  const provided = String(
    req.headers.get("x-admin-action-secret") || body?.adminActionSecret || ""
  ).trim();
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "Admin step-up verification required." },
      { status: 403 }
    );
  }

  return null;
}
