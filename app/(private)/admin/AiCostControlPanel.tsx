"use client";

import { useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supaBaseClient";

type Props = { lang: "en" | "es" };

type CostSettings = {
  monthlyAiBudgetUsd: number;
  chatgptMonthlyUsd: number;
  supabaseMonthlyUsd: number;
  vercelMonthlyUsd: number;
  internetMonthlyUsd: number;
  domainAnnualUsd: number;
  appStoreAnnualUsd: number;
  emailMonthlyUsd: number;
  monitoringMonthlyUsd: number;
  accountingMonthlyUsd: number;
  supportLaborMonthlyUsd: number;
  insuranceMonthlyUsd: number;
  otherMonthlyUsd: number;
  scenarioUsers: number;
  scenarioCorePercent: number;
};

type CostRow = {
  category?: string;
  feature?: string;
  model?: string;
  plan_tier?: string;
  user_email?: string;
  requests: number | string;
  active_users?: number | string;
  input_tokens?: number | string;
  cached_input_tokens?: number | string;
  output_tokens?: number | string;
  total_tokens: number | string;
  estimated_cost_usd: number | string;
  pricing_matched?: boolean;
};

type DashboardData = {
  period: { start: string; end: string; elapsedDays: number; daysInMonth: number };
  settings: CostSettings;
  setupRequired: boolean;
  setupError?: string | null;
  projectedOpenAiMonthUsd: number;
  providerCosts: {
    configured: boolean;
    projectScoped: boolean;
    totalUsd: number | null;
    error: string | null;
    lineItems: { lineItem: string; costUsd: number }[];
  };
  usage: null | {
    totals: {
      requests: number | string;
      active_users: number | string;
      input_tokens: number | string;
      cached_input_tokens: number | string;
      output_tokens: number | string;
      total_tokens: number | string;
      file_search_calls: number | string;
      estimated_cost_usd: number | string;
      base_product_cost_usd: number | string;
      market_intelligence_cost_usd: number | string;
    };
    byFeature: CostRow[];
    byModel: CostRow[];
    byPlan: CostRow[];
    topUsers: CostRow[];
  };
  publicPrices: Record<"core" | "advanced", { monthly: number; annual: number }>;
  recommendedPrices: Record<"core" | "advanced", { monthly: number; annual: number }>;
};

const SETTINGS_FIELDS: {
  key: keyof CostSettings;
  en: string;
  es: string;
  cadence: "monthly" | "annual" | "count" | "percent";
}[] = [
  { key: "monthlyAiBudgetUsd", en: "OpenAI API budget", es: "Budget de OpenAI API", cadence: "monthly" },
  { key: "chatgptMonthlyUsd", en: "ChatGPT subscription", es: "Suscripción de ChatGPT", cadence: "monthly" },
  { key: "supabaseMonthlyUsd", en: "Supabase", es: "Supabase", cadence: "monthly" },
  { key: "vercelMonthlyUsd", en: "Vercel", es: "Vercel", cadence: "monthly" },
  { key: "internetMonthlyUsd", en: "Business internet", es: "Internet del negocio", cadence: "monthly" },
  { key: "domainAnnualUsd", en: "Domain", es: "Dominio", cadence: "annual" },
  { key: "appStoreAnnualUsd", en: "Apple / App Store", es: "Apple / App Store", cadence: "annual" },
  { key: "emailMonthlyUsd", en: "Transactional email", es: "Email transaccional", cadence: "monthly" },
  { key: "monitoringMonthlyUsd", en: "Monitoring and logs", es: "Monitoreo y logs", cadence: "monthly" },
  { key: "accountingMonthlyUsd", en: "Accounting and legal", es: "Contabilidad y legal", cadence: "monthly" },
  { key: "supportLaborMonthlyUsd", en: "Support labor", es: "Trabajo de soporte", cadence: "monthly" },
  { key: "insuranceMonthlyUsd", en: "Business / cyber insurance", es: "Seguro comercial / cyber", cadence: "monthly" },
  { key: "otherMonthlyUsd", en: "Other monthly costs", es: "Otros costos mensuales", cadence: "monthly" },
  { key: "scenarioUsers", en: "Scenario users", es: "Usuarios del escenario", cadence: "count" },
  { key: "scenarioCorePercent", en: "Core user mix", es: "Mezcla de usuarios Core", cadence: "percent" },
];

function n(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function money(value: unknown, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n(value));
}

function compact(value: unknown) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n(value));
}

function monthlyFixed(settings: CostSettings) {
  return (
    settings.chatgptMonthlyUsd +
    settings.supabaseMonthlyUsd +
    settings.vercelMonthlyUsd +
    settings.internetMonthlyUsd +
    settings.domainAnnualUsd / 12 +
    settings.appStoreAnnualUsd / 12 +
    settings.emailMonthlyUsd +
    settings.monitoringMonthlyUsd +
    settings.accountingMonthlyUsd +
    settings.supportLaborMonthlyUsd +
    settings.insuranceMonthlyUsd +
    settings.otherMonthlyUsd
  );
}

function scenarioResult(args: {
  users: number;
  corePercent: number;
  corePrice: number;
  advancedPrice: number;
  fixed: number;
  ai: number;
}) {
  const coreUsers = Math.round(args.users * (args.corePercent / 100));
  const advancedUsers = Math.max(0, args.users - coreUsers);
  const revenue = coreUsers * args.corePrice + advancedUsers * args.advancedPrice;
  const stripe = revenue * 0.029 + args.users * 0.3;
  const operatingCost = args.fixed + args.ai + stripe;
  const contribution = revenue - operatingCost;
  return {
    coreUsers,
    advancedUsers,
    revenue,
    stripe,
    operatingCost,
    contribution,
    margin: revenue > 0 ? (contribution / revenue) * 100 : 0,
  };
}

function Metric({ label, value, note, tone = "slate" }: { label: string; value: string; note: string; tone?: "slate" | "cyan" | "emerald" | "amber" }) {
  const border =
    tone === "cyan"
      ? "border-cyan-400/25 bg-cyan-400/[0.06]"
      : tone === "emerald"
        ? "border-emerald-400/25 bg-emerald-400/[0.06]"
        : tone === "amber"
          ? "border-amber-400/25 bg-amber-400/[0.06]"
          : "border-slate-800 bg-slate-950/55";
  return (
    <div className={`rounded-2xl border p-5 ${border}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-50">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{note}</p>
    </div>
  );
}

export default function AiCostControlPanel({ lang }: Props) {
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [data, setData] = useState<DashboardData | null>(null);
  const [settings, setSettings] = useState<CostSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function authToken() {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    return sessionData?.session?.access_token ?? null;
  }

  async function load() {
    setLoading(true);
    setNotice(null);
    try {
      const token = await authToken();
      if (!token) throw new Error(L("Admin session missing.", "Falta la sesión de admin."));
      const response = await fetch("/api/admin/ai-costs", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error ?? "Could not load AI costs."));
      setData(body);
      setSettings(body.settings);
    } catch (error: any) {
      setNotice(error?.message ?? L("Could not load AI costs.", "No se pudieron cargar los costos de IA."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setNotice(null);
    try {
      const token = await authToken();
      if (!token) throw new Error(L("Admin session missing.", "Falta la sesión de admin."));
      const response = await fetch("/api/admin/ai-costs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error ?? "Save failed."));
      setSettings(body.settings);
      setNotice(L("Cost assumptions saved.", "Supuestos de costos guardados."));
    } catch (error: any) {
      setNotice(error?.message ?? L("Save failed.", "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  }

  const calculations = useMemo(() => {
    if (!data || !settings) return null;
    const estimatedMtd = n(data.usage?.totals?.estimated_cost_usd);
    const baseMtd = n(data.usage?.totals?.base_product_cost_usd);
    const baseShare = estimatedMtd > 0 ? Math.min(1, baseMtd / estimatedMtd) : 1;
    const projectedBaseAi = data.projectedOpenAiMonthUsd * baseShare;
    const planningAi = Math.max(projectedBaseAi, settings.monthlyAiBudgetUsd);
    const fixed = monthlyFixed(settings);
    const common = {
      users: settings.scenarioUsers,
      corePercent: settings.scenarioCorePercent,
      fixed,
      ai: planningAi,
    };
    return {
      estimatedMtd,
      baseMtd,
      projectedBaseAi,
      planningAi,
      fixed,
      planningTokensDaily: settings.scenarioUsers * 79_200,
      planningTokensMonth: settings.scenarioUsers * 79_200 * 30,
      planningAiTypical: (settings.scenarioUsers / 200) * 260.52,
      planningAiStress: (settings.scenarioUsers / 200) * 800.52,
      current: scenarioResult({
        ...common,
        corePrice: data.publicPrices.core.monthly,
        advancedPrice: data.publicPrices.advanced.monthly,
      }),
      recommended: scenarioResult({
        ...common,
        corePrice: data.recommendedPrices.core.monthly,
        advancedPrice: data.recommendedPrices.advanced.monthly,
      }),
    };
  }, [data, settings]);

  if (loading) {
    return <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-7 text-sm text-slate-400">{L("Loading AI cost control…", "Cargando control de costos de IA…")}</div>;
  }

  if (!data || !settings || !calculations) {
    return <div className="rounded-3xl border border-rose-500/25 bg-rose-500/5 p-7 text-sm text-rose-200">{notice ?? L("AI cost control is unavailable.", "El control de costos de IA no está disponible.")}</div>;
  }

  const actualMtd = data.providerCosts.totalUsd;
  const variance = actualMtd == null ? null : actualMtd - calculations.estimatedMtd;
  const budgetUse = settings.monthlyAiBudgetUsd > 0 ? (data.projectedOpenAiMonthUsd / settings.monthlyAiBudgetUsd) * 100 : 0;
  const catalogMatchesRecommendation =
    data.publicPrices.core.monthly === data.recommendedPrices.core.monthly &&
    data.publicPrices.core.annual === data.recommendedPrices.core.annual &&
    data.publicPrices.advanced.monthly === data.recommendedPrices.advanced.monthly &&
    data.publicPrices.advanced.annual === data.recommendedPrices.advanced.annual;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.09),transparent_35%),linear-gradient(145deg,rgba(15,23,42,0.95),rgba(2,6,23,0.96))] p-6 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">{L("AI cost control", "Control de costos IA")}</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-50">{L("Invoice reconciliation and unit economics", "Conciliación de factura y economía por usuario")}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {L(
                "The internal ledger attributes tokens and estimated cost to each feature and user. The OpenAI amount is the financial source of truth when an Admin API Key is configured.",
                "El ledger interno atribuye tokens y costo estimado a cada feature y usuario. El monto de OpenAI es la fuente financiera oficial cuando se configura una Admin API Key."
              )}
            </p>
          </div>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-100">
            {L("Refresh costs", "Actualizar costos")}
          </button>
        </div>

        {data.setupRequired ? (
          <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            {L(
              "Run migration 20260903000100_ai_usage_cost_control.sql before using the ledger.",
              "Ejecuta la migración 20260903000100_ai_usage_cost_control.sql antes de usar el ledger."
            )}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric
            label={L("OpenAI billed MTD", "OpenAI facturado MTD")}
            value={actualMtd == null ? "—" : money(actualMtd, 4)}
            note={data.providerCosts.configured ? L("Official Costs API", "Costs API oficial") : L("Set OPENAI_ADMIN_KEY", "Configura OPENAI_ADMIN_KEY")}
            tone="cyan"
          />
          <Metric
            label={L("Ledger estimate MTD", "Estimado ledger MTD")}
            value={money(calculations.estimatedMtd, 4)}
            note={variance == null ? L("Waiting for reconciliation", "Pendiente de conciliación") : `${L("Variance", "Diferencia")}: ${money(variance, 4)}`}
          />
          <Metric
            label={L("Projected API month", "Proyección API del mes")}
            value={money(data.projectedOpenAiMonthUsd)}
            note={`${budgetUse.toFixed(0)}% ${L("of budget", "del budget")}`}
            tone={budgetUse > 90 ? "amber" : "emerald"}
          />
          <Metric
            label={L("Requests MTD", "Requests MTD")}
            value={compact(data.usage?.totals?.requests)}
            note={`${compact(data.usage?.totals?.active_users)} ${L("AI users", "usuarios IA")}`}
          />
          <Metric
            label={L("Tokens MTD", "Tokens MTD")}
            value={compact(data.usage?.totals?.total_tokens)}
            note={`${compact(data.usage?.totals?.cached_input_tokens)} ${L("cached input", "input cacheado")}`}
          />
        </div>

        {!data.providerCosts.configured ? (
          <p className="mt-4 text-xs text-amber-200">
            {L(
              "ChatGPT subscriptions and OpenAI API usage are separate invoices. Add OPENAI_ADMIN_KEY in Vercel to display the API amount that reconciles to OpenAI billing.",
              "Las suscripciones de ChatGPT y el uso de OpenAI API son facturas separadas. Añade OPENAI_ADMIN_KEY en Vercel para mostrar el monto API que concilia con la facturación de OpenAI."
            )}
          </p>
        ) : data.providerCosts.error ? (
          <p className="mt-4 text-xs text-rose-200">{data.providerCosts.error}</p>
        ) : !data.providerCosts.projectScoped ? (
          <p className="mt-4 text-xs text-amber-200">
            {L(
              "This is the full OpenAI organization cost. Set OPENAI_PROJECT_ID to isolate NeuroTrader when the organization runs other products.",
              "Este es el costo completo de la organización OpenAI. Configura OPENAI_PROJECT_ID para aislar NeuroTrader si la organización opera otros productos."
            )}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{L("Cost attribution", "Atribución de costo")}</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-100">{L("By product feature", "Por feature del producto")}</h3>
            </div>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] text-emerald-200">{L("Current month", "Mes actual")}</span>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="pb-3 pr-4">Feature</th>
                  <th className="pb-3 pr-4">{L("Category", "Categoría")}</th>
                  <th className="pb-3 pr-4 text-right">Requests</th>
                  <th className="pb-3 text-right">{L("Cost", "Costo")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.usage?.byFeature ?? []).map((row) => (
                  <tr key={`${row.category}:${row.feature}`} className="border-b border-slate-800/60">
                    <td className="py-3 pr-4 font-medium text-slate-200">{row.feature}</td>
                    <td className="py-3 pr-4">
                      <span className={row.category === "market_intelligence" ? "text-amber-300" : "text-slate-400"}>{row.category}</span>
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-400">{compact(row.requests)}</td>
                    <td className="py-3 text-right font-semibold text-slate-100">{money(row.estimated_cost_usd, 4)}</td>
                  </tr>
                ))}
                {!data.usage?.byFeature?.length ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-500">{L("No tracked calls yet.", "Aún no hay llamadas registradas.")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">{L("Included product AI", "IA incluida en producto")}</p>
              <p className="mt-2 text-lg font-semibold text-slate-50">{money(data.usage?.totals?.base_product_cost_usd, 4)}</p>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300">{L("Market Intelligence excluded", "Market Intelligence excluido")}</p>
              <p className="mt-2 text-lg font-semibold text-slate-50">{money(data.usage?.totals?.market_intelligence_cost_usd, 4)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{L("Model control", "Control por modelo")}</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">{L("Tokens and rate coverage", "Tokens y cobertura de tarifa")}</h3>
          <div className="mt-5 space-y-3">
            {(data.usage?.byModel ?? []).map((row) => (
              <div key={row.model} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-200">{row.model}</p>
                  <p className="font-semibold text-cyan-200">{money(row.estimated_cost_usd, 4)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{compact(row.input_tokens)} in</span>
                  <span>{compact(row.output_tokens)} out</span>
                  <span>{compact(row.requests)} requests</span>
                  <span className={row.pricing_matched ? "text-emerald-300" : "text-rose-300"}>{row.pricing_matched ? L("Rate matched", "Tarifa reconocida") : L("Rate missing", "Falta tarifa")}</span>
                </div>
              </div>
            ))}
            {!data.usage?.byModel?.length ? <p className="text-sm text-slate-500">{L("No model usage yet.", "Aún no hay uso por modelo.")}</p> : null}
          </div>
          {data.providerCosts.lineItems.length ? (
            <div className="mt-6 border-t border-slate-800 pt-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">{L("Official OpenAI line items", "Líneas oficiales de OpenAI")}</p>
              <div className="mt-3 space-y-2">
                {data.providerCosts.lineItems.map((row) => (
                  <div key={row.lineItem} className="flex items-center justify-between gap-4 text-xs">
                    <span className="truncate text-slate-400">{row.lineItem}</span>
                    <span className="font-semibold text-slate-200">{money(row.costUsd, 4)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{L("Subscription attribution", "Atribución por suscripción")}</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">{L("Base-product AI by user plan", "IA del producto base por plan")}</h3>
          <div className="mt-5 space-y-3">
            {(data.usage?.byPlan ?? []).map((row) => (
              <div key={row.plan_tier} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold capitalize text-slate-200">{row.plan_tier}</p>
                  <p className="font-semibold text-emerald-200">{money(row.estimated_cost_usd, 4)}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500">{compact(row.active_users)} {L("users", "usuarios")} · {compact(row.requests)} requests</p>
              </div>
            ))}
            {!data.usage?.byPlan?.length ? <p className="text-sm text-slate-500">{L("No plan usage yet.", "Aún no hay uso por plan.")}</p> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{L("Cost concentration", "Concentración de costo")}</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">{L("Highest-usage customers", "Usuarios con mayor consumo")}</h3>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="pb-3 pr-4">{L("User", "Usuario")}</th>
                  <th className="pb-3 pr-4">Plan</th>
                  <th className="pb-3 pr-4 text-right">Requests</th>
                  <th className="pb-3 pr-4 text-right">Tokens</th>
                  <th className="pb-3 text-right">{L("Estimated", "Estimado")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.usage?.topUsers ?? []).map((row) => (
                  <tr key={row.user_email} className="border-b border-slate-800/60">
                    <td className="py-3 pr-4 text-slate-200">{row.user_email}</td>
                    <td className="py-3 pr-4 capitalize text-slate-400">{row.plan_tier}</td>
                    <td className="py-3 pr-4 text-right text-slate-400">{compact(row.requests)}</td>
                    <td className="py-3 pr-4 text-right text-slate-400">{compact(row.total_tokens)}</td>
                    <td className="py-3 text-right font-semibold text-cyan-200">{money(row.estimated_cost_usd, 4)}</td>
                  </tr>
                ))}
                {!data.usage?.topUsers?.length ? <tr><td colSpan={5} className="py-6 text-center text-slate-500">{L("No customer usage yet.", "Aún no hay consumo por usuario.")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{L("Operating assumptions", "Supuestos operativos")}</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">{L("Monthly cost base", "Base de costos mensuales")}</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">{L("Use real invoice amounts. Annual costs are converted to monthly equivalents.", "Usa los montos reales de las facturas. Los costos anuales se convierten a equivalentes mensuales.")}</p>
          </div>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">
            {saving ? L("Saving…", "Guardando…") : L("Save assumptions", "Guardar supuestos")}
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SETTINGS_FIELDS.map((field) => (
            <label key={field.key} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              <span className="block text-xs font-medium text-slate-300">{isEs ? field.es : field.en}</span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-slate-600">
                {field.cadence === "annual" ? L("USD / year", "USD / año") : field.cadence === "monthly" ? L("USD / month", "USD / mes") : field.cadence === "percent" ? "%" : L("Count", "Cantidad")}
              </span>
              <input
                type="number"
                min="0"
                step={field.cadence === "count" ? "1" : "0.01"}
                value={settings[field.key]}
                onChange={(event) => setSettings((current) => current ? { ...current, [field.key]: Number(event.target.value) } : current)}
                className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-400"
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
          <p className="text-sm text-slate-300">{L("Known fixed monthly overhead", "Overhead fijo mensual conocido")}</p>
          <p className="text-xl font-semibold text-cyan-100">{money(calculations.fixed)}</p>
        </div>
        {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7">
        <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300">{L("200-user business case", "Caso de negocio de 200 usuarios")}</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-100">
          {catalogMatchesRecommendation
            ? L("Approved launch catalog and unit economics", "Catálogo de lanzamiento aprobado y economía unitaria")
            : L("Current price versus recommended launch price", "Precio actual versus precio recomendado de lanzamiento")}
        </h3>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
          {L(
            "This model excludes Market Intelligence and SnapTrade Broker Sync from both value and cost. It reserves the larger of the projected base-product API cost or your AI budget and applies Stripe's standard 2.9% + $0.30 domestic-card fee.",
            "Este modelo excluye Market Intelligence y SnapTrade Broker Sync tanto del valor como del costo. Reserva el mayor entre el costo API proyectado del producto base o tu budget de IA y aplica la tarifa estándar de Stripe de 2.9% + $0.30 para tarjetas domésticas."
          )}
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[10px] uppercase tracking-[0.18em] text-slate-500">
                <th className="pb-3 pr-4">{L("Scenario", "Escenario")}</th>
                <th className="pb-3 pr-4">Core</th>
                <th className="pb-3 pr-4">Advanced</th>
                <th className="pb-3 pr-4 text-right">MRR</th>
                <th className="pb-3 pr-4 text-right">{L("Operating cost", "Costo operativo")}</th>
                <th className="pb-3 pr-4 text-right">{L("Contribution", "Contribución")}</th>
                <th className="pb-3 text-right">{L("Margin", "Margen")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className={catalogMatchesRecommendation ? "" : "border-b border-slate-800/70"}>
                <td className="py-4 pr-4 text-slate-300">
                  {catalogMatchesRecommendation
                    ? L("Approved public catalog", "Catálogo público aprobado")
                    : L("Current catalog", "Catálogo actual")}
                </td>
                <td className="py-4 pr-4">{money(data.publicPrices.core.monthly)} <span className="text-slate-600">× {calculations.current.coreUsers}</span></td>
                <td className="py-4 pr-4">{money(data.publicPrices.advanced.monthly)} <span className="text-slate-600">× {calculations.current.advancedUsers}</span></td>
                <td className="py-4 pr-4 text-right font-semibold">{money(calculations.current.revenue)}</td>
                <td className="py-4 pr-4 text-right text-slate-400">{money(calculations.current.operatingCost)}</td>
                <td className="py-4 pr-4 text-right text-slate-200">{money(calculations.current.contribution)}</td>
                <td className="py-4 text-right">{calculations.current.margin.toFixed(1)}%</td>
              </tr>
              {!catalogMatchesRecommendation ? (
                <tr>
                  <td className="py-4 pr-4 font-semibold text-emerald-200">{L("Recommended launch", "Lanzamiento recomendado")}</td>
                  <td className="py-4 pr-4 font-semibold text-emerald-100">{money(data.recommendedPrices.core.monthly)} <span className="text-slate-600">× {calculations.recommended.coreUsers}</span></td>
                  <td className="py-4 pr-4 font-semibold text-emerald-100">{money(data.recommendedPrices.advanced.monthly)} <span className="text-slate-600">× {calculations.recommended.advancedUsers}</span></td>
                  <td className="py-4 pr-4 text-right font-semibold text-emerald-100">{money(calculations.recommended.revenue)}</td>
                  <td className="py-4 pr-4 text-right text-slate-400">{money(calculations.recommended.operatingCost)}</td>
                  <td className="py-4 pr-4 text-right font-semibold text-emerald-200">{money(calculations.recommended.contribution)}</td>
                  <td className="py-4 text-right font-semibold text-emerald-200">{calculations.recommended.margin.toFixed(1)}%</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-xs font-semibold text-slate-200">{L("Approved annual Core", "Core anual aprobado")}</p>
            <p className="mt-2 text-xl font-semibold text-emerald-200">{money(data.publicPrices.core.annual)}</p>
            <p className="mt-1 text-xs text-slate-500">{L("Two months free equivalent", "Equivalente a dos meses gratis")}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-xs font-semibold text-slate-200">{L("Approved annual Advanced", "Advanced anual aprobado")}</p>
            <p className="mt-2 text-xl font-semibold text-emerald-200">{money(data.publicPrices.advanced.annual)}</p>
            <p className="mt-1 text-xs text-slate-500">{L("Two months free equivalent", "Equivalente a dos meses gratis")}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-xs font-semibold text-slate-200">{L("Conservative AI reserve", "Reserva conservadora de IA")}</p>
            <p className="mt-2 text-xl font-semibold text-cyan-200">{money(calculations.planningAi)}</p>
            <p className="mt-1 text-xs text-slate-500">{L("Base product only", "Solo producto base")}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{L("Planning tokens / day", "Tokens planificados / día")}</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">{compact(calculations.planningTokensDaily)}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{L("Planning tokens / month", "Tokens planificados / mes")}</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">{compact(calculations.planningTokensMonth)}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{L("Typical API model", "Modelo API típico")}</p>
            <p className="mt-2 text-lg font-semibold text-cyan-200">{money(calculations.planningAiTypical)}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{L("Daily deep-review stress", "Stress con deep review diario")}</p>
            <p className="mt-2 text-lg font-semibold text-amber-200">{money(calculations.planningAiStress)}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          {L(
            "Planning envelope assumes every scenario user actively uses Neuro Guide, AI Coach, Notebook AI, and scheduled Growth Plan review. Actual ledger and official OpenAI costs replace this launch assumption as usage data accumulates.",
            "La envolvente asume que cada usuario del escenario usa activamente Neuro Guide, AI Coach, Notebook AI y la revisión programada del Growth Plan. El ledger real y los costos oficiales de OpenAI sustituyen este supuesto al acumularse uso."
          )}
        </p>
      </section>

      <section className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.04] p-6">
        <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300">{L("Costs still to validate", "Costos que faltan validar")}</p>
        <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-3">
          <p>• {L("Transactional email volume and dedicated sending domain", "Volumen de emails y dominio de envío dedicado")}</p>
          <p>• {L("Error monitoring, logs, uptime alerts, and backups", "Monitoreo de errores, logs, uptime y backups")}</p>
          <p>• {L("Accounting, legal review, privacy, and tax compliance", "Contabilidad, revisión legal, privacidad y cumplimiento fiscal")}</p>
          <p>• {L("Customer support time, refunds, and chargebacks", "Tiempo de soporte, reembolsos y contracargos")}</p>
          <p>• {L("Cyber liability and business insurance", "Seguro cyber y responsabilidad comercial")}</p>
          <p>• {L("Supabase/Vercel overages as storage and traffic grow", "Overages de Supabase/Vercel al crecer storage y tráfico")}</p>
        </div>
        <p className="mt-4 text-xs leading-5 text-amber-100/75">
          {L(
            "Apple commission is not included because the current mobile strategy does not sell subscriptions in-app. If that changes, model a 15% or 30% store commission before publishing the new price.",
            "La comisión de Apple no está incluida porque la estrategia móvil actual no vende suscripciones dentro del app. Si eso cambia, modela una comisión de 15% o 30% antes de publicar el nuevo precio."
          )}
        </p>
      </section>
    </div>
  );
}
