// lib/alertEventsSupabase.ts
/**
 * Compatibility wrapper.
 *
 * The project has historically had both:
 * - lib/alertEventsSupabase.ts (events-only)
 * - lib/alertsSupabase.ts      (rules + events)
 *
 * To reduce future breakage, this file re-exports the canonical APIs from alertsSupabase
 * and provides a couple of legacy helpers.
 */

export type {
  AlertEvent,
  AlertEventStatus,
  AlertRule,
  AlertKind,
  AlertSeverity,
  AlertChannel,
} from "@/lib/alertsSupabase";

export {
  listAlertEvents,
  subscribeToAlertEvents,
  undeliveredAlertEvents,
  dismissAlertEvent,
  snoozeAlertEvent,
  deleteAlertEvent,
  deliverAlertEvent,
  isEventActive,
  isEventSnoozed,
} from "@/lib/alertsSupabase";

import { listAlertEvents as _listAlertEvents } from "@/lib/alertsSupabase";
import type { AlertEvent } from "@/lib/alertsSupabase";

/**
 * Legacy: fetch recent alert events.
 * Returns an array (not the {ok, events} envelope).
 */
export async function fetchRecentAlertEvents(userId: string, limit = 50): Promise<AlertEvent[]> {
  const res = await _listAlertEvents(userId, { includeDismissed: true, includeSnoozed: true, limit });
  return res.ok ? res.data.events : [];
}
