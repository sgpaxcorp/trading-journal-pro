// app/api/ai-coach/route.ts
//
// Goals:
// 1) Make the coach feel 1:1 and conversational (not robotic).
// 2) Always end with ONE follow-up question.
// 3) Avoid Markdown tables unless the user explicitly asks for stats/breakdowns.
// 4) Use the provided analytics only when it clearly supports the user's question.
// 5) Keep the response compact, actionable, and grounded in the data supplied.

import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getAuthUser } from "@/lib/authServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

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

function endsWithQuestion(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  const lastChar = t.slice(-1);
  return lastChar === "?" || lastChar === "¿" || lastChar === "؟" || lastChar === "？";
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
  if (endsWithQuestion(t)) return t;
  return `${t}\n\n${buildFallbackFollowUp(lang, question)}`;
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

      const tradesSummary = buildTradesSummary(s?.trades);
      if (tradesSummary) detailLines.push(`  trades: ${tradesSummary}`);

      return detailLines.length ? `${base}\n${detailLines.join("\n")}` : base;
    })
    .filter(Boolean);

  return rows.join("\n");
}

function buildContextText(body: AiCoachRequestBody, lang: "es" | "en"): string {
  const profile = body.userProfile || {};
  const firstName = safeString(profile.firstName || profile.displayName || profile.name || "Trader").trim() || "Trader";

  const snapshot = body.snapshot || null;
  const analytics = body.analyticsSummary || null;
  const analyticsSnapshot = body.analyticsSnapshot || null;
  const planSnapshot = body.planSnapshot || null;

  const lines: string[] = [];

  lines.push(`User name: ${firstName}`);

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

  if (planSnapshot) {
    const start = planSnapshot?.effectiveStartingBalance ?? planSnapshot?.startingBalance;
    const target = planSnapshot?.effectiveTargetBalance ?? planSnapshot?.targetBalance;
    const cur = planSnapshot?.currentBalance;
    const prog = Number(planSnapshot?.progressPct);
    const since = Number(planSnapshot?.sessionsSincePlan);
    lines.push(
      `Plan snapshot: start=${usd(start)}, target=${usd(target)}, current=${usd(cur)}, progress=${Number.isFinite(prog) ? prog.toFixed(1) + "%" : "—"}, sessionsSincePlan=${Number.isFinite(since) ? since : "—"}`
    );
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
}): string {
  const { lang, firstName, allowTables, strictEvidenceMode } = params;

  if (lang === "es") {
    return [
      "Eres un coach de trading 1:1. Tu objetivo es ayudar al usuario a mejorar su proceso, riesgo y psicología usando SOLO el contexto provisto.",
      "Estilo obligatorio:",
      `- Habla como un coach humano (cercano, directo, sin sonar robótico). Puedes usar el nombre del usuario: ${firstName}.`,
      "- Responde a la pregunta específica primero; no des un reporte genérico.",
      "- Mantén la respuesta en segmentos cortos (párrafos breves + bullets cuando ayude).",
      `- ${allowTables ? "Puedes usar tablas si el usuario las pidió." : "NO uses tablas Markdown salvo que el usuario explícitamente pida una tabla/desglose."}`,
      "- NO asumas ni inventes datos. Si algo no está en el contexto, dilo explícitamente.",
      "- Separa hechos (observaciones) de inferencias. Si infieres, dilo y explica el soporte.",
      "- Sé objetivo: no digas lo que el usuario quiere oír, di lo que los datos muestran.",
      "- Si incluyes métricas/estadísticas, usa 1–3 números relevantes y explica qué significan (sin volcar datos).",
      "- Si hay KPIs en el contexto, interprétalos usando su definición y notas; si un KPI no tiene valor, di que falta data.",
      "- Si el contexto incluye entradas/salidas o una secuencia cronológica, NARRA lo que pasó (orden de entradas/salidas, re-entrada, stop-out, recuperación) usando los tiempos/precios del contexto.",
      "- Nunca digas que “no puedes ver imágenes”. Si hay screenshot adjunto o contexto de back-study, úsalo.",
      "- Si falta información crítica, haz UNA pregunta aclaratoria (pero igualmente da una recomendación útil).",
      "- Evita relleno, definiciones básicas y advertencias genéricas.",
      "- Si hay comparaciones por periodo, usa como máximo 1–2 para responder (no resumas todo).",
      strictEvidenceMode
        ? "Formato estricto (breve): 1) Respuesta directa (1–2 frases). 2) Observaciones (2–4 bullets). 3) Inferencias (1–3 bullets, indicando soporte). 4) Conclusión (1–2 bullets)."
        : "Formato libre, pero breve.",
      "Regla final (no la rompas): termina SIEMPRE con UNA sola pregunta de seguimiento (una línea), específica y accionable.",
      "Entrega en Markdown simple (títulos cortos opcionales, bullets ok).",
    ].join("\n");
  }

  return [
    "You are a 1:1 trading coach. Your job is to help the user improve process, risk, and psychology using ONLY the provided context.",
    "Required style:",
    `- Sound human (warm, direct, not robotic). You may use the user's name: ${firstName}.`,
    "- Answer the user's specific question first; do not produce a generic report.",
    "- Keep it concise with short paragraphs and bullets when helpful.",
    `- ${allowTables ? "You may use tables if the user asked for them." : "Do NOT use Markdown tables unless the user explicitly asked for a table/breakdown."}`,
    "- Do NOT assume or invent data. If something is not in the context, say so explicitly.",
    "- Separate facts (observations) from inferences. If you infer, say it and cite the support.",
    "- Be objective: do not tell the user what they want to hear, say what the data shows.",
    "- If you cite analytics, use only 1–3 relevant numbers and explain the implication (no data dump).",
    "- If KPI results are provided, interpret them using their definition/notes; if a KPI has no value, say data is insufficient.",
    "- If context includes entries/exits or a chronological sequence, NARRATE what happened (entry/exit order, re-entry, stop-out, recovery) using the times/prices from context.",
    "- Never say you “can’t see images”. If a screenshot or back-study context is provided, use it.",
    "- If critical info is missing, ask ONE clarifying question (but still give a useful recommendation).",
    "- Avoid filler, basic definitions, and generic disclaimers.",
    "- If period comparisons are provided, use at most 1–2 to answer (do not summarize everything).",
    strictEvidenceMode
      ? "Strict brief format: 1) Direct answer (1–2 sentences). 2) Observations (2–4 bullets). 3) Inferences (1–3 bullets with support). 4) Conclusion (1–2 bullets)."
      : "Free format, but brief.",
    "Final rule (must follow): ALWAYS end with ONE follow-up question (single line), specific and actionable.",
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

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    });

    const userId = authUser.userId;
    const scopeKeys = resolveScopeKeys(body);
    const existingMemory = userId ? await getCoachMemory(userId, scopeKeys) : { global: "", weekly: "", daily: "" };

    let contextText = buildContextText(body, language);
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

    // Ensure it ends with exactly one follow-up question.
    coachText = maybeAppendFollowUp(coachText, language, question);

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
    });
  } catch (err: any) {
    const msg = safeString(err?.message) || "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
