import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

type ChallengeId =
  | "process-consistency"
  | "max-loss-discipline"
  | "journal-streak"
  | "no-revenge";

type ChallengeDefinition = {
  id: ChallengeId;
  durationDays: number;
  requiredGreenPct: number;
};

const CHALLENGES: ChallengeDefinition[] = [
  { id: "process-consistency", durationDays: 14, requiredGreenPct: 0.67 },
  { id: "max-loss-discipline", durationDays: 10, requiredGreenPct: 0.8 },
  { id: "journal-streak", durationDays: 21, requiredGreenPct: 0.7 },
  { id: "no-revenge", durationDays: 12, requiredGreenPct: 0.67 },
];

const SELECT_RUN =
  "id,user_id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at,updated_at";

function requireDef(id: string): ChallengeDefinition {
  const def = CHALLENGES.find((challenge) => challenge.id === id);
  if (!def) throw new Error("Unknown challenge id.");
  return def;
}

function requiredGreenDays(def: ChallengeDefinition): number {
  return Math.max(1, Math.ceil(def.durationDays * def.requiredGreenPct));
}

function mapRun(row: any) {
  return {
    runId: String(row.id),
    userId: String(row.user_id),
    challengeId: String(row.challenge_id),
    status: String(row.status),
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    durationDays: Number(row.duration_days ?? 0),
    requiredGreenDays: Number(row.required_green_days ?? 0),
    daysTracked: Number(row.days_tracked ?? 0),
    processGreenDays: Number(row.process_green_days ?? 0),
    maxLossBreaks: Number(row.max_loss_breaks ?? 0),
    xpEarned: Number(row.xp_earned ?? 0),
    currentStreak: Number(row.current_streak ?? 0),
    bestStreak: Number(row.best_streak ?? 0),
    lastTrackedDate: row.last_tracked_date ? String(row.last_tracked_date) : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const body = await req.json().catch(() => ({}));
    const def = requireDef(String(body?.challengeId ?? ""));
    const userId = access.context.userId;
    const limiter = await rateLimit(`challenge-start:${userId}:${getClientIp(req)}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many challenge starts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("challenge_runs")
      .update({ status: "restarted", ended_at: now, updated_at: now })
      .eq("user_id", userId)
      .eq("challenge_id", def.id)
      .eq("status", "active");

    const { data, error } = await supabaseAdmin
      .from("challenge_runs")
      .insert({
        user_id: userId,
        challenge_id: def.id,
        status: "active",
        duration_days: def.durationDays,
        required_green_days: requiredGreenDays(def),
        days_tracked: 0,
        process_green_days: 0,
        max_loss_breaks: 0,
        xp_earned: 0,
        current_streak: 0,
        best_streak: 0,
        last_tracked_date: null,
        started_at: now,
        updated_at: now,
      })
      .select(SELECT_RUN)
      .single();

    if (error) throw error;

    return NextResponse.json({ progress: mapRun(data) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unable to start challenge." },
      { status: 400 }
    );
  }
}
