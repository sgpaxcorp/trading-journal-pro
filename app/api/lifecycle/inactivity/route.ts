import { NextRequest, NextResponse } from "next/server";
import {
  sendInactivityReminderEmail,
  type InactivityReminderStage,
} from "@/lib/email";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ACTIVITY_LOOKBACK_DAYS = 45;

type InactivityEmailKey =
  | "inactivity_3_day"
  | "inactivity_15_day"
  | "inactivity_30_day";

type AuthUserRow = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  user_metadata?: {
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    full_name?: string | null;
  } | null;
};

type ProfileRow = {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  subscription_status?: string | null;
};

type UsageSessionRow = {
  user_id?: string | null;
  started_at?: string | null;
  last_seen_at?: string | null;
};

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const vercelCronHeader = req.headers.get("x-vercel-cron");
  const isVercelCron = Boolean(vercelCronHeader) && vercelCronHeader !== "false";
  const hasValidSecret = Boolean(secret) && token === secret;
  return isVercelCron || hasValidSecret;
}

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maxDate(...values: Array<string | Date | null | undefined>) {
  let winner: Date | null = null;
  for (const value of values) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) continue;
    if (!winner || date.getTime() > winner.getTime()) winner = date;
  }
  return winner;
}

function daysSince(date: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY));
}

function stageForInactiveDays(days: number): InactivityReminderStage | null {
  if (days >= 30) return 30;
  if (days >= 15) return 15;
  if (days >= 3) return 3;
  return null;
}

function emailKeyForStage(stage: InactivityReminderStage): InactivityEmailKey {
  if (stage === 30) return "inactivity_30_day";
  if (stage === 15) return "inactivity_15_day";
  return "inactivity_3_day";
}

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected inactivity email error";
}

function formatName(profile: ProfileRow | null, user: AuthUserRow) {
  const profileName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  if (profileName) return profileName;

  const meta = user.user_metadata ?? {};
  const metadataName =
    String(meta.full_name ?? meta.name ?? "").trim() ||
    `${meta.first_name ?? ""} ${meta.last_name ?? ""}`.trim();
  return metadataName || null;
}

function isBanned(user: AuthUserRow, now: Date) {
  const bannedUntil = parseDate(user.banned_until);
  return Boolean(bannedUntil && bannedUntil.getTime() > now.getTime());
}

function shouldSkipProfile(profile: ProfileRow | null) {
  const status = String(profile?.subscription_status ?? "").trim().toLowerCase();
  return ["canceled", "cancelled", "inactive", "deleted", "suspended"].includes(status);
}

async function loadProfilesById(userIds: string[]) {
  const rows = new Map<string, ProfileRow>();
  if (!userIds.length) return rows;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,first_name,last_name,subscription_status")
    .in("id", userIds);

  if (error) {
    console.warn("[lifecycle/inactivity] profiles lookup warning:", error);
    return rows;
  }

  for (const row of (data ?? []) as ProfileRow[]) {
    if (row.id) rows.set(String(row.id), row);
  }
  return rows;
}

async function loadLastActivityByUser(userIds: string[], now: Date) {
  const rows = new Map<string, Date>();
  if (!userIds.length) return rows;

  const since = new Date(now.getTime() - ACTIVITY_LOOKBACK_DAYS * MS_PER_DAY).toISOString();
  const { data, error } = await supabaseAdmin
    .from("usage_sessions")
    .select("user_id,last_seen_at,started_at")
    .in("user_id", userIds)
    .or(`last_seen_at.gte.${since},started_at.gte.${since}`)
    .limit(5000);

  if (error) {
    console.warn("[lifecycle/inactivity] usage session lookup warning:", error);
    return rows;
  }

  for (const row of (data ?? []) as UsageSessionRow[]) {
    const userId = String(row.user_id ?? "");
    if (!userId) continue;
    const lastActivity = maxDate(row.last_seen_at, row.started_at);
    if (!lastActivity) continue;
    const existing = rows.get(userId);
    if (!existing || lastActivity.getTime() > existing.getTime()) {
      rows.set(userId, lastActivity);
    }
  }

  return rows;
}

async function beginDelivery(args: {
  userId: string;
  email: string;
  emailKey: InactivityEmailKey;
  triggerKey: string;
  inactiveDays: number;
  lastActivityAt: string;
  dryRun: boolean;
}) {
  if (args.dryRun) return { shouldSend: true, deliveryId: null as string | null };

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("lifecycle_email_deliveries")
    .select("id,status")
    .eq("email_key", args.emailKey)
    .eq("trigger_key", args.triggerKey)
    .maybeSingle();

  if (error) throw error;

  const existing = data as { id?: string; status?: string | null } | null;
  if (!existing) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("lifecycle_email_deliveries")
      .insert({
        user_id: args.userId,
        email: args.email,
        email_key: args.emailKey,
        trigger_key: args.triggerKey,
        status: "processing",
        metadata: {
          inactive_days: args.inactiveDays,
          last_activity_at: args.lastActivityAt,
        },
        updated_at: now,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") return { shouldSend: false, deliveryId: null };
      throw insertError;
    }

    return { shouldSend: true, deliveryId: String((inserted as { id: string }).id) };
  }

  if (existing.status === "sent" || existing.status === "processing") {
    return { shouldSend: false, deliveryId: existing.id ?? null };
  }

  const { error: updateError } = await supabaseAdmin
    .from("lifecycle_email_deliveries")
    .update({
      email: args.email,
      user_id: args.userId,
      status: "processing",
      last_error: null,
      metadata: {
        inactive_days: args.inactiveDays,
        last_activity_at: args.lastActivityAt,
      },
      updated_at: now,
    })
    .eq("id", existing.id);

  if (updateError) throw updateError;
  return { shouldSend: true, deliveryId: existing.id ?? null };
}

async function markDelivery(args: {
  deliveryId: string | null;
  status: "sent" | "failed";
  errorMessage?: string | null;
}) {
  if (!args.deliveryId) return;

  const payload =
    args.status === "sent"
      ? {
          status: "sent",
          last_error: null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          status: "failed",
          last_error: args.errorMessage ?? null,
          updated_at: new Date().toISOString(),
        };

  const { error } = await supabaseAdmin
    .from("lifecycle_email_deliveries")
    .update(payload)
    .eq("id", args.deliveryId);

  if (error) {
    console.error("[lifecycle/inactivity] delivery mark error:", error);
  }
}

async function handleRequest(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = ["1", "true", "yes"].includes(String(url.searchParams.get("dryRun") ?? "").toLowerCase());
  const maxUsers = clampNumber(url.searchParams.get("maxUsers"), 5000, 1, 10000);
  const maxSends = clampNumber(url.searchParams.get("maxSends"), 250, 1, 1000);
  const now = new Date();

  let scanned = 0;
  let eligible = 0;
  let sent = 0;
  let wouldSend = 0;
  let skipped = 0;
  let failed = 0;
  const byStage: Record<InactivityReminderStage, number> = { 3: 0, 15: 0, 30: 0 };

  for (let page = 1; page <= 50 && scanned < maxUsers; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const users = ((data?.users ?? []) as unknown as AuthUserRow[]).slice(0, maxUsers - scanned);
    if (!users.length) break;

    const userIds = users.map((user) => String(user.id)).filter(Boolean);
    const [profilesById, activityByUser] = await Promise.all([
      loadProfilesById(userIds),
      loadLastActivityByUser(userIds, now),
    ]);

    for (const user of users) {
      scanned += 1;
      const profile = profilesById.get(String(user.id)) ?? null;
      const email = String(profile?.email ?? user.email ?? "").trim().toLowerCase();

      if (!email || isBanned(user, now) || shouldSkipProfile(profile)) {
        skipped += 1;
        continue;
      }

      const lastActivity =
        maxDate(activityByUser.get(String(user.id)) ?? null, user.last_sign_in_at, user.created_at) ?? now;
      const inactiveDays = daysSince(lastActivity, now);
      const stage = stageForInactiveDays(inactiveDays);
      if (!stage) {
        skipped += 1;
        continue;
      }

      eligible += 1;
      byStage[stage] += 1;
      const emailKey = emailKeyForStage(stage);
      const triggerKey = `inactivity:${user.id}:${stage}:${utcDateKey(lastActivity)}`;
      let deliveryId: string | null = null;

      try {
        const delivery = await beginDelivery({
          userId: String(user.id),
          email,
          emailKey,
          triggerKey,
          inactiveDays,
          lastActivityAt: lastActivity.toISOString(),
          dryRun,
        });
        deliveryId = delivery.deliveryId;

        if (!delivery.shouldSend) {
          skipped += 1;
          continue;
        }

        if (dryRun) {
          wouldSend += 1;
          continue;
        }

        await sendInactivityReminderEmail({
          userId: String(user.id),
          email,
          name: formatName(profile, user),
          daysInactive: stage,
        });
        await markDelivery({ deliveryId: delivery.deliveryId, status: "sent" });
        sent += 1;

        if (sent >= maxSends) {
          return NextResponse.json({
            ok: true,
            dryRun,
            scanned,
            eligible,
            sent,
            wouldSend,
            skipped,
            failed,
            byStage,
            maxSendsReached: true,
          });
        }
      } catch (error: unknown) {
        failed += 1;
        console.error("[lifecycle/inactivity] send error:", {
          userId: user.id,
          email,
          stage,
          error,
        });
        await markDelivery({
          deliveryId,
          status: "failed",
          errorMessage: getErrorMessage(error),
        });
      }
    }

    if (users.length < 200) break;
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    scanned,
    eligible,
    sent,
    wouldSend,
    skipped,
    failed,
    byStage,
  });
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
