import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type PushRow = {
  expo_push_token: string;
  locale: string | null;
};

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken");
}

function buildMessage(locale: string | null) {
  const isEs = String(locale || "").toLowerCase().startsWith("es");
  if (isEs) {
    return {
      title: "Neuro Trader Journal",
      body: "No te olvides de llenar tu plan pre‑market en Neuro Trader Journal.",
    };
  }
  return {
    title: "Neuro Trader Journal",
    body: "Don't forget to fill out your pre‑market plan in Neuro Trader Journal.",
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

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || "";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!secret || token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("push_tokens")
      .select("expo_push_token, locale")
      .eq("daily_reminder_enabled", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as PushRow[];
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
    return NextResponse.json({ ok: true, sent: messages.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
