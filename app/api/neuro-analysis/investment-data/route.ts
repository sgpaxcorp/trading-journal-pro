import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requirePortfolioWriteAccess } from "@/lib/emergencyPortfolioControls";
import { enqueueNeuroJob } from "@/lib/neuroAnalysisJobs";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

function cleanTicker(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 20);
}

function validTimestamp(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

async function resolveCompanyByTicker(ticker: string, asOf: string) {
  const asOfDate = asOf.slice(0, 10);
  const { data: identifiers, error: identifierError } = await supabaseAdmin
    .from("investment_security_identifiers")
    .select("security_id,identifier_value,exchange,valid_from,valid_to")
    .eq("identifier_type", "ticker")
    .eq("identifier_value", ticker)
    .or(`valid_from.is.null,valid_from.lte.${asOfDate}`)
    .or(`valid_to.is.null,valid_to.gte.${asOfDate}`)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (identifierError) throw new Error(identifierError.message);
  if (!identifiers) return null;
  const { data: security, error: securityError } = await supabaseAdmin
    .from("investment_securities")
    .select("id,company_id,security_type,security_name,exchange,currency,status")
    .eq("id", identifiers.security_id)
    .maybeSingle();
  if (securityError) throw new Error(securityError.message);
  if (!security) return null;
  const { data: company, error: companyError } = await supabaseAdmin
    .from("investment_companies")
    .select("id,cik,legal_name,sector,industry,country_code,reporting_currency,fiscal_year_end,sic_code,status,ipo_date,delisting_date")
    .eq("id", security.company_id)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  return company ? { company, security, identifier: identifiers } : null;
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireSmartToolsOwner(authUser);
    if (gate) return gate;

    const limiter = await rateLimit(`investment-data:read:${authUser.userId}`, { limit: 30, windowMs: 60_000 });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1_000))), ...rateLimitHeaders(limiter) } }
      );
    }

    const url = new URL(req.url);
    const ticker = cleanTicker(url.searchParams.get("ticker"));
    const asOf = validTimestamp(url.searchParams.get("asOf")) ?? new Date().toISOString();
    if (!ticker) return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    const identity = await resolveCompanyByTicker(ticker, asOf);
    if (!identity) {
      return NextResponse.json({ ticker, asOf, status: "not_ingested", refreshRequired: true }, { headers: rateLimitHeaders(limiter) });
    }

    const [filingsResult, factsResult, calculationRunsResult, changesResult] = await Promise.all([
      supabaseAdmin
        .from("investment_sec_filings")
        .select("id,accession_number,form,filing_date,accepted_at,public_at,period_end_date,source_url,is_amendment")
        .eq("company_id", identity.company.id)
        .lte("public_at", asOf)
        .order("public_at", { ascending: false })
        .limit(100),
      supabaseAdmin.rpc("investment_facts_as_of", { p_company_id: identity.company.id, p_as_of_timestamp: asOf }).limit(1_500),
      supabaseAdmin
        .from("investment_calculation_runs")
        .select("id,calculation_version,as_of_timestamp,input_cutoff_timestamp,status,input_manifest,created_at")
        .eq("company_id", identity.company.id)
        .lte("input_cutoff_timestamp", asOf)
        .order("input_cutoff_timestamp", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("investment_material_change_events")
        .select("event_type,materiality,detected_value,threshold_snapshot,detected_at,available_at,event_sha256")
        .eq("company_id", identity.company.id)
        .lte("available_at", asOf)
        .order("available_at", { ascending: false })
        .limit(50),
    ]);
    for (const result of [filingsResult, factsResult, calculationRunsResult, changesResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const calculationRunIds = (calculationRunsResult.data ?? []).map((run) => run.id);
    const metricsResult = calculationRunIds.length
      ? await supabaseAdmin
          .from("investment_financial_metrics")
          .select("calculation_run_id,metric_key,value_numeric,units,period_end_date,formula,formula_version,inputs,calculated_at,unavailable_reason,trace_sha256")
          .in("calculation_run_id", calculationRunIds)
          .order("period_end_date", { ascending: false })
          .limit(500)
      : { data: [], error: null };
    if (metricsResult.error) throw new Error(metricsResult.error.message);

    const facts = factsResult.data ?? [];
    const completeness = {
      normalizedFacts: facts.length,
      canonicalConcepts: new Set(facts.map((fact: any) => fact.canonical_concept)).size,
      earliestPeriodEnd: facts.map((fact: any) => fact.period_end_date).filter(Boolean).sort()[0] ?? null,
      latestPeriodEnd: facts.map((fact: any) => fact.period_end_date).filter(Boolean).sort().at(-1) ?? null,
    };
    return NextResponse.json({
      status: "ready",
      ticker,
      asOf,
      pointInTimeEnforced: true,
      identity,
      completeness,
      filings: filingsResult.data ?? [],
      facts,
      calculationRuns: calculationRunsResult.data ?? [],
      metrics: metricsResult.data ?? [],
      materialChanges: changesResult.data ?? [],
      dataPolicy: {
        missingValues: "DATA NOT AVAILABLE",
        calculationsAreDeterministic: true,
        aiIsNotAuthoritative: true,
      },
    }, { headers: rateLimitHeaders(limiter) });
  } catch (error) {
    console.error("[investment-data] GET failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Investment data lookup failed." }, { status: 500 });
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

    const limiter = await rateLimit(`investment-data:refresh:${authUser.userId}`, { limit: 10, windowMs: 60 * 60_000 });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1_000))), ...rateLimitHeaders(limiter) } }
      );
    }
    const quota = await checkNeuroQuota(authUser.userId, "market_data");
    if (!quota.allowed) return NextResponse.json({ error: "Monthly data refresh quota exceeded.", quota }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const ticker = cleanTicker(body?.ticker);
    const asOfTimestamp = validTimestamp(body?.asOfTimestamp) ?? new Date().toISOString();
    if (!ticker) return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    const hourBucket = asOfTimestamp.slice(0, 13);
    const job = await enqueueNeuroJob({
      userId: authUser.userId,
      jobType: "investment_data_refresh",
      payload: { ticker, asOfTimestamp },
      dedupeKey: `investment-data-refresh:${ticker}:${hourBucket}`,
    });
    await recordNeuroUsage({ userId: authUser.userId, eventType: "market_data", metadata: { operation: "investment_data_refresh", ticker } });
    return NextResponse.json({ status: "queued", ticker, job, quota: { remaining: quota.remaining, limit: quota.limit } }, { status: 202, headers: rateLimitHeaders(limiter) });
  } catch (error: any) {
    if (error?.code === "23505" || String(error?.message ?? "").includes("dedupe")) {
      return NextResponse.json({ status: "already_queued" }, { status: 202 });
    }
    console.error("[investment-data] POST failed:", error);
    return NextResponse.json({ error: error?.message || "Investment data refresh could not be queued." }, { status: 500 });
  }
}
