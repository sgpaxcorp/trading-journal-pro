import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

const MAX_ITEMS = 6;

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function textList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item, 500)).filter(Boolean).slice(0, MAX_ITEMS)
    : [];
}

function parseJson(value: string) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeReview(raw: any, model: string, usedResearchCorpus: boolean) {
  return {
    headline: text(raw?.headline, 180),
    summary: text(raw?.summary, 1200),
    observations: textList(raw?.observations),
    actions: textList(raw?.actions),
    limitations: textList(raw?.limitations),
    methodologyNote: text(raw?.methodologyNote, 600),
    model,
    usedResearchCorpus,
    generatedAt: new Date().toISOString(),
  };
}

function modelCandidates() {
  return Array.from(
    new Set(
      [
        process.env.OPENAI_GROWTH_PLAN_MODEL,
        process.env.OPENAI_NEURO_ANALYSIS_MODEL,
        process.env.AI_COACH_MODEL,
        "gpt-4o-mini",
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const limit = await rateLimit(
      `growth-plan-advisor:${access.context.userId}:${getClientIp(req)}`,
      { limit: 5, windowMs: 60_000 }
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many advisor reviews. Please try again shortly." },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Research AI is not configured." }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const locale = body?.locale === "es" ? "es" : "en";
    const deterministicSnapshot = {
      startingCapitalUsd: finite(body?.startingCapitalUsd),
      targetCapitalUsd: finite(body?.targetCapitalUsd),
      targetDate: text(body?.targetDate, 20),
      tradingInstrument: text(body?.tradingInstrument, 40),
      committedTradingDays: Math.max(0, Math.floor(finite(body?.committedTradingDays))),
      targetReturnPct: finite(body?.targetReturnPct),
      annualizedTargetReturnPct: finite(body?.annualizedTargetReturnPct),
      perfectPathReturnPerSessionPct: finite(body?.perfectPathReturnPerSessionPct),
      requiredGoalDayReturnPct: finite(body?.requiredGoalDayReturnPct),
      modeledGoalDays: Math.max(0, Math.floor(finite(body?.modeledGoalDays))),
      modeledLossDays: Math.max(0, Math.floor(finite(body?.modeledLossDays))),
      modeledMaxLossPct: finite(body?.modeledMaxLossPct),
      activeScenarioGoalDayPct: finite(body?.activeScenarioGoalDayPct),
      activeScenarioCoveragePct: finite(body?.activeScenarioCoveragePct),
      activeScenarioProjectedCapitalUsd: finite(body?.activeScenarioProjectedCapitalUsd),
      deadlineGapUsd: finite(body?.deadlineGapUsd),
      verdict: text(body?.verdict, 40),
      flags: textList(body?.flags),
      executionEvidence: {
        depth: text(body?.executionEvidence?.depth, 40),
        sessions: Math.max(0, Math.floor(finite(body?.executionEvidence?.sessions))),
        trades: Math.max(0, Math.floor(finite(body?.executionEvidence?.trades))),
        winRatePct: finite(body?.executionEvidence?.winRatePct),
        profitFactor: finite(body?.executionEvidence?.profitFactor),
        expectancyUsd: finite(body?.executionEvidence?.expectancyUsd),
        maxDrawdownPct: finite(body?.executionEvidence?.maxDrawdownPct),
      },
    };

    if (
      deterministicSnapshot.startingCapitalUsd <= 0 ||
      deterministicSnapshot.targetCapitalUsd <= deterministicSnapshot.startingCapitalUsd ||
      deterministicSnapshot.committedTradingDays <= 0
    ) {
      return NextResponse.json({ error: "Complete the plan inputs before requesting a review." }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const vectorStoreId = String(process.env.NEURO_ANALYSIS_CFA_VECTOR_STORE_ID ?? "").trim();
    const tools = vectorStoreId
      ? [{ type: "file_search" as const, vector_store_ids: [vectorStoreId], max_num_results: 10 }]
      : [];
    const instructions = [
      "You are an educational trading-business risk planning analyst.",
      "The deterministic snapshot is authoritative. Never recalculate, alter, or contradict its numbers.",
      "Distinguish perfect-path compounding from the return required only on modeled goal-days.",
      "Evaluate arithmetic feasibility, operating-model coverage, loss assumptions, execution evidence, and uncertainty separately.",
      "Use the private research methodology corpus when available for principles such as compounding, risk-return tradeoffs, drawdown, diversification of assumptions, and limitations of historical evidence.",
      "Do not claim to be a registered investment adviser. Do not recommend securities, entries, exits, leverage, or position sizes. Do not guarantee or forecast returns.",
      "Do not call a high return target safe or realistic merely because the compound formula resolves.",
      "Respond in the requested locale and return JSON only with: headline, summary, observations[], actions[], limitations[], methodologyNote.",
      "Keep actions focused on plan design: extend runway, phase capital objectives, reduce loss budget, validate an edge, or add capital only as an explicit user decision.",
    ].join("\n");
    const input = JSON.stringify({ locale, deterministicSnapshot }, null, 2);

    let lastError: unknown = null;
    for (const model of modelCandidates()) {
      try {
        const response = await client.responses.create({
          model,
          instructions,
          input,
          tools,
          include: tools.length ? ["file_search_call.results"] : undefined,
          max_output_tokens: 1800,
          metadata: {
            feature: "growth_plan_research_review",
            user_id: access.context.userId,
          },
        });
        const parsed = parseJson(response.output_text);
        if (
          !parsed ||
          typeof parsed.headline !== "string" ||
          typeof parsed.summary !== "string" ||
          !Array.isArray(parsed.observations) ||
          !Array.isArray(parsed.actions)
        ) {
          throw new Error("Research AI returned an invalid response format.");
        }
        const usedResearchCorpus =
          tools.length > 0 &&
          Array.isArray((response as any)?.output) &&
          (response as any).output.some((item: any) => item?.type === "file_search_call");
        return NextResponse.json({
          review: normalizeReview(parsed, model, usedResearchCorpus),
        });
      } catch (error: any) {
        lastError = error;
        const message = String(error?.message ?? "").toLowerCase();
        const status = Number(error?.status ?? error?.statusCode ?? 0);
        const modelError =
          message.includes("model") &&
          (message.includes("not found") ||
            message.includes("does not exist") ||
            message.includes("invalid") ||
            message.includes("access"));
        const responseFormatError = message.includes("invalid response format");
        if (!modelError && !responseFormatError && status !== 400 && status !== 404) break;
      }
    }

    console.error("[growth-plan/advisor] model error", lastError);
    return NextResponse.json(
      { error: "The research review could not be generated right now." },
      { status: 502 }
    );
  } catch (error: any) {
    console.error("[growth-plan/advisor] POST error", error);
    return NextResponse.json({ error: error?.message ?? "Unknown error" }, { status: 500 });
  }
}
