import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { parseNotes } from "@/lib/journalNotes";

export const runtime = "nodejs";

async function resolveActiveAccountId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.active_account_id ?? null;
}

function toDateString(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

async function loadEntry(userId: string, date: string, accountId: string | null) {
  let q = supabaseAdmin
    .from("journal_entries")
    .select("notes")
    .eq("user_id", userId)
    .eq("date", date);
  if (accountId) q = q.eq("account_id", accountId);
  const { data, error } = await q.maybeSingle();
  if (error) return null;
  return data as any;
}

export async function GET(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    const date = toDateString(searchParams.get("date"));
    const requestedAccountId = searchParams.get("accountId") || "";
    const accountId = requestedAccountId || (await resolveActiveAccountId(userId));

    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

    let existing = await loadEntry(userId, date, accountId);
    if (!existing && email) {
      existing = await loadEntry(email, date, accountId);
    }

    const parsed = parseNotes(existing?.notes ?? "");

    return NextResponse.json({
      date,
      accountId: accountId ?? null,
      notes: {
        premarket: parsed.premarket ?? "",
        live: parsed.live ?? "",
        post: parsed.post ?? "",
      },
    });
  } catch (err: any) {
    console.error("[journal/notes] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
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
    const requestedAccountId = body?.accountId ? String(body.accountId) : "";
    const accountId = requestedAccountId || (await resolveActiveAccountId(userId));

    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

    const nextPremarket = typeof body?.premarket === "string" ? body.premarket : "";
    const nextLive = typeof body?.live === "string" ? body.live : "";
    const nextPost = typeof body?.post === "string" ? body.post : "";

    let existing = await loadEntry(userId, date, accountId);
    let targetUserId = userId;
    if (!existing && email) {
      const alt = await loadEntry(email, date, accountId);
      if (alt) {
        existing = alt;
        targetUserId = email;
      }
    }

    const parsed = parseNotes(existing?.notes ?? "");
    const nextNotes = JSON.stringify({
      ...parsed,
      premarket: nextPremarket,
      live: nextLive,
      post: nextPost,
    });

    if (!existing) {
      const { error: insErr } = await supabaseAdmin
        .from("journal_entries")
        .insert({
          user_id: targetUserId,
          account_id: accountId ?? null,
          date,
          notes: nextNotes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      if (insErr) throw insErr;
    } else {
      let updQuery = supabaseAdmin
        .from("journal_entries")
        .update({
          notes: nextNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", targetUserId)
        .eq("date", date);
      if (accountId) updQuery = updQuery.eq("account_id", accountId);
      const { error: updErr } = await updQuery;
      if (updErr) throw updErr;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[journal/notes] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
