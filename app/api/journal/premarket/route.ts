import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { parseNotes } from "@/lib/journalNotes";

export const runtime = "nodejs";

function toDateString(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;
    const email = authData.user.email ?? null;

    const body = await req.json();
    const date = toDateString(body?.date);
    const premarketHtml = String(body?.premarket ?? "").trim();

    if (!date || !premarketHtml) {
      return NextResponse.json({ error: "Missing date or premarket content" }, { status: 400 });
    }

    async function loadEntry(uid: string) {
      const { data, error } = await supabaseAdmin
        .from("journal_entries")
        .select("notes")
        .eq("user_id", uid)
        .eq("date", date)
        .maybeSingle();
      if (error) return null;
      return data as any;
    }

    let existing = await loadEntry(userId);
    let targetUserId = userId;

    if (!existing && email) {
      const alt = await loadEntry(email);
      if (alt) {
        existing = alt;
        targetUserId = email;
      }
    }

    const parsed = parseNotes(existing?.notes ?? "");
    const nextNotes = JSON.stringify({
      ...parsed,
      premarket: premarketHtml,
    });

    if (!existing) {
      const { error: insErr } = await supabaseAdmin
        .from("journal_entries")
        .insert({
          user_id: targetUserId,
          date,
          notes: nextNotes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insErr) throw insErr;
    } else {
      const { error: updErr } = await supabaseAdmin
        .from("journal_entries")
        .update({
          notes: nextNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", targetUserId)
        .eq("date", date);

      if (updErr) throw updErr;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[journal/premarket] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
