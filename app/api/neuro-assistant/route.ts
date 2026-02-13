import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { getAuthUser } from "@/lib/authServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 30;

const USER_MANUAL_FILES: Record<"en" | "es", string[]> = {
  en: [
    "docs/user-manual/en/overview.md",
    "docs/user-manual/en/getting-started.md",
    "docs/user-manual/en/journal.md",
    "docs/user-manual/en/workflows.md",
    "docs/user-manual/en/dashboard-widgets.md",
    "docs/user-manual/en/analytics.md",
    "docs/user-manual/en/data-inputs.md",
    "docs/user-manual/en/reports.md",
    "docs/user-manual/en/post-mortem.md",
    "docs/user-manual/en/settings.md",
  ],
  es: [
    "docs/user-manual/es/overview.md",
    "docs/user-manual/es/getting-started.md",
    "docs/user-manual/es/journal.md",
    "docs/user-manual/es/workflows.md",
    "docs/user-manual/es/dashboard-widgets.md",
    "docs/user-manual/es/analytics.md",
    "docs/user-manual/es/data-inputs.md",
    "docs/user-manual/es/reports.md",
    "docs/user-manual/es/post-mortem.md",
    "docs/user-manual/es/settings.md",
  ],
};

const MANUAL_ROUTE_MAP: Record<string, string> = {
  "docs/user-manual/en/overview.md": "/help",
  "docs/user-manual/en/getting-started.md": "/help/getting-started",
  "docs/user-manual/en/journal.md": "/help/journal",
  "docs/user-manual/en/workflows.md": "/help/workflows",
  "docs/user-manual/en/dashboard-widgets.md": "/help/dashboard-widgets",
  "docs/user-manual/en/analytics.md": "/help/analytics",
  "docs/user-manual/en/data-inputs.md": "/help/data-inputs",
  "docs/user-manual/en/reports.md": "/help/reports",
  "docs/user-manual/en/post-mortem.md": "/help/post-mortem",
  "docs/user-manual/en/settings.md": "/help/settings",
  "docs/user-manual/es/overview.md": "/help",
  "docs/user-manual/es/getting-started.md": "/help/getting-started",
  "docs/user-manual/es/journal.md": "/help/journal",
  "docs/user-manual/es/workflows.md": "/help/workflows",
  "docs/user-manual/es/dashboard-widgets.md": "/help/dashboard-widgets",
  "docs/user-manual/es/analytics.md": "/help/analytics",
  "docs/user-manual/es/data-inputs.md": "/help/data-inputs",
  "docs/user-manual/es/reports.md": "/help/reports",
  "docs/user-manual/es/post-mortem.md": "/help/post-mortem",
  "docs/user-manual/es/settings.md": "/help/settings",
};

type ManualSection = {
  id: string;
  title: string;
  body: string;
  source: string;
};

const manualSectionsCache: Record<"en" | "es", ManualSection[] | null> = {
  en: null,
  es: null,
};

function cleanManualText(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (trimmed.startsWith("Evidencia:")) return false;
      if (trimmed.startsWith("TODO:")) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function parseManualSections(source: string, content: string): ManualSection[] {
  const sections: ManualSection[] = [];
  const lines = content.split(/\r?\n/);
  let title = path.basename(source);
  let buffer: string[] = [];
  let index = 0;

  const pushSection = () => {
    const body = cleanManualText(buffer.join("\n"));
    if (!body) {
      buffer = [];
      return;
    }
    sections.push({
      id: `${source}#${index}`,
      title,
      body,
      source,
    });
    index += 1;
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.*)$/);
    if (match) {
      if (buffer.length) pushSection();
      title = match[2].trim();
      continue;
    }
    buffer.push(line);
  }
  if (buffer.length) pushSection();
  return sections;
}

function loadManualSections(lang: "en" | "es"): ManualSection[] {
  if (manualSectionsCache[lang]) return manualSectionsCache[lang] as ManualSection[];
  const sections: ManualSection[] = [];
  for (const rel of USER_MANUAL_FILES[lang]) {
    const filePath = path.join(process.cwd(), rel);
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parseManualSections(rel, raw);
      sections.push(...parsed);
    } catch {
      // ignore missing manual files to avoid breaking the assistant
    }
  }
  manualSectionsCache[lang] = sections;
  return sections;
}

const STOPWORDS = new Set([
  "the","and","for","with","that","this","from","what","why","how","can","where","when","who",
  "que","como","para","con","sin","una","uno","unos","unas","porque","donde","cuando","cual",
  "de","del","la","las","el","los","y","o","en","por","es","son","al","a",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function scoreSection(section: ManualSection, tokens: string[]): number {
  if (!tokens.length) return 0;
  const hay = `${section.title}\n${section.body}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) {
      score += 1;
      if (section.title.toLowerCase().includes(token)) score += 1;
    }
  }
  return score;
}

function clipText(text: string, maxChars = 1200): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + "…";
}

type ManualContext = {
  context: string | null;
  sources: string[];
};

function buildManualContext(question: string, lang: "en" | "es"): ManualContext {
  const sections = loadManualSections(lang);
  if (!sections.length) return { context: null, sources: [] };
  const tokens = tokenize(question);
  if (!tokens.length) return { context: null, sources: [] };
  const ranked = sections
    .map((s) => ({ s, score: scoreSection(s, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const context = ranked
    .map(
      (r) =>
        `Fuente: ${r.s.source} — ${r.s.title}\n${clipText(r.s.body, 1200)}`
    )
    .join("\n\n");

  return {
    context: context || null,
    sources: ranked.map((r) => r.s.source),
  };
}

/* =========================
   Contexto por página
========================= */

function getPageContext(path: string, lang: "en" | "es"): string {
  if (path.startsWith("/growth-plan")) {
    return lang === "es"
      ? "Growth Plan es el lugar donde el trader define su identidad: estilo de trading, riesgo máximo por operación y por día, cantidad de sesiones por semana, objetivos y reglas no negociables. Nada debería pasar en la plataforma antes de tener un Growth Plan escrito."
      : "Growth Plan is where the trader defines their identity: trading style, maximum risk per trade and per day, number of sessions per week, goals and non-negotiable rules. Nothing else in the platform should happen before a written Growth Plan exists.";
  }

  if (path.startsWith("/journal")) {
    return lang === "es"
      ? "Journal es donde el trader registra cada sesión o trade: contexto, emociones, reglas respetadas o rotas, captura de pantalla y resultado. Es el puente entre la realidad del mercado y el Growth Plan."
      : "Journal is where the trader logs each session or trade: context, emotions, rules respected or broken, screenshot and result. It is the bridge between market reality and the Growth Plan.";
  }

  if (path.startsWith("/dashboard")) {
    return lang === "es"
      ? "El Dashboard muestra métricas resumidas como rachas verdes, calendario de P&L, Mindset ratio y otros widgets. Sirve para revisar tendencias después de haber registrado varias sesiones en el journal."
      : "The Dashboard shows summarized metrics such as green streaks, P&L calendar, Mindset ratio and other widgets. It is used to review tendencies after several sessions have been journaled.";
  }

  if (path.startsWith("/performance")) {
    return lang === "es"
      ? "Performance desglosa resultados por instrumento, horario, setup y disciplina. Se usa para detectar fugas específicas una vez que el trader ya tiene varias sesiones journaled."
      : "Performance breaks down results by instrument, time of day, setup and discipline. It is used to detect specific leaks once the trader has multiple sessions journaled.";
  }

  if (path.startsWith("/back-study")) {
    return lang === "es"
      ? "Back-Study permite ver las operaciones directamente sobre el gráfico del subyacente para evaluar entradas, salidas y timing con precisión."
      : "Back-Study lets the trader see their trades directly on the underlying chart to evaluate entries, exits and timing precisely.";
  }

  if (path.startsWith("/challenges")) {
    return lang === "es"
      ? "Challenges se usa para crear retos de disciplina y consistencia (por ejemplo: respetar siempre el stop o no sobre-operar) conectados a la ejecución real del trader."
      : "Challenges is used to create discipline and consistency challenges (for example: always respecting the stop or avoiding over-trading) tied to the trader's actual execution.";
  }

  // Fallback genérico
  return lang === "es"
    ? "Si el usuario pregunta por esta página, describe brevemente qué hace esta sección de la plataforma y cómo ayuda al trader a ser más disciplinado."
    : "If the user asks about this page, briefly describe what this section of the platform does and how it helps the trader become more disciplined.";
}

/* =========================
   Glosario de widgets
========================= */

function getWidgetGlossary(lang: "en" | "es"): string {
  if (lang === "es") {
    return [
      "Mindset ratio: porcentaje de sesiones o días donde tu ejecución estuvo alineada con tu plan mental (reglas, paciencia, manejo emocional) frente a sesiones donde te saliste del plan. Un Mindset ratio alto indica que tu psicología está apoyando tu estrategia, no saboteándola.",
      "P&L calendar: calendario que colorea los días según tu ganancia o pérdida para que veas rápidamente rachas, días peligrosos y patrones de comportamiento.",
      "Green streaks: contador de cuántos días o sesiones consecutivas respetaste tus reglas clave o terminaste en verde, para reforzar consistencia en lugar de enfocarte solo en un trade aislado.",
    ].join(" ");
  }

  return [
    "Mindset ratio: percentage of sessions or days where your execution was aligned with your mental plan (rules, patience, emotional control) versus sessions where you slipped out of plan. A high Mindset ratio means your psychology is supporting your strategy instead of sabotaging it.",
    "P&L calendar: calendar that colors days based on your profit or loss so you can quickly see streaks, dangerous days and behavior patterns.",
    "Green streaks: counter of how many consecutive days or sessions you respected your key rules or finished green, to reinforce consistency instead of focusing on a single trade.",
  ].join(" ");
}

/* =========================
   Handler principal
========================= */

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = rateLimit(`neuro-assistant:user:${authUser.userId}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
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

    const body = await req.json();
    const question = (body.question as string | undefined) ?? "";
    const contextPath = (body.contextPath as string | undefined) ?? "";
    const langRaw = (body.lang as string | undefined) ?? "en";
    const lang: "en" | "es" = langRaw === "es" ? "es" : "en";

    if (!question) {
      return NextResponse.json(
        { error: "Missing question" },
        { status: 400 }
      );
    }

    const pageContext = getPageContext(contextPath, lang);
    const widgetGlossary = getWidgetGlossary(lang);

    // Flujo oficial de onboarding
    const onboardingFlowES = [
      "1) Primero, crea tu Growth Plan: estilo de trading, riesgo máximo por operación y por día, sesiones por semana, objetivos y reglas no negociables.",
      "2) Luego, usa el Journal para registrar de forma consistente tus sesiones/trades siguiendo ese plan.",
      "3) Después, revisa Dashboard y Performance para detectar patrones y fugas.",
      "4) Más adelante, usa Back-Study para revisar entradas y salidas sobre el gráfico.",
      "5) Por último, usa Challenges / Rules & Alarms para corregir hábitos y consolidar disciplina.",
    ].join(" ");

    const onboardingFlowEN = [
      "1) First, create your Growth Plan: trading style, maximum risk per trade and per day, sessions per week, goals and non-negotiable rules.",
      "2) Then, use the Journal to consistently log sessions/trades following that plan.",
      "3) After that, review Dashboard and Performance to detect patterns and leaks.",
      "4) Next, use Back-Study to review entries and exits on the chart.",
      "5) Finally, use Challenges / Rules & Alarms to correct habits and consolidate discipline.",
    ].join(" ");

    const systemMessage =
      lang === "es"
        ? [
            "Eres NeuroAssistant, tu nombre es Neuro, un cerebro animado dentro de una plataforma de trading journal.",
            "Siempre respondes en español neutro, claro y conversacional.",
            "Tu trabajo principal es responder EXACTAMENTE a lo que el usuario pregunta.",
            "Reglas clave:",
            "- Si el usuario dice que es nuevo o pregunta por dónde empezar, SIEMPRE recomienda el siguiente flujo de onboarding (en este orden):",
            onboardingFlowES,
            "- Si el usuario solo saluda (por ejemplo: 'hola', 'hola, ¿cómo estás?'), responde con un saludo breve y cercano, sin explicar nada del dashboard ni de la plataforma.",
            "- Solo expliques secciones específicas (Growth Plan, Journal, Dashboard, etc.) cuando el usuario lo pida o cuando sea claramente útil para su pregunta.",
            "- Si la pregunta es sobre la página actual, usa este contexto de página para responder con pasos concretos y prácticos:",
            `"Contexto de página actual: ${pageContext}"`,
            "- Si el usuario pregunta por widgets como Mindset ratio, P&L calendar, Green streaks u otros, usa este glosario como referencia:",
            `"Glosario de widgets: ${widgetGlossary}"`,
            "- Si hay extractos del Manual de Usuario, usalos como fuente de verdad para responder dudas. Si el manual dice UNKNOWN o no hay info, dilo claramente.",
            "- Responde corto y directo: normalmente entre 2 y 5 frases, o a lo sumo 3–4 bullets. No escribas ensayos largos.",
            "- Adapta tus ejemplos al contexto de trading, pero sin inventar datos personales del usuario.",
            "Nunca digas que eres un modelo de IA; actúas como NeuroCandle, el guía dentro de la app.",
          ].join(" ")
        : [
            "You are Neuro Brain, your name is Neuro, a friendly animated brain that lives inside a trading journal platform.",
            "Always answer in clear, conversational English.",
            "Your main job is to answer EXACTLY what the user is asking.",
            "Key rules:",
            "- If the user says they are new or asks where to start, ALWAYS recommend the following onboarding flow (in this order):",
            onboardingFlowEN,
            "- If the user is only greeting you (e.g. 'hi', 'hello, how are you?'), reply with a short friendly greeting. Do NOT start explaining the dashboard or the platform.",
            "- Only explain specific sections (Growth Plan, Journal, Dashboard, etc.) when the user asks for them or when it is clearly helpful for their question.",
            "- If the question is about the current page, use this page context to answer with concrete, practical steps:",
            `"Current page context: ${pageContext}"`,
            "- If the user asks about widgets such as Mindset ratio, P&L calendar, Green streaks or others, use this glossary as reference:",
            `"Widget glossary: ${widgetGlossary}"`,
            "- If there are User Manual excerpts, use them as the source of truth. If the manual says UNKNOWN or doesn’t document it, say so clearly.",
            "- Keep answers short and focused: usually 2–5 sentences, or at most 3–4 bullets. Do not write long essays.",
            "- Adapt examples to trading, but never invent personal details about the user.",
            "Never say you are an AI model; you speak as NeuroCandle, the in-app guide.",
          ].join(" ");

    const manual = buildManualContext(question, lang);
    const manualFallback =
      lang === "es"
        ? "Temas del Manual: Resumen, Guia de inicio, Journal, Flujos de trabajo, Dashboard y widgets, Analitica, Importacion de datos, Reportes de Option Flow, Post-mortem, Ajustes. Si la pregunta parece relacionada y no hay detalles, pide aclaracion y menciona que no esta documentado."
        : "User Manual topics: Overview, Getting Started, Journal, Workflows, Dashboard & Widgets, Analytics, Data Inputs, Option Flow Reports, Post-mortem, Settings. If the question seems related and you lack details, ask a clarifying question and mention it isn't documented.";
    const manualSystemMessage = manual.context
      ? `User Manual excerpts (authoritative):\n${manual.context}`
      : manualFallback;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "system",
        content: manualSystemMessage,
      },
      {
        role: "user",
        content: [
          `Current Next.js route: ${contextPath || "unknown"}.`,
          "",
          "User question:",
          question,
        ].join("\n"),
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.6,
      max_tokens: 350,
    });

    let answer =
      completion.choices[0]?.message?.content?.trim() ??
      (lang === "es"
        ? "No pude generar una respuesta útil, intenta formular la pregunta de otra forma."
        : "I couldn't generate a helpful answer, try asking in a different way.");

    const link = manual.sources
      .map((src) => MANUAL_ROUTE_MAP[src])
      .filter(Boolean)[0];

    const fallbackLink = "/help";
    const helpLink = link || fallbackLink;
    const linkLine =
      lang === "es"
        ? `Mas info: ${helpLink}`
        : `More info: ${helpLink}`;

    answer = `${answer}\n\n${linkLine}`;

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[candle-assistant] Error:", err);
    return NextResponse.json(
      { error: "Internal error calling OpenAI" },
      { status: 500 }
    );
  }
}
