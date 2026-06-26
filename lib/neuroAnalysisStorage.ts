import "server-only";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

function cleanTitle(value: unknown) {
  const text = String(value ?? "").trim();
  return text.slice(0, 140) || "Research case";
}

function cleanTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

export async function listNeuroCases(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_cases")
    .select("id,title,status,focus_ticker,research_goal,holdings,readiness,latest_report_id,updated_at,created_at,archived_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getNeuroCase(userId: string, caseId: string) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_cases")
    .select("*")
    .eq("user_id", userId)
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function upsertNeuroCase(input: {
  userId: string;
  caseId?: string | null;
  title?: string | null;
  focusTicker?: string | null;
  researchGoal?: string | null;
  holdings?: unknown;
  selectedAccountId?: string | null;
  brokerSnapshot?: unknown;
  marketData?: unknown;
  readiness?: unknown;
}) {
  const payload = {
    user_id: input.userId,
    title: cleanTitle(input.title || input.focusTicker || "Research case"),
    focus_ticker: cleanTicker(input.focusTicker),
    research_goal: String(input.researchGoal ?? "").slice(0, 4000),
    holdings: input.holdings ?? [],
    selected_account_id: input.selectedAccountId ?? null,
    broker_snapshot: input.brokerSnapshot ?? {},
    market_data: input.marketData ?? {},
    readiness: input.readiness ?? {},
    status: "active",
  };

  if (input.caseId) {
    const { data, error } = await supabaseAdmin
      .from("neuro_analysis_cases")
      .update(payload)
      .eq("id", input.caseId)
      .eq("user_id", input.userId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_cases")
    .insert(payload)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function archiveNeuroCase(userId: string, caseId: string) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_cases")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("user_id", userId)
    .select("id,status,archived_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listNeuroReports(userId: string, caseId?: string | null) {
  let query = supabaseAdmin
    .from("neuro_analysis_reports")
    .select("id,case_id,response_id,model,report_text,structured,engine,assumptions,missing_filings,requires_filings,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (caseId) query = query.eq("case_id", caseId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function insertNeuroReport(input: {
  userId: string;
  caseId?: string | null;
  responseId?: string | null;
  model?: string | null;
  reportText: string;
  structured?: unknown;
  engine?: unknown;
  assumptions?: unknown;
  holdingsSnapshot?: unknown;
  marketDataSnapshot?: unknown;
  filingsUsed?: unknown;
  missingFilings?: unknown;
  vectorStoresUsed?: string[];
  requiresFilings?: boolean;
  usage?: unknown;
}) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_reports")
    .insert({
      user_id: input.userId,
      case_id: input.caseId ?? null,
      response_id: input.responseId ?? null,
      model: input.model ?? null,
      report_text: input.reportText,
      structured: input.structured ?? {},
      engine: input.engine ?? {},
      assumptions: input.assumptions ?? {},
      holdings_snapshot: input.holdingsSnapshot ?? [],
      market_data_snapshot: input.marketDataSnapshot ?? {},
      filings_used: input.filingsUsed ?? [],
      missing_filings: input.missingFilings ?? {},
      vector_stores_used: input.vectorStoresUsed ?? [],
      requires_filings: Boolean(input.requiresFilings),
      usage: input.usage ?? {},
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (data?.id && input.caseId) {
    await supabaseAdmin
      .from("neuro_analysis_cases")
      .update({ latest_report_id: data.id })
      .eq("id", input.caseId)
      .eq("user_id", input.userId);
  }

  return data;
}

export async function insertNeuroSnapshot(input: {
  userId: string;
  caseId?: string | null;
  snapshotType: string;
  payload: unknown;
}) {
  try {
    await supabaseAdmin.from("neuro_analysis_snapshots").insert({
      user_id: input.userId,
      case_id: input.caseId ?? null,
      snapshot_type: input.snapshotType,
      payload: input.payload ?? {},
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[neuro-analysis/snapshot] skipped:", error);
      return;
    }
    throw error;
  }
}
