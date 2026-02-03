"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AlertPopupDialog from "@/app/components/AlertPopupDialog";
import {
  AlertEvent,
  AlertChannel,
  AlertSeverity,
  deliverAlertEvent,
  dismissAlertEvent,
  snoozeAlertEvent,
  subscribeToAlertEvents,
  undeliveredAlertEvents,
} from "@/lib/alertsSupabase";

/**
 * GlobalAlertPopups
 *
 * - Polls + realtime subscription for undelivered events
 * - Presents modal popups sequentially
 * - Marks events as delivered to prevent repeat popups
 * - Optional voice via SpeechSynthesis when "voice" channel is enabled
 */

type PopupData = {
  id: string;
  kind: "alarm" | "reminder" | "notification";
  severity: AlertSeverity;
  title: string;
  message: string;
  channels: string[];
  created_at?: string | null;
  triggered_at?: string | null;
  category?: string | null;
  payload?: any;
};

function canSpeak(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

function speakOnce(text: string) {
  try {
    if (!canSpeak()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

export default function GlobalAlertPopups() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [queue, setQueue] = useState<AlertEvent[]>([]);
  const [current, setCurrent] = useState<AlertEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const pullingRef = useRef(false);

  const popData: PopupData | null = useMemo(() => {
    if (!current) return null;
    return {
      id: current.id,
      kind: current.kind,
      severity: current.severity,
      title: current.title,
      message: current.message,
      channels: current.channels,
      created_at: current.created_at ?? null,
      triggered_at: current.triggered_at ?? null,
      category: current.category ?? null,
      payload: current.payload ?? null,
    };
  }, [current]);

  const pull = useCallback(async () => {
    if (!userId) return;
    if (pullingRef.current) return;
    pullingRef.current = true;
    try {
      const res = await undeliveredAlertEvents(userId, { limit: 25 });
      if (!res.ok) return;

      const next = res.data.events;
      if (next.length === 0) return;

      const popupEvents = next.filter((e) => (e.channels ?? []).includes("popup") || (e.channels ?? []).includes("voice"));
      const inappOnly = next.filter((e) => !((e.channels ?? []).includes("popup") || (e.channels ?? []).includes("voice")));

      if (inappOnly.length > 0) {
        await Promise.all(
          inappOnly.map((e) => deliverAlertEvent(userId, e.id, e.channels ?? ["inapp"]))
        );
      }

      if (popupEvents.length === 0) return;

      setQueue((prev) => {
        // Merge unique by id, preserving order (new first)
        const seen = new Set(prev.map((e) => e.id));
        const merged: AlertEvent[] = [...prev];
        for (const e of popupEvents) {
          if (!seen.has(e.id)) {
            merged.unshift(e);
            seen.add(e.id);
          }
        }
        return merged;
      });
    } finally {
      pullingRef.current = false;
    }
  }, [userId]);

  // Drive the modal: if no current and queue has items, pop one.
  useEffect(() => {
    if (!userId) return;
    if (current) return;
    if (queue.length === 0) return;

    const next = queue[queue.length - 1];
    setQueue((prev) => prev.slice(0, -1));
    setCurrent(next);
    setOpen(true);
  }, [userId, current, queue]);

  // When a new current event is shown, mark it delivered (popup + inapp + voice)
  useEffect(() => {
    if (!userId) return;
    if (!current) return;

    let cancelled = false;
    (async () => {
      try {
        const deliveredChannels = Array.from(new Set<AlertChannel>([...(current.channels ?? []), "popup"]));
        await deliverAlertEvent(userId, current.id, deliveredChannels);

        if (!cancelled) {
          // Voice: best-effort (may be blocked until user interacts with the page)
          if ((current.channels ?? []).includes("voice")) {
            speakOnce(`${current.title}. ${current.message}`);
          }
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, current]);

  // Subscription + polling
  useEffect(() => {
    if (!userId) return;

    pull().catch(() => void 0);

    const sub = subscribeToAlertEvents(userId, () => {
      pull().catch(() => void 0);
    });

    const t = window.setInterval(() => {
      pull().catch(() => void 0);
    }, 10_000);

    // Immediate pull hook (used after firing test events / running engine)
    const onForcePull = () => {
      pull().catch(() => void 0);
    };
    window.addEventListener("ntj_alert_force_pull", onForcePull);

    return () => {
      window.clearInterval(t);
      window.removeEventListener("ntj_alert_force_pull", onForcePull);
      sub?.unsubscribe?.();
    };
  }, [userId, pull]);

  const close = useCallback(() => {
    setOpen(false);
    setCurrent(null);
  }, []);

  const onSnooze = useCallback(
    async (minutes: number) => {
      if (!userId || !current) return;
      setBusy(true);
      try {
        await snoozeAlertEvent(userId, current.id, minutes);
        try {
          window.dispatchEvent(new Event("ntj_alert_force_pull"));
        } catch {}
      } finally {
        setBusy(false);
        close();
      }
    },
    [userId, current, close]
  );

  const onDismiss = useCallback(async () => {
    if (!userId || !current) return;
    setBusy(true);
    try {
      await dismissAlertEvent(userId, current.id, { reason: "Dismissed from popup" });
      try {
        window.dispatchEvent(new Event("ntj_alert_force_pull"));
      } catch {}
    } finally {
      setBusy(false);
      close();
    }
  }, [userId, current, close]);

  const onResolve = useCallback(
    async (resolution: string) => {
      if (!userId || !current) return;
      setBusy(true);
      try {
        const reason =
          resolution === "keep_open"
            ? "Marked as swing / intentional hold"
            : resolution === "close_at_zero"
              ? "Close at $0 / let expire"
              : `Resolution: ${resolution}`;
        await dismissAlertEvent(userId, current.id, { reason, resolution });
        try {
          window.dispatchEvent(new Event("ntj_alert_force_pull"));
        } catch {}
      } finally {
        setBusy(false);
        close();
      }
    },
    [userId, current, close]
  );

  if (!userId || !popData) return null;

  return (
    <AlertPopupDialog
      open={open}
      busy={busy}
      data={popData}
      onClose={close}
      onSnooze={onSnooze}
      onDismiss={onDismiss}
      onResolve={onResolve}
    />
  );
}
