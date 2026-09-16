import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import {
  neuroInvestmentPolicyGaps,
  normalizeNeuroInvestmentPolicy,
  starterNeuroInvestmentPolicy,
} from "@/lib/neuroInvestmentGovernance";
import {
  getLatestNeuroInvestmentPolicy,
  insertNeuroInvestmentPolicy,
} from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const policy = (await getLatestNeuroInvestmentPolicy(authUser.userId)) ?? starterNeuroInvestmentPolicy();
    return NextResponse.json({
      policy,
      missingRequirements: neuroInvestmentPolicyGaps(policy),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load investment policy." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const limiter = await rateLimit(`neuro-analysis:policy:${authUser.userId}`, {
      limit: 12,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const approve = Boolean(body?.approve);
    const policy = normalizeNeuroInvestmentPolicy({
      ...(body?.policy ?? {}),
      status: approve ? "active" : "draft",
    });
    const missing = neuroInvestmentPolicyGaps({ ...policy, status: "active", approvedAt: new Date().toISOString() })
      .filter((item) => item !== "approved investment policy");
    if (approve && missing.length) {
      return NextResponse.json(
        { error: "Complete the investment policy before approving it.", missingRequirements: missing },
        { status: 400 }
      );
    }

    const saved = await insertNeuroInvestmentPolicy({
      userId: authUser.userId,
      policy,
      approve,
    });

    return NextResponse.json({
      policy: saved,
      missingRequirements: neuroInvestmentPolicyGaps(saved),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not save investment policy." },
      { status: 500 }
    );
  }
}
