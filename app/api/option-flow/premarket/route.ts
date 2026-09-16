import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getOptionFlowBetaApiPayload, resolveOptionFlowLang } from "@/lib/optionFlowBeta";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { isSmartToolsOwner } from "@/lib/smartToolsAccess";
import { recordAiUsage, requireAiBudget } from "@/lib/aiUsageServer";
import { GPT_6_ASTRA_MODEL, openAiChatTuning } from "@/lib/openAiModelConfig";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENAI_OPTIONFLOW_MODEL || GPT_6_ASTRA_MODEL;
const BYPASS_ENTITLEMENT =
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "").toLowerCase() === "true" ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "") === "1";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;
    const requestLang = resolveOptionFlowLang(req.headers.get("accept-language"));

    if (!BYPASS_ENTITLEMENT) {
      const hasEnt = await isSmartToolsOwner({ userId, email: authData.user.email ?? null });
      if (!hasEnt) {
        return NextResponse.json(getOptionFlowBetaApiPayload(requestLang), { status: 403 });
      }
    }

    const limiter = await rateLimit(`optionflow-premarket:${userId}:${getClientIp(req)}`, {
      limit: 8,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json();
    const {
      summary,
      keyTrades,
      underlying,
      previousClose,
      uploadId,
      notes,
      tradeIntent,
      sourceSessionDate,
      lateSessionTape,
      lateSessionRead,
      language,
    } = body as {
      summary?: string;
      keyTrades?: any[];
      underlying?: string;
      previousClose?: number;
      uploadId?: string | null;
      notes?: string | null;
      tradeIntent?: string | null;
      sourceSessionDate?: string | null;
      lateSessionTape?: Record<string, unknown> | null;
      lateSessionRead?: Record<string, unknown> | null;
      language?: string;
    };
    const safeSummary = String(summary ?? "").slice(0, 4000);
    const safeNotes = String(notes ?? "").slice(0, 2000);
    const safeKeyTrades = Array.isArray(keyTrades) ? keyTrades.slice(0, 12) : [];

    const lang = String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    const systemPrompt =
      lang === "es"
        ? `
Eres un estratega profesional de opciones preparando un plan de ataque premarket.
El plan debe responder cómo los flows de AYER entre 1:30 PM y 4:15 PM ET pueden desarrollarse HOY.
Usa lateSessionTape y lateSessionRead para separar: (1) movimiento ya completado antes de 3:00, (2) cambio de régimen, y (3) señal de 3:30-4:15 que quedó abierta al cierre.
Da mayor peso a los contratos tardíos. Cita contrato, hora y precio de entrada. Define qué confirmaría continuación hoy, a qué hora o ventana debe vigilarse y qué invalida la lectura.
No conviertas un BID en una compra. ASK indica comprador agresivo; BID indica vendedor agresivo, sin probar apertura o cierre.
Usa el resumen, la intención y los key trades para completar niveles, liquidez y riesgo.
Devuelve HTML que se pueda colocar en el widget de "Premarket Prep".
Mantén estructura con headings y bullets.
`
        : `
You are a professional options strategist preparing a premarket attack plan.
The plan must explain how YESTERDAY'S 1:30 PM-4:15 PM ET flows may develop TODAY.
Use lateSessionTape and lateSessionRead to separate: (1) a move completed before 3:00, (2) the regime shift, and (3) the 3:30-4:15 signal carried into the close.
Give late contracts the greatest weight. Name contract, time, and entry price. State what confirms continuation today, the time/window to monitor, and what invalidates the read.
Never describe a BID print as a purchase. ASK identifies an aggressive buyer and BID an aggressive seller, without proving opening or closing.
Use the summary, trade intent, and key trades to complete levels, liquidity, and risk.
Return HTML that can be placed in the "Premarket Prep" journal widget.
Keep it structured with headings and bullet points.
`;
    const finalPrompt = systemPrompt.trim();

    const userPayload = {
      underlying,
      previousClose,
      summary: safeSummary,
      keyTrades: safeKeyTrades,
      notes: safeNotes,
      tradeIntent,
      sourceSessionDate,
      lateSessionTape,
      lateSessionRead,
    };

    const budgetGate = await requireAiBudget({ userId, category: "market_intelligence" });
    if (budgetGate) return budgetGate;

    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: finalPrompt },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ],
      ...openAiChatTuning(DEFAULT_MODEL, 0.3),
    });

    const planHtml = completion.choices[0]?.message?.content ?? "";

    await recordAiUsage({
      userId,
      requestId: req.headers.get("x-request-id"),
      feature: "option_flow",
      category: "market_intelligence",
      operation: "premarket_plan",
      model: completion.model || DEFAULT_MODEL,
      usage: completion.usage,
    });

    if (uploadId) {
      try {
        await supabaseAdmin
          .from("option_flow_uploads")
          .update({
            premarket_plan: planHtml,
            updated_at: new Date().toISOString(),
          })
          .eq("id", uploadId)
          .eq("user_id", userId);
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ planHtml });
  } catch (err: any) {
    console.error("[option-flow/premarket] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
