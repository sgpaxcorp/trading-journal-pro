import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type PushRow = {
  expo_push_token: string;
  locale: string | null;
  user_id?: string | null;
};

const NY_TZ = "America/New_York";

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken");
}

function getNewYorkTimeParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday, hour, minute };
}

function shouldSendNowNY() {
  const { hour } = getNewYorkTimeParts();
  return hour === 9;
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

function buildMessage(locale: string | null) {
  const isEs = String(locale || "").toLowerCase().startsWith("es");
  if (isEs) {
    return {
      title: "Neuro Trader Journal",
      body: "El mercado abre en 30 minutos. Tiempo para prepararte.",
    };
  }
  return {
    title: "Neuro Trader Journal",
    body: "Market opens in 30 minutes. Time to prepare.",
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
    const body = await res.json().catch(() => ({}));
    results.push({ ok: res.ok, status: res.status, body });
  }
  return results;
}

async function fetchExpoReceipts(receiptIds: string[]) {
  if (receiptIds.length === 0) return null;
  const res = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: receiptIds }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function handleRequest(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const forceParam = url.searchParams.get("force");
    const force = forceParam === "1" || forceParam === "true";
    const body = force ? await req.json().catch(() => ({})) : {};
    const bodyToken =
      typeof (body as any)?.expoPushToken === "string" ? String((body as any).expoPushToken).trim() : "";
    const bodyLocale =
      typeof (body as any)?.locale === "string" ? String((body as any).locale).trim() : null;
    const forceBodyToken = force && bodyToken && isExpoPushToken(bodyToken);

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
    if (force && !isVercelCron && !hasValidSecret && !userId && !forceBodyToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!force && !shouldSendNowNY()) {
      return NextResponse.json({ ok: true, sent: 0, detail: "Outside 9:00 AM ET window." });
    }

    let rows: PushRow[] = [];
    if (forceBodyToken) {
      rows = [{ expo_push_token: bodyToken, locale: bodyLocale, user_id: userId }];
    } else {
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
      rows = (data ?? []) as PushRow[];
    }

    const messages = rows
      .filter((row) => isExpoPushToken(row.expo_push_token))
      .map((row) => {
        const message = buildMessage(row.locale);
        return {
          to: row.expo_push_token,
          title: message.title,
          body: message.body,
          sound: "default",
          data: { screen: "Dashboard", type: "daily_reminder" },
        };
      });

    if (messages.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, detail: "No tokens available." });
    }

    const results = await sendExpoMessages(messages);
    const receiptIds = results
      .flatMap((r) => (Array.isArray((r as any)?.body?.data) ? (r as any).body.data : []))
      .filter((item: any) => item?.status === "ok" && typeof item?.id === "string")
      .map((item: any) => item.id as string);

    if (force && receiptIds.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const receipts = await fetchExpoReceipts(receiptIds);
      return NextResponse.json({ ok: true, sent: messages.length, results, receipts });
    }

    return NextResponse.json({ ok: true, sent: messages.length, results });
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
