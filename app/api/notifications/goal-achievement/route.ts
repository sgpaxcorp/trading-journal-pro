import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { notifyGoalAchievement, type GoalScope } from "@/lib/goalAchievementNotifications";

export const runtime = "nodejs";

type GoalAchievementBody = {
  goalScope?: GoalScope;
  periodKey?: string;
  accountId?: string | null;
  locale?: string | null;
  goalAmount?: number | null;
  actualAmount?: number | null;
  targetBalance?: number | null;
  progress?: number | null;
  title?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

function isGoalScope(value: unknown): value is GoalScope {
  return value === "day" || value === "week" || value === "month" || value === "quarter";
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as GoalAchievementBody;
    const goalScope = body?.goalScope;
    const periodKey = String(body?.periodKey ?? "").trim();

    if (!isGoalScope(goalScope)) {
      return NextResponse.json({ error: "Invalid goalScope" }, { status: 400 });
    }

    if (!periodKey) {
      return NextResponse.json({ error: "Missing periodKey" }, { status: 400 });
    }

    const result = await notifyGoalAchievement({
      userId: auth.userId,
      goalScope,
      periodKey,
      accountId: goalScope === "day" ? null : body?.accountId ?? null,
      locale: body?.locale ?? null,
      goalAmount: body?.goalAmount ?? null,
      actualAmount: body?.actualAmount ?? null,
      targetBalance: body?.targetBalance ?? null,
      progress: body?.progress ?? null,
      title: body?.title ?? null,
      message: body?.message ?? null,
      metadata: body?.metadata ?? {},
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
