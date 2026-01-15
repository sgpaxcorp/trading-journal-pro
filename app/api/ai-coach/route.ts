// app/api/ai-coach/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
// Keep it snappy but allow enough time for vision + long context
export const maxDuration = 45;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  threadId?: string;

  // User input
  question?: string;
  screenshotBase64?: string | null;
  languageHint?: "es" | "en" | "auto" | null;

  // Context
  userProfile?: UserProfileForCoach | null;
  chatHistory?: ChatHistoryItem[];
  relevantSessions?: any[];
  fullSnapshot?: any;
  analyticsSummary?: any;
  planSnapshot?: any | null;
  gamification?: any | null;
  backStudyContext?: string | null;

  // Hints (optional)
  stylePreset?: any;
  coachingFocus?: any;
};

const DEFAULT_QUESTION_EN =
  "Based on my data, what is the single most important thing I should change in risk, psychology, or process?";
const DEFAULT_QUESTION_ES =
  "Basado en mis datos, ¿cuál es la cosa más importante que debo cambiar en riesgo, psicología o proceso?";

function clampText(s: unknown, max = 2000) {
  const t = (s ?? "").toString();
  return t.length > max ? t.slice(0, max) + "…[truncated]" : t;
}

function safeJson(obj: unknown, maxChars = 16000) {
  try {
    const s = JSON.stringify(obj ?? {});
    return s.length > maxChars ? s.slice(0, maxChars) + "…[truncated]" : s;
  } catch {
    return "{}";
  }
}

function detectLanguage(text: string, userLocale?: string | null): "es" | "en" {
  const s = (text || "").toLowerCase();
  if (!s.trim()) {
    if (userLocale && userLocale.toLowerCase().startsWith("es")) return "es";
    return "en";
  }

  const hasSpanishChars = /[áéíóúñü¿¡]/.test(s);
  const spanishWords =
    /\b(qué|como|cómo|porque|por qué|cuál|plan|riesgo|psicología|diario|journal|pérdida|ganancia|entré|salí|vela|velas|15m|minutos)\b/.test(
      s
    );

  if (hasSpanishChars || spanishWords) return "es";
  if (userLocale && userLocale.toLowerCase().startsWith("es")) return "es";
  return "en";
}

function pickModel(opts: { hasImage: boolean; question: string }) {
  // You cannot "use all models" at once. You pick ONE model per request.
  // This helper lets you route between models automatically.
  const fast = process.env.AI_COACH_MODEL_FAST || process.env.AI_COACH_MODEL || "gpt-4o-mini";
  const smart = process.env.AI_COACH_MODEL_SMART || process.env.AI_COACH_MODEL || "gpt-4o-mini";
  const vision = process.env.AI_COACH_MODEL_VISION || smart;

  if (opts.hasImage) return vision;

  // Heuristic: long question → smarter model (if configured)
  const qLen = (opts.question || "").length;
  if (qLen > 700) return smart;

  return fast;
}

function buildConversationTranscript(history?: ChatHistoryItem[], maxItems = 10) {
  if (!Array.isArray(history) || history.length === 0) return "";
  const last = history.slice(-maxItems);

  const lines: string[] = [];
  for (const m of last) {
    const role = m.role === "coach" ? "Coach" : "User";
    const text = clampText(m.text, 600);
    lines.push(`${role}: ${text}`);
  }
  return lines.join("\n");
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
   POST
========================= */

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set on the server." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as AiCoachRequestBody;

    const userProfile = body.userProfile ?? null;
    const firstName =
      (userProfile?.firstName || userProfile?.displayName || "Trader").toString();

    // Prefer explicit question; else use last user message; else default
    const chatTranscript = buildConversationTranscript(body.chatHistory, 12);
    const lastUserMsg =
      Array.isArray(body.chatHistory) && body.chatHistory.length
        ? [...body.chatHistory].reverse().find((m) => m.role === "user")?.text || ""
        : "";

    const rawQuestion = (body.question || "").trim() || (lastUserMsg || "").trim();

    const langHint =
      body.languageHint === "es" || body.languageHint === "en"
        ? body.languageHint
        : "auto";

    const lang =
      langHint === "es" || langHint === "en"
        ? langHint
        : detectLanguage(rawQuestion, userProfile?.locale ?? null);

    const question =
      rawQuestion ||
      (lang === "es" ? DEFAULT_QUESTION_ES : DEFAULT_QUESTION_EN);

    const hasImage = !!body.screenshotBase64;

    // Context object for the model (trim aggressively to control tokens)
    const context = {
      threadId: body.threadId || null,
      userProfile,
      planSnapshot: body.planSnapshot ?? null,
      gamification: body.gamification ?? null,
      analyticsSummary: body.analyticsSummary ?? null,

      // This can be large; keep it but it will be truncated in safeJson()
      fullSnapshot: body.fullSnapshot ?? null,

      // Sessions the client selected as relevant (most recent + back-study matched)
      relevantSessions: Array.isArray(body.relevantSessions)
        ? body.relevantSessions.slice(0, 25)
        : [],

      // Prior chat context for continuity
      chatTranscript: chatTranscript || "",

      // Back-study context (symbol/date/tf/window)
      backStudyContext: body.backStudyContext ?? null,

      // UX hints
      stylePreset: body.stylePreset ?? null,
      coachingFocus: body.coachingFocus ?? null,
    };

    const contextJson = safeJson(context, 17000);

    // Build system prompt (structured, but NOT a rigid script)
    const systemLines: string[] = [];

    if (lang === "es") {
      systemLines.push(
        `Eres "NeuroTrader AI Coach": un coach de rendimiento de trading estilo Wall Street (directo, exigente con el proceso, cero drama).`,
        `Estás hablando con UNA persona llamada "${firstName}". Háblale de tú.`,
        `Tu trabajo: convertir sus datos (journal, analytics, plan, retos, notas, back-study) en coaching accionable y específico.`,
        ``,
        `Formato (elige SOLO lo relevante; no uses siempre las mismas secciones):`,
        `- Empieza con un saludo breve usando su nombre (1 línea).`,
        `- Da un diagnóstico corto (2–3 líneas) basado en números/patrones reales del contexto.`,
        `- Luego: 3–6 bullets con acciones concretas (si/entonces, reglas, checklist).`,
        `- Cuando ayude, incluye UNA tabla corta en Markdown (<= 6 filas) para comparar (ej. "Últimas 5 sesiones vs Últimas 15", "Plan vs Real", "Antes vs Después").`,
        `- Si hay backStudyContext o screenshot: comenta timing de entrada/salida. Si NO tienes velas/15m reales, dilo y pide la captura en 15m. Si la captura tiene flechas, úsala.`,
        `- Cierra SIEMPRE con 1 pregunta de seguimiento (1 sola), después de tus recomendaciones.`,
        ``,
        `Estilo:`,
        `- Español natural (no libreto). Ajusta tu forma de escribir a la pregunta del usuario.`,
        `- Oraciones cortas, tono conversacional-profesional.`,
        `- Nada de vergüenza/juzgar. Sé firme con la disciplina.`,
        `- No prometas ganancias futuras.`
      );
    } else {
      systemLines.push(
        `You are "NeuroTrader AI Coach": a Wall Street-style trading performance coach (direct, process-obsessed, no hype).`,
        `You're coaching ONE person called "${firstName}". Speak in second person.`,
        `Your job: turn their platform data (journal, analytics, plan, challenges, notes, back-study) into actionable coaching.`,
        ``,
        `Format (pick ONLY what is relevant; avoid a rigid template):`,
        `- Start with a short greeting using their name (1 line).`,
        `- Give a short diagnosis (2–3 lines) grounded in real patterns/numbers from context.`,
        `- Then: 3–6 bullets with concrete actions (if/then rules, checklist, guardrails).`,
        `- When useful, include ONE short Markdown table (<= 6 rows) to compare ("Last 5 vs last 15", "Plan vs actual", "Before vs after").`,
        `- If backStudyContext or screenshot exists: comment on entry/exit timing. If you do NOT have true 15m candles, say so and ask for a 15m screenshot. If the screenshot has arrows, use it.`,
        `- ALWAYS end with exactly 1 follow-up question, after your recommendations.`,
        ``,
        `Style:`,
        `- Natural English (not scripted). Adapt your structure to the user’s question.`,
        `- Short sentences, professional-conversational tone.`,
        `- No shame. Be firm on discipline.`,
        `- No promises of future profits.`
      );
    }

    systemLines.push(
      `You will receive a JSON "context" in the user message. Do NOT show the raw JSON, keys, IDs, or internal metadata.`,
      `Use it internally to identify patterns and give coaching. If something important is missing, ask ONE clarifying question at the end (but still give best-effort coaching first).`
    );

    // Build user prompt
    const userText =
      (lang === "es"
        ? `Contexto (úsalo para analizar; NO lo repitas literal):\n`
        : `Context (use to analyze; DO NOT repeat literally):\n`) +
      contextJson +
      "\n\n" +
      (lang === "es"
        ? `Pregunta del usuario:\n"${clampText(question, 2000)}"`
        : `User question:\n"${clampText(question, 2000)}"`);

    const userContent: any[] = [{ type: "text", text: userText }];

    if (body.screenshotBase64) {
      userContent.push({
        type: "input_image",
        image_url: { url: body.screenshotBase64 },
      });
    }

    const model = pickModel({ hasImage, question });

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemLines.join("\n") },
        { role: "user", content: userContent as any },
      ],
      temperature: 0.35,
      max_tokens: 500,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({
      text,
      model,
      lang,
    });
  } catch (err: any) {
    console.error("AI coach error:", err);
    return NextResponse.json(
      {
        error: "AI coach failed",
        details:
          err?.message ||
          (typeof err === "string"
            ? err
            : "Unknown error calling OpenAI"),
      },
      { status: 500 }
    );
  }
}
