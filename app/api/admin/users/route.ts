import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { ACCESS_GRANTS, isAccessGrantKey, type AccessGrantKey } from "@/lib/accessGrants";

function parseAdminEmails(envValue?: string | null) {
  return (envValue || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(userId: string, email?: string | null): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, active")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);
  if (!error && (data ?? []).length > 0) return true;

  const allowList = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (email && allowList.includes(email.toLowerCase())) return true;
  return false;
}

async function getAdminAuth(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return null;

  const ok = await isAdmin(authData.user.id, authData.user.email);
  if (!ok) return null;
  return authData.user;
}

async function findAuthUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) throw error;

    const users = data?.users ?? [];
    const hit = users.find((user) => String(user.email ?? "").toLowerCase() === normalized);
    if (hit) return hit;
    if (users.length < 200) break;
  }

  return null;
}

async function upsertProfile(params: {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("plan, onboarding_completed, subscription_status")
    .eq("id", params.userId)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    id: params.userId,
    email: params.email,
    first_name: params.firstName || null,
    last_name: params.lastName || null,
    subscription_status: (existing as any)?.subscription_status ?? "active",
    plan: (existing as any)?.plan ?? "core",
    onboarding_completed: Boolean((existing as any)?.onboarding_completed ?? false),
  };

  const { error } = await supabaseAdmin.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

async function syncAdminEntitlements(userId: string, keys: AccessGrantKey[]) {
  const now = new Date().toISOString();
  const selected = new Set<AccessGrantKey>(keys);
  const allKeys = ACCESS_GRANTS.map((grant) => grant.key);
  const toDisable = allKeys.filter((key) => !selected.has(key));

  if (keys.length > 0) {
    const rows = keys.map((key) => ({
      user_id: userId,
      entitlement_key: key,
      status: "active",
      source: "admin",
      started_at: now,
      ends_at: null,
      metadata: {
        granted_via: "admin_panel",
        manual: true,
      },
    }));

    const { error } = await supabaseAdmin.from("user_entitlements").upsert(rows, {
      onConflict: "user_id,entitlement_key",
    });
    if (error) throw error;
  }

  if (toDisable.length > 0) {
    const { error } = await supabaseAdmin
      .from("user_entitlements")
      .update({
        status: "inactive",
        ends_at: now,
        updated_at: now,
      })
      .eq("user_id", userId)
      .in("entitlement_key", toDisable)
      .in("source", ["admin", "manual", "demo"]);

    if (error) throw error;
  }
}

function toISO(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

type AdminUserSummary = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  bannedUntil: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  showInRanking: boolean;
  sessions30d: number;
  events30d: number;
  activeEntitlements: string[];
  accessSource: string | null;
};

type Body = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  accessKeys?: string[];
};

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const firstName = String(body?.firstName ?? "").trim();
    const lastName = String(body?.lastName ?? "").trim();
    const rawAccessKeys = Array.isArray(body?.accessKeys) ? body.accessKeys : [];
    const accessKeys = Array.from(
      new Set(
        rawAccessKeys
          .map((value) => String(value))
          .filter((value): value is AccessGrantKey => isAccessGrantKey(value))
      )
    );

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }

    if (!accessKeys.length) {
      return NextResponse.json(
        { error: "Select at least one access grant." },
        { status: 400 }
      );
    }

    let authUser = await findAuthUserByEmail(email);
    const isNewUser = !authUser;

    if (!authUser) {
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters for new users." },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName || null,
          last_name: lastName || null,
          plan: "core",
          subscriptionStatus: "active",
          accessSource: "admin",
        },
      });

      if (error || !data?.user) {
        return NextResponse.json(
          { error: error?.message ?? "Failed to create user." },
          { status: 500 }
        );
      }

      authUser = data.user;
    } else {
      const updatePayload: Record<string, unknown> = {
        user_metadata: {
          ...(authUser.user_metadata ?? {}),
          first_name: firstName || (authUser.user_metadata as any)?.first_name || null,
          last_name: lastName || (authUser.user_metadata as any)?.last_name || null,
          plan: (authUser.user_metadata as any)?.plan ?? "core",
          subscriptionStatus: "active",
          accessSource: "admin",
        },
      };

      if (password.length >= 8) {
        updatePayload.password = password;
      }

      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        authUser.id,
        updatePayload
      );

      if (error || !data?.user) {
        return NextResponse.json(
          { error: error?.message ?? "Failed to update user." },
          { status: 500 }
        );
      }

      authUser = data.user;
    }

    await upsertProfile({
      userId: authUser.id,
      email,
      firstName,
      lastName,
    });

    await syncAdminEntitlements(authUser.id, accessKeys);

    return NextResponse.json({
      ok: true,
      created: isNewUser,
      user: {
        id: authUser.id,
        email,
      },
      accessKeys,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const users: any[] = [];
    for (let page = 1; page <= 25; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw error;
      const batch = data?.users ?? [];
      users.push(...batch);
      if (batch.length < 200) break;
    }

    const userIds = users.map((user) => String(user.id)).filter(Boolean);
    if (!userIds.length) {
      return NextResponse.json({ ok: true, users: [] });
    }

    const since30 = toISO(30);
    const since120 = toISO(120);

    const [{ data: profiles }, { data: entitlements }, { data: sessions30 }, { data: sessions120 }, { data: events30 }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id,email,first_name,last_name,plan,subscription_status,show_in_ranking,created_at")
          .in("id", userIds),
        supabaseAdmin
          .from("user_entitlements")
          .select("user_id,entitlement_key,status,source")
          .in("user_id", userIds),
        supabaseAdmin
          .from("usage_sessions")
          .select("user_id")
          .in("user_id", userIds)
          .gte("started_at", since30),
        supabaseAdmin
          .from("usage_sessions")
          .select("user_id,last_seen_at,started_at")
          .in("user_id", userIds)
          .gte("started_at", since120),
        supabaseAdmin
          .from("usage_events")
          .select("user_id")
          .in("user_id", userIds)
          .gte("created_at", since30),
      ]);

    const profilesById = new Map<string, any>((profiles ?? []).map((row: any) => [String(row.id), row]));
    const activeEntitlementsByUser = new Map<string, string[]>();
    const accessSourceByUser = new Map<string, string | null>();
    for (const row of entitlements ?? []) {
      const userId = String((row as any).user_id ?? "");
      if (!userId) continue;
      const status = String((row as any).status ?? "").toLowerCase();
      if (status === "active" || status === "trialing" || status === "paid") {
        const current = activeEntitlementsByUser.get(userId) ?? [];
        current.push(String((row as any).entitlement_key ?? ""));
        activeEntitlementsByUser.set(userId, current);
      }
      if (!accessSourceByUser.has(userId)) {
        accessSourceByUser.set(userId, ((row as any).source as string | null) ?? null);
      }
    }

    const sessions30ByUser = new Map<string, number>();
    for (const row of sessions30 ?? []) {
      const userId = String((row as any).user_id ?? "");
      if (!userId) continue;
      sessions30ByUser.set(userId, (sessions30ByUser.get(userId) ?? 0) + 1);
    }

    const events30ByUser = new Map<string, number>();
    for (const row of events30 ?? []) {
      const userId = String((row as any).user_id ?? "");
      if (!userId) continue;
      events30ByUser.set(userId, (events30ByUser.get(userId) ?? 0) + 1);
    }

    const lastActiveByUser = new Map<string, string>();
    for (const row of sessions120 ?? []) {
      const userId = String((row as any).user_id ?? "");
      const lastSeenAt = String((row as any).last_seen_at ?? (row as any).started_at ?? "");
      if (!userId || !lastSeenAt) continue;
      const existing = lastActiveByUser.get(userId);
      if (!existing || lastSeenAt > existing) lastActiveByUser.set(userId, lastSeenAt);
    }

    const summaries: AdminUserSummary[] = users.map((authUser: any) => {
      const profile = profilesById.get(String(authUser.id));
      const firstName = String(profile?.first_name ?? authUser.user_metadata?.first_name ?? "");
      const lastName = String(profile?.last_name ?? authUser.user_metadata?.last_name ?? "");
      const fullName = `${firstName} ${lastName}`.trim() || String(authUser.email ?? "User");
      return {
        id: String(authUser.id),
        email: String(authUser.email ?? ""),
        fullName,
        firstName,
        lastName,
        createdAt: (profile?.created_at ?? authUser.created_at ?? null) as string | null,
        lastSignInAt: (authUser.last_sign_in_at ?? null) as string | null,
        lastActiveAt: lastActiveByUser.get(String(authUser.id)) ?? null,
        bannedUntil: (authUser.banned_until ?? null) as string | null,
        plan: (profile?.plan ?? authUser.user_metadata?.plan ?? null) as string | null,
        subscriptionStatus: (profile?.subscription_status ?? authUser.user_metadata?.subscriptionStatus ?? null) as string | null,
        showInRanking: Boolean(profile?.show_in_ranking ?? false),
        sessions30d: sessions30ByUser.get(String(authUser.id)) ?? 0,
        events30d: events30ByUser.get(String(authUser.id)) ?? 0,
        activeEntitlements: (activeEntitlementsByUser.get(String(authUser.id)) ?? []).sort(),
        accessSource: accessSourceByUser.get(String(authUser.id)) ?? ((authUser.user_metadata?.accessSource as string | undefined) ?? null),
      };
    });

    return NextResponse.json({ ok: true, users: summaries });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
