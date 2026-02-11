// app/api/ai-coach/route.ts
//
// Goals:
// 1) Make the coach feel 1:1 and conversational (not robotic).
// 2) Always end with ONE follow-up question.
// 3) Avoid Markdown tables unless the user explicitly asks for stats/breakdowns.
// 4) Use the provided analytics only when it clearly supports the user's question.
// 5) Keep the response compact, actionable, and grounded in the data supplied.

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

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

      return `- ${date || ""} · pnl ${pnlText}${instrument ? ` · ${instrument}` : ""}${rp ? ` · ${rp}` : ""}${tagText ? ` · ${tagText}` : ""}`.trim();
    })
    .filter(Boolean);

  return rows.join("\n");
}

function buildContextText(body: AiCoachRequestBody): string {
  const profile = body.userProfile || {};
  const firstName = safeString(profile.firstName || profile.displayName || profile.name || "Trader").trim() || "Trader";

  const snapshot = body.snapshot || null;
  const analytics = body.analyticsSummary || null;
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
}): string {
  const { lang, firstName, allowTables } = params;

  if (lang === "es") {
    return [
      "Eres un coach de trading 1:1. Tu objetivo es ayudar al usuario a mejorar su proceso, riesgo y psicología usando SOLO el contexto provisto.",
      "Estilo obligatorio:",
      `- Habla como un coach humano (cercano, directo, sin sonar robótico). Puedes usar el nombre del usuario: ${firstName}.`,
      "- Responde a la pregunta específica primero; no des un reporte genérico.",
      "- Mantén la respuesta en segmentos cortos (párrafos breves + bullets cuando ayude).",
      `- ${allowTables ? "Puedes usar tablas si el usuario las pidió." : "NO uses tablas Markdown salvo que el usuario explícitamente pida una tabla/desglose."}`,
      "- Si incluyes métricas/estadísticas, usa 1–3 números relevantes y explica qué significan (sin volcar datos).",
      "- Si el contexto incluye entradas/salidas o una secuencia cronológica, NARRA lo que pasó (orden de entradas/salidas, re-entrada, stop-out, recuperación) usando los tiempos/precios del contexto.",
      "- Nunca digas que “no puedes ver imágenes”. Si hay screenshot adjunto o contexto de back-study, úsalo.",
      "- Si falta información crítica, haz UNA pregunta aclaratoria (pero igualmente da una recomendación útil).",
      "- Evita relleno, definiciones básicas y advertencias genéricas.",
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
    "- If you cite analytics, use only 1–3 relevant numbers and explain the implication (no data dump).",
    "- If context includes entries/exits or a chronological sequence, NARRATE what happened (entry/exit order, re-entry, stop-out, recovery) using the times/prices from context.",
    "- Never say you “can’t see images”. If a screenshot or back-study context is provided, use it.",
    "- If critical info is missing, ask ONE clarifying question (but still give a useful recommendation).",
    "- Avoid filler, basic definitions, and generic disclaimers.",
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

    const system = buildSystemPrompt({
      lang: language,
      firstName,
      allowTables,
    });

    const userId = safeString(body.userProfile?.id).trim();
    const scopeKeys = resolveScopeKeys(body);
    const existingMemory = userId ? await getCoachMemory(userId, scopeKeys) : { global: "", weekly: "", daily: "" };

    let contextText = buildContextText(body);
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
