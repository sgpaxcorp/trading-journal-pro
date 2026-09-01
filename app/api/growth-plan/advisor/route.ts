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

function milestoneList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item: any) => ({
    cadence: text(item?.cadence, 20),
    periodIndex: Math.max(0, Math.floor(finite(item?.periodIndex))),
    targetDate: text(item?.targetDate, 20),
    startBalanceUsd: finite(item?.startBalance),
    targetBalanceUsd: finite(item?.targetBalance),
    plannedChangeUsd: finite(item?.plannedChangeUsd),
    plannedTradingChangeUsd: finite(item?.plannedTradingChangeUsd),
    plannedDepositsUsd: finite(item?.plannedDepositsUsd),
    plannedWithdrawalsUsd: finite(item?.plannedWithdrawalsUsd),
    plannedReturnPct: finite(item?.plannedReturnPct),
    sessionCount: Math.max(0, Math.floor(finite(item?.sessionCount))),
  }));
}

function panoramaList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((item: any) => ({
    id: text(item?.id, 30),
    goalDayReturnPct: finite(item?.goalDayReturnPct),
    expectedLossDayPct: finite(item?.expectedLossDayPct),
    modeledAnnualReturnPct: finite(item?.modeledAnnualReturnPct),
    grossProjectedBalanceUsd: finite(item?.grossProjectedBalance),
    projectedBalanceUsd: finite(item?.projectedBalance),
    costDragUsd: finite(item?.costDragUsd),
    afterTaxReserveBalanceUsd: finite(item?.afterTaxReserveBalance),
    completionDate: text(item?.completionDate, 20),
    reachesRequestedDeadline: Boolean(item?.reachesRequestedDeadline),
    riskBand: text(item?.riskBand, 30),
    sensitivity: {
      simulations: Math.max(0, Math.floor(finite(item?.probability?.simulations))),
      probabilityTargetPct: finite(item?.probability?.probabilityTargetPct),
      probabilityCapitalHalfPct: finite(item?.probability?.probabilityCapitalHalfPct),
      p10BalanceUsd: finite(item?.probability?.p10Balance),
      medianBalanceUsd: finite(item?.probability?.medianBalance),
      p90BalanceUsd: finite(item?.probability?.p90Balance),
      medianMaxDrawdownPct: finite(item?.probability?.medianMaxDrawdownPct),
    },
  }));
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
      adaptivePlan: {
        verdict: text(body?.adaptivePlan?.verdict, 40),
        isProvisional: Boolean(body?.adaptivePlan?.isProvisional),
        requestedProjectedBalanceUsd: finite(body?.adaptivePlan?.requestedProjectedBalanceUsd),
        requestedCoveragePct: finite(body?.adaptivePlan?.requestedCoveragePct),
        requestedShortfallUsd: finite(body?.adaptivePlan?.requestedShortfallUsd),
        requestedTradingGrowthUsd: finite(body?.adaptivePlan?.requestedTradingGrowthUsd),
        requestedDepositsUsd: finite(body?.adaptivePlan?.requestedDepositsUsd),
        requestedWithdrawalsUsd: finite(body?.adaptivePlan?.requestedWithdrawalsUsd),
        requestedNetCashflowUsd: finite(body?.adaptivePlan?.requestedNetCashflowUsd),
        requestedRequiredGoalDayPct: finite(body?.adaptivePlan?.requestedRequiredGoalDayPct),
        targetAnnualizedReturnPct: finite(body?.adaptivePlan?.targetAnnualizedReturnPct),
        mathematicallyPossible: Boolean(body?.adaptivePlan?.mathematicallyPossible),
        targetProjectionGoalDayPct: finite(body?.adaptivePlan?.targetProjectionGoalDayPct),
        targetProjectionBalanceUsd: finite(body?.adaptivePlan?.targetProjectionBalanceUsd),
        targetProjectionCoveragePct: finite(body?.adaptivePlan?.targetProjectionCoveragePct),
        targetProjectionTradingGrowthUsd: finite(body?.adaptivePlan?.targetProjectionTradingGrowthUsd),
        targetProjectionEstimatedCostsUsd: finite(body?.adaptivePlan?.targetProjectionEstimatedCostsUsd),
        requestedGrossProjectedBalanceUsd: finite(body?.adaptivePlan?.requestedGrossProjectedBalanceUsd),
        requestedGrossTradingGrowthUsd: finite(body?.adaptivePlan?.requestedGrossTradingGrowthUsd),
        requestedCostDragUsd: finite(body?.adaptivePlan?.requestedCostDragUsd),
        costsConsumePercentageEdge: Boolean(body?.adaptivePlan?.costsConsumePercentageEdge),
        requestedEstimatedCostsUsd: finite(body?.adaptivePlan?.requestedEstimatedCostsUsd),
        requestedEstimatedTaxReserveUsd: finite(body?.adaptivePlan?.requestedEstimatedTaxReserveUsd),
        requestedAfterTaxReserveBalanceUsd: finite(body?.adaptivePlan?.requestedAfterTaxReserveBalance),
        declaredGoalDayPct: finite(body?.adaptivePlan?.declaredGoalDayPct),
        declaredExpectedLossDayPct: finite(body?.adaptivePlan?.declaredExpectedLossDayPct),
        policyGoalDayCapPct: finite(body?.adaptivePlan?.policyGoalDayCapPct),
        policyExpectedLossDayFloorPct: finite(body?.adaptivePlan?.policyExpectedLossDayFloorPct),
        recommendedGoalDayPct: finite(body?.adaptivePlan?.recommendedGoalDayPct),
        expectedLossDayPct: finite(body?.adaptivePlan?.expectedLossDayPct),
        maxDailyLossGuardrailPct: finite(body?.adaptivePlan?.maxDailyLossGuardrailPct),
        modeledNetReturnPerSessionPct: finite(body?.adaptivePlan?.modeledNetReturnPerSessionPct),
        modeledWeeklyReturnPct: finite(body?.adaptivePlan?.modeledWeeklyReturnPct),
        modeledAnnualCycles: finite(body?.adaptivePlan?.modeledAnnualCycles),
        modeledAnnualReturnPct: finite(body?.adaptivePlan?.modeledAnnualReturnPct),
        recommendedCompletionDate: text(body?.adaptivePlan?.recommendedCompletionDate, 20),
        recommendedTradingSessions: Math.max(
          0,
          Math.floor(finite(body?.adaptivePlan?.recommendedTradingSessions))
        ),
        recommendedCalendarMonths: Math.max(
          0,
          Math.floor(finite(body?.adaptivePlan?.recommendedCalendarMonths))
        ),
        qualificationRequired: Boolean(body?.adaptivePlan?.qualificationRequired),
        qualificationMinimumSessions: Math.max(
          0,
          Math.floor(finite(body?.adaptivePlan?.qualificationMinimumSessions))
        ),
        capacityStatus: text(body?.adaptivePlan?.capacityStatus, 30),
        capacityFlags: textList(body?.adaptivePlan?.capacityFlags),
        selectedPlanId: text(body?.adaptivePlan?.selectedPlanId, 30),
        statisticalValidation: {
          assessment: text(body?.adaptivePlan?.statisticalValidation?.assessment, 30),
          deterministicReachesTarget: Boolean(
            body?.adaptivePlan?.statisticalValidation?.deterministicReachesTarget
          ),
          deterministicProjectedBalance: finite(
            body?.adaptivePlan?.statisticalValidation?.deterministicProjectedBalance
          ),
          probabilityTargetPct: finite(
            body?.adaptivePlan?.statisticalValidation?.probability?.probabilityTargetPct
          ),
          probabilityCapitalHalfPct: finite(
            body?.adaptivePlan?.statisticalValidation?.probability?.probabilityCapitalHalfPct
          ),
          p10Balance: finite(body?.adaptivePlan?.statisticalValidation?.probability?.p10Balance),
          medianBalance: finite(body?.adaptivePlan?.statisticalValidation?.probability?.medianBalance),
          p90Balance: finite(body?.adaptivePlan?.statisticalValidation?.probability?.p90Balance),
          medianMaxDrawdownPct: finite(
            body?.adaptivePlan?.statisticalValidation?.probability?.medianMaxDrawdownPct
          ),
        },
        panoramas: panoramaList(body?.adaptivePlan?.panoramas),
        flags: textList(body?.adaptivePlan?.flags),
        nextWeeklyCheckpoints: milestoneList(body?.adaptivePlan?.nextWeeklyCheckpoints, 12),
        nextMonthlyCheckpoints: milestoneList(body?.adaptivePlan?.nextMonthlyCheckpoints, 12),
        quarterlyCheckpoints: milestoneList(body?.adaptivePlan?.quarterlyCheckpoints, 12),
        semiannualCheckpoints: milestoneList(body?.adaptivePlan?.semiannualCheckpoints, 30),
        annualCheckpoints: milestoneList(body?.adaptivePlan?.annualCheckpoints, 30),
      },
      financialCapacity: {
        capitalSource: "business_income",
        accountStructure: text(body?.financialCapacity?.accountStructure, 40),
        maxLeverageMultiple: finite(body?.financialCapacity?.maxLeverageMultiple),
        estimatedCostPerSessionUsd: finite(body?.financialCapacity?.estimatedCostPerSessionUsd),
        estimatedTaxReservePct: finite(body?.financialCapacity?.estimatedTaxReservePct),
      },
      executionEvidence: {
        depth: text(body?.executionEvidence?.depth, 40),
        sessions: Math.max(0, Math.floor(finite(body?.executionEvidence?.sessions))),
        trades: Math.max(0, Math.floor(finite(body?.executionEvidence?.trades))),
        winRatePct: finite(body?.executionEvidence?.winRatePct),
        profitFactor: finite(body?.executionEvidence?.profitFactor),
        expectancyUsd: finite(body?.executionEvidence?.expectancyUsd),
        avgNetPerSessionUsd: finite(body?.executionEvidence?.avgNetPerSessionUsd),
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
      "Distinguish the gross percentage-compound projection from the net projection after fixed session costs. If costsConsumePercentageEdge is true, say explicitly that fixed costs, not the win/loss compounding formula, caused the net balance to be exhausted.",
      "Evaluate arithmetic feasibility, operating-model coverage, loss assumptions, execution evidence, and uncertainty separately.",
      "Use the five panoramas to distinguish the user's declared case, conservative/moderate/aggressive policy cases, and exact target arithmetic.",
      "Treat probabilityTargetPct only as a conditional seeded-model hit rate under the entered win/loss percentages and frequency. Never describe it as an empirical or real-world probability of success.",
      "A mathematically possible target can still be speculative or unsupported by the selected policy; explain both facts without calling the target impossible.",
      "Discuss transaction-cost drag, tax-reserve planning, business cash flows, leverage, drawdown sensitivity, and 50%-capital-loss sensitivity when present.",
      "Use the adaptive plan as the authoritative disciplined horizon when the requested deadline is unsupported.",
      "When declared inputs exceed the policy cap or understate the policy loss floor, explain that they were evaluated but not used to accelerate the recommendation.",
      "Explain that maxDailyLossGuardrailPct is a hard guardrail while expectedLossDayPct is the modeled average losing-day assumption.",
      "Center the user on the next monthly checkpoint, then quarterly and annual checkpoints, rather than the final capital target.",
      "If qualificationRequired is true, state that the horizon is provisional until the minimum execution sample is reached.",
      "Use the private research methodology corpus when available for principles such as compounding, risk-return tradeoffs, drawdown, diversification of assumptions, and limitations of historical evidence.",
      "Do not claim to be a registered investment adviser. Do not recommend securities, entries, exits, leverage, or position sizes. Do not guarantee or forecast returns.",
      "Do not call a high return target safe or realistic merely because the compound formula resolves.",
      "Respond in the requested locale and return JSON only with: headline, summary, observations[], actions[], limitations[], methodologyNote.",
      "Keep actions focused on discipline: follow the next checkpoint, preserve the loss guardrail, validate the edge, review monthly, and extend the runway when required. Mention adding capital only as an explicit user decision, never as a requirement.",
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
