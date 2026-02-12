import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getAuthUser } from "@/lib/authServer";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = process.env.OPENAI_OPTIONFLOW_CHAT_MODEL || process.env.OPENAI_OPTIONFLOW_MODEL || "gpt-4.1";

const ENTITLEMENT_KEY = "option_flow";
const PAYWALL_ENABLED =
  String(process.env.OPTIONFLOW_PAYWALL_ENABLED ?? "").toLowerCase() === "true";
const BYPASS_ENTITLEMENT =
  !PAYWALL_ENABLED ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "").toLowerCase() === "true" ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "") === "1";

async function requireEntitlement(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("status")
    .eq("user_id", userId)
    .eq("entitlement_key", ENTITLEMENT_KEY)
    .in("status", ["active", "trialing"])
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

function safeRows(rows: any[], limit = 160) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, Math.max(1, limit));
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BYPASS_ENTITLEMENT) {
    const hasEnt = await requireEntitlement(auth.userId);
    if (!hasEnt) {
      return NextResponse.json({ error: "Entitlement required" }, { status: 403 });
    }
  }

  const ip = getClientIp(req);
  const limiter = rateLimit(`optionflow-chat:${auth.userId || ip}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(limiter) }
    );
  }

  try {
    const body = await req.json();
    const message = String(body?.message || "").trim();
    const analysis = body?.analysis ?? null;
    const rows = safeRows(body?.rows ?? [], 120);
    const chatHistory = Array.isArray(body?.chatHistory)
      ? body.chatHistory.slice(-6).map((item: any) => ({
          role: String(item?.role || ""),
          text: String(item?.text || ""),
        }))
      : [];

    const lang = String(body?.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    const isEs = lang === "es";

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    if (!analysis) {
      return NextResponse.json(
        { error: isEs ? "No hay análisis cargado." : "No analysis loaded." },
        { status: 400 }
      );
    }

    const wantsSingleLevel =
      /nivel(es)?\s+mas\s+importante|nivel\s+clave|most\s+important\s+level|key\s+level/i.test(
        message
      );
    const wantsYesNo = /\b(s[ií]|si|no)\b/.test(message.toLowerCase()) && /[?¿]/.test(message);
    const isShortQuestion = message.length <= 140;
    const brevityRule = wantsSingleLevel || isShortQuestion;

    const extraGuidance = isEs
      ? [
          brevityRule
            ? "Sé muy breve (1-3 líneas)."
            : "Sé claro y directo.",
          wantsSingleLevel
            ? "Si preguntan por el nivel más importante, responde SOLO con un nivel y 1 razón corta."
            : "",
          wantsYesNo
            ? "Si la pregunta es sí/no, responde solo con Sí/No/No hay data suficiente + 1 línea."
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          brevityRule ? "Be very brief (1-3 lines)." : "Be clear and direct.",
          wantsSingleLevel
            ? "If asked for the most important level, respond with ONLY one level and 1 short reason."
            : "",
          wantsYesNo
            ? "If it's a yes/no question, answer only Yes/No/Insufficient data + 1 line."
            : "",
        ]
          .filter(Boolean)
          .join("\n");

    const systemPrompt = isEs
      ? `
Eres un analista institucional de options flow. Responde con claridad, directo y objetivo.
Reglas críticas:
- Usa SOLO la data proporcionada (analysis, rows, chatHistory). No inventes nada.
- No seas complaciente ni le digas al usuario lo que quiere escuchar. Si la data no soporta algo, dilo.
- Si faltan datos (ej. BID/ASK, OI, filas), dilo explícitamente y pide lo mínimo necesario.
- Si analysis.dataQuality.isStale es true, indica que la data es vieja (-1DTE o anterior).
- Si te piden una decisión ("¿sí o no?"), responde "Sí", "No" o "No hay data suficiente", y explica en 1-2 líneas.
- Siempre distingue calls vs puts y BID vs ASK cuando menciones strikes o contratos.
- No des recomendaciones financieras; solo lectura de flujo y riesgos con base en data.
Responde en español.
${extraGuidance}
`
      : `
You are an institutional options flow analyst. Be clear, direct, and objective.
Critical rules:
- Use ONLY the provided data (analysis, rows, chatHistory). Do not invent anything.
- Do not be agreeable or tell the user what they want to hear. If the data doesn't support it, say so.
- If data is missing (e.g., BID/ASK, OI, rows), state it explicitly and ask for the minimum needed.
- If analysis.dataQuality.isStale is true, say the data is old (-1DTE or earlier).
- If asked for a decision ("yes or no?"), answer "Yes", "No", or "Insufficient data" and explain in 1-2 lines.
- Always distinguish calls vs puts and BID vs ASK when referencing strikes/contracts.
- Do not give financial advice; provide flow read and risks only, based on data.
Respond in English.
${extraGuidance}
`;

    const payload = {
      question: message,
      analysis,
      rowSample: rows,
      chatHistory,
    };

    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt.trim() },
        { role: "user", content: JSON.stringify(payload, null, 2) },
      ],
      temperature: 0.2,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json(
      { reply },
      { status: 200, headers: rateLimitHeaders(limiter) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500, headers: rateLimitHeaders(limiter) }
    );
  }
}
