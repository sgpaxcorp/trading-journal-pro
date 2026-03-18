export type NeuroOption = {
  id: string;
  en: string;
  es: string;
};

export type NeuroPlanFollowed = "yes" | "partial" | "no" | null;
export type NeuroTakeAgain = "yes" | "with_changes" | "no" | null;

export type NeuroLayer = {
  premarket: {
    thesis: string[];
    confirmation: string[];
    invalidation: string[];
  };
  inside: {
    changed: string[];
    state: string[];
    plan_followed: NeuroPlanFollowed;
  };
  after: {
    exit_reason: string[];
    take_again: NeuroTakeAgain;
    truth: string[];
    one_line_truth: string;
    custom_tags: string[];
  };
};

export type NeuroSummaryLevel = "strong" | "stable" | "drift" | "critical" | "insufficient";

export type NeuroSummary = {
  score: number | null;
  level: NeuroSummaryLevel;
  insight_key: string;
  flags: string[];
  strengths: string[];
  risks: string[];
  signals: number;
};

export type NeuroMemory = {
  title: string;
  body: string;
  kind: "strength" | "risk" | "neutral";
};

export type NeuroMemorySession = {
  date: string;
  pnl?: number | null;
  neuro?: NeuroLayer | null;
};

export const NEURO_PREMARKET_THESIS_OPTIONS: NeuroOption[] = [
  { id: "trend_continuation", en: "Trend continuation", es: "Continuación de tendencia" },
  { id: "breakout", en: "Breakout", es: "Rompimiento" },
  { id: "reversal", en: "Reversal", es: "Reversión" },
  { id: "liquidity_sweep", en: "Liquidity sweep", es: "Barrida de liquidez" },
  { id: "range_fade", en: "Range fade", es: "Fade del rango" },
  { id: "opening_range_breakout", en: "Opening range breakout", es: "Rompimiento del opening range" },
  { id: "news_reaction", en: "News reaction", es: "Reacción a noticias" },
];

export const NEURO_PREMARKET_CONFIRMATION_OPTIONS: NeuroOption[] = [
  { id: "level_holds", en: "Level holds", es: "Nivel se sostiene" },
  { id: "reclaim", en: "Reclaim", es: "Reclamo del nivel" },
  { id: "volume", en: "Volume expansion", es: "Expansión de volumen" },
  { id: "vwap_reclaim", en: "VWAP reclaim", es: "Reclaim del VWAP" },
  { id: "higher_low", en: "Higher low", es: "Higher low" },
  { id: "lower_high", en: "Lower high", es: "Lower high" },
  { id: "flow_confirmation", en: "Flow confirmation", es: "Confirmación de flow" },
  { id: "market_alignment", en: "Market alignment", es: "Alineación del mercado" },
];

export const NEURO_PREMARKET_INVALIDATION_OPTIONS: NeuroOption[] = [
  { id: "lose_level", en: "Lose the level", es: "Pierde el nivel" },
  { id: "fail_reclaim", en: "Fail reclaim", es: "Falla el reclaim" },
  { id: "no_follow_through", en: "No follow-through", es: "No hay seguimiento" },
  { id: "tape_weakens", en: "Tape weakens", es: "La cinta se debilita" },
  { id: "flow_disappears", en: "Flow disappears", es: "El flow desaparece" },
  { id: "against_market_trend", en: "Against market trend", es: "Contra la tendencia del mercado" },
];

export const NEURO_INSIDE_CHANGED_OPTIONS: NeuroOption[] = [
  { id: "nothing_changed", en: "Nothing changed", es: "Nada cambió" },
  { id: "market_strengthened", en: "Market strengthened", es: "El mercado se fortaleció" },
  { id: "market_weakened", en: "Market weakened", es: "El mercado se debilitó" },
  { id: "flow_improved", en: "Flow improved", es: "El flow mejoró" },
  { id: "flow_faded", en: "Flow faded", es: "El flow se apagó" },
  { id: "volatility_expanded", en: "Volatility expanded", es: "La volatilidad se expandió" },
  { id: "entered_early", en: "I entered early", es: "Entré temprano" },
  { id: "hesitated", en: "I hesitated", es: "Dudé" },
  { id: "chased", en: "I chased", es: "Perseguí el movimiento" },
];

export const NEURO_INSIDE_STATE_OPTIONS: NeuroOption[] = [
  { id: "calm", en: "Calm", es: "Calma" },
  { id: "patient", en: "Patient", es: "Paciente" },
  { id: "clear", en: "Clear", es: "Claro" },
  { id: "confident", en: "Confident", es: "Confiado" },
  { id: "hesitant", en: "Hesitant", es: "Dudoso" },
  { id: "fearful", en: "Fearful", es: "Temeroso" },
  { id: "urgent", en: "Urgent", es: "Urgente" },
  { id: "frustrated", en: "Frustrated", es: "Frustrado" },
  { id: "revenge_mode", en: "Revenge mode", es: "Modo revancha" },
];

export const NEURO_PLAN_FOLLOWED_OPTIONS: NeuroOption[] = [
  { id: "yes", en: "Yes", es: "Sí" },
  { id: "partial", en: "Partially", es: "Parcialmente" },
  { id: "no", en: "No", es: "No" },
];

export const NEURO_AFTER_EXIT_REASON_OPTIONS: NeuroOption[] = [
  { id: "target_hit", en: "Target hit", es: "Objetivo alcanzado" },
  { id: "stop_hit", en: "Stop hit", es: "Stop ejecutado" },
  { id: "structure_broke", en: "Structure broke", es: "La estructura se rompió" },
  { id: "momentum_faded", en: "Momentum faded", es: "El momentum se apagó" },
  { id: "took_profits_early", en: "Took profits early", es: "Aseguré ganancias temprano" },
  { id: "emotional_exit", en: "Emotional exit", es: "Salida emocional" },
  { id: "risk_reduction", en: "Risk reduction", es: "Reducción de riesgo" },
  { id: "manual_close", en: "Manual close", es: "Cierre manual" },
];

export const NEURO_AFTER_TAKE_AGAIN_OPTIONS: NeuroOption[] = [
  { id: "yes", en: "Yes", es: "Sí" },
  { id: "with_changes", en: "Only with changes", es: "Solo con cambios" },
  { id: "no", en: "No", es: "No" },
];

export const NEURO_AFTER_TRUTH_OPTIONS: NeuroOption[] = [
  { id: "clean_execution", en: "Clean execution", es: "Ejecución limpia" },
  { id: "valid_idea_bad_timing", en: "Valid idea, bad timing", es: "Idea válida, mal timing" },
  { id: "good_entry_bad_exit", en: "Good entry, bad exit", es: "Buena entrada, mala salida" },
  { id: "forced_trade", en: "Forced trade", es: "Trade forzado" },
  { id: "no_clear_edge", en: "No clear edge", es: "Sin edge claro" },
  { id: "broke_plan", en: "Broke plan", es: "Rompí el plan" },
  { id: "managed_well", en: "Managed well", es: "Gestionado bien" },
  { id: "emotion_affected_result", en: "Emotion affected result", es: "La emoción afectó el resultado" },
];

const ALL_MULTI_OPTIONS = [
  ...NEURO_PREMARKET_THESIS_OPTIONS,
  ...NEURO_PREMARKET_CONFIRMATION_OPTIONS,
  ...NEURO_PREMARKET_INVALIDATION_OPTIONS,
  ...NEURO_INSIDE_CHANGED_OPTIONS,
  ...NEURO_INSIDE_STATE_OPTIONS,
  ...NEURO_AFTER_EXIT_REASON_OPTIONS,
  ...NEURO_AFTER_TRUTH_OPTIONS,
];

export const DEFAULT_NEURO_LAYER: NeuroLayer = {
  premarket: {
    thesis: [],
    confirmation: [],
    invalidation: [],
  },
  inside: {
    changed: [],
    state: [],
    plan_followed: null,
  },
  after: {
    exit_reason: [],
    take_again: null,
    truth: [],
    one_line_truth: "",
    custom_tags: [],
  },
};

const allowedMulti = new Set(ALL_MULTI_OPTIONS.map((option) => option.id));
const allowedPlanFollowed = new Set(NEURO_PLAN_FOLLOWED_OPTIONS.map((option) => option.id));
const allowedTakeAgain = new Set(NEURO_AFTER_TAKE_AGAIN_OPTIONS.map((option) => option.id));

const sanitizeStringArray = (value: any, allowed?: Set<string>) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
            .filter((item) => (allowed ? allowed.has(item) || item.startsWith("custom:") : true))
        )
      )
    : [];

export function normalizeNeuroLayer(raw?: any): NeuroLayer {
  return {
    premarket: {
      thesis: sanitizeStringArray(raw?.premarket?.thesis, allowedMulti),
      confirmation: sanitizeStringArray(raw?.premarket?.confirmation, allowedMulti),
      invalidation: sanitizeStringArray(raw?.premarket?.invalidation, allowedMulti),
    },
    inside: {
      changed: sanitizeStringArray(raw?.inside?.changed, allowedMulti),
      state: sanitizeStringArray(raw?.inside?.state, allowedMulti),
      plan_followed: allowedPlanFollowed.has(String(raw?.inside?.plan_followed ?? ""))
        ? (String(raw?.inside?.plan_followed) as NeuroPlanFollowed)
        : null,
    },
    after: {
      exit_reason: sanitizeStringArray(raw?.after?.exit_reason, allowedMulti),
      take_again: allowedTakeAgain.has(String(raw?.after?.take_again ?? ""))
        ? (String(raw?.after?.take_again) as NeuroTakeAgain)
        : null,
      truth: sanitizeStringArray(raw?.after?.truth, allowedMulti),
      one_line_truth: typeof raw?.after?.one_line_truth === "string" ? raw.after.one_line_truth.trim() : "",
      custom_tags: sanitizeStringArray(raw?.after?.custom_tags).slice(0, 12),
    },
  };
}

export function getNeuroOptionLabel(optionId: string, options: NeuroOption[], lang: "en" | "es") {
  const match = options.find((option) => option.id === optionId);
  if (!match) return optionId.replaceAll("_", " ");
  return lang === "es" ? match.es : match.en;
}

export function listNeuroOptionLabels(optionIds: string[], options: NeuroOption[], lang: "en" | "es") {
  return optionIds.map((optionId) => getNeuroOptionLabel(optionId, options, lang));
}

export function getNeuroLevelLabel(level: NeuroSummaryLevel, lang: "en" | "es") {
  const labels: Record<NeuroSummaryLevel, { en: string; es: string }> = {
    strong: { en: "Strong", es: "Fuerte" },
    stable: { en: "Stable", es: "Estable" },
    drift: { en: "Drift detected", es: "Drift detectado" },
    critical: { en: "Critical", es: "Crítico" },
    insufficient: { en: "Not enough input", es: "Faltan datos" },
  };
  return labels[level][lang];
}

export function getNeuroInsightText(insightKey: string, lang: "en" | "es") {
  const labels: Record<string, { en: string; es: string }> = {
    add_more_input: {
      en: "Add one or two Neuro checks so the journal can evaluate alignment, drift, and truth.",
      es: "Añade uno o dos checks de Neuro para que el journal pueda evaluar alineación, drift y verdad.",
    },
    execution_drift: {
      en: "You planned confirmation, but your in-trade choices show early execution drift.",
      es: "Planificaste confirmación, pero tus decisiones en vivo muestran drift de ejecución temprana.",
    },
    plan_broken: {
      en: "Your own selections show a break between plan and execution. Protect the process before the next trade.",
      es: "Tus selecciones muestran una ruptura entre plan y ejecución. Protege el proceso antes del próximo trade.",
    },
    emotional_exit: {
      en: "The exit reads as emotional rather than structural. That usually distorts the review of the setup itself.",
      es: "La salida se lee más emocional que estructural. Eso suele distorsionar la evaluación del setup.",
    },
    forced_trade: {
      en: "You recognized the trade as forced. That honesty matters more than the P&L of a single session.",
      es: "Reconociste el trade como forzado. Esa honestidad importa más que el P&L de una sola sesión.",
    },
    clear_process: {
      en: "Your inputs show clear structure, defined invalidation, and better process integrity than usual.",
      es: "Tus inputs muestran estructura clara, invalidación definida y mejor integridad de proceso de lo usual.",
    },
    calm_execution: {
      en: "Calm and patient states are aligned with cleaner execution here. Protect that pace.",
      es: "Los estados de calma y paciencia están alineados con una ejecución más limpia aquí. Protege ese ritmo.",
    },
    mixed_signal: {
      en: "The session shows mixed signals. The next step is to tighten invalidation and reduce reactive decisions.",
      es: "La sesión muestra señales mixtas. El próximo paso es apretar la invalidación y reducir decisiones reactivas.",
    },
  };
  return (labels[insightKey] || labels.mixed_signal)[lang];
}

export function computeNeuroSummary(rawNeuro?: NeuroLayer): NeuroSummary {
  const neuro = normalizeNeuroLayer(rawNeuro);
  let score = 100;
  const flags = new Set<string>();
  const strengths = new Set<string>();
  const risks = new Set<string>();

  const signalCount =
    neuro.premarket.thesis.length +
    neuro.premarket.confirmation.length +
    neuro.premarket.invalidation.length +
    neuro.inside.changed.length +
    neuro.inside.state.length +
    neuro.after.exit_reason.length +
    neuro.after.truth.length +
    (neuro.inside.plan_followed ? 1 : 0) +
    (neuro.after.take_again ? 1 : 0) +
    (neuro.after.one_line_truth ? 1 : 0) +
    neuro.after.custom_tags.length;

  if (signalCount < 3) {
    return {
      score: null,
      level: "insufficient",
      insight_key: "add_more_input",
      flags: [],
      strengths: [],
      risks: [],
      signals: signalCount,
    };
  }

  if (neuro.premarket.invalidation.length) {
    score += 5;
    strengths.add("clear_invalidation");
  }

  if (neuro.inside.changed.includes("nothing_changed") && neuro.inside.plan_followed === "yes") {
    score += 5;
    strengths.add("stayed_with_plan");
  }

  if (neuro.inside.state.some((item) => item === "calm" || item === "patient" || item === "clear")) {
    score += 6;
    strengths.add("calm_state");
  }

  if (neuro.after.truth.some((item) => item === "clean_execution" || item === "managed_well")) {
    score += 5;
    strengths.add("clean_review");
  }

  if (neuro.premarket.confirmation.length && neuro.inside.changed.includes("entered_early")) {
    score -= 15;
    flags.add("execution_drift");
    risks.add("entered_early");
  }

  if (neuro.inside.plan_followed === "no") {
    score -= 20;
    flags.add("plan_broken");
    risks.add("plan_not_followed");
  } else if (neuro.inside.plan_followed === "partial") {
    score -= 10;
    flags.add("plan_broken");
    risks.add("plan_partial");
  }

  if (neuro.after.exit_reason.includes("emotional_exit")) {
    score -= 10;
    flags.add("emotional_exit");
    risks.add("emotional_exit");
  }

  if (neuro.after.truth.includes("forced_trade")) {
    score -= 15;
    flags.add("forced_trade");
    risks.add("forced_trade");
  }

  if (neuro.after.truth.includes("broke_plan")) {
    score -= 20;
    flags.add("plan_broken");
    risks.add("broke_plan");
  }

  if (neuro.after.truth.includes("emotion_affected_result")) {
    score -= 8;
    risks.add("emotion_affected");
  }

  if (neuro.after.truth.includes("no_clear_edge")) {
    score -= 10;
    risks.add("no_clear_edge");
  }

  if (neuro.inside.state.some((item) => item === "urgent" || item === "frustrated" || item === "revenge_mode")) {
    score -= 12;
    risks.add("reactive_state");
  }

  if (neuro.inside.state.some((item) => item === "fearful" || item === "hesitant")) {
    score -= 6;
    risks.add("fear_hesitation");
  }

  if (
    neuro.after.take_again === "yes" &&
    (neuro.after.truth.some((item) => item === "forced_trade" || item === "broke_plan" || item === "no_clear_edge") ||
      neuro.after.exit_reason.includes("emotional_exit"))
  ) {
    score -= 10;
    risks.add("truth_mismatch");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const level: NeuroSummaryLevel =
    score >= 85 ? "strong" : score >= 70 ? "stable" : score >= 50 ? "drift" : "critical";

  const insightKey =
    flags.has("execution_drift")
      ? "execution_drift"
      : flags.has("plan_broken")
        ? "plan_broken"
        : flags.has("emotional_exit")
          ? "emotional_exit"
          : flags.has("forced_trade")
            ? "forced_trade"
            : strengths.has("clear_invalidation") && strengths.has("clean_review")
              ? "clear_process"
              : strengths.has("calm_state")
                ? "calm_execution"
                : "mixed_signal";

  return {
    score,
    level,
    insight_key: insightKey,
    flags: Array.from(flags),
    strengths: Array.from(strengths),
    risks: Array.from(risks),
    signals: signalCount,
  };
}

export function buildNeuroMemory(
  sessions: NeuroMemorySession[],
  lang: "en" | "es"
): NeuroMemory | null {
  const normalized = (Array.isArray(sessions) ? sessions : [])
    .map((session) => ({
      date: String(session?.date || "").slice(0, 10),
      pnl: Number.isFinite(Number(session?.pnl)) ? Number(session?.pnl) : null,
      neuro: normalizeNeuroLayer(session?.neuro || {}),
    }))
    .filter((session) => session.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8);

  if (!normalized.length) return null;

  const count = (predicate: (session: (typeof normalized)[number]) => boolean) =>
    normalized.reduce((acc, session) => acc + (predicate(session) ? 1 : 0), 0);

  const earlyUrgent = count(
    (session) =>
      session.neuro.inside.changed.includes("entered_early") ||
      session.neuro.inside.state.some((item) => item === "urgent" || item === "revenge_mode")
  );
  const forcedTrades = count(
    (session) =>
      session.neuro.after.truth.includes("forced_trade") ||
      session.neuro.after.truth.includes("broke_plan")
  );
  const calmAligned = count(
    (session) =>
      session.neuro.inside.plan_followed === "yes" &&
      session.neuro.inside.state.some((item) => item === "calm" || item === "patient" || item === "clear") &&
      (session.pnl == null || session.pnl >= 0)
  );
  const clearInvalidation = count(
    (session) => session.neuro.premarket.invalidation.length > 0 && session.neuro.inside.plan_followed === "yes"
  );

  const t = (en: string, es: string) => (lang === "es" ? es : en);

  if (forcedTrades >= 2) {
    return {
      title: t("Pattern to interrupt", "Patrón a interrumpir"),
      body: t(
        `Forced-trade or broke-plan truth tags showed up in ${forcedTrades} of your last ${normalized.length} Neuro-tagged sessions. Interrupt the first impulsive decision.`,
        `Los tags de trade forzado o romper el plan aparecieron en ${forcedTrades} de tus últimas ${normalized.length} sesiones con Neuro. Interrumpe la primera decisión impulsiva.`
      ),
      kind: "risk",
    };
  }

  if (earlyUrgent >= 2) {
    return {
      title: t("Recurring drift", "Drift recurrente"),
      body: t(
        `Urgency or early entry appeared in ${earlyUrgent} of your last ${normalized.length} Neuro-tagged sessions. Protect the first setup and wait for confirmation.`,
        `La urgencia o la entrada temprana aparecieron en ${earlyUrgent} de tus últimas ${normalized.length} sesiones con Neuro. Protege el primer setup y espera la confirmación.`
      ),
      kind: "risk",
    };
  }

  if (calmAligned >= 2) {
    return {
      title: t("Stable edge", "Edge estable"),
      body: t(
        `Calm, patient states aligned with plan-following in ${calmAligned} of your last ${normalized.length} Neuro-tagged sessions. Protect that pace before increasing aggression.`,
        `Los estados de calma y paciencia se alinearon con seguir el plan en ${calmAligned} de tus últimas ${normalized.length} sesiones con Neuro. Protege ese ritmo antes de aumentar agresividad.`
      ),
      kind: "strength",
    };
  }

  if (clearInvalidation >= 2) {
    return {
      title: t("Protect this process", "Protege este proceso"),
      body: t(
        `Clear invalidation was present in ${clearInvalidation} of your last ${normalized.length} Neuro-tagged sessions. Keep naming what breaks the trade before you enter.`,
        `La invalidación clara estuvo presente en ${clearInvalidation} de tus últimas ${normalized.length} sesiones con Neuro. Sigue nombrando qué rompe el trade antes de entrar.`
      ),
      kind: "strength",
    };
  }

  const latest = normalized[0];
  const latestSummary = computeNeuroSummary(latest.neuro);
  if (latestSummary.score != null) {
    return {
      title: t("Latest Neuro read", "Última lectura Neuro"),
      body: getNeuroInsightText(latestSummary.insight_key, lang),
      kind: latestSummary.level === "strong" || latestSummary.level === "stable" ? "strength" : "neutral",
    };
  }

  return null;
}
