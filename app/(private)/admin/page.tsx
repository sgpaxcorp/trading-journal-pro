"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import TopNav from "@/app/components/TopNav";

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
  conversionRate: number;
};

export default function AdminDashboardPage() {
  const { user, loading } = useAuth() as any;
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
        <p className="text-sm text-slate-400">Cargando…</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h1 className="text-xl font-semibold">Acceso restringido</h1>
          <p className="text-sm text-slate-400 mt-2">
            Esta sección es solo para el staff autorizado.
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
            Admin
          </p>
          <h1 className="text-2xl font-semibold">Platform Insights</h1>
          <p className="text-sm text-slate-400">
            Métricas de uso y crecimiento para optimizar la plataforma.
          </p>
        </header>

        {loadingMetrics && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm text-slate-400">Cargando métricas…</p>
          </div>
        )}

        {metrics && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Usuarios
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.totals.users}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  Activos 7d: {metrics.actives.last7d} · 30d: {metrics.actives.last30d}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Suscripciones
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.totals.activeSubs}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  Conversión: {metrics.conversionRate}%
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Add-ons
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.totals.addonActive}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  Option Flow activos
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Nuevos registros
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.signups.last7d}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  Últimos 30d: {metrics.signups.last30d}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Sesiones (30d)
                </p>
                <p className="text-2xl font-semibold mt-2">{metrics.usage.sessions30d}</p>
                <p className="text-[12px] text-slate-400 mt-1">
                  Tiempo promedio: {metrics.usage.avgSessionMinutes} min
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  Health
                </p>
                <p className="text-[12px] text-slate-400 mt-2">
                  Insights listos para optimizar onboarding, pricing y features.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Páginas más usadas</h2>
                <p className="text-xs text-slate-400">Últimos 30 días</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="py-2">Página</th>
                      <th className="py-2">Visitas</th>
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
                          Sin datos suficientes aún.
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
