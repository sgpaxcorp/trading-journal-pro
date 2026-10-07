import "server-only";

import { createHash } from "crypto";

import {
  buildOccOptionSymbol,
  buildOptionFlowOpenInterestIntelligence,
  normalizeOccOptionSymbol,
  normalizeOptionFlowSymbol,
  type OptionFlowContractSnapshot,
  type OptionFlowOpenInterestIntelligence,
  type OptionFlowOiTemporalStatus,
} from "@/lib/optionFlowIntelligence";
import {
  fetchOptionFlowContractMarketSnapshots,
  getOptionFlowMarketDataStatus,
} from "@/lib/optionFlowOptionMarketData";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { recordAiUsage } from "@/lib/aiUsageServer";

const DEFAULT_CONTRACT_LIMIT = 60;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validDateKey(value: unknown): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function validIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function snapshotFingerprint(input: {
  profileId: string;
  contractSymbol: string;
  snapshotKind: string;
  sourceId: string;
  priceSessionDate?: string | null;
  openInterestAsOfDate?: string | null;
  observedAt: string;
  openInterest?: number | null;
  lastPrice?: number | null;
  closePrice?: number | null;
  bid?: number | null;
  ask?: number | null;
  volume?: number | null;
}) {
  return sha256([
    input.profileId,
    input.contractSymbol,
    input.snapshotKind,
    input.sourceId,
    input.priceSessionDate ?? "",
    input.openInterestAsOfDate ?? "",
    input.observedAt,
    input.openInterest ?? "",
    input.lastPrice ?? "",
    input.closePrice ?? "",
    input.bid ?? "",
    input.ask ?? "",
    input.volume ?? "",
  ].join("|"));
}

function mapSnapshotRow(row: any): OptionFlowContractSnapshot {
  return {
    id: row.id,
    contractSymbol: row.contract_symbol,
    underlyingSymbol: row.underlying_symbol,
    expiry: row.expiry ?? null,
    strike: finiteOrNull(row.strike),
    optionType: row.option_type === "C" || row.option_type === "P" ? row.option_type : null,
    snapshotKind: row.snapshot_kind,
    priceSessionDate: row.price_session_date ?? null,
    openInterestAsOfDate: row.open_interest_as_of_date ?? null,
    observedAt: row.observed_at,
    sourceId: row.source_id,
    sourceReference: row.source_reference ?? null,
    openInterest: finiteOrNull(row.open_interest),
    reportedOpenInterestChange: finiteOrNull(row.reported_open_interest_change),
    volume: finiteOrNull(row.volume),
    lastPrice: finiteOrNull(row.last_price),
    closePrice: finiteOrNull(row.close_price),
    bid: finiteOrNull(row.bid),
    ask: finiteOrNull(row.ask),
    midpoint: finiteOrNull(row.midpoint),
    impliedVolatility: finiteOrNull(row.implied_volatility),
    delta: finiteOrNull(row.delta),
    underlyingPrice: finiteOrNull(row.underlying_price),
    oiTemporalStatus: row.oi_temporal_status as OptionFlowOiTemporalStatus,
  };
}

async function persistSnapshots(input: {
  userId: string;
  profileId: string;
  analysisRunId?: string | null;
  snapshots: OptionFlowContractSnapshot[];
  rawPayloads?: Array<Record<string, unknown> | null>;
}) {
  const rows = input.snapshots.map((snapshot, index) => {
    const contractSymbol = normalizeOccOptionSymbol(snapshot.contractSymbol);
    if (!contractSymbol) return null;
    const observedAt = validIso(snapshot.observedAt) ?? new Date().toISOString();
    const snapshotKind = String(snapshot.snapshotKind ?? "on_demand");
    const sourceId = String(snapshot.sourceId || "unknown").slice(0, 80);
    return {
      user_id: input.userId,
      profile_id: input.profileId,
      analysis_run_id: input.analysisRunId ?? null,
      fingerprint: snapshotFingerprint({
        profileId: input.profileId,
        contractSymbol,
        snapshotKind,
        sourceId,
        priceSessionDate: snapshot.priceSessionDate,
        openInterestAsOfDate: snapshot.openInterestAsOfDate,
        observedAt,
        openInterest: snapshot.openInterest,
        lastPrice: snapshot.lastPrice,
        closePrice: snapshot.closePrice,
        bid: snapshot.bid,
        ask: snapshot.ask,
        volume: snapshot.volume,
      }),
      contract_symbol: contractSymbol,
      underlying_symbol: normalizeOptionFlowSymbol(snapshot.underlyingSymbol),
      expiry: validDateKey(snapshot.expiry) ? snapshot.expiry : null,
      strike: finiteOrNull(snapshot.strike),
      option_type: snapshot.optionType === "C" || snapshot.optionType === "P" ? snapshot.optionType : null,
      snapshot_kind: snapshotKind,
      price_session_date: validDateKey(snapshot.priceSessionDate) ? snapshot.priceSessionDate : null,
      open_interest_as_of_date: validDateKey(snapshot.openInterestAsOfDate) ? snapshot.openInterestAsOfDate : null,
      observed_at: observedAt,
      source_id: sourceId,
      source_reference: snapshot.sourceReference ?? null,
      open_interest: finiteOrNull(snapshot.openInterest),
      reported_open_interest_change: finiteOrNull(snapshot.reportedOpenInterestChange),
      volume: finiteOrNull(snapshot.volume),
      last_price: finiteOrNull(snapshot.lastPrice),
      close_price: finiteOrNull(snapshot.closePrice),
      bid: finiteOrNull(snapshot.bid),
      ask: finiteOrNull(snapshot.ask),
      midpoint: finiteOrNull(snapshot.midpoint),
      implied_volatility: finiteOrNull(snapshot.impliedVolatility),
      delta: finiteOrNull(snapshot.delta),
      underlying_price: finiteOrNull(snapshot.underlyingPrice),
      oi_temporal_status: snapshot.oiTemporalStatus,
      provenance: {
        sourceId,
        sourceReference: snapshot.sourceReference ?? null,
        priceSessionDate: snapshot.priceSessionDate ?? null,
        openInterestAsOfDate: snapshot.openInterestAsOfDate ?? null,
        oiTemporalStatus: snapshot.oiTemporalStatus,
      },
      raw_payload: input.rawPayloads?.[index] ?? {},
    };
  }).filter(Boolean);
  if (!rows.length) return [];
  const { data, error } = await supabaseAdmin
    .from("option_flow_contract_snapshots")
    .upsert(rows, { onConflict: "profile_id,fingerprint", ignoreDuplicates: true })
    .select("*");
  if (error) throw error;
  return (data ?? []).map(mapSnapshotRow);
}

export async function persistImportedOptionFlowSnapshots(input: {
  userId: string;
  profileId: string;
  analysisRunId: string;
  symbol: string;
  provider?: string | null;
  sourceSessionDate: string;
  rows: Array<Record<string, any>>;
}) {
  const snapshots: OptionFlowContractSnapshot[] = [];
  const rawPayloads: Array<Record<string, unknown>> = [];
  for (const row of input.rows) {
    const contractSymbol =
      normalizeOccOptionSymbol(row.symbol ?? row.contract) ??
      buildOccOptionSymbol({
        root: row.underlying ?? input.symbol,
        expiry: row.expiry,
        strike: row.strike,
        optionType: row.type,
      });
    if (!contractSymbol) continue;
    const openInterest = finiteOrNull(row.oi ?? row.openInterest);
    const reportedOpenInterestChange = finiteOrNull(row.oiChange ?? row.openInterestChange);
    const bid = finiteOrNull(row.bid);
    const ask = finiteOrNull(row.ask);
    const lastPrice = finiteOrNull(row.tradePrice);
    const volume = finiteOrNull(row.volume);
    if ([openInterest, reportedOpenInterestChange, bid, ask, lastPrice, volume].every((value) => value == null)) continue;
    const sessionDate = validDateKey(row.sourceSessionDate) ? row.sourceSessionDate : input.sourceSessionDate;
    const explicitOiDate = validDateKey(row.oiAsOfDate ?? row.openInterestAsOfDate)
      ? String(row.oiAsOfDate ?? row.openInterestAsOfDate)
      : null;
    snapshots.push({
      contractSymbol,
      underlyingSymbol: input.symbol,
      expiry: validDateKey(row.expiry) ? row.expiry : null,
      strike: finiteOrNull(row.strike),
      optionType: row.type === "C" || row.type === "P" ? row.type : null,
      snapshotKind: "imported_flow",
      priceSessionDate: sessionDate,
      openInterestAsOfDate: explicitOiDate,
      observedAt: validIso(row.timestamp) ?? `${sessionDate}T21:00:00.000Z`,
      sourceId: `import:${String(input.provider ?? "other").slice(0, 50)}`,
      sourceReference: null,
      openInterest,
      reportedOpenInterestChange,
      volume,
      lastPrice,
      bid,
      ask,
      midpoint: bid != null && ask != null ? (bid + ask) / 2 : null,
      impliedVolatility: finiteOrNull(row.iv),
      delta: finiteOrNull(row.delta),
      underlyingPrice: finiteOrNull(row.underlyingPrice),
      oiTemporalStatus: explicitOiDate
        ? "reported_by_source"
        : reportedOpenInterestChange != null
          ? "reported_by_source"
          : "date_not_verified",
    });
    rawPayloads.push(row.raw && typeof row.raw === "object" ? row.raw : row);
  }
  return persistSnapshots({ ...input, snapshots, rawPayloads });
}

export async function loadOptionFlowOpenInterestIntelligence(input: {
  userId: string;
  profileId: string;
  limit?: number;
}): Promise<{
  snapshots: OptionFlowContractSnapshot[];
  intelligence: OptionFlowOpenInterestIntelligence;
}> {
  const { data, error } = await supabaseAdmin
    .from("option_flow_contract_snapshots")
    .select("*")
    .eq("user_id", input.userId)
    .eq("profile_id", input.profileId)
    .order("observed_at", { ascending: false })
    .limit(Math.max(100, Math.min(2_000, input.limit ?? 1_000)));
  if (error) throw error;
  const snapshots = (data ?? []).map(mapSnapshotRow).reverse();
  return { snapshots, intelligence: buildOptionFlowOpenInterestIntelligence(snapshots) };
}

async function trackedContractsForProfile(input: {
  userId: string;
  profileId: string;
  symbol: string;
  asOfDate: string;
  limit: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("option_flow_events")
    .select("contract_symbol,expiry,strike,option_type,source_session_date")
    .eq("user_id", input.userId)
    .eq("profile_id", input.profileId)
    .or(`expiry.is.null,expiry.gte.${input.asOfDate}`)
    .order("source_session_date", { ascending: false })
    .limit(1_000);
  if (error) throw error;
  const unique = new Map<string, { underlying: string; contractSymbol: string }>();
  for (const event of data ?? []) {
    const contractSymbol =
      normalizeOccOptionSymbol(event.contract_symbol) ??
      buildOccOptionSymbol({
        root: input.symbol,
        expiry: event.expiry,
        strike: event.strike,
        optionType: event.option_type,
      });
    if (contractSymbol && !unique.has(contractSymbol)) {
      unique.set(contractSymbol, { underlying: input.symbol, contractSymbol });
    }
    if (unique.size >= input.limit) break;
  }
  return Array.from(unique.values());
}

export async function refreshOptionFlowProfileSnapshots(input: {
  userId: string;
  profileId: string;
  symbol: string;
  snapshotKind: "market_close" | "oi_reconciliation" | "on_demand";
  priceSessionDate: string;
  openInterestAsOfDate: string;
}) {
  const configuredLimit = Number(process.env.OPTIONFLOW_OI_MAX_CONTRACTS ?? DEFAULT_CONTRACT_LIMIT);
  const limit = Number.isFinite(configuredLimit)
    ? Math.max(1, Math.min(200, Math.trunc(configuredLimit)))
    : DEFAULT_CONTRACT_LIMIT;
  const contracts = await trackedContractsForProfile({ ...input, asOfDate: input.priceSessionDate, limit });
  const fetched = await fetchOptionFlowContractMarketSnapshots({
    contracts,
    snapshotKind: input.snapshotKind,
    priceSessionDate: input.priceSessionDate,
    openInterestAsOfDate: input.openInterestAsOfDate,
  });
  const saved = fetched.snapshots.length
    ? await persistSnapshots({ userId: input.userId, profileId: input.profileId, snapshots: fetched.snapshots })
    : [];
  const loaded = await loadOptionFlowOpenInterestIntelligence({ userId: input.userId, profileId: input.profileId });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("option_flow_profiles")
    .select("current_snapshot")
    .eq("id", input.profileId)
    .eq("user_id", input.userId)
    .single();
  if (profileError) throw profileError;
  const currentSnapshot = profile?.current_snapshot && typeof profile.current_snapshot === "object"
    ? profile.current_snapshot
    : {};
  const { error: updateError } = await supabaseAdmin
    .from("option_flow_profiles")
    .update({
      current_snapshot: {
        ...currentSnapshot,
        openInterestIntelligence: loaded.intelligence,
        optionMarketData: {
          ...getOptionFlowMarketDataStatus(),
          lastAttemptAt: new Date().toISOString(),
          lastSnapshotKind: input.snapshotKind,
          contractsRequested: contracts.length,
          snapshotsSaved: saved.length,
          errors: fetched.errors.slice(0, 20),
        },
      },
    })
    .eq("id", input.profileId)
    .eq("user_id", input.userId);
  if (updateError) throw updateError;

  return {
    marketData: getOptionFlowMarketDataStatus(),
    contractsRequested: contracts.length,
    snapshotsSaved: saved.length,
    errors: fetched.errors,
    intelligence: loaded.intelligence,
  };
}

export async function processOptionFlowOpenInterestReconciliation(input: {
  marketDate: string;
  symbol?: string | null;
}) {
  if (!validDateKey(input.marketDate)) throw new Error("A valid market date is required.");
  const marketData = getOptionFlowMarketDataStatus();
  if (!marketData.configured) {
    return {
      marketDate: input.marketDate,
      marketData,
      skipped: true,
      reason: "Automatic options market data is not configured.",
      profilesScanned: 0,
      snapshotsSaved: 0,
      reconciliationsSaved: 0,
      errors: [],
    };
  }

  let profileQuery = supabaseAdmin
    .from("option_flow_profiles")
    .select("id,user_id,symbol,current_snapshot")
    .eq("status", "active")
    .order("updated_at", { ascending: true })
    .limit(500);
  const requestedSymbol = normalizeOptionFlowSymbol(input.symbol);
  if (requestedSymbol) profileQuery = profileQuery.eq("symbol", requestedSymbol);
  const { data: profiles, error: profilesError } = await profileQuery;
  if (profilesError) throw profilesError;

  const result = {
    marketDate: input.marketDate,
    marketData,
    skipped: false,
    profilesScanned: profiles?.length ?? 0,
    snapshotsSaved: 0,
    reconciliationsSaved: 0,
    agentReviewsCompleted: 0,
    agentReviewsSkipped: 0,
    agentReviewsFailed: 0,
    errors: [] as Array<{ profileId: string; symbol: string; message: string }>,
  };
  const configuredAgentLimit = Number(process.env.OPTIONFLOW_OI_AGENT_LIMIT ?? 10);
  const agentLimit = Number.isFinite(configuredAgentLimit)
    ? Math.max(0, Math.min(50, Math.trunc(configuredAgentLimit)))
    : 10;
  const agentsEnabled = String(process.env.OPTIONFLOW_OI_AGENTS ?? "true").toLowerCase() !== "false";
  let agentAttempts = 0;
  for (const profile of profiles ?? []) {
    try {
      const { data: latestBar, error: barError } = await supabaseAdmin
        .from("investment_market_daily_bars")
        .select("session_date")
        .eq("symbol", profile.symbol)
        .lt("session_date", input.marketDate)
        .order("session_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (barError) throw barError;
      const effectiveSessionDate = validDateKey(latestBar?.session_date)
        ? latestBar.session_date
        : null;
      if (!effectiveSessionDate) {
        result.errors.push({ profileId: profile.id, symbol: profile.symbol, message: "No prior verified market session is available." });
        continue;
      }
      const refreshed = await refreshOptionFlowProfileSnapshots({
        userId: profile.user_id,
        profileId: profile.id,
        symbol: profile.symbol,
        snapshotKind: "oi_reconciliation",
        priceSessionDate: effectiveSessionDate,
        openInterestAsOfDate: effectiveSessionDate,
      });
      result.snapshotsSaved += refreshed.snapshotsSaved;
      const { data: latestAnalysis, error: analysisError } = await supabaseAdmin
        .from("option_flow_analysis_runs")
        .select("id,version,language,analysis_mode,horizon,target_date,source_session_date,deterministic_snapshot,agent_output")
        .eq("user_id", profile.user_id)
        .eq("profile_id", profile.id)
        .eq("status", "complete")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (analysisError) throw analysisError;
      let aiInterpretation: Record<string, unknown> = {
        classification: "INSUFFICIENT_EVIDENCE",
        headline: "DATA NOT AVAILABLE",
        currentRead: "No verified cross-session OI comparison is available.",
        whatChanged: [],
        supportingEvidence: [],
        contradictoryEvidence: [],
        uncertainty: ["A prior frozen analysis and comparable verified OI sessions are required."],
        humanReviewAppearsNecessary: false,
      };
      let aiModel: string | null = null;
      let aiTraceId: string | null = null;
      let aiUsage: Record<string, unknown> = {};
      const canRunAgent =
        agentsEnabled &&
        agentAttempts < agentLimit &&
        Boolean(latestAnalysis) &&
        refreshed.intelligence.coverage.contractsWithComparableOpenInterest > 0;
      if (canRunAgent) {
        agentAttempts += 1;
        try {
          const { runOptionFlowOpenInterestReviewAgent } = await import("@/lib/optionFlowAgents");
          const agentResult = await runOptionFlowOpenInterestReviewAgent({
            language: latestAnalysis?.language === "es" ? "es" : "en",
            symbol: profile.symbol,
            openInterestIntelligence: refreshed.intelligence as unknown as Record<string, unknown>,
            latestAnalysis: latestAnalysis
              ? {
                  id: latestAnalysis.id,
                  version: latestAnalysis.version,
                  analysisMode: latestAnalysis.analysis_mode,
                  horizon: latestAnalysis.horizon,
                  targetDate: latestAnalysis.target_date,
                  sourceSessionDate: latestAnalysis.source_session_date,
                  deterministicSnapshot: latestAnalysis.deterministic_snapshot,
                  agentOutput: latestAnalysis.agent_output,
                }
              : null,
          });
          aiInterpretation = agentResult.output;
          aiModel = agentResult.model;
          aiTraceId = agentResult.traceId;
          aiUsage = agentResult.usage;
          result.agentReviewsCompleted += 1;
          await recordAiUsage({
            userId: profile.user_id,
            feature: "option_flow",
            category: "market_intelligence",
            operation: "open_interest_reconciliation",
            model: agentResult.model,
            usage: agentResult.usage,
            apiKind: "responses",
            metadata: { profileId: profile.id, effectiveSessionDate },
          });
        } catch (error) {
          result.agentReviewsFailed += 1;
          aiInterpretation = {
            ...aiInterpretation,
            uncertainty: [
              "The deterministic OI reconciliation completed, but the narrative review was unavailable.",
              error instanceof Error ? error.message : String(error),
            ],
          };
        }
      } else {
        result.agentReviewsSkipped += 1;
      }
      const { error: reconciliationError } = await supabaseAdmin
        .from("option_flow_oi_reconciliations")
        .upsert({
          user_id: profile.user_id,
          profile_id: profile.id,
          effective_session_date: effectiveSessionDate,
          status: refreshed.intelligence.coverage.contractsWithComparableOpenInterest > 0
            ? "complete"
            : "insufficient_data",
          deterministic_summary: refreshed.intelligence,
          ai_interpretation: aiInterpretation,
          ai_model: aiModel,
          ai_trace_id: aiTraceId,
          ai_usage: aiUsage,
          source_manifest: {
            provider: refreshed.marketData.provider,
            contractsRequested: refreshed.contractsRequested,
            snapshotsSaved: refreshed.snapshotsSaved,
            errors: refreshed.errors.slice(0, 20),
          },
          completed_at: new Date().toISOString(),
        }, { onConflict: "profile_id,effective_session_date" });
      if (reconciliationError) throw reconciliationError;
      const { data: currentProfile, error: currentProfileError } = await supabaseAdmin
        .from("option_flow_profiles")
        .select("current_snapshot")
        .eq("id", profile.id)
        .eq("user_id", profile.user_id)
        .single();
      if (currentProfileError) throw currentProfileError;
      const currentSnapshot = currentProfile?.current_snapshot && typeof currentProfile.current_snapshot === "object"
        ? currentProfile.current_snapshot
        : {};
      const { error: profileUpdateError } = await supabaseAdmin
        .from("option_flow_profiles")
        .update({
          current_snapshot: {
            ...currentSnapshot,
            openInterestIntelligence: refreshed.intelligence,
            openInterestThesisUpdate: aiInterpretation,
            latestOpenInterestReconciliation: {
              effectiveSessionDate,
              completedAt: new Date().toISOString(),
              status: refreshed.intelligence.coverage.contractsWithComparableOpenInterest > 0
                ? "complete"
                : "insufficient_data",
            },
          },
        })
        .eq("id", profile.id)
        .eq("user_id", profile.user_id);
      if (profileUpdateError) throw profileUpdateError;
      result.reconciliationsSaved += 1;
    } catch (error) {
      result.errors.push({
        profileId: profile.id,
        symbol: profile.symbol,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
