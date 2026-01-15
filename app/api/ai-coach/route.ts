// app/api/ai-coach/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * AI Coach API
 * - Accepts a compact context from the client (already derived from Supabase reads).
 * - Returns a short, high-signal coaching message (Markdown).
 *
 * NOTE:
 * - ChatGPT subscriptions (Plus/Pro/Team) are separate from API billing.
 * - This route uses your OpenAI API key from OPENAI_API_KEY env var.
 */

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type UserProfileForCoach = {
  id: string;
  email: string | null;
  displayName: string;
  firstName: string;
  locale?: string | null;
};

type ChatHistoryItem = {
  role: "user" | "coach";
  text: string;
  createdAt?: string;
};

type AiCoachRequestBody = {
  threadId?: string | null;
  chatHistory?: ChatHistoryItem[];

  // Question + modalities
  question?: string;
  screenshotBase64?: string | null;
  language?: "es" | "en" | "auto" | null;
  backStudyContext?: string | null;

  // Context
  snapshot?: any;
  analyticsSummary?: any;
  recentSessions?: any[];
  relevantSessions?: any[];
  planSnapshot?: any | null;
  growthPlan?: any | null;
  cashflowsSummary?: any | null;
  gamification?: any | null;
  fullSnapshot?: any;
  userProfile?: UserProfileForCoach | null;

  // Style hints
  stylePreset?: {
    mode?: string;
    askFollowupQuestion?: boolean;
    shortSegments?: boolean;
  };
  coachingFocus?: Record<string, any>;
};

const DEFAULT_QUESTION =
  "What is the single most important thing I should change in my risk, psychology or process based on these stats?";

/** Backup language detection */
function detectLanguage(text: string): "es" | "en" {
  const s = (text || "").toLowerCase();
  if (!s.trim()) return "en";

  const hasSpanishChars = /[áéíóúñü¿¡]/.test(s);
  const spanishWords =
    /\b(qué|como|cómo|porque|por qué|cuál|días|semanas|meses|ganancia|pérdida|plan|riesgo|psicología|diario|journal)\b/.test(
      s
    );

  if (hasSpanishChars || spanishWords) return "es";
  return "en";
}

/** Defensive compaction to keep payload size reasonable */
function compact(value: any, depth = 0): any {
  const MAX_DEPTH = 6;
  const MAX_ARRAY = 35;
  const MAX_KEYS = 80;
  const MAX_STR = 1200;

  if (value == null) return value;

  if (typeof value === "string") {
    return value.length > MAX_STR ? value.slice(0, MAX_STR) + "…" : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    const arr = value.slice(0, MAX_ARRAY);
    return depth >= MAX_DEPTH ? arr.slice(0, 8) : arr.map((v) => compact(v, depth + 1));
  }

  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return "[Object]";
    const out: Record<string, any> = {};
    const keys = Object.keys(value).slice(0, MAX_KEYS);
    for (const k of keys) out[k] = compact((value as any)[k], depth + 1);
    return out;
  }

  return String(value);
}

function safeJsonStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return "{}";
  }
}

/* =========================
   GET (healthcheck)
========================= */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "AI coach endpoint is live. Use POST to get coaching.",
  });
}

/* =========================
   POST (main)
========================= */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set on the server.");
    }

    const body = (await req.json()) as AiCoachRequestBody;

    const {
      chatHistory,
      snapshot,
      analyticsSummary,
      recentSessions,
      relevantSessions,
      planSnapshot,
      growthPlan,
      cashflowsSummary,
      gamification,
      fullSnapshot,
      userProfile,
      question,
      screenshotBase64,
      backStudyContext,
      language,
      stylePreset,
      coachingFocus,
    } = body || {};

    if (!snapshot || !Array.isArray(recentSessions)) {
      return NextResponse.json(
        {
          error: "AI coach failed",
          details: "Missing 'snapshot' or 'recentSessions' in request body.",
        },
        { status: 400 }
      );
    }

    const firstName = String(userProfile?.firstName || userProfile?.displayName || "trader");

    // Determine final language
    let lang: "es" | "en";
    if (language === "es" || language === "en") lang = language;
    else {
      lang = detectLanguage(question || "");
      if (lang === "en" && userProfile?.locale?.toLowerCase().startsWith("es")) lang = "es";
    }

    const askFollowup = Boolean(stylePreset?.askFollowupQuestion ?? true);

    // Build a compact context (valid JSON, not truncated mid-string)
    const compactContext = compact({
      snapshot,
      analyticsSummary,
      planSnapshot,
      growthPlan,
      cashflowsSummary,
      gamification,
      recentSessions: (recentSessions || []).slice(0, 25),
      relevantSessions: (relevantSessions || []).slice(0, 10),
      backStudyContext: backStudyContext || null,
      coachingFocus: coachingFocus || null,
      userProfile: userProfile || null,
    });

    const contextJson = safeJsonStringify(compactContext);

    // System prompt (style + constraints)
    const systemLines: string[] = [];

    if (lang === "es") {
      systemLines.push(
        `Eres "NeuroTrader AI Coach", un coach de rendimiento de trading centrado en gestión de riesgo, psicología y calidad de proceso.`,
        `Estás hablando con una sola persona, llamada "${firstName}". Háblale de tú, como coach directo y respetuoso.`,
        `Tu misión: convertir los datos del journal y de la plataforma en recomendaciones prácticas para mejorar su ejecución.`,
        `Reglas:`,
        `- Responde 100% en español neutral (apto para Puerto Rico).`,
        `- NO repitas el JSON ni menciones claves/IDs. Solo úsalo para detectar patrones.`,
        `- No des recomendaciones de compra/venta específicas ni predicciones. Enfócate en proceso, riesgo, psicología y consistencia.`,
        `Formato recomendado:`,
        `1) Diagnóstico corto (2–4 líneas)`,
        `2) 3 acciones concretas para la próxima sesión (bullets)`,
        `3) Riesgo & proceso (reglas “si/entonces”)`,
        askFollowup ? `4) 1 pregunta de seguimiento (para afinar el coaching)` : ``
      );
    } else {
      systemLines.push(
        `You are "NeuroTrader AI Coach", a trading performance coach focused on risk management, psychology and process quality.`,
        `You're coaching ONE person called "${firstName}". Speak directly to them in second person, kind but direct.`,
        `Your job: turn journal + platform context into practical coaching to improve execution.`,
        `Rules:`,
        `- Do NOT repeat raw JSON or mention keys/IDs. Use it internally only.`,
        `- Do not provide trade signals, predictions, or specific buy/sell recommendations. Focus on process, risk, psychology, routines.`,
        `Suggested format:`,
        `1) Short diagnosis (2–4 lines)`,
        `2) 3 concrete actions for the next session (bullets)`,
        `3) Risk & process (if/then rules)`,
        askFollowup ? `4) 1 follow-up question (to refine coaching)` : ``
      );
    }

    systemLines.push(
      `You will receive a JSON context with: snapshot, analyticsSummary, planSnapshot, growthPlan, cashflowsSummary, recentSessions, relevantSessions, gamification, and optional backStudyContext + screenshot.`,
      `Use recentSessions to detect the *latest* pattern. Use analyticsSummary for longer-term tendencies. Use planSnapshot to evaluate plan adherence (cashflows-neutral).`,
      `If a screenshot is present, treat it as a trade chart or performance screenshot and comment on entry/exit timing, structure, and rule adherence (not predictions).`
    );

    // Build chat history for continuity (last ~10 turns max)
    const historyMsgs =
      Array.isArray(chatHistory) && chatHistory.length
        ? chatHistory
            .slice(-10)
            .map((m) => ({
              role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
              content: String(m.text || "").slice(0, 1200),
            }))
        : [];

    // User prompt (context + question)
    const userQuestion = (question || "").trim() || DEFAULT_QUESTION;

    const userText =
      (lang === "es"
        ? `Contexto (úsalo SOLO para analizar; NO lo repitas literal):\n`
        : `Context (use ONLY to analyze; do NOT repeat it literally):\n`) +
      contextJson +
      "\n\n" +
      (lang === "es"
        ? `Pregunta del usuario:\n"${userQuestion}"`
        : `User question:\n"${userQuestion}"`);

    const userContent: any[] = [{ type: "text", text: userText }];

    if (screenshotBase64) {
      userContent.push({
        type: "input_image",
        image_url: { url: screenshotBase64 },
      });
    }

    const model = process.env.AI_COACH_MODEL || "gpt-4o-mini";

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: systemLines.join("\n") },
        ...historyMsgs,
        { role: "user", content: userContent as any },
      ],
      // A slightly higher ceiling helps make the coaching more useful.
      max_tokens: 750,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      text,
      model,
      usage: (completion as any).usage || null,
    });
  } catch (err: any) {
    console.error("AI coach error:", err);
    return NextResponse.json(
      {
        error: "AI coach failed",
        details:
          err?.message ||
          (typeof err === "string" ? err : "Unknown error calling OpenAI"),
      },
      { status: 500 }
    );
  }
}
