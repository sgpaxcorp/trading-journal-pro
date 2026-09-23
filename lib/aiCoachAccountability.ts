export type CoachVerdict =
  | "on_plan"
  | "at_risk"
  | "off_plan"
  | "insufficient_data"
  | "action_required";

export type CoachConfidence = "high" | "medium" | "low";

export type CoachEvidenceSource =
  | "plan"
  | "journal"
  | "analytics"
  | "audit"
  | "cashflow"
  | "memory"
  | "screenshot";

export type CoachEvidenceItem = {
  id: string;
  source: CoachEvidenceSource;
  date?: string | null;
  label: string;
  value: string;
  detail?: string | null;
  strength: "verified" | "reported" | "inference";
};

export type CoachCommitmentMetric =
  | "plan_compliance"
  | "daily_loss_limit"
  | "protective_stop";

export type CoachActionPlan = {
  summary: string;
  verdict: CoachVerdict;
  businessImpact: string;
  whatISee: string;
  whatIsDrifting: string;
  whatToProtect: string;
  whatChangesNextSession: string;
  nextAction: string;
  ruleToAdd: string;
  ruleToRemove: string;
  checkpointFocus: string;
};

export type CoachSuggestedCommitment = {
  title: string;
  instruction: string;
  successCriteria: string;
  metric: CoachCommitmentMetric;
  targetSessions: 3;
  thresholdUsd: number | null;
};

export type CoachCommitmentOutcome = {
  date: string;
  status: "met" | "missed" | "needs_evidence";
  label: string;
  value: string;
};

export type CoachCommitmentStatus = "active" | "completed" | "partial" | "missed" | "cancelled";

export type CoachCommitment = {
  id: string;
  accountId: string;
  threadId?: string | null;
  sourceMessageId?: string | null;
  title: string;
  instruction: string;
  successCriteria: string;
  metric: CoachCommitmentMetric;
  thresholdUsd?: number | null;
  targetSessions: number;
  baselineDate: string;
  status: CoachCommitmentStatus;
  sessionsObserved: number;
  sessionsEvaluated: number;
  sessionsMet: number;
  outcomes: CoachCommitmentOutcome[];
  evidence?: CoachEvidenceItem[];
  acceptedAt: string;
  updatedAt: string;
};

export type CommitmentEvaluationSession = {
  date: string;
  pnl: number;
  respectedPlan: boolean | null;
  stopPresent?: boolean | null;
};

export type CoachEvidenceInput = {
  language: "en" | "es";
  recentSessions?: Array<{
    date?: string | null;
    pnl?: number | null;
    respectedPlan?: boolean | null;
    respected_plan?: boolean | null;
    instrument?: string | null;
  }>;
  planSnapshot?: {
    currentBalance?: number | null;
    progressPct?: number | null;
    tradingPnlSincePlan?: number | null;
    sessionsSincePlan?: number | null;
  } | null;
  growthPlan?: {
    targetBalance?: number | null;
    targetDate?: string | null;
    dailyTargetPct?: number | null;
    maxDailyLossPercent?: number | null;
    maxRiskPerTradeUsd?: number | null;
  } | null;
  analyticsSnapshot?: {
    totals?: { sessions?: number | null; winRate?: number | null; netPnl?: number | null } | null;
    performance?: { profitFactor?: number | null; expectancy?: number | null } | null;
    risk?: { maxDrawdown?: number | null } | null;
  } | null;
  cashflowsSummary?: { netCashflows?: number | null; count?: number | null } | null;
  autoAudit?: {
    attached?: boolean;
    date?: string | null;
    instrument?: string | null;
    eventCount?: number | null;
    processScore?: number | null;
    disciplineScore?: number | null;
  } | null;
};

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export function buildCoachEvidence(input: CoachEvidenceInput): CoachEvidenceItem[] {
  const isEs = input.language === "es";
  const evidence: CoachEvidenceItem[] = [];
  const latest = Array.isArray(input.recentSessions) ? input.recentSessions[0] : null;
  if (latest?.date) {
    const respected = latest.respectedPlan ?? latest.respected_plan;
    evidence.push({
      id: `journal:${latest.date}`,
      source: "journal",
      date: String(latest.date).slice(0, 10),
      label: isEs ? "Última sesión" : "Latest session",
      value: `${money(latest.pnl)} · ${
        respected === true
          ? isEs ? "plan respetado" : "plan followed"
          : respected === false
            ? isEs ? "plan no respetado" : "plan not followed"
            : isEs ? "cumplimiento sin confirmar" : "compliance unconfirmed"
      }`,
      detail: latest.instrument ? String(latest.instrument) : null,
      strength: "verified",
    });
  }

  const plan = input.planSnapshot;
  if (plan && Number.isFinite(Number(plan.currentBalance))) {
    const progress = Number(plan.progressPct);
    evidence.push({
      id: "plan:progress",
      source: "plan",
      label: isEs ? "Progreso del plan" : "Plan progress",
      value: Number.isFinite(progress) ? `${progress.toFixed(1)}% · ${money(plan.currentBalance)}` : money(plan.currentBalance),
      detail: Number.isFinite(Number(plan.tradingPnlSincePlan))
        ? `${isEs ? "P&L desde el plan" : "P&L since plan"}: ${money(plan.tradingPnlSincePlan)}`
        : null,
      strength: "verified",
    });
  }

  const growth = input.growthPlan;
  if (growth && (Number.isFinite(Number(growth.targetBalance)) || Number.isFinite(Number(growth.maxRiskPerTradeUsd)))) {
    const pieces = [
      Number.isFinite(Number(growth.targetBalance)) ? `${isEs ? "meta" : "target"} ${money(growth.targetBalance)}` : "",
      Number.isFinite(Number(growth.dailyTargetPct)) ? `${Number(growth.dailyTargetPct).toFixed(2)}% ${isEs ? "diario" : "daily"}` : "",
      Number.isFinite(Number(growth.maxRiskPerTradeUsd)) ? `${money(growth.maxRiskPerTradeUsd)} ${isEs ? "riesgo/trade" : "risk/trade"}` : "",
    ].filter(Boolean);
    evidence.push({
      id: "plan:rails",
      source: "plan",
      date: growth.targetDate ? String(growth.targetDate).slice(0, 10) : null,
      label: isEs ? "Risk rails del plan" : "Plan risk rails",
      value: pieces.join(" · ") || (isEs ? "Plan conectado" : "Plan connected"),
      strength: "verified",
    });
  }

  const totals = input.analyticsSnapshot?.totals;
  const performance = input.analyticsSnapshot?.performance;
  const risk = input.analyticsSnapshot?.risk;
  if (totals && Number(totals.sessions) > 0) {
    const pieces = [
      `${Number(totals.sessions)} ${isEs ? "sesiones" : "sessions"}`,
      Number.isFinite(Number(totals.winRate)) ? `${Number(totals.winRate).toFixed(1)}% win rate` : "",
      Number.isFinite(Number(performance?.profitFactor)) ? `PF ${Number(performance?.profitFactor).toFixed(2)}` : "",
      Number.isFinite(Number(risk?.maxDrawdown)) ? `${isEs ? "DD" : "DD"} ${money(risk?.maxDrawdown)}` : "",
    ].filter(Boolean);
    evidence.push({
      id: "analytics:range",
      source: "analytics",
      label: isEs ? "Muestra analizada" : "Analyzed sample",
      value: pieces.join(" · "),
      strength: "verified",
    });
  }

  const audit = input.autoAudit;
  if (audit?.attached) {
    const scores = [
      typeof audit.disciplineScore === "number" ? `${isEs ? "disciplina" : "discipline"} ${audit.disciplineScore}%` : "",
      typeof audit.processScore === "number" ? `${isEs ? "proceso" : "process"} ${audit.processScore}%` : "",
    ].filter(Boolean);
    evidence.push({
      id: `audit:${audit.date || "latest"}:${audit.instrument || "all"}`,
      source: "audit",
      date: audit.date || null,
      label: isEs ? "Auditoría de órdenes" : "Order audit",
      value: `${audit.eventCount ?? 0} ${isEs ? "eventos" : "events"}${scores.length ? ` · ${scores.join(" · ")}` : ""}`,
      detail: audit.instrument || null,
      strength: "verified",
    });
  }

  const cashflows = input.cashflowsSummary;
  if (cashflows && Number(cashflows.count) > 0) {
    evidence.push({
      id: "cashflow:range",
      source: "cashflow",
      label: isEs ? "Cashflow del rango" : "Range cashflow",
      value: `${money(cashflows.netCashflows)} · ${Number(cashflows.count)} ${isEs ? "movimientos" : "transactions"}`,
      strength: "verified",
    });
  }

  return evidence.slice(0, 6);
}

function normalizedText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeCoachVerdict(value: unknown): CoachVerdict {
  const normalized = normalizedText(value).replace(/[\s-]+/g, "_");
  if (normalized.includes("off_plan") || normalized.includes("fuera_de_plan")) return "off_plan";
  if (normalized.includes("at_risk") || normalized.includes("en_riesgo")) return "at_risk";
  if (normalized.includes("action_required") || normalized.includes("accion_requerida")) return "action_required";
  if (normalized.includes("insufficient") || normalized.includes("insuficiente")) return "insufficient_data";
  if (normalized.includes("on_plan") || normalized.includes("en_plan")) return "on_plan";
  return "insufficient_data";
}

export function coachConfidenceFromEvidence(evidence: CoachEvidenceItem[]): CoachConfidence {
  const verified = evidence.filter((item) => item.strength === "verified").length;
  const distinctSources = new Set(evidence.map((item) => item.source)).size;
  if (verified >= 3 && distinctSources >= 3) return "high";
  if (verified >= 1 && distinctSources >= 2) return "medium";
  return "low";
}

export function inferCommitmentMetric(actionPlan: Partial<CoachActionPlan>): CoachCommitmentMetric {
  const text = normalizedText(
    [
      actionPlan.nextAction,
      actionPlan.whatChangesNextSession,
      actionPlan.ruleToAdd,
      actionPlan.ruleToRemove,
      actionPlan.checkpointFocus,
    ].join(" ")
  );
  if (/(stop|oco|bracket|proteccion|protective)/.test(text)) return "protective_stop";
  if (/(daily loss|perdida diaria|max loss|drawdown|limite de perdida|riesgo diario)/.test(text)) {
    return "daily_loss_limit";
  }
  return "plan_compliance";
}

export function buildSuggestedCommitment(params: {
  actionPlan: Partial<CoachActionPlan>;
  language: "en" | "es";
  maxDailyLossUsd?: number | null;
}): CoachSuggestedCommitment {
  const { actionPlan, language } = params;
  const metric = inferCommitmentMetric(actionPlan);
  const instruction = String(
    actionPlan.nextAction || actionPlan.whatChangesNextSession || actionPlan.whatToProtect || ""
  ).trim();
  const title = String(actionPlan.checkpointFocus || actionPlan.summary || instruction).trim().slice(0, 140);
  const threshold = Number(params.maxDailyLossUsd);
  const thresholdUsd = Number.isFinite(threshold) && threshold > 0 ? threshold : null;

  let successCriteria: string;
  if (metric === "protective_stop") {
    successCriteria =
      language === "es"
        ? "Las próximas 3 sesiones auditables muestran protección con stop después de abrir riesgo."
        : "The next 3 auditable sessions show protective-stop coverage after risk is opened.";
  } else if (metric === "daily_loss_limit" && thresholdUsd) {
    successCriteria =
      language === "es"
        ? `Las próximas 3 sesiones se mantienen dentro del límite diario de $${thresholdUsd.toFixed(2)}.`
        : `The next 3 sessions remain inside the $${thresholdUsd.toFixed(2)} daily loss limit.`;
  } else {
    successCriteria =
      language === "es"
        ? "Las próximas 3 sesiones quedan registradas como plan respetado."
        : "The next 3 sessions are recorded as plan followed.";
  }

  return {
    title: title || (language === "es" ? "Compromiso de la próxima sesión" : "Next-session commitment"),
    instruction:
      instruction ||
      (language === "es"
        ? "Ejecutar la próxima sesión dentro del plan y documentar el resultado."
        : "Execute the next session inside the plan and document the result."),
    successCriteria,
    metric,
    targetSessions: 3,
    thresholdUsd,
  };
}

function outcomeForSession(params: {
  metric: CoachCommitmentMetric;
  thresholdUsd?: number | null;
  session: CommitmentEvaluationSession;
  language: "en" | "es";
}): CoachCommitmentOutcome {
  const { metric, session, language } = params;
  if (metric === "protective_stop") {
    if (session.stopPresent == null) {
      return {
        date: session.date,
        status: "needs_evidence",
        label: language === "es" ? "Falta Audit" : "Audit needed",
        value: language === "es" ? "Sin evidencia de órdenes" : "No order evidence",
      };
    }
    return {
      date: session.date,
      status: session.stopPresent ? "met" : "missed",
      label: language === "es" ? "Protección" : "Protection",
      value: session.stopPresent
        ? language === "es" ? "Stop confirmado" : "Stop confirmed"
        : language === "es" ? "Stop no confirmado" : "Stop not confirmed",
    };
  }

  if (metric === "daily_loss_limit") {
    const threshold = Number(params.thresholdUsd);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return {
        date: session.date,
        status: "needs_evidence",
        label: language === "es" ? "Falta límite" : "Limit needed",
        value: language === "es" ? "Configura la pérdida diaria" : "Configure the daily loss limit",
      };
    }
    const met = session.pnl >= -Math.abs(threshold);
    return {
      date: session.date,
      status: met ? "met" : "missed",
      label: language === "es" ? "Límite diario" : "Daily limit",
      value: `${session.pnl >= 0 ? "+" : "-"}$${Math.abs(session.pnl).toFixed(2)}`,
    };
  }

  if (session.respectedPlan == null) {
    return {
      date: session.date,
      status: "needs_evidence",
      label: language === "es" ? "Falta revisión" : "Review needed",
      value: language === "es" ? "Confirma si respetaste el plan" : "Confirm whether the plan was followed",
    };
  }
  return {
    date: session.date,
    status: session.respectedPlan ? "met" : "missed",
    label: language === "es" ? "Cumplimiento" : "Compliance",
    value: session.respectedPlan
      ? language === "es" ? "Plan respetado" : "Plan followed"
      : language === "es" ? "Plan no respetado" : "Plan not followed",
  };
}

export function evaluateCoachCommitment(params: {
  metric: CoachCommitmentMetric;
  targetSessions?: number;
  thresholdUsd?: number | null;
  sessions: CommitmentEvaluationSession[];
  language: "en" | "es";
}) {
  const targetSessions = Math.max(1, Math.min(10, Math.trunc(params.targetSessions || 3)));
  const sessions = [...params.sessions]
    .filter((session) => /^\d{4}-\d{2}-\d{2}$/.test(session.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, targetSessions);
  const outcomes = sessions.map((session) =>
    outcomeForSession({
      metric: params.metric,
      thresholdUsd: params.thresholdUsd,
      session,
      language: params.language,
    })
  );
  const evaluated = outcomes.filter((item) => item.status !== "needs_evidence");
  const met = outcomes.filter((item) => item.status === "met").length;
  let status: CoachCommitmentStatus = "active";
  if (sessions.length >= targetSessions && evaluated.length >= targetSessions) {
    if (met === targetSessions) status = "completed";
    else if (met >= Math.ceil(targetSessions * (2 / 3))) status = "partial";
    else status = "missed";
  }
  return {
    status,
    sessionsObserved: sessions.length,
    sessionsEvaluated: evaluated.length,
    sessionsMet: met,
    outcomes,
  };
}
