import { NextRequest, NextResponse } from "next/server";

import { buildAnnualMotivationMessage } from "@/lib/annualMotivation";
import { requireCronSecret } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 300;

type PushRow = {
  id: string;
  expo_push_token: string;
  locale: string | null;
  user_id: string;
};

type MotivationRow = {
  id: string;
  slug: string | null;
  locale: string;
  title: string | null;
  body: string;
  weekday: string | null;
  day_of_year: number | null;
  delivery_hour_ny: number | null;
  push_enabled: boolean | null;
  inapp_enabled: boolean | null;
};

const NY_TZ = "America/New_York";
const DEFAULT_HOUR_NY = 8;
const DEFAULT_MINUTE_NY = 30;

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken");
}

function getNewYorkParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayRaw = (parts.find((p) => p.type === "weekday")?.value ?? "Mon").toLowerCase();
  const weekdayMap: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekdayMap[weekdayRaw.slice(0, 3)] ?? "mon",
  };
}

function getNyDateString(now = new Date()) {
  const { year, month, day } = getNewYorkParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getNyDayOfYear(now = new Date()) {
  const { year, month, day } = getNewYorkParts(now);
  const startUtc = Date.UTC(year, 0, 1);
  const currentUtc = Date.UTC(year, month - 1, day);
  return Math.floor((currentUtc - startUtc) / 86400000) + 1;
}

function shouldSendNowNY(targetHour: number, targetMinute: number, now = new Date()) {
  const { hour, minute } = getNewYorkParts(now);
  const currentMinuteOfDay = hour * 60 + minute;
  const targetMinuteOfDay = targetHour * 60 + targetMinute;
  const diff = currentMinuteOfDay - targetMinuteOfDay;
  return diff >= 0 && diff < 4 * 60;
}

async function sendExpoMessages(messages: Array<Record<string, unknown>>) {
  const chunks: Array<Array<Record<string, unknown>>> = [];
  const size = 100;
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }

  const results: Array<{ ok: boolean; status: number; body: unknown }> = [];
  for (let index = 0; index < chunks.length; index += 10) {
    const groupResults = await Promise.all(
      chunks.slice(index, index + 10).map(async (chunk) => {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunk),
        });
        const body = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, body };
      })
    );
    results.push(...groupResults);
  }
  return results;
}

function collectExpoTickets(results: Array<{ ok: boolean; status: number; body: unknown }>) {
  const tickets: Array<{ id: string; messageIndex: number }> = [];
  let baseIndex = 0;
  for (const result of results) {
    const items = Array.isArray((result as any)?.body?.data) ? (result as any).body.data : [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item?.status === "ok" && typeof item?.id === "string") {
        tickets.push({ id: item.id, messageIndex: baseIndex + i });
      }
    }
    baseIndex += items.length;
  }
  return tickets;
}

async function getMotivationScheduleNy() {
  const { data, error } = await supabaseAdmin
    .from("admin_settings")
    .select("value_json")
    .eq("key", "daily_motivation_schedule")
    .maybeSingle();

  if (error) return { hour: DEFAULT_HOUR_NY, minute: DEFAULT_MINUTE_NY };
  const hour = Number((data as any)?.value_json?.hour_ny ?? DEFAULT_HOUR_NY);
  const minute = Number((data as any)?.value_json?.minute_ny ?? DEFAULT_MINUTE_NY);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { hour: DEFAULT_HOUR_NY, minute: DEFAULT_MINUTE_NY };
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { hour, minute: DEFAULT_MINUTE_NY };
  }
  return { hour, minute };
}

async function ensureFallbackMessage(localeCode: string, targetHour: number, dayOfYear: number) {
  const fallback = buildAnnualMotivationMessage(dayOfYear, localeCode);
  const slug = `motivation-${localeCode}-day-${String(dayOfYear).padStart(3, "0")}`;

  const { data, error } = await supabaseAdmin
    .from("motivational_messages")
    .upsert(
      {
        slug,
        locale: localeCode,
        title: fallback.title,
        body: fallback.body,
        weekday: null,
        day_of_year: dayOfYear,
        audience: "all",
        delivery_hour_ny: targetHour,
        active: true,
        push_enabled: true,
        inapp_enabled: true,
      },
      { onConflict: "slug" }
    )
    .select("id, slug, locale, title, body, weekday, day_of_year, delivery_hour_ny, push_enabled, inapp_enabled")
    .single();

  if (error) throw new Error(error.message);
  return data as MotivationRow;
}

function chooseMessageFromPool(pool: MotivationRow[], weekday: string, dayOfYear: number) {
  const exactDay = pool.find((row) => row.day_of_year === dayOfYear);
  if (exactDay) return exactDay;

  const weekdaySpecific = pool.find((row) => row.weekday === weekday);
  if (weekdaySpecific) return weekdaySpecific;

  return pool.find((row) => !row.weekday && row.day_of_year == null) ?? null;
}

async function fetchMessage(locale: string | null, targetHour: number, now = new Date()) {
  const dayOfYear = getNyDayOfYear(now);
  const weekday = getNewYorkParts(now).weekday;
  const localeCode = String(locale || "en").toLowerCase().startsWith("es") ? "es" : "en";

  const { data, error } = await supabaseAdmin
    .from("motivational_messages")
    .select("id, slug, locale, title, body, weekday, day_of_year, delivery_hour_ny, push_enabled, inapp_enabled")
    .eq("active", true)
    .in("locale", [localeCode, "en"]);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MotivationRow[];
  const exactHourRows = rows.filter((row) => {
    const hour = typeof row.delivery_hour_ny === "number" ? row.delivery_hour_ny : targetHour;
    return hour === targetHour;
  });
  const candidateRows = exactHourRows.length ? exactHourRows : rows;

  const localeRows = candidateRows.filter((row) => row.locale === localeCode);
  const fallbackRows = candidateRows.filter((row) => row.locale === "en");

  const localized = chooseMessageFromPool(localeRows, weekday, dayOfYear);
  if (localized) return localized;

  const english = chooseMessageFromPool(fallbackRows, weekday, dayOfYear);
  if (english) return english;

  return ensureFallbackMessage(localeCode, targetHour, dayOfYear);
}

async function handleRequest(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const forceParam = url.searchParams.get("force");
    const force = forceParam === "1" || forceParam === "true";
    const cronAuth = requireCronSecret(req);
    if (!cronAuth.ok) return cronAuth.response;

    const body = force ? await req.json().catch(() => ({})) : {};
    const userId = force && typeof (body as any)?.userId === "string" ? String((body as any).userId).trim() : null;

    const targetSchedule = await getMotivationScheduleNy();
    if (!force && !shouldSendNowNY(targetSchedule.hour, targetSchedule.minute)) {
      const label = `${String(targetSchedule.hour).padStart(2, "0")}:${String(targetSchedule.minute).padStart(2, "0")} ET`;
      return NextResponse.json({ ok: true, sent: 0, detail: `Outside ${label} delivery window.` });
    }

    const deliveryDate = getNyDateString();
    const { data, error } = await supabaseAdmin.rpc("claim_daily_motivation_tokens", {
      p_delivery_date: deliveryDate,
      p_limit: 750,
      p_user_id: userId || null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as PushRow[];
    if (!rows.length) {
      return NextResponse.json({ ok: true, sent: 0, detail: "No tokens available." });
    }

    const [englishMessage, spanishMessage] = await Promise.all([
      fetchMessage("en", targetSchedule.hour),
      fetchMessage("es", targetSchedule.hour),
    ]);
    const messageByLocale = new Map<string, MotivationRow>([
      ["en", englishMessage],
      ["es", spanishMessage],
    ]);
    const messages: Array<Record<string, unknown>> = [];
    const pendingPushDeliveries: Array<{ tokenId: string; userId: string; messageId: string }> = [];
    const inAppDeliveries: Array<{
      user_id: string;
      message_id: string;
      title: string;
      message: string;
    }> = [];
    let pushCount = 0;
    let inAppCount = 0;

    for (const row of rows) {
      const localeCode = String(row.locale || "en").toLowerCase().startsWith("es") ? "es" : "en";
      const motivation = messageByLocale.get(localeCode) || englishMessage;
      const title = String(motivation.title || "Neuro Trader");
      const bodyText = String(motivation.body || "").trim();
      if (!bodyText) continue;

      if (motivation.inapp_enabled !== false) {
        inAppDeliveries.push({
          user_id: row.user_id,
          message_id: motivation.id,
          title,
          message: bodyText,
        });
      }

      if (!isExpoPushToken(row.expo_push_token) || motivation.push_enabled === false) continue;

      messages.push({
        to: row.expo_push_token,
        title,
        body: bodyText,
        sound: "default",
        data: { screen: "Messages", type: "daily_motivation", category: "motivation", messageId: motivation.id },
      });
      pendingPushDeliveries.push({ tokenId: row.id, userId: row.user_id, messageId: motivation.id });
    }

    if (inAppDeliveries.length) {
      const uniqueInApp = Array.from(
        new Map(inAppDeliveries.map((item) => [item.user_id, item])).values()
      );
      const { data: inserted, error: inAppError } = await supabaseAdmin.rpc(
        "record_daily_motivation_inapp",
        { p_deliveries: uniqueInApp, p_delivery_date: deliveryDate }
      );
      if (inAppError) throw new Error(inAppError.message);
      inAppCount = Number(inserted ?? 0);
    }

    if (!messages.length) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        inbox: inAppCount,
        detail: "No push messages queued.",
      });
    }

    const results = await sendExpoMessages(messages);
    const okTickets = collectExpoTickets(results);

    const acceptedTokenIds = new Set<string>();
    const acceptedDeliveries: Array<{
      message_id: string;
      user_id: string;
      delivery_date: string;
      channel: "push";
    }> = [];
    for (const ticket of okTickets) {
      const pending = pendingPushDeliveries[ticket.messageIndex];
      if (!pending) continue;
      acceptedTokenIds.add(pending.tokenId);
      acceptedDeliveries.push({
        message_id: pending.messageId,
        user_id: pending.userId,
        delivery_date: deliveryDate,
        channel: "push",
      });
      pushCount += 1;
    }

    if (acceptedDeliveries.length) {
      const { error: deliveryErr } = await supabaseAdmin
        .from("motivational_message_deliveries")
        .upsert(acceptedDeliveries, {
          onConflict: "message_id,user_id,delivery_date,channel",
          ignoreDuplicates: true,
        });
      if (deliveryErr) throw new Error(deliveryErr.message);
    }

    const failedTokenIds = pendingPushDeliveries
      .filter((delivery) => !acceptedTokenIds.has(delivery.tokenId))
      .map((delivery) => delivery.tokenId);
    if (failedTokenIds.length) {
      await supabaseAdmin.rpc("release_daily_motivation_tokens", {
        p_ids: failedTokenIds,
        p_delivery_date: deliveryDate,
      });
    }

    return NextResponse.json({
      ok: true,
      sent: pushCount,
      inbox: inAppCount,
      attempted: messages.length,
      failed: failedTokenIds.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}
