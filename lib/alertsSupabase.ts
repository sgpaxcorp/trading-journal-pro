"use client";

/**
 * Alerts / Rules / Events data-access layer (Supabase)
 *
 * IMPORTANT (Option A schema):
 * - ntj_alert_rules does NOT have a `kind` column.
 * - ntj_alert_events does NOT have denormalized fields like `title`, `severity`, etc.
 *
 * We therefore:
 * - Store extra metadata (kind/category/description) inside `config` (jsonb) when needed.
 * - Infer kind/category from config/trigger_type/severity.
 * - Join rules -> events in code (or via a second query) to show proper titles/messages.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supaBaseClient";

// -----------------------------
// Types
// -----------------------------

export type AlertKind = "reminder" | "alarm";
export type AlertSeverity = "info" | "success" | "warning" | "critical";
export type AlertChannel = "popup" | "inapp" | "voice";

export type AlertRule = {
  id: string;
  user_id: string;

  // Option A table columns
  key?: string | null;
  trigger_type?: string | null;

  title: string;
  message: string;
  severity: AlertSeverity;
  enabled: boolean;
  channels: AlertChannel[];

  // Derived / optional metadata
  kind: AlertKind;
  category: string;
  description?: string;

  config?: Record<string, unknown>;
  // Legacy alias used by older UI code; keep in sync with config
  meta?: Record<string, unknown>;

  created_at?: string | null;
  updated_at?: string | null;
};

export type AlertEventStatus = "active" | "ack" | "dismissed" | "resolved"; // we normalize to active/ack

export type AlertEvent = {
  id: string;
  user_id: string;
  rule_id: string;

  // Option A columns
  date?: string | null; // YYYY-MM-DD
  status: AlertEventStatus;
  triggered_at: string;
  acknowledged_at?: string | null;
  dismissed_until?: string | null;
  payload: Record<string, unknown>;

  created_at?: string | null;
  updated_at?: string | null;

  // Denormalized for UI
  title: string;
  message: string;
  severity: AlertSeverity;
  channels: AlertChannel[];
  kind: AlertKind;
  category: string;

  // Convenience booleans for legacy UI code
  dismissed: boolean;
  snoozed: boolean;
};

export type OkRes<T> = { ok: true; data: T } | { ok: false; error: string };

// -----------------------------
// Helpers
// -----------------------------

const LOG = "[alertsSupabase]";

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : fallback;
  return Math.max(min, Math.min(max, v));
}

function safeObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function safeArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function isIsoDateString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeKind(v: unknown): AlertKind {
  return v === "alarm" ? "alarm" : "reminder";
}

export function normalizeSeverity(v: unknown): AlertSeverity {
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

export function normalizeChannels(v: unknown): AlertChannel[] {
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
  // Default to in-app so nothing is silently dropped
  if (set.size === 0) set.add("inapp");
  return Array.from(set);
}

export function channelsLabel(channels: AlertChannel[]) {
  const set = new Set(channels);
  const parts: string[] = [];
  if (set.has("popup")) parts.push("POPUP");
  if (set.has("inapp")) parts.push("INAPP");
  if (set.has("voice")) parts.push("VOICE");
  return parts.join("+") || "INAPP";
}

function inferKindFromRule(r: {
  key?: string | null;
  trigger_type?: string | null;
  severity?: AlertSeverity;
  config?: Record<string, unknown>;
}): AlertKind {
  const cfg = r.config ?? {};
  const cfgKind = normalizeKind(cfg.kind);
  if (cfg.kind) return cfgKind;

  const trig = String(r.trigger_type ?? r.key ?? "").toLowerCase();
  // Hard mappings
  if (/(open_position|open_positions|expired|expiring|audit|hygiene|missing)/.test(trig)) return "alarm";
  if (/(max_loss|daily_max_loss)/.test(trig)) return "alarm";
  if (/(daily_goal|goal_achieved|max_gain|profit_target)/.test(trig)) return "reminder";

  // Severity heuristic
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
  // Use first token-ish
  return trig.replace(/[^a-z0-9_\-]+/g, "_").slice(0, 32) || "general";
}

function normalizeRuleRow(row: any): AlertRule {
  // Option A uses config; some older experiments used meta.
  const config = safeObj(row?.config ?? row?.meta ?? {});
  const meta = config;

  const severity = normalizeSeverity(row?.severity ?? config.severity);
  const channels = normalizeChannels(row?.channels ?? config.channels);

  const key = typeof row?.key === "string" ? row.key : null;
  const trigger_type = typeof row?.trigger_type === "string" ? row.trigger_type : null;

  const kind = inferKindFromRule({ key, trigger_type, severity, config });
  const category = inferCategoryFromRule({ key, trigger_type, config });

  const title = String(row?.title ?? config.title ?? "Untitled rule");
  // Option A has `message` column; we keep fallback to description
  const message = String(row?.message ?? config.message ?? row?.description ?? config.description ?? "");

  const enabled = Boolean(row?.enabled ?? true);

  return {
    id: String(row?.id),
    user_id: String(row?.user_id),
    key,
    trigger_type,
    title,
    message,
    severity,
    enabled,
    channels,
    kind,
    category,
    description: typeof config.description === "string" ? config.description : undefined,
    config,
    meta,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

function parseDateMaybe(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeEventStatus(v: unknown): AlertEventStatus {
  const s = String(v ?? "").toLowerCase();
  if (s === "ack" || s === "acknowledged") return "ack";
  if (s === "active") return "active";
  if (s === "dismissed") return "ack"; // normalize
  if (s === "resolved") return "ack";
  return "active";
}

function normalizeEventRow(row: any, ruleById: Map<string, AlertRule>): AlertEvent {
  const payload = safeObj(row?.payload);
  const rule = ruleById.get(String(row?.rule_id ?? ""));

  const status = normalizeEventStatus(row?.status ?? payload.status);
  const dismissed_until = row?.dismissed_until ?? payload.dismissed_until ?? null;
  const dismissedUntilDate = parseDateMaybe(dismissed_until);
  const snoozed = dismissedUntilDate ? dismissedUntilDate.getTime() > Date.now() : false;
  const dismissed = status !== "active";

  const severity = normalizeSeverity(row?.severity ?? payload.severity ?? rule?.severity);
  const channels = normalizeChannels(row?.channels ?? payload.channels ?? rule?.channels);

  const kind = normalizeKind(payload.kind ?? rule?.kind);
  const category = String(payload.category ?? payload.type ?? rule?.category ?? kind);

  const title = String(payload.title ?? rule?.title ?? `Rule ${String(row?.rule_id ?? "").slice(0, 8)}`);
  const message = String(payload.message ?? rule?.message ?? "");

  return {
    id: String(row?.id),
    user_id: String(row?.user_id),
    rule_id: String(row?.rule_id),

    date: isIsoDateString(row?.date) ? row.date : (typeof payload.date === "string" ? payload.date : null),
    status,
    triggered_at: String(row?.triggered_at ?? payload.triggered_at ?? row?.created_at ?? new Date().toISOString()),
    acknowledged_at: row?.acknowledged_at ?? payload.acknowledged_at ?? null,
    dismissed_until: dismissed_until,
    payload,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,

    title,
    message,
    severity,
    channels,
    kind,
    category,

    dismissed,
    snoozed,
  };
}

export function isEventActive(e: AlertEvent) {
  return e.status === "active" && !e.snoozed;
}

export function isEventSnoozed(e: AlertEvent) {
  return e.snoozed;
}

// -----------------------------
// Public API
// -----------------------------

export async function listAlertRules(
  userId: string,
  opts?: {
    kind?: AlertKind;
    includeDisabled?: boolean;
    limit?: number;
  }
): Promise<OkRes<{ rules: AlertRule[] }>> {
  try {
    const limit = clampInt(opts?.limit, 1, 500, 200);

    let q = supabaseBrowser
      .from("ntj_alert_rules")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!opts?.includeDisabled) q = q.eq("enabled", true);

    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };

    const rulesRaw = (data ?? []).map((r) => normalizeRuleRow(r));

    // IMPORTANT: we do NOT filter by kind at the DB level because Option A has no kind column.
    const rules = rulesRaw.filter((r) => (opts?.kind ? r.kind === opts.kind : true));

    return { ok: true, data: { rules } };
  } catch (e: any) {
    console.error(LOG, "listAlertRules error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

export async function listAlertEvents(
  userId: string,
  opts?: {
    kind?: AlertKind;
    includeDismissed?: boolean;
    includeSnoozed?: boolean;
    limit?: number;
  }
): Promise<OkRes<{ events: AlertEvent[] }>> {
  try {
    const limit = clampInt(opts?.limit, 1, 500, 200);

    let q = supabaseBrowser
      .from("ntj_alert_events")
      .select(
        [
          "id",
          "user_id",
          "rule_id",
          "date",
          "status",
          "triggered_at",
          "acknowledged_at",
          "dismissed_until",
          "payload",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("user_id", userId)
      .order("triggered_at", { ascending: false })
      .limit(limit);

    if (!opts?.includeDismissed) q = q.eq("status", "active");

    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };

    const rows = data ?? [];
    const ruleIds = Array.from(new Set(rows.map((r: any) => String(r?.rule_id ?? "")).filter(Boolean)));

    let ruleById = new Map<string, AlertRule>();
    if (ruleIds.length > 0) {
      const { data: rData, error: rErr } = await supabaseBrowser
        .from("ntj_alert_rules")
        .select("*")
        .eq("user_id", userId)
        .in("id", ruleIds);

      if (!rErr) {
        for (const rr of rData ?? []) {
          const r = normalizeRuleRow(rr);
          ruleById.set(r.id, r);
        }
      }
    }

    let events = rows.map((row: any) => normalizeEventRow(row, ruleById));

    if (!opts?.includeSnoozed) events = events.filter((e) => !e.snoozed);
    if (opts?.kind) events = events.filter((e) => e.kind === opts.kind);

    return { ok: true, data: { events } };
  } catch (e: any) {
    console.error(LOG, "listAlertEvents error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

export async function undeliveredAlertEvents(
  userId: string,
  opts?: {
    kind?: AlertKind;
    limit?: number;
  }
): Promise<OkRes<{ events: AlertEvent[] }>> {
  const res = await listAlertEvents(userId, {
    kind: opts?.kind,
    includeDismissed: false,
    includeSnoozed: false,
    limit: opts?.limit ?? 200,
  });

  if (!res.ok) return res;

  const events = res.data.events.filter((e) => {
    const p = safeObj(e.payload);
    // support both legacy boolean and per-channel list
    const delivered = Boolean(p.delivered);
    const deliveredChannels = new Set(safeArr(p.delivered_channels).map((x) => String(x)));

    if (delivered) return false;
    // If per-channel: if at least one channel not delivered, keep it.
    if (deliveredChannels.size > 0) {
      return e.channels.some((c) => !deliveredChannels.has(c));
    }
    return true;
  });

  return { ok: true, data: { events } };
}

export async function updateAlertRule(
  userId: string,
  ruleId: string,
  patch: Partial<Pick<AlertRule, "title" | "message" | "severity" | "enabled" | "channels" | "kind" | "category" | "description">> & {
    config?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }
): Promise<OkRes<{ ruleId: string }>> {
  try {
    // Only update real columns that exist in Option A; extra meta goes into config.
    const upd: any = {};
    if (typeof patch.title === "string") upd.title = patch.title;
    if (typeof patch.message === "string") upd.message = patch.message;
    if (patch.severity) upd.severity = patch.severity;
    if (typeof patch.enabled === "boolean") upd.enabled = patch.enabled;
    if (patch.channels) upd.channels = patch.channels;

    // Merge config meta safely
    const wantsConfigMerge = Boolean(
      patch.kind ||
        patch.category ||
        typeof patch.description === "string" ||
        patch.config ||
        (patch as any).meta
    );

    if (wantsConfigMerge) {
      const { data: existing, error: readErr } = await supabaseBrowser
        .from("ntj_alert_rules")
        .select("config")
        .eq("user_id", userId)
        .eq("id", ruleId)
        .maybeSingle();

      if (readErr) return { ok: false, error: readErr.message };

      const current = safeObj((existing as any)?.config);
      const incoming = safeObj(patch.config ?? (patch as any).meta);
      const next: Record<string, unknown> = { ...current, ...incoming };
      if (patch.kind) next.kind = patch.kind;
      if (patch.category) next.category = patch.category;
      if (typeof patch.description === "string") next.description = patch.description;
      upd.config = next;
    }

    const { error } = await supabaseBrowser
      .from("ntj_alert_rules")
      .update(upd)
      .eq("user_id", userId)
      .eq("id", ruleId);

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { ruleId } };
  } catch (e: any) {
    console.error(LOG, "updateAlertRule error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

export async function createAlertRule(
  userId: string,
  rule: {
    key?: string;
    trigger_type?: string;
    title: string;
    message: string;
    severity?: AlertSeverity;
    enabled?: boolean;
    channels?: AlertChannel[];
    kind?: AlertKind;
    category?: string;
    description?: string;
    config?: Record<string, unknown>;
  }
): Promise<OkRes<{ ruleId: string }>> {
  try {
    const cfg: Record<string, unknown> = {
      ...safeObj(rule.config),
    };
    if (rule.kind) cfg.kind = rule.kind;
    if (rule.category) cfg.category = rule.category;
    if (typeof rule.description === "string") cfg.description = rule.description;

    const row: any = {
      user_id: userId,
      key: rule.key ?? null,
      trigger_type: rule.trigger_type ?? null,
      title: rule.title,
      message: rule.message,
      severity: rule.severity ?? "info",
      enabled: rule.enabled ?? true,
      channels: normalizeChannels(rule.channels),
      config: cfg,
    };

    const { data, error } = await supabaseBrowser
      .from("ntj_alert_rules")
      .insert(row)
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { ruleId: String((data as any)?.id) } };
  } catch (e: any) {
    console.error(LOG, "createAlertRule error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

export async function fireTestEventFromRule(
  userId: string,
  ruleId: string,
  payload?: Record<string, unknown>
): Promise<OkRes<{ eventId: string }>> {
  try {
    const now = new Date();
    const date = isoDate(now);

    const nextPayload: Record<string, unknown> = {
      ...safeObj(payload),
      test: true,
      date,
      triggered_at: now.toISOString(),
    };

    // Option A has a uniqueness constraint (user_id, rule_id, date).
    const { data, error } = await supabaseBrowser
      .from("ntj_alert_events")
      .upsert(
        {
          user_id: userId,
          rule_id: ruleId,
          date,
          status: "active",
          triggered_at: now.toISOString(),
          dismissed_until: null,
          acknowledged_at: null,
          payload: nextPayload,
        },
        { onConflict: "user_id,rule_id,date" }
      )
      .select("id")
      .single();

    if (error) {
      console.error(LOG, "fireTestEventFromRule error", error);
      return { ok: false, error: error.message || "Unable to fire test event." };
    }

    return { ok: true, data: { eventId: String((data as any)?.id) } };
  } catch (e: any) {
    console.error(LOG, "fireTestEventFromRule error", e);
    return { ok: false, error: e?.message ?? "Unable to fire test event." };
  }
}

export async function snoozeAlertEvent(
  userId: string,
  eventId: string,
  minutes: number
): Promise<OkRes<{ eventId: string; snoozed_until: string | null }>> {
  try {
    const mins = clampInt(minutes, 0, 60 * 24 * 30, 0);
    const until = mins > 0 ? new Date(Date.now() + mins * 60 * 1000).toISOString() : null;

    const { error } = await supabaseBrowser
      .from("ntj_alert_events")
      .update({ dismissed_until: until })
      .eq("user_id", userId)
      .eq("id", eventId);

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { eventId, snoozed_until: until } };
  } catch (e: any) {
    console.error(LOG, "snoozeAlertEvent error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

export async function dismissAlertEvent(
  userId: string,
  eventId: string,
  payloadPatch?: Record<string, unknown>
): Promise<OkRes<{ eventId: string }>> {
  try {
    const nowIso = new Date().toISOString();

    // Option A uses status enum: active | ack
    if (payloadPatch && Object.keys(payloadPatch).length > 0) {
      const patchRes = await patchAlertEventPayload(userId, eventId, payloadPatch);
      if (!patchRes.ok) {
        console.warn(LOG, "dismissAlertEvent payload patch failed", patchRes.error);
      }
    }
    const { error } = await supabaseBrowser
      .from("ntj_alert_events")
      .update({ status: "ack", acknowledged_at: nowIso, dismissed_until: null })
      .eq("user_id", userId)
      .eq("id", eventId);

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { eventId } };
  } catch (e: any) {
    console.error(LOG, "dismissAlertEvent error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

export async function deliverAlertEvent(
  userId: string,
  eventId: string,
  channels: AlertChannel[]
): Promise<OkRes<{ eventId: string }>> {
  try {
    const { data: existing, error: readErr } = await supabaseBrowser
      .from("ntj_alert_events")
      .select("payload")
      .eq("user_id", userId)
      .eq("id", eventId)
      .maybeSingle();

    if (readErr) return { ok: false, error: readErr.message };

    const currentPayload = safeObj((existing as any)?.payload);
    const deliveredChannels = new Set(safeArr(currentPayload.delivered_channels).map((x) => String(x)));
    for (const c of channels) deliveredChannels.add(c);

    const nextPayload: Record<string, unknown> = {
      ...currentPayload,
      delivered_at: new Date().toISOString(),
      delivered_channels: Array.from(deliveredChannels),
      // keep backwards compat: consider fully delivered when all channels delivered
      delivered: false,
    };

    // If we've delivered to all channels the event wants, mark delivered=true
    const allWanted = normalizeChannels(currentPayload.channels ?? (currentPayload as any).requested_channels);
    const allSet = new Set(allWanted);
    const deliveredAll = Array.from(allSet).every((c) => deliveredChannels.has(c));
    if (deliveredAll) nextPayload.delivered = true;

    const { error } = await supabaseBrowser
      .from("ntj_alert_events")
      .update({ payload: nextPayload })
      .eq("user_id", userId)
      .eq("id", eventId);

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { eventId } };
  } catch (e: any) {
    console.error(LOG, "deliverAlertEvent error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

/**
 * Patch only the `payload` JSON of an alert event.
 *
 * Used by UI actions (e.g., storing a user decision or marking that a popup was shown)
 * without changing event status.
 */
export async function patchAlertEventPayload(
  userId: string,
  eventId: string,
  patch: Record<string, unknown>
): Promise<OkRes<{ eventId: string }>> {
  try {
    const { data: existing, error: readErr } = await supabaseBrowser
      .from("ntj_alert_events")
      .select("id,payload")
      .eq("user_id", userId)
      .eq("id", eventId)
      .maybeSingle();

    if (readErr) return { ok: false, error: readErr.message };
    if (!existing) return { ok: false, error: "Event not found." };

    const currentPayload = safeObj((existing as any).payload);
    const patchObj = safeObj(patch);

    // Shallow merge is intentional: payload is a flexible JSON bag.
    // If you need deep merges later, we can implement a safe deepMerge.
    const nextPayload: Record<string, unknown> = {
      ...currentPayload,
      ...patchObj,
      patched_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabaseBrowser
      .from("ntj_alert_events")
      .update({ payload: nextPayload })
      .eq("user_id", userId)
      .eq("id", eventId);

    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, data: { eventId } };
  } catch (e: any) {
    console.error(LOG, "patchAlertEventPayload error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

// Back-compat: some UI versions referenced deleteAlertEvent/deleteAlertRule.
// In Option A, deletes might be blocked by RLS; we try delete and fall back to ack/disable.
export async function deleteAlertEvent(userId: string, eventId: string): Promise<OkRes<{ eventId: string }>> {
  try {
    const { error } = await supabaseBrowser
      .from("ntj_alert_events")
      .delete()
      .eq("user_id", userId)
      .eq("id", eventId);

    if (!error) return { ok: true, data: { eventId } };

    // Fallback: dismiss
    return await dismissAlertEvent(userId, eventId);
  } catch (e: any) {
    console.error(LOG, "deleteAlertEvent error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

export async function deleteAlertRule(userId: string, ruleId: string): Promise<OkRes<{ ruleId: string }>> {
  try {
    const { error } = await supabaseBrowser
      .from("ntj_alert_rules")
      .delete()
      .eq("user_id", userId)
      .eq("id", ruleId);

    if (!error) return { ok: true, data: { ruleId } };

    // Fallback: disable
    return await updateAlertRule(userId, ruleId, { enabled: false });
  } catch (e: any) {
    console.error(LOG, "deleteAlertRule error", e);
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

export function subscribeToAlertEvents(
  userId: string,
  cb: (event: AlertEvent) => void
): { unsubscribe: () => void } {
  const channel: RealtimeChannel = supabaseBrowser
    .channel(`ntj_alert_events:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "ntj_alert_events",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        try {
          const row: any = payload?.new;
          const ev = normalizeEventRow(row, new Map());
          cb(ev);
        } catch (e) {
          console.error(LOG, "subscribeToAlertEvents handler error", e);
        }
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      supabaseBrowser.removeChannel(channel);
    },
  };
}
