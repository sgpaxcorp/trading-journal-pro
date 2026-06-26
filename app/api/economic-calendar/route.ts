// app/api/economic-calendar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const TE_BASE_URL = "https://api.tradingeconomics.com/calendar";
const FETCH_TIMEOUT_MS = 6_000;
const MAX_CALENDAR_RANGE_DAYS = 45;
const VALID_IMPORTANCE = new Set(["1", "2", "3"]);

// Lee la API key desde variables de entorno
function getTradingEconomicsKey(): string {
  const key = process.env.TRADING_ECONOMICS_API_KEY;
  if (!key) {
    throw new Error(
      "Missing TRADING_ECONOMICS_API_KEY. Add it to your .env.local file."
    );
  }
  return key;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function dayDiff(start: string, end: string) {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  return Math.floor((endMs - startMs) / 86_400_000);
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      cache: "force-cache",
      next: { revalidate: 300 },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const limiter = await rateLimit(`economic-calendar:ip:${getClientIp(req)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limiter.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          ...rateLimitHeaders(limiter),
        },
      }
    );
  }

  const url = new URL(req.url);
  const country = (url.searchParams.get("country") || "united states").trim().toLowerCase(); // en minúsculas
  const start = url.searchParams.get("start"); // YYYY-MM-DD
  const end = url.searchParams.get("end"); // YYYY-MM-DD
  const importance = (url.searchParams.get("importance") || "").trim(); // "1", "2", "3" opcional

  if (!/^[a-z\s,.-]{2,64}$/i.test(country)) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }
  if ((start && !end) || (!start && end)) {
    return NextResponse.json({ error: "start and end must be provided together" }, { status: 400 });
  }
  if (start && end) {
    if (!isIsoDate(start) || !isIsoDate(end)) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    const rangeDays = dayDiff(start, end);
    if (rangeDays < 0 || rangeDays > MAX_CALENDAR_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Calendar range must be between 0 and ${MAX_CALENDAR_RANGE_DAYS} days.` },
        { status: 400 }
      );
    }
  }
  if (importance && !VALID_IMPORTANCE.has(importance)) {
    return NextResponse.json({ error: "Invalid importance" }, { status: 400 });
  }

  // Usamos el endpoint documented:
  // /calendar/country/{country}/{start}/{end}?c=API_KEY&importance=3
  // :contentReference[oaicite:0]{index=0}
  let path = `country/${encodeURIComponent(country)}`;
  if (start && end) {
    path += `/${start}/${end}`;
  }

  const params = new URLSearchParams();
  params.set("f", "json");
  if (importance) params.set("importance", importance);

  try {
    const apiKey = getTradingEconomicsKey();
    params.set("c", apiKey);
    const guardedRequestUrl = `${TE_BASE_URL}/${path}?${params.toString()}`;
    const resp = await fetchWithTimeout(guardedRequestUrl);

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[TradingEconomics] HTTP error", resp.status, text);
      return NextResponse.json(
        { error: "Error fetching data from TradingEconomics" },
        { status: 502 }
      );
    }

    const raw = (await resp.json()) as any[];

    // Normalizamos lo que necesitamos del calendario
    const events = raw.map((item) => ({
      id: item.CalendarId ?? item.calendarId ?? null,
      country: item.Country,
      event: item.Event,
      category: item.Category,
      date: item.Date,
      reference: item.Reference,
      actual: item.Actual,
      previous: item.Previous,
      forecast: item.Forecast ?? item.TEForecast,
      importance:
        typeof item.Importance === "number"
          ? item.Importance
          : Number(item.Importance ?? 0),
      currency: item.Currency,
      unit: item.Unit,
    }));

    return NextResponse.json(
      { events },
      {
        headers: {
          ...rateLimitHeaders(limiter),
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    console.error("[TradingEconomics] fetch failed", err);
    return NextResponse.json(
      { error: "Failed to contact TradingEconomics" },
      { status: 500 }
    );
  }
}
