// app/api/economic-calendar/route.ts
import { NextRequest, NextResponse } from "next/server";

const TE_BASE_URL = "https://api.tradingeconomics.com/calendar";

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const country = url.searchParams.get("country") || "united states"; // en minúsculas
  const start = url.searchParams.get("start"); // YYYY-MM-DD
  const end = url.searchParams.get("end"); // YYYY-MM-DD
  const importance = url.searchParams.get("importance") || ""; // "1", "2", "3" opcional

  const apiKey = getTradingEconomicsKey();

  // Usamos el endpoint documented:
  // /calendar/country/{country}/{start}/{end}?c=API_KEY&importance=3
  // :contentReference[oaicite:0]{index=0}
  let path = `country/${encodeURIComponent(country)}`;
  if (start && end) {
    path += `/${start}/${end}`;
  }

  const params = new URLSearchParams();
  params.set("c", apiKey);
  params.set("f", "json");
  if (importance) params.set("importance", importance);

  const requestUrl = `${TE_BASE_URL}/${path}?${params.toString()}`;

  try {
    const resp = await fetch(requestUrl, {
      // pequeño timeout razonable (opcional)
      cache: "no-store",
    });

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

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[TradingEconomics] fetch failed", err);
    return NextResponse.json(
      { error: "Failed to contact TradingEconomics" },
      { status: 500 }
    );
  }
}
