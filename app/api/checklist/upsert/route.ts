// app/api/checklist/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type ChecklistItem = { text: string; done: boolean };

export async function POST(req: NextRequest) {
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

    const body = await req.json();

    const userId = authData.user.id;
    const date = String(body.date || "");
    const items = (body.items || []) as ChecklistItem[];
    const notes = body.notes === null || body.notes === undefined ? null : String(body.notes);

    if (!userId || !date) {
      return NextResponse.json({ error: "Missing userId or date" }, { status: 400 });
    }

    // Basic sanitization
    const safeItems = Array.isArray(items)
      ? items
          .map((it) => ({
            text: String(it?.text ?? "").trim(),
            done: !!it?.done,
          }))
          .filter((it) => it.text.length > 0)
      : [];

    // ✅ Table assumed: daily_checklists
    // Columns: user_id (text/uuid), date (date/text), items (jsonb), notes (text nullable), updated_at (timestamptz)
    const { error } = await supabaseAdmin.from("daily_checklists").upsert(
      {
        user_id: userId,
        date,
        items: safeItems,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
