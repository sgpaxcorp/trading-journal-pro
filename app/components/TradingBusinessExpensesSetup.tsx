"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Building2, Check, ChevronLeft, ChevronRight, Landmark, X } from "lucide-react";

import type { TradingAccount } from "@/hooks/useTradingAccounts";
import type { GrowthPlan } from "@/lib/growthPlanSupabase";
import {
  capitalAllocationFromPlans,
  planOperatingContext,
  selectedCapitalAccountIds,
  totalInitialBusinessCapital,
  traderTypeFromPlan,
  type BusinessCapitalAllocation,
  type BusinessCapitalScope,
} from "@/lib/profitLossBusinessSetup";
import type {
  CostCategory,
  ProfitLossBudget,
  ProfitLossProfile,
  TraderType,
} from "@/lib/profitLossTrackSupabase";
import { TRADER_TYPE_LABELS } from "@/lib/profitLossTrackPresets";

const BUDGET_FIELDS: Array<{
  category: CostCategory;
  en: string;
  es: string;
  detailEn: string;
  detailEs: string;
}> = [
  { category: "subscription", en: "Platforms & subscriptions", es: "Plataformas y suscripciones", detailEn: "Journals, charting and recurring services", detailEs: "Journals, charts y servicios recurrentes" },
  { category: "data", en: "Market data", es: "Data de mercado", detailEn: "Live quotes, news and data feeds", detailEs: "Cotizaciones, noticias y data feeds" },
  { category: "software", en: "Trading software", es: "Software de trading", detailEn: "Execution, analytics and automation tools", detailEs: "Herramientas de ejecución, análisis y automatización" },
  { category: "broker", en: "Broker costs", es: "Costos del bróker", detailEn: "Base commissions and account services", detailEs: "Comisiones base y servicios de cuenta" },
  { category: "funding", en: "Funding & evaluation", es: "Funding y evaluaciones", detailEn: "Prop evaluations, resets and activation", detailEs: "Evaluaciones prop, resets y activación" },
  { category: "education", en: "Education", es: "Educación", detailEn: "Courses and structured learning", detailEs: "Cursos y aprendizaje estructurado" },
  { category: "mentorship", en: "Mentorship", es: "Mentoría", detailEn: "Coaching and professional review", detailEs: "Coaching y revisión profesional" },
  { category: "admin", en: "Administration", es: "Administración", detailEn: "Bookkeeping, legal and business services", detailEs: "Contabilidad, legal y servicios del negocio" },
];

export type TradingBusinessExpensesSetupValue = {
  capitalScope: BusinessCapitalScope;
  capitalAccountIds: string[];
  capitalAllocation: BusinessCapitalAllocation;
  sourcePlanAccountId: string | null;
  initialCapital: number;
  traderType: TraderType;
  tradingDaysPerMonth: number;
  averageTradesPerMonth: number;
  includeEducationInBreakEven: boolean;
  includeOwnerPayInBreakEven: boolean;
  ownerPayTargetMonthly: number;
  monthlyBudgets: Partial<Record<CostCategory, number>>;
};

type Props = {
  open: boolean;
  lang: "en" | "es";
  accounts: TradingAccount[];
  plans: GrowthPlan[];
  activeAccountId: string | null;
  profile: ProfitLossProfile;
  budgets: ProfitLossBudget[];
  currentExpenseCount: number;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (value: TradingBusinessExpensesSetupValue) => Promise<void>;
};

function currency(value: number, lang: "en" | "es") {
  return new Intl.NumberFormat(lang === "es" ? "es-PR" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function numberValue(value: string) {
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function planForAccount(plans: GrowthPlan[], accountId: string | null | undefined) {
  return plans.find((plan) => plan.accountId === accountId) ?? null;
}

export default function TradingBusinessExpensesSetup({
  open,
  lang,
  accounts,
  plans,
  activeAccountId,
  profile,
  budgets,
  currentExpenseCount,
  saving,
  error,
  onClose,
  onSave,
}: Props) {
  const L = (en: string, es: string) => (lang === "es" ? es : en);
  const [step, setStep] = useState(0);
  const [capitalScope, setCapitalScope] = useState<BusinessCapitalScope>("single_account");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(activeAccountId);
  const [capitalAllocation, setCapitalAllocation] = useState<BusinessCapitalAllocation>({});
  const [sourcePlanAccountId, setSourcePlanAccountId] = useState<string | null>(activeAccountId);
  const [traderType, setTraderType] = useState<TraderType>("minimal");
  const [tradingDaysPerMonth, setTradingDaysPerMonth] = useState(20);
  const [averageTradesPerMonth, setAverageTradesPerMonth] = useState(40);
  const [includeEducation, setIncludeEducation] = useState(true);
  const [includeOwnerPay, setIncludeOwnerPay] = useState(false);
  const [ownerPayMonthly, setOwnerPayMonthly] = useState(0);
  const [monthlyBudgets, setMonthlyBudgets] = useState<Partial<Record<CostCategory, number>>>({});
  const [validationError, setValidationError] = useState("");

  const accountInputs = useMemo(
    () => accounts.map((account) => ({ id: account.id, name: account.name, accountType: account.account_type })),
    [accounts]
  );

  useEffect(() => {
    if (!open) return;
    const fallbackAccountId =
      profile.capital_account_ids[0] ?? activeAccountId ?? accounts[0]?.id ?? null;
    const nextScope = profile.setup_completed_at ? profile.capital_scope : "single_account";
    const nextSourceAccountId = profile.source_plan_account_id ?? fallbackAccountId;
    const sourceAccount = accounts.find((account) => account.id === nextSourceAccountId) ?? null;
    const sourcePlan = planForAccount(plans, nextSourceAccountId);
    const context = planOperatingContext(sourcePlan);

    setStep(0);
    setCapitalScope(nextScope);
    setSelectedAccountId(fallbackAccountId);
    setCapitalAllocation(capitalAllocationFromPlans({ accounts: accountInputs, plans, profile }));
    setSourcePlanAccountId(nextSourceAccountId);
    setTraderType(
      profile.setup_completed_at
        ? profile.trader_type
        : traderTypeFromPlan({ instrument: context.tradingInstrument, accountType: sourceAccount?.account_type })
    );
    setTradingDaysPerMonth(
      profile.setup_completed_at ? profile.trading_days_per_month : context.tradingDaysPerMonth
    );
    setAverageTradesPerMonth(profile.avg_trades_per_month || 40);
    setIncludeEducation(profile.include_education_in_break_even);
    setIncludeOwnerPay(
      profile.setup_completed_at
        ? profile.include_owner_pay_in_break_even
        : context.ownerPayMonthly > 0
    );
    setOwnerPayMonthly(
      profile.setup_completed_at ? profile.owner_pay_target_monthly : context.ownerPayMonthly
    );
    setMonthlyBudgets(
      Object.fromEntries(budgets.map((budget) => [budget.category, budget.monthly_amount]))
    );
    setValidationError("");
  }, [accountInputs, accounts, activeAccountId, budgets, open, plans, profile]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, saving]);

  if (!open) return null;

  const includedAccountIds = selectedCapitalAccountIds({
    scope: capitalScope,
    accounts: accountInputs,
    selectedAccountId,
  });
  const totalCapital = totalInitialBusinessCapital({
    scope: capitalScope,
    accounts: accountInputs,
    selectedAccountId,
    allocation: capitalAllocation,
  });
  const selectedAccountsHaveCapital = includedAccountIds.every(
    (accountId) => Number(capitalAllocation[accountId]) > 0
  );
  const totalBudget = BUDGET_FIELDS.reduce(
    (sum, field) => sum + Number(monthlyBudgets[field.category] ?? 0),
    0
  );

  function applyOperatingPlan(accountId: string) {
    setSourcePlanAccountId(accountId);
    const account = accounts.find((item) => item.id === accountId) ?? null;
    const context = planOperatingContext(planForAccount(plans, accountId));
    setTraderType(
      traderTypeFromPlan({ instrument: context.tradingInstrument, accountType: account?.account_type })
    );
    setTradingDaysPerMonth(context.tradingDaysPerMonth);
    if (context.ownerPayMonthly > 0) {
      setIncludeOwnerPay(true);
      setOwnerPayMonthly(context.ownerPayMonthly);
    }
  }

  function goNext() {
    setValidationError("");
    if (step === 0) {
      if (!includedAccountIds.length || totalCapital <= 0 || !selectedAccountsHaveCapital) {
        setValidationError(
          L(
            "Enter a capital amount greater than zero for every account included in the business base.",
            "Ingresa un capital mayor de cero para cada cuenta incluida en la base del negocio."
          )
        );
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!sourcePlanAccountId || tradingDaysPerMonth < 1 || averageTradesPerMonth < 1) {
        setValidationError(
          L(
            "Select the operating plan and enter a valid monthly rhythm.",
            "Selecciona el plan operativo e ingresa un ritmo mensual válido."
          )
        );
        return;
      }
      if (includeOwnerPay && ownerPayMonthly <= 0) {
        setValidationError(
          L(
            "Enter the monthly owner-pay target or turn owner pay off.",
            "Ingresa la meta mensual de compensación del dueño o desactívala."
          )
        );
        return;
      }
      setStep(2);
    }
  }

  async function submit() {
    setValidationError("");
    await onSave({
      capitalScope,
      capitalAccountIds: includedAccountIds,
      capitalAllocation: Object.fromEntries(
        includedAccountIds.map((accountId) => [accountId, Number(capitalAllocation[accountId] ?? 0)])
      ),
      sourcePlanAccountId,
      initialCapital: totalCapital,
      traderType,
      tradingDaysPerMonth,
      averageTradesPerMonth,
      includeEducationInBreakEven: includeEducation,
      includeOwnerPayInBreakEven: includeOwnerPay,
      ownerPayTargetMonthly: includeOwnerPay ? ownerPayMonthly : 0,
      monthlyBudgets,
    });
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-expenses-setup-title"
        className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-cyan-300/25 bg-slate-950 text-slate-50 shadow-[0_35px_100px_rgba(2,8,23,0.85)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.16),transparent_48%),radial-gradient(circle_at_80%_0%,rgba(52,211,153,0.13),transparent_42%)]" />
        <header className="relative border-b border-slate-800 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
                <BriefcaseBusiness className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-emerald-300">
                  {L("Advanced business setup", "Configuración empresarial Advanced")}
                </p>
                <h1 id="business-expenses-setup-title" className="mt-1 text-xl font-semibold sm:text-2xl">
                  {L("Trading Business Expenses", "Gastos del Negocio de Trading")}
                </h1>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">
                  {L(
                    "Connect the approved plan, capital base and operating budget before measuring real break-even.",
                    "Conecta el plan aprobado, la base de capital y el presupuesto operativo antes de medir el break-even real."
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label={L("Close setup", "Cerrar configuración")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              L("Capital base", "Base de capital"),
              L("Operating rhythm", "Ritmo operativo"),
              L("Expense budget", "Presupuesto de gastos"),
            ].map((label, index) => (
              <div key={label} className="min-w-0">
                <div className={`h-1 rounded-full ${index <= step ? "bg-gradient-to-r from-emerald-400 to-cyan-400" : "bg-slate-800"}`} />
                <p className={`mt-2 truncate text-[10px] font-semibold uppercase tracking-[0.14em] ${index === step ? "text-cyan-100" : "text-slate-600"}`}>
                  {index + 1}. {label}
                </p>
              </div>
            ))}
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {step === 0 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">{L("How should business capital be measured?", "¿Cómo se debe medir el capital del negocio?")}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {L("Capital is an operating base, not an expense. Choose exactly what this business view represents.", "El capital es la base operativa, no un gasto. Escoge exactamente qué representa esta vista del negocio.")}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCapitalScope("single_account")}
                  className={`rounded-2xl border p-4 text-left transition ${capitalScope === "single_account" ? "border-cyan-300/70 bg-cyan-300/10" : "border-slate-800 bg-slate-900/55 hover:border-slate-600"}`}
                >
                  <Landmark className="h-5 w-5 text-cyan-200" />
                  <span className="mt-3 block text-sm font-semibold">{L("One trading account", "Una cuenta de trading")}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">{L("Measure this operation from one account selected by the owner.", "Mide esta operación desde una cuenta seleccionada por el dueño.")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCapitalScope("all_accounts")}
                  disabled={accounts.length < 2}
                  className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${capitalScope === "all_accounts" ? "border-emerald-300/70 bg-emerald-300/10" : "border-slate-800 bg-slate-900/55 hover:border-slate-600"}`}
                >
                  <Building2 className="h-5 w-5 text-emerald-200" />
                  <span className="mt-3 block text-sm font-semibold">{L("All trading accounts", "Todas las cuentas de trading")}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">{L("Consolidate the opening capital of the complete trading business.", "Consolida el capital inicial de todo el negocio de trading.")}</span>
                </button>
              </div>

              {capitalScope === "single_account" ? (
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{L("Account included", "Cuenta incluida")}</span>
                  <select
                    value={selectedAccountId ?? ""}
                    onChange={(event) => {
                      const accountId = event.target.value || null;
                      setSelectedAccountId(accountId);
                      if (accountId) applyOperatingPlan(accountId);
                    }}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-300"
                  >
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
                {accounts
                  .filter((account) => capitalScope === "all_accounts" || account.id === selectedAccountId)
                  .map((account, index) => {
                    const linkedPlan = planForAccount(plans, account.id);
                    return (
                      <div key={account.id} className={`grid gap-3 p-4 sm:grid-cols-[1fr_220px] sm:items-center ${index > 0 ? "border-t border-slate-800" : ""}`}>
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{account.name}</p>
                          <p className={`mt-1 text-xs ${linkedPlan?.startingBalance ? "text-emerald-300" : "text-amber-200"}`}>
                            {linkedPlan?.startingBalance
                              ? L(`Imported from approved plan: ${currency(linkedPlan.startingBalance, lang)}`, `Importado del plan aprobado: ${currency(linkedPlan.startingBalance, lang)}`)
                              : L("No approved capital found. Enter the verified amount.", "No se encontró capital aprobado. Ingresa el monto verificado.")}
                          </p>
                        </div>
                        <label className="relative block">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-cyan-200">$</span>
                          <input
                            inputMode="decimal"
                            value={capitalAllocation[account.id] ?? ""}
                            onChange={(event) => setCapitalAllocation((current) => ({ ...current, [account.id]: numberValue(event.target.value) }))}
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-8 pr-3 text-right text-sm font-semibold outline-none focus:border-cyan-300"
                            aria-label={L(`Initial capital for ${account.name}`, `Capital inicial de ${account.name}`)}
                          />
                        </label>
                      </div>
                    );
                  })}
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/8 p-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">{L("Verified business capital base", "Base verificada de capital del negocio")}</p>
                  <p className="mt-1 text-xs text-slate-400">{L("This amount feeds runway and business context. It is never counted as an expense.", "Este monto alimenta el runway y el contexto del negocio. Nunca cuenta como gasto.")}</p>
                </div>
                <p className="text-2xl font-semibold text-emerald-200">{currency(totalCapital, lang)}</p>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">{L("Confirm the operating rhythm", "Confirma el ritmo operativo")}</h2>
                <p className="mt-1 text-sm text-slate-400">{L("These inputs convert monthly expenses into daily and per-trade break-even targets.", "Estos datos convierten los gastos mensuales en metas de break-even diario y por trade.")}</p>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{L("Approved plan used as operating source", "Plan aprobado usado como fuente operativa")}</span>
                <select
                  value={sourcePlanAccountId ?? ""}
                  onChange={(event) => applyOperatingPlan(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-300"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}{planForAccount(plans, account.id) ? L(" · approved plan", " · plan aprobado") : L(" · no plan", " · sin plan")}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2 text-xs">
                  <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">{L("Operating profile", "Perfil operativo")}</span>
                  <select value={traderType} onChange={(event) => setTraderType(event.target.value as TraderType)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-cyan-300">
                    {(Object.keys(TRADER_TYPE_LABELS) as TraderType[]).map((type) => <option key={type} value={type}>{L(TRADER_TYPE_LABELS[type].en, TRADER_TYPE_LABELS[type].es)}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-xs">
                  <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">{L("Trading days / month", "Días de trading / mes")}</span>
                  <input type="number" min={1} max={31} value={tradingDaysPerMonth} onChange={(event) => setTradingDaysPerMonth(Math.max(0, Number(event.target.value)))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                </label>
                <label className="space-y-2 text-xs">
                  <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">{L("Average trades / month", "Promedio de trades / mes")}</span>
                  <input type="number" min={1} value={averageTradesPerMonth} onChange={(event) => setAverageTradesPerMonth(Math.max(0, Number(event.target.value)))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-start justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
                  <span><span className="block text-sm font-semibold">{L("Count education in break-even", "Contar educación en el break-even")}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{L("Courses and structured learning increase the operating floor while enabled.", "Los cursos y el aprendizaje estructurado aumentan el piso operativo mientras esté activo.")}</span></span>
                  <input type="checkbox" checked={includeEducation} onChange={(event) => setIncludeEducation(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-400" />
                </label>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
                  <label className="flex items-start justify-between gap-4">
                    <span><span className="block text-sm font-semibold">{L("Include owner compensation", "Incluir compensación del dueño")}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{L("Use the plan's withdrawal cadence as the monthly business target.", "Usa la frecuencia de retiros del plan como meta mensual del negocio.")}</span></span>
                    <input type="checkbox" checked={includeOwnerPay} onChange={(event) => setIncludeOwnerPay(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-400" />
                  </label>
                  {includeOwnerPay ? (
                    <label className="relative mt-3 block">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-cyan-200">$</span>
                      <input inputMode="decimal" value={ownerPayMonthly || ""} onChange={(event) => setOwnerPayMonthly(numberValue(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-8 pr-3 text-sm outline-none focus:border-cyan-300" placeholder={L("Monthly owner target", "Meta mensual del dueño")} />
                    </label>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">{L("Set monthly spending guardrails", "Define los límites mensuales de gasto")}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">{L("Enter the maximum monthly budget by category. Actual vendor charges are added in Stack & Expenses, so this setup never duplicates real expenses.", "Ingresa el presupuesto mensual máximo por categoría. Los cargos reales por proveedor se añaden en Stack & Expenses, por lo que este setup nunca duplica gastos reales.")}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {BUDGET_FIELDS.map((field) => (
                  <label key={field.category} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/55 p-4 sm:grid-cols-[1fr_140px] sm:items-center">
                    <span><span className="block text-sm font-semibold">{L(field.en, field.es)}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{L(field.detailEn, field.detailEs)}</span></span>
                    <span className="relative block">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-cyan-200">$</span>
                      <input inputMode="decimal" value={monthlyBudgets[field.category] || ""} onChange={(event) => setMonthlyBudgets((current) => ({ ...current, [field.category]: numberValue(event.target.value) }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-7 pr-3 text-right text-sm outline-none focus:border-cyan-300" placeholder="0.00" />
                    </span>
                  </label>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/8 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{L("Monthly budget", "Presupuesto mensual")}</p><p className="mt-2 text-xl font-semibold">{currency(totalBudget, lang)}</p></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{L("Capital base", "Base de capital")}</p><p className="mt-2 text-xl font-semibold">{currency(totalCapital, lang)}</p></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{L("Actual expense records", "Registros de gasto reales")}</p><p className="mt-2 text-xl font-semibold">{currentExpenseCount}</p></div>
              </div>

              <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/8 p-4 text-sm leading-6 text-slate-300">
                <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-emerald-300 text-slate-950"><Check className="h-3 w-3" /></span>
                {L("After saving, add or verify each real vendor charge in Stack & Expenses. The dashboard will compare those actual costs against this budget and your approved plan.", "Después de guardar, añade o verifica cada cargo real por proveedor en Stack & Expenses. El dashboard comparará esos costos reales contra este presupuesto y tu plan aprobado.")}
              </div>
            </div>
          ) : null}

          {(validationError || error) ? <p role="alert" className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{validationError || error}</p> : null}
        </div>

        <footer className="relative flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/95 px-5 py-4 sm:px-7">
          <button type="button" onClick={step === 0 ? onClose : () => { setValidationError(""); setStep((current) => current - 1); }} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-50">
            {step > 0 ? <ChevronLeft className="h-4 w-4" /> : null}{step === 0 ? L("Not now", "Ahora no") : L("Back", "Atrás")}
          </button>
          <p className="hidden text-xs text-slate-600 sm:block">{L("You can review this setup later from Profit & Loss Track.", "Puedes revisar este setup luego desde Profit & Loss Track.")}</p>
          {step < 2 ? (
            <button type="button" onClick={goNext} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110">{L("Continue", "Continuar")}<ChevronRight className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{saving ? L("Saving setup...", "Guardando setup...") : L("Activate business tracking", "Activar seguimiento del negocio")}<Check className="h-4 w-4" /></button>
          )}
        </footer>
      </section>
    </div>
  );
}
