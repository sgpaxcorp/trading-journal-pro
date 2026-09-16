"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { supabaseBrowser } from "@/lib/supaBaseClient";

type Controls = {
  aiTradeProposalsEnabled: boolean;
  brokerConnectivityEnabled: boolean;
  newOrdersEnabled: boolean;
  readOnly: boolean;
  investorTransactionsEnabled: boolean;
  manualReconciliationRequired: boolean;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  failSafe: boolean;
};

type Draft = Pick<
  Controls,
  | "aiTradeProposalsEnabled"
  | "brokerConnectivityEnabled"
  | "newOrdersEnabled"
  | "readOnly"
  | "investorTransactionsEnabled"
  | "manualReconciliationRequired"
>;

type AuditEvent = {
  id: string;
  event_sequence: number;
  action: "LOCKDOWN_ACTIVATED" | "CONTROLS_RESTRICTED" | "CONTROLS_RELAXED";
  actor_email: string | null;
  reason: string;
  changed_controls: Record<string, { previous: boolean; next: boolean }>;
  human_approval: boolean;
  previous_event_hash: string;
  event_hash: string;
  created_at: string;
};

type EmergencyState = {
  controls: Controls;
  auditEvents: AuditEvent[];
  immutableAudit: boolean;
  checkedAt: string;
};

const CONTROL_ROWS: Array<{
  key: keyof Draft;
  en: string;
  es: string;
  onEn: string;
  onEs: string;
  offEn: string;
  offEs: string;
}> = [
  {
    key: "aiTradeProposalsEnabled",
    en: "AI-generated trade proposals",
    es: "Propuestas de inversión generadas por AI",
    onEn: "Permitted",
    onEs: "Permitidas",
    offEn: "Blocked",
    offEs: "Bloqueadas",
  },
  {
    key: "brokerConnectivityEnabled",
    en: "Broker connectivity",
    es: "Conectividad de broker",
    onEn: "Connected",
    onEs: "Conectada",
    offEn: "Disabled",
    offEs: "Deshabilitada",
  },
  {
    key: "newOrdersEnabled",
    en: "New orders",
    es: "Órdenes nuevas",
    onEn: "Permitted",
    onEs: "Permitidas",
    offEn: "Blocked",
    offEs: "Bloqueadas",
  },
  {
    key: "readOnly",
    en: "READ ONLY mode",
    es: "Modo READ ONLY",
    onEn: "Engaged",
    onEs: "Activado",
    offEn: "Writable",
    offEs: "Escritura activa",
  },
  {
    key: "investorTransactionsEnabled",
    en: "Investor transaction processing",
    es: "Procesamiento de transacciones de inversionistas",
    onEn: "Processing",
    onEs: "Procesando",
    offEn: "Frozen",
    offEs: "Congelado",
  },
  {
    key: "manualReconciliationRequired",
    en: "Manual reconciliation",
    es: "Reconciliación manual",
    onEn: "Required",
    onEs: "Requerida",
    offEn: "Not required",
    offEs: "No requerida",
  },
];

const RE_ENABLE_CONFIRMATION = "RE-ENABLE FINANCIAL ACTIONS";

function toDraft(controls: Controls): Draft {
  return {
    aiTradeProposalsEnabled: controls.aiTradeProposalsEnabled,
    brokerConnectivityEnabled: controls.brokerConnectivityEnabled,
    newOrdersEnabled: controls.newOrdersEnabled,
    readOnly: controls.readOnly,
    investorTransactionsEnabled: controls.investorTransactionsEnabled,
    manualReconciliationRequired: controls.manualReconciliationRequired,
  };
}

function lockdownDraft(): Draft {
  return {
    aiTradeProposalsEnabled: false,
    brokerConnectivityEnabled: false,
    newOrdersEnabled: false,
    readOnly: true,
    investorTransactionsEnabled: false,
    manualReconciliationRequired: true,
  };
}

function isRelaxation(current: Controls, next: Draft) {
  return (
    (!current.aiTradeProposalsEnabled && next.aiTradeProposalsEnabled) ||
    (!current.brokerConnectivityEnabled && next.brokerConnectivityEnabled) ||
    (!current.newOrdersEnabled && next.newOrdersEnabled) ||
    (current.readOnly && !next.readOnly) ||
    (!current.investorTransactionsEnabled && next.investorTransactionsEnabled) ||
    (current.manualReconciliationRequired && !next.manualReconciliationRequired)
  );
}

function isLockdown(controls: Draft) {
  return (
    !controls.aiTradeProposalsEnabled &&
    !controls.brokerConnectivityEnabled &&
    !controls.newOrdersEnabled &&
    controls.readOnly &&
    !controls.investorTransactionsEnabled &&
    controls.manualReconciliationRequired
  );
}

export default function EmergencyPortfolioControlPanel({ lang }: { lang: "en" | "es" }) {
  const isEs = lang === "es";
  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);
  const [state, setState] = useState<EmergencyState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [secret, setSecret] = useState("");
  const [confirmation, setConfirmation] = useState("");
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
      const response = await fetch("/api/admin/emergency-portfolio", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(body?.error || L("Could not load emergency controls.", "No se pudieron cargar los controles de emergencia.")));
      }
      const nextState = body as EmergencyState;
      setState(nextState);
      setDraft(toDraft(nextState.controls));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L("Could not load emergency controls.", "No se pudieron cargar los controles de emergencia."));
    } finally {
      setLoading(false);
    }
  }, [L]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useMemo(
    () => Boolean(state && draft && JSON.stringify(toDraft(state.controls)) !== JSON.stringify(draft)),
    [draft, state]
  );
  const relaxing = Boolean(state && draft && isRelaxation(state.controls, draft));
  const lockedDown = Boolean(state && isLockdown(toDraft(state.controls)));

  function toggle(key: keyof Draft) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: !current[key] };
      if (key === "manualReconciliationRequired" && next.manualReconciliationRequired) {
        next.newOrdersEnabled = false;
        next.investorTransactionsEnabled = false;
      }
      return next;
    });
  }

  async function apply(nextDraft: Draft | null = draft) {
    if (!state || !nextDraft) return;
    const willRelax = isRelaxation(state.controls, nextDraft);
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error(L("Admin session missing.", "Falta la sesión de admin."));
      const response = await fetch("/api/admin/emergency-portfolio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-admin-action-secret": secret,
        },
        body: JSON.stringify({
          controls: nextDraft,
          expectedVersion: state.controls.version,
          reason,
          humanApproval: willRelax,
          approvalConfirmation: willRelax ? confirmation : "",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(body?.error || L("Emergency controls were not applied.", "No se aplicaron los controles de emergencia.")));
      }
      setSecret("");
      setConfirmation("");
      setReason("");
      await load();
      setNotice(
        willRelax
          ? L("Financial actions re-enabled by authorized human approval.", "Acciones financieras reactivadas mediante aprobación humana autorizada.")
          : L("Emergency restrictions applied immediately.", "Restricciones de emergencia aplicadas inmediatamente.")
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : L("Emergency controls were not applied.", "No se aplicaron los controles de emergencia."));
    } finally {
      setSaving(false);
    }
  }

  const canApply = Boolean(
    changed &&
      reason.trim().length >= 10 &&
      secret &&
      (!relaxing || confirmation === RE_ENABLE_CONFIRMATION) &&
      !saving
  );
  const canLockdown = Boolean(
    state &&
      !lockedDown &&
      reason.trim().length >= 10 &&
      secret &&
      !saving
  );

  if (loading && !state) {
    return <p className="text-sm text-slate-400">{L("Loading emergency controls...", "Cargando controles de emergencia...")}</p>;
  }

  return (
    <section className="border-b border-slate-800 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-300">
            {L("Human-controlled financial safety", "Seguridad financiera bajo control humano")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-100">
              {L("Emergency Portfolio Control", "Control de Emergencia del Portfolio")}
            </h2>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase ${lockedDown ? "border-rose-400/50 bg-rose-400/10 text-rose-200" : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"}`}>
              {lockedDown ? L("Lockdown active", "Lockdown activo") : L("Operating", "Operando")}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {L(
              "Only an authenticated administrator with step-up verification can change these controls. AI services have no path to this action.",
              "Solo un administrador autenticado con verificación adicional puede cambiar estos controles. Los servicios de AI no tienen acceso a esta acción."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-200" title={L("Refresh state", "Actualizar estado")}>
            <RefreshCw className="h-4 w-4" /> {L("Refresh", "Actualizar")}
          </button>
          <button type="button" onClick={() => void apply(lockdownDraft())} disabled={!canLockdown} className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-500 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <LockKeyhole className="h-4 w-4" /> {L("Activate lockdown", "Activar lockdown")}
          </button>
        </div>
      </div>

      {state?.controls.failSafe ? (
        <div className="mt-5 flex gap-3 border-y border-rose-500/40 bg-rose-500/10 px-3 py-4 text-sm text-rose-100">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{L("Control state could not be verified. Financial actions are failing closed.", "No se pudo verificar el estado. Las acciones financieras están cerradas por seguridad.")}</p>
        </div>
      ) : null}

      <div className="mt-6 divide-y divide-slate-800 border-y border-slate-800">
        {CONTROL_ROWS.map((row) => {
          const value = draft?.[row.key] ?? false;
          const safetyEngaged = row.key === "readOnly" || row.key === "manualReconciliationRequired" ? value : !value;
          return (
            <div key={row.key} className="flex items-center justify-between gap-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {safetyEngaged ? <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />}
                <div>
                  <p className="text-sm font-medium text-slate-100">{isEs ? row.es : row.en}</p>
                  <p className={`mt-1 text-xs ${safetyEngaged ? "text-amber-200" : "text-slate-500"}`}>
                    {value ? (isEs ? row.onEs : row.onEn) : (isEs ? row.offEs : row.offEn)}
                  </p>
                </div>
              </div>
              <button type="button" role="switch" aria-checked={value} onClick={() => toggle(row.key)} className={`relative h-6 w-11 shrink-0 rounded-full border transition ${value ? "border-emerald-300/50 bg-emerald-400" : "border-slate-600 bg-slate-800"}`} title={isEs ? row.es : row.en}>
                <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition ${value ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
        <label>
          <span className="mb-2 block text-xs font-medium text-slate-300">{L("Incident or approval reason", "Razón del incidente o aprobación")}</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} placeholder={L("Document why this change is necessary", "Documenta por qué este cambio es necesario")} className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400" />
        </label>
        <label>
          <span className="mb-2 block text-xs font-medium text-slate-300">{L("Admin step-up secret", "Clave de verificación admin")}</span>
          <div className="relative">
            <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-emerald-400" />
          </div>
        </label>
        <button type="button" onClick={() => void apply()} disabled={!canApply} className={`h-11 rounded-lg px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${relaxing ? "bg-amber-300 text-slate-950" : "bg-emerald-400 text-slate-950"}`}>
          {saving ? L("Applying...", "Aplicando...") : relaxing ? L("Approve re-enable", "Aprobar reactivación") : L("Apply restrictions", "Aplicar restricciones")}
        </button>
      </div>

      {relaxing ? (
        <label className="mt-4 block border-l-2 border-amber-300 bg-amber-300/5 py-3 pl-4">
          <span className="block text-xs font-semibold text-amber-200">
            {L("Type the exact human-approval phrase", "Escribe la frase exacta de aprobación humana")}
          </span>
          <code className="mt-1 block text-xs text-slate-400">{RE_ENABLE_CONFIRMATION}</code>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-3 h-10 w-full max-w-xl rounded-lg border border-amber-300/40 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-300" />
        </label>
      ) : null}

      {notice ? <p className="mt-4 text-sm text-amber-200">{notice}</p> : null}

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{L("Immutable control ledger", "Ledger inmutable de controles")}</h3>
            <p className="mt-1 text-xs text-slate-500">{L("Hash-linked records cannot be edited or deleted.", "Los registros enlazados por hash no se pueden editar ni borrar.")}</p>
          </div>
          <span className="text-xs text-slate-500">v{state?.controls.version ?? "-"}</span>
        </div>
        <div className="mt-3 divide-y divide-slate-800 border-y border-slate-800">
          {state?.auditEvents.map((event) => (
            <div key={event.id} className="grid gap-2 py-4 text-xs lg:grid-cols-[90px_180px_1fr_170px] lg:items-center">
              <span className="font-mono text-slate-500">#{event.event_sequence}</span>
              <span className={event.action === "CONTROLS_RELAXED" ? "font-semibold text-amber-200" : "font-semibold text-rose-200"}>{event.action.replace(/_/g, " ")}</span>
              <div className="min-w-0">
                <p className="truncate text-slate-200">{event.reason}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-600">{event.event_hash}</p>
              </div>
              <div className="lg:text-right">
                <p className="text-slate-400">{event.actor_email ?? L("Authorized admin", "Admin autorizado")}</p>
                <time className="mt-1 block text-slate-600">{new Date(event.created_at).toLocaleString()}</time>
              </div>
            </div>
          ))}
          {!state?.auditEvents.length ? <p className="py-4 text-sm text-slate-500">{L("No emergency transitions recorded.", "No hay transiciones de emergencia registradas.")}</p> : null}
        </div>
      </div>
    </section>
  );
}
