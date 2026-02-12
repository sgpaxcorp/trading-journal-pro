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

type DataQuality = {
  totalRows: number;
  withSide: number;
  withPremium: number;
  withOi: number;
  latestExpiry?: string | null;
  latestTimestamp?: string | null;
  isStale?: boolean;
};

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
  const symbolRaw = pickField(row, ["symbol", "ticker", "root", "option", "contract"]);
  const underlyingRaw = pickField(row, ["underlying", "underlying_symbol", "underlying symbol", "underlyingticker", "underlying ticker"]);
  const dateRaw = pickField(row, ["date", "trade date"]);
  const expiryRaw = pickField(row, ["expiry", "expiration", "exp", "date"]);
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
  const premiumRaw = pickField(row, ["premium", "notional", "value", "cost"]);
  const oiRaw = pickField(row, ["oi", "open interest"]);
  const bidRaw = pickField(row, ["bid"]);
  const askRaw = pickField(row, ["ask"]);
  const tradeRaw = pickField(
    row,
    ["trade price", "trade_price", "option price", "fill", "executed", "price", "trade"],
    { exclude: ["strike", "bid", "ask", "premium", "fair", "reference"] }
  );
  const deltaRaw = pickField(row, ["delta"]);
  const ivRaw = pickField(row, ["iv", "implied vol", "implied_vol"]);
  const timeRaw = pickField(row, ["time", "timestamp", "trade time"]);
  const underlyingPriceRaw = pickField(row, ["underlying_price", "underlying price", "spot", "reference price"]);

  const symbol = typeof symbolRaw === "string" ? symbolRaw : underlyingRaw;
  const normalizedUnderlying =
    (typeof underlyingRaw === "string" ? extractUnderlyingFromValue(underlyingRaw) : null) ||
    (typeof symbol === "string" ? extractUnderlyingFromValue(symbol) : null);

  const strike = parseNumber(strikeRaw);
  const size = parseNumber(sizeRaw);
  const premium = parsePremiumToNumber(premiumRaw);
  const oi = parseNumber(oiRaw);
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
    expiry: typeof expiryRaw === "string" ? normalizeExpiry(expiryRaw) : null,
    strike,
    type: type || null,
    side,
    size,
    premium,
    oi,
    bid,
    ask,
    tradePrice,
    delta,
    iv,
    time: typeof timeRaw === "string" ? timeRaw : null,
    timestamp,
    underlyingPrice,
    raw: row,
  };
}

function dedupeRows(rows: ReturnType<typeof normalizeFlowRow>[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [row.symbol, row.expiry, row.strike, row.type, row.side, row.size, row.premium, row.time]
      .map((val) => (val == null ? "" : String(val)))
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function aggregateRows(rows: ReturnType<typeof normalizeFlowRow>[]) {
  const expirations: Record<string, any> = {};
  const flowTotals = {
    callPremiumAsk: 0,
    putPremiumAsk: 0,
    callPremiumBid: 0,
    putPremiumBid: 0,
  };
  rows.forEach((row) => {
    const expiry = row.expiry || "unknown";
    if (!expirations[expiry]) expirations[expiry] = {};
    const key = `${row.strike ?? ""}|${row.type ?? ""}|${row.side}`;
    const bucket = expirations[expiry][key] ?? {
      strike: row.strike ?? 0,
      type: row.type ?? "",
      side: row.side,
      prints: 0,
      sizeTotal: 0,
      premiumTotal: 0,
      oiMax: 0,
      read: row.side,
    };
    bucket.prints += 1;
    bucket.sizeTotal += row.size ?? 0;
    bucket.premiumTotal += row.premium ?? 0;
    bucket.oiMax = Math.max(bucket.oiMax, row.oi ?? 0);
    expirations[expiry][key] = bucket;

    if (row.type === "C" && row.side === "ASK") flowTotals.callPremiumAsk += row.premium ?? 0;
    if (row.type === "P" && row.side === "ASK") flowTotals.putPremiumAsk += row.premium ?? 0;
    if (row.type === "C" && row.side === "BID") flowTotals.callPremiumBid += row.premium ?? 0;
    if (row.type === "P" && row.side === "BID") flowTotals.putPremiumBid += row.premium ?? 0;
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
  lang: "en" | "es" = "en"
): Promise<Record<string, any>[]> {
  if (!screenshotDataUrls.length) return [];
  const isEs = lang === "es";
  const systemPrompt = isEs
    ? `Extrae de screenshots de options flow una tabla JSON con filas normalizadas. No inventes datos.
Devuelve solo JSON válido con la forma:
{ "rows": [ { "symbol": "", "underlying": "", "expiry": "YYYY-MM-DD", "strike": 0, "type": "C|P", "side": "ASK|BID|MID|MIXED|UNKNOWN", "size": 0, "premium": 0, "oi": 0, "bid": 0, "ask": 0, "tradePrice": 0, "time": "" } ], "notes": "" }
Si no puedes leer un campo, déjalo null. Máximo 120 filas.`
    : `Extract options flow screenshots into normalized JSON rows. Do not invent data.
Return only valid JSON with shape:
{ "rows": [ { "symbol": "", "underlying": "", "expiry": "YYYY-MM-DD", "strike": 0, "type": "C|P", "side": "ASK|BID|MID|MIXED|UNKNOWN", "size": 0, "premium": 0, "oi": 0, "bid": 0, "ask": 0, "tradePrice": 0, "time": "" } ], "notes": "" }
If a field is missing, set it to null. Max 120 rows.`;

  const content: any = [
    { type: "text", text: JSON.stringify({ provider, instructions: systemPrompt }) },
    ...screenshotDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const completion = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content }],
    response_format: { type: "json_object" },
    temperature: 0,
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
  callPremiumAsk: number;
  putPremiumAsk: number;
  callPremiumBid: number;
  putPremiumBid: number;
}): "bullish" | "bearish" | "mixed" | "neutral" {
  const askTotal = (flowTotals?.callPremiumAsk ?? 0) + (flowTotals?.putPremiumAsk ?? 0);
  const bidTotal = (flowTotals?.callPremiumBid ?? 0) + (flowTotals?.putPremiumBid ?? 0);
  const total = askTotal + bidTotal;
  if (!Number.isFinite(total) || total <= 0) return "neutral";
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
          : parsePremiumToNumber(row?.premiumTotal);
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

function computeSqueezeCandidates(rows: ReturnType<typeof normalizeFlowRow>[], limit = 5) {
  const groups = new Map<string, { key: string; expiry: string | null; strike: number | null; type: string | null; underlying: string | null; entries: any[] }>();
  rows.forEach((row, idx) => {
    const underlying = row.underlying || row.symbol;
    const expiry = row.expiry;
    const strike = Number(row.strike);
    const type = row.type;
    if (!underlying || !expiry || !Number.isFinite(strike) || !type) return;
    const price = deriveContractPrice(row);
    const oi = Number(row.oi);
    if (!Number.isFinite(price) || !Number.isFinite(oi)) return;
    const key = `${underlying}|${expiry}|${strike}|${type}`;
    const entry = {
      ts: row.timestamp || null,
      order: idx,
      price,
      oi,
    };
    const existing =
      groups.get(key) ??
      { key, expiry, strike, type, underlying, entries: [] as any[] };
    existing.entries.push(entry);
    groups.set(key, existing);
  });

  const candidates = Array.from(groups.values())
    .map((group) => {
      const entries = group.entries
        .slice()
        .sort((a: any, b: any) => {
          if (a.ts && b.ts) return a.ts.localeCompare(b.ts);
          if (a.ts) return -1;
          if (b.ts) return 1;
          return a.order - b.order;
        });
      if (entries.length < 2) return null;
      const first = entries[0];
      const last = entries[entries.length - 1];
      const oiChange = Number(last.oi) - Number(first.oi);
      const priceChange = Number(last.price) - Number(first.price);
      if (!Number.isFinite(oiChange) || !Number.isFinite(priceChange)) return null;
      if (oiChange <= 0 || priceChange >= 0) return null;
      const score = oiChange * Math.abs(priceChange);
      return {
        contract: `${group.underlying} ${group.expiry} ${group.strike}${group.type}`,
        underlying: group.underlying,
        expiry: group.expiry,
        strike: group.strike,
        type: group.type,
        firstTime: first.ts,
        lastTime: last.ts,
        firstOi: Number(first.oi),
        lastOi: Number(last.oi),
        firstPrice: Number(first.price),
        lastPrice: Number(last.price),
        oiChange,
        priceChange,
        score,
      };
    })
    .filter(Boolean) as any[];

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
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
IMPORTANTE: "expirations" ya viene agregada (prints/size/premium). Úsala como fuente principal.
Usa "flowTotals" y "flowFeatures" (ask/bid ratios) para inferir sesgo direccional de forma consistente.
Usa "sampleRows" solo como contexto si hace falta.
Identifica niveles reales (con etiqueta pivot/supply/demand/wall/friction), contratos con más potencial y escenarios
de squeeze con condiciones claras. Evita frases genéricas; usa lecturas breves pero específicas.
Incluye una conclusión final que resuma el sesgo y el mapa de niveles en 3-5 bullets.
Si el símbolo subyacente aparece en los prints, incluye el símbolo en keyTrades[].details.symbol (ej: SPX, SPXW, NDX).
Incluye lectura de prints grandes deep ITM solo como nota (no como nivel clave) si el OI es bajo.
Si hay mezcla de prints BID/ASK, deja claro si es venta de prima o compra agresiva.
En "expirations[].strikes" incluye los strikes más relevantes (6-10 por expiración) con prints/size/premium/OI y lectura rápida.
En "keyLevels" prioriza 4-6 niveles máximos y describe por qué dominan el tape.
IMPORTANTE: "keyLevels" YA viene calculado en el payload. Usa esos niveles tal cual para el análisis.
En "tradingPlan" debes mencionar explícitamente los niveles más fuertes de "keyLevels" (con el precio exacto).
No inventes niveles fuera de "keyLevels". Si necesitas citar niveles, elige de "keyLevels".
NO inventes datos ni conclusiones fuera del payload. Si falta data, dilo explícitamente.
No seas complaciente ni le digas al usuario lo que quiere escuchar: sé objetivo con la data.
Si dataQuality.isStale es true (expiraciones ya vencidas o timestamps viejos), indica que la data es vieja (-1DTE o anterior) y que el análisis es histórico.
Usa recentOutcomes solo como feedback contextual; no debe reemplazar la data actual.
Incluye en "riskNotes" un disclosure corto indicando que el análisis se basa solo en la data enviada y puede estar incompleto si faltan prints BID/ASK o filas.
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
IMPORTANT: "expirations" is already aggregated (prints/size/premium). Use it as the primary source.
Use "flowTotals" and "flowFeatures" (ask/bid ratios) to infer directional bias consistently.
Use "sampleRows" only as back-up context if needed.
Identify real levels (label pivot/supply/demand/wall/friction), contracts with most potential, and squeeze scenarios
with clear conditions. Avoid generic phrases; use concise, specific reads.
Include a final conclusion summarizing bias and the level map in 3-5 bullets.
If the underlying symbol appears in prints, include it in keyTrades[].details.symbol (e.g., SPX, SPXW, NDX).
Include large deep ITM prints only as a note (not a key level) if OI is low.
If prints mix BID/ASK, clarify whether it's premium selling or aggressive buying.
In "expirations[].strikes" include the most relevant strikes (6-10 per expiration) with prints/size/premium/OI and quick read.
In "keyLevels" prioritize 4-6 max levels and explain why they dominate the tape.
IMPORTANT: "keyLevels" is ALREADY computed in the payload. Use those exact levels for the analysis.
In "tradingPlan" you must explicitly mention the strongest levels from "keyLevels" (use the exact price values).
Do not invent levels outside "keyLevels". If you need levels, choose from "keyLevels".
Do NOT invent data or conclusions outside the payload. If data is missing, say it explicitly.
Do not be agreeable or tell the user what they want to hear; be objective with the data.
If dataQuality.isStale is true (expired dates or old timestamps), explicitly say the data is old (-1DTE or earlier) and the analysis is historical.
Use recentOutcomes only as contextual feedback; it must not override current data.
Include a short disclosure in "riskNotes" stating the analysis is based only on the provided data and may be incomplete if BID/ASK prints or rows are missing.
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

    let recentOutcomes: any[] = [];
    try {
      if (underlying) {
        const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabaseAdmin
          .from("option_flow_outcomes")
          .select("created_at, outcome_text, post_mortem")
          .eq("user_id", userId)
          .eq("underlying", underlying)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(4);
        if (Array.isArray(data)) {
          recentOutcomes = data.map((row) => ({
            date: row.created_at,
            outcome: row.outcome_text,
            postMortem: row.post_mortem,
          }));
        }
      }
    } catch {
      recentOutcomes = [];
    }

    const ocrRows = await extractRowsFromScreenshots(screenshotDataUrls ?? [], provider, lang);
    const mergedRawRows = [...(rows ?? []), ...ocrRows];
    let normalizedRows = dedupeRows(mergedRawRows.map((row) => normalizeFlowRow(row)));
    if (underlying) {
      const target = normalizeSymbol(underlying);
      if (target) {
        normalizedRows = normalizedRows.filter((row) => {
          const rowUnderlying = normalizeSymbol(row.underlying || row.symbol || "");
          return rowUnderlying && (rowUnderlying === target || rowUnderlying.startsWith(target));
        });
      }
    }

    const { expirationsList, flowTotals } = aggregateRows(normalizedRows);
    const deterministicExpirations = aggregateExpirations(expirationsList);
    const spotEstimate = estimateSpot(normalizedRows, previousClose ?? null);
    const filteredExpirations = filterExpirationsBySpot(deterministicExpirations, spotEstimate, 10);
    const deterministicKeyLevels = deriveKeyLevelsFromExpirations(
      filteredExpirations,
      lang,
      spotEstimate
    );
    const positioningStress = computeSqueezeCandidates(normalizedRows, 5);
    const dataQuality: DataQuality = {
      totalRows: normalizedRows.length,
      withSide: normalizedRows.filter((row) => row.side !== "UNKNOWN").length,
      withPremium: normalizedRows.filter((row) => Number.isFinite(row.premium)).length,
      withOi: normalizedRows.filter((row) => Number.isFinite(row.oi)).length,
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
      const askTotal = flowTotals.callPremiumAsk + flowTotals.putPremiumAsk;
      const bidTotal = flowTotals.callPremiumBid + flowTotals.putPremiumBid;
      const askRatio = (flowTotals.callPremiumAsk + 1) / (flowTotals.putPremiumAsk + 1);
      const bidRatio = (flowTotals.callPremiumBid + 1) / (flowTotals.putPremiumBid + 1);
      return {
        askTotal,
        bidTotal,
        askRatio,
        bidRatio,
      };
    })();

    const userPayload = {
      provider,
      underlying,
      previousClose,
      tradeIntent,
      analystNotes,
      recentMemory,
      recentOutcomes,
      dataQuality,
      flowTotals,
      flowFeatures,
      keyLevels: deterministicKeyLevels,
      expirations: filteredExpirations,
      positioningStress,
      sampleRows: safeRows(normalizedRows.map((row) => row.raw ?? row), 120),
    };

    const includeScreensForLLM =
      String(process.env.OPTIONFLOW_INCLUDE_SCREENSHOTS_LLM ?? "").toLowerCase() === "true";
    const hasScreens =
      includeScreensForLLM &&
      Array.isArray(screenshotDataUrls) &&
      screenshotDataUrls.length > 0;
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
      temperature: 0,
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
    const expirations = filteredExpirations;
    const contractsWithPotential =
      parsed?.contractsWithPotential && typeof parsed.contractsWithPotential === "object"
        ? parsed.contractsWithPotential
        : null;
    const squeezeScenarios =
      parsed?.squeezeScenarios && typeof parsed.squeezeScenarios === "object"
        ? parsed.squeezeScenarios
        : null;
    const keyLevels = deterministicKeyLevels;
    const flowBias = parsed?.flowBias ?? deriveFlowBiasFromTotals(flowTotals);
    const tradingPlan =
      parsed?.tradingPlan && typeof parsed.tradingPlan === "object" ? parsed.tradingPlan : null;

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
      flowBias,
      keyLevels,
      expirations,
      contractsWithPotential,
      positioningStress,
      squeezeScenarios,
      tradingPlan,
      notablePatterns: parsed?.notablePatterns ?? [],
      riskNotes: parsed?.riskNotes ?? [],
      suggestedFocus: parsed?.suggestedFocus ?? [],
      dataQuality,
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
