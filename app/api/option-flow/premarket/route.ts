import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getOptionFlowBetaApiPayload, resolveOptionFlowLang } from "@/lib/optionFlowBeta";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { isSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENAI_OPTIONFLOW_MODEL || "gpt-4.1";
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
      language,
    } = body as {
      summary?: string;
      keyTrades?: any[];
      underlying?: string;
      previousClose?: number;
      uploadId?: string | null;
      notes?: string | null;
      tradeIntent?: string | null;
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
Usa el resumen de flujo, la intención y los key trades para definir sesgo, niveles clave, zonas de liquidez y plan de riesgo.
Devuelve HTML que se pueda colocar en el widget de "Premarket Prep".
Mantén estructura con headings y bullets.
`
        : `
You are a professional options strategist preparing a premarket attack plan.
Use the flow summary, trade intent, and key trades to define bias, key levels, liquidity zones, and risk plan.
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
    };

    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: finalPrompt },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ],
      temperature: 0.3,
    });

    const planHtml = completion.choices[0]?.message?.content ?? "";

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
