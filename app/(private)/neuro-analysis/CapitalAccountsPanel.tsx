"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  TriangleAlert,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import type {
  CapitalAccountEventType,
  CapitalAccountReport,
  CapitalPoolReport,
} from "@/lib/neuroCapitalAccounts";
import { DATA_NOT_AVAILABLE } from "@/lib/neuroFinancialDataIntegrity";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type PoolRow = {
  id: string;
  name: string;
  base_currency: string;
  status: "active" | "closed";
};

type AccountRow = {
  id: string;
  pool_id: string;
  investor_name: string;
  investor_reference: string | null;
  opened_on: string;
  status: "active" | "closed";
};

type EventRow = {
  id: string;
  sequence_no: number;
  account_id: string;
  event_date: string;
  event_type: CapitalAccountEventType;
  amount: number | string;
  nav_per_unit: number | string | null;
  units_delta: number | string;
  external_cash_flow: boolean;
  expense_treatment: "included_in_nav" | "investor_paid" | null;
  notes: string | null;
};

type NavRow = {
  id: string;
  nav_date: string;
  total_net_assets: number | string;
  total_units: number | string;
  nav_per_unit: number | string | null;
  event_sequence_cutoff: number;
};

type CapitalAccountsResponse = {
  pools: PoolRow[];
  selectedPoolId: string | null;
  accounts: AccountRow[];
  events: EventRow[];
  navHistory: NavRow[];
  report: CapitalPoolReport | null;
};

type Props = {
  isEs: boolean;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number | null | undefined, currency: string, isEs: boolean) {
  if (value == null || !Number.isFinite(Number(value))) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(isEs ? "es-ES" : "en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function number(value: number | null | undefined, isEs: boolean, digits = 4) {
  if (value == null || !Number.isFinite(Number(value))) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(isEs ? "es-ES" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function pct(value: number | null | undefined, isEs: boolean) {
  if (value == null || !Number.isFinite(Number(value))) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(isEs ? "es-ES" : "en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(Number(value) / 100);
}

function eventLabel(type: CapitalAccountEventType, isEs: boolean) {
  const labels: Record<CapitalAccountEventType, [string, string]> = {
    initial_contribution: ["Initial contribution", "Aporte inicial"],
    contribution: ["Additional contribution", "Aporte adicional"],
    withdrawal: ["Withdrawal", "Retiro"],
    distribution: ["Distribution", "Distribución"],
    allocated_expense: ["Allocated expense", "Gasto asignado"],
  };
  return labels[type][isEs ? 1 : 0];
}

function eventTone(type: CapitalAccountEventType) {
  if (type === "initial_contribution" || type === "contribution") return "text-emerald-300";
  if (type === "withdrawal" || type === "distribution") return "text-amber-300";
  return "text-sky-300";
}

function Metric({ label, value, hint, tone = "emerald" }: { label: string; value: string; hint: string; tone?: "emerald" | "sky" | "amber" | "violet" }) {
  const border = {
    emerald: "border-emerald-400/50",
    sky: "border-sky-400/50",
    amber: "border-amber-400/50",
    violet: "border-violet-400/50",
  }[tone];
  return (
    <div className={`min-w-0 border-l-2 ${border} px-3 py-1`}>
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold text-slate-50">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>
    </div>
  );
}

export default function CapitalAccountsPanel({ isEs }: Props) {
  const [data, setData] = useState<CapitalAccountsResponse | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [showPoolForm, setShowPoolForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showNavForm, setShowNavForm] = useState(false);
  const [poolName, setPoolName] = useState("");
  const [poolCurrency, setPoolCurrency] = useState("USD");
  const [investorName, setInvestorName] = useState("");
  const [investorReference, setInvestorReference] = useState("");
  const [openedOn, setOpenedOn] = useState(today());
  const [initialContribution, setInitialContribution] = useState("");
  const [initialNavPerUnit, setInitialNavPerUnit] = useState("100");
  const [eventType, setEventType] = useState<CapitalAccountEventType>("contribution");
  const [eventDate, setEventDate] = useState(today());
  const [eventAmount, setEventAmount] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [expenseTreatment, setExpenseTreatment] = useState<"included_in_nav" | "investor_paid">("included_in_nav");
  const [navDate, setNavDate] = useState(today());
  const [netAssets, setNetAssets] = useState("");
  const [navNotes, setNavNotes] = useState("");

  const selectedPool = data?.pools.find((pool) => pool.id === data.selectedPoolId) ?? null;
  const currency = selectedPool?.base_currency || "USD";
  const selectedAccount = data?.accounts.find((account) => account.id === selectedAccountId) ?? data?.accounts[0] ?? null;
  const accountReport = data?.report?.accounts.find((account) => account.accountId === selectedAccount?.id) ?? null;
  const selectedEvents = useMemo(
    () => (data?.events ?? []).filter((event) => event.account_id === selectedAccount?.id).sort((a, b) => Number(b.sequence_no) - Number(a.sequence_no)),
    [data?.events, selectedAccount?.id]
  );
  const requiresInitialContribution = Boolean(selectedAccount && selectedEvents.length === 0);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error(isEs ? "Inicia sesión para continuar." : "Sign in to continue.");
    return fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  }

  async function load(poolId?: string | null) {
    try {
      setLoading(true);
      setError("");
      const query = poolId ? `?poolId=${encodeURIComponent(poolId)}` : "";
      const response = await authedFetch(`/api/neuro-analysis/capital-accounts${query}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Could not load Capital Accounts.");
      const next = json as CapitalAccountsResponse;
      setData(next);
      setSelectedAccountId((current) =>
        current && next.accounts.some((account) => account.id === current) ? current : next.accounts[0]?.id ?? null
      );
    } catch (caught: any) {
      setError(caught?.message || "Could not load Capital Accounts.");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(payload: Record<string, unknown>, successMessage: [string, string]) {
    try {
      setSaving(true);
      setError("");
      setStatus("");
      const response = await authedFetch("/api/neuro-analysis/capital-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          idempotencyKey: payload.idempotencyKey ?? window.crypto.randomUUID(),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Could not update Capital Accounts.");
      const next = json as CapitalAccountsResponse;
      setData(next);
      setSelectedAccountId((current) =>
        current && next.accounts.some((account) => account.id === current) ? current : next.accounts.at(-1)?.id ?? null
      );
      setStatus(successMessage[isEs ? 1 : 0]);
      return true;
    } catch (caught: any) {
      setError(caught?.message || "Could not update Capital Accounts.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (requiresInitialContribution) setEventType("initial_contribution");
    else if (eventType === "initial_contribution") setEventType("contribution");
  }, [eventType, requiresInitialContribution]);

  async function createPool() {
    if (!poolName.trim()) return;
    const ok = await runAction(
      { action: "create_pool", name: poolName, baseCurrency: poolCurrency },
      ["Capital pool created.", "Pool de capital creado."]
    );
    if (ok) {
      setPoolName("");
      setShowPoolForm(false);
    }
  }

  async function createAccount() {
    if (!data?.selectedPoolId || !investorName.trim()) return;
    const ok = await runAction(
      {
        action: "create_account",
        poolId: data.selectedPoolId,
        investorName,
        investorReference,
        openedOn,
        initialContribution: initialContribution || null,
        initialNavPerUnit: data.report?.latestNavPerUnit == null ? initialNavPerUnit || null : null,
      },
      ["Investor capital account created.", "Cuenta de capital creada."]
    );
    if (ok) {
      setInvestorName("");
      setInvestorReference("");
      setInitialContribution("");
      setShowAccountForm(false);
    }
  }

  async function recordEvent() {
    if (!data?.selectedPoolId || !selectedAccount || !eventAmount) return;
    const ok = await runAction(
      {
        action: "record_event",
        poolId: data.selectedPoolId,
        accountId: selectedAccount.id,
        eventType,
        eventDate,
        amount: eventAmount,
        expenseTreatment,
        initialNavPerUnit: eventType === "initial_contribution" ? initialNavPerUnit : null,
        notes: eventNotes,
      },
      ["Capital event posted to the immutable ledger.", "Movimiento registrado en el ledger inmutable."]
    );
    if (ok) {
      setEventAmount("");
      setEventNotes("");
      setShowEventForm(false);
    }
  }

  async function recordNav() {
    if (!data?.selectedPoolId || netAssets === "") return;
    const ok = await runAction(
      {
        action: "record_nav",
        poolId: data.selectedPoolId,
        navDate,
        totalNetAssets: netAssets,
        notes: navNotes,
      },
      ["NAV frozen and reconciled to all issued units.", "NAV congelado y reconciliado con todas las unidades."]
    );
    if (ok) {
      setNetAssets("");
      setNavNotes("");
      setShowNavForm(false);
    }
  }

  return (
    <section className="border-y border-emerald-400/25 bg-slate-950/30 px-1 py-6 sm:px-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <WalletCards className="h-4 w-4 text-emerald-300" />
            <p className="text-[11px] font-bold uppercase text-emerald-300">
              {isEs ? "Cuentas de Capital Individuales" : "Individual Capital Accounts"}
            </p>
            <span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] font-bold uppercase text-slate-400">
              {isEs ? "Cálculo determinista" : "Deterministic calculation"}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-slate-50">
            {isEs ? "Propiedad por unidades. Rendimiento por fecha y flujo." : "Ownership by units. Returns by date and cash flow."}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {isEs
              ? "Cada aporte compra unidades al NAV vigente. El XIRR pertenece al inversionista; el TWR y la atribución del portfolio permanecen separados en Performance Attribution. Ninguna IA interviene en estos cálculos."
              : "Each contribution purchases units at the prevailing NAV. XIRR belongs to the investor; portfolio TWR and attribution remain separate in Performance Attribution. No AI participates in these calculations."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load(data?.selectedPoolId)}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-50"
            aria-label={isEs ? "Actualizar cuentas" : "Refresh accounts"}
            title={isEs ? "Actualizar cuentas" : "Refresh accounts"}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setShowPoolForm((value) => !value)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-100"
          >
            <Plus className="h-4 w-4" />
            {isEs ? "Nuevo pool" : "New pool"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 border-l-2 border-rose-400/70 bg-rose-400/5 px-3 py-2 text-xs leading-5 text-rose-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}
      {status ? (
        <div className="mt-4 flex items-start gap-2 border-l-2 border-emerald-400/70 bg-emerald-400/5 px-3 py-2 text-xs leading-5 text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{status}</p>
        </div>
      ) : null}

      {showPoolForm ? (
        <div className="mt-5 border-y border-slate-800 py-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
            <label className="min-w-0">
              <span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Nombre del pool" : "Pool name"}</span>
              <input value={poolName} onChange={(event) => setPoolName(event.target.value)} maxLength={160} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400" />
            </label>
            <label>
              <span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Moneda" : "Currency"}</span>
              <input value={poolCurrency} onChange={(event) => setPoolCurrency(event.target.value.toUpperCase().slice(0, 3))} maxLength={3} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400" />
            </label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => void createPool()} disabled={saving || !poolName.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isEs ? "Crear" : "Create"}
              </button>
              <button type="button" onClick={() => setShowPoolForm(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-slate-400" aria-label={isEs ? "Cerrar" : "Close"}><X className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      ) : null}

      {data?.pools.length ? (
        <div className="mt-5 flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <label className="block min-w-0 sm:w-80">
            <span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Pool de capital" : "Capital pool"}</span>
            <select
              value={data.selectedPoolId ?? ""}
              onChange={(event) => void load(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
            >
              {data.pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name} · {pool.base_currency}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowAccountForm((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-400/5 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-400/10">
              <Users className="h-4 w-4" />
              {isEs ? "Añadir inversionista" : "Add investor"}
            </button>
            <button type="button" onClick={() => setShowNavForm((value) => !value)} disabled={!data.accounts.length} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-400/5 px-3 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-400/10 disabled:opacity-50">
              <Landmark className="h-4 w-4" />
              {isEs ? "Cerrar NAV" : "Record NAV"}
            </button>
          </div>
        </div>
      ) : null}

      {showAccountForm && data?.selectedPoolId ? (
        <div className="border-b border-slate-800 py-5">
          <p className="text-sm font-semibold text-slate-100">{isEs ? "Nueva cuenta individual" : "New individual account"}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="min-w-0 xl:col-span-2">
              <span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Inversionista" : "Investor"}</span>
              <input value={investorName} onChange={(event) => setInvestorName(event.target.value)} maxLength={160} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-400" />
            </label>
            <label className="min-w-0">
              <span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Referencia opcional" : "Optional reference"}</span>
              <input value={investorReference} onChange={(event) => setInvestorReference(event.target.value)} maxLength={160} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-400" />
            </label>
            <label>
              <span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Fecha de apertura" : "Opening date"}</span>
              <input type="date" max={today()} value={openedOn} onChange={(event) => setOpenedOn(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-400" />
            </label>
            <label>
              <span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Aporte inicial" : "Initial contribution"}</span>
              <input type="number" min="0" step="0.01" value={initialContribution} onChange={(event) => setInitialContribution(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-400" />
            </label>
          </div>
          {data.report?.latestNavPerUnit == null && initialContribution ? (
            <label className="mt-3 block max-w-xs">
              <span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "NAV inicial por unidad" : "Opening NAV per unit"}</span>
              <input type="number" min="0.000001" step="0.01" value={initialNavPerUnit} onChange={(event) => setInitialNavPerUnit(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-400" />
            </label>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void createAccount()} disabled={saving || !investorName.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isEs ? "Crear cuenta" : "Create account"}
            </button>
            <button type="button" onClick={() => setShowAccountForm(false)} className="h-10 rounded-lg border border-slate-700 px-3 text-sm text-slate-300">{isEs ? "Cancelar" : "Cancel"}</button>
          </div>
        </div>
      ) : null}

      {showNavForm && data?.selectedPoolId ? (
        <div className="border-b border-slate-800 py-5">
          <div className="flex items-start gap-3">
            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
            <div>
              <p className="text-sm font-semibold text-slate-100">{isEs ? "Congelar NAV del pool" : "Freeze pool NAV"}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{isEs ? "Entra el valor neto total. La base calcula las unidades y el NAV por unidad, y bloquea el registro para auditoría." : "Enter total net assets. The database calculates units and NAV per unit, then locks the record for audit."}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[180px_220px_minmax(0,1fr)]">
            <label><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Fecha NAV" : "NAV date"}</span><input type="date" max={today()} value={navDate} onChange={(event) => setNavDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-violet-400" /></label>
            <label><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Activos netos totales" : "Total net assets"}</span><input type="number" min="0" step="0.01" value={netAssets} onChange={(event) => setNetAssets(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-violet-400" /></label>
            <label><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Nota opcional" : "Optional note"}</span><input value={navNotes} onChange={(event) => setNavNotes(event.target.value)} maxLength={2000} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-violet-400" /></label>
          </div>
          <div className="mt-4 flex gap-2"><button type="button" onClick={() => void recordNav()} disabled={saving || netAssets === ""} className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isEs ? "Congelar NAV" : "Freeze NAV"}</button><button type="button" onClick={() => setShowNavForm(false)} className="h-10 rounded-lg border border-slate-700 px-3 text-sm text-slate-300">{isEs ? "Cancelar" : "Cancel"}</button></div>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex min-h-44 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />{isEs ? "Cargando ledger" : "Loading ledger"}</div>
      ) : !data?.pools.length ? (
        <div className="py-10 text-center">
          <CircleDollarSign className="mx-auto h-8 w-8 text-emerald-300" />
          <p className="mt-3 text-sm font-semibold text-slate-100">{isEs ? "Crea el primer pool de capital" : "Create the first capital pool"}</p>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">{isEs ? "El pool agrupa cuentas individuales bajo el mismo NAV. No representa custodia ni mueve dinero." : "The pool groups individual accounts under one NAV. It does not represent custody or move money."}</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={isEs ? "NAV congelado" : "Frozen pool NAV"} value={money(data.report?.latestLockedPoolNav, currency, isEs)} hint={data.report?.latestNavDate ?? (isEs ? "Sin cierre" : "No close yet")} />
            <Metric label={isEs ? "NAV por unidad" : "NAV per unit"} value={money(data.report?.latestNavPerUnit, currency, isEs)} hint={isEs ? "Misma base para todas las cuentas" : "Shared across every account"} tone="sky" />
            <Metric label={isEs ? "Unidades actuales" : "Current units"} value={number(data.report?.totalCurrentUnits, isEs, 6)} hint={`${data.accounts.length} ${isEs ? "cuentas" : "accounts"}`} tone="violet" />
            <Metric label={isEs ? "Estado del ledger" : "Ledger status"} value={data.report?.reconciliation.reconciled ? (isEs ? "Reconciliado" : "Reconciled") : (isEs ? "Revisar" : "Review")} hint="capital-accounts-v1" tone={data.report?.reconciliation.reconciled ? "emerald" : "amber"} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="min-w-0 border-r-0 border-slate-800 xl:border-r xl:pr-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Inversionistas" : "Investors"}</p>
                <span className="text-xs text-slate-500">{data.accounts.length}</span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {data.accounts.map((account) => {
                  const report = data.report?.accounts.find((item) => item.accountId === account.id);
                  const active = selectedAccount?.id === account.id;
                  return (
                    <button key={account.id} type="button" onClick={() => setSelectedAccountId(account.id)} className={`min-h-[76px] rounded-lg border p-3 text-left transition ${active ? "border-emerald-400/60 bg-emerald-400/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-600"}`}>
                      <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold text-slate-100">{account.investor_name}</p><span className="shrink-0 text-[10px] text-slate-500">{pct(report?.currentOwnershipPct, isEs)}</span></div>
                      <p className="mt-2 text-xs text-slate-400">{money(report?.currentNav, currency, isEs)} · {number(report?.currentUnits, isEs, 4)} {isEs ? "uds." : "units"}</p>
                    </button>
                  );
                })}
              </div>
            </aside>

            {selectedAccount && accountReport ? (
              <div className="min-w-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Cuenta individual" : "Individual account"}</p>
                    <h3 className="mt-1 truncate text-lg font-semibold text-slate-50">{selectedAccount.investor_name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{isEs ? "Abierta" : "Opened"} {selectedAccount.opened_on}{selectedAccount.investor_reference ? ` · ${selectedAccount.investor_reference}` : ""}</p>
                  </div>
                  <button type="button" onClick={() => setShowEventForm((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/5 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/10"><Plus className="h-4 w-4" />{isEs ? "Registrar movimiento" : "Post event"}</button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label={isEs ? "NAV actual" : "Current NAV"} value={money(accountReport.currentNav, currency, isEs)} hint={`${number(accountReport.currentUnits, isEs, 6)} ${isEs ? "unidades" : "units"}`} />
                  <Metric label={isEs ? "Resultado neto" : "Net investment result"} value={money(accountReport.netInvestmentResult, currency, isEs)} hint={isEs ? "NAV + salidas - aportes - gastos externos" : "NAV + proceeds - contributions - external expenses"} tone="sky" />
                  <Metric label={isEs ? "XIRR anualizado" : "Annualized XIRR"} value={pct(accountReport.moneyWeightedReturn.annualizedValuePct, isEs)} hint={accountReport.moneyWeightedReturn.status} tone={accountReport.moneyWeightedReturn.status === "calculated" ? "emerald" : "amber"} />
                  <Metric label={isEs ? "Distribuciones" : "Distributions"} value={money(accountReport.distributions, currency, isEs)} hint={`${isEs ? "Retiros" : "Withdrawals"}: ${money(accountReport.withdrawals, currency, isEs)}`} tone="violet" />
                </div>

                {accountReport.pendingEventsAfterLatestNav > 0 ? (
                  <div className="mt-4 flex items-start gap-2 border-l-2 border-amber-400/70 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-100"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>{isEs ? `${accountReport.pendingEventsAfterLatestNav} movimiento(s) ocurrieron luego del último NAV. El XIRR es provisional hasta el próximo cierre.` : `${accountReport.pendingEventsAfterLatestNav} event(s) occurred after the latest NAV. XIRR is provisional until the next close.`}</p></div>
                ) : null}

                {showEventForm ? (
                  <div className="mt-5 border-y border-slate-800 py-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <label><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Movimiento" : "Event"}</span><select value={eventType} onChange={(event) => setEventType(event.target.value as CapitalAccountEventType)} disabled={requiresInitialContribution} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400">{requiresInitialContribution ? <option value="initial_contribution">{eventLabel("initial_contribution", isEs)}</option> : <><option value="contribution">{eventLabel("contribution", isEs)}</option><option value="withdrawal">{eventLabel("withdrawal", isEs)}</option><option value="distribution">{eventLabel("distribution", isEs)}</option><option value="allocated_expense">{eventLabel("allocated_expense", isEs)}</option></>}</select></label>
                      <label><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Fecha" : "Date"}</span><input type="date" min={selectedAccount.opened_on} max={today()} value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400" /></label>
                      <label><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Monto" : "Amount"}</span><input type="number" min="0.01" step="0.01" value={eventAmount} onChange={(event) => setEventAmount(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400" /></label>
                      {eventType === "allocated_expense" ? <label><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Tratamiento" : "Treatment"}</span><select value={expenseTreatment} onChange={(event) => setExpenseTreatment(event.target.value as "included_in_nav" | "investor_paid")} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400"><option value="included_in_nav">{isEs ? "Incluido en NAV" : "Included in NAV"}</option><option value="investor_paid">{isEs ? "Pagado por inversionista" : "Investor paid"}</option></select></label> : <label><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Nota opcional" : "Optional note"}</span><input value={eventNotes} onChange={(event) => setEventNotes(event.target.value)} maxLength={2000} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400" /></label>}
                    </div>
                    {eventType === "initial_contribution" && data.report?.latestNavPerUnit == null ? <label className="mt-3 block max-w-xs"><span className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "NAV inicial por unidad" : "Opening NAV per unit"}</span><input type="number" min="0.000001" step="0.01" value={initialNavPerUnit} onChange={(event) => setInitialNavPerUnit(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400" /></label> : null}
                    <div className="mt-4 flex gap-2"><button type="button" onClick={() => void recordEvent()} disabled={saving || !eventAmount} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isEs ? "Registrar" : "Post"}</button><button type="button" onClick={() => setShowEventForm(false)} className="h-10 rounded-lg border border-slate-700 px-3 text-sm text-slate-300">{isEs ? "Cancelar" : "Cancel"}</button></div>
                  </div>
                ) : null}

                <div className="mt-6 grid gap-6 2xl:grid-cols-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><ReceiptText className="h-4 w-4 text-sky-300" /><p className="text-sm font-semibold text-slate-100">{isEs ? "Ledger de movimientos" : "Capital event ledger"}</p></div>
                    <div className="mt-3 border-y border-slate-800 sm:hidden">
                      {selectedEvents.map((event) => (
                        <div key={event.id} className="border-t border-slate-800/80 py-3 first:border-t-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold ${eventTone(event.event_type)}`}>{eventLabel(event.event_type, isEs)}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{event.event_date}</p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold text-slate-100">{money(Number(event.amount), currency, isEs)}</p>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                            <span>{isEs ? "Unidades" : "Units"}: {number(Number(event.units_delta), isEs, 6)}</span>
                            <span>NAV/u: {money(event.nav_per_unit == null ? null : Number(event.nav_per_unit), currency, isEs)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 hidden overflow-x-auto border-y border-slate-800 sm:block">
                      <table className="w-full min-w-[620px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-500"><tr><th className="px-2 py-2">{isEs ? "Fecha" : "Date"}</th><th className="px-2 py-2">{isEs ? "Tipo" : "Type"}</th><th className="px-2 py-2 text-right">{isEs ? "Monto" : "Amount"}</th><th className="px-2 py-2 text-right">{isEs ? "Unidades" : "Units"}</th><th className="px-2 py-2 text-right">NAV/u</th></tr></thead><tbody>{selectedEvents.map((event) => <tr key={event.id} className="border-t border-slate-800/80"><td className="px-2 py-2.5 text-slate-400">{event.event_date}</td><td className={`px-2 py-2.5 font-semibold ${eventTone(event.event_type)}`}>{eventLabel(event.event_type, isEs)}</td><td className="px-2 py-2.5 text-right text-slate-200">{money(Number(event.amount), currency, isEs)}</td><td className="px-2 py-2.5 text-right text-slate-300">{number(Number(event.units_delta), isEs, 6)}</td><td className="px-2 py-2.5 text-right text-slate-400">{money(event.nav_per_unit == null ? null : Number(event.nav_per_unit), currency, isEs)}</td></tr>)}</tbody></table>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-violet-300" /><p className="text-sm font-semibold text-slate-100">{isEs ? "Historial de NAV" : "Historical NAV"}</p></div>
                    <div className="mt-3 border-y border-slate-800 sm:hidden">
                      {[...accountReport.historicalNav].reverse().map((point) => (
                        <div key={`${selectedAccount.id}-${point.navDate}`} className="border-t border-slate-800/80 py-3 first:border-t-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-slate-400">{point.navDate}</p>
                            <p className="text-sm font-semibold text-slate-100">{money(point.accountNav, currency, isEs)}</p>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                            <span>{number(point.units, isEs, 6)} {isEs ? "unidades" : "units"}</span>
                            <span>NAV/u {money(point.navPerUnit, currency, isEs)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 hidden overflow-x-auto border-y border-slate-800 sm:block">
                      <table className="w-full min-w-[520px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-500"><tr><th className="px-2 py-2">{isEs ? "Fecha" : "Date"}</th><th className="px-2 py-2 text-right">{isEs ? "NAV cuenta" : "Account NAV"}</th><th className="px-2 py-2 text-right">{isEs ? "Unidades" : "Units"}</th><th className="px-2 py-2 text-right">NAV/u</th></tr></thead><tbody>{[...accountReport.historicalNav].reverse().map((point) => <tr key={`${selectedAccount.id}-${point.navDate}`} className="border-t border-slate-800/80"><td className="px-2 py-2.5 text-slate-400">{point.navDate}</td><td className="px-2 py-2.5 text-right font-semibold text-slate-100">{money(point.accountNav, currency, isEs)}</td><td className="px-2 py-2.5 text-right text-slate-300">{number(point.units, isEs, 6)}</td><td className="px-2 py-2.5 text-right text-slate-400">{money(point.navPerUnit, currency, isEs)}</td></tr>)}</tbody></table>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 border-t border-slate-800 pt-5 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="flex items-start gap-2"><ArrowDownToLine className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><div><p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Aportes" : "Contributions"}</p><p className="mt-1 text-sm font-semibold text-slate-100">{money(accountReport.totalContributions, currency, isEs)}</p></div></div>
                  <div className="flex items-start gap-2"><ArrowUpFromLine className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Retiros" : "Withdrawals"}</p><p className="mt-1 text-sm font-semibold text-slate-100">{money(accountReport.withdrawals, currency, isEs)}</p></div></div>
                  <div className="flex items-start gap-2"><ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /><div><p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Gastos asignados" : "Allocated expenses"}</p><p className="mt-1 text-sm font-semibold text-slate-100">{money(accountReport.allocatedExpenses, currency, isEs)}</p></div></div>
                  <div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" /><div><p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Participación" : "Ownership"}</p><p className="mt-1 text-sm font-semibold text-slate-100">{pct(accountReport.currentOwnershipPct, isEs)}</p></div></div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-48 items-center justify-center border-y border-slate-800 text-center text-sm text-slate-500">{isEs ? "Añade un inversionista para comenzar el ledger." : "Add an investor to begin the ledger."}</div>
            )}
          </div>

          <div className="mt-6 flex items-start gap-3 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500">
            <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <p>{isEs ? "El resultado individual usa XIRR con aportes, retiros, distribuciones y gastos externos fechados. No usa valor actual dividido entre aportes de toda la vida. El performance del portfolio se calcula aparte para que depósitos y retiros nunca parezcan ganancias." : "Individual results use XIRR with dated contributions, withdrawals, distributions, and external expenses. They never use current value divided by lifetime contributions. Portfolio performance is calculated separately so deposits and withdrawals can never appear as gains."}</p>
          </div>
        </>
      )}
    </section>
  );
}
