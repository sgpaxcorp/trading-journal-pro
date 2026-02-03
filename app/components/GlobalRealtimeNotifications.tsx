"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import TrophyCelebrationDialog from "@/app/components/TrophyCelebrationDialog";
import {
  EarnedTrophyNotification,
  fetchRecentEarnedTrophies,
  subscribeToTrophyNotifications,
} from "@/lib/notifications";

/**
 * GlobalRealtimeNotifications (trophies)
 *
 * This component is intentionally focused on trophy celebrations.
 * Alerts (Rules & Alarms) are handled by `GlobalAlertRuleEngine` + `GlobalAlertPopups`.
 */

export default function GlobalRealtimeNotifications() {
  const { user } = useAuth() as any;
  const userId: string | null = user?.id ?? null;

  const [queue, setQueue] = useState<EarnedTrophyNotification[]>([]);
  const [active, setActive] = useState<EarnedTrophyNotification | null>(null);

  // Session de-dupe (avoid spamming the same trophy)
  const seenRef = useRef<Set<string>>(new Set());

  const storageKey = useMemo(
    () => (userId ? `ntj_seen_trophies_${userId}` : null),
    [userId]
  );

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (const id of arr) {
          if (typeof id === "string") seenRef.current.add(id);
        }
      }
    } catch {}
  }, [storageKey]);

  function persistSeen() {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(seenRef.current).slice(-200)));
    } catch {}
  }

  async function pullTrophies() {
    if (!userId) return;
    const res = await fetchRecentEarnedTrophies(userId, { limit: 20 });
    if (!res.ok || !res.trophies.length) return;

    const fresh = res.trophies.filter((t) => !seenRef.current.has(t.trophy_id));
    if (!fresh.length) return;

    // mark as seen right away so realtime + poll don't double-enqueue
    for (const t of fresh) seenRef.current.add(t.trophy_id);
    persistSeen();

    setQueue((prev) => [...prev, ...fresh]);
  }

  // Initial pull + realtime
  useEffect(() => {
    if (!userId) return;

    pullTrophies().catch(() => {});

    const sub = subscribeToTrophyNotifications(userId, () => {
      pullTrophies().catch(() => {});
    });

    const poll = window.setInterval(() => {
      pullTrophies().catch(() => {});
    }, 45000);

    return () => {
      try {
        sub?.unsubscribe?.();
      } catch {}
      try {
        window.clearInterval(poll);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Drain queue into active dialog
  useEffect(() => {
    if (active) return;
    if (queue.length === 0) return;
    setActive(queue[0]);
    setQueue((q) => q.slice(1));
  }, [queue, active]);

  if (!active) return null;

  return (
    <TrophyCelebrationDialog
      open={!!active}
      trophy={active}
      onClose={() => setActive(null)}
    />
  );
}
