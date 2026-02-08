import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

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

function toISO(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function toDayKey(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

function buildDailySeries<T extends Record<string, any>>(
  items: T[] | null | undefined,
  dateKey: keyof T,
  days: number
) {
  const today = new Date();
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    buckets.set(toDayKey(d), 0);
  }
  (items ?? []).forEach((item) => {
    const raw = item[dateKey];
    if (!raw) return;
    const key = toDayKey(raw as string);
    if (!buckets.has(key)) return;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;
    const admin = await isAdmin(userId, authData.user.email);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const since7 = toISO(7);
    const since30 = toISO(30);

    const [{ count: totalUsers }, { count: activeSubs }, { data: profiles30 }] =
      await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("subscription_status", "active"),
      supabaseAdmin
        .from("profiles")
        .select("id, created_at")
        .gte("created_at", since30),
    ]);

    const [{ count: newUsers7d }, { count: newUsers30d }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30),
    ]);

    const { data: events30 } = await supabaseAdmin
      .from("usage_events")
      .select("user_id, session_id, path, created_at")
      .gte("created_at", since30);

    const { data: sessions30 } = await supabaseAdmin
      .from("usage_sessions")
      .select("id, started_at, last_seen_at")
      .gte("started_at", since30);

    const { data: events7 } = await supabaseAdmin
      .from("usage_events")
      .select("user_id")
      .gte("created_at", since7);

    const activeUsers30 = new Set((events30 ?? []).map((e: any) => e.user_id)).size;
    const activeUsers7 = new Set((events7 ?? []).map((e: any) => e.user_id)).size;

    const pageCounts = new Map<string, number>();
    (events30 ?? []).forEach((e: any) => {
      if (!e.path) return;
      pageCounts.set(e.path, (pageCounts.get(e.path) || 0) + 1);
    });
    const topPages = Array.from(pageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    const sessionDurations = (sessions30 ?? []).map((s: any) => {
      const start = s?.started_at ? new Date(s.started_at).getTime() : 0;
      const end = s?.last_seen_at ? new Date(s.last_seen_at).getTime() : start;
      return Math.max(0, end - start);
    });
    const avgSessionMs =
      sessionDurations.length > 0
        ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
        : 0;
    const avgSessionMinutes = avgSessionMs / 1000 / 60;

    const { count: addonActive } = await supabaseAdmin
      .from("user_entitlements")
      .select("id", { count: "exact", head: true })
      .eq("entitlement_key", "option_flow")
      .in("status", ["active", "trialing"]);

    const conversionRate =
      totalUsers && totalUsers > 0 ? (activeSubs || 0) / totalUsers : 0;

    const dailyEvents = buildDailySeries(events30, "created_at", 30);
    const dailySessions = buildDailySeries(sessions30, "started_at", 30);
    const dailySignups = buildDailySeries(profiles30, "created_at", 30);

    return NextResponse.json({
      totals: {
        users: totalUsers || 0,
        activeSubs: activeSubs || 0,
        addonActive: addonActive || 0,
      },
      actives: {
        last7d: activeUsers7,
        last30d: activeUsers30,
      },
      signups: {
        last7d: newUsers7d || 0,
        last30d: newUsers30d || 0,
      },
      usage: {
        topPages,
        sessions30d: (sessions30 ?? []).length,
        avgSessionMinutes: Number(avgSessionMinutes.toFixed(1)),
      },
      series: {
        dailyEvents,
        dailySessions,
        dailySignups,
      },
      conversionRate: Number((conversionRate * 100).toFixed(1)),
    });
  } catch (err: any) {
    console.error("[admin/metrics] error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
