import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 30;

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
            "- Keep answers short and focused: usually 2–5 sentences, or at most 3–4 bullets. Do not write long essays.",
            "- Adapt examples to trading, but never invent personal details about the user.",
            "Never say you are an AI model; you speak as NeuroCandle, the in-app guide.",
          ].join(" ");

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemMessage,
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

    const answer =
      completion.choices[0]?.message?.content?.trim() ??
      (lang === "es"
        ? "No pude generar una respuesta útil, intenta formular la pregunta de otra forma."
        : "I couldn't generate a helpful answer, try asking in a different way.");

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[candle-assistant] Error:", err);
    return NextResponse.json(
      { error: "Internal error calling OpenAI" },
      { status: 500 }
    );
  }
}
