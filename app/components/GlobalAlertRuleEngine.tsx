"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

function emitForcePull(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("ntj_alert_force_pull"));
  } catch {
    // ignore
  }
}

export default function GlobalAlertRuleEngine() {
  const { user } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);

  const userId = user?.id ?? "";
  const isRunningRef = useRef(false);
  const mountedRef = useRef(true);

  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastRunOk, setLastRunOk] = useState(true);
  const [lastRunNote, setLastRunNote] = useState("");

  const runOnce = useCallback(async () => {
    if (!userId || isRunningRef.current) return;
    isRunningRef.current = true;

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setLastRunOk(false);
        setLastRunNote(L("Unable to verify your session.", "No pudimos verificar tu sesión."));
        setLastRunAt(new Date().toISOString());
        return;
      }

      const res = await fetch("/api/alerts/evaluate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-ntj-lang": lang,
        },
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLastRunOk(false);
        setLastRunNote(body?.error || L("Rule engine failed.", "Falló el motor de reglas."));
        setLastRunAt(new Date().toISOString());
        return;
      }

      const created = Number(body?.created ?? 0);
      const updated = Number(body?.updated ?? 0);
      const resolved = Number(body?.resolved ?? 0);
      const rulesEnabled = Number(body?.rulesEnabled ?? 0);

      if (created + updated + resolved > 0) emitForcePull();

      setLastRunOk(true);
      setLastRunNote(
        rulesEnabled <= 0
          ? L("No enabled rules.", "No hay reglas activas.")
          : created + updated + resolved > 0
            ? isEs
              ? `Eventos: +${created} creados, ${updated} actualizados, ${resolved} resueltos.`
              : `Events: +${created} created, ${updated} updated, ${resolved} resolved.`
            : L("No triggers.", "Sin disparos.")
      );
      setLastRunAt(new Date().toISOString());
    } catch (error: any) {
      setLastRunOk(false);
      setLastRunNote(error?.message || L("Rule engine failed.", "Falló el motor de reglas."));
      setLastRunAt(new Date().toISOString());
      console.error("[alerts-engine] error", error);
    } finally {
      isRunningRef.current = false;
    }
  }, [L, isEs, lang, userId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) return () => {};

    void runOnce();
    const timer = window.setInterval(() => {
      if (!mountedRef.current) return;
      void runOnce();
    }, 30_000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [runOnce, userId]);

  useEffect(() => {
    if (!userId) return;
    const handler = () => {
      void runOnce();
    };
    window.addEventListener("ntj_alert_engine_run_now", handler);
    return () => window.removeEventListener("ntj_alert_engine_run_now", handler);
  }, [runOnce, userId]);

  if (!userId) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[9999] hidden">
      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          lastRunOk
            ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-200"
            : "border-rose-900/60 bg-rose-950/30 text-rose-200"
        }`}
      >
        <div className="font-semibold">Rules engine</div>
        <div>Last: {lastRunAt ? new Date(lastRunAt).toLocaleTimeString() : "—"}</div>
        <div>{lastRunNote}</div>
      </div>
    </div>
  );
}
