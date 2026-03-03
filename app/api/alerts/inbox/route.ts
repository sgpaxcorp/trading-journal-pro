import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getAuthUser } from "@/lib/authServer";

const SYSTEM_RULE_KEY = "ai_coach_plan";

function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const title = String(body?.title ?? "AI Coaching update").trim();
    const message = String(body?.message ?? "").trim();
    const category = String(body?.category ?? "ai_coach").trim();

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const { data: existingRule, error: ruleErr } = await supabaseAdmin
      .from("ntj_alert_rules")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("key", SYSTEM_RULE_KEY)
      .maybeSingle();

    if (ruleErr) {
      return NextResponse.json({ error: ruleErr.message }, { status: 500 });
    }

    let ruleId = (existingRule as any)?.id ? String((existingRule as any).id) : "";
    if (!ruleId) {
      const { data: createdRule, error: createErr } = await supabaseAdmin
        .from("ntj_alert_rules")
        .insert({
          user_id: auth.userId,
          key: SYSTEM_RULE_KEY,
          trigger_type: "system_notice",
          title,
          message,
          severity: "info",
          enabled: true,
          channels: ["inapp"],
          config: { source: "system", core: true, kind: "reminder", category: "ai_coach" },
        })
        .select("id")
        .single();

      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 500 });
      }
      ruleId = String((createdRule as any)?.id || "");
    }

    const now = new Date();
    const { error: eventErr } = await supabaseAdmin.from("ntj_alert_events").insert({
      user_id: auth.userId,
      rule_id: ruleId,
      date: isoDate(now),
      status: "active",
      triggered_at: now.toISOString(),
      dismissed_until: null,
      acknowledged_at: null,
      payload: {
        title,
        message,
        severity: "info",
        channels: ["inapp"],
        kind: "reminder",
        category,
      },
    });

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
