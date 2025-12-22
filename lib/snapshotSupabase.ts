// lib/snapshotsSupabase.ts
import { supabaseBrowser } from "@/lib/supaBaseClient";

export type DailySnapshotRow = {
  user_id: string;
  date: string; // "YYYY-MM-DD"
  start_of_day_balance: number;
  expected_usd: number;
  realized_usd: number;
  delta_usd: number;
  goal_met: boolean;
  created_at?: string;
  updated_at?: string;
};

const TABLE = "daily_snapshots";

function toNumber(x: any): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

export async function upsertDailySnapshot(row: DailySnapshotRow) {
  const { error } = await supabaseBrowser.from(TABLE).upsert(
    {
      user_id: row.user_id,
      date: row.date,
      start_of_day_balance: row.start_of_day_balance,
      expected_usd: row.expected_usd,
      realized_usd: row.realized_usd,
      delta_usd: row.delta_usd,
      goal_met: row.goal_met,
    },
    { onConflict: "user_id,date" }
  );

  if (error) throw error;
}

export async function getDailySnapshot(userId: string, date: string) {
  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    user_id: data.user_id,
    date: data.date,
    start_of_day_balance: toNumber(data.start_of_day_balance),
    expected_usd: toNumber(data.expected_usd),
    realized_usd: toNumber(data.realized_usd),
    delta_usd: toNumber(data.delta_usd),
    goal_met: !!data.goal_met,
    created_at: data.created_at,
    updated_at: data.updated_at,
  } as DailySnapshotRow;
}

export async function listDailySnapshots(userId: string, from: string, to: string) {
  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((d: any) => ({
    user_id: d.user_id,
    date: d.date,
    start_of_day_balance: toNumber(d.start_of_day_balance),
    expected_usd: toNumber(d.expected_usd),
    realized_usd: toNumber(d.realized_usd),
    delta_usd: toNumber(d.delta_usd),
    goal_met: !!d.goal_met,
    created_at: d.created_at,
    updated_at: d.updated_at,
  })) as DailySnapshotRow[];
}
