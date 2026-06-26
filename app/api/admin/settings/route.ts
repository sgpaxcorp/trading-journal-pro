import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, { action: "settings:read", limit: 120, windowMs: 60_000 });
    if (!admin.ok) return admin.response;

    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .select("key, value_json, updated_at")
      .eq("key", "daily_motivation_schedule")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const value = (data as any)?.value_json ?? { hour_ny: 8, minute_ny: 30, label: "8:30 AM ET" };
    return NextResponse.json({
      dailyMotivationSchedule: {
        hourNy: Number(value?.hour_ny ?? 8),
        minuteNy: Number(value?.minute_ny ?? 30),
        label: String(value?.label ?? "8:30 AM ET"),
        updatedAt: (data as any)?.updated_at ?? null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, { action: "settings:write", limit: 20, windowMs: 10 * 60_000 });
    if (!admin.ok) return admin.response;

    const body = await req.json().catch(() => ({}));
    const hourNy = Number(body?.hourNy);
    const minuteNy = Number(body?.minuteNy ?? 0);

    if (!Number.isInteger(hourNy) || hourNy < 0 || hourNy > 23) {
      return NextResponse.json({ error: "Invalid hourNy" }, { status: 400 });
    }
    if (!Number.isInteger(minuteNy) || minuteNy < 0 || minuteNy > 59) {
      return NextResponse.json({ error: "Invalid minuteNy" }, { status: 400 });
    }
    if (minuteNy !== 0 && minuteNy !== 30) {
      return NextResponse.json({ error: "Only :00 and :30 scheduling is supported right now." }, { status: 400 });
    }

    const minuteLabel = String(minuteNy).padStart(2, "0");
    const label24 = `${String(hourNy).padStart(2, "0")}:${minuteLabel} ET`;
    const humanHour = hourNy === 0 ? 12 : hourNy > 12 ? hourNy - 12 : hourNy;
    const ampm = hourNy >= 12 ? "PM" : "AM";
    const label = `${humanHour}:${minuteLabel} ${ampm} ET`;

    const { error } = await supabaseAdmin.from("admin_settings").upsert(
      {
        key: "daily_motivation_schedule",
        value_json: {
          hour_ny: hourNy,
          minute_ny: minuteNy,
          label,
          label_24: label24,
        },
        updated_by: admin.user.id,
      },
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      dailyMotivationSchedule: {
        hourNy,
        minuteNy,
        label,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
