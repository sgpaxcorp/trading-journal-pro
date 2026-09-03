import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import {
  buildGrowthPlanReviewInstructions,
  GROWTH_PLAN_REVIEW_TEXT_FORMAT,
  growthPlanModelCandidates,
} from "@/lib/growthPlanAiReview";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { countResponseFileSearchCalls, recordAiUsage } from "@/lib/aiUsageServer";

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

function normalizeReview(
  raw: any,
  model: string,
  usedResearchCorpus: boolean,
  selectedScenario: { id: string; title: string },
  verdict: string
) {
  return {
    selectedScenarioId: selectedScenario.id,
    selectedScenarioTitle: selectedScenario.title,
    verdict,
    headline: text(raw?.headline, 180),
    summary: text(raw?.summary, 1200),
    scenarioAnalysis: text(raw?.scenarioAnalysis, 1200),
    deadlineAnalysis: text(raw?.deadlineAnalysis, 1200),
    riskAnalysis: text(raw?.riskAnalysis, 1200),
    evidenceAnalysis: text(raw?.evidenceAnalysis, 1200),
    comparison: text(raw?.comparison, 1200),
    observations: textList(raw?.observations),
    actions: textList(raw?.actions),
    limitations: textList(raw?.limitations),
    methodologyNote: text(raw?.methodologyNote, 600),
    model,
    usedResearchCorpus,
    generatedAt: new Date().toISOString(),
  };
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
    const startingCapitalUsd = finite(body?.startingCapitalUsd);
    const selectedScenarioId = text(
      body?.adaptivePlan?.selectedPlanId ?? body?.selectedScenario?.id,
      30
    );
    const selectedScenarioTitle = text(body?.selectedScenario?.title, 100) || selectedScenarioId;
    const selectedGoalDayPct = finite(
      body?.adaptivePlan?.recommendedGoalDayPct ?? body?.selectedScenario?.goalDayReturnPct
    );
    const selectedExpectedLossDayPct = finite(
      body?.adaptivePlan?.expectedLossDayPct ?? body?.selectedScenario?.expectedLossDayPct
    );
    const selectedMaxDailyLossPct = finite(
      body?.adaptivePlan?.maxDailyLossGuardrailPct ??
        body?.selectedScenario?.maxDailyLossGuardrailPct
    );
    const selectedRiskPerTradePct = finite(
      body?.adaptivePlan?.riskPerTradePct ?? body?.selectedScenario?.riskPerTradePct
    );
    const usdAtStartingCapital = (percentage: number) =>
      Number(((startingCapitalUsd * percentage) / 100).toFixed(2));
    const deterministicSnapshot = {
      startingCapitalUsd,
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
      selectedScenario: {
        id: selectedScenarioId,
        title: selectedScenarioTitle,
        isManual: selectedScenarioId === "manual",
        goalDayReturnPct: selectedGoalDayPct,
        expectedLossDayPct: selectedExpectedLossDayPct,
        maxDailyLossGuardrailPct: selectedMaxDailyLossPct,
        riskPerTradePct: selectedRiskPerTradePct,
        operatingDaysPerWeek: Math.max(
          0,
          Math.floor(finite(body?.adaptivePlan?.operatingDaysPerWeek))
        ),
        goalDaysPerWeek: Math.max(
          0,
          Math.floor(finite(body?.selectedScenario?.goalDaysPerWeek))
        ),
        lossDaysPerWeek: Math.max(
          0,
          Math.floor(
            finite(
              body?.adaptivePlan?.lossDaysPerWeek ?? body?.selectedScenario?.lossDaysPerWeek
            )
          )
        ),
        goalDayGainUsdAtStartingCapital: usdAtStartingCapital(selectedGoalDayPct),
        expectedLossDayUsdAtStartingCapital: usdAtStartingCapital(
          selectedExpectedLossDayPct
        ),
        maxDailyLossUsdAtStartingCapital: usdAtStartingCapital(selectedMaxDailyLossPct),
        riskPerTradeUsdAtStartingCapital: usdAtStartingCapital(selectedRiskPerTradePct),
        projectedBalanceAtDeadlineUsd: finite(
          body?.selectedScenario?.projectedBalanceAtDeadlineUsd
        ),
        coverageAtDeadlinePct: finite(body?.selectedScenario?.coverageAtDeadlinePct),
        shortfallAtDeadlineUsd: finite(body?.selectedScenario?.shortfallAtDeadlineUsd),
        completionDate: text(body?.selectedScenario?.completionDate, 20),
        reachesRequestedDeadline: Boolean(body?.selectedScenario?.reachesRequestedDeadline),
        sensitivity: {
          probabilityTargetPct: finite(body?.selectedScenario?.sensitivity?.probabilityTargetPct),
          probabilityCapitalHalfPct: finite(
            body?.selectedScenario?.sensitivity?.probabilityCapitalHalfPct
          ),
          p10BalanceUsd: finite(body?.selectedScenario?.sensitivity?.p10BalanceUsd),
          medianBalanceUsd: finite(body?.selectedScenario?.sensitivity?.medianBalanceUsd),
          p90BalanceUsd: finite(body?.selectedScenario?.sensitivity?.p90BalanceUsd),
          medianMaxDrawdownPct: finite(
            body?.selectedScenario?.sensitivity?.medianMaxDrawdownPct
          ),
        },
      },
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
        riskPerTradePct: finite(body?.adaptivePlan?.riskPerTradePct),
        lossDaysPerWeek: Math.max(0, Math.floor(finite(body?.adaptivePlan?.lossDaysPerWeek))),
        operatingDaysPerWeek: Math.max(
          0,
          Math.floor(finite(body?.adaptivePlan?.operatingDaysPerWeek))
        ),
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
      deterministicSnapshot.committedTradingDays <= 0 ||
      !deterministicSnapshot.selectedScenario.id
    ) {
      return NextResponse.json(
        { error: "Choose an operating scenario and complete the plan before requesting a review." },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const vectorStoreId = String(process.env.NEURO_ANALYSIS_CFA_VECTOR_STORE_ID ?? "").trim();
    const tools = vectorStoreId
      ? [{ type: "file_search" as const, vector_store_ids: [vectorStoreId], max_num_results: 10 }]
      : [];
    const instructions = buildGrowthPlanReviewInstructions();
    const input = JSON.stringify({ locale, deterministicSnapshot }, null, 2);

    let lastError: unknown = null;
    for (const model of growthPlanModelCandidates()) {
      try {
        const isGpt56 = model.startsWith("gpt-5.6");
        const response = await client.responses.create({
          model,
          instructions,
          input,
          tools,
          include: tools.length ? ["file_search_call.results"] : undefined,
          text: { format: GROWTH_PLAN_REVIEW_TEXT_FORMAT },
          reasoning: isGpt56 ? { effort: "medium" } : undefined,
          max_output_tokens: isGpt56 ? 3500 : 1800,
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
        await recordAiUsage({
          userId: access.context.userId,
          requestId: req.headers.get("x-request-id"),
          feature: "growth_plan",
          category: "advanced",
          operation: "research_review",
          model: String((response as any)?.model || model),
          usage: (response as any)?.usage,
          apiKind: "responses",
          fileSearchCalls: countResponseFileSearchCalls(response),
          metadata: { usedResearchCorpus },
        });
        return NextResponse.json({
          review: normalizeReview(
            parsed,
            model,
            usedResearchCorpus,
            deterministicSnapshot.selectedScenario,
            deterministicSnapshot.adaptivePlan.verdict
          ),
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
