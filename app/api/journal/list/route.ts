import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

function toDateOnly(s: string | null): string {
  if (!s) return "";
  const str = String(s);
  if (str.length >= 10) return str.slice(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

async function fetchJournalEntriesByUserId(
  userId: string,
  fromDate?: string,
  toDate?: string,
  accountId?: string | null
) {
  let q = supabaseAdmin
    .from("journal_entries")
    .select(
      "user_id, date, pnl, instrument, direction, entry_price, exit_price, size, screenshots, notes, emotion, tags, respected_plan, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("date", { ascending: true });
  if (accountId) q = q.eq("account_id", accountId);

  if (fromDate) q = q.gte("date", fromDate);
  if (toDate) q = q.lte("date", toDate);

  return q;
}

async function resolveActiveAccountId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.active_account_id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ entries: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ entries: [] }, { status: 401 });
    }

    const userId = authData.user.id;
    const email = authData.user.email ?? "";
    const legacyUid =
      (authData.user.user_metadata as any)?.uid ||
      (authData.user.user_metadata as any)?.legacy_uid ||
      (authData.user.user_metadata as any)?.legacy_user_id ||
      (authData.user.user_metadata as any)?.user_uid ||
      "";

    const { searchParams } = new URL(req.url);
    const fromDate = toDateOnly(searchParams.get("fromDate"));
    const toDate = toDateOnly(searchParams.get("toDate"));
    const requestedAccountId = searchParams.get("accountId") || "";
    const accountId = requestedAccountId || (await resolveActiveAccountId(userId));

    // First attempt: uuid user id
    let { data, error } = await fetchJournalEntriesByUserId(userId, fromDate, toDate, accountId);
    if (error) throw error;

    // Fallback: legacy rows stored by email
    if ((!data || data.length === 0) && email) {
      try {
        const alt = await fetchJournalEntriesByUserId(email, fromDate, toDate, accountId);
        data = alt.data as any[] | null;
        error = alt.error;
        if (error) {
          // ignore email mismatch errors (e.g., uuid column)
          data = data ?? [];
        }
      } catch {
        // ignore
      }
    }

    // Fallback: legacy uid stored in user_metadata (older accounts)
    if ((!data || data.length === 0) && legacyUid) {
      try {
        const alt = await fetchJournalEntriesByUserId(String(legacyUid), fromDate, toDate, accountId);
        data = alt.data as any[] | null;
        error = alt.error;
        if (error) {
          data = data ?? [];
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (err: any) {
    console.error("[journal/list] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error", entries: [] }, { status: 500 });
  }
}
