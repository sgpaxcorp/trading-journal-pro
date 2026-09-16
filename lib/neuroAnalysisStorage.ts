import "server-only";

import type { CommitteeDecision, InvestmentCommitteePacket, CommitteeSource } from "@/lib/neuroInvestmentCommittee";
import type {
  InvestmentThesisReview,
  OriginalInvestmentThesisPayload,
  OriginalInvestmentThesisRecord,
} from "@/lib/neuroInvestmentThesis";
import type { PositionExitReview } from "@/lib/neuroPositionExitReview";
import { normalizeNeuroInvestmentPolicy, type NeuroDecisionState, type NeuroInvestmentPolicy } from "@/lib/neuroInvestmentGovernance";
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

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanDecisionState(value: unknown): NeuroDecisionState {
  const state = String(value ?? "").trim();
  if (
    state === "investigate" ||
    state === "observe" ||
    state === "propose" ||
    state === "reject" ||
    state === "insufficient_information"
  ) {
    return state;
  }
  return "investigate";
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
  if (input.caseId) {
    const originalThesis = await getOriginalInvestmentThesisRecord(input.userId, input.caseId);
    if (originalThesis && cleanTicker(input.focusTicker) !== cleanTicker(originalThesis.ticker)) {
      throw new Error(
        "This case has a permanent original thesis. Its focus ticker cannot be changed; create a new research case."
      );
    }
  }
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
    .select("id,case_id,response_id,model,report_text,structured,engine,assumptions,filings_used,missing_filings,vector_stores_used,requires_filings,created_at")
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

export async function listNeuroSnapshots(input: {
  userId: string;
  caseId?: string | null;
  snapshotTypes?: string[];
  limit?: number;
}) {
  let query = supabaseAdmin
    .from("neuro_analysis_snapshots")
    .select("id,case_id,snapshot_type,payload,created_at")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 100));

  if (input.caseId) query = query.eq("case_id", input.caseId);
  else query = query.is("case_id", null);

  if (input.snapshotTypes?.length) {
    query = query.in("snapshot_type", input.snapshotTypes);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getLatestNeuroInvestmentPolicy(userId: string): Promise<NeuroInvestmentPolicy | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("neuro_analysis_policies")
      .select("*")
      .eq("user_id", userId)
      .order("version", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeNeuroInvestmentPolicy(data) : null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[neuro-analysis/policy] load skipped:", error);
      return null;
    }
    throw error;
  }
}

async function nextPolicyVersion(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_policies")
    .select("version")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.version ?? 0) + 1;
}

export async function insertNeuroInvestmentPolicy(input: {
  userId: string;
  policy: NeuroInvestmentPolicy;
  approve?: boolean;
}) {
  const version = await nextPolicyVersion(input.userId);
  const status = input.approve ? "active" : "draft";
  if (status === "active") {
    await supabaseAdmin
      .from("neuro_analysis_policies")
      .update({ status: "retired", retired_at: new Date().toISOString() })
      .eq("user_id", input.userId)
      .eq("status", "active");
  }

  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_policies")
    .insert({
      user_id: input.userId,
      version,
      status,
      universe: cleanText(input.policy.universe, 800),
      strategy: cleanText(input.policy.strategy, 1200),
      horizon_years: input.policy.horizonYears,
      base_currency: cleanText(input.policy.baseCurrency || "USD", 12).toUpperCase(),
      benchmark: cleanText(input.policy.benchmark, 24).toUpperCase(),
      restrictions: input.policy.restrictions ?? [],
      liquidity_needs: cleanText(input.policy.liquidityNeeds, 1200),
      limits: input.policy.limits ?? {},
      approved_at: status === "active" ? new Date().toISOString() : null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeNeuroInvestmentPolicy(data) : null;
}

export async function listNeuroInvestmentDecisions(input: {
  userId: string;
  caseId?: string | null;
  limit?: number;
}) {
  let query = supabaseAdmin
    .from("neuro_analysis_decisions")
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 100));
  if (input.caseId) query = query.eq("case_id", input.caseId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function insertNeuroInvestmentDecision(input: {
  userId: string;
  caseId: string;
  reportId?: string | null;
  policyId?: string | null;
  ticker?: string | null;
  decisionState: NeuroDecisionState;
  suggestedState?: NeuroDecisionState | null;
  decisionNote?: string | null;
  rationale?: string | null;
  evidenceSnapshot?: unknown;
  proposalSnapshot?: unknown;
  policySnapshot?: unknown;
  immutableHash?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_decisions")
    .insert({
      user_id: input.userId,
      case_id: input.caseId,
      report_id: input.reportId ?? null,
      policy_id: input.policyId ?? null,
      ticker: cleanTicker(input.ticker),
      decision_state: cleanDecisionState(input.decisionState),
      suggested_state: input.suggestedState ? cleanDecisionState(input.suggestedState) : null,
      decision_note: cleanText(input.decisionNote, 4000),
      rationale: cleanText(input.rationale, 4000),
      evidence_snapshot: input.evidenceSnapshot ?? {},
      proposal_snapshot: input.proposalSnapshot ?? {},
      policy_snapshot: input.policySnapshot ?? {},
      immutable_hash: input.immutableHash ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listInvestmentCommitteePackets(input: {
  userId: string;
  caseId?: string | null;
  limit?: number;
}) {
  let query = supabaseAdmin
    .from("neuro_analysis_committee_packets")
    .select("*")
    .eq("user_id", input.userId)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 100));
  if (input.caseId) query = query.eq("case_id", input.caseId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getInvestmentCommitteePacket(userId: string, packetId: string) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_committee_packets")
    .select("*")
    .eq("id", packetId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function nextInvestmentCommitteePacketVersion(input: {
  userId: string;
  caseId: string;
  ticker: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_committee_packets")
    .select("version")
    .eq("user_id", input.userId)
    .eq("case_id", input.caseId)
    .eq("ticker", cleanTicker(input.ticker))
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.version ?? 0) + 1;
}

export async function insertInvestmentCommitteePacket(input: {
  userId: string;
  caseId: string;
  reportId?: string | null;
  policyId?: string | null;
  ticker: string;
  version: number;
  packet: InvestmentCommitteePacket;
  sources: CommitteeSource[];
  reportSnapshot: unknown;
  engineSnapshot: unknown;
  policySnapshot: unknown;
  evidenceSnapshot: unknown;
  contentHash: string;
  generatedBy: "ai_research" | "deterministic_fallback";
}) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_committee_packets")
    .insert({
      user_id: input.userId,
      case_id: input.caseId,
      report_id: input.reportId ?? null,
      policy_id: input.policyId ?? null,
      ticker: cleanTicker(input.ticker),
      version: input.version,
      generation_status: input.packet.completeness.isComplete ? "ready" : "incomplete",
      packet: input.packet,
      source_manifest: input.sources,
      report_snapshot: input.reportSnapshot ?? {},
      engine_snapshot: input.engineSnapshot ?? {},
      policy_snapshot: input.policySnapshot ?? {},
      evidence_snapshot: input.evidenceSnapshot ?? {},
      content_hash: input.contentHash,
      generated_by: input.generatedBy,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listInvestmentCommitteeDecisions(input: {
  userId: string;
  caseId?: string | null;
  limit?: number;
}) {
  let query = supabaseAdmin
    .from("neuro_analysis_committee_decisions")
    .select("*")
    .eq("user_id", input.userId)
    .order("decided_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 100));
  if (input.caseId) query = query.eq("case_id", input.caseId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getInvestmentCommitteeDecision(userId: string, decisionId: string) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_committee_decisions")
    .select("*")
    .eq("id", decisionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function insertInvestmentCommitteeDecision(input: {
  userId: string;
  userEmail?: string | null;
  caseId: string;
  packetId: string;
  packetVersion: number;
  ticker: string;
  decision: CommitteeDecision;
  rationale: string;
  conditions?: string | null;
  authorizationBasis?: "case_owner" | "committee_member" | "administrator";
  packetSnapshot: unknown;
  sourceManifestSnapshot: unknown;
  reviewedPacketHash: string;
  decisionHash: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_committee_decisions")
    .insert({
      user_id: input.userId,
      case_id: input.caseId,
      packet_id: input.packetId,
      packet_version: input.packetVersion,
      ticker: cleanTicker(input.ticker),
      decision: input.decision,
      rationale: cleanText(input.rationale, 8_000),
      conditions: cleanText(input.conditions, 8_000),
      decision_maker_user_id: input.userId,
      decision_maker_email: cleanText(input.userEmail, 320).toLowerCase() || null,
      authorization_basis: input.authorizationBasis ?? "case_owner",
      packet_snapshot: input.packetSnapshot ?? {},
      source_manifest_snapshot: input.sourceManifestSnapshot ?? [],
      reviewed_packet_hash: input.reviewedPacketHash,
      decision_hash: input.decisionHash,
      portfolio_eligible: input.decision === "APPROVED",
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getOriginalInvestmentThesisRecord(
  userId: string,
  caseId: string
): Promise<OriginalInvestmentThesisRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_original_theses")
    .select("*")
    .eq("user_id", userId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OriginalInvestmentThesisRecord | null) ?? null;
}

export async function insertOriginalInvestmentThesisRecord(input: {
  userId: string;
  caseId: string;
  committeeDecisionId: string;
  committeePacketId: string;
  payload: OriginalInvestmentThesisPayload;
  contentHash: string;
}): Promise<OriginalInvestmentThesisRecord | null> {
  const { payload } = input;
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_original_theses")
    .insert({
      user_id: input.userId,
      case_id: input.caseId,
      ticker: cleanTicker(payload.ticker),
      committee_decision_id: input.committeeDecisionId,
      committee_packet_id: input.committeePacketId,
      purchase_date: payload.purchaseDate,
      purchase_price: payload.purchasePrice,
      portfolio_weight_pct: payload.portfolioWeightPct,
      investment_thesis: payload.investmentThesis,
      valuation_assumptions: payload.valuationAssumptions,
      expected_business_developments: payload.expectedBusinessDevelopments,
      major_risks: payload.majorRisks,
      expected_catalysts: payload.expectedCatalysts,
      key_metrics_to_monitor: payload.keyMetricsToMonitor,
      invalidation_conditions: payload.conditionsThatInvalidateTheThesis,
      supporting_documents: payload.supportingDocuments,
      committee_decision_snapshot: payload.investmentCommitteeDecision,
      committee_packet_snapshot: payload.investmentCommitteePacket,
      content_hash: input.contentHash,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OriginalInvestmentThesisRecord | null) ?? null;
}

export async function listInvestmentThesisReviews(input: {
  userId: string;
  caseId?: string | null;
  originalThesisId?: string | null;
  limit?: number;
}) {
  let query = supabaseAdmin
    .from("neuro_analysis_thesis_reviews")
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 100));
  if (input.caseId) query = query.eq("case_id", input.caseId);
  if (input.originalThesisId) query = query.eq("original_thesis_id", input.originalThesisId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function insertInvestmentThesisReview(input: {
  userId: string;
  caseId: string;
  originalThesisId: string;
  reportId?: string | null;
  review: InvestmentThesisReview;
  comparisonSnapshot: unknown;
  contentHash: string;
}) {
  const { review } = input;
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_thesis_reviews")
    .insert({
      user_id: input.userId,
      case_id: input.caseId,
      original_thesis_id: input.originalThesisId,
      report_id: input.reportId ?? null,
      ticker: cleanTicker(review.ticker),
      classification: review.classification,
      summary: cleanText(review.summary, 8_000),
      changes: review.changes,
      classification_evidence: review.classificationEvidence,
      missing_evidence: review.missingEvidence,
      comparison_snapshot: input.comparisonSnapshot ?? {},
      generated_by: review.generatedBy,
      content_hash: input.contentHash,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listPositionExitReviews(input: {
  userId: string;
  caseId?: string | null;
  originalThesisId?: string | null;
  limit?: number;
}) {
  let query = supabaseAdmin
    .from("neuro_analysis_position_exit_reviews")
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 100));
  if (input.caseId) query = query.eq("case_id", input.caseId);
  if (input.originalThesisId) query = query.eq("original_thesis_id", input.originalThesisId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function insertPositionExitReview(input: {
  userId: string;
  caseId: string;
  originalThesisId: string;
  reportId?: string | null;
  review: PositionExitReview;
  comparisonSnapshot: unknown;
  contentHash: string;
}) {
  const { review } = input;
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_position_exit_reviews")
    .insert({
      user_id: input.userId,
      case_id: input.caseId,
      original_thesis_id: input.originalThesisId,
      report_id: input.reportId ?? null,
      ticker: cleanTicker(review.ticker),
      review_status: review.status,
      primary_reason: review.primaryReason,
      secondary_reasons: review.secondaryReasons,
      summary: cleanText(review.summary, 8_000),
      what_changed: review.whatChanged,
      comparisons: review.comparisons,
      classification_evidence: review.classificationEvidence,
      missing_evidence: review.missingEvidence,
      price_movement_assessment: review.priceMovementAssessment,
      comparison_snapshot: input.comparisonSnapshot ?? {},
      generated_by: review.generatedBy,
      content_hash: input.contentHash,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
