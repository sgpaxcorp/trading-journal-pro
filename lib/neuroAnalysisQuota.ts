import "server-only";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type QuotaEvent = "analysis" | "filing_upload" | "market_data" | "pdf_export";

type QuotaConfig = {
  monthlyAnalyses: number;
  monthlyFilingUploads: number;
  monthlyMarketRefreshes: number;
  monthlyPdfExports: number;
  monthlyStorageBytes: number;
};

const DEFAULT_QUOTAS: QuotaConfig = {
  monthlyAnalyses: 50,
  monthlyFilingUploads: 100,
  monthlyMarketRefreshes: 500,
  monthlyPdfExports: 100,
  monthlyStorageBytes: 2 * 1024 * 1024 * 1024,
};

function envNumber(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function neuroQuotaConfig(): QuotaConfig {
  return {
    monthlyAnalyses: envNumber("NEURO_ANALYSIS_MONTHLY_ANALYSIS_LIMIT", DEFAULT_QUOTAS.monthlyAnalyses),
    monthlyFilingUploads: envNumber("NEURO_ANALYSIS_MONTHLY_FILING_LIMIT", DEFAULT_QUOTAS.monthlyFilingUploads),
    monthlyMarketRefreshes: envNumber("NEURO_ANALYSIS_MONTHLY_MARKET_LIMIT", DEFAULT_QUOTAS.monthlyMarketRefreshes),
    monthlyPdfExports: envNumber("NEURO_ANALYSIS_MONTHLY_PDF_LIMIT", DEFAULT_QUOTAS.monthlyPdfExports),
    monthlyStorageBytes: envNumber("NEURO_ANALYSIS_MONTHLY_STORAGE_BYTES", DEFAULT_QUOTAS.monthlyStorageBytes),
  };
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function eventLimit(eventType: QuotaEvent, config: QuotaConfig) {
  if (eventType === "analysis") return config.monthlyAnalyses;
  if (eventType === "filing_upload") return config.monthlyFilingUploads;
  if (eventType === "market_data") return config.monthlyMarketRefreshes;
  return config.monthlyPdfExports;
}

export async function checkNeuroQuota(userId: string, eventType: QuotaEvent) {
  const config = neuroQuotaConfig();
  const limit = eventLimit(eventType, config);
  try {
    const { count, error } = await supabaseAdmin
      .from("neuro_analysis_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", eventType)
      .gte("created_at", monthStartIso());
    if (error) throw error;
    const used = count ?? 0;
    return {
      allowed: used < limit,
      used,
      remaining: Math.max(0, limit - used),
      limit,
      eventType,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[neuro-analysis/quota] falling back open:", error);
      return { allowed: true, used: 0, remaining: limit, limit, eventType };
    }
    throw error;
  }
}

export async function checkNeuroStorageQuota(userId: string, nextBytes = 0) {
  const config = neuroQuotaConfig();
  try {
    const { data, error } = await supabaseAdmin
      .from("neuro_analysis_filings")
      .select("usage_bytes, bytes")
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (error) throw error;
    const used = (data ?? []).reduce((sum: number, row: any) => {
      const value = Number(row?.usage_bytes ?? row?.bytes ?? 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    return {
      allowed: used + nextBytes <= config.monthlyStorageBytes,
      used,
      remaining: Math.max(0, config.monthlyStorageBytes - used),
      limit: config.monthlyStorageBytes,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[neuro-analysis/storage-quota] falling back open:", error);
      return { allowed: true, used: 0, remaining: config.monthlyStorageBytes, limit: config.monthlyStorageBytes };
    }
    throw error;
  }
}

export async function recordNeuroUsage(input: {
  userId: string;
  caseId?: string | null;
  eventType: QuotaEvent | string;
  model?: string | null;
  units?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  bytes?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("neuro_analysis_usage_events").insert({
      user_id: input.userId,
      case_id: input.caseId ?? null,
      event_type: input.eventType,
      model: input.model ?? null,
      units: input.units ?? 1,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      bytes: input.bytes ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[neuro-analysis/usage] insert skipped:", error);
      return;
    }
    throw error;
  }
}
