"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import TopNav from "@/app/components/TopNav";
import AccessGrantManager from "@/app/(private)/admin/AccessGrantManager";
import AdminEmailAutomations from "@/app/(private)/admin/AdminEmailAutomations";
import AdminSupportInbox from "@/app/(private)/admin/AdminSupportInbox";
import AdminUsersManager from "@/app/(private)/admin/AdminUsersManager";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

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

type AdminTab = "overview" | "growth" | "usage" | "emails" | "users" | "inbox";
type UsersSubview = "directory" | "access";

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
    <svg viewBox="0 0 120 40" className="h-10 w-full">
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

function SectionShell({
  eyebrow,
  title,
  description,
  right,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
          ) : null}
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
            {description ? <p className="max-w-3xl text-sm text-slate-400">{description}</p> : null}
          </div>
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "success" | "info" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : tone === "info"
        ? "border-sky-500/20 bg-sky-500/5"
        : tone === "warning"
          ? "border-amber-500/20 bg-amber-500/5"
          : "border-slate-800 bg-slate-950/50";

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-100">{value}</p>
      {sub ? <p className="mt-2 text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

function TrendCard({
  label,
  value,
  rangeLabel,
  stroke,
  data,
}: {
  label: string;
  value: string | number;
  rangeLabel: string;
  stroke: string;
  data?: { date: string; count: number }[] | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
        <span className="text-[10px] text-slate-500">{rangeLabel}</span>
      </div>
      <p className="mt-3 text-xl font-semibold text-slate-100">{value}</p>
      <div className="mt-4">
        <Sparkline data={data} stroke={stroke} />
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
          : "border-slate-800 bg-slate-950/50 text-slate-200 hover:border-slate-700"
      }`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-slate-400">{description}</div>
    </button>
  );
}

export default function AdminDashboardPage() {
  const { user, loading } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [usersSubview, setUsersSubview] = useState<UsersSubview>("directory");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [scheduleHourNy, setScheduleHourNy] = useState("13");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);

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
    void load();
  }, [loading, user]);

  useEffect(() => {
    if (loading || !user) return;
    const loadSettings = async () => {
      setScheduleLoading(true);
      setScheduleNotice(null);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/admin/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        const hour = Number(body?.dailyMotivationSchedule?.hourNy ?? 13);
        setScheduleHourNy(String(Number.isInteger(hour) ? hour : 13));
      } finally {
        setScheduleLoading(false);
      }
    };
    void loadSettings();
  }, [loading, user]);

  async function handleSaveSchedule() {
    setScheduleSaving(true);
    setScheduleNotice(null);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setScheduleNotice(L("Admin session missing.", "Falta la sesión de admin."));
        return;
      }
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hourNy: Number(scheduleHourNy), minuteNy: 0 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScheduleNotice(String(body?.error ?? L("Save failed.", "No se pudo guardar.")));
        return;
      }
      setScheduleNotice(
        L(
          `Daily motivation set to ${body?.dailyMotivationSchedule?.label ?? "1:00 PM EST"}.`,
          `La motivación diaria quedó en ${body?.dailyMotivationSchedule?.label ?? "1:00 PM EST"}.`
        )
      );
    } finally {
      setScheduleSaving(false);
    }
  }

  const adminTabs = useMemo(
    () => [
      {
        key: "overview" as const,
        label: L("Overview", "Overview"),
        description: L("Executive snapshot and top-level health.", "Resumen ejecutivo y salud general."),
      },
      {
        key: "growth" as const,
        label: L("Growth", "Crecimiento"),
        description: L("Users, subscriptions, signups, and conversion.", "Usuarios, suscripciones, registros y conversión."),
      },
      {
        key: "usage" as const,
        label: L("Usage", "Uso"),
        description: L("Sessions, events, and top pages.", "Sesiones, eventos y páginas más usadas."),
      },
      {
        key: "emails" as const,
        label: L("Emails", "Emails"),
        description: L("Automations, previews, and Resend delivery.", "Automatizaciones, previews y Resend."),
      },
      {
        key: "users" as const,
        label: L("Users", "Usuarios"),
        description: L("User management, inactivity, and outreach segments.", "Gestión de usuarios, inactividad y segmentos."),
      },
      {
        key: "inbox" as const,
        label: L("Inbox", "Inbox"),
        description: L("Support threads, staff replies, and AI service triage.", "Tickets de soporte, respuestas del staff y triage IA."),
      },
    ],
    [L]
  );

  const latestDailyEvents = metrics?.series?.dailyEvents?.at(-1)?.count ?? 0;
  const latestDailySessions = metrics?.series?.dailySessions?.at(-1)?.count ?? 0;
  const latestDailySignups = metrics?.series?.dailySignups?.at(-1)?.count ?? 0;
  const topPage = metrics?.usage?.topPages?.[0] ?? null;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-sm text-slate-400">{L("Loading…", "Cargando…")}</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-xl font-semibold">{L("Access restricted", "Acceso restringido")}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {L("This section is only for authorized staff.", "Esta sección es solo para el staff autorizado.")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-300">
                {L("Admin workspace", "Admin workspace")}
              </p>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold">{L("Platform Admin", "Admin de plataforma")}</h1>
                <p className="max-w-3xl text-sm text-slate-400">
                  {L(
                    "Organized control center for growth, product usage, operations, and internal admin tools.",
                    "Centro de control organizado para crecimiento, uso del producto, operaciones y herramientas internas."
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard
                label={L("Users", "Usuarios")}
                value={metrics?.totals.users ?? "—"}
                sub={L("Total profiles", "Perfiles totales")}
                tone="info"
              />
              <MetricCard
                label={L("Active subs", "Subs activas")}
                value={metrics?.totals.activeSubs ?? "—"}
                sub={`${L("Conversion", "Conversión")}: ${metrics?.conversionRate ?? 0}%`}
                tone="success"
              />
              <MetricCard
                label={L("Sessions 30d", "Sesiones 30d")}
                value={metrics?.usage.sessions30d ?? "—"}
                sub={`${L("Avg session", "Sesión promedio")}: ${metrics?.usage.avgSessionMinutes ?? 0} ${L("min", "min")}`}
              />
              <MetricCard
                label={L("Top page", "Página top")}
                value={topPage?.path ?? "—"}
                sub={topPage ? `${topPage.count} ${L("visits", "visitas")}` : L("No data yet", "Sin datos aún")}
                tone="warning"
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            {adminTabs.map((tab) => (
              <TabButton
                key={tab.key}
                active={activeTab === tab.key}
                label={tab.label}
                description={tab.description}
                onClick={() => setActiveTab(tab.key)}
              />
            ))}
          </div>
        </header>

        {loadingMetrics && (
          <SectionShell
            eyebrow={L("Loading", "Cargando")}
            title={L("Pulling admin metrics", "Cargando métricas admin")}
            description={L(
              "We are loading usage, growth, and operations data for the workspace.",
              "Estamos cargando los datos de uso, crecimiento y operaciones para el workspace."
            )}
          >
            <p className="text-sm text-slate-400">{L("Loading metrics…", "Cargando métricas…")}</p>
          </SectionShell>
        )}

        {metrics && activeTab === "overview" && (
          <div className="space-y-6">
            <SectionShell
              eyebrow={L("Executive view", "Vista ejecutiva")}
              title={L("Platform snapshot", "Resumen de plataforma")}
              description={L(
                "Use this view for the fastest read on growth, activity, and current platform health.",
                "Usa esta vista para leer rápido crecimiento, actividad y salud actual de la plataforma."
              )}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label={L("Users active 7d", "Usuarios activos 7d")}
                  value={metrics.actives.last7d}
                  sub={`${L("30d active", "Activos 30d")}: ${metrics.actives.last30d}`}
                  tone="success"
                />
                <MetricCard
                  label={L("New signups 7d", "Registros 7d")}
                  value={metrics.signups.last7d}
                  sub={`${L("Last 30d", "Últimos 30d")}: ${metrics.signups.last30d}`}
                  tone="info"
                />
                <MetricCard
                  label={L("Daily events", "Eventos diarios")}
                  value={latestDailyEvents}
                  sub={L("Latest day", "Último día")}
                />
                <MetricCard
                  label={L("Daily sessions", "Sesiones diarias")}
                  value={latestDailySessions}
                  sub={L("Latest day", "Último día")}
                />
              </div>
            </SectionShell>

            <SectionShell
              eyebrow={L("Trends", "Tendencias")}
              title={L("30-day trend lines", "Líneas de tendencia de 30 días")}
              description={L(
                "Quick operational view of how events, sessions, and signups are moving.",
                "Vista operativa rápida de cómo se mueven los eventos, sesiones y registros."
              )}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <TrendCard
                  label={L("Daily events", "Eventos diarios")}
                  value={latestDailyEvents}
                  rangeLabel={L("Last 30 days", "Últimos 30 días")}
                  stroke="#38bdf8"
                  data={metrics.series.dailyEvents}
                />
                <TrendCard
                  label={L("Daily sessions", "Sesiones diarias")}
                  value={latestDailySessions}
                  rangeLabel={L("Last 30 days", "Últimos 30 días")}
                  stroke="#34d399"
                  data={metrics.series.dailySessions}
                />
                <TrendCard
                  label={L("Daily signups", "Registros diarios")}
                  value={latestDailySignups}
                  rangeLabel={L("Last 30 days", "Últimos 30 días")}
                  stroke="#f59e0b"
                  data={metrics.series.dailySignups}
                />
              </div>
            </SectionShell>
          </div>
        )}

        {metrics && activeTab === "growth" && (
          <div className="space-y-6">
            <SectionShell
              eyebrow={L("Growth", "Crecimiento")}
              title={L("Users and revenue signals", "Usuarios y señales de revenue")}
              description={L(
                "Monitor audience growth, subscription health, and opt-in monetization signals.",
                "Monitorea crecimiento de audiencia, salud de suscripciones y señales de monetización."
              )}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label={L("Total users", "Usuarios totales")}
                  value={metrics.totals.users}
                  sub={`${L("Active 7d", "Activos 7d")}: ${metrics.actives.last7d}`}
                />
                <MetricCard
                  label={L("Active subscriptions", "Suscripciones activas")}
                  value={metrics.totals.activeSubs}
                  sub={`${L("Conversion rate", "Tasa de conversión")}: ${metrics.conversionRate}%`}
                  tone="success"
                />
                <MetricCard
                  label={L("Add-ons active", "Add-ons activos")}
                  value={metrics.totals.addonActive}
                  sub={L("Current active add-on footprint", "Huella actual de add-ons activos")}
                  tone="warning"
                />
                <MetricCard
                  label={L("Signups 30d", "Registros 30d")}
                  value={metrics.signups.last30d}
                  sub={`${L("Last 7d", "Últimos 7d")}: ${metrics.signups.last7d}`}
                  tone="info"
                />
              </div>
            </SectionShell>

            <SectionShell
              eyebrow={L("Growth pacing", "Ritmo de crecimiento")}
              title={L("Acquisition trend", "Tendencia de adquisición")}
              description={L(
                "Read new user momentum and compare it against subscription conversion.",
                "Lee el momentum de usuarios nuevos y compáralo con la conversión a suscripción."
              )}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <TrendCard
                  label={L("Daily signups", "Registros diarios")}
                  value={latestDailySignups}
                  rangeLabel={L("Last 30 days", "Últimos 30 días")}
                  stroke="#f59e0b"
                  data={metrics.series.dailySignups}
                />
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      {L("Growth notes", "Notas de crecimiento")}
                    </p>
                    <p className="mt-3 text-sm text-slate-300">
                      {L(
                        "Use these numbers to decide whether the next work should go into acquisition, onboarding, or conversion.",
                        "Usa estos números para decidir si el próximo trabajo debe ir a adquisición, onboarding o conversión."
                      )}
                    </p>
                  </div>
                  <div className="space-y-3 text-sm text-slate-400">
                    <div>
                      <span className="text-slate-200 font-medium">{L("Active base", "Base activa")}:</span>{" "}
                      {metrics.actives.last30d} / {metrics.totals.users}
                    </div>
                    <div>
                      <span className="text-slate-200 font-medium">{L("Subscription footprint", "Huella de suscripción")}:</span>{" "}
                      {metrics.totals.activeSubs}
                    </div>
                    <div>
                      <span className="text-slate-200 font-medium">{L("Current conversion", "Conversión actual")}:</span>{" "}
                      {metrics.conversionRate}%
                    </div>
                  </div>
                </div>
              </div>
            </SectionShell>
          </div>
        )}

        {metrics && activeTab === "usage" && (
          <div className="space-y-6">
            <SectionShell
              eyebrow={L("Usage", "Uso")}
              title={L("Engagement and product traffic", "Engagement y tráfico del producto")}
              description={L(
                "Track session volume, daily activity, and which product areas get the most attention.",
                "Sigue volumen de sesiones, actividad diaria y qué áreas del producto reciben más atención."
              )}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <MetricCard
                  label={L("Sessions 30d", "Sesiones 30d")}
                  value={metrics.usage.sessions30d}
                  sub={`${L("Avg session", "Sesión promedio")}: ${metrics.usage.avgSessionMinutes} ${L("min", "min")}`}
                />
                <MetricCard
                  label={L("Daily sessions", "Sesiones diarias")}
                  value={latestDailySessions}
                  sub={L("Latest day", "Último día")}
                  tone="success"
                />
                <MetricCard
                  label={L("Daily events", "Eventos diarios")}
                  value={latestDailyEvents}
                  sub={L("Latest day", "Último día")}
                  tone="info"
                />
              </div>
            </SectionShell>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <SectionShell
                eyebrow={L("Trends", "Tendencias")}
                title={L("Engagement curves", "Curvas de engagement")}
                description={L(
                  "These trend cards help you quickly see whether usage is heating up or flattening.",
                  "Estas curvas te ayudan a ver rápido si el uso está acelerando o perdiendo fuerza."
                )}
              >
                <div className="grid grid-cols-1 gap-4">
                  <TrendCard
                    label={L("Daily sessions", "Sesiones diarias")}
                    value={latestDailySessions}
                    rangeLabel={L("Last 30 days", "Últimos 30 días")}
                    stroke="#34d399"
                    data={metrics.series.dailySessions}
                  />
                  <TrendCard
                    label={L("Daily events", "Eventos diarios")}
                    value={latestDailyEvents}
                    rangeLabel={L("Last 30 days", "Últimos 30 días")}
                    stroke="#38bdf8"
                    data={metrics.series.dailyEvents}
                  />
                </div>
              </SectionShell>

              <SectionShell
                eyebrow={L("Traffic", "Tráfico")}
                title={L("Top pages", "Páginas más usadas")}
                description={L(
                  "Use this table to see which product surfaces are actually pulling attention.",
                  "Usa esta tabla para ver qué superficies del producto realmente atraen atención."
                )}
                right={<p className="text-xs text-slate-400">{L("Last 30 days", "Últimos 30 días")}</p>}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-slate-400">
                        <th className="py-3 pr-4">{L("Page", "Página")}</th>
                        <th className="py-3 text-right">{L("Visits", "Visitas")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.usage.topPages.map((row) => (
                        <tr key={row.path} className="border-b border-slate-900/80">
                          <td className="py-3 pr-4 text-slate-100">{row.path}</td>
                          <td className="py-3 text-right font-medium text-emerald-200">{row.count}</td>
                        </tr>
                      ))}
                      {!metrics.usage.topPages.length && (
                        <tr>
                          <td className="py-4 text-slate-500" colSpan={2}>
                            {L("Not enough data yet.", "Sin datos suficientes aún.")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </SectionShell>
            </div>
          </div>
        )}

        {activeTab === "emails" && (
          <div className="space-y-6">
            <SectionShell
              eyebrow={L("Messaging", "Mensajería")}
              title={L("Daily motivation schedule", "Horario de motivación diaria")}
              description={L(
                "Control the send hour for the daily motivational message in New York time. The broader message library and broadcast tools live in this same workspace.",
                "Controla la hora de envío del mensaje motivacional diario en hora de New York. La librería de mensajes y los broadcasts viven dentro de este mismo workspace."
              )}
              right={
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={scheduleLoading || scheduleSaving}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 disabled:opacity-50"
                >
                  {scheduleSaving ? L("Saving…", "Guardando…") : L("Save schedule", "Guardar horario")}
                </button>
              }
            >
              <div className="grid gap-4 lg:grid-cols-[0.44fr_0.56fr]">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs text-slate-400">{L("Hour (ET)", "Hora (ET)")}</span>
                    <select
                      value={scheduleHourNy}
                      onChange={(e) => setScheduleHourNy(e.target.value)}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                      disabled={scheduleLoading || scheduleSaving}
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={String(hour)}>
                          {String(hour).padStart(2, "0")}:00 ET
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-3 text-xs text-slate-500">
                    {L(
                      "Current cron resolution is hourly, so minutes stay fixed at :00.",
                      "La resolución actual del cron es por hora, así que los minutos quedan fijos en :00."
                    )}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    {L("Messaging note", "Nota de mensajería")}
                  </p>
                  <div className="mt-3 space-y-3 text-sm text-slate-400">
                    <p>
                      {L(
                        "This schedule controls when the app sends the daily motivation to the full user base.",
                        "Este horario controla cuándo la app envía la motivación diaria a toda la base de usuarios."
                      )}
                    </p>
                    <p>
                      {L(
                        "Keep manual broadcasts, previews, and motivation content together here so the communication tools stay in one place.",
                        "Mantén aquí juntos los broadcasts manuales, previews y contenido motivacional para que la comunicación viva en un solo lugar."
                      )}
                    </p>
                    {scheduleNotice ? <p className="text-emerald-300">{scheduleNotice}</p> : null}
                  </div>
                </div>
              </div>
            </SectionShell>
            <AdminEmailAutomations lang={lang} />
          </div>
        )}

        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  {L("Users workspace", "Workspace de usuarios")}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {L(
                    "Switch between the user directory and manual access grants so this area stays focused and compact.",
                    "Cambia entre el directorio de usuarios y los accesos manuales para que esta área se mantenga enfocada y compacta."
                  )}
                </p>
              </div>
              <div className="inline-flex rounded-full border border-slate-800 bg-slate-950/70 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setUsersSubview("directory")}
                  className={`rounded-full px-4 py-2 transition ${
                    usersSubview === "directory"
                      ? "bg-emerald-400 text-slate-950 font-semibold"
                      : "text-slate-300 hover:text-slate-50"
                  }`}
                >
                  {L("User directory", "Directorio")}
                </button>
                <button
                  type="button"
                  onClick={() => setUsersSubview("access")}
                  className={`rounded-full px-4 py-2 transition ${
                    usersSubview === "access"
                      ? "bg-emerald-400 text-slate-950 font-semibold"
                      : "text-slate-300 hover:text-slate-50"
                  }`}
                >
                  {L("Manual access", "Acceso manual")}
                </button>
              </div>
            </div>

            {usersSubview === "directory" ? (
              <AdminUsersManager lang={lang} />
            ) : (
              <AccessGrantManager lang={lang} />
            )}
          </div>
        )}

        {activeTab === "inbox" && (
          <div className="space-y-6">
            <AdminSupportInbox lang={lang} />
          </div>
        )}
      </div>
    </main>
  );
}
