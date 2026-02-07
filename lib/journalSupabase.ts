// lib/journalSupabase.ts
import { supabaseBrowser } from "@/lib/supaBaseClient";
import type { JournalEntry } from "@/lib/journalTypes";

const TABLE_NAME = "journal_entries" as const;
const LOG_PREFIX = "[journalSupabase]";

/* =========================
   Helpers
========================= */

function toDateString(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw);

  // Si ya viene tipo "2025-12-02"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (s.length >= 10) return s.slice(0, 10);

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toNumberOrNull(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toNumberOrZero(raw: unknown): number {
  const n = toNumberOrNull(raw);
  return n ?? 0;
}

function toStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? (raw as string[]) : [];
}

async function fetchJournalEntriesViaApi(opts?: { fromDate?: string; toDate?: string; accountId?: string | null }): Promise<any[] | null> {
  if (typeof window === "undefined") return null;
  try {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;

    const params = new URLSearchParams();
    if (opts?.fromDate) params.set("fromDate", opts.fromDate);
    if (opts?.toDate) params.set("toDate", opts.toDate);
    if (opts?.accountId) params.set("accountId", opts.accountId);

    const url = `/api/journal/list${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body?.entries) ? (body.entries as any[]) : [];
  } catch {
    return null;
  }
}

function normalizeEntry(entry: JournalEntry): JournalEntry {
  const cleanPnl =
    typeof entry.pnl === "number"
      ? Number.isFinite(entry.pnl)
        ? entry.pnl
        : 0
      : Number(entry.pnl ?? 0) || 0;

  return {
    ...entry,
    date: entry.date ? entry.date.slice(0, 10) : "",
    pnl: cleanPnl,
    screenshots: entry.screenshots ?? [],
    tags: entry.tags ?? [],
    notes: entry.notes ?? "",
    emotion: entry.emotion ?? "",
    respectedPlan:
      typeof entry.respectedPlan === "boolean" ? entry.respectedPlan : true,
  };
}

/* =========================
   row -> JournalEntry (columnas planas)
========================= */

function rowToJournalEntry(row: any): JournalEntry {
  return {
    date: toDateString(row.date),
    pnl: toNumberOrZero(row.pnl),
    instrument: row.instrument ?? undefined,
    direction: (row.direction ?? undefined) as any,

    entryPrice:
      row.entry_price != null ? toNumberOrNull(row.entry_price) ?? undefined : undefined,

    exitPrice:
      row.exit_price != null ? toNumberOrNull(row.exit_price) ?? undefined : undefined,

    size: row.size != null ? toNumberOrNull(row.size) ?? undefined : undefined,

    screenshots: toStringArray(row.screenshots),
    notes: row.notes ?? undefined,
    emotion: row.emotion ?? undefined,
    tags: toStringArray(row.tags),

    respectedPlan:
      typeof row.respected_plan === "boolean" ? row.respected_plan : true,
  };
}

/* =========================
   GET: todos los journals
========================= */

export async function getAllJournalEntries(userId: string, accountId?: string | null): Promise<JournalEntry[]> {
  if (!userId) return [];

  // Prefer server-side read (bypasses RLS / legacy id mismatches)
  const serverRows = await fetchJournalEntriesViaApi({ accountId });
  if (serverRows && serverRows.length > 0) {
    return serverRows.map(rowToJournalEntry);
  }

  let query = supabaseBrowser
    .from(TABLE_NAME)
    .select(
      "user_id, date, pnl, instrument, direction, entry_price, exit_price, size, screenshots, notes, emotion, tags, respected_plan, created_at, updated_at"
    )
    .eq("user_id", userId);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query.order("date", { ascending: true });

  if (error) {
    console.error(`${LOG_PREFIX} getAllJournalEntries error:`, error);
    return [];
  }

  return (data ?? []).map(rowToJournalEntry);
}

/* =========================
   GET: journal por fecha
========================= */

export async function getJournalEntryByDate(
  userId: string,
  date: string,
  accountId?: string | null
): Promise<JournalEntry | null> {
  if (!userId || !date) return null;

  let query = supabaseBrowser
    .from(TABLE_NAME)
    .select(
      "user_id, date, pnl, instrument, direction, entry_price, exit_price, size, screenshots, notes, emotion, tags, respected_plan, created_at, updated_at"
    )
    .eq("user_id", userId)
    .eq("date", date);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} getJournalEntryByDate error:`, error);
    return null;
  }

  return data ? rowToJournalEntry(data) : null;
}

/* =========================
   SAVE: upsert por (user_id,date)
========================= */

export async function saveJournalEntry(userId: string, entry: JournalEntry, accountId?: string | null): Promise<void> {
  if (!userId) throw new Error("Missing userId in saveJournalEntry");
  if (!entry?.date) throw new Error("Missing entry.date in saveJournalEntry");

  const normalized = normalizeEntry(entry);

  const row = {
    user_id: userId,
    account_id: accountId ?? null,
    date: normalized.date,
    pnl: normalized.pnl,

    instrument: normalized.instrument ?? null,
    direction: normalized.direction ?? null,

    entry_price: normalized.entryPrice ?? null,
    exit_price: normalized.exitPrice ?? null,
    size: normalized.size ?? null,

    screenshots: normalized.screenshots ?? [],
    notes: normalized.notes ?? "",
    emotion: normalized.emotion ?? "",
    tags: normalized.tags ?? [],
    respected_plan: normalized.respectedPlan ?? true,

    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseBrowser.from(TABLE_NAME).upsert(row, {
    onConflict: "user_id,date,account_id",
  });

  if (error) {
    console.error(`${LOG_PREFIX} saveJournalEntry error:`, error);
    throw error;
  }
}
