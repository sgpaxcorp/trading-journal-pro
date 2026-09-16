"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Power, RefreshCw, ShieldCheck } from "lucide-react";

import { supabaseBrowser } from "@/lib/supaBaseClient";

type ControlKey = "signup" | "checkout" | "ai" | "pdf_uploads" | "email_delivery" | "broker_connections";
type Controls = Record<ControlKey, boolean>;

type OperationsState = {
  controls: Controls;
  queues: {
    neuro: { queued: number; running: number; failed: number; stale: number };
    email: { queued: number; running: number; failed: number; stale: number };
    stripe: { failed: number };
  };
  recentEvents: Array<{
    id: string;
    severity: string;
    source: string;
    event_type: string;
    message: string;
    route_path?: string | null;
    created_at: string;
  }>;
  checkedAt: string;
};

const LABELS: Record<ControlKey, { en: string; es: string; detailEn: string; detailEs: string }> = {
  signup: { en: "New registrations", es: "Nuevos registros", detailEn: "Allow new account creation.", detailEs: "Permitir crear cuentas nuevas." },
  checkout: { en: "Checkout", es: "Pagos", detailEn: "Allow new Stripe checkout sessions.", detailEs: "Permitir nuevas sesiones de pago." },
  ai: { en: "AI services", es: "Servicios IA", detailEn: "Allow AI analysis and coaching requests.", detailEs: "Permitir análisis y coaching con IA." },
  pdf_uploads: { en: "PDF processing", es: "Procesamiento PDF", detailEn: "Allow document ingestion and workers.", detailEs: "Permitir documentos y sus procesos." },
  email_delivery: { en: "Email delivery", es: "Envío de emails", detailEn: "Allow queued automated email delivery.", detailEs: "Permitir emails automáticos en cola." },
  broker_connections: { en: "Broker connections", es: "Conexiones de broker", detailEn: "Allow account linking and broker synchronization.", detailEs: "Permitir vinculación y sincronización con brokers." },
};

export default function OperationalControlPanel({ lang }: { lang: "en" | "es" }) {
  const isEs = lang === "es";
  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);
  const [state, setState] = useState<OperationsState | null>(null);
  const [draft, setDraft] = useState<Controls | null>(null);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error(L("Admin session missing.", "Falta la sesión de admin."));
      const response = await fetch("/api/admin/operations", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || L("Could not load operations.", "No se pudo cargar operaciones.")));
      setState(body as OperationsState);
      setDraft((body as OperationsState).controls);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L("Could not load operations.", "No se pudo cargar operaciones."));
    } finally {
      setLoading(false);
    }
  }, [L]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useMemo(
    () => Boolean(state && draft && JSON.stringify(state.controls) !== JSON.stringify(draft)),
    [draft, state]
  );

  async function save() {
    if (!draft) return;
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error(L("Admin session missing.", "Falta la sesión de admin."));
      const response = await fetch("/api/admin/operations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-admin-action-secret": secret,
        },
        body: JSON.stringify({ controls: draft }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || L("Controls were not saved.", "No se guardaron los controles.")));
      setSecret("");
      setNotice(L("Operational controls updated.", "Controles operativos actualizados."));
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L("Controls were not saved.", "No se guardaron los controles."));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !state) return <p className="text-sm text-slate-400">{L("Loading operations...", "Cargando operaciones...")}</p>;

  const issueTotal = state
    ? state.queues.neuro.failed + state.queues.neuro.stale + state.queues.email.failed + state.queues.email.stale + state.queues.stripe.failed
    : 0;

  return (
    <div className="space-y-8">
      <section className="border-b border-slate-800 pb-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300">{L("Service controls", "Controles de servicios")}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-100">{L("Platform operations", "Operaciones de plataforma")}</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{L("Pause only the affected service while the rest of the platform stays available.", "Pausa únicamente el servicio afectado mientras el resto de la plataforma sigue disponible.")}</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-200" title={L("Refresh operations", "Actualizar operaciones")}>
            <RefreshCw className="h-4 w-4" /> {L("Refresh", "Actualizar")}
          </button>
        </div>

        <div className="mt-6 divide-y divide-slate-800 border-y border-slate-800">
          {(Object.keys(LABELS) as ControlKey[]).map((key) => {
            const copy = LABELS[key];
            const enabled = draft?.[key] ?? true;
            return (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-5 py-4">
                <span>
                  <span className="block text-sm font-medium text-slate-100">{isEs ? copy.es : copy.en}</span>
                  <span className="mt-1 block text-xs text-slate-400">{isEs ? copy.detailEs : copy.detailEn}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
                  {enabled ? L("Active", "Activo") : L("Paused", "Pausado")}
                  <input type="checkbox" checked={enabled} onChange={() => setDraft((current) => current ? { ...current, [key]: !current[key] } : current)} className="h-5 w-5 accent-emerald-400" />
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1">
            <span className="mb-2 block text-xs text-slate-400">{L("Admin step-up secret", "Clave de verificación admin")}</span>
            <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
          </label>
          <button type="button" onClick={() => void save()} disabled={!changed || !secret || saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
            <Power className="h-4 w-4" /> {saving ? L("Saving...", "Guardando...") : L("Apply controls", "Aplicar controles")}
          </button>
        </div>
        {notice ? <p className="mt-3 text-sm text-amber-200">{notice}</p> : null}
      </section>

      {state ? (
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            {issueTotal === 0 ? <ShieldCheck className="h-5 w-5 text-emerald-300" /> : <AlertTriangle className="h-5 w-5 text-amber-300" />}
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{L("Queue health", "Salud de colas")}</h2>
              <p className="text-xs text-slate-400">{issueTotal === 0 ? L("No failed or stale work detected.", "No se detectó trabajo fallido o estancado.") : L(`${issueTotal} issue(s) require attention.`, `${issueTotal} incidencia(s) requieren atención.`)}</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <QueueLine title="Neuro Analysis" values={state.queues.neuro} />
            <QueueLine title={L("Email delivery", "Envío de emails")} values={state.queues.email} />
            <QueueLine title="Stripe webhooks" values={{ queued: 0, running: 0, failed: state.queues.stripe.failed, stale: 0 }} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-100">{L("Recent operational events", "Eventos operativos recientes")}</h3>
            <div className="mt-3 divide-y divide-slate-800 border-y border-slate-800">
              {state.recentEvents.map((event) => (
                <div key={event.id} className="grid gap-1 py-3 text-xs md:grid-cols-[110px_180px_1fr_auto] md:items-center md:gap-3">
                  <span className={event.severity === "critical" || event.severity === "error" ? "font-semibold text-rose-300" : event.severity === "warning" ? "font-semibold text-amber-300" : "text-emerald-300"}>{event.severity.toUpperCase()}</span>
                  <span className="text-slate-400">{event.source}</span>
                  <span className="text-slate-200">{event.message}</span>
                  <time className="text-slate-500">{new Date(event.created_at).toLocaleString()}</time>
                </div>
              ))}
              {!state.recentEvents.length ? <p className="py-4 text-sm text-slate-500">{L("No operational events recorded yet.", "Aún no hay eventos operativos.")}</p> : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QueueLine({ title, values }: { title: string; values: { queued: number; running: number; failed: number; stale: number } }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-slate-500">Queued</dt><dd className="mt-1 text-slate-200">{values.queued}</dd></div>
        <div><dt className="text-slate-500">Running</dt><dd className="mt-1 text-slate-200">{values.running}</dd></div>
        <div><dt className="text-slate-500">Failed</dt><dd className="mt-1 text-slate-200">{values.failed}</dd></div>
        <div><dt className="text-slate-500">Stale</dt><dd className="mt-1 text-slate-200">{values.stale}</dd></div>
      </dl>
    </div>
  );
}
