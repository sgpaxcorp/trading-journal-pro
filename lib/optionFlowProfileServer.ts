import "server-only";

import { createHash } from "crypto";

import {
  classifyOptionFlowCheckpoint,
  computeOptionFlowTrend,
  detectOptionFlowMaterialChange,
  normalizeOptionFlowSymbol,
  optionFlowTargetDate,
  type OptionFlowAnalysisMode,
  type OptionFlowDailyBar,
  type OptionFlowHorizon,
} from "@/lib/optionFlowIntelligence";
import {
  fetchOptionFlowDailyBars,
  type OptionFlowDailyMarketBar,
} from "@/lib/optionFlowMarketData";
import {
  loadOptionFlowOpenInterestIntelligence,
  persistImportedOptionFlowSnapshots,
  refreshOptionFlowProfileSnapshots,
} from "@/lib/optionFlowOpenInterestServer";
import { getOptionFlowMarketDataStatus } from "@/lib/optionFlowOptionMarketData";
import { recordAiUsage } from "@/lib/aiUsageServer";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type PersistedSourceFile = {
  name?: string | null;
  size?: number | null;
  mimeType?: string | null;
  sha256?: string | null;
};

export type PersistOptionFlowAnalysisInput = {
  userId: string;
  symbol: string;
  provider?: string | null;
  language: "en" | "es";
  analysisMode: OptionFlowAnalysisMode;
  horizon: OptionFlowHorizon;
  customTargetDate?: string | null;
  sourceSessionDate: string;
  analystNotes?: string | null;
  normalizedRows: Array<Record<string, any>>;
  marketBars?: OptionFlowDailyMarketBar[];
  screenshotDataUrls?: string[];
  sourceFile?: PersistedSourceFile | null;
  deterministicSnapshot: Record<string, unknown>;
  agentOutput: Record<string, unknown>;
  dataQuality: Record<string, unknown>;
  model?: string | null;
  agentUsage?: Record<string, unknown> | null;
  traceId?: string | null;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function validDateKey(value: unknown): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown, max = 500): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function sourceTypeForFile(file?: PersistedSourceFile | null): "csv" | "xlsx" | "manual" {
  const name = String(file?.name ?? "").toLowerCase();
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".xlsx")) return "xlsx";
  return "manual";
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function decodeImageDataUrl(value: string): { mime: string; buffer: Buffer } | null {
  const match = value.match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) return null;
  return { mime: match[1].toLowerCase(), buffer };
}

export function optionFlowEventFingerprint(symbol: string, sessionDate: string, row: Record<string, any>): string {
  const raw = [
    symbol,
    sessionDate,
    row.symbol ?? row.contract ?? "",
    row.expiry ?? "",
    row.strike ?? "",
    row.type ?? "",
    row.side ?? "UNKNOWN",
    row.size ?? "",
    row.premium ?? "",
    row.tradePrice ?? "",
    row.time ?? row.timestamp ?? "",
  ]
    .map((value) => String(value ?? "").trim().toUpperCase())
    .join("|");
  return sha256(raw);
}

function mapDailyBar(row: any): OptionFlowDailyBar {
  return {
    id: row.id,
    symbol: row.symbol,
    sessionDate: row.session_date,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    adjustedClose: finiteOrNull(row.adjusted_close),
    volume: finiteOrNull(row.volume),
    currency: row.currency ?? null,
    availableAt: row.available_at ?? null,
    sourceId: row.source_id ?? null,
    sourceReference: row.source_reference ?? null,
  };
}

async function nextAnalysisVersion(profileId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("option_flow_analysis_runs")
    .select("version")
    .eq("profile_id", profileId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.version ?? 0) + 1;
}

async function saveScreenshotSources(input: {
  userId: string;
  profileId: string;
  runId: string;
  provider?: string | null;
  sourceSessionDate: string;
  screenshots: string[];
}): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < input.screenshots.length; index += 1) {
    const decoded = decodeImageDataUrl(input.screenshots[index]);
    if (!decoded) continue;
    const digest = sha256(decoded.buffer);
    const extension = extensionForMime(decoded.mime);
    const storagePath = `${input.userId}/${input.profileId}/${input.runId}/screenshot-${index + 1}-${digest.slice(0, 12)}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("option_flow_sources")
      .upload(storagePath, decoded.buffer, {
        contentType: decoded.mime,
        upsert: false,
      });
    if (uploadError && !/already exists/i.test(uploadError.message)) throw uploadError;
    rows.push({
      user_id: input.userId,
      profile_id: input.profileId,
      analysis_run_id: input.runId,
      source_type: "screenshot",
      provider: input.provider ?? null,
      file_name: `screenshot-${index + 1}.${extension}`,
      storage_path: storagePath,
      content_sha256: digest,
      source_session_date: input.sourceSessionDate,
      row_count: 0,
      metadata: { mimeType: decoded.mime, byteSize: decoded.buffer.length },
    });
  }
  return rows;
}

export async function persistOptionFlowAnalysis(input: PersistOptionFlowAnalysisInput) {
  const symbol = normalizeOptionFlowSymbol(input.symbol);
  if (!symbol) throw new Error("A valid symbol is required to persist an Option Flow profile.");
  if (!validDateKey(input.sourceSessionDate)) throw new Error("A valid source session date is required.");

  const now = new Date().toISOString();
  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from("option_flow_profiles")
    .select("*")
    .eq("user_id", input.userId)
    .eq("symbol", symbol)
    .maybeSingle();
  if (existingProfileError) throw existingProfileError;
  const profileWrite = existingProfile
    ? supabaseAdmin
        .from("option_flow_profiles")
        .update({
          status: "active",
          last_analysis_at: now,
          last_flow_session_date: input.sourceSessionDate,
          updated_at: now,
        })
        .eq("id", existingProfile.id)
        .select("*")
        .single()
    : supabaseAdmin
        .from("option_flow_profiles")
        .insert({
          user_id: input.userId,
          symbol,
          status: "active",
          first_analysis_at: now,
          last_analysis_at: now,
          last_flow_session_date: input.sourceSessionDate,
        })
        .select("*")
        .single();
  const { data: profile, error: profileError } = await profileWrite;
  if (profileError) throw profileError;

  const version = await nextAnalysisVersion(profile.id);
  const targetDate = optionFlowTargetDate({
    sourceSessionDate: input.sourceSessionDate,
    horizon: input.horizon,
    customTargetDate: input.customTargetDate,
  });
  const { data: analysis, error: analysisError } = await supabaseAdmin
    .from("option_flow_analysis_runs")
    .insert({
      user_id: input.userId,
      profile_id: profile.id,
      version,
      analysis_mode: input.analysisMode,
      horizon: input.horizon,
      target_date: targetDate,
      source_session_date: input.sourceSessionDate,
      provider: input.provider ?? null,
      status: "complete",
      language: input.language,
      analyst_notes: cleanText(input.analystNotes, 3000),
      source_snapshot: {
        rowCount: input.normalizedRows.length,
        screenshotCount: input.screenshotDataUrls?.length ?? 0,
        sourceFile: input.sourceFile ?? null,
        evidenceCoverage: {
          startDate: input.dataQuality.evidencePeriodStart ?? null,
          endDate: input.dataQuality.evidencePeriodEnd ?? input.sourceSessionDate,
          sessionCount: input.dataQuality.evidenceSessionCount ?? null,
        },
        evidenceDelta: {
          newUniqueRows: input.dataQuality.newUniqueRows ?? null,
          repeatedRows: input.dataQuality.repeatedRows ?? null,
          exactDuplicateFile: input.dataQuality.exactDuplicateFile ?? false,
        },
      },
      deterministic_snapshot: input.deterministicSnapshot,
      agent_output: input.agentOutput,
      data_quality: input.dataQuality,
      input_cutoff_at: now,
      completed_at: now,
    })
    .select("*")
    .single();
  if (analysisError) throw analysisError;

  const sourceRows: Array<Record<string, unknown>> = [];
  if (input.sourceFile) {
    sourceRows.push({
      user_id: input.userId,
      profile_id: profile.id,
      analysis_run_id: analysis.id,
      source_type: sourceTypeForFile(input.sourceFile),
      provider: input.provider ?? null,
      file_name: cleanText(input.sourceFile.name, 255),
      content_sha256: cleanText(input.sourceFile.sha256, 64),
      source_session_date: input.sourceSessionDate,
      row_count: input.normalizedRows.length,
      metadata: {
        byteSize: finiteOrNull(input.sourceFile.size),
        mimeType: cleanText(input.sourceFile.mimeType, 120),
        evidencePeriodStart: input.dataQuality.evidencePeriodStart ?? null,
        evidencePeriodEnd: input.dataQuality.evidencePeriodEnd ?? input.sourceSessionDate,
        newUniqueRows: input.dataQuality.newUniqueRows ?? null,
        repeatedRows: input.dataQuality.repeatedRows ?? null,
        exactDuplicateFile: input.dataQuality.exactDuplicateFile ?? false,
      },
    });
  }
  sourceRows.push(
    ...(await saveScreenshotSources({
      userId: input.userId,
      profileId: profile.id,
      runId: analysis.id,
      provider: input.provider,
      sourceSessionDate: input.sourceSessionDate,
      screenshots: input.screenshotDataUrls ?? [],
    }))
  );
  if (!sourceRows.length) {
    sourceRows.push({
      user_id: input.userId,
      profile_id: profile.id,
      analysis_run_id: analysis.id,
      source_type: "manual",
      provider: input.provider ?? null,
      source_session_date: input.sourceSessionDate,
      row_count: input.normalizedRows.length,
      metadata: {},
    });
  }

  const { data: savedSources, error: sourceError } = await supabaseAdmin
    .from("option_flow_sources")
    .insert(sourceRows)
    .select("id,source_type,file_name,storage_path,content_sha256");
  if (sourceError) throw sourceError;
  const sourceId = savedSources?.[0]?.id ?? null;

  const eventRows = input.normalizedRows
    .map((row) => {
      const sessionDate = validDateKey(row.sourceSessionDate)
        ? row.sourceSessionDate
        : input.sourceSessionDate;
      const optionType = String(row.type ?? "").toUpperCase();
      const side = ["ASK", "BID", "MIXED", "UNKNOWN"].includes(String(row.side ?? "").toUpperCase())
        ? String(row.side).toUpperCase()
        : "UNKNOWN";
      return {
        user_id: input.userId,
        profile_id: profile.id,
        analysis_run_id: analysis.id,
        source_id: sourceId,
        fingerprint: optionFlowEventFingerprint(symbol, sessionDate, row),
        source_session_date: sessionDate,
        occurred_at: cleanText(row.timestamp, 80),
        contract_symbol: cleanText(row.symbol ?? row.contract, 120),
        expiry: validDateKey(row.expiry) ? row.expiry : null,
        strike: finiteOrNull(row.strike),
        option_type: optionType === "C" || optionType === "P" ? optionType : null,
        aggressor_side: side,
        underlying_price: finiteOrNull(row.underlyingPrice),
        observed_contract_price: finiteOrNull(row.tradePrice),
        bid: finiteOrNull(row.bid),
        ask: finiteOrNull(row.ask),
        size: finiteOrNull(row.size),
        premium: finiteOrNull(row.premium),
        volume: finiteOrNull(row.volume),
        open_interest: finiteOrNull(row.oi ?? row.openInterest),
        open_interest_change: finiteOrNull(row.oiChange ?? row.openInterestChange),
        implied_volatility: finiteOrNull(row.iv),
        delta: finiteOrNull(row.delta),
        opening_closing_status: "not_verified",
        raw_payload: row.raw && typeof row.raw === "object" ? row.raw : row,
      };
    })
    .slice(0, 2_000);
  if (eventRows.length) {
    const { error: eventsError } = await supabaseAdmin
      .from("option_flow_events")
      .upsert(eventRows, { onConflict: "profile_id,fingerprint", ignoreDuplicates: true });
    if (eventsError) throw eventsError;
  }

  await persistImportedOptionFlowSnapshots({
    userId: input.userId,
    profileId: profile.id,
    analysisRunId: analysis.id,
    symbol,
    provider: input.provider,
    sourceSessionDate: input.sourceSessionDate,
    rows: input.normalizedRows,
  });

  const { error: checkpointError } = await supabaseAdmin
    .from("option_flow_horizon_checkpoints")
    .upsert(
      {
        user_id: input.userId,
        profile_id: profile.id,
        analysis_run_id: analysis.id,
        checkpoint_date: targetDate,
        checkpoint_kind: "final",
        status: "pending",
      },
      { onConflict: "analysis_run_id,checkpoint_date,checkpoint_kind" }
    );
  if (checkpointError) throw checkpointError;

  const { data: updatedProfile, error: updateError } = await supabaseAdmin
    .from("option_flow_profiles")
    .update({
      last_analysis_at: now,
      last_flow_session_date: input.sourceSessionDate,
      current_snapshot: {
        latestAnalysisRunId: analysis.id,
        latestAnalysisVersion: version,
        latestFlowBias: input.agentOutput.flowBias ?? input.deterministicSnapshot.flowBias ?? null,
        analysisMode: input.deterministicSnapshot.analysisMode === "comprehensive"
          ? "comprehensive"
          : input.analysisMode,
        horizon: input.horizon,
        targetDate,
        dataQuality: input.dataQuality,
        thesisUpdate: input.agentOutput.thesisUpdate ?? null,
      },
    })
    .eq("id", profile.id)
    .eq("user_id", input.userId)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await supabaseAdmin.from("option_flow_agent_runs").insert({
    user_id: input.userId,
    profile_id: profile.id,
    analysis_run_id: analysis.id,
    run_type: "analysis",
    status: "complete",
    model: input.model ?? null,
    trace_id: input.traceId ?? null,
    input_manifest: {
      symbol,
      sourceSessionDate: input.sourceSessionDate,
      analysisMode: input.analysisMode,
      horizon: input.horizon,
      rowCount: input.normalizedRows.length,
    },
    output: input.agentOutput,
    usage: input.agentUsage ?? {},
    completed_at: now,
  });

  // Give the frozen analysis the same dated market evidence used by its AI run.
  // The scheduled close job keeps the series current after this initial load.
  try {
    if (Array.isArray(input.marketBars)) {
      if (input.marketBars.length) await persistDailyBars(input.marketBars);
    } else {
      const endDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const evidenceStart = validDateKey(input.dataQuality.evidencePeriodStart)
        ? String(input.dataQuality.evidencePeriodStart)
        : endDate;
      const startDate = [dateDaysAgo(endDate, 420), dateDaysAgo(evidenceStart, 10)].sort()[0];
      await upsertDailyBars(symbol, startDate, endDate);
    }
  } catch (error) {
    console.warn("[option-flow] initial market-history backfill failed", {
      symbol,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return { profile: updatedProfile, analysis, sources: savedSources ?? [], targetDate };
}

export async function listOptionFlowProfiles(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("option_flow_profiles")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function getOptionFlowProfileWorkspace(input: {
  userId: string;
  profileId?: string | null;
  symbol?: string | null;
}) {
  let profileQuery = supabaseAdmin
    .from("option_flow_profiles")
    .select("*")
    .eq("user_id", input.userId);
  if (input.profileId) profileQuery = profileQuery.eq("id", input.profileId);
  else profileQuery = profileQuery.eq("symbol", normalizeOptionFlowSymbol(input.symbol));
  const { data: profile, error: profileError } = await profileQuery.maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;

  const [analysesResult, barsResult, reviewsResult, checkpointsResult, eventsResult, sourcesResult, oiResult, oiReconciliationsResult] = await Promise.all([
    supabaseAdmin
      .from("option_flow_analysis_runs")
      .select("*")
      .eq("user_id", input.userId)
      .eq("profile_id", profile.id)
      .order("version", { ascending: false })
      .limit(40),
    supabaseAdmin
      .from("investment_market_daily_bars")
      .select("*")
      .eq("symbol", profile.symbol)
      .order("session_date", { ascending: false })
      .limit(260),
    supabaseAdmin
      .from("option_flow_daily_reviews")
      .select("*")
      .eq("user_id", input.userId)
      .eq("profile_id", profile.id)
      .order("session_date", { ascending: false })
      .limit(90),
    supabaseAdmin
      .from("option_flow_horizon_checkpoints")
      .select("*")
      .eq("user_id", input.userId)
      .eq("profile_id", profile.id)
      .order("checkpoint_date", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("option_flow_events")
      .select("id,analysis_run_id,source_session_date,occurred_at,contract_symbol,expiry,strike,option_type,aggressor_side,underlying_price,observed_contract_price,bid,ask,size,premium,volume,open_interest,open_interest_change,implied_volatility,delta,opening_closing_status")
      .eq("user_id", input.userId)
      .eq("profile_id", profile.id)
      .order("source_session_date", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("option_flow_sources")
      .select("id,analysis_run_id,source_type,provider,file_name,content_sha256,source_session_date,row_count,metadata,created_at")
      .eq("user_id", input.userId)
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(200),
    loadOptionFlowOpenInterestIntelligence({
      userId: input.userId,
      profileId: profile.id,
    }),
    supabaseAdmin
      .from("option_flow_oi_reconciliations")
      .select("*")
      .eq("user_id", input.userId)
      .eq("profile_id", profile.id)
      .order("effective_session_date", { ascending: false })
      .limit(90),
  ]);
  for (const result of [analysesResult, barsResult, reviewsResult, checkpointsResult, eventsResult, sourcesResult, oiReconciliationsResult]) {
    if (result.error) throw result.error;
  }
  const bars = (barsResult.data ?? []).map(mapDailyBar).reverse();
  return {
    profile,
    analyses: analysesResult.data ?? [],
    bars,
    reviews: reviewsResult.data ?? [],
    checkpoints: checkpointsResult.data ?? [],
    events: eventsResult.data ?? [],
    sources: sourcesResult.data ?? [],
    contractSnapshots: oiResult.snapshots,
    openInterestIntelligence: oiResult.intelligence,
    oiReconciliations: oiReconciliationsResult.data ?? [],
    optionMarketData: getOptionFlowMarketDataStatus(),
    trend: computeOptionFlowTrend(bars),
  };
}

export async function updateOptionFlowProfileStatus(input: {
  userId: string;
  profileId: string;
  status: "active" | "paused" | "archived";
}) {
  const { data, error } = await supabaseAdmin
    .from("option_flow_profiles")
    .update({ status: input.status })
    .eq("id", input.profileId)
    .eq("user_id", input.userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function upsertDailyBars(symbol: string, startDate: string, endDate: string) {
  const fetched = await fetchOptionFlowDailyBars({ underlying: symbol, startDate, endDate });
  return persistDailyBars(fetched);
}

async function persistDailyBars(fetched: OptionFlowDailyMarketBar[]) {
  if (!fetched.length) return [];
  const rows = fetched.map((bar) => ({
    symbol: normalizeOptionFlowSymbol(bar.symbol),
    session_date: bar.sessionDate,
    source_id: bar.sourceId,
    exchange: bar.exchange,
    market_timezone: "America/New_York",
    currency: bar.currency ?? "USD",
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    adjusted_close: bar.adjustedClose,
    volume: bar.volume,
    adjustment_status: bar.adjustedClose != null ? "split_adjusted" : "unadjusted",
    available_at: bar.availableAt,
    source_reference: bar.sourceReference,
    source_payload: bar.raw,
    observation_sha256: sha256(
      [bar.symbol, bar.sessionDate, bar.sourceId, bar.open, bar.high, bar.low, bar.close, bar.adjustedClose, bar.volume].join("|")
    ),
  }));
  const { data, error } = await supabaseAdmin
    .from("investment_market_daily_bars")
    .upsert(rows, { onConflict: "symbol,session_date,source_id" })
    .select("*");
  if (error) throw error;
  return (data ?? []).map(mapDailyBar);
}

async function evaluateDueCheckpoints(input: {
  profile: any;
  bars: OptionFlowDailyBar[];
  latestSessionDate: string;
}) {
  const { data: checkpoints, error } = await supabaseAdmin
    .from("option_flow_horizon_checkpoints")
    .select("*")
    .eq("profile_id", input.profile.id)
    .eq("status", "pending")
    .lte("checkpoint_date", input.latestSessionDate)
    .order("checkpoint_date", { ascending: true });
  if (error) throw error;
  if (!checkpoints?.length) return 0;

  let completed = 0;
  for (const checkpoint of checkpoints) {
    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from("option_flow_analysis_runs")
      .select("id,source_session_date,target_date,deterministic_snapshot,agent_output")
      .eq("id", checkpoint.analysis_run_id)
      .eq("user_id", input.profile.user_id)
      .maybeSingle();
    if (analysisError) throw analysisError;
    if (!analysis) continue;

    const sourceBar = input.bars
      .filter((bar) => bar.sessionDate <= analysis.source_session_date)
      .at(-1);
    const checkpointBar = input.bars
      .filter((bar) => bar.sessionDate >= checkpoint.checkpoint_date)
      .at(0) ?? input.bars.at(-1);
    const result = classifyOptionFlowCheckpoint({
      flowBias:
        analysis.agent_output?.flowBias ??
        analysis.deterministic_snapshot?.flowBias ??
        null,
      sourceClose: sourceBar?.close ?? analysis.deterministic_snapshot?.previousClose ?? null,
      checkpointClose: checkpointBar?.close ?? null,
      targetDate: checkpoint.checkpoint_date,
      evaluatedSessionDate: checkpointBar?.sessionDate ?? input.latestSessionDate,
    });
    const status = result.classification === "insufficient_evidence" ? "insufficient_data" : "complete";
    const { error: updateError } = await supabaseAdmin
      .from("option_flow_horizon_checkpoints")
      .update({
        status,
        classification: result.classification,
        source_bar_id: sourceBar?.id ?? null,
        checkpoint_bar_id: checkpointBar?.id ?? null,
        deterministic_result: result,
        evaluated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", checkpoint.id);
    if (updateError) throw updateError;
    completed += 1;
  }
  return completed;
}

async function completeMaterialDailyReview(input: {
  profile: any;
  review: any;
  trend: Record<string, unknown>;
  materialReasons: string[];
}) {
  const { data: latestAnalysis, error: analysisError } = await supabaseAdmin
    .from("option_flow_analysis_runs")
    .select("id,language,analysis_mode,horizon,target_date,source_session_date,deterministic_snapshot,agent_output")
    .eq("profile_id", input.profile.id)
    .eq("user_id", input.profile.user_id)
    .eq("status", "complete")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (analysisError) throw analysisError;
  const { runOptionFlowDailyMaterialAgent } = await import("@/lib/optionFlowAgents");
  const result = await runOptionFlowDailyMaterialAgent({
    language: latestAnalysis?.language === "es" ? "es" : "en",
    symbol: input.profile.symbol,
    trend: input.trend,
    materialReasons: input.materialReasons,
    latestAnalysis: latestAnalysis
      ? {
          id: latestAnalysis.id,
          analysisMode: latestAnalysis.analysis_mode,
          horizon: latestAnalysis.horizon,
          targetDate: latestAnalysis.target_date,
          sourceSessionDate: latestAnalysis.source_session_date,
          deterministicSnapshot: latestAnalysis.deterministic_snapshot,
          agentOutput: latestAnalysis.agent_output,
        }
      : null,
  });
  const completedAt = new Date().toISOString();
  const { error: reviewError } = await supabaseAdmin
    .from("option_flow_daily_reviews")
    .update({
      agent_interpretation: result.output,
      agent_status: "complete",
    })
    .eq("id", input.review.id);
  if (reviewError) throw reviewError;
  await supabaseAdmin.from("option_flow_agent_runs").insert({
    user_id: input.profile.user_id,
    profile_id: input.profile.id,
    analysis_run_id: latestAnalysis?.id ?? null,
    daily_review_id: input.review.id,
    run_type: "daily_material_review",
    status: "complete",
    model: result.model,
    trace_id: result.traceId,
    input_manifest: {
      symbol: input.profile.symbol,
      materialReasons: input.materialReasons,
      sessionDate: input.review.session_date,
    },
    output: result.output,
    usage: result.usage,
    completed_at: completedAt,
  });
  await recordAiUsage({
    userId: input.profile.user_id,
    feature: "option_flow",
    category: "market_intelligence",
    operation: "daily_material_review_agent",
    model: result.model,
    usage: result.usage,
    apiKind: "responses",
    metadata: { profileId: input.profile.id, dailyReviewId: input.review.id },
  });
}

async function processMaterialDailyReview(input: {
  profile: any;
  review: any;
  trend: Record<string, unknown>;
  materialReasons: string[];
}) {
  try {
    await completeMaterialDailyReview(input);
    return true;
  } catch (error: any) {
    const completedAt = new Date().toISOString();
    await supabaseAdmin
      .from("option_flow_daily_reviews")
      .update({ agent_status: "failed" })
      .eq("id", input.review.id);
    await supabaseAdmin.from("option_flow_agent_runs").insert({
      user_id: input.profile.user_id,
      profile_id: input.profile.id,
      daily_review_id: input.review.id,
      run_type: "daily_material_review",
      status: "failed",
      input_manifest: {
        symbol: input.profile.symbol,
        sessionDate: input.review.session_date,
      },
      error_message: String(error?.message ?? "Daily material review agent failed").slice(0, 500),
      completed_at: completedAt,
    });
    return false;
  }
}

function dateDaysAgo(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function processOptionFlowDailyClose(input: {
  sessionDate: string;
  symbol?: string | null;
  runMaterialAgents?: boolean;
}) {
  if (!validDateKey(input.sessionDate)) throw new Error("A valid market session date is required.");
  let query = supabaseAdmin
    .from("option_flow_profiles")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: true })
    .limit(1_000);
  const requestedSymbol = normalizeOptionFlowSymbol(input.symbol);
  if (requestedSymbol) query = query.eq("symbol", requestedSymbol);
  const { data: profiles, error: profilesError } = await query;
  if (profilesError) throw profilesError;

  const grouped = new Map<string, any[]>();
  for (const profile of profiles ?? []) {
    const group = grouped.get(profile.symbol) ?? [];
    group.push(profile);
    grouped.set(profile.symbol, group);
  }

  const result = {
    sessionDate: input.sessionDate,
    profilesScanned: profiles?.length ?? 0,
    symbolsScanned: grouped.size,
    barsSaved: 0,
    reviewsSaved: 0,
    checkpointsCompleted: 0,
    materialReviews: 0,
    materialAgentReviewsCompleted: 0,
    materialAgentReviewsFailed: 0,
    contractSnapshotsSaved: 0,
    contractSnapshotErrors: 0,
    skippedNoSession: 0,
    errors: [] as Array<{ symbol: string; message: string }>,
  };
  const configuredAgentLimit = Number(process.env.OPTIONFLOW_DAILY_AGENT_LIMIT ?? 10);
  const dailyAgentLimit = Number.isFinite(configuredAgentLimit)
    ? Math.max(0, Math.min(50, Math.trunc(configuredAgentLimit)))
    : 10;
  let dailyAgentAttempts = 0;

  // Resume older material reviews first so a busy close cannot strand work
  // indefinitely. Deterministic reviews are never limited by this AI budget.
  if (input.runMaterialAgents && dailyAgentLimit > 0) {
    const { data: pendingReviews, error: pendingReviewsError } = await supabaseAdmin
      .from("option_flow_daily_reviews")
      .select("*")
      .eq("agent_status", "pending")
      .order("session_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(dailyAgentLimit);
    if (pendingReviewsError) throw pendingReviewsError;
    for (const review of pendingReviews ?? []) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("option_flow_profiles")
        .select("*")
        .eq("id", review.profile_id)
        .eq("user_id", review.user_id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) continue;
      dailyAgentAttempts += 1;
      const completed = await processMaterialDailyReview({
        profile,
        review,
        trend: review.deterministic_snapshot ?? {},
        materialReasons: Array.isArray(review.material_reasons) ? review.material_reasons : [],
      });
      if (completed) result.materialAgentReviewsCompleted += 1;
      else result.materialAgentReviewsFailed += 1;
    }
  }

  for (const [symbol, symbolProfiles] of grouped.entries()) {
    try {
      const fetched = await upsertDailyBars(symbol, dateDaysAgo(input.sessionDate, 420), input.sessionDate);
      const latestFetched = fetched.filter((bar) => bar.sessionDate === input.sessionDate).at(-1);
      if (!latestFetched) {
        result.skippedNoSession += 1;
        continue;
      }
      result.barsSaved += fetched.length;

      const { data: storedBars, error: barsError } = await supabaseAdmin
        .from("investment_market_daily_bars")
        .select("*")
        .eq("symbol", symbol)
        .order("session_date", { ascending: false })
        .limit(260);
      if (barsError) throw barsError;
      const bars = (storedBars ?? []).map(mapDailyBar).reverse();
      const latest = bars.at(-1);
      if (!latest || latest.sessionDate !== input.sessionDate) continue;
      const trend = computeOptionFlowTrend(bars);
      const material = detectOptionFlowMaterialChange(bars, trend);
      const previousSession = bars.at(-2)?.sessionDate ?? null;

      for (const profile of symbolProfiles) {
        const { data: existingReview, error: existingReviewError } = await supabaseAdmin
          .from("option_flow_daily_reviews")
          .select("id,agent_status,agent_interpretation")
          .eq("profile_id", profile.id)
          .eq("session_date", latest.sessionDate)
          .maybeSingle();
        if (existingReviewError) throw existingReviewError;
        const requestedAgentStatus =
          existingReview?.agent_status === "complete"
            ? "complete"
            : material.material && input.runMaterialAgents
              ? "pending"
              : "not_required";
        const { data: review, error: reviewError } = await supabaseAdmin
          .from("option_flow_daily_reviews")
          .upsert(
            {
              user_id: profile.user_id,
              profile_id: profile.id,
              market_bar_id: latest.id,
              session_date: latest.sessionDate,
              deterministic_snapshot: trend,
              material_change: material.material,
              material_reasons: material.reasons,
              agent_status: requestedAgentStatus,
            },
            { onConflict: "profile_id,session_date" }
          )
          .select("*")
          .single();
        if (reviewError) throw reviewError;
        result.reviewsSaved += 1;
        if (material.material) result.materialReviews += 1;

        const { error: profileUpdateError } = await supabaseAdmin
          .from("option_flow_profiles")
          .update({
            last_market_session_date: latest.sessionDate,
            current_snapshot: {
              ...(profile.current_snapshot ?? {}),
              market: trend,
              lastDailyReviewId: review.id,
              materialChange: material,
            },
          })
          .eq("id", profile.id);
        if (profileUpdateError) throw profileUpdateError;
        result.checkpointsCompleted += await evaluateDueCheckpoints({
          profile,
          bars,
          latestSessionDate: latest.sessionDate,
        });
        if (
          material.material &&
          input.runMaterialAgents &&
          review.agent_status !== "complete" &&
          dailyAgentAttempts < dailyAgentLimit
        ) {
          dailyAgentAttempts += 1;
          const completed = await processMaterialDailyReview({
            profile,
            review,
            trend,
            materialReasons: material.reasons,
          });
          if (completed) result.materialAgentReviewsCompleted += 1;
          else result.materialAgentReviewsFailed += 1;
        }
        if (getOptionFlowMarketDataStatus().configured && previousSession) {
          const contractSnapshotResult = await refreshOptionFlowProfileSnapshots({
            userId: profile.user_id,
            profileId: profile.id,
            symbol,
            snapshotKind: "market_close",
            priceSessionDate: latest.sessionDate,
            openInterestAsOfDate: previousSession,
          });
          result.contractSnapshotsSaved += contractSnapshotResult.snapshotsSaved;
          result.contractSnapshotErrors += contractSnapshotResult.errors.length;
        }
      }
    } catch (error: any) {
      result.errors.push({ symbol, message: String(error?.message ?? "Daily close processing failed").slice(0, 500) });
    }
  }
  return result;
}
