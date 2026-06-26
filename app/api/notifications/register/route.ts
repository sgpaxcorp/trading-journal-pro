import { NextRequest, NextResponse } from "next/server";

import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
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

const MAX_PUSH_TOKENS_PER_USER = 12;
const EXPO_PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9._:-]+\]$/;

function cleanText(value: unknown, maxLength: number) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanPlatform(value: unknown) {
  const platform = cleanText(value, 16)?.toLowerCase();
  return platform === "ios" || platform === "android" || platform === "web" ? platform : null;
}

function isValidExpoPushToken(value: string) {
  return value.length <= 220 && EXPO_PUSH_TOKEN_PATTERN.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const limiter = await rateLimit(`push-register:${access.context.userId}:${getClientIp(req)}`, {
      limit: 30,
      windowMs: 10 * 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many notification registration attempts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = (await req.json().catch(() => ({}))) as RegisterBody;
    const expoPushToken = String(body?.expoPushToken || "").trim();
    if (!isValidExpoPushToken(expoPushToken)) {
      return NextResponse.json({ error: "Valid expoPushToken is required." }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from("push_tokens")
      .select("id, user_id, daily_reminder_enabled")
      .eq("expo_push_token", expoPushToken)
      .maybeSingle();

    const existingBelongsToUser = String(existing?.user_id ?? "") === access.context.userId;

    if (!existingBelongsToUser) {
      const { count, error: countError } = await supabaseAdmin
        .from("push_tokens")
        .select("id", { count: "exact", head: true })
        .eq("user_id", access.context.userId);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if ((count ?? 0) >= MAX_PUSH_TOKENS_PER_USER) {
        return NextResponse.json(
          { error: "Device notification limit reached for this account." },
          { status: 403 }
        );
      }
    }

    const dailyReminderEnabled =
      typeof body?.dailyReminderEnabled === "boolean"
        ? body.dailyReminderEnabled
        : existingBelongsToUser
          ? existing?.daily_reminder_enabled ?? true
          : true;

    const payload = {
      user_id: access.context.userId,
      expo_push_token: expoPushToken,
      platform: cleanPlatform(body?.platform),
      device_id: cleanText(body?.deviceId, 128),
      device_name: cleanText(body?.deviceName, 128),
      locale: cleanText(body?.locale, 16),
      timezone: cleanText(body?.timezone, 64),
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
