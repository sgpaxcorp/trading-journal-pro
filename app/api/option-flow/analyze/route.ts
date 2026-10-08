import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getOptionFlowBetaApiPayload, hasOptionFlowBetaAccess, resolveOptionFlowLang } from "@/lib/optionFlowBeta";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { recordAiUsage, requireAiBudget } from "@/lib/aiUsageServer";
import {
  addCalendarDays,
  buildLateSessionTape,
  filterLateSessionFlowRows,
  flowRowSessionDate,
  flowSessionDates,
  marketDateKey,
  normalizeFlowSessionDateValue,
  optionFlowUnderlyingsMatch,
  resolveSourceSessionDate,
} from "@/lib/optionFlowLearning";
import { runOptionFlowIntelligenceAgents } from "@/lib/optionFlowAgents";
import {
  buildOccOptionSymbol,
  buildOptionFlowMarketEvidence,
  buildOptionFlowOpenInterestIntelligence,
  enforceOptionFlowThesisStatus,
  normalizeOccOptionSymbol,
  optionFlowTargetDate,
  summarizeOptionFlowEvidenceWindow,
  type OptionFlowAnalysisMode,
} from "@/lib/optionFlowIntelligence";
import {
  fetchOptionFlowDailyBars,
  type OptionFlowDailyMarketBar,
} from "@/lib/optionFlowMarketData";
import {
  optionFlowEventFingerprint,
  persistOptionFlowAnalysis,
} from "@/lib/optionFlowProfileServer";
import { GPT_6_ASTRA_MODEL, openAiChatTuning } from "@/lib/openAiModelConfig";

export const runtime = "nodejs";
export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VISION_MODEL = process.env.OPENAI_OPTIONFLOW_VISION_MODEL || GPT_6_ASTRA_MODEL;
const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_DATA_URL_CHARS = 900_000;
const MAX_SCREENSHOT_PAYLOAD_CHARS = 3_600_000;
const BYPASS_ENTITLEMENT =
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "").toLowerCase() === "true" ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "") === "1";

type DataQuality = {
  totalRows: number;
  sourceRows?: number;
  lateSessionRows?: number;
  lateSessionWindowApplied?: boolean;
  withSide: number;
  withPremium: number;
  withOi: number;
  latestExpiry?: string | null;
  latestTimestamp?: string | null;
  isStale?: boolean;
  evidencePeriodStart?: string | null;
  evidencePeriodEnd?: string | null;
  evidenceSessionCount?: number;
  rowsWithoutVerifiedDate?: number;
  priorUniqueEvents?: number;
  newUniqueRows?: number;
  repeatedRows?: number;
  exactDuplicateFile?: boolean;
  marketDataStatus?: "complete" | "partial" | "unavailable";
  marketSessionsMatched?: number;
  marketSessionsMissing?: number;
};

function parsePremiumToNumber(raw?: string | number | null): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.toString().replace(/[,$~\s]/g, "").toUpperCase();
  const match = cleaned.match(/([0-9.]+)([KMB])?/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  const mult =
    match[2] === "B" ? 1_000_000_000 : match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return num * mult;
}

function parseNumber(raw?: string | number | null): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = raw
    .toString()
    .replace(/[,$~\s]/g, "")
    .replace(/%/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatPremium(num: number | null): string {
  if (num == null || !Number.isFinite(num)) return "DATA NOT AVAILABLE";
  if (num >= 1_000_000_000) return `~${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `~${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `~${(num / 1_000).toFixed(1)}K`;
  return `~${num.toFixed(0)}`;
}

function addKnown(total: number | null, value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return total;
  return (total ?? 0) + value;
}

function maxKnown(current: number | null, value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return current;
  return current == null ? value : Math.max(current, value);
}

function sumKnown(values: Array<number | null | undefined>): number | null {
  const available = values.filter((value): value is number => value != null && Number.isFinite(value));
  return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
}

function normalizeSide(raw?: string | null): "ASK" | "BID" | "MIXED" | "UNKNOWN" {
  if (!raw) return "UNKNOWN";
  const upper = raw.toUpperCase();
  if (upper.includes("ASK")) return "ASK";
  if (upper.includes("BID")) return "BID";
  if (upper.includes("BUY") || upper.includes("BOT")) return "ASK";
  if (upper.includes("SELL") || upper.includes("SLD")) return "BID";
  if (upper.includes("MID") || upper.includes("MIX")) return "MIXED";
  return "UNKNOWN";
}

function normalizeSymbol(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || null;
}

function extractUnderlyingFromValue(raw?: string | null): string | null {
  const cleaned = normalizeSymbol(raw);
  if (!cleaned) return null;
  const occ = cleaned.match(/^([A-Z]+W?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (occ) return occ[1];
  const prefix = cleaned.match(/^([A-Z]{1,8}W?)/);
  return prefix ? prefix[1] : null;
}

function pickField(
  row: Record<string, any>,
  keys: string[],
  opts?: { exclude?: string[] }
): any {
  const entries = Object.entries(row);
  const excludes = (opts?.exclude ?? []).map((val) => val.toLowerCase());
  for (const key of keys) {
    const needle = key.toLowerCase();
    const match = entries.find(([k]) => {
      const lowered = k.toLowerCase();
      if (excludes.length && excludes.some((ex) => lowered.includes(ex))) return false;
      return lowered === needle;
    });
    if (match) return match[1];
  }
  for (const key of keys) {
    const needle = key.toLowerCase();
    const match = entries.find(([k]) => {
      const lowered = k.toLowerCase();
      if (excludes.length && excludes.some((ex) => lowered.includes(ex))) return false;
      return lowered.includes(needle);
    });
    if (match) return match[1];
  }
  return null;
}

function normalizeExpiry(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const month = match[1].padStart(2, "0");
    const day = match[2].padStart(2, "0");
    const yearRaw = match[3];
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

function toIsoTimestamp(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeTimestamp(dateRaw?: string | null, timeRaw?: string | null): string | null {
  const timeText = timeRaw != null ? String(timeRaw).trim() : "";
  const dateText = dateRaw != null ? String(dateRaw).trim() : "";
  if (!timeText && !dateText) return null;
  if (timeText && /\d{4}-\d{2}-\d{2}T/.test(timeText)) {
    const iso = toIsoTimestamp(timeText);
    if (iso) return iso;
  }
  if (dateText && timeText) {
    const combined = `${dateText} ${timeText}`;
    const iso = toIsoTimestamp(combined);
    if (iso) return iso;
  }
  if (timeText) {
    const iso = toIsoTimestamp(timeText);
    if (iso) return iso;
  }
  if (dateText) {
    const iso = toIsoTimestamp(dateText);
    if (iso) return iso;
  }
  return null;
}

function normalizeFlowRow(row: Record<string, any>) {
  const symbolRaw = pickField(row, [
    "option_chain_id",
    "option chain id",
    "option symbol",
    "symbol",
    "ticker",
    "root",
    "option",
    "contract",
  ]);
  const underlyingRaw = pickField(row, ["underlying", "underlying_symbol", "underlying symbol", "underlyingticker", "underlying ticker"]);
  const dateRaw = pickField(row, ["date", "trade date"]);
  const expiryRaw = pickField(row, ["expiry", "expiration", "expiration date", "exp"]);
  const strikeRaw = pickField(row, ["strike", "strk"]);
  const typeRaw = pickField(row, ["type", "call_put", "cp", "put_call"]);
  const sideRaw = pickField(row, [
    "side",
    "side code",
    "trade side",
    "at",
    "aggressor",
    "print",
  ]);
  const sizeRaw = pickField(row, ["size", "qty", "quantity", "volume"]);
  const volumeRaw = pickField(row, ["volume", "vol"]);
  const premiumRaw = pickField(row, ["premium", "notional", "value", "cost"]);
  const oiRaw = pickField(row, ["oi", "open interest", "open_interest", "openinterest"]);
  const oiChangeRaw = pickField(row, ["oi change", "oi_change", "open interest change", "open_interest_change"]);
  const oiAsOfDateRaw = pickField(row, ["oi as of date", "open interest as of date", "oi date", "open_interest_date"]);
  const bidRaw = pickField(row, ["nbbo_bid", "nbbo bid", "bid"]);
  const askRaw = pickField(row, ["nbbo_ask", "nbbo ask", "ask"]);
  const tradeRaw = pickField(
    row,
    ["trade price", "trade_price", "option price", "fill", "executed", "price", "trade"],
    { exclude: ["strike", "bid", "ask", "premium", "fair", "reference"] }
  );
  const deltaRaw = pickField(row, ["delta"]);
  const ivRaw = pickField(row, ["implied_volatility", "implied volatility", "iv", "implied vol", "implied_vol"]);
  const timeRaw = pickField(row, ["time", "timestamp", "trade time"]);
  const underlyingPriceRaw = pickField(row, ["underlying_price", "underlying price", "spot", "reference price"]);

  const symbol = typeof symbolRaw === "string" ? symbolRaw : underlyingRaw;
  const normalizedUnderlying =
    (typeof underlyingRaw === "string" ? extractUnderlyingFromValue(underlyingRaw) : null) ||
    (typeof symbol === "string" ? extractUnderlyingFromValue(symbol) : null);

  const strike = parseNumber(strikeRaw);
  const size = parseNumber(sizeRaw);
  const volume = parseNumber(volumeRaw);
  const premium = parsePremiumToNumber(premiumRaw);
  const oi = parseNumber(oiRaw);
  const oiChange = parseNumber(oiChangeRaw);
  const bid = parseNumber(bidRaw);
  const ask = parseNumber(askRaw);
  const tradePrice = parseNumber(tradeRaw);
  const delta = parseNumber(deltaRaw);
  const iv = parseNumber(ivRaw);
  const underlyingPrice = parseNumber(underlyingPriceRaw);
  const timestamp = normalizeTimestamp(
    typeof dateRaw === "string" ? dateRaw : dateRaw != null ? String(dateRaw) : null,
    typeof timeRaw === "string" ? timeRaw : timeRaw != null ? String(timeRaw) : null
  );
  let type = typeof typeRaw === "string" ? typeRaw.toUpperCase() : "";
  if (!type && typeof symbol === "string") {
    const occ = normalizeSymbol(symbol)?.match(/^[A-Z]+W?\d{6}([CP])/);
    if (occ) type = occ[1];
  }
  if (type === "CALL") type = "C";
  if (type === "PUT") type = "P";

  let side = normalizeSide(typeof sideRaw === "string" ? sideRaw : String(sideRaw || ""));
  if ((side === "UNKNOWN" || side === "MIXED") && typeof sideRaw === "string") {
    const code = sideRaw.trim().toUpperCase();
    if (code === "A" || code === "ASK") side = "ASK";
    else if (code === "B" || code === "BID") side = "BID";
    else if (code === "M" || code === "MID") side = "MIXED";
  }
  if ((side === "UNKNOWN" || side === "MIXED") && tradePrice != null && bid != null && ask != null) {
    if (tradePrice >= ask * 0.999) side = "ASK";
    else if (tradePrice <= bid * 1.001) side = "BID";
    else side = "MIXED";
  }

  return {
    symbol: typeof symbol === "string" ? symbol : null,
    underlying: normalizedUnderlying,
    sourceSessionDate:
      normalizeFlowSessionDateValue(dateRaw) || flowRowSessionDate(row),
    expiry: typeof expiryRaw === "string" ? normalizeExpiry(expiryRaw) : null,
    strike,
    type: type || null,
    side,
    size,
    volume,
    premium,
    oi,
    oiChange,
    oiAsOfDate: normalizeExpiry(
      typeof oiAsOfDateRaw === "string" ? oiAsOfDateRaw : oiAsOfDateRaw != null ? String(oiAsOfDateRaw) : null
    ),
    bid,
    ask,
    tradePrice,
    delta,
    iv,
    time: timeRaw != null ? String(timeRaw) : null,
    timestamp,
    underlyingPrice,
    raw: row,
  };
}

function dedupeRows(rows: ReturnType<typeof normalizeFlowRow>[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [
      row.sourceSessionDate,
      row.symbol,
      row.expiry,
      row.strike,
      row.type,
      row.side,
      row.size,
      row.premium,
      row.timestamp ?? row.time,
    ]
      .map((val) => (val == null ? "" : String(val)))
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function aggregateRows(rows: ReturnType<typeof normalizeFlowRow>[]) {
  const expirations: Record<string, any> = {};
  const flowTotals: {
    callPremiumAsk: number | null;
    putPremiumAsk: number | null;
    callPremiumBid: number | null;
    putPremiumBid: number | null;
  } = {
    callPremiumAsk: null,
    putPremiumAsk: null,
    callPremiumBid: null,
    putPremiumBid: null,
  };
  rows.forEach((row) => {
    const expiry = row.expiry || "unknown";
    if (!expirations[expiry]) expirations[expiry] = {};
    const key = `${row.strike ?? ""}|${row.type ?? ""}|${row.side}`;
    const bucket = expirations[expiry][key] ?? {
      strike: row.strike ?? null,
      type: row.type ?? "",
      side: row.side,
      prints: 0,
      sizeTotal: null,
      premiumTotal: null,
      oiMax: null,
      read: row.side,
    };
    bucket.prints += 1;
    bucket.sizeTotal = addKnown(bucket.sizeTotal, row.size);
    bucket.premiumTotal = addKnown(bucket.premiumTotal, row.premium);
    bucket.oiMax = maxKnown(bucket.oiMax, row.oi);
    expirations[expiry][key] = bucket;

    if (row.type === "C" && row.side === "ASK") flowTotals.callPremiumAsk = addKnown(flowTotals.callPremiumAsk, row.premium);
    if (row.type === "P" && row.side === "ASK") flowTotals.putPremiumAsk = addKnown(flowTotals.putPremiumAsk, row.premium);
    if (row.type === "C" && row.side === "BID") flowTotals.callPremiumBid = addKnown(flowTotals.callPremiumBid, row.premium);
    if (row.type === "P" && row.side === "BID") flowTotals.putPremiumBid = addKnown(flowTotals.putPremiumBid, row.premium);
  });

  const expirationsList = Object.entries(expirations).map(([expiry, strikes]) => ({
    expiry,
    strikes: Object.values(strikes).map((row: any) => ({
      ...row,
      premiumTotalRaw: row.premiumTotal,
      premiumTotal: formatPremium(row.premiumTotal),
    })),
  }));

  return { expirationsList, flowTotals };
}

async function extractRowsFromScreenshots(
  screenshotDataUrls: string[],
  provider?: string,
  lang: "en" | "es" = "en",
  userId?: string,
  requestId?: string | null
): Promise<Record<string, any>[]> {
  if (!screenshotDataUrls.length) return [];
  const isEs = lang === "es";
  const systemPrompt = isEs
    ? `Extrae de screenshots de options flow una tabla JSON con filas normalizadas. No inventes datos.
Devuelve solo JSON válido con la forma:
{ "rows": [ { "symbol": "string|null", "underlying": "string|null", "date": "YYYY-MM-DD|null", "timestamp": "ISO-8601|null", "expiry": "YYYY-MM-DD|null", "strike": "number|null", "type": "C|P|null", "side": "ASK|BID|MID|MIXED|UNKNOWN", "size": "number|null", "volume": "number|null", "premium": "number|null", "oi": "number|null", "oiChange": "number|null", "oiAsOfDate": "YYYY-MM-DD|null", "bid": "number|null", "ask": "number|null", "tradePrice": "number|null", "time": "string|null" } ], "notes": "" }
Si no puedes leer un campo o su fecha efectiva, déjalo null; nunca uses cero como sustituto. Máximo 120 filas.`
    : `Extract options flow screenshots into normalized JSON rows. Do not invent data.
Return only valid JSON with shape:
{ "rows": [ { "symbol": "string|null", "underlying": "string|null", "date": "YYYY-MM-DD|null", "timestamp": "ISO-8601|null", "expiry": "YYYY-MM-DD|null", "strike": "number|null", "type": "C|P|null", "side": "ASK|BID|MID|MIXED|UNKNOWN", "size": "number|null", "volume": "number|null", "premium": "number|null", "oi": "number|null", "oiChange": "number|null", "oiAsOfDate": "YYYY-MM-DD|null", "bid": "number|null", "ask": "number|null", "tradePrice": "number|null", "time": "string|null" } ], "notes": "" }
If a field or its effective date is missing, set it to null; never use zero as a substitute. Max 120 rows.`;

  const content: any = [
    { type: "text", text: JSON.stringify({ provider, instructions: systemPrompt }) },
    ...screenshotDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const completion = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content }],
    response_format: { type: "json_object" },
    ...openAiChatTuning(VISION_MODEL, 0),
  });

  await recordAiUsage({
    userId,
    requestId,
    feature: "option_flow",
    category: "market_intelligence",
    operation: "screenshot_extraction",
    model: completion.model || VISION_MODEL,
    usage: completion.usage,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}

function aggregateExpirations(expirations: any[]): any[] {
  if (!Array.isArray(expirations)) return [];
  return expirations.map((exp) => {
    const strikes = Array.isArray(exp?.strikes) ? exp.strikes : [];
    const map = new Map<string, any>();
    strikes.forEach((row: any) => {
      if (row?.strike == null || row?.strike === "") return;
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
        sizeTotal: null,
        premiumTotal: null,
        oiMax: null,
        read: row?.read ?? row?.side ?? "",
      };
      const prints = Number(row?.prints);
      const size = row?.sizeTotal == null ? null : Number(row.sizeTotal);
      existing.prints += Number.isFinite(prints) ? prints : 0;
      existing.sizeTotal = addKnown(existing.sizeTotal, Number.isFinite(size) ? size : null);
      existing.premiumTotal = addKnown(existing.premiumTotal, parsePremiumToNumber(row?.premiumTotal));
      const oi = row?.oiMax == null ? null : Number(row.oiMax);
      existing.oiMax = maxKnown(existing.oiMax, Number.isFinite(oi) ? oi : null);
      map.set(key, existing);
    });
    const aggregated = Array.from(map.values()).map((row) => ({
      ...row,
      premiumTotalRaw: row.premiumTotal,
      premiumTotal: formatPremium(row.premiumTotal),
    }));
    return { ...exp, strikes: aggregated };
  });
}

function filterExpirationsBySpot(
  expirations: any[],
  spot?: number | null,
  perSide = 10
): any[] {
  if (!Array.isArray(expirations)) return [];
  if (!Number.isFinite(Number(spot))) return expirations;
  const spotVal = Number(spot);
  return expirations.map((exp) => {
    const strikes = Array.isArray(exp?.strikes) ? exp.strikes : [];
    const strikeNumbers = strikes
      .map((row: any) => Number(row?.strike))
      .filter((n: number): n is number => Number.isFinite(n));
    const strikeValues = Array.from(new Set<number>(strikeNumbers)).sort((a, b) => a - b);
    const below = strikeValues.filter((s) => s <= spotVal).slice(-perSide);
    const above = strikeValues.filter((s) => s >= spotVal).slice(0, perSide);
    const allowed = new Set([...below, ...above]);
    const filtered = strikes.filter((row: any) => allowed.has(Number(row?.strike)));
    return { ...exp, strikes: filtered };
  });
}

function deriveFlowBiasFromTotals(flowTotals: {
  callPremiumAsk: number | null;
  putPremiumAsk: number | null;
  callPremiumBid: number | null;
  putPremiumBid: number | null;
}): "bullish" | "bearish" | "mixed" | "neutral" {
  const askTotal = sumKnown([flowTotals?.callPremiumAsk, flowTotals?.putPremiumAsk]);
  const bidTotal = sumKnown([flowTotals?.callPremiumBid, flowTotals?.putPremiumBid]);
  const total = sumKnown([askTotal, bidTotal]);
  if (askTotal == null || bidTotal == null || total == null || total <= 0) return "neutral";
  const ratio = (askTotal + 1) / (bidTotal + 1);
  if (ratio >= 1.25) return "bullish";
  if (ratio <= 0.8) return "bearish";
  return "mixed";
}

function deriveKeyLevelsFromExpirations(
  expirations: any[],
  lang: "en" | "es" = "en",
  spot?: number | null
): any[] {
  const isEs = lang === "es";
  const rows = expirations.flatMap((exp) => exp?.strikes ?? []);
  if (!rows.length) return [];

  let filteredRows = rows;
  if (Number.isFinite(Number(spot))) {
    const strikes = Array.from(
      new Set(
        rows
          .map((row: any) => Number(row?.strike))
          .filter((n: number) => Number.isFinite(n))
      )
    ).sort((a, b) => a - b);
    const spotVal = Number(spot);
    const below = strikes.filter((s) => s <= spotVal).slice(-10);
    const above = strikes.filter((s) => s >= spotVal).slice(0, 10);
    const allowed = new Set([...below, ...above]);
    filteredRows = rows.filter((row: any) => allowed.has(Number(row?.strike)));
  }

  const scored = filteredRows
    .map((row: any) => {
      const premium =
        Number.isFinite(Number(row?.premiumTotalRaw))
          ? Number(row?.premiumTotalRaw)
          : parsePremiumToNumber(row?.premiumTotal) ?? 0;
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

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function estimateSpot(rows: ReturnType<typeof normalizeFlowRow>[], previousClose?: number | null): number | null {
  if (Number.isFinite(Number(previousClose))) return Number(previousClose);
  const samples = rows
    .map((row) => Number(row.underlyingPrice))
    .filter((n) => Number.isFinite(n));
  return median(samples);
}

function deriveContractPrice(row: ReturnType<typeof normalizeFlowRow>): number | null {
  if (Number.isFinite(Number(row.tradePrice))) return Number(row.tradePrice);
  const bid = Number(row.bid);
  const ask = Number(row.ask);
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  const premium = Number(row.premium);
  const size = Number(row.size);
  if (Number.isFinite(premium) && Number.isFinite(size) && size > 0) {
    return premium / (size * 100);
  }
  return null;
}

function computeUploadedOpenInterestEvidence(
  rows: ReturnType<typeof normalizeFlowRow>[],
  underlying: string,
  fallbackDate: string
) {
  const snapshots = rows.flatMap((row) => {
    const contractSymbol =
      normalizeOccOptionSymbol(row.symbol) ??
      buildOccOptionSymbol({
        root: row.underlying ?? underlying,
        expiry: row.expiry,
        strike: row.strike,
        optionType: row.type,
      });
    if (!contractSymbol) return [];
    const sessionDate = flowRowSessionDate(row) ?? fallbackDate;
    const bid = Number.isFinite(row.bid) ? row.bid : null;
    const ask = Number.isFinite(row.ask) ? row.ask : null;
    return [{
      contractSymbol,
      underlyingSymbol: underlying,
      expiry: row.expiry,
      strike: row.strike,
      optionType: row.type === "C" ? "C" as const : row.type === "P" ? "P" as const : null,
      snapshotKind: "imported_flow",
      priceSessionDate: sessionDate,
      openInterestAsOfDate: /^\d{4}-\d{2}-\d{2}$/.test(String(row.oiAsOfDate ?? ""))
        ? row.oiAsOfDate
        : null,
      observedAt: row.timestamp ?? `${sessionDate}T21:00:00.000Z`,
      sourceId: "uploaded_evidence",
      openInterest: row.oi,
      reportedOpenInterestChange: row.oiChange,
      volume: row.volume,
      lastPrice: deriveContractPrice(row),
      bid,
      ask,
      midpoint: bid != null && ask != null ? (bid + ask) / 2 : null,
      impliedVolatility: row.iv,
      delta: row.delta,
      underlyingPrice: row.underlyingPrice,
      oiTemporalStatus: row.oiAsOfDate || Number.isFinite(row.oiChange)
        ? "reported_by_source" as const
        : "date_not_verified" as const,
    }];
  });
  return buildOptionFlowOpenInterestIntelligence(snapshots);
}

function safeRows(rows: any[], limit = 200) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, Math.max(1, limit));
}

function safeScreenshotDataUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const candidates = input
    .map((url) => String(url ?? ""))
    .filter((url) => /^data:image\/(?:png|jpe?g|webp);base64,/i.test(url))
    .slice(0, MAX_SCREENSHOTS)
    .filter((url) => url.length <= MAX_SCREENSHOT_DATA_URL_CHARS);
  const accepted: string[] = [];
  let totalChars = 0;
  for (const url of candidates) {
    if (totalChars + url.length > MAX_SCREENSHOT_PAYLOAD_CHARS) break;
    accepted.push(url);
    totalChars += url.length;
  }
  return accepted;
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
    const requestLang = resolveOptionFlowLang(req.headers.get("accept-language"));

    if (!BYPASS_ENTITLEMENT && !(await hasOptionFlowBetaAccess(userId))) {
      return NextResponse.json(getOptionFlowBetaApiPayload(requestLang), { status: 403 });
    }

    const limiter = await rateLimit(`optionflow-analyze:${userId}:${getClientIp(req)}`, {
      limit: 8,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const budgetGate = await requireAiBudget({ userId, category: "market_intelligence" });
    if (budgetGate) return budgetGate;

    const body = await req.json();
    const {
      provider,
      underlying,
      previousClose,
      sourceSessionDate,
      flowSessionDate,
      rows,
      screenshotDataUrls,
      analystNotes,
      language,
      sourceFile,
    } = body as {
      provider?: string;
      underlying?: string;
      previousClose?: number;
      sourceSessionDate?: string;
      flowSessionDate?: string;
      rows?: any[];
      screenshotDataUrls?: string[];
      analystNotes?: string | null;
      language?: string;
      sourceFile?: {
        name?: string | null;
        size?: number | null;
        mimeType?: string | null;
        sha256?: string | null;
      } | null;
    };

    const trimmedRows = safeRows(rows ?? [], 2_000);
    const safeScreenshots = safeScreenshotDataUrls(screenshotDataUrls);
    const safeAnalystNotes = String(analystNotes ?? "").slice(0, 3000);
    const safeAnalysisMode: OptionFlowAnalysisMode = "forward_positioning";
    const marketToday = marketDateKey(new Date());
    const sourceDateFallback = sourceSessionDate ?? flowSessionDate;
    const requestedSourceSessionDate = /^\d{4}-\d{2}-\d{2}$/.test(String(sourceDateFallback ?? "")) &&
      String(sourceDateFallback) >= addCalendarDays(marketToday, -730) &&
      String(sourceDateFallback) <= marketToday
        ? String(sourceDateFallback)
        : null;

    const lang = String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    const isEs = lang === "es";
    const normalizedRequestedUnderlying = normalizeSymbol(underlying);
    if (!normalizedRequestedUnderlying) {
      return NextResponse.json(
        {
          error: isEs
            ? "Selecciona un ticker para crear o actualizar su perfil de flujo."
            : "Select a ticker to create or update its flow profile.",
        },
        { status: 400 }
      );
    }

    let historicalAnalyses: any[] = [];
    let horizonEvaluations: any[] = [];
    let priorEventFingerprints = new Set<string>();
    let priorUniqueEventCount = 0;
    let exactDuplicateFile = false;
    let existingProfileId: string | null = null;
    try {
      const { data: existingProfile } = await supabaseAdmin
        .from("option_flow_profiles")
        .select("id")
        .eq("user_id", userId)
        .eq("symbol", normalizedRequestedUnderlying)
        .maybeSingle();
      if (existingProfile?.id) {
        existingProfileId = String(existingProfile.id);
        const [analysisHistory, checkpointHistory, eventHistory, matchingSource] = await Promise.all([
          supabaseAdmin
            .from("option_flow_analysis_runs")
            .select("version,analysis_mode,horizon,target_date,source_session_date,agent_output,data_quality,created_at")
            .eq("user_id", userId)
            .eq("profile_id", existingProfile.id)
            .eq("status", "complete")
            .order("version", { ascending: false })
            .limit(8),
          supabaseAdmin
            .from("option_flow_horizon_checkpoints")
            .select("checkpoint_date,status,classification,deterministic_result,evaluated_at")
            .eq("user_id", userId)
            .eq("profile_id", existingProfile.id)
            .order("checkpoint_date", { ascending: false })
            .limit(12),
          supabaseAdmin
            .from("option_flow_events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("profile_id", existingProfile.id),
          sourceFile?.sha256
            ? supabaseAdmin
                .from("option_flow_sources")
                .select("id")
                .eq("user_id", userId)
                .eq("profile_id", existingProfile.id)
                .eq("content_sha256", String(sourceFile.sha256))
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (!analysisHistory.error) historicalAnalyses = analysisHistory.data ?? [];
        if (!checkpointHistory.error) horizonEvaluations = checkpointHistory.data ?? [];
        if (!eventHistory.error) priorUniqueEventCount = eventHistory.count ?? 0;
        if (!matchingSource.error) exactDuplicateFile = Boolean(matchingSource.data);
      }
    } catch {
      historicalAnalyses = [];
      horizonEvaluations = [];
    }

    const ocrRows = await extractRowsFromScreenshots(
      safeScreenshots,
      provider,
      lang,
      userId,
      req.headers.get("x-request-id")
    );
    const mergedRawRows = [...trimmedRows, ...ocrRows];
    let normalizedRows = dedupeRows(mergedRawRows.map((row) => normalizeFlowRow(row)));
    if (underlying) {
      const target = normalizeSymbol(underlying);
      if (target) {
        normalizedRows = normalizedRows.filter((row) => {
          const rowUnderlying = normalizeSymbol(row.underlying || row.symbol || "");
          return rowUnderlying && optionFlowUnderlyingsMatch(rowUnderlying, target);
        });
      }
    }
    const allNormalizedRows = normalizedRows;
    const sourceRowCount = allNormalizedRows.length;
    const evidenceWindow = summarizeOptionFlowEvidenceWindow({
      sessionDates: flowSessionDates(allNormalizedRows),
      fallbackDate: requestedSourceSessionDate,
    });
    const availableSessionDates = evidenceWindow.sessionDates;
    const resolvedAnalysisSessionDate =
      evidenceWindow.endDate ||
      resolveSourceSessionDate(allNormalizedRows);
    if (!resolvedAnalysisSessionDate) {
      return NextResponse.json(
        {
          error: isEs
            ? "No se pudo determinar la fecha del flow. Selecciona la fecha de sesión."
            : "The flow session date could not be determined. Select the session date.",
        },
        { status: 400 }
      );
    }
    const evidencePeriodStart = evidenceWindow.startDate ?? resolvedAnalysisSessionDate;
    const evidencePeriodEnd = evidenceWindow.endDate ?? resolvedAnalysisSessionDate;
    const marketHistoryStart = [
      addCalendarDays(marketToday, -420),
      addCalendarDays(evidencePeriodStart, -10),
    ].sort()[0];
    let marketBars: OptionFlowDailyMarketBar[] = [];
    let marketDataError: string | null = null;
    try {
      marketBars = await fetchOptionFlowDailyBars({
        underlying: normalizedRequestedUnderlying,
        startDate: marketHistoryStart,
        endDate: marketToday,
      });
    } catch (error) {
      marketDataError = error instanceof Error ? error.message : String(error);
    }
    const requestedMarketDates = availableSessionDates.length
      ? availableSessionDates
      : [resolvedAnalysisSessionDate];
    const marketEvidence = buildOptionFlowMarketEvidence({
      bars: marketBars,
      requestedSessionDates: requestedMarketDates,
      startDate: evidencePeriodStart,
      endDate: evidencePeriodEnd,
      providerError: marketDataError,
    });
    const analysisMarketBar = marketBars.find(
      (bar) => bar.sessionDate === resolvedAnalysisSessionDate
    ) ?? null;
    const previousMarketBar = marketBars
      .filter((bar) => bar.sessionDate < resolvedAnalysisSessionDate)
      .sort((left, right) => left.sessionDate.localeCompare(right.sessionDate))
      .at(-1) ?? null;
    const resolvedPreviousClose = previousMarketBar?.close ??
      (Number.isFinite(Number(previousClose)) ? Number(previousClose) : null);
    const marketSpotReference = analysisMarketBar?.close ?? resolvedPreviousClose;
    const rowsWithFingerprints = allNormalizedRows.map((row) => {
      const rowSessionDate = flowRowSessionDate(row) || resolvedAnalysisSessionDate;
      const fingerprint = optionFlowEventFingerprint(
        normalizedRequestedUnderlying,
        rowSessionDate,
        row
      );
      return { row, fingerprint };
    });
    if (existingProfileId && rowsWithFingerprints.length) {
      const incomingFingerprints = Array.from(
        new Set(rowsWithFingerprints.map((item) => item.fingerprint))
      );
      for (let index = 0; index < incomingFingerprints.length; index += 100) {
        const batch = incomingFingerprints.slice(index, index + 100);
        const { data: matches, error: matchesError } = await supabaseAdmin
          .from("option_flow_events")
          .select("fingerprint")
          .eq("user_id", userId)
          .eq("profile_id", existingProfileId)
          .in("fingerprint", batch);
        if (matchesError) throw matchesError;
        for (const match of matches ?? []) {
          const fingerprint = String(match.fingerprint ?? "");
          if (fingerprint) priorEventFingerprints.add(fingerprint);
        }
      }
    }
    const newEvidenceRows = rowsWithFingerprints
      .filter((item) => !priorEventFingerprints.has(item.fingerprint))
      .map((item) => item.row);
    const repeatedEvidenceRows = rowsWithFingerprints
      .filter((item) => priorEventFingerprints.has(item.fingerprint))
      .map((item) => item.row);

    normalizedRows = allNormalizedRows;
    if (!normalizedRows.length) {
      return NextResponse.json(
        {
          error: isEs
            ? "No se pudieron extraer filas de flow verificables para este ticker y fecha."
            : "No verifiable flow rows could be extracted for this ticker and date.",
        },
        { status: 400 }
      );
    }
    const latestSessionRows = normalizedRows.filter(
      (row) => flowRowSessionDate(row) === resolvedAnalysisSessionDate
    );
    const lateSessionRows = filterLateSessionFlowRows(latestSessionRows);
    const lateSessionWindowApplied = false;
    const lateSessionTape = buildLateSessionTape(
      lateSessionRows.length ? lateSessionRows : latestSessionRows,
      normalizedRequestedUnderlying,
      resolvedAnalysisSessionDate
    );

    const { expirationsList, flowTotals } = aggregateRows(normalizedRows);
    const deterministicExpirations = aggregateExpirations(expirationsList);
    const spotEstimate = estimateSpot(normalizedRows, marketSpotReference);
    const filteredExpirations = filterExpirationsBySpot(deterministicExpirations, spotEstimate, 10);
    const deterministicKeyLevels = deriveKeyLevelsFromExpirations(
      filteredExpirations,
      lang,
      spotEstimate
    );
    const openInterestEvidence = computeUploadedOpenInterestEvidence(
      normalizedRows,
      normalizedRequestedUnderlying,
      resolvedAnalysisSessionDate
    );
    const dataQuality: DataQuality = {
      totalRows: normalizedRows.length,
      sourceRows: sourceRowCount,
      lateSessionRows: lateSessionRows.length,
      lateSessionWindowApplied,
      withSide: normalizedRows.filter((row) => row.side !== "UNKNOWN").length,
      withPremium: normalizedRows.filter((row) => Number.isFinite(row.premium)).length,
      withOi: normalizedRows.filter((row) => Number.isFinite(row.oi)).length,
      evidencePeriodStart,
      evidencePeriodEnd,
      evidenceSessionCount: evidenceWindow.sessionCount || 1,
      rowsWithoutVerifiedDate: allNormalizedRows.filter((row) => !flowRowSessionDate(row)).length,
      priorUniqueEvents: priorUniqueEventCount,
      newUniqueRows: newEvidenceRows.length,
      repeatedRows: repeatedEvidenceRows.length,
      exactDuplicateFile,
      marketDataStatus: marketEvidence.status,
      marketSessionsMatched: marketEvidence.sessions.length,
      marketSessionsMissing: marketEvidence.missingRequestedDates.length,
    };
  const todayIso = new Date().toISOString().slice(0, 10);
  const expiryDates = normalizedRows
    .map((row) => row.expiry)
    .filter((val): val is string => typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val));
  const latestExpiry = expiryDates.sort().slice(-1)[0] ?? null;
  const latestTimestamp =
    normalizedRows
      .map((row) => row.timestamp)
      .filter((val): val is string => typeof val === "string")
      .sort()
      .slice(-1)[0] ?? null;
  const staleByExpiry = latestExpiry ? latestExpiry < todayIso : false;
  const staleByTimestamp = latestTimestamp
    ? Date.now() - new Date(latestTimestamp).getTime() > 24 * 60 * 60 * 1000
    : false;
  dataQuality.latestExpiry = latestExpiry;
  dataQuality.latestTimestamp = latestTimestamp;
  dataQuality.isStale = Boolean(staleByExpiry || staleByTimestamp);
    const flowFeatures = (() => {
      const askTotal = sumKnown([flowTotals.callPremiumAsk, flowTotals.putPremiumAsk]);
      const bidTotal = sumKnown([flowTotals.callPremiumBid, flowTotals.putPremiumBid]);
      const askRatio = flowTotals.callPremiumAsk != null && flowTotals.putPremiumAsk != null && flowTotals.putPremiumAsk > 0
        ? flowTotals.callPremiumAsk / flowTotals.putPremiumAsk
        : null;
      const bidRatio = flowTotals.callPremiumBid != null && flowTotals.putPremiumBid != null && flowTotals.putPremiumBid > 0
        ? flowTotals.callPremiumBid / flowTotals.putPremiumBid
        : null;
      return {
        askTotal,
        bidTotal,
        askRatio,
        bidRatio,
      };
    })();

    const userPayload = {
      provider,
      underlying: normalizedRequestedUnderlying,
      previousClose: resolvedPreviousClose,
      marketEvidence,
      analysisScope: "comprehensive",
      horizonSelection: "agent_inferred",
      sourceSessionDate: resolvedAnalysisSessionDate,
      evidenceCoverage: {
        startDate: evidencePeriodStart,
        endDate: evidencePeriodEnd,
        sessionDates: availableSessionDates,
        rowsWithoutVerifiedDate: dataQuality.rowsWithoutVerifiedDate,
      },
      evidenceDelta: {
        priorUniqueEvents: priorUniqueEventCount,
        uploadedUniqueRows: allNormalizedRows.length,
        newUniqueRows: newEvidenceRows.length,
        repeatedRows: repeatedEvidenceRows.length,
        exactDuplicateFile,
      },
      priorAnalysis: historicalAnalyses[0]
        ? {
            version: historicalAnalyses[0].version,
            sourceSessionDate: historicalAnalyses[0].source_session_date,
            analysisMode: historicalAnalyses[0].analysis_mode,
            horizon: historicalAnalyses[0].horizon,
            summary: historicalAnalyses[0].agent_output?.summary ?? "DATA NOT AVAILABLE",
            flowBias: historicalAnalyses[0].agent_output?.flowBias ?? "DATA NOT AVAILABLE",
            thesisUpdate: historicalAnalyses[0].agent_output?.thesisUpdate ?? null,
          }
        : null,
      analystNotes: safeAnalystNotes,
      historicalAnalyses,
      horizonEvaluations,
      dataQuality,
      flowTotals,
      flowFeatures,
      lateSessionTape,
      keyLevels: deterministicKeyLevels,
      expirations: filteredExpirations,
      openInterestEvidence,
      sampleRows: safeRows(normalizedRows.map((row) => row.raw ?? row), 120),
      newEvidenceSample: safeRows(newEvidenceRows.map((row) => row.raw ?? row), 80),
      repeatedEvidenceSample: safeRows(repeatedEvidenceRows.map((row) => row.raw ?? row), 20),
    };

    const agentRun = await runOptionFlowIntelligenceAgents({
      userId,
      language: lang,
      payload: userPayload,
    });
    let parsed = agentRun.output;
    const safeHorizon = parsed.horizonRead.horizon;
    const targetDate = optionFlowTargetDate({
      sourceSessionDate: resolvedAnalysisSessionDate,
      horizon: safeHorizon,
    });
    parsed = {
      ...parsed,
      horizonRead: {
        ...parsed.horizonRead,
        analysisMode: "comprehensive",
        horizon: safeHorizon,
        targetDate,
      },
    };
    const priorAnalysis = historicalAnalyses[0] ?? null;
    const enforcedThesisStatus = enforceOptionFlowThesisStatus({
      hasPriorAnalysis: Boolean(priorAnalysis),
      newUniqueRows: newEvidenceRows.length,
      candidate: parsed.thesisUpdate.classification,
    });
    if (!priorAnalysis) {
      parsed = {
        ...parsed,
        thesisUpdate: {
          ...parsed.thesisUpdate,
          classification: enforcedThesisStatus,
          previousRead: "DATA NOT AVAILABLE",
          whatChanged: [
            isEs
              ? "Este es el análisis base; todavía no existe una lectura anterior verificable para comparar."
              : "This is the baseline analysis; no prior verified read exists for comparison.",
          ],
        },
      };
    } else if (newEvidenceRows.length === 0) {
      const priorSummary = String(priorAnalysis.agent_output?.summary ?? "DATA NOT AVAILABLE");
      parsed = {
        ...parsed,
        summary: priorSummary,
        flowBias: priorAnalysis.agent_output?.flowBias ?? parsed.flowBias,
        thesisUpdate: {
          classification: enforcedThesisStatus,
          previousRead: priorSummary,
          currentRead: priorSummary,
          whatChanged: [
            isEs
              ? "La carga no contiene eventos únicos nuevos; la evidencia repetida no modifica la tesis."
              : "The upload contains no new unique events; repeated evidence does not change the thesis.",
          ],
          supportingEvidence: [],
          contradictoryEvidence: [],
          uncertainty: [
            isEs
              ? "Se necesita evidencia nueva y fechada para fortalecer o debilitar la lectura."
              : "New dated evidence is required to strengthen or weaken the read.",
          ],
        },
      };
    } else if (parsed.thesisUpdate.classification !== enforcedThesisStatus) {
      parsed = {
        ...parsed,
        thesisUpdate: {
          ...parsed.thesisUpdate,
          classification: enforcedThesisStatus,
        },
      };
    }
    await recordAiUsage({
      userId,
      requestId: req.headers.get("x-request-id"),
      feature: "option_flow",
      category: "market_intelligence",
      operation: "flow_intelligence_agents",
      model: agentRun.model,
      usage: agentRun.usage,
      apiKind: "responses",
      metadata: {
        analysisMode: safeAnalysisMode,
        horizon: safeHorizon,
        symbol: normalizedRequestedUnderlying,
      },
    });

    const summary = parsed.summary;
    const keyTrades = parsed.keyContracts.map((contract) => ({
      headline: contract.contract,
      whyItMatters: contract.reason,
      details: {
        symbol: normalizedRequestedUnderlying,
        contract: contract.contract,
        expiry: contract.expiry,
        observedContractPrice: contract.observedPrice,
        limitations: contract.limitations,
      },
    }));
    const observations = parsed.observations;
    const inferences = parsed.interpretations;
    const scenarioMatrix = {
      bullish: {
        trigger: parsed.scenarios.bullish.conditions.join(" "),
        confirmation: parsed.scenarios.bullish.priceZone ?? "DATA NOT AVAILABLE",
        invalidation: parsed.scenarios.bullish.invalidation,
        risk: parsed.scenarios.bullish.timing,
      },
      bearish: {
        trigger: parsed.scenarios.bearish.conditions.join(" "),
        confirmation: parsed.scenarios.bearish.priceZone ?? "DATA NOT AVAILABLE",
        invalidation: parsed.scenarios.bearish.invalidation,
        risk: parsed.scenarios.bearish.timing,
      },
      range: {
        trigger: parsed.scenarios.base.conditions.join(" "),
        confirmation: parsed.scenarios.base.priceZone ?? "DATA NOT AVAILABLE",
        invalidation: parsed.scenarios.base.invalidation,
        risk: parsed.scenarios.base.timing,
      },
    };
    const lateSessionRead = lateSessionTape.totalPrints > 0
      ? {
          completedMove: parsed.horizonRead.interpretation,
          regimeShift: parsed.contradiction.strongestAlternativeExplanation,
          carryForward: parsed.accumulation.classification,
          todayBehavior: parsed.scenarios.base.timing,
          contractsToTrack: parsed.keyContracts.map((contract) => contract.contract),
        }
      : null;
    const expirations = filteredExpirations;
    const contractsWithPotential = {
      gamma: parsed.keyContracts.map((contract) => `${contract.contract}: ${contract.reason}`),
      directional: [],
      stress: parsed.accumulation.contradictoryEvidence,
    };
    const squeezeScenarios = null;
    const keyLevels = deterministicKeyLevels;
    const flowBias = parsed.flowBias === "insufficient_data" && dataQuality.withPremium > 0
      ? deriveFlowBiasFromTotals(flowTotals)
      : parsed.flowBias;
    const tradingPlan = null;
    const deterministicSnapshot = {
      version: 1,
      symbol: normalizedRequestedUnderlying,
      analysisMode: "comprehensive",
      horizon: safeHorizon,
      targetDate,
      sourceSessionDate: resolvedAnalysisSessionDate,
      evidenceCoverage: {
        startDate: evidencePeriodStart,
        endDate: evidencePeriodEnd,
        sessionDates: availableSessionDates,
      },
      evidenceDelta: {
        priorUniqueEvents: priorUniqueEventCount,
        uploadedUniqueRows: allNormalizedRows.length,
        newUniqueRows: newEvidenceRows.length,
        repeatedRows: repeatedEvidenceRows.length,
        exactDuplicateFile,
      },
      previousClose: resolvedPreviousClose,
      marketEvidence,
      spotEstimate,
      flowBias,
      flowTotals,
      flowFeatures,
      keyLevels,
      expirations,
      openInterestEvidence,
      lateSessionTape,
      formulas: {
        flowTotals: "sum(premium) grouped by option type and aggressor side",
        keyLevels: "rank strikes by observed premium, size, print count, and spot proximity",
        evidenceDelta: "SHA-256 canonical event fingerprints compared with previously stored profile events",
        openInterestChange: "use only a source-reported OI change or compare distinct verified OI effective sessions; never compare intraday prints",
      },
      calculatedAt: new Date().toISOString(),
    };
    const persisted = await persistOptionFlowAnalysis({
      userId,
      symbol: normalizedRequestedUnderlying,
      provider: provider ?? null,
      language: lang,
      analysisMode: safeAnalysisMode,
      horizon: safeHorizon,
      customTargetDate: targetDate,
      sourceSessionDate: resolvedAnalysisSessionDate,
      analystNotes: safeAnalystNotes,
      normalizedRows: allNormalizedRows,
      marketBars,
      screenshotDataUrls: safeScreenshots,
      sourceFile: sourceFile ?? null,
      deterministicSnapshot,
      agentOutput: parsed,
      dataQuality,
      model: agentRun.model,
      agentUsage: agentRun.usage,
      traceId: agentRun.traceId,
    });

    return NextResponse.json({
      summary,
      keyTrades,
      flowBias,
      lateSessionTape,
      lateSessionRead,
      observations,
      inferences,
      scenarioMatrix,
      keyLevels,
      expirations,
      contractsWithPotential,
      openInterestEvidence,
      squeezeScenarios,
      tradingPlan,
      analysisMode: "comprehensive",
      horizon: safeHorizon,
      targetDate,
      evidenceStrength: parsed.evidenceStrength,
      thesisUpdate: parsed.thesisUpdate,
      evidenceDelta: deterministicSnapshot.evidenceDelta,
      horizonRead: parsed.horizonRead,
      accumulation: parsed.accumulation,
      contradiction: parsed.contradiction,
      agentOutput: parsed,
      deterministicSnapshot,
      notablePatterns: parsed.interpretations,
      riskNotes: parsed.riskNotes,
      suggestedFocus: parsed.suggestedFocus,
      dataQuality,
      uploadId: persisted.analysis.id,
      analysisRunId: persisted.analysis.id,
      analysisVersion: persisted.analysis.version,
      profileId: persisted.profile.id,
      profile: persisted.profile,
    });
  } catch (err: any) {
    console.error("[option-flow/analyze] error:", err);
    const transientProviderFailure = /timed?\s*out|headers timeout|econnreset|connection error/i.test(
      String(err?.message ?? err ?? "")
    );
    if (transientProviderFailure) {
      const isEs = resolveOptionFlowLang(req.headers.get("accept-language")) === "es";
      return NextResponse.json(
        {
          error: isEs
            ? "El proveedor de IA no respondió a tiempo. Tu evidencia no se perdió; intenta ejecutar el análisis nuevamente."
            : "The AI provider did not respond in time. Your evidence was not lost; run the analysis again.",
          retryable: true,
        },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
