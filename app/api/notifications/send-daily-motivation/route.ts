import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type PushRow = {
  expo_push_token: string;
  locale: string | null;
  user_id?: string | null;
};

type MotivationRow = {
  id: string;
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
const MOTIVATION_RULE_KEY = "daily_motivation";
const DEFAULT_HOUR_NY = 13;

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

function shouldSendNowNY(targetHour: number, now = new Date()) {
  const { hour } = getNewYorkParts(now);
  return hour === targetHour;
}

function tryDecodeUserId(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return typeof decoded?.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

function fallbackMessageForWeekday(weekday: string, locale: string | null) {
  const isEs = String(locale || "").toLowerCase().startsWith("es");
  if (weekday === "fri") {
    return isEs
      ? {
          title: "Neuro Trader Journal",
          body: "Viernes: cierra la semana con disciplina. Protege lo ganado y termina limpio.",
        }
      : {
          title: "Neuro Trader Journal",
          body: "Friday: close the week with discipline. Protect gains and finish clean.",
        };
  }
  if (weekday === "sat") {
    return isEs
      ? {
          title: "Neuro Trader Journal",
          body: "Sabado: suelta el mercado, descansa y recarga la mente.",
        }
      : {
          title: "Neuro Trader Journal",
          body: "Saturday: let the market go, rest, and reset your mind.",
        };
  }
  if (weekday === "sun") {
    return isEs
      ? {
          title: "Neuro Trader Journal",
          body: "Domingo: preparacion. Revisa tu plan, tu calendario y entra a la semana con claridad.",
        }
      : {
          title: "Neuro Trader Journal",
          body: "Sunday: preparation day. Review your plan, your calendar, and enter the week with clarity.",
        };
  }
  return isEs
    ? {
        title: "Neuro Trader Journal",
        body: "Un dia disciplinado vale mas que un impulso brillante. Ejecuta tu proceso.",
      }
    : {
        title: "Neuro Trader Journal",
        body: "A disciplined day beats a brilliant impulse. Execute your process.",
      };
}

async function sendExpoMessages(messages: Array<Record<string, unknown>>) {
  const chunks: Array<Array<Record<string, unknown>>> = [];
  const size = 100;
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }

  const results: Array<{ ok: boolean; status: number; body: unknown }> = [];
  for (const chunk of chunks) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    const body = await res.json().catch(() => ({}));
    results.push({ ok: res.ok, status: res.status, body });
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

async function ensureRule(userId: string, title: string, message: string) {
  const { data: existingRule, error: ruleErr } = await supabaseAdmin
    .from("ntj_alert_rules")
    .select("id")
    .eq("user_id", userId)
    .eq("key", MOTIVATION_RULE_KEY)
    .maybeSingle();

  if (ruleErr) throw new Error(ruleErr.message);

  let ruleId = (existingRule as any)?.id ? String((existingRule as any).id) : "";
  if (ruleId) return ruleId;

  const { data: createdRule, error: createErr } = await supabaseAdmin
    .from("ntj_alert_rules")
    .insert({
      user_id: userId,
      key: MOTIVATION_RULE_KEY,
      trigger_type: "daily_motivation",
      title,
      message,
      severity: "info",
      enabled: true,
      channels: ["inapp"],
      config: { source: "system", core: true, kind: "reminder", category: "motivation" },
    })
    .select("id")
    .single();

  if (createErr) throw new Error(createErr.message);
  return String((createdRule as any)?.id || "");
}

async function getMotivationHourNy() {
  const { data, error } = await supabaseAdmin
    .from("admin_settings")
    .select("value_json")
    .eq("key", "daily_motivation_schedule")
    .maybeSingle();

  if (error) return DEFAULT_HOUR_NY;
  const hour = Number((data as any)?.value_json?.hour_ny ?? DEFAULT_HOUR_NY);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return DEFAULT_HOUR_NY;
  return hour;
}

async function insertInAppEvent(params: {
  userId: string;
  title: string;
  message: string;
  messageId: string;
  deliveryDate: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from("motivational_message_deliveries")
    .select("id")
    .eq("message_id", params.messageId)
    .eq("user_id", params.userId)
    .eq("delivery_date", params.deliveryDate)
    .eq("channel", "inapp")
    .maybeSingle();

  if (existing?.id) return;

  const ruleId = await ensureRule(params.userId, params.title, params.message);
  const nowIso = new Date().toISOString();

  const { error: eventErr } = await supabaseAdmin.from("ntj_alert_events").insert({
    user_id: params.userId,
    rule_id: ruleId,
    date: params.deliveryDate,
    status: "active",
    triggered_at: nowIso,
    dismissed_until: null,
    acknowledged_at: null,
    payload: {
      title: params.title,
      message: params.message,
      severity: "info",
      channels: ["inapp"],
      kind: "reminder",
      category: "motivation",
      message_id: params.messageId,
    },
  });

  if (eventErr) throw new Error(eventErr.message);

  const { error: deliveryErr } = await supabaseAdmin.from("motivational_message_deliveries").insert({
    message_id: params.messageId,
    user_id: params.userId,
    delivery_date: params.deliveryDate,
    channel: "inapp",
  });

  if (deliveryErr && deliveryErr.code !== "23505") {
    throw new Error(deliveryErr.message);
  }
}

async function fetchMessage(locale: string | null, targetHour: number, now = new Date()) {
  const dayOfYear = getNyDayOfYear(now);
  const weekday = getNewYorkParts(now).weekday;
  const localeCode = String(locale || "en").toLowerCase().startsWith("es") ? "es" : "en";

  const { data, error } = await supabaseAdmin
    .from("motivational_messages")
    .select("id, locale, title, body, weekday, day_of_year, delivery_hour_ny, push_enabled, inapp_enabled")
    .eq("active", true)
    .in("locale", [localeCode, "en"]);

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as MotivationRow[]).filter((row) => {
    const hour = typeof row.delivery_hour_ny === "number" ? row.delivery_hour_ny : DEFAULT_HOUR_NY;
    return hour === targetHour;
  });

  const localeRows = rows.filter((row) => row.locale === localeCode);
  const fallbackRows = rows.filter((row) => row.locale === "en");
  const pool = localeRows.length ? localeRows : fallbackRows;

  const weekdaySpecific = pool.find((row) => row.weekday === weekday);
  if (weekdaySpecific) return weekdaySpecific;

  const exactDay = pool.find((row) => row.day_of_year === dayOfYear);
  if (exactDay) return exactDay;

  const generic = pool.find((row) => !row.weekday && row.day_of_year == null);
  if (generic) return generic;

  const fallback = fallbackMessageForWeekday(weekday, localeCode);
  return {
    id: `fallback-${localeCode}-${weekday}-${dayOfYear}`,
    locale: localeCode,
    title: fallback.title,
    body: fallback.body,
    weekday: weekday,
    day_of_year: dayOfYear,
    delivery_hour_ny: DEFAULT_HOUR_NY,
    push_enabled: true,
    inapp_enabled: true,
  } satisfies MotivationRow;
}

async function handleRequest(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const forceParam = url.searchParams.get("force");
    const force = forceParam === "1" || forceParam === "true";
    const body = force ? await req.json().catch(() => ({})) : {};

    const secret = process.env.CRON_SECRET || "";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const vercelCronHeader = req.headers.get("x-vercel-cron");
    const isVercelCron = Boolean(vercelCronHeader) && vercelCronHeader !== "false";
    const hasValidSecret = secret && token === secret;
    let userId: string | null = null;

    if (force && token && !hasValidSecret) {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (!authErr && authData?.user?.id) {
        userId = authData.user.id;
      } else {
        userId = tryDecodeUserId(token);
      }
    }

    if (!force && !isVercelCron && !hasValidSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (force && !isVercelCron && !hasValidSecret && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetHour = await getMotivationHourNy();
    if (!force && !shouldSendNowNY(targetHour)) {
      return NextResponse.json({ ok: true, sent: 0, detail: `Outside ${targetHour}:00 ET window.` });
    }

    let query = supabaseAdmin
      .from("push_tokens")
      .select("expo_push_token, locale, user_id")
      .eq("daily_reminder_enabled", true);
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as PushRow[];
    if (!rows.length) {
      return NextResponse.json({ ok: true, sent: 0, detail: "No tokens available." });
    }

    const deliveryDate = getNyDateString();
    const messages: Array<Record<string, unknown>> = [];
    const pendingPushDeliveries: Array<{ userId: string; messageId: string }> = [];
    let pushCount = 0;
    let inAppCount = 0;

    for (const row of rows) {
      if (!row.user_id) continue;
      const motivation = await fetchMessage(row.locale, targetHour);
      const title = String(motivation.title || "Neuro Trader Journal");
      const bodyText = String(motivation.body || "").trim();
      if (!bodyText) continue;

      if (motivation.inapp_enabled !== false) {
        await insertInAppEvent({
          userId: row.user_id,
          title,
          message: bodyText,
          messageId: motivation.id,
          deliveryDate,
        });
        inAppCount += 1;
      }

      if (!isExpoPushToken(row.expo_push_token) || motivation.push_enabled === false) continue;

      const { data: existingPush } = await supabaseAdmin
        .from("motivational_message_deliveries")
        .select("id")
        .eq("message_id", motivation.id)
        .eq("user_id", row.user_id)
        .eq("delivery_date", deliveryDate)
        .eq("channel", "push")
        .maybeSingle();

      if (existingPush?.id) continue;

      messages.push({
        to: row.expo_push_token,
        title,
        body: bodyText,
        sound: "default",
        data: { screen: "Messages", type: "daily_motivation", category: "motivation", messageId: motivation.id },
      });
      pendingPushDeliveries.push({ userId: row.user_id, messageId: motivation.id });
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

    for (const ticket of okTickets) {
      const pending = pendingPushDeliveries[ticket.messageIndex];
      if (!pending) continue;
      const { error: deliveryErr } = await supabaseAdmin.from("motivational_message_deliveries").insert({
        message_id: pending.messageId,
        user_id: pending.userId,
        delivery_date: deliveryDate,
        channel: "push",
      });

      if (deliveryErr && deliveryErr.code !== "23505") {
        throw new Error(deliveryErr.message);
      }
      pushCount += 1;
    }

    return NextResponse.json({
      ok: true,
      sent: pushCount,
      inbox: inAppCount,
      results,
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
