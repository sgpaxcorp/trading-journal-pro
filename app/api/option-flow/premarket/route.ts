import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENAI_OPTIONFLOW_MODEL || "gpt-4.1";
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
    if (!BYPASS_ENTITLEMENT) {
      const hasEnt = await requireEntitlement(userId);
      if (!hasEnt) {
        return NextResponse.json({ error: "Entitlement required" }, { status: 403 });
      }
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
    } = body as {
      summary?: string;
      keyTrades?: any[];
      underlying?: string;
      previousClose?: number;
      uploadId?: string | null;
      notes?: string | null;
      tradeIntent?: string | null;
    };

    const systemPrompt = `
You are a professional options strategist preparing a premarket attack plan.
Use the options flow summary, trade intent, and key trades to define bias, key levels, expected liquidity zones, and risk plan.
Return HTML that can be placed into a "Premarket Prep" journal widget.
Keep it structured with headings and bullet points.
`.trim();

    const userPayload = {
      underlying,
      previousClose,
      summary,
      keyTrades,
      notes,
      tradeIntent,
    };

    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
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
