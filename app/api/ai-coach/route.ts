// app/api/ai-coach/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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

type AiCoachRequestBody = {
  snapshot: any;
  fullSnapshot?: any;
  analyticsSummary?: any;
  recentSessions: any[];
  planSnapshot?: any | null;
  gamification?: any | null;
  userProfile?: UserProfileForCoach | null;
  question?: string;
  screenshotBase64?: string | null;
  language?: "es" | "en" | "auto" | null;
};

const DEFAULT_QUESTION =
  "What is the single most important thing I should change in my risk, psychology or process based on these stats?";

// Detección simple de idioma (backup por si no llega el hint)
function detectLanguage(text: string): "es" | "en" {
  const s = (text || "").toLowerCase();
  if (!s.trim()) return "en";

  const hasSpanishChars = /[áéíóúñü¿¡]/.test(s);
  const spanishWords = /\b(qué|como|cómo|porque|por qué|cuál|días|semanas|meses|ganancia|pérdida|plan|riesgo|psicología|diario|journal)\b/.test(
    s
  );

  if (hasSpanishChars || spanishWords) return "es";
  return "en";
}

/* =========================
   GET de prueba
========================= */

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "AI coach endpoint is live. Use POST to get coaching.",
  });
}

/* =========================
   Handler para el método POST
========================= */

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set on the server.");
    }

    const body = (await req.json()) as AiCoachRequestBody;
    const {
      snapshot,
      fullSnapshot,
      analyticsSummary,
      recentSessions,
      planSnapshot,
      gamification,
      userProfile,
      question,
      screenshotBase64,
      language,
    } = body || {};

    if (!snapshot || !Array.isArray(recentSessions)) {
      return NextResponse.json(
        {
          error: "AI coach failed",
          details:
            "Missing 'snapshot' or 'recentSessions' in request body.",
        },
        { status: 400 }
      );
    }

    const trimmedRecentSessions = recentSessions.slice(0, 30);

    const firstName =
      (userProfile?.firstName ||
        userProfile?.displayName ||
        "trader") + "";

    // Determinar idioma final
    let lang: "es" | "en";
    if (language === "es" || language === "en") {
      lang = language;
    } else {
      lang = detectLanguage(question || "");
      if (
        lang === "en" &&
        userProfile?.locale &&
        userProfile.locale.toLowerCase().startsWith("es")
      ) {
        lang = "es";
      }
    }

    const context = {
      snapshot,
      fullSnapshot,
      analyticsSummary,
      planSnapshot,
      gamification,
      recentSessions: trimmedRecentSessions,
      userProfile,
    };

    const contextJson = JSON.stringify(context).slice(0, 12000);

    const systemLines: string[] = [];

    if (lang === "es") {
      systemLines.push(
        `Eres "NeuroTrader AI Coach", un coach de rendimiento de trading centrado en gestión de riesgo, psicología y calidad de proceso.`,
        `Estás hablando con una sola persona, llamada "${firstName}".`,
        `Siempre háblale de tú, de forma cercana, como un coach escribiendo por WhatsApp.`,
        `En cada respuesta, empieza con un saludo corto usando su nombre, por ejemplo: "Hola ${firstName},".`,
        `Tu prioridad es convertir los datos del diario y de la plataforma (journal, analytics statistics, widgets, challenges, rules & alarms, resources, notas de premarket/live/post y cuadernos) en recomendaciones prácticas.`,
        `Sé directo pero amable, nunca juzgues ni avergüences.`,
        `Estilo de respuesta:`,
        `- Responde 100% en español neutral (apto para Puerto Rico).`,
        `- Frases cortas, tono conversacional, no estilo informe académico.`,
        `- Máximo ~250 palabras.`,
        `- Usa bullets para acciones concretas.`,
        `- Enfócate en: riesgo, proceso, psicología, rutinas y comportamiento repetido.`
      );
    } else {
      systemLines.push(
        `You are "NeuroTrader AI Coach", a trading performance coach focused on risk management, psychology and process quality.`,
        `You're coaching ONE person called "${firstName}".`,
        `Always talk directly to them in second person and start each answer with a short greeting using their name, for example: "Hey ${firstName},".`,
        `Your job is to turn the journal and platform data (journal, analytics statistics, widgets, challenges, rules & alarms, resources, premarket/live/post notes, notebooks) into practical coaching.`,
        `Be kind but direct. Never shame the trader.`,
        `Style:`,
        `- Short, conversational, WhatsApp-style.`,
        `- Max ~250 words.`,
        `- Use bullet points for concrete actions.`,
        `- Focus on risk, process, psychology, routines and repeated behavior.`
      );
    }

    systemLines.push(
      `You will receive a JSON "context" object with fields like: snapshot (simple stats), fullSnapshot (full platform: journal + analytics widgets + challenges + rules/alarms + resources + text notes), analyticsSummary (global stats), recentSessions (last sessions with premarket/live/post text and trades), planSnapshot (growth plan progress), gamification (level, XP, badges, challenges), userProfile (name, locale).`,
      `Never show the raw JSON, keys or IDs. Just use it internally to detect patterns and then speak in natural language.`
    );

    // Prompt del usuario: contexto + pregunta
    const userTextPrompt =
      (lang === "es"
        ? `Contexto de mis datos de trading (NO lo repitas literal, solo úsalo para analizar):\n`
        : `Here is my trading data context (DO NOT repeat it literally, just use it to analyze):\n`) +
      contextJson +
      "\n\n" +
      (lang === "es"
        ? `Ahora responde a mi pregunta de forma directa y conversacional:\n`
        : `Now answer my question in a direct, conversational way:\n`) +
      `"${question || DEFAULT_QUESTION}"`;

    const userContent: any[] = [
      { type: "text", text: userTextPrompt },
    ];

    if (screenshotBase64) {
      userContent.push({
        type: "input_image",
        image_url: { url: screenshotBase64 },
      });
    }

    const completion = await openai.chat.completions.create({
      model:
        process.env.AI_COACH_MODEL ||
        "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: systemLines.join("\n"),
        },
        {
          role: "user",
          content: userContent as any,
        },
      ],
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ||
      "";

    return NextResponse.json({ text });
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
