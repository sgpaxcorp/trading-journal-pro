import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type PushRow = {
  expo_push_token: string;
  locale: string | null;
  user_id: string;
  last_goal_notified_date?: string | null;
};

const NY_TZ = "America/New_York";

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken");
}

function getNyDateString() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function buildMessage(locale: string | null) {
  const isEs = String(locale || "").toLowerCase().startsWith("es");
  if (isEs) {
    return {
      title: "Neuro Trader Journal",
      body: "Meta diaria alcanzada. Bloquea la ganancia y protege tu disciplina.",
    };
  }
  return {
    title: "Neuro Trader Journal",
    body: "Daily goal achieved. Lock the win and protect discipline.",
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

async function handleRequest(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || "";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const vercelCronHeader = req.headers.get("x-vercel-cron");
    const isVercelCron = Boolean(vercelCronHeader) && vercelCronHeader !== "false";
    const hasValidSecret = secret && token === secret;
    if (!isVercelCron && !hasValidSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nyDate = getNyDateString();

    const { data: snapshots, error: snapError } = await supabaseAdmin
      .from("daily_snapshots")
      .select("user_id, goal_met")
      .eq("date", nyDate)
      .eq("goal_met", true);

    if (snapError) {
      return NextResponse.json({ error: snapError.message }, { status: 500 });
    }

    const goalUsers = new Set((snapshots ?? []).map((row: any) => String(row.user_id)));
    if (goalUsers.size === 0) {
      return NextResponse.json({ ok: true, sent: 0, detail: "No goal-met users today." });
    }

    const { data: tokens, error } = await supabaseAdmin
      .from("push_tokens")
      .select("expo_push_token, locale, user_id, last_goal_notified_date")
      .eq("daily_reminder_enabled", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (tokens ?? []) as PushRow[];
    const targetRows = rows.filter((row) => {
      if (!goalUsers.has(String(row.user_id))) return false;
      if (row.last_goal_notified_date === nyDate) return false;
      return isExpoPushToken(row.expo_push_token);
    });

    if (targetRows.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, detail: "No new tokens to notify." });
    }

    const messages = targetRows.map((row) => {
      const message = buildMessage(row.locale);
      return {
        to: row.expo_push_token,
        title: message.title,
        body: message.body,
        sound: "default",
        data: { screen: "Dashboard", type: "daily_goal" },
      };
    });

    const results = await sendExpoMessages(messages);

    const notifiedTokens = targetRows.map((row) => row.expo_push_token);
    if (notifiedTokens.length > 0) {
      await supabaseAdmin
        .from("push_tokens")
        .update({ last_goal_notified_date: nyDate, updated_at: new Date().toISOString() })
        .in("expo_push_token", notifiedTokens);
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
