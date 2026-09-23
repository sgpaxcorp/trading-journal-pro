import "server-only";

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import {
  permissionsForAdmin,
  type AdminPermission,
  type AdminRole,
  normalizeAdminRole,
} from "@/lib/adminPermissions";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type AdminAuthOptions = {
  action?: string;
  permission?: AdminPermission;
  limit?: number;
  windowMs?: number;
};

export type AdminAccess = {
  isAdmin: boolean;
  role: AdminRole;
  permissions: AdminPermission[];
  source: "database" | "environment" | "none";
};

type AdminAuthResult =
  | { ok: true; user: User; access: AdminAccess }
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

export async function getAdminAccess(userId: string, email?: string | null): Promise<AdminAccess> {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, active, role, permissions")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!error && data?.user_id) {
    const role = normalizeAdminRole(data.role);
    return {
      isAdmin: true,
      role,
      permissions: permissionsForAdmin(role, data.permissions),
      source: "database",
    };
  }

  const allowList = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (email && allowList.includes(email.toLowerCase())) {
    return {
      isAdmin: true,
      role: "owner",
      permissions: permissionsForAdmin("owner"),
      source: "environment",
    };
  }

  return { isAdmin: false, role: "auditor", permissions: [], source: "none" };
}

export async function isAdminAccount(userId: string, email?: string | null): Promise<boolean> {
  return (await getAdminAccess(userId, email)).isAdmin;
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

  const access = await getAdminAccess(authData.user.id, authData.user.email);
  if (!access.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (options.permission && !access.permissions.includes(options.permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Insufficient admin permission", permission: options.permission },
        { status: 403 }
      ),
    };
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

  return { ok: true, user: authData.user, access };
}

export function requireAdminActionSecret(req: NextRequest, body: any) {
  const expected = String(process.env.ADMIN_ACTION_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Admin step-up verification is not configured." },
      { status: 503 }
    );
  }

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
