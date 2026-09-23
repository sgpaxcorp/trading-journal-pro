import { describe, expect, it } from "vitest";

import {
  buildCoachEvidence,
  buildSuggestedCommitment,
  coachConfidenceFromEvidence,
  evaluateCoachCommitment,
  inferCommitmentMetric,
} from "@/lib/aiCoachAccountability";
import { aiCoachSafetyPolicy } from "@/lib/aiCoachPolicy";

describe("AI Coach evidence and accountability", () => {
  it("keeps profitable rule-breaking visible instead of rewarding P&L alone", () => {
    const evidence = buildCoachEvidence({
      language: "en",
      recentSessions: [{ date: "2026-09-18", pnl: 420, respectedPlan: false, instrument: "SPXW" }],
      planSnapshot: { currentBalance: 10_420, progressPct: 12, tradingPnlSincePlan: 420 },
    });

    expect(evidence[0]?.value).toContain("+$420.00");
    expect(evidence[0]?.value).toContain("plan not followed");
  });

  it("protects compliant execution even when the session loses", () => {
    const evidence = buildCoachEvidence({
      language: "es",
      recentSessions: [{ date: "2026-09-18", pnl: -85, respectedPlan: true }],
    });

    expect(evidence[0]?.value).toContain("-$85.00");
    expect(evidence[0]?.value).toContain("plan respetado");
  });

  it("raises confidence only when distinct verified sources support the read", () => {
    const evidence = buildCoachEvidence({
      language: "en",
      recentSessions: [{ date: "2026-09-18", pnl: 25, respectedPlan: true }],
      planSnapshot: { currentBalance: 10_025, progressPct: 2.5 },
      analyticsSnapshot: { totals: { sessions: 12, winRate: 58, netPnl: 420 } },
    });

    expect(coachConfidenceFromEvidence(evidence)).toBe("high");
  });

  it("completes a commitment only after three evaluable sessions", () => {
    const evaluation = evaluateCoachCommitment({
      metric: "plan_compliance",
      language: "en",
      sessions: [
        { date: "2026-09-20", pnl: 10, respectedPlan: true },
        { date: "2026-09-21", pnl: -5, respectedPlan: true },
        { date: "2026-09-22", pnl: 8, respectedPlan: true },
      ],
    });

    expect(evaluation.status).toBe("completed");
    expect(evaluation.sessionsMet).toBe(3);
  });

  it("classifies two of three compliant sessions as partial", () => {
    const evaluation = evaluateCoachCommitment({
      metric: "daily_loss_limit",
      thresholdUsd: 100,
      language: "es",
      sessions: [
        { date: "2026-09-20", pnl: -40, respectedPlan: null },
        { date: "2026-09-21", pnl: -125, respectedPlan: null },
        { date: "2026-09-22", pnl: 50, respectedPlan: null },
      ],
    });

    expect(evaluation.status).toBe("partial");
    expect(evaluation.sessionsMet).toBe(2);
  });

  it("does not guess protective-stop compliance without order evidence", () => {
    const evaluation = evaluateCoachCommitment({
      metric: "protective_stop",
      language: "en",
      sessions: [
        { date: "2026-09-20", pnl: 10, respectedPlan: true, stopPresent: true },
        { date: "2026-09-21", pnl: 10, respectedPlan: true, stopPresent: null },
        { date: "2026-09-22", pnl: 10, respectedPlan: true, stopPresent: true },
      ],
    });

    expect(evaluation.status).toBe("active");
    expect(evaluation.sessionsEvaluated).toBe(2);
    expect(evaluation.outcomes[1]?.status).toBe("needs_evidence");
  });

  it("turns stop and loss-limit recommendations into measurable controls", () => {
    expect(inferCommitmentMetric({ nextAction: "Use an OCO protective stop on entry." })).toBe("protective_stop");
    const commitment = buildSuggestedCommitment({
      actionPlan: { nextAction: "Respect the daily loss limit.", checkpointFocus: "Capital protection" },
      language: "en",
      maxDailyLossUsd: 200,
    });
    expect(commitment.metric).toBe("daily_loss_limit");
    expect(commitment.successCriteria).toContain("$200.00");
    expect(commitment.targetSessions).toBe(3);
  });
});

describe("AI Coach safety boundary", () => {
  it("prohibits signals and order placement in both languages", () => {
    expect(aiCoachSafetyPolicy("en")).toMatch(/Do not recommend buying, selling, or holding/i);
    expect(aiCoachSafetyPolicy("en")).toMatch(/Do not place/i);
    expect(aiCoachSafetyPolicy("es")).toMatch(/No des recomendaciones de comprar, vender o mantener/i);
    expect(aiCoachSafetyPolicy("es")).toMatch(/No coloques/i);
  });
});
