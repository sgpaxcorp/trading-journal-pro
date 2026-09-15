export type DashboardCoachSession = {
  date: string;
  pnl: number;
  instrument: string | null;
  direction: string | null;
  emotion: string | null;
  respectedPlan: boolean | null;
  tags: string[];
  notes: string | null;
  updatedAt: string | null;
  trades: Array<{
    symbol: string | null;
    kind: string | null;
    side: string | null;
    strategy: string | null;
  }>;
};

export type DashboardCoachSource = {
  accountId: string;
  accountName: string | null;
  accountType: string | null;
  asOfDate: string;
  latestSessionDate: string | null;
  sessions: DashboardCoachSession[];
  plan: {
    startingBalance: number;
    targetBalance: number;
    targetDate: string | null;
    dailyTargetPct: number;
    maxDailyLossPct: number;
    maxRiskPerTradePct: number;
    maxRiskPerTradeUsd: number | null;
    steps: unknown;
    rules: unknown;
    updatedAt: string | null;
  } | null;
};

export type DashboardCoachActionPlan = {
  summary: string;
  whatISee: string;
  whatIsDrifting: string;
  whatToProtect: string;
  whatChangesNextSession: string;
  nextAction: string;
  ruleToAdd: string;
  ruleToRemove: string;
  checkpointFocus: string;
};

export type DashboardCoachPlan = {
  summary: string;
  generatedAt: string;
  sourceDate: string | null;
  sourceSignature: string;
  referencedDates: string[];
  actionPlan: DashboardCoachActionPlan;
};

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function dateKey(value: unknown) {
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function compactNotes(value: unknown) {
  const text = cleanText(value, 1_600);
  if (!text || text === "{}") return null;
  return text;
}

function hashText(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildDashboardCoachSource(params: {
  account: any;
  entries: any[];
  trades?: any[];
  plan?: any | null;
  asOfDate: string;
}): DashboardCoachSource {
  const tradesByDate = new Map<string, any[]>();
  for (const trade of Array.isArray(params.trades) ? params.trades : []) {
    const date = dateKey(trade?.journal_date ?? trade?.date);
    if (!date) continue;
    const current = tradesByDate.get(date) ?? [];
    current.push(trade);
    tradesByDate.set(date, current);
  }

  const sessions = (Array.isArray(params.entries) ? params.entries : [])
    .map((entry): DashboardCoachSession | null => {
      const date = dateKey(entry?.date);
      if (!date || date > params.asOfDate) return null;
      return {
        date,
        pnl: finite(entry?.pnl),
        instrument: cleanText(entry?.instrument, 80),
        direction: cleanText(entry?.direction, 30),
        emotion: cleanText(entry?.emotion, 120),
        respectedPlan:
          typeof entry?.respected_plan === "boolean"
            ? entry.respected_plan
            : typeof entry?.respectedPlan === "boolean"
              ? entry.respectedPlan
              : null,
        tags: Array.isArray(entry?.tags)
          ? entry.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean).sort().slice(0, 12)
          : [],
        notes: compactNotes(entry?.notes),
        updatedAt: cleanText(entry?.updated_at ?? entry?.updatedAt, 40),
        trades: (tradesByDate.get(date) ?? [])
          .map((trade) => ({
            symbol: cleanText(trade?.symbol, 40),
            kind: cleanText(trade?.kind, 40),
            side: cleanText(trade?.side, 30),
            strategy: cleanText(trade?.strategy, 100),
          }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
          .slice(0, 20),
      };
    })
    .filter((session): session is DashboardCoachSession => Boolean(session))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  const rawPlan = params.plan;
  const plan = rawPlan
    ? {
        startingBalance: finite(rawPlan?.starting_balance ?? rawPlan?.startingBalance),
        targetBalance: finite(rawPlan?.target_balance ?? rawPlan?.targetBalance),
        targetDate: dateKey(rawPlan?.target_date ?? rawPlan?.targetDate),
        dailyTargetPct: finite(
          rawPlan?.daily_target_pct ??
            rawPlan?.daily_goal_percent ??
            rawPlan?.dailyTargetPct ??
            rawPlan?.dailyGoalPercent
        ),
        maxDailyLossPct: finite(rawPlan?.max_daily_loss_percent ?? rawPlan?.maxDailyLossPercent),
        maxRiskPerTradePct: finite(
          rawPlan?.max_risk_per_trade_percent ?? rawPlan?.maxRiskPerTradePercent
        ),
        maxRiskPerTradeUsd:
          rawPlan?.max_risk_per_trade_usd == null && rawPlan?.maxRiskPerTradeUSD == null
            ? null
            : finite(rawPlan?.max_risk_per_trade_usd ?? rawPlan?.maxRiskPerTradeUSD),
        steps: rawPlan?.steps ?? null,
        rules: rawPlan?.rules ?? null,
        updatedAt: cleanText(rawPlan?.updated_at ?? rawPlan?.updatedAt, 40),
      }
    : null;

  return {
    accountId: String(params.account?.id ?? "").trim(),
    accountName: cleanText(params.account?.name, 100),
    accountType: cleanText(params.account?.account_type ?? params.account?.accountType, 30),
    asOfDate: params.asOfDate,
    latestSessionDate: sessions[0]?.date ?? null,
    sessions,
    plan,
  };
}

export function dashboardCoachSourceSignature(source: DashboardCoachSource) {
  const evidence = {
    ...source,
    asOfDate: undefined,
    plan: source.plan ? { ...source.plan, updatedAt: undefined } : null,
    sessions: source.sessions.map((session) => ({ ...session, updatedAt: undefined })),
  };
  return `v2-${hashText(JSON.stringify(evidence))}`;
}

export function dashboardCoachInstructions(language: "en" | "es") {
  if (language === "es") {
    return [
      "Eres el Coach Empresarial IA de un Empresario Trader.",
      "Evalúa objetivamente la cuenta usando únicamente la evidencia provista.",
      "La sesión más reciente es obligatoria: menciona su fecha exacta, P&L y cumplimiento del plan en whatISee.",
      "Compara la sesión más reciente con las anteriores cuando exista evidencia suficiente.",
      "Distingue resultado económico de calidad de ejecución. Una ganancia no convierte una ruptura de reglas en buena ejecución.",
      "No inventes operaciones, causas, emociones ni conclusiones. Cuando falte evidencia, dilo de forma puntual.",
      "Mantén un criterio estable: la misma data debe producir prácticamente la misma evaluación y prioridad.",
      "Escribe como un coach humano, directo y profesional; evita frases genéricas o motivacionales sin soporte.",
      "No des recomendaciones de compra o venta ni prometas resultados.",
      "Devuelve solamente JSON válido con todas las propiedades solicitadas.",
    ].join("\n");
  }

  return [
    "You are the Business AI Coach for a Trader Entrepreneur.",
    "Evaluate the account objectively using only the supplied evidence.",
    "The newest session is mandatory: mention its exact date, P&L, and plan compliance in whatISee.",
    "Compare the newest session with earlier sessions when the evidence supports it.",
    "Separate financial outcome from execution quality. A profit does not make a rule violation good execution.",
    "Do not invent trades, causes, emotions, or conclusions. State missing evidence directly.",
    "Keep the standard stable: identical data should yield nearly identical evaluation and priority.",
    "Sound like a direct, professional human coach; avoid unsupported generic motivation.",
    "Do not provide buy or sell recommendations or promise results.",
    "Return only valid JSON with every requested property.",
  ].join("\n");
}

export const DASHBOARD_COACH_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "dashboard_coach_plan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        whatISee: { type: "string" },
        whatIsDrifting: { type: "string" },
        whatToProtect: { type: "string" },
        whatChangesNextSession: { type: "string" },
        nextAction: { type: "string" },
        ruleToAdd: { type: "string" },
        ruleToRemove: { type: "string" },
        checkpointFocus: { type: "string" },
        referencedDates: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "summary",
        "whatISee",
        "whatIsDrifting",
        "whatToProtect",
        "whatChangesNextSession",
        "nextAction",
        "ruleToAdd",
        "ruleToRemove",
        "checkpointFocus",
        "referencedDates",
      ],
    },
  },
};

function requiredText(value: unknown, fallback: string, max = 600) {
  return String(value ?? "").trim().slice(0, max) || fallback;
}

function formatSignedUsd(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function normalizeDashboardCoachPlan(params: {
  raw: any;
  source: DashboardCoachSource;
  sourceSignature: string;
  language: "en" | "es";
  generatedAt?: string;
}): DashboardCoachPlan {
  const { raw, source, sourceSignature, language } = params;
  const latest = source.sessions[0] ?? null;
  const noEvidence =
    language === "es"
      ? "Todavía no hay una jornada registrada para evaluar."
      : "There is no recorded session to evaluate yet.";
  const latestFact = latest
    ? language === "es"
      ? `Última jornada analizada: ${latest.date}, P&L ${formatSignedUsd(latest.pnl)}, plan ${latest.respectedPlan === true ? "respetado" : latest.respectedPlan === false ? "no respetado" : "sin confirmar"}.`
      : `Latest session analyzed: ${latest.date}, P&L ${formatSignedUsd(latest.pnl)}, plan ${latest.respectedPlan === true ? "followed" : latest.respectedPlan === false ? "not followed" : "not confirmed"}.`
    : noEvidence;
  const rawWhatISee = requiredText(raw?.whatISee, "", 700);
  const whatISee = latest && !rawWhatISee.includes(latest.date)
    ? `${latestFact} ${rawWhatISee}`.trim()
    : rawWhatISee || latestFact;
  const fallback = language === "es" ? "Data insuficiente para concluir." : "Insufficient data to conclude.";

  const modelDates = (Array.isArray(raw?.referencedDates) ? raw.referencedDates : [])
    .map((value: unknown) => dateKey(value))
    .filter((date: string | null): date is string => Boolean(date));
  const referencedDates = Array.from(
    new Set<string>(latest?.date ? [...modelDates, latest.date] : modelDates)
  );

  return {
    summary: requiredText(raw?.summary, latestFact, 700),
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    sourceDate: latest?.date ?? null,
    sourceSignature,
    referencedDates,
    actionPlan: {
      summary: requiredText(raw?.summary, latestFact, 700),
      whatISee,
      whatIsDrifting: requiredText(raw?.whatIsDrifting, fallback, 600),
      whatToProtect: requiredText(raw?.whatToProtect, fallback, 600),
      whatChangesNextSession: requiredText(raw?.whatChangesNextSession, fallback, 600),
      nextAction: requiredText(raw?.nextAction, fallback, 400),
      ruleToAdd: requiredText(raw?.ruleToAdd, fallback, 300),
      ruleToRemove: requiredText(raw?.ruleToRemove, fallback, 300),
      checkpointFocus: requiredText(raw?.checkpointFocus, fallback, 300),
    },
  };
}

export type DailyGoalStatus = "not_configured" | "paused" | "no_activity" | "in_progress" | "met";

export function resolveDailyGoalStatus(params: {
  hasPlan: boolean;
  isTradingDay: boolean;
  expectedUsd: number;
  actualUsd: number;
  hasSession: boolean;
}): DailyGoalStatus {
  if (!params.hasPlan) return "not_configured";
  if (!params.isTradingDay) return "paused";
  if (params.expectedUsd <= 0) return "not_configured";
  if (!params.hasSession) return "no_activity";
  if (params.actualUsd >= params.expectedUsd) return "met";
  return "in_progress";
}
