// lib/journalTradesSupabase.ts
import { supabaseBrowser } from "@/lib/supaBaseClient";
import type { TradesPayload, StoredTradeRow } from "@/lib/journalNotes";

const TABLE = "journal_trades";
type TradeLeg = "entry" | "exit";

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function toStrOrNull(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toTextArrayOrNull(v: any): string[] | null {
  if (v === null || v === undefined) return null;

  if (Array.isArray(v)) {
    const cleaned = v.map((x) => String(x).trim()).filter(Boolean);
    return cleaned.length ? cleaned : null;
  }

  const s = String(v).trim();
  if (!s) return null;

  // fallback: "a, b, c"
  const cleaned = s.split(",").map((x) => x.trim()).filter(Boolean);
  return cleaned.length ? cleaned : null;
}

function normalizeTimeForPgTime(raw: any): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.replace(/\s+/g, " ");
}

/**
 * Guarda trades del día (entries+exits) como filas.
 * Estrategia segura: delete + insert (idempotente por día).
 */
export async function saveJournalTradesForDay(
  userId: string,
  date: string, // YYYY-MM-DD
  payload: TradesPayload,
  accountId?: string | null
) {
  if (!userId) throw new Error("Missing userId");
  if (!date) throw new Error("Missing date");

  const entries = payload.entries ?? [];
  const exits = payload.exits ?? [];

  let delQuery = supabaseBrowser
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("journal_date", date);

  if (accountId) {
    delQuery = delQuery.eq("account_id", accountId);
  }

  const { error: delErr } = await delQuery;

  if (delErr) throw delErr;

  const rows = [
    ...entries.map((r) => mapRow(userId, date, "entry", r, accountId)),
    ...exits.map((r) => mapRow(userId, date, "exit", r, accountId)),
  ].filter(Boolean) as any[];

  if (rows.length === 0) return;

  const { error: insErr } = await supabaseBrowser.from(TABLE).insert(rows);
  if (insErr) throw insErr;
}

function mapRow(userId: string, date: string, leg: TradeLeg, r: StoredTradeRow, accountId?: string | null) {
  const premium = (r as any).premiumSide ?? (r as any).premium ?? null;
  const strategy = (r as any).optionStrategy ?? (r as any).strategy ?? null;

  const timeStr = (r as any).time ?? null;
  const pgTime = normalizeTimeForPgTime(timeStr);

  const dte = (r as any).dte ?? (r as any).DTE ?? null;

  // ✅ multi-select emotions (tu widget id es "emotional", pero en row debe ser emotions)
  const emotions =
    (r as any).emotions ??
    (r as any).emotion ??
    (r as any).emotional ??
    null;

  // ✅ multi-select strategy checklist
  const strategyChecklist =
    (r as any).strategyChecklist ??
    (r as any).strategy_checklist ??
    (r as any).checklist ??
    null;

  return {
    user_id: userId,
    account_id: accountId ?? null,
    journal_date: date,
    leg,

    symbol: String((r as any).symbol ?? "").trim(),
    kind: toStrOrNull((r as any).kind),

    side: toStrOrNull((r as any).side),
    premium: toStrOrNull(premium),
    strategy: toStrOrNull(strategy),

    price: toNumOrNull((r as any).price),
    quantity: toNumOrNull((r as any).quantity),

    time: toStrOrNull(timeStr),
    
    dte: toIntOrNull(dte),

    emotions: toTextArrayOrNull(emotions),
    strategy_checklist: toTextArrayOrNull(strategyChecklist),
  };
}

export async function getJournalTradesForDay(
  userId: string,
  date: string,
  accountId?: string | null
): Promise<TradesPayload> {
  if (!userId || !date) return {};

  let query = supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("journal_date", date);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query.order("id", { ascending: true });

  if (error) throw error;

  const entries: StoredTradeRow[] = [];
  const exits: StoredTradeRow[] = [];

  for (const row of data ?? []) {
    const out = mapDbRowToStoredTrade(row);
    if (row.leg === "entry") entries.push(out);
    else exits.push(out);
  }

  return { entries, exits };
}

function mapDbRowToStoredTrade(row: any): StoredTradeRow {
  const out: any = {
    id: String(row.id),
    symbol: row.symbol ?? "",
    kind: (row.kind ?? "other") as any,

    side: row.side ?? undefined,
    premiumSide: row.premium ?? undefined,
    optionStrategy: row.strategy ?? undefined,

    dte: row.dte ?? undefined,
    emotions: row.emotions ?? undefined,
    strategyChecklist: row.strategy_checklist ?? undefined,

    price: row.price != null ? Number(row.price) : 0,
    quantity: row.quantity != null ? Number(row.quantity) : 0,
    time: row.time ?? "",
  };

  return out as StoredTradeRow;
}

export async function getJournalTradesForDates(
  userId: string,
  dates: string[],
  accountId?: string | null
): Promise<Record<string, TradesPayload>> {
  if (!userId || !Array.isArray(dates) || dates.length === 0) return {};

  const uniqueDates = Array.from(
    new Set(
      dates
        .map((d) => String(d || "").slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    )
  );

  if (!uniqueDates.length) return {};

  let query = supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .in("journal_date", uniqueDates);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query.order("journal_date", { ascending: true }).order("id", { ascending: true });
  if (error) throw error;

  const map: Record<string, TradesPayload> = {};

  for (const row of data ?? []) {
    const date = String(row.journal_date || "").slice(0, 10);
    if (!date) continue;
    if (!map[date]) map[date] = { entries: [], exits: [] };
    const payload = map[date];
    const out = mapDbRowToStoredTrade(row);
    if (row.leg === "entry") payload.entries!.push(out);
    else payload.exits!.push(out);
  }

  return map;
}
