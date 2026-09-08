import type { GrowthPlanStrategy } from "@/lib/growthPlanSupabase";

export type StrategyReviewStatus = "pass" | "fail" | "unverified";
export type StrategyReviewSource = "broker" | "journal" | "trader" | "system";

export type StrategySnapshot = {
  id: string;
  name: string;
  setup: string;
  entryRules: string;
  exitRules: string;
  managementRules: string;
  invalidation: string;
  instruments: string[];
  timeframe: string;
  fingerprint: string;
  capturedAt: string;
  planVersion?: number | null;
  planUpdatedAt?: string | null;
};

export type StrategyCriterionAssessment = {
  status: StrategyReviewStatus;
  note?: string;
  updatedAt?: string;
};

export type StrategyReviewAssignment = {
  strategyId: string;
  snapshot: StrategySnapshot;
  assignedAt: string;
  assignmentTiming: "pre_trade" | "retrospective";
  assessments?: Record<string, StrategyCriterionAssessment>;
};

export type StrategyReviewCriterion = {
  id: string;
  phase: "eligibility" | "setup" | "entry" | "risk" | "management" | "exit";
  label: string;
  expected: string;
  actual: string;
  status: StrategyReviewStatus;
  source: StrategyReviewSource;
  automatic: boolean;
  reason: string;
};

export type StrategyReviewEvidence = {
  symbol?: string | null;
  kind?: string | null;
  respectedPlan?: boolean | null;
  stopPresent?: boolean | null;
  ocoUsed?: boolean | null;
  manualMarketExit?: boolean | null;
  timeToFirstStopSec?: number | null;
  stopModificationCount?: number | null;
  journalStrategyChecks?: string[];
  premarketThesis?: string[];
  premarketConfirmation?: string[];
  premarketInvalidation?: string[];
};

export type StrategyReviewResult = {
  score: number | null;
  evidenceCoverage: number;
  passed: number;
  failed: number;
  unverified: number;
  criteria: StrategyReviewCriterion[];
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function slug(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function strategyFingerprint(strategy: Partial<GrowthPlanStrategy>): string {
  return hashText(
    JSON.stringify({
      name: cleanText(strategy.name),
      setup: cleanText(strategy.setup),
      entryRules: cleanText(strategy.entryRules),
      exitRules: cleanText(strategy.exitRules),
      managementRules: cleanText(strategy.managementRules),
      invalidation: cleanText(strategy.invalidation),
      instruments: Array.isArray(strategy.instruments)
        ? strategy.instruments.map(cleanText).filter(Boolean)
        : [],
      timeframe: cleanText(strategy.timeframe),
    })
  );
}

export function strategyReferenceId(strategy: Partial<GrowthPlanStrategy>, index = 0): string {
  const explicit = cleanText((strategy as GrowthPlanStrategy).id);
  if (explicit) return explicit;
  return `legacy-${slug(cleanText(strategy.name) || "strategy")}-${index + 1}-${strategyFingerprint(strategy)}`;
}

export function createStrategySnapshot(
  strategy: GrowthPlanStrategy,
  options?: {
    index?: number;
    capturedAt?: string;
    planVersion?: number | null;
    planUpdatedAt?: string | null;
  }
): StrategySnapshot {
  const capturedAt = options?.capturedAt || new Date().toISOString();
  return {
    id: strategyReferenceId(strategy, options?.index ?? 0),
    name: cleanText(strategy.name) || "Unnamed strategy",
    setup: cleanText(strategy.setup),
    entryRules: cleanText(strategy.entryRules),
    exitRules: cleanText(strategy.exitRules),
    managementRules: cleanText(strategy.managementRules),
    invalidation: cleanText(strategy.invalidation),
    instruments: Array.isArray(strategy.instruments)
      ? strategy.instruments.map(cleanText).filter(Boolean)
      : [],
    timeframe: cleanText(strategy.timeframe),
    fingerprint: strategyFingerprint(strategy),
    capturedAt,
    planVersion: options?.planVersion ?? null,
    planUpdatedAt: options?.planUpdatedAt ?? null,
  };
}

export function normalizeStrategySnapshot(raw: unknown): StrategySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const name = cleanText(value.name);
  if (!name) return null;
  const base: GrowthPlanStrategy = {
    id: cleanText(value.id) || undefined,
    name,
    setup: cleanText(value.setup),
    entryRules: cleanText(value.entryRules),
    exitRules: cleanText(value.exitRules),
    managementRules: cleanText(value.managementRules),
    invalidation: cleanText(value.invalidation),
    instruments: Array.isArray(value.instruments)
      ? value.instruments.map(cleanText).filter(Boolean)
      : [],
    timeframe: cleanText(value.timeframe),
  };
  return {
    ...createStrategySnapshot(base, {
      capturedAt: cleanText(value.capturedAt) || new Date(0).toISOString(),
      planVersion:
        value.planVersion == null || !Number.isFinite(Number(value.planVersion))
          ? null
          : Number(value.planVersion),
      planUpdatedAt: cleanText(value.planUpdatedAt) || null,
    }),
    fingerprint: cleanText(value.fingerprint) || strategyFingerprint(base),
  };
}

export function strategyTradeKey(input: {
  date?: string | null;
  symbol?: string | null;
  kind?: string | null;
  entryTime?: string | null;
  exitTime?: string | null;
  sequence?: number | null;
}): string {
  return [
    cleanText(input.date).slice(0, 10),
    cleanText(input.symbol).toUpperCase(),
    cleanText(input.kind).toLowerCase(),
    cleanText(input.entryTime).toUpperCase(),
    cleanText(input.exitTime).toUpperCase(),
    String(input.sequence ?? 1),
  ].join("|");
}

export function normalizeStrategyAssignment(raw: unknown): StrategyReviewAssignment | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const snapshot = normalizeStrategySnapshot(value.snapshot);
  if (!snapshot) return null;
  const assignmentTiming = value.assignmentTiming === "pre_trade" ? "pre_trade" : "retrospective";
  const assessments: Record<string, StrategyCriterionAssessment> = {};
  if (value.assessments && typeof value.assessments === "object") {
    Object.entries(value.assessments as Record<string, unknown>).forEach(([id, item]) => {
      if (!item || typeof item !== "object") return;
      const row = item as Record<string, unknown>;
      const status = row.status;
      if (status !== "pass" && status !== "fail" && status !== "unverified") return;
      assessments[id] = {
        status,
        note: cleanText(row.note) || undefined,
        updatedAt: cleanText(row.updatedAt) || undefined,
      };
    });
  }
  return {
    strategyId: cleanText(value.strategyId) || snapshot.id,
    snapshot,
    assignedAt: cleanText(value.assignedAt) || snapshot.capturedAt,
    assignmentTiming,
    assessments,
  };
}

export function splitStrategyRules(value: string): string[] {
  const clean = String(value ?? "").trim();
  if (!clean) return [];
  const lines = clean
    .split(/\r?\n|\s*[;•]\s*/g)
    .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
  return lines.length > 1 ? lines : [cleanText(clean)];
}

function includesAny(value: string, needles: string[]): boolean {
  const lower = value.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function manualCriterion(
  phase: StrategyReviewCriterion["phase"],
  expected: string,
  index: number,
  assessments: Record<string, StrategyCriterionAssessment>,
  locale: "en" | "es"
): StrategyReviewCriterion {
  const isEs = locale === "es";
  const id = `${phase}-${hashText(`${index}:${expected.toLowerCase()}`)}`;
  const assessment = assessments[id];
  if (!assessment || assessment.status === "unverified") {
    return {
      id,
      phase,
      label: phase === "setup" ? (isEs ? "Setup / contexto" : "Setup / context") : phase === "entry" ? (isEs ? "Regla de entrada" : "Entry rule") : phase === "management" ? (isEs ? "Regla de manejo" : "Management rule") : (isEs ? "Regla de salida / invalidación" : "Exit / invalidation rule"),
      expected,
      actual: assessment?.note || (isEs ? "No hay evidencia objetiva ni confirmación del trader." : "No objective evidence or trader confirmation recorded."),
      status: "unverified",
      source: "trader",
      automatic: false,
      reason: isEs ? "Esta regla necesita evidencia del chart o evaluación del trader; el sistema no adivina." : "This rule needs chart evidence or a trader assessment; the system will not guess.",
    };
  }
  return {
    id,
    phase,
    label: phase === "setup" ? (isEs ? "Setup / contexto" : "Setup / context") : phase === "entry" ? (isEs ? "Regla de entrada" : "Entry rule") : phase === "management" ? (isEs ? "Regla de manejo" : "Management rule") : (isEs ? "Regla de salida / invalidación" : "Exit / invalidation rule"),
    expected,
    actual: assessment.note || (assessment.status === "pass" ? (isEs ? "El trader confirmó cumplimiento." : "Trader confirmed compliance.") : (isEs ? "El trader confirmó una desviación." : "Trader confirmed a deviation.")),
    status: assessment.status,
    source: "trader",
    automatic: false,
    reason: isEs ? "Evaluación guardada por el trader. Contrástala con el chart y la evidencia del broker." : "Saved trader assessment. Review it against the chart and broker evidence.",
  };
}

function brokerCriterion(params: {
  phase: StrategyReviewCriterion["phase"];
  label: string;
  expected: string;
  value: boolean | null | undefined;
  passActual: string;
  failActual: string;
  unknownActual: string;
  locale: "en" | "es";
}): StrategyReviewCriterion {
  const id = `${params.phase}-${hashText(`${params.label}:${params.expected}`.toLowerCase())}`;
  const status: StrategyReviewStatus =
    params.value === true ? "pass" : params.value === false ? "fail" : "unverified";
  return {
    id,
    phase: params.phase,
    label: params.label,
    expected: params.expected,
    actual:
      status === "pass"
        ? params.passActual
        : status === "fail"
          ? params.failActual
          : params.unknownActual,
    status,
    source: "broker",
    automatic: true,
    reason:
      status === "unverified"
        ? params.locale === "es"
          ? "El archivo del broker no provee evidencia suficiente para este check."
          : "The broker import does not provide enough evidence for this check."
        : params.locale === "es"
          ? "Veredicto derivado del historial de órdenes importado del broker."
          : "Verdict derived from imported broker order history.",
  };
}

export function buildStrategyReview(params: {
  strategy: StrategySnapshot;
  evidence: StrategyReviewEvidence;
  assessments?: Record<string, StrategyCriterionAssessment>;
  locale?: "en" | "es";
}): StrategyReviewResult {
  const { strategy, evidence } = params;
  const locale = params.locale ?? "en";
  const isEs = locale === "es";
  const assessments = params.assessments ?? {};
  const criteria: StrategyReviewCriterion[] = [];

  if (strategy.instruments.length) {
    const actualInstrument = cleanText(evidence.kind || evidence.symbol).toLowerCase();
    const symbol = cleanText(evidence.symbol).toLowerCase();
    const matches = strategy.instruments.some((item) => {
      const allowed = cleanText(item).toLowerCase();
      return !!allowed && (allowed === actualInstrument || allowed === symbol || actualInstrument.includes(allowed));
    });
    criteria.push({
      id: "eligibility-instrument",
      phase: "eligibility",
      label: isEs ? "Instrumento / mercado permitido" : "Allowed instrument / market",
      expected: strategy.instruments.join(", "),
      actual: cleanText(evidence.kind || evidence.symbol) || (isEs ? "Instrumento desconocido" : "Unknown instrument"),
      status: matches ? "pass" : "fail",
      source: "system",
      automatic: true,
      reason: matches ? (isEs ? "El instrumento operado está permitido por la estrategia." : "The traded instrument is allowed by the strategy.") : (isEs ? "El instrumento operado no coincide con la definición de la estrategia." : "The traded instrument does not match the strategy definition."),
    });
  }

  const addManualRules = (
    phase: StrategyReviewCriterion["phase"],
    text: string
  ) => {
    splitStrategyRules(text).forEach((rule, index) => {
      const stopRule = includesAny(rule, ["stop", "sl", "pérdida", "perdida"]);
      const ocoRule = includesAny(rule, ["oco", "bracket"]);
      if (stopRule) {
        criteria.push(
          brokerCriterion({
            phase: phase === "setup" || phase === "entry" ? "risk" : phase,
            label: isEs ? "Stop protector" : "Protective stop",
            expected: rule,
            value: evidence.stopPresent,
            passActual:
              evidence.timeToFirstStopSec != null
                ? isEs ? `Stop protector detectado ${Math.max(0, Math.round(evidence.timeToFirstStopSec))}s después de la entrada.` : `Protective stop detected ${Math.max(0, Math.round(evidence.timeToFirstStopSec))}s after entry.`
                : isEs ? "Stop protector detectado en el historial del broker." : "Protective stop detected in broker history.",
            failActual: isEs ? "No se detectó un stop protector para el trade auditado." : "No protective stop was detected for the audited trade.",
            unknownActual: isEs ? "No hubo evidencia utilizable del stop en el broker." : "No usable broker stop evidence was available.",
            locale,
          })
        );
        if (ocoRule) {
          criteria.push(
            brokerCriterion({
              phase: "risk",
              label: isEs ? "Protección OCO / bracket" : "OCO / bracket protection",
              expected: rule,
              value: evidence.ocoUsed,
              passActual: isEs ? "Se detectó vínculo OCO/bracket en el historial del broker." : "OCO/bracket linkage was detected in broker history.",
              failActual: isEs ? "No se detectó vínculo OCO/bracket en el historial del broker." : "No OCO/bracket linkage was detected in broker history.",
              unknownActual: isEs ? "La data del broker no pudo confirmar el vínculo OCO/bracket." : "The broker data could not confirm OCO/bracket linkage.",
              locale,
            })
          );
        }
        return;
      }
      if (ocoRule) {
        criteria.push(
          brokerCriterion({
            phase: "risk",
            label: isEs ? "Protección OCO / bracket" : "OCO / bracket protection",
            expected: rule,
            value: evidence.ocoUsed,
            passActual: isEs ? "Se detectó vínculo OCO/bracket en el historial del broker." : "OCO/bracket linkage was detected in broker history.",
            failActual: isEs ? "No se detectó vínculo OCO/bracket en el historial del broker." : "No OCO/bracket linkage was detected in broker history.",
            unknownActual: isEs ? "La data del broker no pudo confirmar el vínculo OCO/bracket." : "The broker data could not confirm OCO/bracket linkage.",
            locale,
          })
        );
        return;
      }
      criteria.push(manualCriterion(phase, rule, index, assessments, locale));
    });
  };

  addManualRules("setup", strategy.setup);
  addManualRules("entry", strategy.entryRules);
  addManualRules("management", strategy.managementRules);
  addManualRules("exit", strategy.exitRules);
  addManualRules("exit", strategy.invalidation);

  if (!criteria.length) {
    criteria.push({
      id: "strategy-definition-missing",
      phase: "setup",
      label: isEs ? "Definición de estrategia" : "Strategy definition",
      expected: isEs ? "Reglas de setup, entrada, riesgo, manejo y salida" : "Setup, entry, risk, management, and exit rules",
      actual: isEs ? "La estrategia seleccionada todavía no tiene reglas auditables." : "The selected strategy has no auditable rules yet.",
      status: "unverified",
      source: "system",
      automatic: true,
      reason: isEs ? "Completa la estrategia en el Plan de Empresa de Trading antes de calcular el score." : "Complete the strategy in the Trading Business Plan before scoring it.",
    });
  }

  const passed = criteria.filter((item) => item.status === "pass").length;
  const failed = criteria.filter((item) => item.status === "fail").length;
  const unverified = criteria.filter((item) => item.status === "unverified").length;
  const evaluable = passed + failed;
  return {
    score: evaluable ? Math.round((passed / evaluable) * 100) : null,
    evidenceCoverage: criteria.length ? Math.round((evaluable / criteria.length) * 100) : 0,
    passed,
    failed,
    unverified,
    criteria,
  };
}
