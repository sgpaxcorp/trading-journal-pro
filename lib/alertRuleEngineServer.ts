import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type AlertKind = "reminder" | "alarm";
type AlertSeverity = "info" | "success" | "warning" | "critical";
type AlertChannel = "popup" | "inapp" | "voice";

type AlertRuleRow = {
  id: string;
  user_id: string;
  key?: string | null;
  trigger_type?: string | null;
  title: string;
  message: string;
  severity: AlertSeverity;
  enabled: boolean;
  channels: AlertChannel[];
  kind: AlertKind;
  category: string;
  config: Record<string, unknown>;
  meta: Record<string, unknown>;
};

type OpenPosition = {
  id?: string;
  symbol?: string;
  qty?: number;
  side?: string;
  instrument_type?: string;
  asset_type?: string;
  expiry?: string | null;
  expiration?: string | null;
  premium?: string | null;
  strategy?: string | null;
  dte?: number | null;
  journal_date?: string | null;
  source?: "trades" | "journal" | "notes" | string;
  opened_at?: string | null;
};

type DailyStats = {
  date: string;
  net_pnl: number;
  daily_goal: number;
  max_loss: number;
  max_gain: number;
  trades_count: number;
  impulse_tags: number;
  open_positions: number;
  goal_met?: boolean;
  missing_screenshots: number;
  missing_emotions: number;
  missing_checklist: number;
  open_positions_list?: OpenPosition[];
  options_expiring_today?: OpenPosition[];
};

type StatsSnapshot = DailyStats;

type EvaluateAlertRulesResult = {
  userId: string;
  date: string;
  rulesEnabled: number;
  created: number;
  updated: number;
  resolved: number;
  hadTriggers: boolean;
};

type EvaluateManyResult = {
  usersEvaluated: number;
  rulesEnabledTotal: number;
  created: number;
  updated: number;
  resolved: number;
  failures: Array<{ userId: string; error: string }>;
};

const DAILY_STATS_TABLES = [
  "ntj_daily_stats",
  "daily_stats",
  "nt_daily_stats",
  "ntj_day_stats",
  "ntj_daily_metrics",
];

const CORE_RULES = [
  {
    key: "open_positions",
    trigger_type: "OPEN_POSITIONS",
    title: "Open positions detected",
    message:
      "You still have open positions. If this is intentional, mark as swing. If not, close or set an expiry plan.",
    severity: "warning" as const,
    channels: ["popup", "inapp"] as const,
    kind: "alarm" as const,
    category: "positions",
  },
  {
    key: "options_expiring",
    trigger_type: "OPTIONS_EXPIRING",
    title: "Options expiring today",
    message:
      "You have option positions expiring today. Decide: close at $0 / let expire, or mark as swing.",
    severity: "warning" as const,
    channels: ["popup", "inapp"] as const,
    kind: "alarm" as const,
    category: "positions",
  },
];

const FUTURES_MULTIPLIERS: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
  SI: 5000,
  HG: 25000,
};

const FUT_MONTH_CODES = "FGHJKMNQUVXZ";

type DbClient = SupabaseClient<any, "public", any>;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function maxDateStr(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function addDaysToDateStr(dateStr: string, days: number): string | null {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

function safeObj(v: any): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function safeArr<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function safeStr(v: any, fallback = ""): string {
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? s : fallback;
  }
  return fallback;
}

function pickNumber(row: any, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

function pickString(row: any, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return fallback;
}

function pickDateISO(row: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = row?.[k];
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function normalizeSeverity(v: unknown): AlertSeverity {
  switch (v) {
    case "success":
    case "warning":
    case "critical":
    case "info":
      return v;
    default:
      return "info";
  }
}

function normalizeKind(v: unknown): AlertKind {
  return v === "alarm" ? "alarm" : "reminder";
}

function normalizeChannels(v: unknown): AlertChannel[] {
  const rawInput: unknown[] = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v.split(/[\s,|]+/)
      : v && typeof v === "object" && Array.isArray((v as any).channels)
        ? (v as any).channels
        : [];
  const raw = rawInput.map((x) => String(x).toLowerCase()).filter(Boolean);
  const set = new Set<AlertChannel>();
  for (const c of raw) {
    if (c === "popup" || c === "inapp" || c === "voice") set.add(c);
  }
  if (set.size === 0) set.add("inapp");
  return Array.from(set);
}

function inferKindFromRule(r: {
  key?: string | null;
  trigger_type?: string | null;
  severity?: AlertSeverity;
  config?: Record<string, unknown>;
}): AlertKind {
  const cfg = r.config ?? {};
  if (cfg.kind) return normalizeKind(cfg.kind);
  const trig = String(r.trigger_type ?? r.key ?? "").toLowerCase();
  if (/(open_position|open_positions|expired|expiring|audit|hygiene|missing)/.test(trig)) return "alarm";
  if (/(max_loss|daily_max_loss)/.test(trig)) return "alarm";
  if (/(daily_goal|goal_achieved|max_gain|profit_target)/.test(trig)) return "reminder";
  const sev = r.severity ?? "info";
  if (sev === "critical" || sev === "warning") return "alarm";
  return "reminder";
}

function inferCategoryFromRule(r: {
  trigger_type?: string | null;
  key?: string | null;
  config?: Record<string, unknown>;
}): string {
  const cfg = r.config ?? {};
  const cat = typeof cfg.category === "string" ? cfg.category : "";
  if (cat) return cat;
  const trig = String(r.trigger_type ?? r.key ?? "").toLowerCase();
  if (!trig) return "general";
  return trig.replace(/[^a-z0-9_\-]+/g, "_").slice(0, 32) || "general";
}

function normalizeRuleRow(row: any): AlertRuleRow {
  const config = safeObj(row?.config ?? row?.meta ?? {});
  const severity = normalizeSeverity(row?.severity ?? config.severity);
  const channels = normalizeChannels(row?.channels ?? config.channels);
  const key = typeof row?.key === "string" ? row.key : null;
  const trigger_type = typeof row?.trigger_type === "string" ? row.trigger_type : null;
  const kind = inferKindFromRule({ key, trigger_type, severity, config });
  const category = inferCategoryFromRule({ key, trigger_type, config });

  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? ""),
    key,
    trigger_type,
    title: String(row?.title ?? "Rule"),
    message: String(row?.message ?? ""),
    severity,
    enabled: row?.enabled !== false,
    channels,
    kind,
    category,
    config,
    meta: config,
  };
}

function inferTradeDateISO(row: any): string | null {
  return (
    pickDateISO(row, [
      "date",
      "trade_date",
      "day",
      "entry_date",
      "opened_at",
      "open_time",
      "created_at",
      "timestamp",
    ]) || null
  );
}

function inferSymbol(row: any): string {
  return pickString(row, ["symbol", "ticker", "underlying", "asset", "instrument"], "");
}

function inferQty(row: any): number | undefined {
  const q = pickNumber(row, ["qty", "quantity", "size", "contracts", "shares"], NaN);
  return Number.isFinite(q) ? q : undefined;
}

function inferInstrumentType(row: any): string {
  return pickString(row, ["instrument_type", "asset_type", "security_type", "type"], "");
}

function inferExpiry(row: any): string | null {
  const iso = pickDateISO(row, [
    "expiry",
    "expiration",
    "expiry_date",
    "expiration_date",
    "exp_date",
    "option_expiration",
    "exp",
  ]);
  if (!iso) return null;
  return isoDate(new Date(iso));
}

function inferAssetType(row: any, fallback?: string): string {
  const t = pickString(row, ["asset_type", "instrument_type", "kind", "security_type", "type"], "");
  return t || fallback || "";
}

function inferIsOpen(row: any): boolean {
  const isOpen = row?.is_open ?? row?.open ?? row?.position_open;
  if (typeof isOpen === "boolean") return isOpen;
  const status = safeStr(row?.status || row?.state).toLowerCase();
  if (status) {
    if (status.includes("open") || status.includes("active")) return true;
    if (status.includes("closed") || status.includes("exit")) return false;
  }
  const closedAt = pickDateISO(row, ["closed_at", "close_time", "exit_time", "exited_at"]);
  if (closedAt) return false;
  const qtyOpen = pickNumber(row, ["qty_open", "open_qty", "remaining_qty"], NaN);
  if (Number.isFinite(qtyOpen)) return qtyOpen > 0;
  return false;
}

function inferPnl(row: any): number {
  return pickNumber(row, [
    "net_pnl",
    "pnl",
    "profit",
    "realized_pnl",
    "pnl_net",
    "pnl_usd",
    "pl",
    "p_l",
  ]);
}

async function fetchPlanLimits(db: DbClient, userId: string) {
  const defaults = { daily_goal: 0, max_loss: 0, max_gain: 0 };
  const planTables = ["ntj_growth_plans", "growth_plans"];
  let data: any[] | null = null;
  let error: any = null;

  for (const table of planTables) {
    const res = await db.from(table).select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
    if (!res.error && res.data && res.data.length > 0) {
      data = res.data as any[];
      error = null;
      break;
    }
    if (!error && res.error) error = res.error;
  }

  if (error || !data || data.length === 0) return defaults;

  const row: any = data[0];
  const dailyPct = pickNumber(row, ["daily_target_pct", "daily_goal_percent", "dailyTargetPct", "dailyGoalPercent"], 0);
  const startingBalance = pickNumber(row, ["starting_balance", "startingBalance", "start_balance", "balance"], 0);
  const maxLossPct = pickNumber(row, ["max_daily_loss_percent", "maxDailyLossPercent", "daily_loss_percent"], 0);
  const dailyGoalRaw = pickNumber(row, ["daily_goal", "goal", "day_goal", "daily_target", "target", "profit_target"], 0);
  const maxLossRaw = pickNumber(row, ["max_loss", "daily_max_loss", "loss_limit", "daily_loss_limit", "max_daily_loss"], 0);
  const maxGainRaw = pickNumber(row, ["max_gain", "daily_max_gain", "gain_limit", "daily_gain_limit", "max_daily_gain", "profit_cap", "daily_profit_cap"], 0);

  return {
    daily_goal: dailyGoalRaw || (dailyPct > 0 && startingBalance > 0 ? (startingBalance * dailyPct) / 100 : 0),
    max_loss: maxLossRaw || (maxLossPct > 0 && startingBalance > 0 ? (startingBalance * maxLossPct) / 100 : 0),
    max_gain: maxGainRaw,
  };
}

async function fetchTradesSnapshot(db: DbClient, userId: string, dayISO: string) {
  let rows: any[] = [];
  const q1 = await db.from("trades").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
  if (!q1.error && Array.isArray(q1.data)) rows = q1.data as any[];
  else {
    const q2 = await db.from("trades").select("*").eq("user_id", userId).limit(500);
    if (!q2.error && Array.isArray(q2.data)) rows = q2.data as any[];
  }

  let net = 0;
  let tradesCount = 0;
  const open: OpenPosition[] = [];
  const expiring: OpenPosition[] = [];

  for (const r of rows) {
    const dIso = inferTradeDateISO(r);
    const tradeDay = dIso ? isoDate(new Date(dIso)) : null;
    const pnl = inferPnl(r);
    if (tradeDay === dayISO) {
      tradesCount += 1;
      net += pnl;
    }
    if (inferIsOpen(r)) {
      const sym = inferSymbol(r);
      const instrument = inferInstrumentType(r);
      const expiry = inferExpiry(r);
      const assetType = inferAssetType(r, instrument);
      const openedAt = pickDateISO(r, ["opened_at", "open_time", "entry_time", "created_at"]);
      const pos: OpenPosition = {
        id: r?.id ? String(r.id) : undefined,
        symbol: sym || undefined,
        qty: inferQty(r),
        side: pickString(r, ["side", "direction", "position"], ""),
        instrument_type: instrument || undefined,
        asset_type: assetType || undefined,
        expiry,
        expiration: expiry ?? null,
        opened_at: openedAt,
        source: "trades",
      };
      open.push(pos);
      const instrumentLc = (instrument || "").toLowerCase();
      if (expiry && (instrumentLc.includes("option") || r?.option_symbol || r?.strike || r?.put_call)) {
        if (expiry === dayISO) expiring.push(pos);
      }
    }
  }

  return { net_pnl_today: net, trades_today: tradesCount, open_positions: open, options_expiring_today: expiring };
}

async function fetchJournalTradesSnapshot(db: DbClient, userId: string) {
  const todayISO = isoDate(new Date());
  const res = await db
    .from("journal_trades")
    .select("journal_date,leg,symbol,kind,side,premium,strategy,quantity,dte")
    .eq("user_id", userId)
    .order("journal_date", { ascending: false })
    .limit(1500);

  if (res.error || !Array.isArray(res.data)) {
    return { open_positions: [] as OpenPosition[], options_expiring_today: [] as OpenPosition[] };
  }

  const groups = new Map<string, { qty: number; symbol: string; kind: string; side: string; premium: string; strategy: string; dte: number | null; last_entry_date: string | null; last_activity_date: string | null }>();

  for (const r of res.data as any[]) {
    const symbol = String(r?.symbol ?? "").trim();
    if (!symbol) continue;
    const leg = String(r?.leg ?? "entry").toLowerCase();
    const isExitLeg = leg.includes("exit") || leg.includes("close");
    const journalDate = typeof r?.journal_date === "string" ? r.journal_date : null;
    const kind = String(r?.kind ?? "").trim();
    const side = String(r?.side ?? "").trim();
    const premium = String(r?.premium ?? "").trim();
    const strategy = String(r?.strategy ?? "").trim();
    const key = [symbol, kind, side, strategy].join("|");
    const qtyRaw = typeof r?.quantity === "number" ? r.quantity : Number(r?.quantity ?? 0);
    const qty = Number.isFinite(qtyRaw) && qtyRaw !== 0 ? Math.abs(qtyRaw) : 1;
    const isExit = isExitLeg || (Number.isFinite(qtyRaw) && qtyRaw < 0);
    const dteRaw = typeof r?.dte === "number" ? r.dte : Number(r?.dte ?? NaN);
    const dte = Number.isFinite(dteRaw) ? dteRaw : null;

    const existing = groups.get(key) ?? {
      qty: 0,
      symbol,
      kind,
      side,
      premium,
      strategy,
      dte: null,
      last_entry_date: null,
      last_activity_date: null,
    };
    existing.qty += isExit ? -qty : qty;
    if (!isExit && existing.dte === null && dte !== null) existing.dte = dte;
    if (!isExit && !existing.premium && premium) existing.premium = premium;
    if (journalDate) {
      existing.last_activity_date = maxDateStr(existing.last_activity_date, journalDate);
      if (!isExit) existing.last_entry_date = maxDateStr(existing.last_entry_date, journalDate);
    }
    groups.set(key, existing);
  }

  const open_positions: OpenPosition[] = [];
  const options_expiring_today: OpenPosition[] = [];
  for (const [key, g] of groups.entries()) {
    if (g.qty <= 0) continue;
    const entryDate = g.last_entry_date ?? g.last_activity_date ?? null;
    const exp = g.dte !== null && entryDate ? addDaysToDateStr(entryDate, g.dte) : null;
    if (exp && exp < todayISO) continue;
    const pos: OpenPosition = {
      id: key,
      symbol: g.symbol,
      qty: g.qty,
      side: g.side || undefined,
      instrument_type: g.kind || undefined,
      asset_type: g.kind || undefined,
      premium: g.premium || undefined,
      strategy: g.strategy || undefined,
      dte: g.dte ?? undefined,
      journal_date: entryDate ?? undefined,
      source: "journal",
      expiration: exp,
    };
    open_positions.push(pos);
    if (exp && exp === todayISO) options_expiring_today.push(pos);
  }

  return { open_positions, options_expiring_today };
}

async function fetchJournalNotesSnapshot(db: DbClient, userId: string) {
  const res = await db.from("journal_entries").select("date,notes").eq("user_id", userId).order("date", { ascending: false }).limit(120);
  if (res.error || !Array.isArray(res.data)) {
    return { open_positions: [] as OpenPosition[], options_expiring_today: [] as OpenPosition[] };
  }

  const groups = new Map<string, { qty: number; symbol: string; kind: string; side: string; premium: string; strategy: string; dte: number | null; expiry: string | null; journal_date: string | null }>();

  for (const row of res.data as any[]) {
    let notes: any = row?.notes;
    if (typeof notes === "string") {
      try { notes = JSON.parse(notes); } catch { notes = null; }
    }
    if (!notes || typeof notes !== "object") continue;

    const ingest = (leg: "entry" | "exit", r: any) => {
      const symbol = String(r?.symbol ?? "").trim();
      if (!symbol) return;
      const kind = String(r?.kind ?? "").trim();
      const side = String(r?.side ?? "").trim();
      const premium = String(r?.premiumSide ?? r?.premium ?? "").trim();
      const strategy = String(r?.optionStrategy ?? r?.strategy ?? "").trim();
      const key = [symbol, kind, side, strategy].join("|");
      const qtyRaw = typeof r?.quantity === "number" ? r.quantity : Number(r?.quantity ?? 0);
      const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
      const dteRaw = typeof r?.dte === "number" ? r.dte : Number(r?.dte ?? NaN);
      const dte = Number.isFinite(dteRaw) ? dteRaw : null;
      const expiry = typeof r?.expiry === "string" ? r.expiry : null;
      const existing = groups.get(key) ?? {
        qty: 0,
        symbol,
        kind,
        side,
        premium,
        strategy,
        dte: null,
        expiry: null,
        journal_date: typeof row?.date === "string" ? row.date : null,
      };
      existing.qty += leg === "exit" ? -qty : qty;
      if (leg !== "exit" && existing.dte === null && dte !== null) existing.dte = dte;
      if (leg !== "exit" && !existing.premium && premium) existing.premium = premium;
      if (!existing.expiry && expiry) existing.expiry = expiry;
      if (!existing.journal_date && typeof row?.date === "string") existing.journal_date = row.date;
      groups.set(key, existing);
    };

    for (const r of safeArr(notes.entries)) ingest("entry", r);
    for (const r of safeArr(notes.exits)) ingest("exit", r);
  }

  const open_positions: OpenPosition[] = [];
  const options_expiring_today: OpenPosition[] = [];
  for (const [key, g] of groups.entries()) {
    if (g.qty <= 0) continue;
    const exp = g.expiry || null;
    if (exp && exp < isoDate(new Date())) continue;
    const pos: OpenPosition = {
      id: key,
      symbol: g.symbol,
      qty: g.qty,
      side: g.side || undefined,
      instrument_type: g.kind || undefined,
      expiry: g.expiry || undefined,
      asset_type: g.kind || undefined,
      premium: g.premium || undefined,
      strategy: g.strategy || undefined,
      dte: g.dte ?? undefined,
      journal_date: g.journal_date ?? undefined,
      source: "notes",
      expiration: exp,
    };
    open_positions.push(pos);
    if (g.dte !== null && g.dte <= 0) options_expiring_today.push(pos);
  }

  return { open_positions, options_expiring_today };
}

async function fetchDailyStats(db: DbClient, userId: string, dayISO: string): Promise<DailyStats> {
  const base: DailyStats = {
    date: dayISO,
    net_pnl: 0,
    daily_goal: 0,
    max_loss: 0,
    max_gain: 0,
    trades_count: 0,
    impulse_tags: 0,
    open_positions: 0,
    goal_met: false,
    missing_screenshots: 0,
    missing_emotions: 0,
    missing_checklist: 0,
  };

  for (const table of DAILY_STATS_TABLES) {
    const res = await db.from(table).select("*").eq("user_id", userId).eq("date", dayISO).limit(1);
    if (res.error || !res.data || res.data.length === 0) continue;
    const row: any = res.data[0];
    base.net_pnl = pickNumber(row, ["net_pnl", "pnl", "profit", "daily_pnl", "pnl_net"], base.net_pnl);
    base.trades_count = pickNumber(row, ["trades_count", "trade_count", "trades", "num_trades", "count_trades"], base.trades_count);
    base.open_positions = pickNumber(row, ["open_positions", "open_pos", "positions_open", "open_positions_count"], base.open_positions);
    base.impulse_tags = pickNumber(row, ["impulse_tags", "impulse_tags_count", "impulses", "impulse_count"], base.impulse_tags);
    base.missing_screenshots = pickNumber(row, ["missing_screenshots", "screenshots_missing", "no_screenshots"], base.missing_screenshots);
    base.missing_emotions = pickNumber(row, ["missing_emotions", "emotions_missing", "no_emotions"], base.missing_emotions);
    base.missing_checklist = pickNumber(row, ["missing_checklist", "checklist_missing", "no_checklist"], base.missing_checklist);
    base.goal_met = Boolean(row?.goal_met ?? row?.daily_goal_hit ?? row?.goal_hit ?? base.goal_met);
    base.daily_goal = pickNumber(row, ["daily_goal", "goal", "daily_target"], base.daily_goal);
    base.max_loss = pickNumber(row, ["max_loss", "daily_max_loss", "loss_limit"], base.max_loss);
    base.max_gain = pickNumber(row, ["max_gain", "daily_max_gain", "gain_limit", "profit_cap"], base.max_gain);
    break;
  }

  const plan = await fetchPlanLimits(db, userId);
  base.daily_goal = plan.daily_goal || base.daily_goal;
  base.max_loss = plan.max_loss || base.max_loss;
  base.max_gain = plan.max_gain || base.max_gain;

  try {
    const snap = await db.from("daily_snapshots").select("expected_usd,realized_usd,goal_met").eq("user_id", userId).eq("date", dayISO).maybeSingle();
    if (!snap.error && snap.data) {
      const expectedUsd = pickNumber(snap.data, ["expected_usd"], 0);
      const realizedUsd = pickNumber(snap.data, ["realized_usd"], 0);
      if (!base.daily_goal && expectedUsd) base.daily_goal = expectedUsd;
      if (!base.net_pnl && realizedUsd) base.net_pnl = realizedUsd;
      if (snap.data.goal_met !== undefined && snap.data.goal_met !== null) base.goal_met = Boolean(snap.data.goal_met);
    }
  } catch {}

  try {
    const jr = await db.from("journal_entries").select("pnl").eq("user_id", userId).eq("date", dayISO).maybeSingle();
    if (!jr.error && jr.data) {
      const pnl = pickNumber(jr.data, ["pnl"], 0);
      if (!base.net_pnl && pnl) base.net_pnl = pnl;
    }
  } catch {}

  const tradesSnap = await fetchTradesSnapshot(db, userId, dayISO);
  if (!base.net_pnl && tradesSnap.net_pnl_today) base.net_pnl = tradesSnap.net_pnl_today;
  if (!base.trades_count && tradesSnap.trades_today) base.trades_count = tradesSnap.trades_today;
  base.open_positions_list = tradesSnap.open_positions;
  base.options_expiring_today = tradesSnap.options_expiring_today;
  base.open_positions = Math.max(base.open_positions || 0, tradesSnap.open_positions.length);

  const journalSnap = await fetchJournalTradesSnapshot(db, userId);
  const notesSnap = await fetchJournalNotesSnapshot(db, userId);

  const mergedOpen: OpenPosition[] = [];
  const seenIds = new Set<string>();
  for (const p of journalSnap.open_positions) {
    const id = p?.id ? String(p.id) : "";
    if (id) seenIds.add(id);
    mergedOpen.push(p);
  }
  for (const p of notesSnap.open_positions) {
    const id = p?.id ? String(p.id) : "";
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);
    mergedOpen.push(p);
  }

  const mergedExpiring: OpenPosition[] = [];
  const expIds = new Set<string>();
  for (const p of journalSnap.options_expiring_today) {
    const id = p?.id ? String(p.id) : "";
    if (id) expIds.add(id);
    mergedExpiring.push(p);
  }
  for (const p of notesSnap.options_expiring_today) {
    const id = p?.id ? String(p.id) : "";
    if (id && expIds.has(id)) continue;
    if (id) expIds.add(id);
    mergedExpiring.push(p);
  }

  const hasTradesOpen = tradesSnap.open_positions.length > 0;
  if (!hasTradesOpen && mergedOpen.length > 0) {
    base.open_positions_list = mergedOpen;
    base.options_expiring_today = mergedExpiring;
    base.open_positions = mergedOpen.length;
  }
  if (!hasTradesOpen && mergedOpen.length === 0) {
    base.open_positions_list = [];
    base.options_expiring_today = [];
    base.open_positions = 0;
  }

  return base;
}

function inferTriggerFromTitle(title: string): string {
  const t = safeStr(title).toLowerCase();
  if (!t) return "";
  if (/open\s*positions?|posici[oó]n(?:es)?\s*abierta?s?/i.test(t)) return "OPEN_POSITIONS";
  if (/expir|expired|expira|expiran|vence|vencen|vencimiento/i.test(t)) return "OPTIONS_EXPIRING";
  if (/daily\s*goal|goal\b|meta\s*diaria|objetivo\s*diario|meta\s*del\s*d[ií]a/i.test(t)) return "DAILY_GOAL";
  if (/max\s*loss|loss\s*limit|p[eé]rdida\s*m[aá]xima|l[ií]mite\s*de\s*p[eé]rdida/i.test(t)) return "MAX_LOSS";
  if (/max\s*gain|profit\s*cap|gain\s*limit|ganancia\s*m[aá]xima|l[ií]mite\s*de\s*ganancia/i.test(t)) return "MAX_GAIN";
  if (/impulse|impulso|impulsiv/i.test(t)) return "IMPULSE";
  if (/screenshot|captura|pantallazo/i.test(t)) return "MISSING_SCREENSHOTS";
  if (/emotion|emoci[oó]n|sentimiento/i.test(t)) return "MISSING_EMOTIONS";
  if (/checklist|lista\s*de\s*verificaci[oó]n|lista\s*de\s*chequeo/i.test(t)) return "CHECKLIST";
  return "";
}

function normalizeTrigger(t: string): string {
  return safeStr(t).trim().toUpperCase();
}

function inferCategory(triggerType: string): string {
  const t = normalizeTrigger(triggerType);
  if (t.includes("OPEN_POSITIONS") || t.includes("EXPIRED_OPTIONS") || t.includes("OPTIONS_EXPIR")) return "positions";
  if (t.includes("LOSS")) return "risk";
  if (t.includes("GAIN") || t.includes("PROFIT_CAP")) return "risk";
  if (t.includes("GOAL")) return "achievement";
  if (t.includes("EMOTIONS") || t.includes("SCREENSHOTS") || t.includes("CHECKLIST")) return "journal";
  return "general";
}

function titleFallback(triggerType: string, lang: "en" | "es"): string {
  const isEs = lang === "es";
  const t = normalizeTrigger(triggerType);
  if (t.includes("DAILY_GOAL")) return isEs ? "Meta diaria alcanzada" : "Daily goal achieved";
  if (t.includes("MAX_LOSS") || t.includes("LOSS_LIMIT")) return isEs ? "Pérdida máxima diaria alcanzada" : "Daily max loss hit";
  if (t.includes("MAX_GAIN") || t.includes("GAIN_LIMIT") || t.includes("PROFIT_CAP")) return isEs ? "Ganancia máxima diaria alcanzada" : "Daily max gain hit";
  if (t.includes("OPEN_POSITIONS")) return isEs ? "Posición abierta aún activa" : "Open position still active";
  if (t.includes("EXPIRED_OPTIONS") || t.includes("OPTIONS_EXPIR")) return isEs ? "Opciones por vencer / vencidas" : "Option expiring / expired";
  if (t.includes("MISSING_EMOTIONS")) return isEs ? "Higiene del journal: emociones faltantes" : "Journal hygiene: emotions missing";
  if (t.includes("MISSING_SCREENSHOTS")) return isEs ? "Deriva de proceso: falta screenshot" : "Process drift: screenshot missing";
  if (t.includes("CHECKLIST")) return isEs ? "Deriva de proceso: falta checklist" : "Process drift: checklist missing";
  if (t.includes("IMPULSE")) return isEs ? "Disciplina de riesgo: impulsos" : "Risk discipline: impulse tags";
  return isEs ? "Regla activada" : "Rule triggered";
}

function messageFallback(triggerType: string, stats: DailyStats, rule: AlertRuleRow, lang: "en" | "es"): string {
  const isEs = lang === "es";
  const t = normalizeTrigger(triggerType);
  const net = stats.net_pnl;
  const goal = stats.daily_goal;
  const maxLoss = stats.max_loss;
  const maxGain = stats.max_gain;
  const open = stats.open_positions;
  const ruleMeta = safeObj(rule.meta);
  const style = safeStr(ruleMeta.strategy || ruleMeta.trading_style || "day").toLowerCase();

  if (t.includes("DAILY_GOAL")) {
    if (goal > 0) {
      return isEs
        ? `Lograste tu meta diaria (${fmtMoney(goal)}). P&L de hoy: ${fmtMoney(net)}. Asegura la ganancia y protege la disciplina.`
        : `You hit your daily goal (${fmtMoney(goal)}). Today P&L: ${fmtMoney(net)}. Lock the win and protect discipline.`;
    }
    return isEs
      ? `Meta diaria alcanzada. P&L de hoy: ${fmtMoney(net)}. Asegura la ganancia y protege la disciplina.`
      : `Daily goal achieved. Today P&L: ${fmtMoney(net)}. Lock the win and protect discipline.`;
  }
  if (t.includes("MAX_LOSS") || t.includes("LOSS_LIMIT")) {
    return isEs
      ? `Pérdida máxima diaria alcanzada (${fmtMoney(maxLoss)}). P&L de hoy: ${fmtMoney(net)}. Detén el trading y revisa.`
      : `Daily max loss hit (${fmtMoney(maxLoss)}). Today P&L: ${fmtMoney(net)}. Stop trading and review.`;
  }
  if (t.includes("MAX_GAIN") || t.includes("GAIN_LIMIT") || t.includes("PROFIT_CAP")) {
    return isEs
      ? `Ganancia máxima diaria alcanzada (${fmtMoney(maxGain)}). P&L de hoy: ${fmtMoney(net)}. Detén el trading para proteger la ventaja.`
      : `Daily max gain hit (${fmtMoney(maxGain)}). Today P&L: ${fmtMoney(net)}. Stop trading to protect the edge.`;
  }
  if (t.includes("OPEN_POSITIONS")) {
    const syms = (stats.open_positions_list || []).map((p) => p.symbol).filter(Boolean).slice(0, 6).join(", ");
    const extra = stats.options_expiring_today && stats.options_expiring_today.length > 0
      ? ` Options expiring today: ${(stats.options_expiring_today || []).map((p) => p.symbol).filter(Boolean).slice(0, 6).join(", ")}.`
      : "";
    const guidance =
      style === "swing"
        ? isEs
          ? "Si es exposición swing intencional, márcala como swing para detener recordatorios."
          : "If this is intended swing exposure, mark it as swing to stop reminders."
        : isEs
          ? "Si NO es intencional (day trade), ciérrala o márcala como swing. Para opciones que vencen, decide: cerrar en $0 / dejar expirar."
          : "If this is NOT intended (day trading), close it or mark it as swing. For options expiring, decide: close at $0 / let expire.";
    return isEs
      ? `Aún tienes ${open} posición(es) abierta(s)${syms ? ` (${syms}${open > 6 ? "…" : ""})` : ""}.${extra} ${guidance}`
      : `You still have ${open} open position(s)${syms ? ` (${syms}${open > 6 ? "…" : ""})` : ""}.${extra} ${guidance}`;
  }
  if (t.includes("EXPIRED_OPTIONS") || t.includes("OPTIONS_EXPIR")) {
    const exp = stats.options_expiring_today || [];
    const syms = exp.map((p) => p.symbol).filter(Boolean).slice(0, 8).join(", ");
    return isEs
      ? `Tienes posiciones de opciones que vencen hoy. Decide: cerrar en $0 / dejar expirar, o marcar como swing/estrategia de prima. ${syms ? `(${syms})` : ""}`
      : `You have option position(s) expiring today. Decide: close at $0 / let expire, or mark as swing/premium strategy. ${syms ? `(${syms})` : ""}`;
  }
  if (t.includes("MISSING_EMOTIONS")) return isEs ? "No seleccionaste emociones para este día. Etiquetar emociones reduce loops impulsivos." : "No emotions selected for this day. Emotional labeling reduces impulsive loops.";
  if (t.includes("MISSING_SCREENSHOTS")) return isEs ? "No hay screenshots registrados para este día. La evidencia evita el sesgo de retrospectiva." : "No screenshots logged for this day. Evidence prevents hindsight bias.";
  if (t.includes("CHECKLIST")) return isEs ? "No hay tags de checklist de estrategia. La deriva de proceso es una fuga silenciosa de performance." : "No strategy checklist tags found. Process drift is a silent performance leak.";
  if (t.includes("IMPULSE")) return isEs ? "Tags de impulso detectados. Pausa y verifica el plan antes del próximo trade." : "Impulse tags detected. Pause and verify plan compliance before next trade.";
  return rule.message || (isEs ? "Regla activada." : "Rule triggered.");
}

function computeTriggered(triggerType: string, stats: DailyStats, rule: AlertRuleRow): boolean {
  const t = normalizeTrigger(triggerType);
  const net = stats.net_pnl;
  const meta = safeObj(rule.meta);
  const metaGoal = pickNumber(meta, ["goal", "daily_goal", "threshold", "value"], NaN);
  const metaMaxLoss = pickNumber(meta, ["max_loss", "daily_max_loss", "loss_limit"], NaN);
  const metaMaxGain = pickNumber(meta, ["max_gain", "daily_max_gain", "gain_limit", "profit_cap"], NaN);
  const goal = Number.isFinite(metaGoal) ? metaGoal : stats.daily_goal;
  const maxLoss = Number.isFinite(metaMaxLoss) ? metaMaxLoss : stats.max_loss;
  const maxGain = Number.isFinite(metaMaxGain) ? metaMaxGain : stats.max_gain;

  if (t.includes("DAILY_GOAL")) return stats.goal_met === true || (goal > 0 && net >= goal);
  if (t.includes("MAX_LOSS") || t.includes("LOSS_LIMIT")) return maxLoss > 0 && net <= -Math.abs(maxLoss);
  if (t.includes("MAX_GAIN") || t.includes("GAIN_LIMIT") || t.includes("PROFIT_CAP")) return maxGain > 0 && net >= Math.abs(maxGain);
  if (t.includes("OPEN_POSITIONS")) {
    const mode = safeStr(meta.open_positions_mode, safeStr(meta.strategy)).toLowerCase();
    if (mode === "swing" || mode === "premium") return false;
    const minOpen = pickNumber(meta, ["min_open_positions", "min_open", "threshold"], 0);
    if (minOpen <= 0) return stats.open_positions > 0;
    return stats.open_positions >= minOpen;
  }
  if (t.includes("EXPIRED_OPTIONS") || t.includes("OPTIONS_EXPIR")) return (stats.options_expiring_today || []).length > 0;
  if (t.includes("IMPULSE")) return stats.impulse_tags > 0;
  if (t.includes("MISSING_SCREENSHOTS")) return stats.missing_screenshots > 0;
  if (t.includes("MISSING_EMOTIONS")) return stats.missing_emotions > 0;
  if (t.includes("CHECKLIST")) return stats.missing_checklist > 0;
  return false;
}

async function listAlertRulesForUser(db: DbClient, userId: string): Promise<AlertRuleRow[]> {
  const { data, error } = await db.from("ntj_alert_rules").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((row: any) => normalizeRuleRow(row));
}

async function ensureCoreRules(db: DbClient, userId: string, rules: AlertRuleRow[]): Promise<AlertRuleRow[]> {
  const existing = (rules ?? []).map((r) => ({ trigger: String(r.trigger_type ?? r.key ?? r.title ?? "").toLowerCase() }));
  const missing = CORE_RULES.filter((r) => {
    const trigger = r.trigger_type.toLowerCase();
    return !existing.some((e) => e.trigger.includes(trigger)) && !existing.some((e) => e.trigger.includes(r.key));
  });
  if (missing.length === 0) return rules;

  for (const rule of missing) {
    const row: any = {
      user_id: userId,
      key: rule.key,
      trigger_type: rule.trigger_type,
      title: rule.title,
      message: rule.message,
      severity: rule.severity,
      enabled: true,
      channels: Array.from(rule.channels),
      config: { source: "core", kind: rule.kind, category: rule.category },
    };
    const { error } = await db.from("ntj_alert_rules").insert(row);
    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      console.warn("[alertRuleEngineServer] core rule insert failed", error);
    }
  }

  return listAlertRulesForUser(db, userId);
}

export async function evaluateAlertRulesForUser(userId: string, opts?: { db?: DbClient; lang?: "en" | "es"; }) : Promise<EvaluateAlertRulesResult> {
  const db = opts?.db ?? supabaseAdmin;
  const lang = opts?.lang ?? "en";
  const todayISO = isoDate(new Date());

  let rules = await listAlertRulesForUser(db, userId);
  rules = await ensureCoreRules(db, userId, rules);
  const enabled = rules.filter((r) => r.enabled);

  if (enabled.length === 0) {
    return { userId, date: todayISO, rulesEnabled: 0, created: 0, updated: 0, resolved: 0, hadTriggers: false };
  }

  const stats = await fetchDailyStats(db, userId, todayISO);
  let created = 0;
  let updated = 0;
  let resolved = 0;

  for (const rule of enabled) {
    const meta = safeObj(rule.meta);
    let triggerType =
      safeStr(rule.trigger_type) ||
      safeStr((rule as any).triggerType) ||
      safeStr((rule as any).trigger) ||
      safeStr(rule.key) ||
      safeStr(meta.trigger_type) ||
      safeStr(meta.triggerType) ||
      safeStr(meta.trigger) ||
      safeStr(meta.type) ||
      safeStr(meta.key);

    if (!triggerType) triggerType = inferTriggerFromTitle(rule.title || "");
    if (!triggerType) continue;

    const ignoreIds = new Set(safeArr(meta.ignore_trade_ids).map((v) => String(v)));
    const openList = safeArr(stats.open_positions_list).filter((p: any) => !ignoreIds.has(String(p?.id)));
    const expiringList = safeArr(stats.options_expiring_today).filter((p: any) => !ignoreIds.has(String(p?.id)));
    const statsForRule: StatsSnapshot = {
      ...stats,
      open_positions: openList.length,
      open_positions_list: openList,
      options_expiring_today: expiringList,
    };

    const triggered = computeTriggered(triggerType, statsForRule, rule);

    let existing: { id: string; status?: string | null; dismissed_until?: string | null; payload?: any } | null = null;
    const chk = await db.from("ntj_alert_events").select("id,status,dismissed_until,payload").eq("user_id", userId).eq("rule_id", rule.id).eq("date", todayISO).limit(1);
    if (!chk.error && chk.data && chk.data.length > 0) {
      const row: any = (chk.data as any[])[0];
      existing = {
        id: String(row.id),
        status: row.status ?? null,
        dismissed_until: row.dismissed_until ?? null,
        payload: row.payload ?? null,
      };
    }

    if (!triggered) {
      const existingPayload = safeObj(existing?.payload);
      const isTest = !!existingPayload.test;
      const statusNorm = String(existing?.status ?? "").toLowerCase();
      const isDismissed = statusNorm === "dismissed" || statusNorm === "ack";
      if (existing?.id && !isDismissed && !isTest) {
        const nowISO = new Date().toISOString();
        const nextPayload = {
          ...existingPayload,
          meta: {
            ...safeObj(existingPayload.meta),
            auto_resolved_at: nowISO,
            auto_resolved_reason: "trigger_cleared",
          },
        };
        const upd1 = await db.from("ntj_alert_events").update({ status: "dismissed", dismissed_until: null, payload: nextPayload }).eq("id", existing.id).eq("user_id", userId);
        if (upd1.error) {
          const upd2 = await db.from("ntj_alert_events").update({ status: "dismissed", payload: nextPayload }).eq("id", existing.id).eq("user_id", userId);
          if (!upd2.error) resolved += 1;
        } else {
          resolved += 1;
        }
      }
      continue;
    }

    const nowISO = new Date().toISOString();
    const category = inferCategory(triggerType);
    const title = rule.title || titleFallback(triggerType, lang);
    const message = rule.message || messageFallback(triggerType, statsForRule, rule, lang);
    const payload = {
      trigger_type: triggerType,
      category,
      channels: normalizeChannels(rule.channels),
      stats: {
        date: statsForRule.date,
        net_pnl: statsForRule.net_pnl,
        daily_goal: statsForRule.daily_goal,
        max_loss: statsForRule.max_loss,
        max_gain: statsForRule.max_gain,
        trades_count: statsForRule.trades_count,
        open_positions: statsForRule.open_positions,
      },
      open_positions_list: openList,
      options_expiring_today: expiringList,
    };

    const fullRow: any = {
      user_id: userId,
      rule_id: rule.id,
      status: "active",
      triggered_at: nowISO,
      date: todayISO,
      kind: normalizeKind(rule.kind),
      severity: normalizeSeverity(rule.severity),
      channels: normalizeChannels(rule.channels),
      title,
      message,
      category,
      payload,
    };
    const minimalRow: any = {
      user_id: userId,
      rule_id: rule.id,
      status: "active",
      triggered_at: nowISO,
      date: todayISO,
      payload: {
        ...payload,
        kind: normalizeKind(rule.kind),
        severity: normalizeSeverity(rule.severity),
        channels: normalizeChannels(rule.channels),
        title,
        message,
      },
    };

    if (existing?.id) {
      const statusNorm = String(existing.status ?? "").toLowerCase();
      if (statusNorm === "dismissed" || statusNorm === "ack") continue;
      const upd = await db.from("ntj_alert_events").update({ payload }).eq("id", existing.id).eq("user_id", userId);
      if (!upd.error) updated += 1;
      continue;
    }

    const ins1 = await db.from("ntj_alert_events").insert(fullRow);
    if (ins1.error) {
      const ins2 = await db.from("ntj_alert_events").insert(minimalRow);
      if (ins2.error) {
        const minimalRowNoDate: any = {
          user_id: userId,
          rule_id: rule.id,
          status: "active",
          triggered_at: nowISO,
          payload: minimalRow.payload,
        };
        const ins3 = await db.from("ntj_alert_events").insert(minimalRowNoDate);
        if (ins3.error) {
          const minimalRowBare: any = {
            user_id: userId,
            rule_id: rule.id,
            status: "active",
            payload: minimalRow.payload,
          };
          const ins4 = await db.from("ntj_alert_events").insert(minimalRowBare);
          if (ins4.error) {
            console.error("[alertRuleEngineServer] insert event failed", ins4.error);
            continue;
          }
        }
      }
    }
    created += 1;
  }

  return { userId, date: todayISO, rulesEnabled: enabled.length, created, updated, resolved, hadTriggers: created + updated + resolved > 0 };
}

export async function listUsersWithEnabledAlertRules(opts?: { db?: DbClient; maxUsers?: number }) {
  const db = opts?.db ?? supabaseAdmin;
  const maxUsers = Math.max(1, opts?.maxUsers ?? 100000);
  const pageSize = 1000;
  const ids = new Set<string>();
  let from = 0;

  while (ids.size < maxUsers) {
    const to = from + pageSize - 1;
    const res = await db.from("ntj_alert_rules").select("user_id").eq("enabled", true).order("user_id", { ascending: true }).range(from, to);
    if (res.error) throw res.error;
    const rows = Array.isArray(res.data) ? (res.data as any[]) : [];
    for (const row of rows) {
      const id = safeStr(row?.user_id);
      if (id) ids.add(id);
      if (ids.size >= maxUsers) break;
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return Array.from(ids);
}

export async function evaluateAlertRulesForUsers(userIds: string[], opts?: { db?: DbClient; lang?: "en" | "es"; concurrency?: number; }) : Promise<EvaluateManyResult> {
  const db = opts?.db ?? supabaseAdmin;
  const lang = opts?.lang ?? "en";
  const concurrency = Math.max(1, opts?.concurrency ?? 10);
  let usersEvaluated = 0;
  let rulesEnabledTotal = 0;
  let created = 0;
  let updated = 0;
  let resolved = 0;
  const failures: Array<{ userId: string; error: string }> = [];

  for (let i = 0; i < userIds.length; i += concurrency) {
    const chunk = userIds.slice(i, i + concurrency);
    const settled = await Promise.all(
      chunk.map(async (userId) => {
        try {
          const res = await evaluateAlertRulesForUser(userId, { db, lang });
          return { ok: true as const, res };
        } catch (error: any) {
          return { ok: false as const, userId, error: error?.message ?? "Unknown error" };
        }
      })
    );

    for (const item of settled) {
      if (!item.ok) {
        failures.push({ userId: item.userId, error: item.error });
        continue;
      }
      usersEvaluated += 1;
      rulesEnabledTotal += item.res.rulesEnabled;
      created += item.res.created;
      updated += item.res.updated;
      resolved += item.res.resolved;
    }
  }

  return { usersEvaluated, rulesEnabledTotal, created, updated, resolved, failures };
}
