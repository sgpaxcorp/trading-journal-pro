import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Lang = "en" | "es";

type NeuroEventType =
  | "import_success"
  | "import_error"
  | "sync_success"
  | "sync_error"
  | "pnl_profit"
  | "pnl_loss"
  | "pnl_flat";

type NeuroEventPayload = {
  filename?: string;
  importedCount?: number;
  syncedCount?: number;
  symbol?: string;
  pnl?: number;
  currency?: string;
  timeframe?: string;
  notes?: string;
};

function clampText(s: unknown, max = 240) {
  const t = (s ?? "").toString();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function buildSystem(lang: Lang) {
  if (lang === "es") {
    return [
      "Eres Neuro: el asistente del Neurofisiológico Trader Journal.",
      "Tu tarea aquí es reaccionar a eventos del usuario (import, sync, P&L) con micro-mensajes.",
      "Estilo: 1–2 frases (ideal <= 220 caracteres). Tono: cálido, motivador, profesional.",
      "Reglas:",
      "- Ganancia: celebra PROCESO + disciplina (sin euforia).",
      "- Pérdida: refuerza aprendizaje + manejo de riesgo (sin juzgar).",
      "- Nunca prometas resultados futuros.",
      "- Máximo 1 emoji.",
      "- No inventes datos: usa solo el payload.",
      "Devuelve SOLO el texto final, sin comillas, sin JSON."
    ].join(" ");
  }

  return [
    "You are Neuro: the assistant of the Neurofisiológico Trader Journal.",
    "React to user events (import, sync, P&L) with micro-messages.",
    "Style: 1–2 sentences (ideally <=220 chars). Warm, motivating, professional.",
    "Rules: profit = celebrate process; loss = learning + risk mgmt; no promises; max 1 emoji; use only payload.",
    "Return ONLY final text, no quotes, no JSON."
  ].join(" ");
}

function buildUserPrompt(
  lang: Lang,
  type: NeuroEventType,
  payload: NeuroEventPayload,
  contextPath?: string
) {
  const p = {
    filename: clampText(payload.filename, 80),
    importedCount: payload.importedCount,
    syncedCount: payload.syncedCount,
    symbol: clampText(payload.symbol, 24),
    pnl: payload.pnl,
    currency: clampText(payload.currency ?? "USD", 6),
    timeframe: clampText(payload.timeframe, 24),
    notes: clampText(payload.notes, 120),
  };

  if (lang === "es") {
    return [
      `Ruta actual: ${contextPath || "unknown"}`,
      `Evento: ${type}`,
      `Payload: ${JSON.stringify(p)}`,
      "Genera un micro-mensaje útil para el usuario basado en el evento."
    ].join("\n");
  }

  return [
    `Current route: ${contextPath || "unknown"}`,
    `Event: ${type}`,
    `Payload: ${JSON.stringify(p)}`,
    "Generate a helpful micro-message based on the event."
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const type = (body.type as NeuroEventType | undefined) ?? null;
    const payload = (body.payload as NeuroEventPayload | undefined) ?? {};
    const contextPath = (body.contextPath as string | undefined) ?? "";
    const langRaw = (body.lang as string | undefined) ?? "en";
    const lang: Lang = langRaw === "es" ? "es" : "en";

    if (!type) {
      return NextResponse.json({ error: "Missing type" }, { status: 400 });
    }

    const system = buildSystem(lang);
    const user = buildUserPrompt(lang, type, payload, contextPath);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 120,
    });

    const text = completion.choices[0]?.message?.content?.trim() || "";
    return NextResponse.json({
      text: text || (lang === "es" ? "Listo ✅" : "Done ✅"),
    });
  } catch (err) {
    console.error("[neuro-event] Error:", err);
    return NextResponse.json(
      { error: "Internal error calling OpenAI" },
      { status: 500 }
    );
  }
}
