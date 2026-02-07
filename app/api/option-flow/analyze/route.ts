import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENAI_OPTIONFLOW_MODEL || "gpt-4.1";
const VISION_MODEL = process.env.OPENAI_OPTIONFLOW_VISION_MODEL || "gpt-4o";
const ENTITLEMENT_KEY = "option_flow";
const PAYWALL_ENABLED =
  String(process.env.OPTIONFLOW_PAYWALL_ENABLED ?? "").toLowerCase() === "true";
const BYPASS_ENTITLEMENT =
  !PAYWALL_ENABLED ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "").toLowerCase() === "true" ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "") === "1";

function parsePremiumToNumber(raw?: string | number | null): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = raw.toString().replace(/[,$~\s]/g, "").toUpperCase();
  const match = cleaned.match(/([0-9.]+)([KMB])?/);
  if (!match) return 0;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return 0;
  const mult =
    match[2] === "B" ? 1_000_000_000 : match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return num * mult;
}

function formatPremium(num: number): string {
  if (!Number.isFinite(num)) return "";
  if (num >= 1_000_000_000) return `~${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `~${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `~${(num / 1_000).toFixed(1)}K`;
  return `~${num.toFixed(0)}`;
}

function normalizeSide(raw?: string | null): "ASK" | "BID" | "MIXED" | "UNKNOWN" {
  if (!raw) return "UNKNOWN";
  const upper = raw.toUpperCase();
  if (upper.includes("ASK")) return "ASK";
  if (upper.includes("BID")) return "BID";
  if (upper.includes("MID") || upper.includes("MIX")) return "MIXED";
  return "UNKNOWN";
}

function aggregateExpirations(expirations: any[]): any[] {
  if (!Array.isArray(expirations)) return [];
  return expirations.map((exp) => {
    const strikes = Array.isArray(exp?.strikes) ? exp.strikes : [];
    const map = new Map<string, any>();
    strikes.forEach((row: any) => {
      const strike = Number(row?.strike);
      if (!Number.isFinite(strike)) return;
      const type = typeof row?.type === "string" ? row.type.toUpperCase() : "";
      const side = normalizeSide(row?.side || row?.read);
      const key = `${strike}|${type}|${side}`;
      const existing = map.get(key) ?? {
        strike,
        type,
        side,
        prints: 0,
        sizeTotal: 0,
        premiumTotal: 0,
        oiMax: 0,
        read: row?.read ?? row?.side ?? "",
      };
      const prints = Number(row?.prints);
      const size = Number(row?.sizeTotal);
      existing.prints += Number.isFinite(prints) ? prints : 0;
      existing.sizeTotal += Number.isFinite(size) ? size : 0;
      existing.premiumTotal += parsePremiumToNumber(row?.premiumTotal);
      const oi = Number(row?.oiMax);
      if (Number.isFinite(oi)) existing.oiMax = Math.max(existing.oiMax, oi);
      map.set(key, existing);
    });
    const aggregated = Array.from(map.values()).map((row) => ({
      ...row,
      premiumTotal: formatPremium(row.premiumTotal),
    }));
    return { ...exp, strikes: aggregated };
  });
}

function deriveKeyLevelsFromExpirations(expirations: any[], lang: "en" | "es" = "en"): any[] {
  const isEs = lang === "es";
  const rows = expirations.flatMap((exp) => exp?.strikes ?? []);
  if (!rows.length) return [];
  const scored = rows
    .map((row: any) => {
      const premium = parsePremiumToNumber(row?.premiumTotal);
      const size = Number(row?.sizeTotal);
      const prints = Number(row?.prints);
      const score = premium + (Number.isFinite(size) ? size * 100 : 0) + (Number.isFinite(prints) ? prints * 10 : 0);
      return { row, score };
    })
    .filter((item) => Number.isFinite(item.row?.strike))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ row }) => {
      const side = normalizeSide(row?.side || row?.read);
      const type = (row?.type || "").toUpperCase();
      let label = "pivot";
      if (side === "ASK" && type === "C") label = "demand";
      else if (side === "ASK" && type === "P") label = "put demand";
      else if (side === "BID" && type === "P") label = "put wall";
      else if (side === "BID" && type === "C") label = "call supply";
      return {
        price: Number(row.strike),
        label,
        side,
        reason: isEs
          ? "Acumulación de prints en el strike."
          : "Concentrated prints at the strike.",
      };
    });
  return scored;
}

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

function safeRows(rows: any[], limit = 200) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, Math.max(1, limit));
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
    const email = authData.user.email ?? null;

    if (!BYPASS_ENTITLEMENT) {
      const hasEnt = await requireEntitlement(userId);
      if (!hasEnt) {
        return NextResponse.json({ error: "Entitlement required" }, { status: 403 });
      }
    }

    const body = await req.json();
    const {
      provider,
      underlying,
      previousClose,
      tradeIntent,
      rows,
      screenshotDataUrls,
      analystNotes,
      language,
    } = body as {
      provider?: string;
      underlying?: string;
      previousClose?: number;
      tradeIntent?: string;
      rows?: any[];
      screenshotDataUrls?: string[];
      analystNotes?: string | null;
      language?: string;
    };

    const trimmedRows = safeRows(rows ?? [], 200);

    const lang = String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    const isEs = lang === "es";

    const systemPrompt = isEs
      ? `
Eres un trader senior de floor en Wall Street especializado en opciones (ventas de prima, gamma, coberturas).
Tu análisis debe sonar como un briefing profesional para traders institucionales: claro, directo y accionable.
Analiza los últimos prints y responde SIEMPRE en español con un tono profesional tipo report de mesa.
Organiza por expiración y prioriza strikes por premium/actividad y cercanía al spot (menciona la zona spot cuando sea posible).
Identifica niveles reales (con etiqueta pivot/supply/demand/wall/friction), contratos con más potencial y escenarios
de squeeze con condiciones claras. Evita frases genéricas; usa lecturas breves pero específicas.
Incluye una conclusión final que resuma el sesgo y el mapa de niveles en 3-5 bullets.
Si el símbolo subyacente aparece en los prints, incluye el símbolo en keyTrades[].details.symbol (ej: SPX, SPXW, NDX).
Incluye lectura de prints grandes deep ITM solo como nota (no como nivel clave) si el OI es bajo.
Si hay mezcla de prints BID/ASK, deja claro si es venta de prima o compra agresiva.
En "expirations[].strikes" incluye los strikes más relevantes (6-10 por expiración) con prints/size/premium/OI y lectura rápida.
En "keyLevels" prioriza 4-6 niveles máximos y describe por qué dominan el tape.
IMPORTANTE: Solo considera flujo agresivo cuando el print está en ASK (entradas direccionales) o BID (venta de prima).
Si está en MID/MIXED/UNKNOWN no lo clasifiques como agresivo.
Considera las notas del trader (analystNotes) y el historial reciente (recentMemory) para mejorar el análisis.
Devuelve exclusivamente JSON válido con esta forma:
{
  "summary": "resumen ejecutivo corto",
  "flowBias": "bullish | bearish | mixed | neutral",
  "expirations": [
    {
      "expiry": "YYYY-MM-DD",
      "tenor": "0DTE | 1DTE | weekly | monthly | other",
      "range": "zona spot aproximada",
      "strikes": [
        {
          "strike": 0,
          "type": "C|P",
          "prints": 0,
          "sizeTotal": 0,
          "premiumTotal": "~0",
          "oiMax": 0,
          "side": "ASK|BID|MIXED",
          "read": "lectura rápida"
        }
      ],
      "notes": "lectura por expiración",
      "keyTakeaways": ["..."]
    }
  ],
  "keyLevels": [
    { "price": 0, "label": "pivot|supply|demand|wall|friction", "side": "BID|ASK|MIXED|UNKNOWN", "reason": "por qué es clave" }
  ],
  "contractsWithPotential": {
    "gamma": ["contrato/strike + por qué"],
    "directional": ["contrato/strike + por qué"],
    "stress": ["contrato/strike + por qué"]
  },
  "squeezeScenarios": {
    "upside": {
      "condition": "condición para squeeze",
      "candidates": ["..."],
      "brakes": "freno principal"
    },
    "downside": {
      "condition": "condición para squeeze",
      "candidates": ["..."],
      "brakes": "freno principal"
    }
  },
  "tradingPlan": {
    "headline": "titular corto del plan",
    "steps": ["paso accionable 1", "paso 2", "paso 3"],
    "invalidation": "qué invalida el plan",
    "risk": "riesgos principales"
  },
  "keyTrades": [
    {
      "headline": "short title",
      "whyItMatters": "1-2 sentences",
      "details": { "symbol": "...", "strike": "...", "expiry": "...", "size": "...", "premium": "...", "side": "...", "time": "..." }
    }
  ],
  "riskNotes": ["..."],
  "suggestedFocus": ["..."]
}
`.trim()
      : `
You are a senior Wall Street floor trader specialized in options (premium selling, gamma, hedging).
Your analysis must read like a professional institutional briefing: clear, direct, and actionable.
Analyze the latest prints and ALWAYS respond in English with a professional desk-report tone.
Organize by expiration and prioritize strikes by premium/activity and proximity to spot (mention spot zone when possible).
Identify real levels (label pivot/supply/demand/wall/friction), contracts with most potential, and squeeze scenarios
with clear conditions. Avoid generic phrases; use concise, specific reads.
Include a final conclusion summarizing bias and the level map in 3-5 bullets.
If the underlying symbol appears in prints, include it in keyTrades[].details.symbol (e.g., SPX, SPXW, NDX).
Include large deep ITM prints only as a note (not a key level) if OI is low.
If prints mix BID/ASK, clarify whether it's premium selling or aggressive buying.
In "expirations[].strikes" include the most relevant strikes (6-10 per expiration) with prints/size/premium/OI and quick read.
In "keyLevels" prioritize 4-6 max levels and explain why they dominate the tape.
IMPORTANT: Only consider aggressive flow when prints are at ASK (directional entries) or BID (premium selling).
If prints are MID/MIXED/UNKNOWN, do not classify as aggressive.
Consider trader notes (analystNotes) and recent memory (recentMemory) to improve the analysis.
Return only valid JSON with this shape:
{
  "summary": "short executive summary",
  "flowBias": "bullish | bearish | mixed | neutral",
  "expirations": [
    {
      "expiry": "YYYY-MM-DD",
      "tenor": "0DTE | 1DTE | weekly | monthly | other",
      "range": "approx spot zone",
      "strikes": [
        {
          "strike": 0,
          "type": "C|P",
          "prints": 0,
          "sizeTotal": 0,
          "premiumTotal": "~0",
          "oiMax": 0,
          "side": "ASK|BID|MIXED",
          "read": "quick read"
        }
      ],
      "notes": "per-expiration read",
      "keyTakeaways": ["..."]
    }
  ],
  "keyLevels": [
    { "price": 0, "label": "pivot|supply|demand|wall|friction", "side": "BID|ASK|MIXED|UNKNOWN", "reason": "why it matters" }
  ],
  "contractsWithPotential": {
    "gamma": ["contract/strike + why"],
    "directional": ["contract/strike + why"],
    "stress": ["contract/strike + why"]
  },
  "squeezeScenarios": {
    "upside": {
      "condition": "squeeze condition",
      "candidates": ["..."],
      "brakes": "main brake"
    },
    "downside": {
      "condition": "squeeze condition",
      "candidates": ["..."],
      "brakes": "main brake"
    }
  },
  "tradingPlan": {
    "headline": "short plan headline",
    "steps": ["action step 1", "step 2", "step 3"],
    "invalidation": "what invalidates the plan",
    "risk": "key risks"
  },
  "keyTrades": [
    {
      "headline": "short title",
      "whyItMatters": "1-2 sentences",
      "details": { "symbol": "...", "strike": "...", "expiry": "...", "size": "...", "premium": "...", "side": "...", "time": "..." }
    }
  ],
  "riskNotes": ["..."],
  "suggestedFocus": ["..."]
}
`.trim();

    let recentMemory: any[] = [];
    try {
      if (underlying) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabaseAdmin
          .from("option_flow_memory")
          .select("created_at, summary, key_levels, notes, trade_intent")
          .eq("user_id", userId)
          .eq("underlying", underlying)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(6);
        if (Array.isArray(data)) {
          recentMemory = data.map((row) => ({
            date: row.created_at,
            intent: row.trade_intent,
            notes: row.notes,
            summary: row.summary,
            keyLevels: row.key_levels,
          }));
        }
      }
    } catch {
      recentMemory = [];
    }

    const userPayload = {
      provider,
      underlying,
      previousClose,
      tradeIntent,
      analystNotes,
      recentMemory,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      screenshotCount: Array.isArray(screenshotDataUrls) ? screenshotDataUrls.length : 0,
      sampleRows: trimmedRows,
    };

    const hasScreens = Array.isArray(screenshotDataUrls) && screenshotDataUrls.length > 0;
    const modelToUse = hasScreens ? VISION_MODEL : DEFAULT_MODEL;
    const userContent: any = hasScreens
      ? [
          { type: "text", text: JSON.stringify(userPayload, null, 2) },
          ...screenshotDataUrls!.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ]
      : JSON.stringify(userPayload, null, 2);

    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    const summary = parsed?.summary ?? raw;
    const keyTrades = Array.isArray(parsed?.keyTrades) ? parsed.keyTrades : [];
    const expirationsRaw = Array.isArray(parsed?.expirations) ? parsed.expirations : [];
    const expirations = aggregateExpirations(expirationsRaw);
    const contractsWithPotential =
      parsed?.contractsWithPotential && typeof parsed.contractsWithPotential === "object"
        ? parsed.contractsWithPotential
        : null;
    const squeezeScenarios =
      parsed?.squeezeScenarios && typeof parsed.squeezeScenarios === "object"
        ? parsed.squeezeScenarios
        : null;
    const tradingPlan =
      parsed?.tradingPlan && typeof parsed.tradingPlan === "object" ? parsed.tradingPlan : null;
    const keyLevelsRaw = Array.isArray(parsed?.keyLevels) ? parsed.keyLevels : [];
    let keyLevels = keyLevelsRaw
      .map((level: any) => ({
        price: Number(level?.price),
        label: typeof level?.label === "string" ? level.label : undefined,
        side: (() => {
          if (typeof level?.side === "string" && level.side.trim()) return level.side;
          const hint = `${level?.label ?? ""} ${level?.reason ?? ""}`.toUpperCase();
          if (hint.includes("BID")) return "BID";
          if (hint.includes("ASK") || hint.includes("CALL")) return "ASK";
          return undefined;
        })(),
        reason: typeof level?.reason === "string" ? level.reason : undefined,
      }))
      .filter((level: any) => Number.isFinite(level.price));
    if (!keyLevels.length && expirations.length) {
      keyLevels = deriveKeyLevelsFromExpirations(expirations, lang);
    }

    let uploadId: string | null = null;
    try {
      const { data: insert, error: insErr } = await supabaseAdmin
        .from("option_flow_memory")
        .insert({
          user_id: userId,
          provider: provider ?? null,
          underlying: underlying ?? null,
          trade_intent: tradeIntent ?? null,
          notes: analystNotes ?? null,
          summary: summary ?? null,
          key_levels: keyLevels ?? [],
          key_trades: keyTrades ?? [],
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (!insErr && insert?.id) {
        uploadId = String(insert.id);
      }
    } catch (e) {
      console.warn("[option-flow] memory insert failed:", e);
    }

    return NextResponse.json({
      summary,
      keyTrades,
      flowBias: parsed?.flowBias ?? null,
      keyLevels,
      expirations,
      contractsWithPotential,
      squeezeScenarios,
      tradingPlan,
      notablePatterns: parsed?.notablePatterns ?? [],
      riskNotes: parsed?.riskNotes ?? [],
      suggestedFocus: parsed?.suggestedFocus ?? [],
      uploadId,
    });
  } catch (err: any) {
    console.error("[option-flow/analyze] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
