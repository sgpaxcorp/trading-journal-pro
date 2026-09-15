import { describe, expect, it } from "vitest";

import {
  buildDashboardCoachSource,
  dashboardCoachSourceSignature,
  normalizeDashboardCoachPlan,
  resolveDailyGoalStatus,
} from "@/lib/dashboardCoachPlan";

const account = { id: "account-1", name: "Primary", account_type: "personal" };
const plan = {
  starting_balance: 10_000,
  target_balance: 250_000,
  target_date: "2028-09-15",
  daily_target_pct: 1,
  max_daily_loss_percent: 2,
  updated_at: "2026-09-13T20:00:00.000Z",
};

describe("dashboard coach plan freshness", () => {
  it("prioritizes yesterday when it is the newest recorded session", () => {
    const source = buildDashboardCoachSource({
      account,
      plan,
      asOfDate: "2026-09-15",
      entries: [
        { date: "2026-09-13", pnl: 100, respected_plan: true },
        { date: "2026-09-14", pnl: -35, respected_plan: false, instrument: "NQ" },
      ],
    });

    expect(source.latestSessionDate).toBe("2026-09-14");
    expect(source.sessions.map((session) => session.date)).toEqual(["2026-09-14", "2026-09-13"]);
  });

  it("changes the signature when a new session or correction arrives", () => {
    const friday = buildDashboardCoachSource({
      account,
      plan,
      asOfDate: "2026-09-13",
      entries: [{ date: "2026-09-13", pnl: 100, respected_plan: true }],
    });
    const sunday = buildDashboardCoachSource({
      account,
      plan,
      asOfDate: "2026-09-15",
      entries: [
        { date: "2026-09-13", pnl: 100, respected_plan: true },
        { date: "2026-09-14", pnl: -35, respected_plan: false },
      ],
    });
    const corrected = buildDashboardCoachSource({
      account,
      plan,
      asOfDate: "2026-09-15",
      entries: [
        { date: "2026-09-13", pnl: 100, respected_plan: true },
        { date: "2026-09-14", pnl: -20, respected_plan: true },
      ],
    });

    expect(dashboardCoachSourceSignature(sunday)).not.toBe(dashboardCoachSourceSignature(friday));
    expect(dashboardCoachSourceSignature(corrected)).not.toBe(dashboardCoachSourceSignature(sunday));
  });

  it("does not regenerate merely because a calendar day passed with no new evidence", () => {
    const firstLoad = buildDashboardCoachSource({
      account,
      plan,
      asOfDate: "2026-09-15",
      entries: [{ date: "2026-09-14", pnl: 75, respected_plan: true }],
    });
    const nextDay = buildDashboardCoachSource({
      account,
      plan,
      asOfDate: "2026-09-16",
      entries: [{ date: "2026-09-14", pnl: 75, respected_plan: true }],
    });

    expect(dashboardCoachSourceSignature(nextDay)).toBe(dashboardCoachSourceSignature(firstLoad));
  });

  it("ignores timestamp-only autosaves when the evidence did not change", () => {
    const firstSave = buildDashboardCoachSource({
      account,
      plan: { ...plan, updated_at: "2026-09-15T12:00:00.000Z" },
      asOfDate: "2026-09-15",
      entries: [{ date: "2026-09-14", pnl: 75, respected_plan: true, updated_at: "2026-09-14T20:00:00.000Z" }],
    });
    const repeatedSave = buildDashboardCoachSource({
      account,
      plan: { ...plan, updated_at: "2026-09-15T12:05:00.000Z" },
      asOfDate: "2026-09-15",
      entries: [{ date: "2026-09-14", pnl: 75, respected_plan: true, updated_at: "2026-09-15T12:05:00.000Z" }],
    });

    expect(dashboardCoachSourceSignature(repeatedSave)).toBe(dashboardCoachSourceSignature(firstSave));
  });

  it("forces the latest date, P&L, and plan compliance into the visible analysis", () => {
    const source = buildDashboardCoachSource({
      account,
      plan,
      asOfDate: "2026-09-15",
      entries: [{ date: "2026-09-14", pnl: -35, respected_plan: false }],
    });
    const normalized = normalizeDashboardCoachPlan({
      source,
      sourceSignature: "signature",
      language: "es",
      raw: {
        summary: "La disciplina requiere atención.",
        whatISee: "La última ejecución rompió el límite definido.",
        whatIsDrifting: "La disciplina.",
        whatToProtect: "El capital.",
        whatChangesNextSession: "Reducir riesgo.",
        nextAction: "Revisar el checklist.",
        ruleToAdd: "Confirmar el stop.",
        ruleToRemove: "Entradas impulsivas.",
        checkpointFocus: "Cumplimiento.",
        referencedDates: ["2026-09-13"],
      },
    });

    expect(normalized.actionPlan.whatISee).toContain("2026-09-14");
    expect(normalized.actionPlan.whatISee).toContain("-$35.00");
    expect(normalized.actionPlan.whatISee).toContain("no respetado");
    expect(normalized.referencedDates).toContain("2026-09-14");
  });
});

describe("daily money goal status", () => {
  it("distinguishes no activity, in progress, met, and paused", () => {
    expect(
      resolveDailyGoalStatus({
        hasPlan: true,
        isTradingDay: true,
        expectedUsd: 100,
        actualUsd: 0,
        hasSession: false,
      })
    ).toBe("no_activity");
    expect(
      resolveDailyGoalStatus({
        hasPlan: true,
        isTradingDay: true,
        expectedUsd: 100,
        actualUsd: 60,
        hasSession: true,
      })
    ).toBe("in_progress");
    expect(
      resolveDailyGoalStatus({
        hasPlan: true,
        isTradingDay: true,
        expectedUsd: 100,
        actualUsd: 115,
        hasSession: true,
      })
    ).toBe("met");
    expect(
      resolveDailyGoalStatus({
        hasPlan: true,
        isTradingDay: false,
        expectedUsd: 0,
        actualUsd: 0,
        hasSession: false,
      })
    ).toBe("paused");
  });
});
