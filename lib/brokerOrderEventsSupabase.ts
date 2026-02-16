import { supabaseBrowser } from "@/lib/supaBaseClient";
import type { NormalizedOrderEvent, BrokerId } from "@/lib/brokers/types";

export type BrokerOrderEventRow = NormalizedOrderEvent & {
  id: string;
  user_id: string;
  account_id: string;
  broker: string;
  import_id: string;
  created_at: string;
};

const TABLE = "broker_order_events" as const;

export async function insertBrokerOrderEvents(
  userId: string,
  accountId: string,
  broker: BrokerId,
  importId: string,
  events: NormalizedOrderEvent[]
): Promise<number> {
  if (!userId || !accountId || !importId || !events.length) return 0;
  const rows = events.map((e) => ({
    user_id: userId,
    account_id: accountId,
    broker,
    import_id: importId,
    date: e.date,
    ts_utc: e.ts_utc,
    ts_source: e.ts_source ?? null,
    source_tz: e.source_tz ?? null,
    event_type: e.event_type,
    status: e.status ?? null,
    side: e.side ?? null,
    pos_effect: e.pos_effect ?? null,
    qty: e.qty ?? null,
    symbol: e.symbol ?? null,
    instrument_key: e.instrument_key,
    asset_kind: e.asset_kind ?? null,
    order_type: e.order_type ?? null,
    limit_price: e.limit_price ?? null,
    stop_price: e.stop_price ?? null,
    oco_id: e.oco_id ?? null,
    replace_id: e.replace_id ?? null,
    raw: e.raw ?? {},
  }));

  const { error } = await supabaseBrowser.from(TABLE).insert(rows);
  if (error) return 0;
  return rows.length;
}

export async function getBrokerOrderEventsByDate(
  userId: string,
  accountId: string,
  date: string,
  instrumentKey?: string
): Promise<BrokerOrderEventRow[]> {
  if (!userId || !accountId || !date) return [];
  let q = supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("date", date)
    .order("ts_utc", { ascending: true });

  if (instrumentKey) q = q.eq("instrument_key", instrumentKey);

  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];
  return data as BrokerOrderEventRow[];
}

export async function getBrokerOrderEventsInWindow(
  userId: string,
  accountId: string,
  instrumentKey: string,
  fromUtc: string,
  toUtc: string
): Promise<BrokerOrderEventRow[]> {
  if (!userId || !accountId || !instrumentKey) return [];

  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("instrument_key", instrumentKey)
    .gte("ts_utc", fromUtc)
    .lte("ts_utc", toUtc)
    .order("ts_utc", { ascending: true });

  if (error || !Array.isArray(data)) return [];
  return data as BrokerOrderEventRow[];
}
