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
  xp: {
    journal: number;
    respectedMaxLoss: number;
    followedPlan: number;
    processGreenBonus: number;
    completionBonus: number;
  };
};

type ChallengeDayInput = {
  day: string;
  journalCompleted: boolean;
  respectedMaxLoss: boolean;
  followedPlan: boolean;
  note?: string;
};

const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "process-consistency",
    xp: {
      journal: 10,
      respectedMaxLoss: 10,
      followedPlan: 5,
      processGreenBonus: 10,
      completionBonus: 200,
    },
  },
  {
    id: "max-loss-discipline",
    xp: {
      journal: 10,
      respectedMaxLoss: 15,
      followedPlan: 5,
      processGreenBonus: 10,
      completionBonus: 250,
    },
  },
  {
    id: "journal-streak",
    xp: {
      journal: 15,
      respectedMaxLoss: 5,
      followedPlan: 5,
      processGreenBonus: 5,
      completionBonus: 300,
    },
  },
  {
    id: "no-revenge",
    xp: {
      journal: 10,
      respectedMaxLoss: 10,
      followedPlan: 10,
      processGreenBonus: 10,
      completionBonus: 220,
    },
  },
];

const SELECT_RUN =
  "id,user_id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at,updated_at";
const SELECT_DAY =
  "id,run_id,user_id,challenge_id,day,journal_completed,respected_max_loss,followed_plan,process_green,max_loss_break,xp_awarded,note,created_at,updated_at";

function requireDef(id: string): ChallengeDefinition {
  const def = CHALLENGES.find((challenge) => challenge.id === id);
  if (!def) throw new Error("Unknown challenge id.");
  return def;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function computeXp(def: ChallengeDefinition, input: ChallengeDayInput) {
  const processGreen =
    Boolean(input.journalCompleted) &&
    Boolean(input.respectedMaxLoss) &&
    Boolean(input.followedPlan);

  const xpAwarded = clampInt(
    (input.journalCompleted ? def.xp.journal : 0) +
      (input.respectedMaxLoss ? def.xp.respectedMaxLoss : 0) +
      (input.followedPlan ? def.xp.followedPlan : 0) +
      (processGreen ? def.xp.processGreenBonus : 0),
    0,
    1000
  );

  return {
    xpAwarded,
    processGreen,
    maxLossBreak: !input.respectedMaxLoss,
  };
}

function computeStreaks(days: { day: string; process_green: boolean }[]) {
  const sorted = [...days]
    .filter((d) => isIsoDate(d.day))
    .sort((a, b) => a.day.localeCompare(b.day));

  let best = 0;
  let current = 0;
  let prevDate: Date | null = null;

  for (const row of sorted) {
    const d = new Date(`${row.day}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;

    const isConsecutive =
      prevDate &&
      (d.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000) === 1;

    if (!row.process_green) {
      current = 0;
    } else {
      current = !prevDate || isConsecutive ? current + 1 : 1;
      best = Math.max(best, current);
    }

    prevDate = d;
  }

  return { currentStreak: current, bestStreak: best };
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

function mapDay(row: any) {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    challengeId: String(row.challenge_id),
    day: String(row.day),
    journalCompleted: Boolean(row.journal_completed),
    respectedMaxLoss: Boolean(row.respected_max_loss),
    followedPlan: Boolean(row.followed_plan),
    processGreen: Boolean(row.process_green),
    maxLossBreak: Boolean(row.max_loss_break),
    xpAwarded: Number(row.xp_awarded ?? 0),
    note: row.note != null ? String(row.note) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const body = await req.json().catch(() => ({}));
    const runId = String(body?.runId ?? "").trim();
    const challengeId = String(body?.challengeId ?? "").trim();
    const input = (body?.input ?? {}) as Partial<ChallengeDayInput>;

    if (!runId) throw new Error("Missing run id.");
    const def = requireDef(challengeId);

    const userId = access.context.userId;
    const limiter = await rateLimit(`challenge-check-in:${userId}:${getClientIp(req)}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many challenge check-ins. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }
    const dayIso = String(input.day ?? "").trim() || isoToday();
    if (!isIsoDate(dayIso)) throw new Error("Invalid day.");

    const { data: runRow, error: runErr } = await supabaseAdmin
      .from("challenge_runs")
      .select(SELECT_RUN)
      .eq("id", runId)
      .eq("user_id", userId)
      .maybeSingle();

    if (runErr) throw runErr;
    if (!runRow) throw new Error("Challenge run not found.");
    if (String(runRow.challenge_id) !== def.id) throw new Error("Run mismatch.");
    if (String(runRow.status) !== "active") throw new Error("This challenge run is not active.");

    const dayInput: ChallengeDayInput = {
      day: dayIso,
      journalCompleted: Boolean(input.journalCompleted),
      respectedMaxLoss: Boolean(input.respectedMaxLoss),
      followedPlan: Boolean(input.followedPlan),
      note: String(input.note ?? "").trim(),
    };

    const { xpAwarded, processGreen, maxLossBreak } = computeXp(def, dayInput);
    const now = new Date().toISOString();

    const dayPayload = {
      run_id: runId,
      user_id: userId,
      challenge_id: def.id,
      day: dayIso,
      journal_completed: dayInput.journalCompleted,
      respected_max_loss: dayInput.respectedMaxLoss,
      followed_plan: dayInput.followedPlan,
      process_green: processGreen,
      max_loss_break: maxLossBreak,
      xp_awarded: xpAwarded,
      note: dayInput.note || null,
      updated_at: now,
    };

    const { data: savedRow, error: dayErr } = await supabaseAdmin
      .from("challenge_run_days")
      .upsert(dayPayload, { onConflict: "run_id,day" })
      .select(SELECT_DAY)
      .single();

    if (dayErr) throw dayErr;

    const { data: allDaysRaw, error: listErr } = await supabaseAdmin
      .from("challenge_run_days")
      .select("day,process_green,max_loss_break,xp_awarded")
      .eq("run_id", runId)
      .eq("user_id", userId);

    if (listErr) throw listErr;

    const allDays = (allDaysRaw as any[]) || [];
    const daysTracked = allDays.length;
    const processGreenDays = allDays.filter((d) => Boolean(d.process_green)).length;
    const maxLossBreaks = allDays.filter((d) => Boolean(d.max_loss_break)).length;
    const xpEarnedBase = allDays.reduce(
      (sum, d) => sum + (Number(d.xp_awarded) || 0),
      0
    );

    const lastTracked =
      allDays
        .map((d) => String(d.day || ""))
        .filter((s) => isIsoDate(s))
        .sort()
        .slice(-1)[0] || null;

    const { currentStreak, bestStreak } = computeStreaks(
      allDays.map((d) => ({
        day: String(d.day || ""),
        process_green: Boolean(d.process_green),
      }))
    );

    let nextStatus = String(runRow.status);
    let endedAt = runRow.ended_at ? String(runRow.ended_at) : null;
    let completionBonus = 0;

    if (nextStatus === "active" && daysTracked >= Number(runRow.duration_days ?? 0)) {
      const completed = processGreenDays >= Number(runRow.required_green_days ?? 0);
      nextStatus = completed ? "completed" : "failed";
      endedAt = now;
      completionBonus = completed ? def.xp.completionBonus : 0;
    }

    const { data: updatedRun, error: updRunErr } = await supabaseAdmin
      .from("challenge_runs")
      .update({
        status: nextStatus,
        ended_at: endedAt,
        days_tracked: daysTracked,
        process_green_days: processGreenDays,
        max_loss_breaks: maxLossBreaks,
        xp_earned: xpEarnedBase + completionBonus,
        current_streak: currentStreak,
        best_streak: bestStreak,
        last_tracked_date: lastTracked,
        updated_at: now,
      })
      .eq("id", runId)
      .eq("user_id", userId)
      .select(SELECT_RUN)
      .single();

    if (updRunErr) throw updRunErr;

    return NextResponse.json({
      progress: mapRun(updatedRun),
      dayLog: savedRow ? mapDay(savedRow) : null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unable to log challenge day." },
      { status: 400 }
    );
  }
}
