import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requirePortfolioWriteAccess } from "@/lib/emergencyPortfolioControls";
import {
  DEFAULT_SCREENING_TEMPLATES,
  runDeterministicScreen,
  SCREENING_ENGINE_VERSION,
  type ScreeningCriterion,
  type ScreeningStrategy,
  type ScreeningTemplate,
} from "@/lib/neuroScreeningEngine";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const OPERATORS = new Set(["gte", "lte", "gt", "lt", "between", "positive", "nonnegative"]);

function cleanText(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanTicker(value: unknown) {
  return cleanText(value, 20).toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function customTemplate(value: unknown): ScreeningTemplate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, any>;
  if (!Array.isArray(row.criteria) || row.criteria.length < 1 || row.criteria.length > 30) return null;
  const criteria: ScreeningCriterion[] = [];
  for (const candidate of row.criteria) {
    const operator = cleanText(candidate?.operator, 20);
    const metricKey = cleanText(candidate?.metricKey, 100);
    if (!metricKey || !OPERATORS.has(operator)) return null;
    const valueNumber = finite(candidate?.value);
    const min = finite(candidate?.min);
    const max = finite(candidate?.max);
    if (operator === "between" ? min == null || max == null : !["positive", "nonnegative"].includes(operator) && valueNumber == null) return null;
    criteria.push({
      key: cleanText(candidate?.key, 100) || metricKey,
      label: cleanText(candidate?.label, 160) || metricKey,
      metricKey,
      operator: operator as ScreeningCriterion["operator"],
      value: valueNumber ?? undefined,
      min: min ?? undefined,
      max: max ?? undefined,
      required: candidate?.required !== false,
      rationale: cleanText(candidate?.rationale, 500) || "User-configured deterministic criterion.",
    });
  }
  return {
    key: cleanText(row.key, 100) || "custom",
    name: cleanText(row.name, 160) || "Custom screen",
    strategy: "custom",
    version: Math.max(1, Math.floor(finite(row.version) ?? 1)),
    criteria,
    disclosure: "This screen is deterministic research triage, not an investment recommendation.",
  };
}

async function resolveCompanyIds(tickers: string[]) {
  if (!tickers.length) return [];
  const { data: identifiers, error: identifierError } = await supabaseAdmin
    .from("investment_security_identifiers")
    .select("security_id,identifier_value")
    .eq("identifier_type", "ticker")
    .is("valid_to", null)
    .in("identifier_value", tickers);
  if (identifierError) throw new Error(identifierError.message);
  const securityIds = (identifiers ?? []).map((row) => row.security_id);
  if (!securityIds.length) return [];
  const { data: securities, error: securityError } = await supabaseAdmin
    .from("investment_securities")
    .select("id,company_id")
    .in("id", securityIds);
  if (securityError) throw new Error(securityError.message);
  const companyBySecurity = new Map((securities ?? []).map((row) => [row.id, row.company_id]));
  return (identifiers ?? []).flatMap((row) => {
    const companyId = companyBySecurity.get(row.security_id);
    return companyId ? [{ companyId, ticker: row.identifier_value }] : [];
  });
}

async function loadScreeningInputs(companiesInput: Array<{ companyId: string; ticker: string }>, asOfTimestamp: string) {
  const companyIds = companiesInput.map((row) => row.companyId);
  const [companiesResult, runsResult, securitiesResult] = await Promise.all([
    supabaseAdmin.from("investment_companies").select("id,legal_name,reporting_currency").in("id", companyIds),
    supabaseAdmin
      .from("investment_calculation_runs")
      .select("id,company_id,input_cutoff_timestamp,input_manifest")
      .in("company_id", companyIds)
      .lte("input_cutoff_timestamp", asOfTimestamp)
      .order("input_cutoff_timestamp", { ascending: false })
      .limit(Math.max(100, companyIds.length * 10)),
    supabaseAdmin
      .from("investment_securities")
      .select("id,company_id")
      .in("company_id", companyIds)
      .eq("is_primary", true)
      .eq("status", "active"),
  ]);
  for (const result of [companiesResult, runsResult, securitiesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const selectedRunIds = new Set<string>();
  const selectedRunKeys = new Set<string>();
  const runPreference = new Map<string, number>();
  for (const run of runsResult.data ?? []) {
    const periodType = String((run.input_manifest as any)?.periodType ?? "unknown");
    const key = `${run.company_id}:${periodType}`;
    if (selectedRunKeys.has(key)) continue;
    selectedRunKeys.add(key);
    selectedRunIds.add(run.id);
    runPreference.set(run.id, periodType === "ttm" ? 0 : 1);
  }
  const metricsResult = selectedRunIds.size
    ? await supabaseAdmin
        .from("investment_financial_metrics")
        .select("calculation_run_id,company_id,metric_key,value_numeric,units,period_end_date,calculated_at,trace_sha256")
        .in("calculation_run_id", [...selectedRunIds])
        .limit(Math.max(500, companyIds.length * 100))
    : { data: [], error: null };
  if (metricsResult.error) throw new Error(metricsResult.error.message);

  const securityIds = (securitiesResult.data ?? []).map((security) => security.id);
  const marketResult = securityIds.length
    ? await supabaseAdmin
        .from("investment_market_observations")
        .select("security_id,value_numeric,currency,units,observed_at,available_at,observation_sha256")
        .in("security_id", securityIds)
        .eq("observation_type", "market_cap")
        .lte("available_at", asOfTimestamp)
        .order("available_at", { ascending: false })
        .limit(Math.max(100, companyIds.length * 5))
    : { data: [], error: null };
  if (marketResult.error) throw new Error(marketResult.error.message);

  const companyNames = new Map((companiesResult.data ?? []).map((row) => [row.id, row.legal_name]));
  const companyCurrencies = new Map((companiesResult.data ?? []).map((row) => [row.id, row.reporting_currency]));
  const metricsByCompany = new Map<string, Record<string, number | null>>();
  const tracesByCompany = new Map<string, Record<string, string | null>>();
  const unitsByCompany = new Map<string, Record<string, string>>();
  const orderedMetrics = [...(metricsResult.data ?? [])].sort((left, right) => {
    const preference = (runPreference.get(left.calculation_run_id) ?? 9) - (runPreference.get(right.calculation_run_id) ?? 9);
    if (preference !== 0) return preference;
    return String(right.period_end_date).localeCompare(String(left.period_end_date));
  });
  for (const row of orderedMetrics) {
    const values = metricsByCompany.get(row.company_id) ?? {};
    if (!(row.metric_key in values)) {
      values[row.metric_key] = finite(row.value_numeric);
      metricsByCompany.set(row.company_id, values);
      const units = unitsByCompany.get(row.company_id) ?? {};
      units[row.metric_key] = String(row.units ?? "");
      unitsByCompany.set(row.company_id, units);
      const traces = tracesByCompany.get(row.company_id) ?? {};
      traces[row.metric_key] = row.trace_sha256;
      tracesByCompany.set(row.company_id, traces);
    }
  }

  const companyBySecurity = new Map((securitiesResult.data ?? []).map((row) => [row.id, row.company_id]));
  const marketCapByCompany = new Map<string, any>();
  for (const observation of marketResult.data ?? []) {
    const companyId = companyBySecurity.get(observation.security_id);
    if (companyId && !marketCapByCompany.has(companyId)) marketCapByCompany.set(companyId, observation);
  }
  for (const companyId of companyIds) {
    const metrics = metricsByCompany.get(companyId) ?? {};
    const traces = tracesByCompany.get(companyId) ?? {};
    const marketCap = marketCapByCompany.get(companyId);
    const fcf = metrics.free_cash_flow;
    const marketCapValue = finite(marketCap?.value_numeric);
    const fcfUnits = String(unitsByCompany.get(companyId)?.free_cash_flow ?? "").toUpperCase();
    const marketCurrency = String(marketCap?.currency ?? "").toUpperCase();
    const reportingCurrency = String(companyCurrencies.get(companyId) ?? "").toUpperCase();
    const currenciesMatch = Boolean(marketCurrency) && (fcfUnits === marketCurrency || reportingCurrency === marketCurrency);
    if (fcf != null && marketCapValue != null && marketCapValue > 0 && currenciesMatch) {
      metrics.fcf_yield = fcf / marketCapValue;
      traces.fcf_yield = `fcf-yield:${traces.free_cash_flow ?? "missing"}:${marketCap.observation_sha256}`;
      metricsByCompany.set(companyId, metrics);
      tracesByCompany.set(companyId, traces);
    }
  }
  return companiesInput.map((company) => ({
    companyId: company.companyId,
    ticker: company.ticker,
    companyName: companyNames.get(company.companyId) ?? company.ticker,
    metrics: metricsByCompany.get(company.companyId) ?? {},
    metricTraceIds: tracesByCompany.get(company.companyId) ?? {},
  }));
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireSmartToolsOwner(authUser);
    if (gate) return gate;
    const url = new URL(req.url);
    const runId = cleanText(url.searchParams.get("runId"), 60);
    let query = supabaseAdmin
      .from("investment_screen_runs")
      .select("id,screen_definition_id,as_of_timestamp,universe_snapshot,criteria_snapshot,calculation_version,status,created_at,completed_at")
      .eq("user_id", authUser.userId)
      .order("created_at", { ascending: false })
      .limit(runId ? 1 : 30);
    if (runId) query = query.eq("id", runId);
    const { data: runs, error } = await query;
    if (error) throw new Error(error.message);
    const resultIds = (runs ?? []).map((run) => run.id);
    const { data: results, error: resultError } = resultIds.length
      ? await supabaseAdmin.from("investment_screen_results").select("*").in("screen_run_id", resultIds).order("rank_order", { ascending: true })
      : { data: [], error: null };
    if (resultError) throw new Error(resultError.message);
    return NextResponse.json({ runs: runs ?? [], results: results ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Screen history could not be loaded." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireSmartToolsOwner(authUser);
    if (gate) return gate;
    const writeGate = await requirePortfolioWriteAccess();
    if (writeGate) return writeGate;
    const limiter = await rateLimit(`investment-screens:run:${authUser.userId}`, { limit: 20, windowMs: 60 * 60_000 });
    if (!limiter.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(limiter) });
    const body = await req.json().catch(() => ({}));
    const strategy = cleanText(body?.strategy, 80) as ScreeningStrategy;
    const template = strategy === "custom"
      ? customTemplate(body?.template)
      : DEFAULT_SCREENING_TEMPLATES[strategy as Exclude<ScreeningStrategy, "custom">] ?? DEFAULT_SCREENING_TEMPLATES.value_candidate;
    if (!template) return NextResponse.json({ error: "Custom screening template is invalid." }, { status: 400 });
    const requestedTickers: unknown[] = Array.isArray(body?.tickers) ? body.tickers : [];
    const tickers = Array.from(new Set<string>(requestedTickers.map((value) => cleanTicker(value)).filter(Boolean))).slice(0, 1_000);
    if (!tickers.length) return NextResponse.json({ error: "At least one ingested ticker is required." }, { status: 400 });
    const resolved = await resolveCompanyIds(tickers);
    if (!resolved.length) return NextResponse.json({ error: "No requested companies have canonical investment data yet." }, { status: 409 });
    const asOfTimestamp = new Date().toISOString();
    const screen = runDeterministicScreen({ template, companies: await loadScreeningInputs(resolved, asOfTimestamp) });

    const definitionOwner = template.strategy === "custom" ? authUser.userId : null;
    const { data: definition, error: definitionError } = await supabaseAdmin
      .from("investment_screen_definitions")
      .upsert({
        owner_user_id: definitionOwner,
        key: template.key,
        name: template.name,
        strategy_type: template.strategy,
        version: template.version,
        criteria: template.criteria,
        is_system: template.strategy !== "custom",
      }, { onConflict: "owner_user_id,key,version" })
      .select("id")
      .single();
    if (definitionError) throw new Error(definitionError.message);
    const { data: run, error: runError } = await supabaseAdmin
      .from("investment_screen_runs")
      .insert({
        user_id: authUser.userId,
        screen_definition_id: definition.id,
        as_of_timestamp: asOfTimestamp,
        universe_snapshot: resolved,
        criteria_snapshot: template,
        calculation_version: SCREENING_ENGINE_VERSION,
        status: "complete",
        completed_at: asOfTimestamp,
      })
      .select("id")
      .single();
    if (runError) throw new Error(runError.message);
    const rows = screen.results.map((result, index) => ({
      screen_run_id: run.id,
      company_id: result.companyId,
      passed: result.passed,
      criterion_results: result.criteria,
      data_completeness: { percentage: result.dataCompletenessPct, missingMetrics: result.missingMetrics },
      rank_order: index + 1,
    }));
    const { error: resultError } = await supabaseAdmin.from("investment_screen_results").insert(rows);
    if (resultError) throw new Error(resultError.message);
    const { error: auditError } = await supabaseAdmin.rpc("append_investment_audit_event", {
      p_user_id: authUser.userId,
      p_actor_user_id: authUser.userId,
      p_action: "investment_screen_completed",
      p_entity_type: "investment_screen_run",
      p_entity_id: run.id,
      p_previous_state: null,
      p_new_state: { template, universe: resolved, results: screen.results },
      p_source_data_version: asOfTimestamp,
      p_calculation_version: SCREENING_ENGINE_VERSION,
      p_ai_model_version: null,
      p_approval_state: null,
    });
    if (auditError) throw new Error(auditError.message);
    return NextResponse.json({ runId: run.id, ...screen }, { status: 201, headers: rateLimitHeaders(limiter) });
  } catch (error) {
    console.error("[investment-screens] failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deterministic screen failed." }, { status: 500 });
  }
}
