import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getAuthUser } from "@/lib/authServer";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = process.env.OPENAI_OPTIONFLOW_MODEL || "gpt-4.1";
const VISION_MODEL = process.env.OPENAI_OPTIONFLOW_VISION_MODEL || "gpt-4o";

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

function decodeDataUrl(dataUrl?: string | null): { mime: string; buffer: Buffer } | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return { mime, buffer };
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
  const limiter = rateLimit(`optionflow-outcome:${auth.userId || ip}`, {
    limit: 10,
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
    const outcomeText = String(body?.outcomeText || "").trim();
    const analysis = body?.analysis ?? null;
    const chartDataUrl = body?.chartDataUrl ?? null;
    const memoryId = body?.memoryId ?? null;
    const meta = body?.meta ?? {};
    const lang = String(body?.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    const isEs = lang === "es";

    if (!outcomeText) {
      return NextResponse.json(
        { error: isEs ? "Falta describir lo que pasó." : "Missing outcome description." },
        { status: 400 }
      );
    }
    if (!analysis) {
      return NextResponse.json(
        { error: isEs ? "Falta el análisis base." : "Missing base analysis." },
        { status: 400 }
      );
    }

    let chartPath: string | null = null;
    if (chartDataUrl) {
      const decoded = decodeDataUrl(chartDataUrl);
      if (decoded?.buffer?.length) {
        const ext = decoded.mime.includes("png") ? "png" : "jpg";
        const fileName = `outcomes/${auth.userId}/${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.${ext}`;
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("option_flow_reports")
          .upload(fileName, decoded.buffer, {
            contentType: decoded.mime,
            upsert: true,
          });
        if (!uploadErr) chartPath = fileName;
      }
    }

    const systemPrompt = isEs
      ? `
Eres un analista institucional. Vas a hacer un post‑mortem objetivo del reporte vs lo que realmente pasó.
Reglas:
- No inventes nada. Si no hay datos, dilo.
- No seas complaciente. Sé directo y breve.
- Si el resultado real no estaba soportado por el flow, dilo sin rodeos.
- Menciona si la data era vieja (-1DTE) o incompleta (BID/ASK/OI faltante).
- Si la data del flow es vieja, aclara que el screenshot/outcome puede ser actual pero el reporte era histórico.
Devuelve JSON válido con esta forma:
{
  "verdict": "supports | partially_supports | does_not_support | insufficient_data",
  "whatMatched": ["..."],
  "whatMissed": ["..."],
  "missingData": ["..."],
  "improvement": "frase corta"
}
`.trim()
      : `
You are an institutional analyst. Do an objective post‑mortem of the report vs what actually happened.
Rules:
- Do not invent anything. If data is missing, say it.
- Do not be agreeable. Be direct and brief.
- If the real outcome wasn't supported by the flow, say it plainly.
- Mention if the data was stale (-1DTE) or incomplete (missing BID/ASK/OI).
- If the flow data is stale, clarify the outcome screenshot can be current but the report was historical.
Return valid JSON with this shape:
{
  "verdict": "supports | partially_supports | does_not_support | insufficient_data",
  "whatMatched": ["..."],
  "whatMissed": ["..."],
  "missingData": ["..."],
  "improvement": "short phrase"
}
`.trim();

    const payload = {
      outcomeText,
      analysis,
      meta,
    };

    const content: any =
      chartDataUrl && chartDataUrl.startsWith("data:")
        ? [
            { type: "text", text: JSON.stringify(payload, null, 2) },
            { type: "image_url", image_url: { url: chartDataUrl } },
          ]
        : JSON.stringify(payload, null, 2);

    const completion = await openai.chat.completions.create({
      model: chartDataUrl ? VISION_MODEL : DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let postMortem: any = null;
    try {
      postMortem = JSON.parse(raw);
    } catch {
      postMortem = null;
    }

    const insertPayload = {
      user_id: auth.userId,
      memory_id: memoryId ?? null,
      underlying: meta?.underlying ?? null,
      provider: meta?.provider ?? null,
      trade_intent: meta?.tradeIntent ?? null,
      report_created_at: meta?.createdAt ?? null,
      outcome_text: outcomeText,
      chart_path: chartPath,
      post_mortem: postMortem ?? {},
    };

    await supabaseAdmin.from("option_flow_outcomes").insert(insertPayload);

    return NextResponse.json(
      { postMortem, chartPath },
      { status: 200, headers: rateLimitHeaders(limiter) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500, headers: rateLimitHeaders(limiter) }
    );
  }
}
