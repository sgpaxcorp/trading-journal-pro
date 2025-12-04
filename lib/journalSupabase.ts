// lib/journalSupabase.ts
import { supabase } from "@/lib/supaBaseClient";
import type { JournalEntry } from "@/lib/journalLocal";

const TABLE_NAME = "journal_entries" as const;
const LOG_PREFIX = "[journalSupabase]";

/* =========================
   Helpers de conversión
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

/* =========================
   row -> JournalEntry
   (lee principalmente row.data)
========================= */

function rowToJournalEntry(row: any): JournalEntry {
  // Supabase devuelve jsonb ya parseado como objeto JS
  const fromData =
    row && row.data && typeof row.data === "object" ? (row.data as any) : {};

  // Permitimos fallback a columnas planas por si en el futuro expandes
  const raw: any = { ...fromData, ...row };

  const dateStr = raw.date
    ? toDateString(raw.date)
    : row.date
    ? toDateString(row.date)
    : "";

  const pnlNum = toNumberOrZero(raw.pnl ?? row.pnl ?? 0);

  const entryPrice =
    raw.entryPrice != null
      ? toNumberOrNull(raw.entryPrice) ?? undefined
      : row.entry_price != null
      ? toNumberOrNull(row.entry_price) ?? undefined
      : undefined;

  const exitPrice =
    raw.exitPrice != null
      ? toNumberOrNull(raw.exitPrice) ?? undefined
      : row.exit_price != null
      ? toNumberOrNull(row.exit_price) ?? undefined
      : undefined;

  const size =
    raw.size != null
      ? toNumberOrNull(raw.size) ?? undefined
      : row.size != null
      ? toNumberOrNull(row.size) ?? undefined
      : undefined;

  const screenshots =
    raw.screenshots != null
      ? toStringArray(raw.screenshots)
      : toStringArray(row.screenshots);

  const tags =
    raw.tags != null ? toStringArray(raw.tags) : toStringArray(row.tags);

  const respectedPlan =
    typeof raw.respectedPlan === "boolean"
      ? raw.respectedPlan
      : typeof row.respected_plan === "boolean"
      ? row.respected_plan
      : true;

  return {
    date: dateStr,
    pnl: pnlNum,
    instrument: raw.instrument ?? row.instrument ?? "",
    direction: raw.direction ?? row.direction ?? "long",
    entryPrice,
    exitPrice,
    size,
    screenshots,
    notes: raw.notes ?? row.notes ?? "",
    emotion: raw.emotion ?? row.emotion ?? "",
    tags,
    respectedPlan,
  };
}

/* =========================
   Normalizar antes de guardar
========================= */

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
   GET: todos los journals
========================= */

/**
 * 📥 Devuelve TODOS los journals del usuario, ordenados por fecha ascendente.
 */
export async function getAllJournalEntries(
  userId: string
): Promise<JournalEntry[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("id, user_id, date, data, created_at, updated_at")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) {
    console.error(`${LOG_PREFIX} getAllJournalEntries error:`, error);
    return [];
  }

  if (!data) return [];

  return data.map(rowToJournalEntry);
}

/* =========================
   GET: journal por fecha
========================= */

/**
 * 📥 Devuelve UN journal por fecha (o null si no existe).
 */
export async function getJournalEntryByDate(
  userId: string,
  date: string
): Promise<JournalEntry | null> {
  if (!userId || !date) return null;

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("id, user_id, date, data, created_at, updated_at")
    .eq("user_id", userId)
    .eq("date", date)
    .limit(1);

  if (error) {
    console.error(`${LOG_PREFIX} getJournalEntryByDate error:`, error);
    return null;
  }

  const row = data?.[0];
  if (!row) return null;

  return rowToJournalEntry(row);
}

/* =========================
   SAVE: upsert de journal
========================= */

/**
 * 💾 Guarda / actualiza un journal.
 * - Guarda TODO el JournalEntry dentro de `data` (jsonb).
 * - Usa (user_id, date) como clave única (upsert).
 * - NO depende de columnas como `direction`, `pnl`, etc. a nivel de tabla.
 */
export async function saveJournalEntry(
  userId: string,
  entry: JournalEntry
): Promise<void> {
  if (!userId) throw new Error("Missing userId in saveJournalEntry");
  if (!entry?.date) throw new Error("Missing entry.date in saveJournalEntry");

  const normalized = normalizeEntry(entry);

  const row = {
    user_id: userId,
    date: normalized.date,
    data: normalized,
    // actualizamos manualmente la marca de tiempo
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert(row, {
      onConflict: "user_id,date",
    });

  if (error) {
    console.error(`${LOG_PREFIX} saveJournalEntry error:`, error);
    throw error;
  }
}
