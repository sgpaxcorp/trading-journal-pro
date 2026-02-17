import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type ChecklistItem = { text: string; done: boolean };

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const date = dateParam && dateParam.length >= 10 ? dateParam.slice(0, 10) : isoDate(new Date());

    const { data, error } = await supabaseAdmin
      .from("daily_checklists")
      .select("items, notes")
      .eq("user_id", authData.user.id)
      .eq("date", date)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = Array.isArray(data?.items) ? (data?.items as ChecklistItem[]) : [];
    const safeItems = items
      .map((item) => ({
        text: String(item?.text ?? "").trim(),
        done: !!item?.done,
      }))
      .filter((item) => item.text.length > 0);

    return NextResponse.json({
      date,
      items: safeItems,
      notes: data?.notes ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
