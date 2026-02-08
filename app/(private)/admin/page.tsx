"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import TopNav from "@/app/components/TopNav";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type Metrics = {
  totals: {
    users: number;
    activeSubs: number;
    addonActive: number;
  };
  actives: {
    last7d: number;
    last30d: number;
  };
  signups: {
    last7d: number;
    last30d: number;
  };
  usage: {
    topPages: { path: string; count: number }[];
    sessions30d: number;
    avgSessionMinutes: number;
  };
  series: {
    dailyEvents: { date: string; count: number }[];
    dailySessions: { date: string; count: number }[];
    dailySignups: { date: string; count: number }[];
  };
  conversionRate: number;
};

function Sparkline({
  data,
  stroke = "#34d399",
}: {
  data?: { date: string; count: number }[] | null;
  stroke?: string;
}) {
  const safeData = data ?? [];
  const values = safeData.map((d) => d.count);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = safeData
    .map((d, i) => {
      const x = (i / Math.max(1, safeData.length - 1)) * 120;
      const y = 36 - ((d.count - min) / range) * 36;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 120 40" className="w-full h-10">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={points || "0,36 120,36"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminDashboardPage() {
  const { user, loading } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    const load = async () => {
      setLoadingMetrics(true);
      setForbidden(false);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          setForbidden(true);
          return;
        }
        const res = await fetch("/api/admin/metrics", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        const body = await res.json();
        setMetrics(body);
      } catch {
        setForbidden(true);
      } finally {
        setLoadingMetrics(false);
      }
    };
    load();
  }, [loading, user]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">{L("Loading…", "Cargando…")}</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h1 className="text-xl font-semibold">{L("Access restricted", "Acceso restringido")}</h1>
          <p className="text-sm text-slate-400 mt-2">
            {L(
              "This section is only for authorized staff.",
              "Esta sección es solo para el staff autorizado."
            )}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-300">
            {L("Admin", "Admin")}
          </p>
          <h1 className="text-2xl font-semibold">{L("Platform Insights", "Insights de plataforma")}</h1>
          <p className="text-sm text-slate-400">
            {L(
              "Usage and growth metrics to optimize the platform.",
              "Métricas de uso y crecimiento para optimizar la plataforma."
            )}
          </p>
        </header>

        {loadingMetrics && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm text-slate-400">
              {L("Loading metrics…", "Cargando métricas…")}
            </p>
          </div>
        )}

        {metrics && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Users", "Usuarios")}
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.totals.users}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  {L("Active 7d", "Activos 7d")}: {metrics.actives.last7d} ·{" "}
                  {L("30d", "30d")}: {metrics.actives.last30d}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Subscriptions", "Suscripciones")}
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.totals.activeSubs}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  {L("Conversion", "Conversión")}: {metrics.conversionRate}%
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Add-ons", "Add-ons")}
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.totals.addonActive}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  {L("Option Flow active", "Option Flow activos")}
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("New signups", "Nuevos registros")}
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.signups.last7d}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  {L("Last 30d", "Últimos 30d")}: {metrics.signups.last30d}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Sessions (30d)", "Sesiones (30d)")}
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.usage.sessions30d}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  {L("Avg time", "Tiempo promedio")}: {metrics.usage.avgSessionMinutes}{" "}
                  {L("min", "min")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Health", "Health")}
                </p>
                <p className="text-[12px] text-slate-400 mt-2">
                  {L(
                    "Insights ready to optimize onboarding, pricing, and features.",
                    "Insights listos para optimizar onboarding, pricing y features."
                  )}
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    {L("Daily events", "Eventos diarios")}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {L("30d", "30d")}
                  </span>
                </div>
                <p className="text-lg font-semibold mt-2">
                  {metrics.series?.dailyEvents?.at(-1)?.count ?? 0}
                </p>
                <Sparkline data={metrics.series?.dailyEvents} stroke="#38bdf8" />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    {L("Daily sessions", "Sesiones diarias")}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {L("30d", "30d")}
                  </span>
                </div>
                <p className="text-lg font-semibold mt-2">
                  {metrics.series?.dailySessions?.at(-1)?.count ?? 0}
                </p>
                <Sparkline data={metrics.series?.dailySessions} stroke="#34d399" />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    {L("Daily signups", "Registros diarios")}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {L("30d", "30d")}
                  </span>
                </div>
                <p className="text-lg font-semibold mt-2">
                  {metrics.series?.dailySignups?.at(-1)?.count ?? 0}
                </p>
                <Sparkline data={metrics.series?.dailySignups} stroke="#f59e0b" />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {L("Top pages", "Páginas más usadas")}
                </h2>
                <p className="text-xs text-slate-400">{L("Last 30 days", "Últimos 30 días")}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="py-2">{L("Page", "Página")}</th>
                      <th className="py-2">{L("Visits", "Visitas")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.usage.topPages.map((row) => (
                      <tr key={row.path} className="border-t border-slate-800">
                        <td className="py-2 text-slate-100">{row.path}</td>
                        <td className="py-2 text-emerald-200">{row.count}</td>
                      </tr>
                    ))}
                    {!metrics.usage.topPages.length && (
                      <tr>
                        <td className="py-3 text-slate-500" colSpan={2}>
                          {L("Not enough data yet.", "Sin datos suficientes aún.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
