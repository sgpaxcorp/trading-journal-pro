"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import CandleAssistant from "@/app/components/NeuroAssistant";




/**
 * Global Reminder/Alert delivery bridge
 * - Listens for new rows in `public.ntj_alert_events` (status='active')
 * - Delivers via:
 *   - inapp: pushes message to Neuro Assistant (event bus)
 *   - popup: shows a lightweight toast
 *   - voice: speaks via SpeechSynthesis (best-effort; browser may require user gesture)
 * - Marks event as delivered by writing into `payload` JSON (payload.delivered=true, delivered_at, delivered_channels)
 *
 * IMPORTANT:
 * This matches your current schema used by the Reminders page:
 * `ntj_alert_events`: { id, user_id, rule_id, status, triggered_at, dismissed_until, payload, ... }
 * `ntj_alert_rules`: { id, user_id, title, message, severity, channels[], enabled, ... }
 */

type PrivateLayoutProps = {
  children: React.ReactNode;
};

const ALLOW_WITHOUT_ACTIVE_SUB = [
  "/billing",
  "/billing/complete",
  "/billing/success",
  "/pricing",
  "/confirmed",
];

/* -------------------------
   Utilities
------------------------- */

function isoDate(d: Date) {
  // local date (YYYY-MM-DD)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeObj(x: unknown): Record<string, any> {
  if (!x) return {};
  if (typeof x === "object") return x as Record<string, any>;
  if (typeof x === "string") {
    try {
      const parsed = JSON.parse(x);
      if (parsed && typeof parsed === "object") return parsed as Record<string, any>;
    } catch {}
  }
  return {};
}

function normalizeChannels(ch: unknown): Array<"voice" | "popup" | "inapp"> {
  const out: Array<"voice" | "popup" | "inapp"> = [];
  const push = (v: string) => {
    const s = v.toLowerCase();
    if (s === "voice" || s === "popup" || s === "inapp") out.push(s);
  };

  if (Array.isArray(ch)) {
    for (const v of ch) push(String(v));
  } else if (typeof ch === "string") {
    // allow "voice,popup" etc
    for (const v of ch.split(",")) push(v.trim());
  }

  // de-dupe
  return Array.from(new Set(out));
}

function severityAccent(sevRaw: unknown) {
  const s = String(sevRaw ?? "").toLowerCase();
  if (s === "critical") return "rgba(244,63,94,0.92)"; // rose-500
  if (s === "warning") return "rgba(234,179,8,0.92)"; // amber-500
  if (s === "success") return "rgba(34,197,94,0.92)"; // green-500
  return "rgba(148,163,184,0.92)"; // slate-400
}

function speakNeuro(text: string) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;

  try {
    // Cancel any previous utterance to prevent overlap
    synth.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.03;
    u.pitch = 1.0;
    u.volume = 1.0;

    // Best-effort language selection
    u.lang = navigator.language || "en-US";

    synth.speak(u);
  } catch {
    // ignore: voice may be blocked until user gesture
  }
}

function pushNeuroMessage(text: string) {
  if (typeof window === "undefined") return;
  // This event name is what we standardize in `app/components/neuroEventBus.ts(x)`
  window.dispatchEvent(
    new CustomEvent("ntj_neuro_push", { detail: { kind: "neuro_push", text } })
  );
}

/* -------------------------
   Types (DB rows)
------------------------- */

type AlertRuleRow = {
  id: string;
  title: string | null;
  message: string | null;
  severity: string | null;
  channels: unknown; // text[] in PG, but returned as any
  enabled?: boolean | null;
};

type AlertEventRow = {
  id: string;
  user_id: string;
  rule_id: string;
  status: string; // "active" | "ack" (as used by Reminders page)
  triggered_at: string | null;
  dismissed_until: string | null;
  payload: any;
  date?: string | null;
};

/* -------------------------
   Global listener component
------------------------- */

function GlobalReminderListener({
  userId,
  enabled,
}: {
  userId: string | null;
  enabled: boolean;
}) {
  const [toast, setToast] = useState<{
    title: string;
    message: string;
    accent: string;
  } | null>(null);

  const deliveredThisSessionRef = useRef<Set<string>>(new Set());
  const rulesCacheRef = useRef<Map<string, AlertRuleRow | null>>(new Map());
  const pollingRef = useRef<number | null>(null);

  const lastPullAtRef = useRef<number>(0);

  const nowIso = useMemo(() => isoDate(new Date()), []);

  async function fetchRule(ruleId: string): Promise<AlertRuleRow | null> {
    const cached = rulesCacheRef.current.get(ruleId);
    if (cached !== undefined) return cached;

    const { data, error } = await supabaseBrowser
      .from("ntj_alert_rules")
      .select("id,title,message,severity,channels,enabled")
      .eq("id", ruleId)
      .maybeSingle();

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[GlobalReminderListener] fetchRule error:", error);
      }
      rulesCacheRef.current.set(ruleId, null);
      return null;
    }

    const row = (data as any) as AlertRuleRow | null;
    rulesCacheRef.current.set(ruleId, row);
    return row;
  }

  function shouldSkipEvent(ev: AlertEventRow) {
    if (!ev) return true;

    // Only active events
    if (String(ev.status).toLowerCase() !== "active") return true;

    // If dismissed until future, skip
    if (ev.dismissed_until) {
      const t = new Date(ev.dismissed_until).getTime();
      if (!Number.isNaN(t) && Date.now() < t) return true;
    }

    // If already delivered (DB payload) skip
    const payload = safeObj(ev.payload);
    if (payload.delivered === true) return true;

    // If already delivered in this session, skip
    if (deliveredThisSessionRef.current.has(ev.id)) return true;

    // Optional: avoid delivering extremely stale alerts as popups/voice.
    // We still allow them to appear in the Reminders UI as "active".
    // Here we deliver them, but you can tighten this if needed.
    return false;
  }

  async function markDelivered(
    ev: AlertEventRow,
    deliveredChannels: Array<"voice" | "popup" | "inapp">
  ) {
    const base = safeObj(ev.payload);
    const nextPayload = {
      ...base,
      delivered: true,
      delivered_at: new Date().toISOString(),
      delivered_channels: deliveredChannels,
    };

    // In-session de-dupe regardless of DB update outcome
    deliveredThisSessionRef.current.add(ev.id);

    const { error } = await supabaseBrowser
      .from("ntj_alert_events")
      .update({ payload: nextPayload })
      .eq("id", ev.id);

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[GlobalReminderListener] markDelivered update error:", error);
      }
      // We keep the in-session de-dupe; DB may re-deliver next session if policy blocks update.
    }
  }

  async function deliverEvent(ev: AlertEventRow) {
    const rule = await fetchRule(ev.rule_id);

    const title = (rule?.title ?? "Reminder").toString();
    const message = (rule?.message ?? "A reminder rule triggered.").toString();
    const severity = rule?.severity ?? "info";
    const channels = normalizeChannels(rule?.channels ?? ["inapp"]);

    // Deliver
    const neuroText = `${title}: ${message}`;

    if (channels.includes("inapp")) {
      pushNeuroMessage(neuroText);
    }

    if (channels.includes("popup")) {
      setToast({
        title,
        message,
        accent: severityAccent(severity),
      });
    }

    if (channels.includes("voice")) {
      // If voice is blocked by browser policy, we still delivered in-app/popup.
      speakNeuro(neuroText);
    }

    await markDelivered(ev, channels);
  }

  async function pullActiveUndelivered() {
    if (!userId || !enabled) return;

    // Throttle to avoid storms if realtime spams
    const now = Date.now();
    if (now - lastPullAtRef.current < 1500) return;
    lastPullAtRef.current = now;

    const { data, error } = await supabaseBrowser
      .from("ntj_alert_events")
      .select("id,user_id,rule_id,status,triggered_at,dismissed_until,payload,date")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("triggered_at", { ascending: false })
      .limit(25);

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[GlobalReminderListener] pullActiveUndelivered error:", error);
      }
      return;
    }

    const rows = (data ?? []) as any as AlertEventRow[];

    // First deliver newest-first, but only those not delivered
    for (const ev of rows) {
      if (shouldSkipEvent(ev)) continue;

      // If this is a daily-type event and the row has `date`, you can optionally
      // restrict delivery to today only. Uncomment if you prefer:
      //
      // if (ev.date && ev.date !== nowIso) continue;

      await deliverEvent(ev);
    }
  }

  useEffect(() => {
    if (!enabled || !userId) return;

    // initial pull
    pullActiveUndelivered().catch(() => {});

    // Realtime subscription (optional, depends on Supabase "Enable Realtime" for table)
    const channel = supabaseBrowser
      .channel(`ntj-alert-events-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ntj_alert_events",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          pullActiveUndelivered().catch(() => {});
        }
      )
      .subscribe();

    // Poll fallback (always works even if Realtime isn't enabled)
    pollingRef.current = window.setInterval(() => {
      pullActiveUndelivered().catch(() => {});
    }, 12000);

    return () => {
      try {
        if (pollingRef.current) window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      } catch {}
      try {
        supabaseBrowser.removeChannel(channel);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId]);

  // Auto-hide toast after a few seconds
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-80 w-[min(560px,92vw)]">
      <div
        className="rounded-2xl border border-slate-800 bg-slate-950/90 backdrop-blur px-4 py-3 shadow-2xl"
        style={{
          boxShadow:
            "0 18px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(16,185,129,0.10)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: toast.accent }}
              />
              <p className="text-sm font-semibold text-slate-100 truncate">
                {toast.title}
              </p>
            </div>
            <p className="mt-1 text-[12px] text-slate-300 leading-snug">
              {toast.message}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setToast(null)}
            className="shrink-0 rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800"
          >
            Dismiss
          </button>
        </div>

        <div className="mt-2 text-[10px] text-slate-500">
          Delivered by Neuro • Reminders engine
        </div>
      </div>
    </div>
  );
}

/* -------------------------
   Layout
------------------------- */



export default function PrivateLayout({ children }: PrivateLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth() as any;

  const [subscriptionStatus, setSubscriptionStatus] =
    useState<string>("pending");
  const [onboardingCompleted, setOnboardingCompleted] =
    useState<boolean>(false);
  const [profileChecked, setProfileChecked] = useState(false);

  // Intentos de re-check para darle tiempo al webhook
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const MAX_REFRESH_ATTEMPTS = 3;

  /* 1) Si no hay usuario y ya terminó de cargar → mandar a /signin */
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  /* 2) Leer perfil más reciente desde Supabase (tabla profiles) */
  useEffect(() => {
    if (loading || !user) return;

    const fetchProfile = async () => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[PrivateLayout] Fetching profile for user:", user.id);
      }

      const { data, error } = await supabaseBrowser
        .from("profiles")
        .select("subscription_status, onboarding_completed, plan")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        console.error("[PrivateLayout] Error loading profile:", error);
        setProfileChecked(true);
        return;
      }

      const status =
        (data.subscription_status as string | undefined) ?? "pending";
      const onboarding =
        (data.onboarding_completed as boolean | undefined) ?? false;
      const plan = (data.plan as string | undefined) ?? null;

      if (process.env.NODE_ENV !== "production") {
        console.log("[PrivateLayout] subscription_status:", status);
        console.log("[PrivateLayout] onboarding_completed:", onboarding);
        console.log("[PrivateLayout] plan:", plan);
      }

      setSubscriptionStatus(status);
      setOnboardingCompleted(onboarding);
      setProfileChecked(true);
    };

    fetchProfile();
  }, [loading, user]);

  /* 3) Profile checker + gating: suscripción + quick tour */
  useEffect(() => {
    if (loading || !user || !profileChecked) return;

    const isActive = subscriptionStatus === "active";
    const isOnAllowedRoute = ALLOW_WITHOUT_ACTIVE_SUB.some((p) =>
      pathname.startsWith(p)
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[PrivateLayout] Gating with status:",
        subscriptionStatus,
        "onboardingCompleted:",
        onboardingCompleted,
        "pathname:",
        pathname,
        "refreshAttempts:",
        refreshAttempts
      );
    }

    // Si la suscripción está activa → manejar quick-tour y salir
    if (isActive) {
      if (!onboardingCompleted && pathname !== "/quick-tour") {
        router.replace("/quick-tour");
      }
      return;
    }

    // Si NO está activa pero estamos en una ruta que se permite sin sub activa,
    // no hacemos nada (ej. /billing, /billing/success, etc.)
    if (!isActive && isOnAllowedRoute) {
      return;
    }

    // Aquí: no está activa, estamos en ruta privada real.
    // Damos chance al webhook: re-check del perfil con pequeños delays.
    if (refreshAttempts < MAX_REFRESH_ATTEMPTS) {
      const timer = setTimeout(async () => {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            "[PrivateLayout] Re-checking profile (attempt",
            refreshAttempts + 1,
            ")"
          );
        }

        const { data, error } = await supabaseBrowser
          .from("profiles")
          .select("subscription_status, onboarding_completed")
          .eq("id", user.id)
          .single();

        if (!error && data) {
          const status =
            (data.subscription_status as string | undefined) ?? "pending";
          const onboarding =
            (data.onboarding_completed as boolean | undefined) ?? false;

          if (process.env.NODE_ENV !== "production") {
            console.log(
              "[PrivateLayout] Re-check result:",
              status,
              "onboarding:",
              onboarding
            );
          }

          setSubscriptionStatus(status);
          setOnboardingCompleted(onboarding);
        } else {
          console.error("[PrivateLayout] Error on re-check:", error);
        }

        setRefreshAttempts((prev) => prev + 1);
      }, 2000); // 2s entre intentos

      return () => clearTimeout(timer);
    }

    // Si ya intentamos varias veces y sigue sin estar activa → mandar a /billing/complete
    if (!isActive && refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
      router.replace("/billing/complete");
    }
  }, [
    loading,
    user,
    profileChecked,
    subscriptionStatus,
    onboardingCompleted,
    pathname,
    router,
    refreshAttempts,
  ]);

  const isOnAllowedRoute = ALLOW_WITHOUT_ACTIVE_SUB.some((p) =>
    pathname.startsWith(p)
  );
  const isActive = subscriptionStatus === "active";

  const isVerifyingSubscription =
    !!user &&
    profileChecked &&
    !isActive &&
    !isOnAllowedRoute &&
    refreshAttempts < MAX_REFRESH_ATTEMPTS;

  const userId: string | null = user?.id ?? null;

  // Pantalla de "verificando tu pago" mientras damos tiempo al webhook
  if (isVerifyingSubscription) {
    return (
      <>
        <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center">
          <div className="px-6 py-4 rounded-xl border border-emerald-400/60 bg-slate-900/80 shadow-lg max-w-sm text-center">
            <p className="text-sm font-semibold text-emerald-300 mb-1">
              Verifying your subscription…
            </p>
            <p className="text-[11px] text-slate-300">
              We’re confirming your payment with Stripe. This usually takes just
              a few seconds.
            </p>
          </div>
        </div>

        {/* Global listener still mounted (best-effort) */}
        <GlobalReminderListener userId={userId} enabled={!!userId} />

        <CandleAssistant />
      </>
    );
  }

  return (
    <>
      {children}

      {/* ✅ GLOBAL: This is what makes Reminders fire popups/voice/inapp from ANY private page */}
      <GlobalReminderListener
        userId={userId}
        enabled={!!userId && isActive && profileChecked}
      />

      <CandleAssistant />
    </>
  );
}
