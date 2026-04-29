// app/api/ai-coach/route.ts
//
// Goals:
// 1) Make the coach feel 1:1 and conversational (not robotic).
// 2) Keep the output decision-oriented for traders, not report-like.
// 3) Avoid Markdown tables unless the user explicitly asks for stats/breakdowns.
// 4) Use the provided analytics only when it clearly supports the user's question.
// 5) Keep the response compact, actionable, and grounded in the data supplied.

import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getAuthUser } from "@/lib/authServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { auditOrderEvents } from "@/lib/audit/auditEngine";
import type { NormalizedOrderEvent } from "@/lib/brokers/types";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatHistoryItem = {
  role: "user" | "coach" | "assistant";
  text: string;
  createdAt?: string;
};

type AiCoachRequestBody = {
  threadId?: string | null;
  chatHistory?: ChatHistoryItem[];

  question?: string | null;
  language?: "es" | "en" | "auto" | string | null;
  screenshotBase64?: string | null;
  backStudyContext?: string | null;

  snapshot?: any;
  analyticsSummary?: any;
  analyticsSnapshot?: any;
  kpiResults?: any[];
  tradeStatsSummary?: any;
  periodComparisons?: any[];
  recentSessions?: any[];
  relevantSessions?: any[];

  planSnapshot?: any;
  growthPlan?: any;
  cashflowsSummary?: any;
  fullSnapshot?: any;
  gamification?: any;
  userProfile?: any;

  stylePreset?: any;
  coachingFocus?: any;
};

function safeString(x: any): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

type CoachMemoryBundle = {
  global: string;
  weekly: string;
  daily: string;
};

type CoachActionPlan = {
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

type AutoAuditContext = {
  attached: boolean;
  date?: string | null;
  instrument?: string | null;
  summary?: string;
  processScore?: number | null;
  disciplineScore?: number | null;
  eventCount?: number;
};

function toDateKey(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isoWeekKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function resolveScopeKeys(body: AiCoachRequestBody) {
  const fromSnapshot = toDateKey(body?.fullSnapshot?.asOfDate) || toDateKey(body?.snapshot?.asOfDate);
  const fromSessions = toDateKey(body?.recentSessions?.[0]?.date) || toDateKey(body?.relevantSessions?.[0]?.date);
  const fallback = new Date().toISOString().slice(0, 10);
  const dailyKey = fromSnapshot || fromSessions || fallback;
  const weeklyKey = isoWeekKey(dailyKey);
  return { dailyKey, weeklyKey };
}

async function resolveActiveAccountId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("user_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return safeString((data as any)?.active_account_id || "").trim() || null;
}

function normalizeAuditSymbol(raw: any): string {
  return safeString(raw).trim().toUpperCase();
}

function wantsExecutionTruth(body: AiCoachRequestBody): boolean {
  const mode = safeString(body?.coachingFocus?.mode || "").toLowerCase();
  if (mode === "execution-truth") return true;

  const question = safeString(body?.question || "").toLowerCase();
  return /(audit|execution|entry|entries|exit|exits|stop|manage|management|fill|fills|oco|broker|orden|órden|entrada|salida|ejecuci)/i.test(question);
}

function buildExecutionDisciplineFromAudit(audit: any) {
  const checks = [
    {
      label: "Protective stop present",
      status: audit?.stop_present === true ? "pass" : audit?.stop_present === false ? "fail" : "unknown",
    },
    {
      label: "OCO protection used",
      status: audit?.oco_used === true ? "pass" : audit?.oco_used === false ? "fail" : "unknown",
    },
    {
      label:
        audit?.manual_market_exit === true
          ? "Manual market exit detected"
          : "Manual market exit avoided",
      status:
        audit?.manual_market_exit === true
          ? "fail"
          : audit?.manual_market_exit === false
            ? "pass"
            : "unknown",
    },
  ];
  const evaluable = checks.filter((check) => check.status !== "unknown");
  const score =
    evaluable.length > 0
      ? Math.round((evaluable.filter((check) => check.status === "pass").length / evaluable.length) * 100)
      : null;
  return { score, checks };
}

function pickAutoAuditCandidate(body: AiCoachRequestBody): { date: string; instrument: string } | null {
  const candidates = [...safeArray<any>(body?.relevantSessions), ...safeArray<any>(body?.recentSessions)];
  for (const candidate of candidates) {
    const date = safeString(candidate?.date).slice(0, 10);
    const instrument = normalizeAuditSymbol(candidate?.instrument || candidate?.symbol || "");
    if (date && instrument) return { date, instrument };
  }
  return null;
}

async function buildAutomaticAuditContext(userId: string, body: AiCoachRequestBody): Promise<{ block: string; meta: AutoAuditContext }> {
  if (!userId || !wantsExecutionTruth(body)) {
    return { block: "", meta: { attached: false } };
  }

  const candidate = pickAutoAuditCandidate(body);
  if (!candidate) {
    return { block: "", meta: { attached: false } };
  }

  const accountId = await resolveActiveAccountId(userId);
  if (!accountId) {
    return { block: "", meta: { attached: false, date: candidate.date, instrument: candidate.instrument } };
  }

  const { data, error } = await supabaseAdmin
    .from("broker_order_events")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("date", candidate.date)
    .order("ts_utc", { ascending: true });

  if (error || !Array.isArray(data) || !data.length) {
    return {
      block: "",
      meta: { attached: false, date: candidate.date, instrument: candidate.instrument, eventCount: 0 },
    };
  }

  const filtered = data.filter((row: any) => {
    const symbol = normalizeAuditSymbol(row?.symbol);
    const instrumentKey = normalizeAuditSymbol(row?.instrument_key);
    return symbol === candidate.instrument || instrumentKey.startsWith(`${candidate.instrument}|`);
  });

  if (!filtered.length) {
    return {
      block: "",
      meta: { attached: false, date: candidate.date, instrument: candidate.instrument, eventCount: 0 },
    };
  }

  const audit = auditOrderEvents(filtered as NormalizedOrderEvent[]);
  const executionDiscipline = buildExecutionDisciplineFromAudit(audit);

  const [{ data: journalEntry }, { data: checklistRow }, { data: growthPlanRows }] = await Promise.all([
    supabaseAdmin
      .from("journal_entries")
      .select("pnl, respected_plan")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("date", candidate.date)
      .maybeSingle(),
    supabaseAdmin
      .from("daily_checklists")
      .select("items")
      .eq("user_id", userId)
      .eq("date", candidate.date)
      .maybeSingle(),
    supabaseAdmin
      .from("growth_plans")
      .select("rules")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  const checklistItems = safeArray<any>((checklistRow as any)?.items);
  const completedChecklist = checklistItems.filter((item) => Boolean(item?.done)).length;
  const checklistScore = checklistItems.length > 0 ? Math.round((completedChecklist / checklistItems.length) * 100) : null;

  const respectedPlan = typeof (journalEntry as any)?.respected_plan === "boolean" ? (journalEntry as any).respected_plan : null;
  const pnl = Number((journalEntry as any)?.pnl);

  const planRules = safeArray<any>((growthPlanRows ?? [])[0]?.rules).filter((rule) => rule?.isActive !== false);
  const processScoreParts = [checklistScore, respectedPlan === null ? null : respectedPlan ? 100 : 0].filter((value) => typeof value === "number") as number[];
  const processScore = processScoreParts.length
    ? Math.round(processScoreParts.reduce((sum, value) => sum + value, 0) / processScoreParts.length)
    : null;

  const lines: string[] = [];
  lines.push(
    `Automatic audit attached: ${candidate.date} · ${candidate.instrument} · broker events=${filtered.length}`
  );
  lines.push(
    `Audit summary: ${clampText(audit.summary, 220)} · disciplineScore=${executionDiscipline.score ?? "—"}${processScore != null ? ` · processScore=${processScore}` : ""}`
  );
  lines.push(
    `Audit highlights: stopPresent=${audit.stop_present ? "yes" : "no"} · oco=${audit.oco_used ? "yes" : "no"} · manualMarketExit=${audit.manual_market_exit ? "yes" : "no"} · firstStopSec=${audit.time_to_first_stop_sec ?? "—"}`
  );
  if (Number.isFinite(pnl)) {
    lines.push(`Journal session on audit date: pnl=${usd(pnl)} · respectedPlan=${respectedPlan == null ? "—" : respectedPlan ? "yes" : "no"}`);
  }
  if (planRules.length) {
    lines.push(`Active rules on audit date: ${planRules.slice(0, 4).map((rule) => safeString(rule?.label)).filter(Boolean).join(", ")}`);
  }

  return {
    block: lines.join("\n"),
    meta: {
      attached: true,
      date: candidate.date,
      instrument: candidate.instrument,
      summary: clampText(audit.summary, 220),
      processScore,
      disciplineScore: executionDiscipline.score,
      eventCount: filtered.length,
    },
  };
}

async function getCoachMemory(userId: string, keys: { dailyKey: string; weeklyKey: string }): Promise<CoachMemoryBundle> {
  if (!userId) return { global: "", weekly: "", daily: "" };
  try {
    const { data, error } = await supabaseAdmin
      .from("ai_coach_memory")
      .select("scope, scope_key, memory")
      .eq("user_id", userId);
    if (error || !Array.isArray(data)) return { global: "", weekly: "", daily: "" };

    const globalRow = data.find((r: any) => r.scope === "global");
    const weeklyRow = data.find((r: any) => r.scope === "weekly" && r.scope_key === keys.weeklyKey);
    const dailyRow = data.find((r: any) => r.scope === "daily" && r.scope_key === keys.dailyKey);

    return {
      global: safeString(globalRow?.memory).trim(),
      weekly: safeString(weeklyRow?.memory).trim(),
      daily: safeString(dailyRow?.memory).trim(),
    };
  } catch {
    return { global: "", weekly: "", daily: "" };
  }
}

async function upsertCoachMemory(params: {
  userId: string;
  scope: "global" | "weekly" | "daily";
  scopeKey?: string | null;
  memory: string;
  metadata?: Record<string, any>;
}) {
  const { userId, scope, scopeKey, memory, metadata } = params;
  if (!userId || !memory) return;
  try {
    const normalizedScopeKey = scope === "global" ? "global" : scopeKey ?? null;
    const payload = {
      user_id: userId,
      scope,
      scope_key: normalizedScopeKey,
      memory,
      metadata: metadata || {},
      updated_at: new Date().toISOString(),
    };
    await supabaseAdmin.from("ai_coach_memory").upsert(payload, {
      onConflict: "user_id,scope,scope_key",
    });
  } catch {
    // swallow errors to avoid breaking coach responses
  }
}

function clampText(s: any, max = 900): string {
  const t = safeString(s);
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function detectLanguage(question: string, hint?: any): "es" | "en" {
  const h = safeString(hint).toLowerCase().trim();
  if (h === "es" || h === "en") return h as any;

  const s = (question || "").toLowerCase();
  if (!s.trim()) return "en";

  if (/[áéíóúñü¿¡]/.test(s)) return "es";
  if (/(\bque\b|\bcómo\b|\bcomo\b|\bpor qué\b|\bporque\b|\bcuál\b|\bperdida\b|\bpérdida\b|\bganancia\b|\briesgo\b|\bpsicolog\b|\bdiario\b)/i.test(s)) {
    return "es";
  }
  return "en";
}

function userRequestedTables(question: string): boolean {
  const s = (question || "").toLowerCase();
  if (!s.trim()) return false;

  const keywords = [
    "table",
    "tabla",
    "breakdown",
    "desglose",
    "stats",
    "statistics",
    "estad",
    "numbers",
    "númer",
    "numer",
    "porcentaje",
    "percent",
    "percentage",
    "win rate",
    "ratio",
    "distribution",
    "distrib",
    "by day",
    "por día",
    "por dia",
    "day of week",
    "by instrument",
    "por instrumento",
    "analytics",
    "analit",
    "métric",
    "metric",
  ];

  return keywords.some((k) => s.includes(k));
}

function stripMarkdownTables(md: string): string {
  const lines = (md || "").split("\n");
  const out: string[] = [];

  const sepRe = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";

    const maybeHeader = line.includes("|") && sepRe.test(next);

    if (maybeHeader) {
      // Skip header + separator + subsequent table rows
      i += 2;
      while (i < lines.length) {
        const row = lines[i] ?? "";
        if (!row.trim()) {
          // end of table
          break;
        }
        // Most markdown table rows contain pipes; if not, stop.
        if (!row.includes("|")) break;
        i += 1;
      }

      // Also skip any immediate blank lines (avoid double gaps)
      while (i < lines.length && !(lines[i] ?? "").trim()) i += 1;

      // Replace with a single short note (optional). We'll omit to keep the response clean.
      continue;
    }

    out.push(line);
    i += 1;
  }

  // Normalize excessive blank lines
  const normalized = out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

function buildFallbackFollowUp(lang: "es" | "en", question: string): string {
  const q = (question || "").toLowerCase();

  const isRisk = /(risk|riesgo|stop|stops|loss|pérdid|perdid|max daily|max\s*loss)/i.test(q);
  const isPsych = /(psycho|psicolo|emocion|emotion|fomo|revenge|ansiedad|fear|miedo|greed|codicia|disciplina)/i.test(q);
  const isProcess = /(plan|setup|estrateg|strategy|rules|reglas|checklist|ejecuci|execution|entry|exit|salida)/i.test(q);

  if (lang === "es") {
    if (isRisk) return "¿Qué regla de riesgo fue la más difícil de cumplir hoy: tamaño, stop, o número de trades?";
    if (isPsych) return "¿Qué emoción fue la que más influyó en tus decisiones (FOMO, miedo, frustración) y en qué momento apareció?";
    if (isProcess) return "¿En qué parte del proceso sentiste más fricción: esperar el setup, ejecutar la entrada, o gestionar la salida?";
    return "¿Qué quieres trabajar primero: ejecución, riesgo, o psicología, y por qué?";
  }

  if (isRisk) return "Which risk rule was hardest to follow today: size, stop, or number of trades?";
  if (isPsych) return "Which emotion influenced you the most (FOMO, fear, frustration), and when did it show up?";
  if (isProcess) return "Where did the process break down most: waiting for the setup, executing the entry, or managing the exit?";
  return "What do you want to work on first: execution, risk, or psychology—and why?";
}

function maybeAppendFollowUp(text: string, lang: "es" | "en", question: string): string {
  const t = (text || "").trim();
  if (!t) return buildFallbackFollowUp(lang, question);
  return t;
}

function usd(n: any): string {
  const v = Number(n);
  const x = Number.isFinite(v) ? v : 0;
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function buildTopInstruments(analyticsSummary: any, n = 5): string {
  const byInstrument = analyticsSummary?.byInstrument;
  if (!byInstrument || typeof byInstrument !== "object") return "";

  const rows = Object.entries(byInstrument)
    .map(([k, v]: any) => ({
      k: safeString(k),
      sessions: Number(v?.sessions) || 0,
      netPnl: Number(v?.netPnl) || 0,
      avgPnl: Number(v?.avgPnl) || 0,
    }))
    .filter((r) => r.k && r.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, n);

  if (!rows.length) return "";

  return rows
    .map((r) => `- ${r.k}: ${r.sessions} sessions, net ${usd(r.netPnl)}, avg ${usd(r.avgPnl)}`)
    .join("\n");
}

function buildTopTags(analyticsSummary: any, n = 8): string {
  const tagCounts = analyticsSummary?.tagCounts;
  if (!tagCounts || typeof tagCounts !== "object") return "";

  const rows = Object.entries(tagCounts)
    .map(([k, v]: any) => ({ tag: safeString(k), count: Number(v) || 0 }))
    .filter((r) => r.tag && r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);

  if (!rows.length) return "";

  return rows.map((r) => `- ${r.tag}: ${r.count}`).join("\n");
}

function buildAnalyticsSnapshotBlock(snapshot: any): string {
  if (!snapshot || typeof snapshot !== "object") return "";
  const totals = snapshot?.totals || {};
  const perf = snapshot?.performance || {};
  const risk = snapshot?.risk || {};

  const sessions = Number(totals?.sessions) || 0;
  const winRate = Number(totals?.winRate);
  const netPnl = Number(totals?.netPnl);
  const avgNet = Number(totals?.avgNetPerSession);
  const profitFactor = Number(perf?.profitFactor);
  const expectancy = Number(perf?.expectancy);
  const dd = Number(risk?.maxDrawdown);
  const ddPct = Number(risk?.maxDrawdownPct);

  const bestDay = perf?.bestDay?.date ? `${safeString(perf.bestDay.date).slice(0, 10)} ${usd(perf.bestDay.pnl)}` : "—";
  const worstDay = perf?.worstDay?.date ? `${safeString(perf.worstDay.date).slice(0, 10)} ${usd(perf.worstDay.pnl)}` : "—";

  const lines: string[] = [];
  lines.push(
    `Analytics & Statistics snapshot: sessions=${sessions}, winRate=${Number.isFinite(winRate) ? winRate.toFixed(1) + "%" : "—"}, netPnl=${Number.isFinite(netPnl) ? usd(netPnl) : "—"}, avgNet=${Number.isFinite(avgNet) ? usd(avgNet) : "—"}, profitFactor=${Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "—"}, expectancy=${Number.isFinite(expectancy) ? usd(expectancy) : "—"}, maxDD=${Number.isFinite(dd) ? usd(dd) : "—"} (${Number.isFinite(ddPct) ? ddPct.toFixed(1) + "%" : "—"})`
  );
  lines.push(`Best day: ${bestDay} · Worst day: ${worstDay}`);

  const streaks = snapshot?.risk;
  if (streaks) {
    const winStreak = Number(streaks?.longestWinStreak);
    const lossStreak = Number(streaks?.longestLossStreak);
    if (Number.isFinite(winStreak) || Number.isFinite(lossStreak)) {
      lines.push(`Streaks: win=${Number.isFinite(winStreak) ? winStreak : "—"}, loss=${Number.isFinite(lossStreak) ? lossStreak : "—"}`);
    }
  }

  const byInstrument = Array.isArray(snapshot?.instruments?.byInstrument) ? snapshot.instruments.byInstrument : [];
  if (byInstrument.length) {
    const top = byInstrument.slice(0, 5).map((r: any) => {
      const inst = safeString(r?.instrument || "");
      const sess = Number(r?.sessions) || 0;
      const pnl = Number(r?.netPnl);
      return `- ${inst || "(none)"}: ${sess} sessions, net ${Number.isFinite(pnl) ? usd(pnl) : "—"}`;
    });
    lines.push("Top instruments (by sessions):\n" + top.join("\n"));
  }

  const byDow = Array.isArray(snapshot?.time?.byDayOfWeek) ? snapshot.time.byDayOfWeek : [];
  if (byDow.length) {
    const top = [...byDow]
      .sort((a: any, b: any) => Number(b?.pnl ?? 0) - Number(a?.pnl ?? 0))
      .slice(0, 3)
      .map((r: any) => {
        const dow = safeString(r?.dow || "");
        const pnl = Number(r?.pnl);
        const wr = Number(r?.winRate);
        return `- ${dow}: ${Number.isFinite(pnl) ? usd(pnl) : "—"}, winRate=${Number.isFinite(wr) ? wr.toFixed(1) + "%" : "—"}`;
      });
    lines.push("Best days (by PnL):\n" + top.join("\n"));
  }

  const byHour = Array.isArray(snapshot?.time?.byHour) ? snapshot.time.byHour : [];
  if (byHour.length) {
    const top = [...byHour]
      .sort((a: any, b: any) => Number(b?.pnl ?? 0) - Number(a?.pnl ?? 0))
      .slice(0, 3)
      .map((r: any) => {
        const hour = safeString(r?.hour || "");
        const pnl = Number(r?.pnl);
        const wr = Number(r?.winRate);
        return `- ${hour}: ${Number.isFinite(pnl) ? usd(pnl) : "—"}, winRate=${Number.isFinite(wr) ? wr.toFixed(1) + "%" : "—"}`;
      });
    lines.push("Best hours (by PnL):\n" + top.join("\n"));
  }

  const quality = snapshot?.dataQuality || {};
  if (quality) {
    const flags = [
      typeof quality?.hasCashflows === "boolean" ? `cashflows=${quality.hasCashflows ? "yes" : "no"}` : "",
      typeof quality?.hasEntryTimestamps === "boolean" ? `entryTimestamps=${quality.hasEntryTimestamps ? "yes" : "no"}` : "",
    ].filter(Boolean);
    if (flags.length) {
      lines.push(`Data quality: ${flags.join(" · ")}`);
    }
  }

  return lines.join("\n");
}

function formatKpiValue(kpi: any): string {
  const v = Number(kpi?.value);
  if (!Number.isFinite(v)) return "—";
  const type = safeString(kpi?.dataType || "");
  if (type === "percent") return `${v.toFixed(2)}%`;
  if (type === "currency") return usd(v);
  if (type === "duration") return `${v.toFixed(2)} min`;
  if (type === "int") return `${Math.round(v)}`;
  return v.toFixed(4);
}

function formatKpiValueSimple(value: number, dataType?: string, unit?: string): string {
  if (!Number.isFinite(value)) return "—";
  if (dataType === "percent") return `${value.toFixed(2)}%`;
  if (dataType === "currency") return usd(value);
  if (dataType === "duration") return `${value.toFixed(1)} min`;
  if (dataType === "int") return `${Math.round(value)}`;
  const unitText = unit ? ` ${unit}` : "";
  return `${value.toFixed(4)}${unitText}`;
}

function kpiCoachExplanation(id: string, lang: "es" | "en"): string {
  const map: Record<string, { en: string; es: string }> = {
    net_pnl: {
      en: "Total net profit/loss across trades.",
      es: "Ganancia/pérdida neta total en los trades.",
    },
    win_rate: {
      en: "Percent of trades that were winners.",
      es: "Porcentaje de trades ganadores.",
    },
    avg_win: {
      en: "Average size of your winners.",
      es: "Tamaño promedio de tus ganadores.",
    },
    avg_loss: {
      en: "Average size of your losers.",
      es: "Tamaño promedio de tus perdedores.",
    },
    profit_factor: {
      en: "How much you make per $1 lost.",
      es: "Cuánto ganas por cada $1 perdido.",
    },
    expectancy: {
      en: "Average expected P&L per trade.",
      es: "Ganancia esperada promedio por trade.",
    },
    payoff_ratio: {
      en: "Winner size vs loser size.",
      es: "Tamaño del ganador vs el perdedor.",
    },
    profit_per_trade: {
      en: "Average P&L per trade.",
      es: "P&L promedio por trade.",
    },
    avg_trade_duration_minutes: {
      en: "Average time spent in a trade.",
      es: "Tiempo promedio en un trade.",
    },
    max_drawdown_percent: {
      en: "Largest equity drawdown as a percent.",
      es: "Mayor drawdown del equity en porcentaje.",
    },
    sharpe_ratio: {
      en: "Risk-adjusted return (higher is better).",
      es: "Retorno ajustado por riesgo (más alto es mejor).",
    },
    sortino_ratio: {
      en: "Downside-risk adjusted return.",
      es: "Retorno ajustado por riesgo a la baja.",
    },
  };

  return map[id]?.[lang] ?? "";
}

function buildKpiResultsBlock(kpis: any[], lang: "es" | "en"): string {
  if (!Array.isArray(kpis) || !kpis.length) return "";
  const rows = kpis
    .filter((k) => k && k.value != null)
    .slice(0, 20)
    .map((k) => {
      const id = safeString(k?.id || "");
      const name = safeString(k?.name || "");
      const def = kpiCoachExplanation(id, lang) || safeString(k?.definition || "");
      const notes = safeString(k?.notes || "");
      const value = formatKpiValue(k);
      const unit = safeString(k?.unit || "");
      return `- ${id} (${name}): ${value}${unit && k?.dataType !== "percent" && k?.dataType !== "currency" ? ` ${unit}` : ""} · def: ${def}${notes ? ` · notes: ${notes}` : ""}`;
    });

  if (!rows.length) return "";
  return `KPI results (value + definition + notes):\n${rows.join("\n")}`;
}

function buildTradeStatsSummaryBlock(summary: any): string {
  if (!summary || typeof summary !== "object") return "";
  const tradeCount = Number(summary?.tradeCount);
  if (!Number.isFinite(tradeCount) || tradeCount <= 0) return "";

  const tradeDays = Number(summary?.tradeDays);
  const avgPnl = Number(summary?.avgPnlPerTrade);
  const pnlPerHour = Number(summary?.pnlPerHour);
  const hold = summary?.hold || {};

  const avgHold = Number(hold?.avgHoldMins);
  const avgWinHold = Number(hold?.avgHoldWinMins);
  const avgLossHold = Number(hold?.avgHoldLossMins);
  const medianHold = Number(hold?.medianHoldMins);

  const tradesWithTime = Number(summary?.tradesWithTime);
  const tradesWithoutTime = Number(summary?.tradesWithoutTime);

  const lines: string[] = [];
  lines.push(
    `Trade timing summary: trades=${tradeCount}${Number.isFinite(tradeDays) ? ` · days=${tradeDays}` : ""}` +
      `${Number.isFinite(avgPnl) ? ` · avgPnL/trade=${usd(avgPnl)}` : ""}` +
      `${Number.isFinite(pnlPerHour) ? ` · pnl/hour=${usd(pnlPerHour)}` : ""}`
  );
  if (Number.isFinite(tradesWithTime)) {
    const timed = Number.isFinite(tradesWithTime) ? tradesWithTime : 0;
    const noTime = Number.isFinite(tradesWithoutTime) ? tradesWithoutTime : 0;
    const coverage =
      timed > 0
        ? `Timing data coverage: ${timed}/${tradeCount} trades have entry+exit times (KPIs from timed trades only).`
        : "Timing data coverage: 0 trades with entry+exit times (timing KPIs unavailable).";
    lines.push(coverage);
    if (noTime > 0) {
      lines.push(`Missing times: ${noTime} trades without entry/exit time.`);
    }
  }
  if (Number.isFinite(avgHold) || Number.isFinite(medianHold)) {
    lines.push(
      `Hold time (mins): avg=${Number.isFinite(avgHold) ? avgHold.toFixed(1) : "—"} · median=${Number.isFinite(medianHold) ? medianHold.toFixed(1) : "—"}`
    );
  }
  if (Number.isFinite(avgWinHold) || Number.isFinite(avgLossHold)) {
    lines.push(
      `Hold time by outcome (mins): wins=${Number.isFinite(avgWinHold) ? avgWinHold.toFixed(1) : "—"} · losses=${Number.isFinite(avgLossHold) ? avgLossHold.toFixed(1) : "—"}`
    );
  }
  return lines.join("\n");
}

function buildPeriodComparisonsBlock(comparisons: any[], lang: "es" | "en"): string {
  if (!Array.isArray(comparisons) || !comparisons.length) return "";

  const rows = comparisons.map((c: any) => {
    const label = safeString(c?.label || "Period comparison");
    const cur = c?.current || {};
    const prev = c?.previous || {};
    const delta = c?.delta || {};

    const curWin = Number(cur?.winRate);
    const prevWin = Number(prev?.winRate);
    const curNet = Number(cur?.netPnl);
    const prevNet = Number(prev?.netPnl);
    const curAvg = Number(cur?.avgNet);
    const prevAvg = Number(prev?.avgNet);
    const curSess = Number(cur?.sessions);
    const prevSess = Number(prev?.sessions);

    const deltaWin = Number(delta?.winRate);
    const deltaNet = Number(delta?.netPnl);
    const deltaAvg = Number(delta?.avgNet);
    const deltaSess = Number(delta?.sessions);

    const parts = [
      `sessions ${Number.isFinite(curSess) ? curSess : "—"} vs ${Number.isFinite(prevSess) ? prevSess : "—"} (Δ ${Number.isFinite(deltaSess) ? deltaSess : "—"})`,
      `net ${Number.isFinite(curNet) ? usd(curNet) : "—"} vs ${Number.isFinite(prevNet) ? usd(prevNet) : "—"} (Δ ${Number.isFinite(deltaNet) ? usd(deltaNet) : "—"})`,
      `winRate ${Number.isFinite(curWin) ? curWin.toFixed(1) + "%" : "—"} vs ${Number.isFinite(prevWin) ? prevWin.toFixed(1) + "%" : "—"} (Δ ${Number.isFinite(deltaWin) ? deltaWin.toFixed(1) + "pp" : "—"})`,
      `avgNet ${Number.isFinite(curAvg) ? usd(curAvg) : "—"} vs ${Number.isFinite(prevAvg) ? usd(prevAvg) : "—"} (Δ ${Number.isFinite(deltaAvg) ? usd(deltaAvg) : "—"})`,
    ];

    const holdWin = Number(delta?.avgHoldWinMins);
    const holdLoss = Number(delta?.avgHoldLossMins);
    const pnlHr = Number(delta?.pnlPerHour);
    const extra: string[] = [];
    if (Number.isFinite(holdWin)) extra.push(`Δ holdWin ${holdWin.toFixed(1)}m`);
    if (Number.isFinite(holdLoss)) extra.push(`Δ holdLoss ${holdLoss.toFixed(1)}m`);
    if (Number.isFinite(pnlHr)) extra.push(`Δ pnl/hr ${usd(pnlHr)}`);

    const kpiDeltas = Array.isArray(c?.kpiDeltas) ? c.kpiDeltas : [];
    const kpiBits = kpiDeltas.slice(0, 3).map((k: any) => {
      const id = safeString(k?.id || "");
      const name = safeString(k?.name || id || "kpi");
      const cur = Number(k?.current);
      const prev = Number(k?.previous);
      const delta = Number(k?.delta);
      const dataType = safeString(k?.dataType || "");
      const unit = safeString(k?.unit || "");
      return `${name}: ${formatKpiValueSimple(cur, dataType, unit)} vs ${formatKpiValueSimple(prev, dataType, unit)} (Δ ${formatKpiValueSimple(delta, dataType, unit)})`;
    });

    const kpiLine = kpiBits.length ? ` · KPIs: ${kpiBits.join(" · ")}` : "";

    const summaryBits: string[] = [];
    if (Number.isFinite(deltaNet) && deltaNet !== 0) {
      summaryBits.push(`${deltaNet > 0 ? "↑" : "↓"} net P&L ${usd(Math.abs(deltaNet))}`);
    }
    if (Number.isFinite(deltaWin) && deltaWin !== 0) {
      summaryBits.push(`${deltaWin > 0 ? "↑" : "↓"} win rate ${Math.abs(deltaWin).toFixed(1)}pp`);
    }
    if (Number.isFinite(deltaAvg) && deltaAvg !== 0) {
      summaryBits.push(`${deltaAvg > 0 ? "↑" : "↓"} avg net ${usd(Math.abs(deltaAvg))}`);
    }

    const summaryLabel =
      lang === "es"
        ? `Resumen cambios: ${summaryBits.length ? summaryBits.join(" · ") : "sin cambios claros"}`
        : `Change summary: ${summaryBits.length ? summaryBits.join(" · ") : "no clear changes"}`;

    const timedCur = Number(cur?.tradesWithTime);
    const timedPrev = Number(prev?.tradesWithTime);
    const tradeCountCur = Number(cur?.tradeCount);
    const tradeCountPrev = Number(prev?.tradeCount);
    const timingNote =
      Number.isFinite(timedCur) && Number.isFinite(timedPrev)
        ? `Timing coverage: ${timedCur || 0}/${Number.isFinite(tradeCountCur) ? tradeCountCur : "?"} vs ${timedPrev || 0}/${Number.isFinite(tradeCountPrev) ? tradeCountPrev : "?"} (KPIs from timed trades only).`
        : "";

    return `- ${label}: ${parts.join(" · ")}${extra.length ? ` · ${extra.join(" · ")}` : ""}${kpiLine}\n  ${summaryLabel}${
      timingNote ? `\n  ${timingNote}` : ""
    }`;
  });

  if (!rows.length) return "";
  return `Period comparisons:\n${rows.join("\n")}`;
}

function formatTradeShort(raw: any): string {
  const time = safeString(raw?.time || "").trim();
  const symbol = safeString(raw?.symbol || "").trim();
  const kind = safeString(raw?.kind || "").trim();
  const side = safeString(raw?.side || "").trim();
  const priceNum = Number(raw?.price);
  const qtyNum = Number(raw?.quantity);

  const price = Number.isFinite(priceNum) ? priceNum.toFixed(2) : "";
  const qty = Number.isFinite(qtyNum) ? String(qtyNum) : "";

  const parts = [time, symbol, kind, side].filter(Boolean).join(" ");
  const tail = [price, qty ? `x${qty}` : ""].filter(Boolean).join(" ");
  return [parts, tail].filter(Boolean).join(" · ").trim();
}

function buildTradesSummary(trades: any): string {
  if (!trades || typeof trades !== "object") return "";
  const entries = Array.isArray(trades?.entries) ? trades.entries : [];
  const exits = Array.isArray(trades?.exits) ? trades.exits : [];
  if (!entries.length && !exits.length) return "";

  const entryPreview = entries.slice(0, 2).map(formatTradeShort).filter(Boolean);
  const exitPreview = exits.slice(0, 2).map(formatTradeShort).filter(Boolean);

  const entrySuffix = entries.length > entryPreview.length ? ` (+${entries.length - entryPreview.length} more)` : "";
  const exitSuffix = exits.length > exitPreview.length ? ` (+${exits.length - exitPreview.length} more)` : "";

  const entryLine = entryPreview.length
    ? `entries(${entries.length}): ${entryPreview.join(" | ")}${entrySuffix}`
    : "";
  const exitLine = exitPreview.length
    ? `exits(${exits.length}): ${exitPreview.join(" | ")}${exitSuffix}`
    : "";

  return [entryLine, exitLine].filter(Boolean).join(" · ");
}

function buildRecentSessionsSnippet(recentSessions: any[], n = 8): string {
  if (!Array.isArray(recentSessions) || !recentSessions.length) return "";

  const rows = recentSessions
    .slice(0, n)
    .map((s: any) => {
      const date = safeString(s?.date).slice(0, 10);
      const pnl = Number(s?.pnl);
      const instrument = safeString(s?.instrument);
      const tags = Array.isArray(s?.tags) ? s.tags.slice(0, 6).map((t: any) => safeString(t)).filter(Boolean) : [];
      const respected = typeof s?.respectedPlan === "boolean" ? (s.respectedPlan ? "yes" : "no") : "";
      const pnlText = Number.isFinite(pnl) ? usd(pnl) : "—";
      const tagText = tags.length ? `tags: ${tags.join(", ")}` : "";
      const rp = respected ? `plan: ${respected}` : "";

      const base = `- ${date || ""} · pnl ${pnlText}${instrument ? ` · ${instrument}` : ""}${rp ? ` · ${rp}` : ""}${tagText ? ` · ${tagText}` : ""}`.trim();

      const pre = s?.premarket || {};
      const live = s?.live || {};
      const post = s?.post || {};

      const preBits = [
        pre?.bias ? `bias: ${clampText(pre.bias, 80)}` : "",
        pre?.plan ? `plan: ${clampText(pre.plan, 120)}` : "",
        pre?.levels ? `levels: ${clampText(pre.levels, 80)}` : "",
        pre?.notes ? `notes: ${clampText(pre.notes, 120)}` : "",
      ].filter(Boolean);

      const liveBits = [
        live?.emotions ? `emotions: ${clampText(live.emotions, 120)}` : "",
        live?.mistakes ? `mistakes: ${clampText(live.mistakes, 120)}` : "",
        live?.notes ? `notes: ${clampText(live.notes, 160)}` : "",
      ].filter(Boolean);

      const postBits = [
        post?.lessons ? `lessons: ${clampText(post.lessons, 140)}` : "",
        post?.whatWorked ? `worked: ${clampText(post.whatWorked, 120)}` : "",
        post?.whatFailed ? `failed: ${clampText(post.whatFailed, 120)}` : "",
        post?.notes ? `notes: ${clampText(post.notes, 160)}` : "",
      ].filter(Boolean);

      const detailLines: string[] = [];
      if (preBits.length) detailLines.push(`  premarket: ${preBits.join(" | ")}`);
      if (liveBits.length) detailLines.push(`  live: ${liveBits.join(" | ")}`);
      if (postBits.length) detailLines.push(`  post: ${postBits.join(" | ")}`);

      const checklist = s?.checklists || {};
      const checklistBits: string[] = [];
      if (Array.isArray(checklist?.premarket) && checklist.premarket.length)
        checklistBits.push(`pre: ${checklist.premarket.slice(0, 4).join(", ")}`);
      if (Array.isArray(checklist?.inside) && checklist.inside.length)
        checklistBits.push(`in: ${checklist.inside.slice(0, 4).join(", ")}`);
      if (Array.isArray(checklist?.after) && checklist.after.length)
        checklistBits.push(`post: ${checklist.after.slice(0, 4).join(", ")}`);
      if (Array.isArray(checklist?.strategy) && checklist.strategy.length)
        checklistBits.push(`strategy: ${checklist.strategy.slice(0, 4).join(", ")}`);
      if (Array.isArray(checklist?.impulses) && checklist.impulses.length)
        checklistBits.push(`impulses: ${checklist.impulses.slice(0, 4).join(", ")}`);
      if (checklistBits.length) detailLines.push(`  checklist: ${checklistBits.join(" | ")}`);

      const mindset = s?.mindset || {};
      const mindBits: string[] = [];
      if (Number.isFinite(mindset?.emotional_balance))
        mindBits.push(`emotion ${Number(mindset.emotional_balance)}/5`);
      if (Number.isFinite(mindset?.impulse_control))
        mindBits.push(`impulse ${Number(mindset.impulse_control)}/5`);
      if (Number.isFinite(mindset?.setup_quality))
        mindBits.push(`setup ${Number(mindset.setup_quality)}/5`);
      if (Number.isFinite(mindset?.probability))
        mindBits.push(`prob ${Number(mindset.probability)}/5`);
      if (mindBits.length) detailLines.push(`  mindset: ${mindBits.join(" | ")}`);

      const neuro = s?.neuro || {};
      const neuroBits: string[] = [];
      if (Array.isArray(neuro?.premarket?.thesis) && neuro.premarket.thesis.length)
        neuroBits.push(`thesis: ${neuro.premarket.thesis.slice(0, 3).join(", ")}`);
      if (Array.isArray(neuro?.premarket?.confirmation) && neuro.premarket.confirmation.length)
        neuroBits.push(`confirm: ${neuro.premarket.confirmation.slice(0, 3).join(", ")}`);
      if (Array.isArray(neuro?.premarket?.invalidation) && neuro.premarket.invalidation.length)
        neuroBits.push(`invalid: ${neuro.premarket.invalidation.slice(0, 3).join(", ")}`);
      if (Array.isArray(neuro?.inside?.changed) && neuro.inside.changed.length)
        neuroBits.push(`changed: ${neuro.inside.changed.slice(0, 3).join(", ")}`);
      if (Array.isArray(neuro?.inside?.state) && neuro.inside.state.length)
        neuroBits.push(`state: ${neuro.inside.state.slice(0, 3).join(", ")}`);
      if (typeof neuro?.inside?.plan_followed === "string" && neuro.inside.plan_followed)
        neuroBits.push(`plan_followed: ${neuro.inside.plan_followed}`);
      if (Array.isArray(neuro?.after?.exit_reason) && neuro.after.exit_reason.length)
        neuroBits.push(`exit: ${neuro.after.exit_reason.slice(0, 3).join(", ")}`);
      if (Array.isArray(neuro?.after?.truth) && neuro.after.truth.length)
        neuroBits.push(`truth: ${neuro.after.truth.slice(0, 3).join(", ")}`);
      if (typeof neuro?.after?.take_again === "string" && neuro.after.take_again)
        neuroBits.push(`take_again: ${neuro.after.take_again}`);
      if (typeof neuro?.after?.one_line_truth === "string" && neuro.after.one_line_truth)
        neuroBits.push(`one_line_truth: ${clampText(neuro.after.one_line_truth, 120)}`);
      if (Array.isArray(neuro?.after?.custom_tags) && neuro.after.custom_tags.length)
        neuroBits.push(`custom: ${neuro.after.custom_tags.slice(0, 4).join(", ")}`);
      if (neuroBits.length) detailLines.push(`  neuro: ${neuroBits.join(" | ")}`);

      const neuroSummary = neuro?.summary || {};
      const neuroSummaryBits: string[] = [];
      if (Number.isFinite(Number(neuroSummary?.score)))
        neuroSummaryBits.push(`score ${Number(neuroSummary.score)}`);
      if (typeof neuroSummary?.level === "string" && neuroSummary.level)
        neuroSummaryBits.push(`level ${neuroSummary.level}`);
      if (Array.isArray(neuroSummary?.flags) && neuroSummary.flags.length)
        neuroSummaryBits.push(`flags: ${neuroSummary.flags.slice(0, 4).join(", ")}`);
      if (typeof neuroSummary?.insight === "string" && neuroSummary.insight)
        neuroSummaryBits.push(`insight: ${clampText(neuroSummary.insight, 160)}`);
      if (neuroSummaryBits.length) detailLines.push(`  neuro_summary: ${neuroSummaryBits.join(" | ")}`);

      const tradesSummary = buildTradesSummary(s?.trades);
      if (tradesSummary) detailLines.push(`  trades: ${tradesSummary}`);

      return detailLines.length ? `${base}\n${detailLines.join("\n")}` : base;
    })
    .filter(Boolean);

  return rows.join("\n");
}

function safeArray<T = any>(value: any): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeJsonParse(raw: any): any | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function flattenTextValue(value: any, maxItems = 12): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean ? [clean] : [];
  }
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenTextValue(item, maxItems)).slice(0, maxItems);
  }
  if (typeof value === "object") {
    return Object.values(value)
      .flatMap((item) => flattenTextValue(item, maxItems))
      .slice(0, maxItems);
  }
  return [];
}

function pct(n: any): string {
  const value = Number(n);
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "—";
}

function resolveCoachModeLabel(mode: string, lang: "es" | "en"): string {
  const labels: Record<string, { en: string; es: string }> = {
    "plan-rescue": { en: "Plan rescue", es: "Rescate del plan" },
    "weekly-review": { en: "Weekly review", es: "Revisión semanal" },
    "risk-discipline": { en: "Risk discipline", es: "Disciplina de riesgo" },
    "execution-truth": { en: "Execution truth", es: "Verdad de ejecución" },
    "psychology-patterns": { en: "Psychology patterns", es: "Patrones psicológicos" },
  };
  const hit = labels[mode];
  return hit ? (lang === "es" ? hit.es : hit.en) : mode || "General";
}

function resolveCoachDirectiveBlock(body: AiCoachRequestBody, lang: "es" | "en"): string {
  const focus = body?.coachingFocus || {};
  const mode = safeString(focus?.mode || "").trim();
  const rangePreset = safeString(focus?.rangePreset || "").trim() || "all";
  const rangeStartIso = toDateKey(focus?.rangeStartIso);
  const rangeEndIso = toDateKey(focus?.rangeEndIso);
  const label = resolveCoachModeLabel(mode, lang);
  const lines = [
    `Coaching lens: ${label}`,
    `Context range preset: ${rangePreset}${rangeStartIso ? ` (${rangeStartIso}${rangeEndIso ? ` → ${rangeEndIso}` : ""})` : ""}`,
  ];
  return lines.join("\n");
}

function buildLensStructureGuide(mode: string, lang: "es" | "en", strictEvidenceMode: boolean): string {
  const lens = safeString(mode).trim().toLowerCase();
  const introEs = strictEvidenceMode
    ? "Estructura obligatoria. No uses un bloque separado de Conclusión."
    : "Estructura preferida. Evita un bloque separado de Conclusión salvo que sea indispensable.";
  const introEn = strictEvidenceMode
    ? "Required structure. Do not use a separate Conclusion block."
    : "Preferred structure. Avoid a separate Conclusion block unless it is indispensable.";

  if (lang === "es") {
    if (lens === "weekly-review") {
      return [
        introEs,
        "Usa headings cortos y solo en español:",
        "1) Qué mejoró (1-2 líneas).",
        "2) Qué se deterioró (2-4 bullets con hechos).",
        "3) Qué importa la próxima semana (1-3 bullets de lectura del coach).",
        "4) Plan para la próxima sesión (next action, rule to add, rule to remove, checkpoint focus).",
        "5) Pregunta de seguimiento solo si falta información crítica o si mejora materialmente el plan de la próxima sesión.",
      ].join("\n");
    }
    if (lens === "risk-discipline") {
      return [
        introEs,
        "Usa headings cortos y solo en español:",
        "1) Estado de risk rails (1-2 líneas: on track / at risk / violation).",
        "2) Evidencia (2-4 bullets; solo hechos y 1-3 números relevantes).",
        "3) Lectura del coach (1-3 bullets; cuál rail se rompió y por qué).",
        "4) Fix para la próxima sesión (next action, rule to add, rule to remove, checkpoint focus).",
        "5) Pregunta de seguimiento solo si hace falta para afinar el fix.",
      ].join("\n");
    }
    if (lens === "execution-truth") {
      return [
        introEs,
        "Usa headings cortos y solo en español:",
        "1) Verdad de ejecución (1-2 líneas sobre si el comportamiento coincidió o no con el plan).",
        "2) Evidencia (2-4 bullets; hechos cronológicos, entradas/salidas/manejo).",
        "3) Lectura del coach (1-3 bullets; qué patrón operativo domina).",
        "4) Fix para la próxima sesión (next action, rule to add, rule to remove, checkpoint focus).",
        "5) Pregunta de seguimiento solo si falta una pieza crítica del trade.",
      ].join("\n");
    }
    if (lens === "psychology-patterns") {
      return [
        introEs,
        "Usa headings cortos y solo en español:",
        "1) Patrón dominante (1-2 líneas).",
        "2) Evidencia (2-4 bullets; emociones, drift, decisiones).",
        "3) Lectura del coach (1-3 bullets; disparador y costo del patrón).",
        "4) Intervención para la próxima sesión (next action, rule to add, rule to remove, checkpoint focus).",
        "5) Pregunta de seguimiento solo si ayuda a validar el disparador principal.",
      ].join("\n");
    }
    return [
      introEs,
      "Usa headings cortos y solo en español:",
      "1) Estado vs plan (1-2 líneas: on track / at risk / off pace frente al checkpoint).",
      "2) Evidencia (2-4 bullets; solo hechos y 1-3 números relevantes).",
      "3) Lectura del coach (1-3 bullets; patrón principal y por qué reduce la probabilidad de cumplir el plan).",
      "4) Plan para la próxima sesión (next action, rule to add, rule to remove, checkpoint focus).",
      "5) Pregunta de seguimiento solo si falta info crítica o si una sola pregunta mejora materialmente el plan de mañana.",
    ].join("\n");
  }

  if (lens === "weekly-review") {
    return [
      introEn,
      "Use short headings and keep them fully in English:",
      "1) What improved (1-2 lines).",
      "2) What slipped (2-4 bullets with facts).",
      "3) What matters next week (1-3 bullets of coach read).",
      "4) Next session plan (next action, rule to add, rule to remove, checkpoint focus).",
      "5) Follow-up only if critical information is missing or one question would materially improve the next-session plan.",
    ].join("\n");
  }
  if (lens === "risk-discipline") {
    return [
      introEn,
      "Use short headings and keep them fully in English:",
      "1) Risk rails status (1-2 lines: on track / at risk / violation).",
      "2) Evidence (2-4 bullets; facts only and 1-3 relevant numbers).",
      "3) Coach read (1-3 bullets; which rail broke and why).",
      "4) Fix for next session (next action, rule to add, rule to remove, checkpoint focus).",
      "5) Follow-up only if needed to sharpen the fix.",
    ].join("\n");
  }
  if (lens === "execution-truth") {
    return [
      introEn,
      "Use short headings and keep them fully in English:",
      "1) Execution truth (1-2 lines on whether behavior matched the plan).",
      "2) Evidence (2-4 bullets; chronological facts, entries/exits/management).",
      "3) Coach read (1-3 bullets; what operational pattern dominated).",
      "4) Fix for next session (next action, rule to add, rule to remove, checkpoint focus).",
      "5) Follow-up only if one critical trade detail is missing.",
    ].join("\n");
  }
  if (lens === "psychology-patterns") {
    return [
      introEn,
      "Use short headings and keep them fully in English:",
      "1) Dominant pattern (1-2 lines).",
      "2) Evidence (2-4 bullets; emotions, drift, decisions).",
      "3) Coach read (1-3 bullets; trigger and cost of the pattern).",
      "4) Intervention for next session (next action, rule to add, rule to remove, checkpoint focus).",
      "5) Follow-up only if it helps validate the main trigger.",
    ].join("\n");
  }
  return [
    introEn,
    "Use short headings and keep them fully in English:",
    "1) Status vs plan (1-2 lines: on track / at risk / off pace versus the checkpoint).",
    "2) Evidence (2-4 bullets; facts only and 1-3 relevant numbers).",
    "3) Coach read (1-3 bullets; main pattern and why it reduces the odds of reaching the plan).",
    "4) Next session plan (next action, rule to add, rule to remove, checkpoint focus).",
    "5) Follow-up only if critical information is missing or one question would materially improve tomorrow's plan.",
  ].join("\n");
}

function buildGrowthPlanOperatingBlock(body: AiCoachRequestBody): string {
  const growthPlan = body.growthPlan || null;
  const planSnapshot = body.planSnapshot || null;
  if (!growthPlan && !planSnapshot) return "";

  const lines: string[] = [];

  if (growthPlan) {
    const start = Number(growthPlan?.startingBalance);
    const target = Number(growthPlan?.targetBalance);
    const targetDate = safeString(growthPlan?.targetDate || "");
    const planMode = safeString(growthPlan?.planMode || "");
    const dailyTargetPct = Number(growthPlan?.dailyTargetPct);
    const maxDailyLossPercent = Number(growthPlan?.maxDailyLossPercent);
    const maxRiskPerTradePercent = Number(growthPlan?.maxRiskPerTradePercent);
    const maxRiskPerTradeUsd = Number(growthPlan?.maxRiskPerTradeUsd);
    const tradingDays = Number(growthPlan?.tradingDays);
    const lossDaysPerWeek = Number(growthPlan?.lossDaysPerWeek);
    const planStartDate = safeString(growthPlan?.planStartDate || "");

    lines.push(
      `Growth Plan objective: start=${usd(start)}, target=${usd(target)}${targetDate ? `, targetDate=${targetDate}` : ""}${planStartDate ? `, planStart=${planStartDate}` : ""}${planMode ? `, mode=${planMode}` : ""}`
    );
    lines.push(
      `Risk rails: dailyTarget=${pct(dailyTargetPct)}, maxDailyLoss=${pct(maxDailyLossPercent)}, maxRiskPerTrade=${Number.isFinite(maxRiskPerTradeUsd) && maxRiskPerTradeUsd > 0 ? usd(maxRiskPerTradeUsd) : pct(maxRiskPerTradePercent)}, tradingDays=${Number.isFinite(tradingDays) ? tradingDays : "—"}, lossDaysPerWeek=${Number.isFinite(lossDaysPerWeek) ? lossDaysPerWeek : "—"}`
    );

    const activeRules = safeArray<any>(growthPlan?.rules)
      .map((rule) => ({
        label: safeString(rule?.label).trim(),
        description: safeString(rule?.description).trim(),
      }))
      .filter((rule) => rule.label)
      .slice(0, 6);
    if (activeRules.length) {
      lines.push(`Active plan rules:\n${activeRules.map((rule) => `- ${rule.label}${rule.description ? ` · ${clampText(rule.description, 120)}` : ""}`).join("\n")}`);
    }

    const executionSystem = growthPlan?.executionSystem || null;
    if (executionSystem) {
      const doList = safeArray<any>(executionSystem?.doList)
        .map((item) => safeString(item?.text ?? item).trim())
        .filter(Boolean)
        .slice(0, 4);
      const dontList = safeArray<any>(executionSystem?.dontList)
        .map((item) => safeString(item?.text ?? item).trim())
        .filter(Boolean)
        .slice(0, 4);
      const orderList = safeArray<any>(executionSystem?.orderList)
        .map((item) => safeString(item?.text ?? item).trim())
        .filter(Boolean)
        .slice(0, 4);
      if (doList.length || dontList.length || orderList.length) {
        lines.push(
          `Execution system:${doList.length ? ` do=${doList.join(", ")}` : ""}${dontList.length ? ` | don't=${dontList.join(", ")}` : ""}${
            orderList.length ? ` | order=${orderList.join(", ")}` : ""
          }`
        );
      }
    }

    const prepareChecklist = safeArray<any>(growthPlan?.prepareChecklist)
      .map((item) => safeString(item?.text ?? item).trim())
      .filter(Boolean)
      .slice(0, 6);
    if (prepareChecklist.length) {
      lines.push(`Prepare checklist anchors: ${prepareChecklist.join(" | ")}`);
    }

    const strategies = safeArray<any>(growthPlan?.strategies)
      .map((strategy) => ({
        name: safeString(strategy?.name).trim(),
        setup: safeString(strategy?.setup).trim(),
        entryRules: safeString(strategy?.entryRules).trim(),
        exitRules: safeString(strategy?.exitRules).trim(),
        managementRules: safeString(strategy?.managementRules).trim(),
        invalidation: safeString(strategy?.invalidation).trim(),
        timeframe: safeString(strategy?.timeframe).trim(),
        instruments: safeArray<any>(strategy?.instruments).map((item) => safeString(item).trim()).filter(Boolean),
      }))
      .filter((strategy) => strategy.name || strategy.setup || strategy.entryRules || strategy.managementRules || strategy.invalidation)
      .slice(0, 3);
    if (strategies.length) {
      lines.push(
        `Strategy anchors:\n${strategies
          .map((strategy) => {
            const meta = [strategy.timeframe, strategy.instruments.join(", ")].filter(Boolean).join(" · ");
            const core =
              strategy.setup || strategy.entryRules || strategy.managementRules || strategy.exitRules || strategy.invalidation;
            return `- ${strategy.name || "Strategy"}${meta ? ` (${meta})` : ""}${core ? ` · ${clampText(core, 180)}` : ""}${
              strategy.invalidation ? ` · invalidation=${clampText(strategy.invalidation, 120)}` : ""
            }`;
          })
          .join("\n")}`
      );
    }

    const strategyNotes = safeString(growthPlan?.strategyNotes).trim();
    if (strategyNotes) {
      lines.push(`Strategy notes: ${clampText(strategyNotes, 220)}`);
    }
  }

  if (planSnapshot) {
    const start = Number(planSnapshot?.effectiveStartingBalance ?? planSnapshot?.startingBalance);
    const target = Number(planSnapshot?.effectiveTargetBalance ?? planSnapshot?.targetBalance);
    const current = Number(planSnapshot?.currentBalance);
    const progress = Number(planSnapshot?.progressPct);
    const sessionsSincePlan = Number(planSnapshot?.sessionsSincePlan);
    lines.push(
      `Plan position now: start=${usd(start)}, target=${usd(target)}, current=${usd(current)}, progress=${Number.isFinite(progress) ? progress.toFixed(1) + "%" : "—"}, sessionsSincePlan=${Number.isFinite(sessionsSincePlan) ? sessionsSincePlan : "—"}`
    );
  }

  const phases = safeArray<any>(growthPlan?.planPhases)
    .map((phase) => ({
      id: safeString(phase?.id),
      title: safeString(phase?.title),
      targetEquity: Number(phase?.targetEquity),
      targetDate: safeString(phase?.targetDate),
      status: safeString(phase?.status),
      monthIndex: Number(phase?.monthIndex),
      weekIndex: Number(phase?.weekIndex),
    }))
    .filter((phase) => Number.isFinite(phase.targetEquity) && phase.targetEquity > 0)
    .sort((a, b) => a.targetEquity - b.targetEquity);

  if (phases.length) {
    const currentBalance = Number(planSnapshot?.currentBalance);
    const nextPhase =
      phases.find((phase) => phase.status !== "completed" && (!Number.isFinite(currentBalance) || phase.targetEquity > currentBalance)) ||
      phases.find((phase) => phase.status !== "completed") ||
      null;
    if (nextPhase) {
      const gap = Number.isFinite(currentBalance) ? nextPhase.targetEquity - currentBalance : null;
      const gapText =
        gap == null
          ? ""
          : gap >= 0
            ? ` · gap=${usd(gap)}`
            : ` · gap=ahead ${usd(Math.abs(gap))}`;
      lines.push(
        `Next checkpoint: ${nextPhase.title || nextPhase.id || "Phase"} · target=${usd(nextPhase.targetEquity)}${nextPhase.targetDate ? ` · by=${nextPhase.targetDate}` : ""}${gapText}`
      );
    }
  }

  return lines.join("\n");
}

function extractJournalEntryForRetrieval(entry: any) {
  const date = safeString(entry?.date).slice(0, 10);
  const pnl = Number(entry?.pnl);
  const respectedPlan = typeof entry?.respectedPlan === "boolean" ? entry.respectedPlan : null;
  const emotion = safeString(entry?.emotion || "");
  const instrument = safeString(entry?.instrument || entry?.mainInstrument || entry?.symbol || "").toUpperCase();
  const tags = safeArray<any>(entry?.tags).map((tag) => safeString(tag).trim()).filter(Boolean);
  const notesJson = safeJsonParse(entry?.notes);
  const premarket = flattenTextValue(notesJson?.premarket ?? notesJson?.pre ?? "").slice(0, 6).join(" | ");
  const live = flattenTextValue(notesJson?.live ?? notesJson?.inside ?? "").slice(0, 6).join(" | ");
  const post = flattenTextValue(notesJson?.post ?? notesJson?.after ?? "").slice(0, 6).join(" | ");
  const neuro = flattenTextValue(notesJson?.neuro_layer ?? notesJson?.neuroLayer ?? "").slice(0, 6).join(" | ");
  const noteText = flattenTextValue(notesJson ?? entry?.notes ?? "").slice(0, 18).join(" | ");
  const emotionFlags = [emotion, live, post, neuro]
    .join(" ")
    .toLowerCase()
    .match(/fomo|fear|miedo|greed|codicia|revenge|revancha|ansiedad|anxiety|frustr|impuls|urgency|urgencia/g) ?? [];
  const violationFlags = [tags.join(" "), live, post, neuro, noteText]
    .join(" ")
    .toLowerCase()
    .match(/stop|no stop|sin stop|oversize|size|late|chase|plan no|plan=no|impuls|revenge|re-entry|reentry|overtrade|break rule|romp/i) ?? [];
  const summaryText = [
    date,
    instrument,
    emotion,
    tags.join(" "),
    premarket,
    live,
    post,
    neuro,
    noteText,
    emotionFlags.join(" "),
    violationFlags.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    date,
    pnl,
    respectedPlan,
    emotion,
    instrument,
    tags,
    premarket,
    live,
    post,
    neuro,
    noteText,
    emotionFlags,
    violationFlags,
    summaryText,
  };
}

function scoreRetrievedJournalEntry(entry: ReturnType<typeof extractJournalEntryForRetrieval>, body: AiCoachRequestBody): number {
  let score = 0;

  const question = safeString(body?.question || "").toLowerCase();
  const mode = safeString(body?.coachingFocus?.mode || "").toLowerCase();
  const tokens = question
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 12);

  for (const token of tokens) {
    if (entry.summaryText.includes(token)) score += 5;
  }

  const absPnl = Math.abs(Number(entry.pnl) || 0);
  if (absPnl >= 200) score += 2;
  if (entry.respectedPlan === false) score += 3;
  score += Math.min(4, entry.violationFlags.length);
  score += Math.min(3, entry.emotionFlags.length);

  const nextCheckpointTarget = Number(body?.growthPlan?.planPhases?.[0]?.targetEquity ?? NaN);
  const currentBalance = Number(body?.planSnapshot?.currentBalance ?? NaN);
  const checkpointGap =
    Number.isFinite(nextCheckpointTarget) && Number.isFinite(currentBalance)
      ? nextCheckpointTarget - currentBalance
      : null;
  if (checkpointGap != null && checkpointGap > 0 && Number(entry.pnl) < 0) {
    score += 2;
  }

  if (mode === "plan-rescue" && (entry.respectedPlan === false || Number(entry.pnl) < 0)) score += 4;
  if (mode === "risk-discipline" && /(risk|size|stop|loss|revenge|impuls)/i.test(entry.summaryText)) score += 4;
  if (mode === "execution-truth" && /(entry|exit|manage|execution|plan_followed|stop|target)/i.test(entry.summaryText)) score += 4;
  if (mode === "psychology-patterns" && /(emotion|fear|greed|fomo|anxiety|ansiedad|revenge|frustr)/i.test(entry.summaryText)) score += 4;
  if (mode === "weekly-review" && absPnl > 0) score += 2;

  return score;
}

function buildFullJournalRetrievalBlock(body: AiCoachRequestBody): string {
  const rows = safeArray<any>(body?.fullSnapshot?.journalEntries);
  if (!rows.length) return "";

  const startIso = toDateKey(body?.coachingFocus?.rangeStartIso);
  const endIso = toDateKey(body?.coachingFocus?.rangeEndIso);
  const filtered = rows.filter((row) => {
    const date = safeString(row?.date).slice(0, 10);
    if (!date) return false;
    if (startIso && date < startIso) return false;
    if (endIso && date > endIso) return false;
    return true;
  });
  if (!filtered.length) return "";

  const docs = filtered.map(extractJournalEntryForRetrieval);
  const scored = docs
    .map((entry) => ({ entry, score: scoreRetrievedJournalEntry(entry, body) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return safeString(b.entry.date).localeCompare(safeString(a.entry.date));
    });

  const selected = scored
    .filter((row, index) => row.score > 0 || index < 6)
    .slice(0, 8)
    .map((row) => row.entry);

  const planViolations = docs.filter((entry) => entry.respectedPlan === false).length;
  const redSessions = docs.filter((entry) => Number(entry.pnl) < 0).length;
  const greenSessions = docs.filter((entry) => Number(entry.pnl) > 0).length;

  const lines: string[] = [];
  lines.push(
    `Full journal scan: sessions=${filtered.length}, green=${greenSessions}, red=${redSessions}, planViolations=${planViolations}${startIso ? `, window=${startIso}${endIso ? ` → ${endIso}` : ""}` : ""}`
  );
  lines.push(
    "Retrieved from full journal corpus:\n" +
      selected
        .map((entry) => {
          const bits = [
            `- ${entry.date || "—"} · pnl ${Number.isFinite(entry.pnl) ? usd(entry.pnl) : "—"}`,
            entry.instrument ? `instrument ${entry.instrument}` : "",
            entry.respectedPlan === false ? "plan=no" : entry.respectedPlan === true ? "plan=yes" : "",
            entry.tags.length ? `tags: ${entry.tags.slice(0, 5).join(", ")}` : "",
            entry.emotion ? `emotion: ${entry.emotion}` : "",
          ].filter(Boolean);
          const detail = [entry.premarket, entry.live, entry.post, entry.neuro, entry.noteText]
            .filter(Boolean)
            .map((section) => clampText(section, 160))
            .slice(0, 3)
            .join(" | ");
          return detail ? `${bits.join(" · ")}\n  ${detail}` : bits.join(" · ");
        })
        .join("\n")
  );

  return lines.join("\n");
}

function buildContextText(body: AiCoachRequestBody, lang: "es" | "en"): string {
  const profile = body.userProfile || {};
  const firstName = safeString(profile.firstName || profile.displayName || profile.name || "Trader").trim() || "Trader";

  const snapshot = body.snapshot || null;
  const analytics = body.analyticsSummary || null;
  const analyticsSnapshot = body.analyticsSnapshot || null;

  const lines: string[] = [];

  lines.push(`User name: ${firstName}`);
  lines.push(resolveCoachDirectiveBlock(body, lang));

  const growthPlanBlock = buildGrowthPlanOperatingBlock(body);
  if (growthPlanBlock) {
    lines.push(growthPlanBlock);
  }

  if (snapshot) {
    const total = Number(snapshot?.totalSessions) || 0;
    const green = Number(snapshot?.greenSessions) || 0;
    const red = Number(snapshot?.redSessions) || 0;
    const winRate = Number(snapshot?.winRate);
    lines.push(
      `Snapshot: totalSessions=${total}, green=${green}, red=${red}, winRate≈${Number.isFinite(winRate) ? winRate.toFixed(1) + "%" : "—"}`
    );
  }

  if (analytics?.base) {
    const b = analytics.base;
    const total = Number(b?.totalSessions) || 0;
    const winRate = Number(b?.winRate);
    const avg = Number(b?.avgPnl);
    const sum = Number(b?.sumPnl);
    const best = b?.bestDay?.date ? `${safeString(b.bestDay.date).slice(0, 10)} ${usd(b.bestDay.pnl)}` : "—";
    const tough = b?.toughestDay?.date ? `${safeString(b.toughestDay.date).slice(0, 10)} ${usd(b.toughestDay.pnl)}` : "—";

    lines.push(
      `Analytics base: sessions=${total}, winRate=${Number.isFinite(winRate) ? winRate.toFixed(1) + "%" : "—"}, avgPnl=${Number.isFinite(avg) ? usd(avg) : "—"}, sumPnl=${Number.isFinite(sum) ? usd(sum) : "—"}, bestDay=${best}, toughestDay=${tough}`
    );

    const topInst = buildTopInstruments(analytics, 5);
    if (topInst) {
      lines.push("Top instruments (by sessions):\n" + topInst);
    }

    const topTags = buildTopTags(analytics, 8);
    if (topTags) {
      lines.push("Top tags:\n" + topTags);
    }
  }

  const analyticsBlock = buildAnalyticsSnapshotBlock(analyticsSnapshot);
  if (analyticsBlock) {
    lines.push(analyticsBlock);
  }

  const tradeStatsBlock = buildTradeStatsSummaryBlock(body.tradeStatsSummary);
  if (tradeStatsBlock) {
    lines.push(tradeStatsBlock);
  }

  const kpiBlock = buildKpiResultsBlock(body.kpiResults || [], lang);
  if (kpiBlock) {
    lines.push(kpiBlock);
    const timed = Number(body?.tradeStatsSummary?.tradesWithTime);
    const total = Number(body?.tradeStatsSummary?.tradeCount);
    if (Number.isFinite(timed) && Number.isFinite(total)) {
      lines.push(`KPI timing note: computed only from trades with entry+exit times (${timed}/${total}).`);
    }
  }

  const comparisonsBlock = buildPeriodComparisonsBlock(body.periodComparisons || [], lang);
  if (comparisonsBlock) {
    lines.push(comparisonsBlock);
  }

  const gamification = body.gamification || body.fullSnapshot?.profileGamification;
  if (gamification) {
    const level = Number(gamification?.level);
    const tier = safeString(gamification?.tier || "");
    const xp = Number(gamification?.xp);
    const badges = Array.isArray(gamification?.badges) ? gamification.badges.length : 0;
    lines.push(
      `Gamification: level=${Number.isFinite(level) ? level : "—"}, tier=${tier || "—"}, xp=${Number.isFinite(xp) ? xp : "—"}, badges=${badges}`
    );
  }

  const challenges = Array.isArray(body.fullSnapshot?.challenges) ? body.fullSnapshot?.challenges : [];
  if (challenges.length) {
    const summarized = challenges.slice(0, 6).map((c: any) => {
      const id = safeString(c?.challengeId || c?.challenge_id || "");
      const status = safeString(c?.status || "");
      const tracked = Number(c?.daysTracked ?? c?.days_tracked);
      const duration = Number(c?.durationDays ?? c?.duration_days);
      const streak = Number(c?.currentStreak ?? c?.current_streak);
      return `- ${id || "(challenge)"} · status=${status || "—"} · ${Number.isFinite(tracked) ? tracked : "—"}/${Number.isFinite(duration) ? duration : "—"} days · streak=${Number.isFinite(streak) ? streak : "—"}`;
    });
    lines.push("Challenges (latest runs):\n" + summarized.join("\n"));
  }

  const recent = Array.isArray(body.recentSessions) ? body.recentSessions : [];
  const relevant = Array.isArray(body.relevantSessions) ? body.relevantSessions : [];

  const recentSnippet = buildRecentSessionsSnippet(recent, 8);
  if (recentSnippet) lines.push("Recent sessions (most recent first):\n" + recentSnippet);

  const relevantSnippet = buildRecentSessionsSnippet(relevant, 6);
  if (relevantSnippet) lines.push("Relevant sessions for the question:\n" + relevantSnippet);

  const fullJournalBlock = buildFullJournalRetrievalBlock(body);
  if (fullJournalBlock) {
    lines.push(fullJournalBlock);
  }

  // Keep the context block bounded.
  const joined = lines.join("\n");
  return joined.length > 14000 ? joined.slice(0, 14000) + "\n…(truncated)" : joined;
}

async function getRecentCoachFeedback(userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const { data, error } = await supabaseAdmin
      .from("ai_coach_feedback")
      .select("rating,note,created_at,thread_id,message_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6);
    if (error || !Array.isArray(data) || !data.length) return "";

    const rows = data.map((r: any) => {
      const when = safeString(r.created_at).slice(0, 10);
      const label = r.rating === 1 ? "helpful" : "not helpful";
      const note = safeString(r.note);
      return `- ${when}: ${label}${note ? ` · ${note}` : ""}`;
    });
    return rows.join("\n");
  } catch {
    return "";
  }
}

function buildSystemPrompt(params: {
  lang: "es" | "en";
  firstName: string;
  allowTables: boolean;
  strictEvidenceMode: boolean;
  mode: string;
}): string {
  const { lang, firstName, allowTables, strictEvidenceMode, mode } = params;
  const lensGuide = buildLensStructureGuide(mode, lang, strictEvidenceMode);

  if (lang === "es") {
    return [
      "Eres un coach de trading 1:1. Tu objetivo principal es aumentar la probabilidad de que el usuario cumpla su Growth Plan y el próximo checkpoint usando SOLO el contexto provisto.",
      "Estilo obligatorio:",
      `- Habla como un coach humano (cercano, directo, sin sonar robótico). Puedes usar el nombre del usuario: ${firstName}.`,
      "- Responde a la pregunta específica primero; no des un reporte genérico.",
      "- Si hay contexto de Growth Plan, piensa como un operador del plan: primero ubica al usuario contra la meta, luego identifica el bloqueo principal, luego da la acción de mayor leverage.",
      "- Si el Growth Plan incluye estrategia, reglas o límites exactos, úsalos como ancla factual. Puedes sintetizarlos en lenguaje más claro y humano, pero sin distorsionar el significado.",
      "- Mantén la respuesta en segmentos cortos (párrafos breves + bullets cuando ayude).",
      `- ${allowTables ? "Puedes usar tablas si el usuario las pidió." : "NO uses tablas Markdown salvo que el usuario explícitamente pida una tabla/desglose."}`,
      "- NO asumas ni inventes datos. Si algo no está en el contexto, dilo explícitamente.",
      "- Separa hechos (observaciones) de inferencias. Si infieres, dilo y explica el soporte.",
      "- Sé objetivo: no digas lo que el usuario quiere oír, di lo que los datos muestran.",
      "- Acompaña al usuario como un coach real: cercano, honesto y útil. No vendas certeza, no prometas resultados y no 'infles' el contexto.",
      "- Cuando existan datos del plan, menciona explícitamente: 1) cómo va respecto al plan/checkpoint, 2) qué patrón lo aleja del plan, 3) qué debe cambiar mañana.",
      "- Si incluyes métricas/estadísticas, usa 1–3 números relevantes y explica qué significan (sin volcar datos).",
      "- Si hay KPIs en el contexto, interprétalos usando su definición y notas; si un KPI no tiene valor, di que falta data.",
      "- Si el contexto incluye entradas/salidas o una secuencia cronológica, NARRA lo que pasó (orden de entradas/salidas, re-entrada, stop-out, recuperación) usando los tiempos/precios del contexto.",
      "- Si el contexto incluye Neuro Layer / Neuro Score / Neuro Insight, úsalo para comparar plan inicial, ejecución real y verdad post-trade. Señala drift cognitivo solo cuando el soporte sea claro.",
      "- Usa el journal completo de forma inteligente: prioriza las sesiones recuperadas del corpus completo cuando expliquen mejor el patrón que las sesiones recientes.",
      "- Pre‑prompt obligatorio: si NO hay resultados de Audit (Order History) en el contexto, pide al usuario que vaya a Back‑Studying → Audit y comparta el resumen o screenshots.",
      "- Si el usuario pregunta por “qué hubiera pasado” pero solo hay subyacente (sin precio real del contrato), explica la limitación y pide el precio del contrato a esa hora para continuar.",
      "- Nunca digas que “no puedes ver imágenes”. Si hay screenshot adjunto o contexto de back-study, úsalo.",
      "- Si falta información crítica, haz UNA pregunta aclaratoria (pero igualmente da una recomendación útil).",
      "- Evita relleno, definiciones básicas y advertencias genéricas.",
      "- Si hay comparaciones por periodo, usa como máximo 1–2 para responder (no resumas todo).",
      "- Responde 100% en español. No mezcles headings, bullets, labels o cierres en inglés.",
      "- Si usas headings, usa headings cortos y consistentes con el lente actual.",
      lensGuide,
      "No cierres con una pregunta de seguimiento por defecto. Hazla solo si falta información crítica o si una sola pregunta mejorará materialmente la próxima sesión.",
      "Entrega en Markdown simple (títulos cortos opcionales, bullets ok).",
    ].join("\n");
  }

  return [
    "You are a 1:1 trading coach. Your primary job is to increase the user's probability of reaching the Growth Plan and the next checkpoint using ONLY the provided context.",
    "Required style:",
    `- Sound human (warm, direct, not robotic). You may use the user's name: ${firstName}.`,
    "- Answer the user's specific question first; do not produce a generic report.",
    "- If Growth Plan context exists, think like a plan operator: first locate the user versus the target, then identify the main blocker, then give the highest-leverage next action.",
    "- If the Growth Plan contains exact strategy, rule, or risk language, use it as factual anchor. You may synthesize it into clearer, more human wording, but do not distort the meaning.",
    "- Keep it concise with short paragraphs and bullets when helpful.",
    `- ${allowTables ? "You may use tables if the user asked for them." : "Do NOT use Markdown tables unless the user explicitly asked for a table/breakdown."}`,
    "- Do NOT assume or invent data. If something is not in the context, say so explicitly.",
    "- Separate facts (observations) from inferences. If you infer, say it and cite the support.",
    "- Be objective: do not tell the user what they want to hear, say what the data shows.",
    "- Support the user like a real coach: warm, honest, and useful. Do not sell certainty, promise outcomes, or overstate the evidence.",
    "- When plan data exists, explicitly state: 1) where the user stands versus the plan/checkpoint, 2) which pattern is reducing the odds of hitting it, 3) what to change next session.",
    "- If you cite analytics, use only 1–3 relevant numbers and explain the implication (no data dump).",
    "- If KPI results are provided, interpret them using their definition/notes; if a KPI has no value, say data is insufficient.",
    "- If context includes entries/exits or a chronological sequence, NARRATE what happened (entry/exit order, re-entry, stop-out, recovery) using the times/prices from context.",
    "- If Neuro Layer / Neuro Score / Neuro Insight are present, use them to compare the original plan, live execution, and post-trade truth. Only call cognitive drift when the support is clear.",
    "- Use the full journal intelligently: prioritize sessions retrieved from the full journal corpus when they explain the pattern better than the recent sample.",
    "- Required pre‑prompt: if Audit (Order History) results are NOT in context, ask the user to open Back‑Studying → Audit and share the summary or screenshots.",
    "- If the user asks “what would have happened” but only underlying prices exist (no option contract price), state the limitation and ask for the contract price at that time to continue.",
    "- Never say you “can’t see images”. If a screenshot or back-study context is provided, use it.",
    "- If critical info is missing, ask ONE clarifying question (but still give a useful recommendation).",
    "- Avoid filler, basic definitions, and generic disclaimers.",
    "- If period comparisons are provided, use at most 1–2 to answer (do not summarize everything).",
    "- Respond 100% in English. Do not mix headings, bullets, labels, or closing lines in Spanish.",
    "- If you use headings, keep them short and consistent with the active lens.",
    lensGuide,
    "Do not end with a follow-up question by default. Ask one only if critical information is missing or one question would materially improve the next session plan.",
    "Output in clean Markdown (short headings optional, bullets ok).",
  ].join("\n");
}

function buildMemorySystemPrompt(lang: "es" | "en", scope: "global" | "weekly" | "daily"): string {
  const scopeLabel =
    scope === "daily" ? "del día actual" : scope === "weekly" ? "de la semana actual" : "global";
  if (lang === "es") {
    return [
      "Eres un sistema de memoria para un coach de trading.",
      `Actualiza una memoria breve y acumulativa del usuario (${scopeLabel}).`,
      "Incluye SOLO hechos persistentes, patrones, preferencias, reglas, objetivos y errores recurrentes.",
      "No incluyas datos sensibles (emails, teléfonos) ni cifras exactas si no son clave.",
      "Escribe en viñetas cortas. Máximo 12 viñetas.",
      "Si hay conflicto, prioriza lo más reciente.",
    ].join("\n");
  }
  return [
    "You are the memory system for a trading coach.",
    `Update a short, cumulative memory of the user (${scopeLabel}).`,
    "Include ONLY persistent facts, patterns, preferences, rules, goals, and recurring mistakes.",
    "Do not include sensitive data (emails, phone numbers) or exact figures unless critical.",
    "Write concise bullet points. Max 12 bullets.",
    "If there is a conflict, prefer the most recent info.",
  ].join("\n");
}

async function buildUpdatedMemory(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  lang: "es" | "en";
  scope: "global" | "weekly" | "daily";
  existingMemory: string;
  question: string;
  coachText: string;
  contextSnippet: string;
}): Promise<string> {
  const { apiKey, baseUrl, model, lang, scope, existingMemory, question, coachText, contextSnippet } = params;
  const system = buildMemorySystemPrompt(lang, scope);
  const payload = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        "Previous memory:",
        existingMemory || "(none)",
        "",
        "New question:",
        question || "(no explicit question)",
        "",
        "Coach response:",
        clampText(coachText, 1600),
        "",
        "Context snippet:",
        clampText(contextSnippet, 3600),
        "",
        "Update memory:",
      ].join("\n"),
    },
  ];

  const result = await callOpenAI({
    apiKey,
    baseUrl,
    model,
    messages: payload,
    maxTokens: 260,
    temperature: 0.2,
  });

  const text = safeString(result.text).trim();
  return text.length > 1400 ? text.slice(0, 1400) + "…" : text;
}

function mapChatHistory(chatHistory: ChatHistoryItem[] | undefined): { role: "user" | "assistant"; content: string }[] {
  const rows = Array.isArray(chatHistory) ? chatHistory : [];

  return rows
    .slice(-14)
    .map((m) => {
      // Ensure literal union type (prevents TS widening to `string` in some tsconfig setups)
      const role: "user" | "assistant" = m.role === "user" ? "user" : "assistant";
      const content = clampText(m.text, 900);
      return { role, content };
    })
    .filter((m) => m.content.trim().length > 0);
}

async function callOpenAI(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: any[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; model: string; usage: any }>
{
  const { apiKey, baseUrl, model, messages, maxTokens = 900, temperature = 0.55 } = params;

  const cleanedBaseUrl = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");

  const res = await fetch(`${cleanedBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      safeString(data?.error?.message) ||
      safeString(data?.message) ||
      `OpenAI request failed (${res.status})`;
    throw new Error(msg);
  }

  const text = safeString(data?.choices?.[0]?.message?.content).trim();
  return {
    text: text || "No response text received.",
    model: safeString(data?.model) || model,
    usage: data?.usage ?? null,
  };
}

function extractFirstJsonObject(raw: string): any | null {
  const text = safeString(raw).trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function buildCoachActionPlan(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  lang: "es" | "en";
  question: string;
  coachText: string;
  planContext: string;
}): Promise<CoachActionPlan | null> {
  const { apiKey, baseUrl, model, lang, question, coachText, planContext } = params;
  const system =
    lang === "es"
      ? [
          "Extrae un plan de acción operativo desde una respuesta de coaching de trading, anclado al Growth Plan del usuario.",
          "Devuelve SOLO JSON válido con este shape exacto:",
          '{"summary":"", "whatISee":"", "whatIsDrifting":"", "whatToProtect":"", "whatChangesNextSession":"", "nextAction":"", "ruleToAdd":"", "ruleToRemove":"", "checkpointFocus":""}',
          "Reglas:",
          "- Usa SOLO dos fuentes: 1) el bloque Growth Plan context, 2) la respuesta del coach.",
          "- NO inventes reglas, porcentajes, tamaños, instrumentos, setups, checkpoints ni límites.",
          "- Usa el plan del usuario como base factual, pero puedes reformular en lenguaje más claro, más útil y más humano si sigues siendo fiel al significado.",
          "- Debe sentirse como un coach real: observador, honesto, concreto y sin vender certezas.",
          "- summary: 1 frase corta de la tesis del coach conectada al plan del usuario, sin exagerar certeza.",
          "- whatISee: lo que ves en la ejecución o patrón del usuario según su plan y el contexto; breve, específico y humano.",
          "- whatIsDrifting: dónde se está desviando del plan o qué está perdiendo calidad; si no está claro, string vacío.",
          "- whatToProtect: lo que sí debe proteger en riesgo, proceso o conducta para no romper su edge.",
          "- whatChangesNextSession: el ajuste concreto para la próxima sesión; una sola dirección clara.",
          "- nextAction: una sola acción clara para la próxima sesión, específica al plan del usuario y escrita como un coach real, no como plantilla.",
          "- ruleToAdd: solo si la respuesta propone una regla NUEVA no presente ya en el sistema actual.",
          "- ruleToRemove: solo si la respuesta propone dejar de hacer algo concreto.",
          "- checkpointFocus: el foco del plan/riesgo/ejecución que debe protegerse según el contexto. Puede ser una versión más corta de whatToProtect.",
          "- Si una clave no está soportada por el contexto, usa string vacío.",
        ].join("\n")
      : [
          "Extract an operational action plan from a trading coaching response, anchored to the user's Growth Plan.",
          "Return ONLY valid JSON with this exact shape:",
          '{"summary":"", "whatISee":"", "whatIsDrifting":"", "whatToProtect":"", "whatChangesNextSession":"", "nextAction":"", "ruleToAdd":"", "ruleToRemove":"", "checkpointFocus":""}',
          "Rules:",
          "- Use ONLY two sources: 1) the Growth Plan context block, 2) the coach response.",
          "- Do NOT invent rules, percentages, sizes, instruments, setups, checkpoints, or limits.",
          "- Use the user's plan as factual base, but you may rephrase it into clearer, more useful, more human language if you stay faithful to the meaning.",
          "- It should feel like a real coach: observant, honest, concrete, and free of false certainty.",
          "- summary: 1 short sentence with the coach's thesis tied to the user's plan, without overstating certainty.",
          "- whatISee: what you see in the user's execution or pattern based on their plan and the context; brief, specific, and human.",
          "- whatIsDrifting: where the user is slipping away from plan quality; if unclear, return an empty string.",
          "- whatToProtect: what must stay intact in risk, process, or behavior so the edge is not damaged.",
          "- whatChangesNextSession: the concrete adjustment for the next session; give one clear direction.",
          "- nextAction: one clear action for the next session, specific to the user's plan and written like a real coach, not a template.",
          "- ruleToAdd: only if the response proposes a NEW rule not already present in the current system.",
          "- ruleToRemove: only if the response proposes stopping something concrete.",
          "- checkpointFocus: the plan/risk/execution focus that must be protected according to context. It can be a shorter mirror of whatToProtect.",
          "- If a key is not supported by context, use an empty string.",
        ].join("\n");

  const extraction = await callOpenAI({
    apiKey,
    baseUrl,
    model,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Growth Plan context:\n${clampText(planContext, 2400) || "(none)"}\n\nQuestion:\n${clampText(
          question,
          500
        )}\n\nCoach response:\n${clampText(coachText, 2200)}`,
      },
    ],
    maxTokens: 380,
    temperature: 0.1,
  });

  const parsed = extractFirstJsonObject(extraction.text);
  if (!parsed || typeof parsed !== "object") return null;

  const whatISee = clampText(parsed.whatISee || parsed.summary, 220);
  const whatIsDrifting = clampText(parsed.whatIsDrifting || parsed.ruleToRemove, 220);
  const whatToProtect = clampText(parsed.whatToProtect || parsed.checkpointFocus, 180);
  const whatChangesNextSession = clampText(parsed.whatChangesNextSession || parsed.nextAction, 180);
  const nextAction = clampText(parsed.nextAction || whatChangesNextSession, 180);
  const checkpointFocus = clampText(parsed.checkpointFocus || whatToProtect, 140);

  return {
    summary: clampText(parsed.summary, 180),
    whatISee,
    whatIsDrifting,
    whatToProtect,
    whatChangesNextSession,
    nextAction,
    ruleToAdd: clampText(parsed.ruleToAdd, 180),
    ruleToRemove: clampText(parsed.ruleToRemove, 180),
    checkpointFocus,
  };
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const advancedGate = await requireAdvancedPlan(authUser.userId);
    if (advancedGate) return advancedGate;

    const rate = rateLimit(`ai-coach:user:${authUser.userId}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return Response.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(rate),
          },
        }
      );
    }

    const apiKey =
      process.env.OPENAI_API_KEY ||
      process.env.AI_COACH_OPENAI_API_KEY;

    const baseUrl =
      process.env.OPENAI_BASE_URL ||
      process.env.AI_COACH_OPENAI_BASE_URL ||
      "https://api.openai.com/v1";
    if (!apiKey) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY on server." },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => null)) as AiCoachRequestBody | null;
    if (!body) {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const question = safeString(body.question).trim();
    const language = detectLanguage(question, body.language);

    const profile = body.userProfile || {};
    const firstName =
      safeString(profile.firstName || profile.displayName || profile.name || "Trader").trim() ||
      "Trader";

    const allowTables = userRequestedTables(question);

    const strictEvidenceMode =
      typeof body?.stylePreset?.strictEvidenceMode === "boolean"
        ? body.stylePreset.strictEvidenceMode
        : false;

    const system = buildSystemPrompt({
      lang: language,
      firstName,
      allowTables,
      strictEvidenceMode,
      mode: safeString(body?.coachingFocus?.mode || ""),
    });

    const userId = authUser.userId;
    const scopeKeys = resolveScopeKeys(body);
    const existingMemory = userId ? await getCoachMemory(userId, scopeKeys) : { global: "", weekly: "", daily: "" };

    const autoAudit = userId ? await buildAutomaticAuditContext(userId, body) : { block: "", meta: { attached: false } as AutoAuditContext };

    let contextText = buildContextText(body, language);
    if (autoAudit.block) {
      contextText += `\nAutomatic execution audit:\n${autoAudit.block}`;
    }
    if (userId) {
      const feedbackSnippet = await getRecentCoachFeedback(userId);
      if (feedbackSnippet) {
        contextText += `\nRecent coach feedback:\n${feedbackSnippet}`;
      }
    }
    const history = mapChatHistory(body.chatHistory);

    const backStudyContext = safeString(body.backStudyContext).trim();
    const screenshotBase64 = safeString(body.screenshotBase64).trim();

    // The user's message content (supports optional screenshot)
    const userParts: any[] = [];

    const userQuestionText = question || (language === "es" ? "(Sin pregunta explícita. Analiza el contexto.)" : "(No explicit question. Please analyze the context.)");

    userParts.push({
      type: "text",
      text: userQuestionText,
    });

    if (backStudyContext) {
      userParts.push({
        type: "text",
        text: backStudyContext,
      });
    }

    if (screenshotBase64) {
      userParts.push({
        type: "image_url",
        image_url: { url: screenshotBase64 },
      });
    }

    const memoryBlocks: string[] = [];
    if (existingMemory.daily) {
      memoryBlocks.push(`Daily memory (${scopeKeys.dailyKey}):\n${existingMemory.daily}`);
    }
    if (existingMemory.weekly) {
      memoryBlocks.push(`Weekly memory (${scopeKeys.weeklyKey}):\n${existingMemory.weekly}`);
    }
    if (existingMemory.global) {
      memoryBlocks.push(`Global memory:\n${existingMemory.global}`);
    }

    const messages: any[] = [
      { role: "system", content: system },
      ...(memoryBlocks.length
        ? [
            {
              role: "system",
              content: `Coach memory (running summary, use as prior context):\n${memoryBlocks.join("\n\n")}`,
            },
          ]
        : []),
      {
        role: "system",
        content:
          "Context (read-only; do not invent anything beyond this):\n" + contextText,
      },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userParts },
    ];

    const model =
      (screenshotBase64
        ? process.env.AI_COACH_VISION_MODEL
        : process.env.AI_COACH_MODEL) ||
      "gpt-4o-mini";

    const result = await callOpenAI({
      apiKey,
      baseUrl,
      model,
      messages,
      maxTokens: 900,
      temperature: 0.6,
    });

    let coachText = result.text;

    // Remove tables unless the user asked for them.
    if (!allowTables) {
      coachText = stripMarkdownTables(coachText);
    }

    // Keep the model output intact; only backfill if the model returned nothing.
    coachText = maybeAppendFollowUp(coachText, language, question);

    let actionPlan: CoachActionPlan | null = null;
    try {
      actionPlan = await buildCoachActionPlan({
        apiKey,
        baseUrl,
        model: process.env.AI_COACH_MODEL || "gpt-4o-mini",
        lang: language,
        question,
        coachText,
        planContext: buildGrowthPlanOperatingBlock(body),
      });
    } catch {
      actionPlan = null;
    }

    if (userId && body.threadId && actionPlan) {
      try {
        const { data: existingThread } = await supabaseAdmin
          .from("ai_coach_threads")
          .select("metadata")
          .eq("id", body.threadId)
          .eq("user_id", userId)
          .maybeSingle();

        await supabaseAdmin
          .from("ai_coach_threads")
          .update({
            summary: actionPlan.summary || null,
            metadata: {
              ...((existingThread as any)?.metadata ?? {}),
              latestActionPlan: actionPlan,
              latestAudit: autoAudit.meta,
              updatedFrom: "ai-coach",
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.threadId)
          .eq("user_id", userId);
      } catch {
        // keep response flowing even if thread summary fails
      }
    }

    if (userId) {
      try {
        const memoryModel = process.env.AI_COACH_MODEL || "gpt-4o-mini";

        const updatedGlobal = await buildUpdatedMemory({
          apiKey,
          baseUrl,
          model: memoryModel,
          lang: language,
          scope: "global",
          existingMemory: existingMemory.global,
          question,
          coachText,
          contextSnippet: contextText,
        });

        const updatedWeekly = await buildUpdatedMemory({
          apiKey,
          baseUrl,
          model: memoryModel,
          lang: language,
          scope: "weekly",
          existingMemory: existingMemory.weekly,
          question,
          coachText,
          contextSnippet: contextText,
        });

        const updatedDaily = await buildUpdatedMemory({
          apiKey,
          baseUrl,
          model: memoryModel,
          lang: language,
          scope: "daily",
          existingMemory: existingMemory.daily,
          question,
          coachText,
          contextSnippet: contextText,
        });

        if (updatedGlobal) {
          await upsertCoachMemory({
            userId,
            scope: "global",
            scopeKey: null,
            memory: updatedGlobal,
            metadata: { model: result.model, updatedFrom: "ai-coach" },
          });
        }

        if (updatedWeekly) {
          await upsertCoachMemory({
            userId,
            scope: "weekly",
            scopeKey: scopeKeys.weeklyKey,
            memory: updatedWeekly,
            metadata: { model: result.model, updatedFrom: "ai-coach", scopeKey: scopeKeys.weeklyKey },
          });
        }

        if (updatedDaily) {
          await upsertCoachMemory({
            userId,
            scope: "daily",
            scopeKey: scopeKeys.dailyKey,
            memory: updatedDaily,
            metadata: { model: result.model, updatedFrom: "ai-coach", scopeKey: scopeKeys.dailyKey },
          });
        }
      } catch {
        // ignore memory failures to keep response fast
      }
    }

    return Response.json({
      text: coachText,
      model: result.model,
      usage: result.usage,
      actionPlan,
      autoAudit: autoAudit.meta,
    });
  } catch (err: any) {
    const msg = safeString(err?.message) || "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
