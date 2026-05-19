import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

type RegisterBody = {
  expoPushToken?: string;
  platform?: string;
  deviceId?: string;
  deviceName?: string;
  locale?: string;
  timezone?: string;
  dailyReminderEnabled?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const body = (await req.json()) as RegisterBody;
    const expoPushToken = String(body?.expoPushToken || "").trim();
    if (!expoPushToken) {
      return NextResponse.json({ error: "Missing expoPushToken" }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from("push_tokens")
      .select("id, daily_reminder_enabled")
      .eq("expo_push_token", expoPushToken)
      .maybeSingle();

    const dailyReminderEnabled =
      typeof body?.dailyReminderEnabled === "boolean"
        ? body.dailyReminderEnabled
        : existing?.daily_reminder_enabled ?? true;

    const payload = {
      user_id: access.context.userId,
      expo_push_token: expoPushToken,
      platform: body?.platform ?? null,
      device_id: body?.deviceId ?? null,
      device_name: body?.deviceName ?? null,
      locale: body?.locale ?? null,
      timezone: body?.timezone ?? null,
      daily_reminder_enabled: dailyReminderEnabled,
      updated_at: now,
      last_registered_at: now,
    };

    const { data, error } = await supabaseAdmin
      .from("push_tokens")
      .upsert(payload, { onConflict: "expo_push_token" })
      .select("expo_push_token, daily_reminder_enabled, locale, timezone, platform, device_name")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, token: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
