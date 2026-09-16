import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import OpenAI from "openai";

import {
  appendNeuroWebSources,
  buildNeuroAnalysisInput,
  extractNeuroWebSources,
  NEURO_ANALYSIS_SYSTEM_PROMPT,
  neuroReasoningConfig,
  neuroWebSearchTool,
  type NeuroAnalysisRequest,
} from "@/lib/neuroAnalysisAgent";
import { getAuthUser } from "@/lib/authServer";
import {
  AI_TRADE_PROPOSAL_DISABLED_PROMPT,
  enforceAiTradeProposalControl,
  getEmergencyPortfolioControls,
  requirePortfolioWriteAccess,
} from "@/lib/emergencyPortfolioControls";
import { buildNeuroAnalysisEngine } from "@/lib/neuroAnalysisEngine";
import {
  buildBusinessQualityFallback,
  buildBusinessQualityInput,
  BUSINESS_QUALITY_SYSTEM_PROMPT,
  constrainBusinessQualityEvidenceSources,
  normalizeBusinessQualityAnalysis,
} from "@/lib/neuroBusinessQuality";
import {
  buildManagementCapitalAllocationFallback,
  constrainManagementCapitalAllocationSources,
  MANAGEMENT_CAPITAL_ALLOCATION_PROMPT,
  normalizeManagementCapitalAllocationAnalysis,
} from "@/lib/neuroManagementCapitalAllocation";
import {
  buildEarningsQualityFallback,
  constrainEarningsQualitySources,
  EARNINGS_QUALITY_SYSTEM_PROMPT,
  normalizeEarningsQualityAnalysis,
} from "@/lib/neuroEarningsQuality";
import {
  BEAR_CASE_SYSTEM_PROMPT,
  buildBearCaseFallback,
  buildBearCaseInput,
  constrainBearCaseEvidenceSources,
  normalizeBearCaseAnalysis,
} from "@/lib/neuroBearCase";
import {
  buildCommitteePacketFallback,
  buildCommitteeSourceManifest,
} from "@/lib/neuroInvestmentCommittee";
import {
  buildInvestmentThesisReviewFallback,
  buildInvestmentThesisReviewInput,
  constrainInvestmentThesisReviewEvidence,
  INVESTMENT_THESIS_REVIEW_PROMPT,
  normalizeInvestmentThesisReview,
} from "@/lib/neuroInvestmentThesis";
import {
  buildPositionExitReviewFallback,
  buildPositionExitReviewInput,
  constrainPositionExitReviewEvidence,
  normalizePositionExitReview,
  POSITION_EXIT_REVIEW_PROMPT,
} from "@/lib/neuroPositionExitReview";
import {
  buildPortfolioExposureFallback,
  buildPortfolioExposureInput,
  constrainPortfolioExposureEvidence,
  normalizePortfolioExposureMap,
  PORTFOLIO_EXPOSURE_SYSTEM_PROMPT,
} from "@/lib/neuroPortfolioExposure";
import {
  buildMacroContextFallback,
  buildMacroContextInput,
  constrainMacroContextEvidence,
  MACRO_CONTEXT_SYSTEM_PROMPT,
  normalizeMacroContextReport,
} from "@/lib/neuroMacroContext";
import { buildCapitalAllocationDashboard } from "@/lib/neuroCapitalAllocation";
import { buildNeuroPerformanceAttribution } from "@/lib/neuroPerformanceAttribution";
import {
  appendFinancialTraceabilityAppendix,
  auditAiFinancialPayload,
  DATA_NOT_AVAILABLE,
  enforceResearchFinancialIntegrity,
  FINANCIAL_DATA_INTEGRITY_PROMPT,
  mergeFinancialIntegrityManifests,
} from "@/lib/neuroFinancialDataIntegrity";
import {
  auditAiInvestmentProbabilityPayload,
  enforceInvestmentProbabilityIntegrity,
  INVESTMENT_PROBABILITY_INTEGRITY_PROMPT,
} from "@/lib/neuroInvestmentProbabilityIntegrity";
import {
  auditMasterInvestmentSystemPayload,
  enforceMasterInvestmentSystemOutput,
  withMasterInvestmentSystemPrinciple,
} from "@/lib/neuroMasterInvestmentPrinciple";
import { buildNeuroDecisionSupport } from "@/lib/neuroInvestmentGovernance";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import {
  getLatestNeuroInvestmentPolicy,
  getOriginalInvestmentThesisRecord,
  insertInvestmentCommitteePacket,
  insertInvestmentThesisReview,
  insertPositionExitReview,
  insertNeuroReport,
  insertNeuroSnapshot,
  nextInvestmentCommitteePacketVersion,
  upsertNeuroCase,
} from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { countResponseFileSearchCalls, recordAiUsage, requireAiBudget } from "@/lib/aiUsageServer";
import { GPT_6_ASTRA_MODEL } from "@/lib/openAiModelConfig";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_NEURO_ANALYSIS_MODEL || GPT_6_ASTRA_MODEL;

function auditAiResearchPayload(value: unknown, manifest: any) {
  return auditMasterInvestmentSystemPayload(
    auditAiInvestmentProbabilityPayload(
      auditAiFinancialPayload(value, manifest)
    )
  );
}

type FilingMetadata = NonNullable<NeuroAnalysisRequest["uploadedFilings"]>[number];

function appendFinancialIntegrityLedger(
  input: string,
  manifest: any,
  options: { priceBlind?: boolean } = {}
) {
  const records = Array.isArray(manifest?.records)
    ? manifest.records.filter((record: any) =>
        options.priceBlind ? String(record?.path ?? "").startsWith("annualFundamentals.") : true
      )
    : [];
  const ledger = manifest && typeof manifest === "object"
    ? { ...manifest, records }
    : {
        policy: "verified_numbers_only",
        missingValueDisplay: DATA_NOT_AVAILABLE,
        records: [],
      };
  const heading = options.priceBlind
    ? "PRICE-BLIND FINANCIAL DATA INTEGRITY LEDGER. Use only these verified business financial records; do not introduce market price or stock valuation into this pass:"
    : "FINANCIAL DATA INTEGRITY LEDGER. Every material financial number must use an available record and its exact [[FIN:<record id>]] marker:";
  return `${input}\n\n${heading}\n${JSON.stringify(ledger, null, 2)}`;
}

function cleanVectorStoreIds(savedFilings: FilingMetadata[]): string[] {
  const ids = new Set<string>();
  const cfaStoreId = String(process.env.NEURO_ANALYSIS_CFA_VECTOR_STORE_ID ?? "").trim();
  if (cfaStoreId) ids.add(cfaStoreId);

  for (const filing of savedFilings) {
    const id = String(filing?.vectorStoreId ?? "").trim();
    if (id) ids.add(id);
  }

  return Array.from(ids);
}

function normalizeTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function marketItemForTicker(marketData: unknown, ticker: string) {
  const raw = marketData as any;
  if (!raw || !ticker) return null;
  if (raw?.items && typeof raw.items === "object") {
    return raw.items[ticker] ?? raw.items[ticker.toUpperCase()] ?? null;
  }
  if (normalizeTicker(raw?.ticker) === ticker) return raw;
  return null;
}

function isFundLikeMarketItem(item: any) {
  const instrumentType = String(item?.instrumentType ?? "").toLowerCase();
  const quoteType = String(item?.company?.quoteType ?? "").toUpperCase();
  return instrumentType === "etf" || instrumentType === "fund" || quoteType.includes("ETF") || quoteType.includes("FUND");
}

function buildEffectiveHoldings(payload: NeuroAnalysisRequest) {
  const holdings = Array.isArray(payload?.holdings) ? payload.holdings : [];
  if (holdings.length > 0) return holdings;

  const ticker = normalizeTicker(payload?.focusTicker);
  if (!ticker) return [];
  const market = marketItemForTicker(payload?.marketData, ticker);
  const rawPrice = market?.market?.regularMarketPrice ?? market?.market?.previousClose;
  const price = rawPrice == null || rawPrice === "" ? null : Number(rawPrice);
  const verifiedPrice = price != null && Number.isFinite(price) && price > 0 ? price : null;
  return [
    {
      ticker,
      shares: 1,
      averageCost: null,
      currentPrice: verifiedPrice,
      researchOnly: true,
    },
  ];
}

function sanitizeClientFilings(
  filings: NonNullable<NeuroAnalysisRequest["uploadedFilings"]>
): FilingMetadata[] {
  return filings.map((filing) => ({
    ticker: normalizeTicker(filing?.ticker),
    form: filing?.form === "10-Q" ? "10-Q" : "10-K",
    fileName: String(filing?.fileName ?? "").trim().slice(0, 512) || undefined,
    fiscalYear:
      typeof filing?.fiscalYear === "number" && Number.isInteger(filing.fiscalYear)
        ? filing.fiscalYear
        : null,
    period: String(filing?.period ?? "").trim().slice(0, 64) || undefined,
    periodEnd: String(filing?.periodEnd ?? "").trim().slice(0, 32) || null,
    bytes: typeof filing?.bytes === "number" && Number.isFinite(filing.bytes) ? filing.bytes : undefined,
    usageBytes:
      typeof filing?.usageBytes === "number" && Number.isFinite(filing.usageBytes)
        ? filing.usageBytes
        : undefined,
    fileId: String(filing?.fileId ?? "").trim() || undefined,
    vectorStoreId: String(filing?.vectorStoreId ?? "").trim() || undefined,
  }));
}

async function loadSavedFilingLibrary(userId: string, holdings: NeuroAnalysisRequest["holdings"]) {
  const tickers = Array.from(new Set((holdings ?? []).map((holding) => normalizeTicker(holding.ticker)).filter(Boolean)));
  if (!tickers.length) return [];

  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_filings")
    .select("ticker,form,fiscal_year,period,period_end,file_name,openai_file_id,vector_store_id,bytes,usage_bytes")
    .eq("user_id", userId)
    .in("ticker", tickers)
    .is("deleted_at", null)
    .not("vector_store_id", "is", null)
    .order("fiscal_year", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(80);

  if (error || !Array.isArray(data)) return [];

  return data.map((row: any) => ({
    ticker: String(row.ticker ?? ""),
    form: row.form === "10-Q" ? ("10-Q" as const) : ("10-K" as const),
    fileName: row.file_name ?? undefined,
    fiscalYear: row.fiscal_year ?? null,
    period: row.period ?? undefined,
    periodEnd: row.period_end ?? null,
    fileId: row.openai_file_id ?? undefined,
    vectorStoreId: row.vector_store_id ?? undefined,
    bytes: row.bytes ?? undefined,
    usageBytes: row.usage_bytes ?? undefined,
  }));
}

function mergeFilings(
  uploaded: NonNullable<NeuroAnalysisRequest["uploadedFilings"]>,
  saved: NonNullable<NeuroAnalysisRequest["uploadedFilings"]>
) {
  const seen = new Set<string>();
  return [...uploaded, ...saved].filter((filing) => {
    const key = [
      filing.vectorStoreId ?? "",
      filing.fileId ?? "",
      filing.ticker ?? "",
      filing.form ?? "",
      filing.fileName ?? "",
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function missingIndexedFilingTickers(payload: NeuroAnalysisRequest, form: "10-K" | "10-Q") {
  const tickers = Array.from(new Set((payload.holdings ?? []).map((holding) => normalizeTicker(holding.ticker)).filter(Boolean)));
  return tickers.filter(
    (ticker) =>
      !isFundLikeMarketItem(marketItemForTicker(payload.marketData, ticker)) &&
      !(payload.uploadedFilings ?? []).some(
        (filing) =>
          normalizeTicker(filing.ticker) === ticker &&
          filing.form === form &&
          String(filing.vectorStoreId ?? "").trim()
      )
  );
}

function sanitizeAgentReport(report: string) {
  return report
    .replace(/\bYahoo\s+Finance\b/gi, "market data")
    .replace(/\bYahoo\b/gi, "market data provider")
    .replace(/\bWarren\s+Buffett(?:'s)?\b/gi, "long-term quality framework")
    .replace(/\bWarren\s+Buffet(?:'s)?\b/gi, "long-term quality framework")
    .replace(/\bBuffett(?:'s)?\b/gi, "quality framework")
    .replace(/\bCFA\s+Level\s+I\b/gi, "private research methodology")
    .replace(/\bCFA\b/gi, "private research methodology")
    .replace(/\bLevel\s+I\s+Vol(?:ume)?\.?\s*\d+\s*[-:][^\n,;)]*/gi, "private research library");
}

function parseAgentJson(raw: string) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const candidates = [
    withoutFence,
    withoutFence.slice(withoutFence.indexOf("{"), withoutFence.lastIndexOf("}") + 1),
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function responseTokenUsage(response: any) {
  const usage = response?.usage ?? {};
  return {
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens ?? null,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens ?? null,
    totalTokens: usage.total_tokens ?? usage.totalTokens ?? null,
    raw: usage,
  };
}

function emptyResponseReason(response: any) {
  const reason = String(response?.incomplete_details?.reason ?? response?.status ?? "unknown").trim();
  return reason || "unknown";
}

function responseNeedsRetry(response: any) {
  return !String(response?.output_text ?? "").trim() || response?.status === "incomplete";
}

function mergeWebSources(...groups: Array<Array<{ url: string; title?: string | null }>>) {
  const sources = new Map<string, { url: string; title?: string | null }>();
  groups.flat().forEach((source) => {
    const url = String(source?.url ?? "").trim();
    if (!url || sources.has(url)) return;
    sources.set(url, { url, title: source?.title ?? null });
  });
  return Array.from(sources.values()).slice(0, 20);
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;
    const emergencyWriteGate = await requirePortfolioWriteAccess();
    if (emergencyWriteGate) return emergencyWriteGate;
    const emergencyControls = await getEmergencyPortfolioControls();

    const rate = await rateLimit(`neuro-analysis:user:${authUser.userId}`, {
      limit: 4,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(rate),
          },
        }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
    }

    const rawPayload = (await req.json()) as NeuroAnalysisRequest & {
      caseId?: string | null;
      caseTitle?: string | null;
      selectedAccountId?: string | null;
      brokerSnapshot?: unknown;
      readiness?: unknown;
    };
    const effectiveHoldings = buildEffectiveHoldings(rawPayload);
    const payload = {
      ...rawPayload,
      focusTicker: normalizeTicker(rawPayload.focusTicker || effectiveHoldings[0]?.ticker),
      holdings: effectiveHoldings,
    };
    if (!payload.focusTicker || payload.holdings.length === 0) {
      return NextResponse.json({ error: "A focus ticker is required." }, { status: 400 });
    }

    const quota = await checkNeuroQuota(authUser.userId, "analysis");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Monthly analysis quota exceeded.", quota },
        { status: 429 }
      );
    }

    const budgetGate = await requireAiBudget({ userId: authUser.userId, category: "market_intelligence" });
    if (budgetGate) return budgetGate;

    const savedFilings = await loadSavedFilingLibrary(authUser.userId, payload.holdings);
    const payloadWithLibrary: NeuroAnalysisRequest = {
      ...payload,
      uploadedFilings: mergeFilings(sanitizeClientFilings(payload.uploadedFilings ?? []), savedFilings),
    };
    const originalInvestmentThesis = payload.caseId
      ? await getOriginalInvestmentThesisRecord(authUser.userId, String(payload.caseId))
      : null;
    if (
      originalInvestmentThesis &&
      normalizeTicker(originalInvestmentThesis.ticker) !== normalizeTicker(payloadWithLibrary.focusTicker)
    ) {
      return NextResponse.json(
        {
          error:
            "This research case has a permanent original thesis for another ticker. Create a separate case instead of replacing its baseline.",
        },
        { status: 409 }
      );
    }
    const vectorStoreIds = cleanVectorStoreIds(payloadWithLibrary.uploadedFilings ?? []);
    const companyVectorStoreIds = Array.from(
      new Set(
        (payloadWithLibrary.uploadedFilings ?? [])
          .map((filing) => String(filing.vectorStoreId ?? "").trim())
          .filter(Boolean)
      )
    );
    const fileSearchTools =
      vectorStoreIds.length > 0
        ? [
            {
              type: "file_search" as const,
              vector_store_ids: vectorStoreIds,
              max_num_results: 20,
            },
          ]
        : [];
    const webSearchTool = neuroWebSearchTool();
    const tools = [...fileSearchTools, ...(webSearchTool ? [webSearchTool] : [])] as any[];
    const include = [
      ...(fileSearchTools.length > 0 ? ["file_search_call.results"] : []),
      ...(webSearchTool ? ["web_search_call.action.sources"] : []),
    ];
    const businessQualityFileSearchTools = companyVectorStoreIds.length
      ? [
          {
            type: "file_search" as const,
            vector_store_ids: companyVectorStoreIds,
            max_num_results: 20,
          },
        ]
      : [];
    const businessQualityTools = [
      ...businessQualityFileSearchTools,
      ...(webSearchTool ? [webSearchTool] : []),
    ] as any[];
    const businessQualityInclude = [
      ...(businessQualityFileSearchTools.length ? ["file_search_call.results"] : []),
      ...(webSearchTool ? ["web_search_call.action.sources"] : []),
    ];

    const focusMarketItem = marketItemForTicker(payloadWithLibrary.marketData, payloadWithLibrary.focusTicker ?? "");
    const businessQualityFallback = buildBusinessQualityFallback({
      ticker: payloadWithLibrary.focusTicker ?? "",
      companyName: focusMarketItem?.company?.name ?? focusMarketItem?.company?.shortName,
      instrumentType: focusMarketItem?.instrumentType ?? focusMarketItem?.company?.quoteType,
      annualFundamentals: focusMarketItem?.annualFundamentals,
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      language: payloadWithLibrary.language,
    });
    const managementCapitalAllocationFallback = buildManagementCapitalAllocationFallback({
      ticker: payloadWithLibrary.focusTicker ?? "",
      companyName: focusMarketItem?.company?.name ?? focusMarketItem?.company?.shortName,
      instrumentType: focusMarketItem?.instrumentType ?? focusMarketItem?.company?.quoteType,
      currency: focusMarketItem?.company?.currency,
      annualFundamentals: focusMarketItem?.annualFundamentals,
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      language: payloadWithLibrary.language,
      generatedAt: businessQualityFallback.generatedAt,
    });
    const earningsQualityFallback = buildEarningsQualityFallback({
      ticker: payloadWithLibrary.focusTicker ?? "",
      companyName: focusMarketItem?.company?.name ?? focusMarketItem?.company?.shortName,
      instrumentType: focusMarketItem?.instrumentType ?? focusMarketItem?.company?.quoteType,
      annualFundamentals: focusMarketItem?.annualFundamentals,
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      language: payloadWithLibrary.language,
      generatedAt: businessQualityFallback.generatedAt,
    });
    let businessQualityResponse: any = null;
    let businessQualityCandidate: any = null;
    let earningsQualityResponse: any = null;
    let earningsQualityCandidate: any = null;

    const runBusinessQualityPass = async () => {
      if (businessQualityFallback.status === "not_applicable") return;
      try {
        const createBusinessQualityResponse = (reasoningEffort?: string) =>
          client.responses.create({
            model: MODEL,
            reasoning: neuroReasoningConfig(MODEL, reasoningEffort) as any,
            instructions: withMasterInvestmentSystemPrinciple(
              BUSINESS_QUALITY_SYSTEM_PROMPT,
              MANAGEMENT_CAPITAL_ALLOCATION_PROMPT,
              FINANCIAL_DATA_INTEGRITY_PROMPT,
              INVESTMENT_PROBABILITY_INTEGRITY_PROMPT
            ),
            input: appendFinancialIntegrityLedger(
              buildBusinessQualityInput({
                language: payloadWithLibrary.language,
                ticker: payloadWithLibrary.focusTicker ?? "",
                company: focusMarketItem?.company ?? {},
                instrumentType: focusMarketItem?.instrumentType ?? focusMarketItem?.company?.quoteType,
                annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
                uploadedFilings: payloadWithLibrary.uploadedFilings ?? [],
              }),
              focusMarketItem?.financialDataIntegrity,
              { priceBlind: true }
            ),
            tools: businessQualityTools,
            include: businessQualityInclude.length > 0 ? (businessQualityInclude as any) : undefined,
            max_output_tokens: 15_000,
            metadata: {
              feature: "neuro_business_quality",
              user_id: authUser.userId,
            },
          });

        businessQualityResponse = await createBusinessQualityResponse();
        if (responseNeedsRetry(businessQualityResponse)) {
          businessQualityResponse = await createBusinessQualityResponse("low");
        }
        if (!responseNeedsRetry(businessQualityResponse)) {
          businessQualityCandidate = auditAiResearchPayload(
            parseAgentJson(businessQualityResponse.output_text),
            focusMarketItem?.financialDataIntegrity
          );
        }
      } catch (businessQualityError) {
        console.warn("[neuro-analysis/analyze] Business Quality pass fell back to verified data:", businessQualityError);
      }
    };
    const runEarningsQualityPass = async () => {
      if (earningsQualityFallback.status === "not_applicable") return;
      try {
        const createEarningsQualityResponse = (reasoningEffort?: string) =>
          client.responses.create({
            model: MODEL,
            reasoning: neuroReasoningConfig(MODEL, reasoningEffort) as any,
            instructions: withMasterInvestmentSystemPrinciple(
              EARNINGS_QUALITY_SYSTEM_PROMPT,
              FINANCIAL_DATA_INTEGRITY_PROMPT,
              INVESTMENT_PROBABILITY_INTEGRITY_PROMPT
            ),
            input: appendFinancialIntegrityLedger(
              buildBusinessQualityInput({
                language: payloadWithLibrary.language,
                ticker: payloadWithLibrary.focusTicker ?? "",
                company: focusMarketItem?.company ?? {},
                instrumentType: focusMarketItem?.instrumentType ?? focusMarketItem?.company?.quoteType,
                annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
                uploadedFilings: payloadWithLibrary.uploadedFilings ?? [],
              }),
              focusMarketItem?.financialDataIntegrity,
              { priceBlind: true }
            ),
            tools: businessQualityTools,
            include: businessQualityInclude.length > 0 ? (businessQualityInclude as any) : undefined,
            max_output_tokens: 12_000,
            metadata: {
              feature: "neuro_earnings_quality",
              user_id: authUser.userId,
            },
          });

        earningsQualityResponse = await createEarningsQualityResponse();
        if (responseNeedsRetry(earningsQualityResponse)) {
          earningsQualityResponse = await createEarningsQualityResponse("low");
        }
        if (!responseNeedsRetry(earningsQualityResponse)) {
          earningsQualityCandidate = auditAiResearchPayload(
            parseAgentJson(earningsQualityResponse.output_text),
            focusMarketItem?.financialDataIntegrity
          );
        }
      } catch (earningsQualityError) {
        console.warn("[neuro-analysis/analyze] Earnings Quality pass fell back to verified data:", earningsQualityError);
      }
    };

    await Promise.all([runBusinessQualityPass(), runEarningsQualityPass()]);

    const normalizedBusinessQualityAnalysis = normalizeBusinessQualityAnalysis({
      candidate: businessQualityCandidate,
      fallback: businessQualityFallback,
    });
    const businessQualityWebSources = businessQualityResponse
      ? extractNeuroWebSources(businessQualityResponse)
      : [];
    const businessQualityAnalysis = constrainBusinessQualityEvidenceSources({
      analysis: normalizedBusinessQualityAnalysis,
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
      webSources: businessQualityWebSources,
    });
    const normalizedManagementCapitalAllocationAnalysis = normalizeManagementCapitalAllocationAnalysis({
      candidate: businessQualityCandidate?.managementCapitalAllocationAnalysis,
      fallback: managementCapitalAllocationFallback,
    });
    const managementCapitalAllocationAnalysis = constrainManagementCapitalAllocationSources({
      analysis: normalizedManagementCapitalAllocationAnalysis,
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
      webSources: businessQualityWebSources,
    });
    const earningsQualityWebSources = earningsQualityResponse
      ? extractNeuroWebSources(earningsQualityResponse)
      : [];
    const earningsQualityAccountingRiskAnalysis = constrainEarningsQualitySources({
      analysis: normalizeEarningsQualityAnalysis({
        candidate: earningsQualityCandidate,
        fallback: earningsQualityFallback,
      }),
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
      webSources: earningsQualityWebSources,
    });
    if (businessQualityResponse) {
      await recordAiUsage({
        userId: authUser.userId,
        requestId: req.headers.get("x-request-id"),
        feature: "neuro_business_quality",
        category: "market_intelligence",
        operation: "business_before_valuation",
        model: String((businessQualityResponse as any)?.model || MODEL),
        usage: (businessQualityResponse as any)?.usage,
        apiKind: "responses",
        fileSearchCalls: countResponseFileSearchCalls(businessQualityResponse),
        metadata: {
          responseId: businessQualityResponse.id,
          vectorStoreCount: companyVectorStoreIds.length,
          webSearchEnabled: Boolean(webSearchTool),
          webSourceCount: businessQualityWebSources.length,
          priceDataExcluded: true,
        },
      });
    }
    if (earningsQualityResponse) {
      await recordAiUsage({
        userId: authUser.userId,
        requestId: req.headers.get("x-request-id"),
        feature: "neuro_earnings_quality",
        category: "market_intelligence",
        operation: "accounting_risk_before_valuation",
        model: String((earningsQualityResponse as any)?.model || MODEL),
        usage: (earningsQualityResponse as any)?.usage,
        apiKind: "responses",
        fileSearchCalls: countResponseFileSearchCalls(earningsQualityResponse),
        metadata: {
          responseId: earningsQualityResponse.id,
          vectorStoreCount: companyVectorStoreIds.length,
          webSearchEnabled: Boolean(webSearchTool),
          webSourceCount: earningsQualityWebSources.length,
          priceDataExcluded: true,
        },
      });
    }
    const valuationBudgetGate = await requireAiBudget({
      userId: authUser.userId,
      category: "market_intelligence",
    });
    if (valuationBudgetGate) return valuationBudgetGate;
    const engine = buildNeuroAnalysisEngine({
      language: payloadWithLibrary.language,
      holdings: payloadWithLibrary.holdings,
      marketData: payloadWithLibrary.marketData,
      filings: payloadWithLibrary.uploadedFilings,
      assumptions: payloadWithLibrary.assumptions,
    });
    const focusPosition = engine.positions.find(
      (position: any) => normalizeTicker(position?.ticker) === normalizeTicker(payloadWithLibrary.focusTicker)
    ) ?? engine.positions[0] ?? null;
    const existingPortfolioRows = engine.positions.filter(
      (position: any) => !position?.researchOnly
    );
    const existingPortfolioValues = existingPortfolioRows.map((position: any) =>
      position?.currentValue == null || !Number.isFinite(Number(position.currentValue))
        ? null
        : Math.max(0, Number(position.currentValue))
    );
    const existingPortfolioValue = existingPortfolioValues.some((value: number | null) => value == null)
      ? null
      : existingPortfolioValues.reduce((sum: number, value: number | null) => sum + (value ?? 0), 0);
    const existingPortfolioPositions = existingPortfolioRows.map((position: any) => ({
      ...position,
      weight:
        existingPortfolioValue != null && existingPortfolioValue > 0 && position?.currentValue != null
          ? Math.max(0, Number(position.currentValue)) / existingPortfolioValue
          : null,
    }));
    const candidateComparisonPositions = engine.positions
      .filter((position: any) => Boolean(position?.researchOnly))
      .map((position: any) => ({ ...position, weight: 0 }));
    const exposureResearchPositions = [
      ...existingPortfolioPositions,
      ...candidateComparisonPositions,
    ];
    const investmentThesis = String(
      payloadWithLibrary.investmentThesis || payloadWithLibrary.question || ""
    ).trim().slice(0, 12_000);
    const bearCaseFallback = buildBearCaseFallback({
      ticker: payloadWithLibrary.focusTicker ?? "",
      companyName: focusMarketItem?.company?.name ?? focusMarketItem?.company?.shortName,
      instrumentType: focusMarketItem?.instrumentType ?? focusMarketItem?.company?.quoteType,
      investmentThesis,
      language: payloadWithLibrary.language,
      generatedAt: businessQualityAnalysis.generatedAt,
    });
    const portfolioExposurePass = (async () => {
      let response: any = null;
      let candidate: any = null;
      if (exposureResearchPositions.length === 0) return { response, candidate };
      try {
        const createPortfolioExposureResponse = (reasoningEffort?: string) =>
          client.responses.create({
            model: MODEL,
            reasoning: neuroReasoningConfig(MODEL, reasoningEffort) as any,
            instructions: withMasterInvestmentSystemPrinciple(
              PORTFOLIO_EXPOSURE_SYSTEM_PROMPT,
              FINANCIAL_DATA_INTEGRITY_PROMPT,
              INVESTMENT_PROBABILITY_INTEGRITY_PROMPT
            ),
            input: appendFinancialIntegrityLedger(
              buildPortfolioExposureInput({
                language: payloadWithLibrary.language,
                positions: exposureResearchPositions,
                marketData: payloadWithLibrary.marketData,
                uploadedFilings: payloadWithLibrary.uploadedFilings ?? [],
                businessQualityAnalysis,
                managementCapitalAllocationAnalysis,
                earningsQualityAccountingRiskAnalysis,
              }),
              engine.financialDataIntegrity
            ),
            tools: businessQualityTools,
            include: businessQualityInclude.length > 0 ? (businessQualityInclude as any) : undefined,
            max_output_tokens: 12_000,
            metadata: {
              feature: "neuro_portfolio_exposure_map",
              user_id: authUser.userId,
            },
          });

        response = await createPortfolioExposureResponse();
        if (responseNeedsRetry(response)) response = await createPortfolioExposureResponse("low");
        if (!responseNeedsRetry(response)) {
          candidate = auditAiResearchPayload(parseAgentJson(response.output_text), engine.financialDataIntegrity);
        }
      } catch (portfolioExposureError) {
        console.warn(
          "[neuro-analysis/analyze] Portfolio Exposure Map fell back to verified evidence gaps:",
          portfolioExposureError
        );
      }
      return { response, candidate };
    })();
    const macroContextFallback = buildMacroContextFallback({
      positions: exposureResearchPositions,
      marketData: payloadWithLibrary.marketData,
      language: payloadWithLibrary.language,
      generatedAt: businessQualityAnalysis.generatedAt,
    });
    const macroContextPass = (async () => {
      let response: any = null;
      let candidate: any = null;
      if (exposureResearchPositions.length === 0) return { response, candidate };
      try {
        const createMacroContextResponse = (reasoningEffort?: string) =>
          client.responses.create({
            model: MODEL,
            reasoning: neuroReasoningConfig(MODEL, reasoningEffort) as any,
            instructions: withMasterInvestmentSystemPrinciple(
              MACRO_CONTEXT_SYSTEM_PROMPT,
              FINANCIAL_DATA_INTEGRITY_PROMPT,
              INVESTMENT_PROBABILITY_INTEGRITY_PROMPT
            ),
            input: appendFinancialIntegrityLedger(
              buildMacroContextInput({
                language: payloadWithLibrary.language,
                positions: exposureResearchPositions,
                marketData: payloadWithLibrary.marketData,
                uploadedFilings: payloadWithLibrary.uploadedFilings ?? [],
                businessQualityAnalysis,
                managementCapitalAllocationAnalysis,
                earningsQualityAccountingRiskAnalysis,
                fallback: macroContextFallback,
              }),
              engine.financialDataIntegrity
            ),
            tools: businessQualityTools,
            include: businessQualityInclude.length > 0 ? (businessQualityInclude as any) : undefined,
            max_output_tokens: 12_000,
            metadata: {
              feature: "neuro_macro_context",
              user_id: authUser.userId,
            },
          });

        response = await createMacroContextResponse();
        if (responseNeedsRetry(response)) response = await createMacroContextResponse("low");
        if (!responseNeedsRetry(response)) {
          candidate = auditAiResearchPayload(parseAgentJson(response.output_text), engine.financialDataIntegrity);
        }
      } catch (macroContextError) {
        console.warn(
          "[neuro-analysis/analyze] Macro Context Agent fell back to observed data and evidence gaps:",
          macroContextError
        );
      }
      return { response, candidate };
    })();
    let bearCaseResponse: any = null;
    let bearCaseCandidate: any = null;
    if (bearCaseFallback.status !== "not_applicable") {
      try {
        const createBearCaseResponse = (reasoningEffort?: string) =>
          client.responses.create({
            model: MODEL,
            reasoning: neuroReasoningConfig(MODEL, reasoningEffort) as any,
            instructions: withMasterInvestmentSystemPrinciple(
              BEAR_CASE_SYSTEM_PROMPT,
              FINANCIAL_DATA_INTEGRITY_PROMPT,
              INVESTMENT_PROBABILITY_INTEGRITY_PROMPT
            ),
            input: appendFinancialIntegrityLedger(
              buildBearCaseInput({
                language: payloadWithLibrary.language,
                ticker: payloadWithLibrary.focusTicker ?? "",
                company: focusMarketItem?.company ?? {},
                instrumentType: focusMarketItem?.instrumentType ?? focusMarketItem?.company?.quoteType,
                investmentThesis,
                thesisContext: payloadWithLibrary.thesisContext ?? [],
                annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
                uploadedFilings: payloadWithLibrary.uploadedFilings ?? [],
                businessQualityAnalysis,
                managementCapitalAllocationAnalysis,
                earningsQualityAccountingRiskAnalysis,
                reverseDcf: focusPosition?.reverseDcf ?? null,
              }),
              engine.financialDataIntegrity
            ),
            tools: businessQualityTools,
            include: businessQualityInclude.length > 0 ? (businessQualityInclude as any) : undefined,
            max_output_tokens: 15_000,
            metadata: {
              feature: "neuro_bear_case",
              user_id: authUser.userId,
            },
          });

        bearCaseResponse = await createBearCaseResponse();
        if (responseNeedsRetry(bearCaseResponse)) {
          bearCaseResponse = await createBearCaseResponse("low");
        }
        if (!responseNeedsRetry(bearCaseResponse)) {
          bearCaseCandidate = auditAiResearchPayload(
            parseAgentJson(bearCaseResponse.output_text),
            engine.financialDataIntegrity
          );
        }
      } catch (bearCaseError) {
        console.warn("[neuro-analysis/analyze] Independent Bear Case pass fell back to evidence gaps:", bearCaseError);
      }
    }
    const bearCaseWebSources = bearCaseResponse ? extractNeuroWebSources(bearCaseResponse) : [];
    const independentBearCaseAnalysis = constrainBearCaseEvidenceSources({
      analysis: normalizeBearCaseAnalysis({
        candidate: bearCaseCandidate,
        fallback: bearCaseFallback,
      }),
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
      webSources: bearCaseWebSources,
      investmentThesis,
      reverseDcf: focusPosition?.reverseDcf ?? null,
    });
    if (bearCaseResponse) {
      await recordAiUsage({
        userId: authUser.userId,
        requestId: req.headers.get("x-request-id"),
        feature: "neuro_bear_case",
        category: "market_intelligence",
        operation: "independent_adversarial_thesis_test",
        model: String((bearCaseResponse as any)?.model || MODEL),
        usage: (bearCaseResponse as any)?.usage,
        apiKind: "responses",
        fileSearchCalls: countResponseFileSearchCalls(bearCaseResponse),
        metadata: {
          responseId: bearCaseResponse.id,
          vectorStoreCount: companyVectorStoreIds.length,
          webSearchEnabled: Boolean(webSearchTool),
          webSourceCount: bearCaseWebSources.length,
          bullRecommendationExcluded: true,
          finalRecommendationExcluded: true,
          probabilityExcluded: true,
        },
      });
    }
    let portfolioExposureMap = buildPortfolioExposureFallback({
      positions: existingPortfolioPositions,
      language: payloadWithLibrary.language,
    });
    const {
      response: portfolioExposureResponse,
      candidate: portfolioExposureCandidate,
    } = await portfolioExposurePass;
    const portfolioExposureWebSources = portfolioExposureResponse
      ? extractNeuroWebSources(portfolioExposureResponse)
      : [];
    portfolioExposureMap = constrainPortfolioExposureEvidence({
      map: normalizePortfolioExposureMap({
        candidate: portfolioExposureCandidate,
        fallback: portfolioExposureMap,
        positions: existingPortfolioPositions,
      }),
      positions: existingPortfolioPositions,
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      marketData: payloadWithLibrary.marketData,
      webSources: portfolioExposureWebSources,
    });
    const capitalComparisonExposureMap = constrainPortfolioExposureEvidence({
      map: normalizePortfolioExposureMap({
        candidate: portfolioExposureCandidate,
        fallback: buildPortfolioExposureFallback({
          positions: exposureResearchPositions,
          language: payloadWithLibrary.language,
        }),
        positions: exposureResearchPositions,
      }),
      positions: exposureResearchPositions,
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      marketData: payloadWithLibrary.marketData,
      webSources: portfolioExposureWebSources,
    });
    if (portfolioExposureResponse) {
      await recordAiUsage({
        userId: authUser.userId,
        requestId: req.headers.get("x-request-id"),
        feature: "neuro_portfolio_exposure_map",
        category: "market_intelligence",
        operation: "map_cross_holding_economic_dependencies",
        model: String((portfolioExposureResponse as any)?.model || MODEL),
        usage: (portfolioExposureResponse as any)?.usage,
        apiKind: "responses",
        fileSearchCalls: countResponseFileSearchCalls(portfolioExposureResponse),
        metadata: {
          responseId: portfolioExposureResponse.id,
          positionCount: existingPortfolioPositions.length,
          verifiedExposureCount: portfolioExposureMap.holdingExposures.length,
          prospectiveCandidateExposureCount: capitalComparisonExposureMap.holdingExposures.filter(
            (exposure) => candidateComparisonPositions.some(
              (position: any) => normalizeTicker(position?.ticker) === normalizeTicker(exposure.ticker)
            )
          ).length,
          commonDependencyCount: portfolioExposureMap.commonDependencies.length,
          automaticDiversificationRecommendation: false,
          webSourceCount: portfolioExposureWebSources.length,
        },
      });
    }
    const {
      response: macroContextResponse,
      candidate: macroContextCandidate,
    } = await macroContextPass;
    const macroContextWebSources = macroContextResponse
      ? extractNeuroWebSources(macroContextResponse)
      : [];
    const macroContext = constrainMacroContextEvidence({
      report: normalizeMacroContextReport({
        candidate: macroContextCandidate,
        fallback: macroContextFallback,
        positions: exposureResearchPositions,
      }),
      uploadedFilings: payloadWithLibrary.uploadedFilings,
      marketData: payloadWithLibrary.marketData,
      webSources: macroContextWebSources,
    });
    if (macroContextResponse) {
      await recordAiUsage({
        userId: authUser.userId,
        requestId: req.headers.get("x-request-id"),
        feature: "neuro_macro_context",
        category: "market_intelligence",
        operation: "map_macro_transmission_to_company_economics",
        model: String((macroContextResponse as any)?.model || MODEL),
        usage: (macroContextResponse as any)?.usage,
        apiKind: "responses",
        fileSearchCalls: countResponseFileSearchCalls(macroContextResponse),
        metadata: {
          responseId: macroContextResponse.id,
          companyCount: macroContext.companyContexts.length,
          verifiedSensitivityCount: macroContext.companyContexts.reduce(
            (sum, company) => sum + company.sensitivities.length,
            0
          ),
          observedSeriesCount: macroContext.observedData.length,
          marketExpectationCount: macroContext.marketExpectations.length,
          thirdPartyForecastCount: macroContext.thirdPartyForecasts.length,
          macroIsContextNotTiming: true,
          automaticBuySellInstructions: false,
          webSourceCount: macroContextWebSources.length,
        },
      });
    }
    let investmentThesisReview = originalInvestmentThesis
      ? buildInvestmentThesisReviewFallback({
          originalThesis: originalInvestmentThesis,
          language: payloadWithLibrary.language,
        })
      : null;
    let thesisReviewResponse: any = null;
    let thesisReviewWebSources: Array<{ url: string; title?: string | null }> = [];
    if (originalInvestmentThesis) {
      let thesisReviewCandidate: any = null;
      try {
        const createThesisReviewResponse = (reasoningEffort?: string) =>
          client.responses.create({
            model: MODEL,
            reasoning: neuroReasoningConfig(MODEL, reasoningEffort) as any,
            instructions: withMasterInvestmentSystemPrinciple(
              INVESTMENT_THESIS_REVIEW_PROMPT,
              FINANCIAL_DATA_INTEGRITY_PROMPT,
              INVESTMENT_PROBABILITY_INTEGRITY_PROMPT
            ),
            input: appendFinancialIntegrityLedger(
              buildInvestmentThesisReviewInput({
                language: payloadWithLibrary.language,
                originalThesis: originalInvestmentThesis,
                company: focusMarketItem?.company ?? {},
                annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
                uploadedFilings: payloadWithLibrary.uploadedFilings ?? [],
                businessQualityAnalysis,
                managementCapitalAllocationAnalysis,
                earningsQualityAccountingRiskAnalysis,
                independentBearCaseAnalysis,
                valuationModel: focusPosition?.reverseDcf ?? null,
              }),
              engine.financialDataIntegrity
            ),
            tools: businessQualityTools,
            include: businessQualityInclude.length > 0 ? (businessQualityInclude as any) : undefined,
            max_output_tokens: 8_000,
            metadata: {
              feature: "neuro_thesis_review",
              user_id: authUser.userId,
              original_thesis_id: originalInvestmentThesis.id,
            },
          });

        thesisReviewResponse = await createThesisReviewResponse();
        if (responseNeedsRetry(thesisReviewResponse)) {
          thesisReviewResponse = await createThesisReviewResponse("low");
        }
        if (!responseNeedsRetry(thesisReviewResponse)) {
          thesisReviewCandidate = auditAiResearchPayload(
            parseAgentJson(thesisReviewResponse.output_text),
            engine.financialDataIntegrity
          );
        }
      } catch (thesisReviewError) {
        console.warn(
          "[neuro-analysis/analyze] Original thesis review fell back to insufficient evidence:",
          thesisReviewError
        );
      }
      thesisReviewWebSources = thesisReviewResponse ? extractNeuroWebSources(thesisReviewResponse) : [];
      investmentThesisReview = constrainInvestmentThesisReviewEvidence({
        review: normalizeInvestmentThesisReview({
          candidate: thesisReviewCandidate,
          fallback:
            investmentThesisReview ??
            buildInvestmentThesisReviewFallback({
              originalThesis: originalInvestmentThesis,
              language: payloadWithLibrary.language,
            }),
          originalThesis: originalInvestmentThesis,
        }),
        originalThesis: originalInvestmentThesis,
        uploadedFilings: payloadWithLibrary.uploadedFilings,
        annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
        webSources: thesisReviewWebSources,
        valuationModel: focusPosition?.reverseDcf ?? null,
      });
      if (thesisReviewResponse) {
        await recordAiUsage({
          userId: authUser.userId,
          requestId: req.headers.get("x-request-id"),
          feature: "neuro_thesis_review",
          category: "market_intelligence",
          operation: "compare_current_facts_to_original_thesis",
          model: String((thesisReviewResponse as any)?.model || MODEL),
          usage: (thesisReviewResponse as any)?.usage,
          apiKind: "responses",
          fileSearchCalls: countResponseFileSearchCalls(thesisReviewResponse),
          metadata: {
            responseId: thesisReviewResponse.id,
            originalThesisId: originalInvestmentThesis.id,
            originalThesisHash: originalInvestmentThesis.content_hash,
            classification: investmentThesisReview.classification,
            automaticTradingDecision: false,
            webSourceCount: thesisReviewWebSources.length,
          },
        });
      }
    }
    const investmentPolicy = await getLatestNeuroInvestmentPolicy(authUser.userId);
    const performanceAttribution = buildNeuroPerformanceAttribution({
      engine,
      marketData: payloadWithLibrary.marketData,
      investmentPolicy,
      performanceInput: payloadWithLibrary.performanceAttributionInput,
      generatedAt: businessQualityAnalysis.generatedAt,
    });
    const performanceAttributionForNarrative = {
      ...performanceAttribution,
      calculationInput: undefined,
    };
    const capitalAllocationDashboard = buildCapitalAllocationDashboard({
      language: payloadWithLibrary.language,
      availableCapital: payloadWithLibrary.availableCapital,
      focusTicker: payloadWithLibrary.focusTicker,
      engine,
      marketData: payloadWithLibrary.marketData,
      investmentPolicy,
      portfolioExposureMap: capitalComparisonExposureMap,
      businessQualityAnalysis,
      independentBearCaseAnalysis,
      generatedAt: businessQualityAnalysis.generatedAt,
    });
    const financialDataIntegrity = mergeFinancialIntegrityManifests([
      engine.financialDataIntegrity,
      performanceAttribution.financialDataIntegrity,
      capitalAllocationDashboard.financialDataIntegrity,
    ], businessQualityAnalysis.generatedAt);
    const filingsIndexed = (payloadWithLibrary.uploadedFilings ?? []).filter((filing) =>
      String(filing.vectorStoreId ?? "").trim()
    ).length;
    const decisionSupport = buildNeuroDecisionSupport({
      engine,
      policy: investmentPolicy,
      focusTicker: payloadWithLibrary.focusTicker,
      marketData: payloadWithLibrary.marketData,
      vectorStoreCount: vectorStoreIds.length,
      filingsIndexed,
      privateMethodologyReady: Boolean(String(process.env.NEURO_ANALYSIS_CFA_VECTOR_STORE_ID ?? "").trim()),
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
      aiTradeProposalsEnabled: emergencyControls.aiTradeProposalsEnabled,
    });
    let positionExitReview = originalInvestmentThesis
      ? buildPositionExitReviewFallback({
          originalThesis: originalInvestmentThesis,
          currentPrice: focusPosition?.currentPrice,
          language: payloadWithLibrary.language,
        })
      : null;
    let positionExitReviewResponse: any = null;
    let positionExitReviewWebSources: Array<{ url: string; title?: string | null }> = [];
    if (originalInvestmentThesis) {
      let positionExitReviewCandidate: any = null;
      try {
        const createPositionExitReviewResponse = (reasoningEffort?: string) =>
          client.responses.create({
            model: MODEL,
            reasoning: neuroReasoningConfig(MODEL, reasoningEffort) as any,
            instructions: withMasterInvestmentSystemPrinciple(
              POSITION_EXIT_REVIEW_PROMPT,
              FINANCIAL_DATA_INTEGRITY_PROMPT,
              INVESTMENT_PROBABILITY_INTEGRITY_PROMPT
            ),
            input: appendFinancialIntegrityLedger(
              buildPositionExitReviewInput({
                language: payloadWithLibrary.language,
                originalThesis: originalInvestmentThesis,
                investmentThesisReview,
                company: focusMarketItem?.company ?? {},
                annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
                uploadedFilings: payloadWithLibrary.uploadedFilings ?? [],
                currentValuation: focusPosition?.reverseDcf ?? null,
                portfolioEngine: { ...engine, exposureMap: portfolioExposureMap },
                investmentPolicy,
                thesisContext: payloadWithLibrary.thesisContext ?? [],
                businessQualityAnalysis,
                managementCapitalAllocationAnalysis,
                earningsQualityAccountingRiskAnalysis,
                independentBearCaseAnalysis,
              }),
              engine.financialDataIntegrity
            ),
            tools: businessQualityTools,
            include: businessQualityInclude.length > 0 ? (businessQualityInclude as any) : undefined,
            max_output_tokens: 9_000,
            metadata: {
              feature: "neuro_position_exit_review",
              user_id: authUser.userId,
              original_thesis_id: originalInvestmentThesis.id,
            },
          });

        positionExitReviewResponse = await createPositionExitReviewResponse();
        if (responseNeedsRetry(positionExitReviewResponse)) {
          positionExitReviewResponse = await createPositionExitReviewResponse("low");
        }
        if (!responseNeedsRetry(positionExitReviewResponse)) {
          positionExitReviewCandidate = auditAiResearchPayload(
            parseAgentJson(positionExitReviewResponse.output_text),
            engine.financialDataIntegrity
          );
        }
      } catch (positionExitReviewError) {
        console.warn(
          "[neuro-analysis/analyze] Position Exit Review fell back to insufficient evidence:",
          positionExitReviewError
        );
      }
      positionExitReviewWebSources = positionExitReviewResponse
        ? extractNeuroWebSources(positionExitReviewResponse)
        : [];
      positionExitReview = constrainPositionExitReviewEvidence({
        review: normalizePositionExitReview({
          candidate: positionExitReviewCandidate,
          fallback:
            positionExitReview ??
            buildPositionExitReviewFallback({
              originalThesis: originalInvestmentThesis,
              currentPrice: focusPosition?.currentPrice,
              language: payloadWithLibrary.language,
            }),
          originalThesis: originalInvestmentThesis,
        }),
        originalThesis: originalInvestmentThesis,
        uploadedFilings: payloadWithLibrary.uploadedFilings,
        annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
        webSources: positionExitReviewWebSources,
        valuationModel: focusPosition?.reverseDcf ?? null,
        portfolioEngine: { ...engine, exposureMap: portfolioExposureMap },
        investmentPolicy,
        thesisContext: payloadWithLibrary.thesisContext,
      });
      if (positionExitReviewResponse) {
        await recordAiUsage({
          userId: authUser.userId,
          requestId: req.headers.get("x-request-id"),
          feature: "neuro_position_exit_review",
          category: "market_intelligence",
          operation: "compare_purchase_record_before_position_reconsideration",
          model: String((positionExitReviewResponse as any)?.model || MODEL),
          usage: (positionExitReviewResponse as any)?.usage,
          apiKind: "responses",
          fileSearchCalls: countResponseFileSearchCalls(positionExitReviewResponse),
          metadata: {
            responseId: positionExitReviewResponse.id,
            originalThesisId: originalInvestmentThesis.id,
            originalThesisHash: originalInvestmentThesis.content_hash,
            reviewStatus: positionExitReview.status,
            primaryReason: positionExitReview.primaryReason,
            automaticTradingDecision: false,
            humanDecisionRequired: true,
            webSourceCount: positionExitReviewWebSources.length,
          },
        });
      }
    }

    const responseInput = [
      buildNeuroAnalysisInput(payloadWithLibrary),
      "",
      "Business Quality Analysis completed first without price or valuation data:",
      JSON.stringify(businessQualityAnalysis, null, 2),
      "",
      "Use that dossier as the business-quality source of truth. Do not reduce its 20 dimensions to a score.",
      "",
      "Management and Capital Allocation Analysis completed from documented actions before valuation:",
      JSON.stringify(managementCapitalAllocationAnalysis, null, 2),
      "",
      "Use observable decisions and outcomes only. Do not infer management personality, honesty, intelligence, competence, motives, or character.",
      "",
      "Earnings Quality and Accounting Risk Analysis completed before valuation:",
      JSON.stringify(earningsQualityAccountingRiskAnalysis, null, 2),
      "",
      "Treat anomalies as investigation prompts, not fraud findings. Use the supplied formulas and source-linked multi-year relationships.",
      "",
      "Independent Bear Case Analysis completed before this final report and without access to any Bull Agent or final recommendation:",
      JSON.stringify(independentBearCaseAnalysis, null, 2),
      "",
      "Use it as an adversarial evidence dossier, not as an investment decision. Do not add probabilities or manufacture unsupported bear claims.",
      "",
      "Portfolio Exposure Map completed from holding-level evidence:",
      JSON.stringify(portfolioExposureMap, null, 2),
      "",
      "Use this map to explain shared economic dependencies across holdings. Ticker count and sector labels are not sufficient diversification analysis. Do not automatically recommend diversification, rebalancing, or trades.",
      "",
      "Macro Context Agent completed with observed data, market expectations, third-party forecasts, and AI interpretation kept separate:",
      JSON.stringify(macroContext, null, 2),
      "",
      "Use macro information as context only. Explain documented transmission into each company's economics. Do not convert a macro forecast into market timing or a BUY/SELL instruction.",
      "",
      "Capital Allocation Dashboard comparing the same dollar across available alternatives:",
      JSON.stringify(capitalAllocationDashboard, null, 2),
      "",
      "Do not rank these alternatives or infer a target allocation. Cash is a valid portfolio state and available capital does not have to be deployed. Include Treasury or cash-management alternatives only when the configured investment universe supports them.",
      "",
      "Deterministic Performance Attribution Engine:",
      JSON.stringify(performanceAttributionForNarrative, null, 2),
      "",
      "These performance calculations are authoritative deterministic outputs. Do not recalculate, estimate, fill missing components with zero, or treat contributions and withdrawals as investment performance. A cost-basis snapshot is not TWR or investor return.",
      "",
      "Permanent original investment thesis review (when a purchase-date thesis exists):",
      JSON.stringify(investmentThesisReview, null, 2),
      "",
      "This status compares current evidence with the immutable original thesis. It is not an automatic buy, sell, hold, add, reduce, or execution decision.",
      "",
      "Position Exit Review (when a purchase-date thesis exists):",
      JSON.stringify(positionExitReview, null, 2),
      "",
      "This review only determines what changed and whether documented evidence requires human review. A rising or falling price alone cannot establish thesis success or failure, and the review cannot issue a trade instruction.",
      "",
      "Deterministic engine snapshot:",
      JSON.stringify(engine, null, 2),
      "",
      "Financial Data Integrity Ledger. Every material financial number in the report must cite an available record from this ledger on the same line using [[FIN:<record id>]]. Missing values must be written exactly as DATA NOT AVAILABLE:",
      JSON.stringify(financialDataIntegrity, null, 2),
      "",
      "Approved/draft investment policy snapshot:",
      JSON.stringify(investmentPolicy ?? null, null, 2),
      "",
      "Deterministic investment decision support:",
      JSON.stringify(decisionSupport, null, 2),
    ].join("\n");
    const createResponse = (reasoningEffort?: string) =>
      client.responses.create({
        model: MODEL,
        reasoning: neuroReasoningConfig(MODEL, reasoningEffort) as any,
        instructions: withMasterInvestmentSystemPrinciple(
          NEURO_ANALYSIS_SYSTEM_PROMPT,
          emergencyControls.aiTradeProposalsEnabled
            ? null
            : AI_TRADE_PROPOSAL_DISABLED_PROMPT
        ),
        input: responseInput,
        tools,
        include: include.length > 0 ? (include as any) : undefined,
        max_output_tokens: 6000,
        metadata: {
          feature: "neuro_analysis",
          user_id: authUser.userId,
        },
      });

    let response = await createResponse();
    if (responseNeedsRetry(response)) {
      console.warn(
        `[neuro-analysis/analyze] Unusable model output (${emptyResponseReason(response)}); retrying with low reasoning.`
      );
      response = await createResponse("low");
    }
    if (responseNeedsRetry(response)) {
      throw new Error(`The analysis engine did not produce a final report (${emptyResponseReason(response)}).`);
    }

    const missing10k = missingIndexedFilingTickers(payloadWithLibrary, "10-K");
    const missing10q = missingIndexedFilingTickers(payloadWithLibrary, "10-Q");
    const parsedAgent = auditAiResearchPayload(
      parseAgentJson(response.output_text),
      financialDataIntegrity
    ) as any;
    const rawReport =
      typeof parsedAgent?.reportMarkdown === "string"
        ? parsedAgent.reportMarkdown
        : typeof parsedAgent?.report === "string"
        ? parsedAgent.report
        : response.output_text;
    const prevaluationWebSources = mergeWebSources(
      businessQualityWebSources,
      earningsQualityWebSources,
      bearCaseWebSources,
      portfolioExposureWebSources,
      macroContextWebSources,
      thesisReviewWebSources,
      positionExitReviewWebSources
    );
    const webSources = mergeWebSources(prevaluationWebSources, extractNeuroWebSources(response));
    const integrityAudit = enforceResearchFinancialIntegrity(
      sanitizeAgentReport(rawReport),
      financialDataIntegrity
    );
    const investmentProbabilityAudit = enforceInvestmentProbabilityIntegrity(
      integrityAudit.report
    );
    const aiTradeProposalAudit = enforceAiTradeProposalControl(
      investmentProbabilityAudit.text,
      emergencyControls.aiTradeProposalsEnabled
    );
    const masterInvestmentSystemAudit = enforceMasterInvestmentSystemOutput(
      aiTradeProposalAudit.text
    );
    const report = appendNeuroWebSources(
      appendFinancialTraceabilityAppendix(
        masterInvestmentSystemAudit.text,
        financialDataIntegrity,
        integrityAudit.usedTraceIds
      ),
      webSources
    );
    if (!report.trim()) {
      throw new Error("The analysis engine produced an empty report.");
    }
    const tokenUsage = responseTokenUsage(response);
    const structured = {
      agent:
        parsedAgent && typeof parsedAgent === "object"
          ? { ...parsedAgent, reportMarkdown: report, report }
          : { reportMarkdown: report },
      engine,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
      portfolioExposureMap,
      macroContext,
      capitalAllocationDashboard,
      performanceAttribution,
      originalInvestmentThesis,
      investmentThesisReview,
      positionExitReview,
      investmentPolicy,
      decisionSupport,
      financialDataIntegrity,
      financialDataIntegrityAudit: {
        missingValueDisplay: DATA_NOT_AVAILABLE,
        replacedClaimCount: integrityAudit.replacedClaimCount,
        citedRecordIds: integrityAudit.usedTraceIds,
      },
      investmentProbabilityIntegrityAudit: {
        blockedClaimCount: investmentProbabilityAudit.blockedClaimCount,
        validatedStatisticalModelUsed:
          investmentProbabilityAudit.validatedStatisticalModelUsed,
      },
      masterInvestmentSystemAudit: {
        policyVersion: masterInvestmentSystemAudit.policyVersion,
        blockedClaimCount: masterInvestmentSystemAudit.blockedClaimCount,
        disposition: decisionSupport.systemDisposition,
      },
      emergencyPortfolioControlAudit: {
        aiTradeProposalsEnabled: emergencyControls.aiTradeProposalsEnabled,
        blockedProposalCount: aiTradeProposalAudit.blockedProposalCount,
        controlVersion: emergencyControls.version,
      },
      webSources,
    };

    const savedCase = await upsertNeuroCase({
      userId: authUser.userId,
      caseId: payload.caseId ?? null,
      title:
        payload.caseTitle ||
        engine.positions[0]?.company?.name ||
        engine.positions[0]?.ticker ||
        "Research case",
      focusTicker: engine.positions[0]?.ticker ?? payload.holdings[0]?.ticker ?? null,
      researchGoal: payload.question ?? null,
      holdings: payloadWithLibrary.holdings,
      selectedAccountId: payload.selectedAccountId ?? null,
      brokerSnapshot: payload.brokerSnapshot ?? {},
      marketData: payloadWithLibrary.marketData ?? {},
      readiness: {
        documentReadiness: engine.documentReadiness,
        riskFlags: engine.riskFlags,
        businessQualityAnalysis,
        managementCapitalAllocationAnalysis,
        earningsQualityAccountingRiskAnalysis,
        independentBearCaseAnalysis,
        portfolioExposureMap,
        macroContext,
        capitalAllocationDashboard,
        performanceAttribution,
        originalInvestmentThesis,
        investmentThesisReview,
        positionExitReview,
        decisionSupport,
        investmentPolicy,
        readiness: payload.readiness ?? {},
      },
    });
    const caseId = savedCase?.id ? String(savedCase.id) : null;

    const savedReport = await insertNeuroReport({
      userId: authUser.userId,
      caseId,
      responseId: response.id,
      model: MODEL,
      reportText: report,
      structured,
      engine,
      assumptions: engine.assumptions,
      holdingsSnapshot: payloadWithLibrary.holdings,
      marketDataSnapshot: payloadWithLibrary.marketData ?? {},
      filingsUsed: payloadWithLibrary.uploadedFilings,
      missingFilings: { "10-K": missing10k, "10-Q": missing10q },
      vectorStoresUsed: vectorStoreIds,
      requiresFilings: missing10k.length > 0 || missing10q.length > 0,
      usage: tokenUsage,
    });
    if (originalInvestmentThesis && investmentThesisReview && caseId) {
      const comparisonSnapshot = {
        originalThesisId: originalInvestmentThesis.id,
        originalThesisContentHash: originalInvestmentThesis.content_hash,
        reportId: savedReport?.id ?? null,
        review: investmentThesisReview,
        company: focusMarketItem?.company ?? {},
        annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
        filingsUsed: payloadWithLibrary.uploadedFilings ?? [],
        businessQualityAnalysis,
        managementCapitalAllocationAnalysis,
        earningsQualityAccountingRiskAnalysis,
        independentBearCaseAnalysis,
        portfolioExposureMap,
        macroContext,
        capitalAllocationDashboard,
        performanceAttribution,
        valuationModel: focusPosition?.reverseDcf ?? null,
        webSources: thesisReviewWebSources,
      };
      await insertInvestmentThesisReview({
        userId: authUser.userId,
        caseId,
        originalThesisId: originalInvestmentThesis.id,
        reportId: savedReport?.id ? String(savedReport.id) : null,
        review: investmentThesisReview,
        comparisonSnapshot,
        contentHash: stableHash({
          originalThesisContentHash: originalInvestmentThesis.content_hash,
          reportId: savedReport?.id ?? response.id,
          review: investmentThesisReview,
          comparisonSnapshot,
        }),
      });
    }
    if (originalInvestmentThesis && positionExitReview && caseId) {
      const comparisonSnapshot = {
        originalThesisId: originalInvestmentThesis.id,
        originalThesisContentHash: originalInvestmentThesis.content_hash,
        reportId: savedReport?.id ?? null,
        review: positionExitReview,
        thesisReview: investmentThesisReview,
        company: focusMarketItem?.company ?? {},
        annualFundamentals: focusMarketItem?.annualFundamentals ?? [],
        filingsUsed: payloadWithLibrary.uploadedFilings ?? [],
        currentValuation: focusPosition?.reverseDcf ?? null,
        portfolioEngine: {
          ...engine,
          exposureMap: portfolioExposureMap,
          macroContext,
          capitalAllocationDashboard,
          performanceAttribution,
        },
        investmentPolicy,
        thesisContext: payloadWithLibrary.thesisContext ?? [],
        businessQualityAnalysis,
        managementCapitalAllocationAnalysis,
        earningsQualityAccountingRiskAnalysis,
        independentBearCaseAnalysis,
        portfolioExposureMap,
        macroContext,
        capitalAllocationDashboard,
        performanceAttribution,
        webSources: positionExitReviewWebSources,
      };
      await insertPositionExitReview({
        userId: authUser.userId,
        caseId,
        originalThesisId: originalInvestmentThesis.id,
        reportId: savedReport?.id ? String(savedReport.id) : null,
        review: positionExitReview,
        comparisonSnapshot,
        contentHash: stableHash({
          originalThesisContentHash: originalInvestmentThesis.content_hash,
          reportId: savedReport?.id ?? response.id,
          review: positionExitReview,
          comparisonSnapshot,
        }),
      });
    }
    let automaticCommitteePacketId: string | null = null;
    if (decisionSupport.suggestedState === "propose" && caseId && savedReport?.id) {
      const generatedAt = new Date().toISOString();
      const reportSnapshot = {
        id: savedReport.id,
        caseId,
        model: MODEL,
        reportText: report,
        structured,
        assumptions: engine.assumptions,
        holdingsSnapshot: payloadWithLibrary.holdings,
        marketDataSnapshot: payloadWithLibrary.marketData ?? {},
        filingsUsed: payloadWithLibrary.uploadedFilings,
        missingFilings: { "10-K": missing10k, "10-Q": missing10q },
        requiresFilings: missing10k.length > 0 || missing10q.length > 0,
        createdAt: savedReport.created_at ?? generatedAt,
      };
      const reportForPacket = {
        ...savedReport,
        report_text: report,
        structured,
        engine,
        assumptions: engine.assumptions,
        holdings_snapshot: payloadWithLibrary.holdings,
        market_data_snapshot: payloadWithLibrary.marketData ?? {},
        filings_used: payloadWithLibrary.uploadedFilings,
        missing_filings: { "10-K": missing10k, "10-Q": missing10q },
        requires_filings: missing10k.length > 0 || missing10q.length > 0,
      };
      const sources = buildCommitteeSourceManifest({
        ticker: decisionSupport.focusTicker,
        report: reportForPacket,
        policy: investmentPolicy,
        generatedAt,
      });
      const packet = buildCommitteePacketFallback({
        ticker: decisionSupport.focusTicker,
        report: reportForPacket,
        policy: investmentPolicy,
        sources,
        generatedAt,
      });
      const version = await nextInvestmentCommitteePacketVersion({
        userId: authUser.userId,
        caseId,
        ticker: decisionSupport.focusTicker,
      });
      const evidenceSnapshot = {
        businessQualityAnalysis,
        managementCapitalAllocationAnalysis,
        earningsQualityAccountingRiskAnalysis,
        independentBearCaseAnalysis,
        portfolioExposureMap,
        macroContext,
        capitalAllocationDashboard,
        performanceAttribution,
        originalInvestmentThesis,
        investmentThesisReview,
        positionExitReview,
        decisionSupport,
        filingsUsed: payloadWithLibrary.uploadedFilings,
        missingFilings: { "10-K": missing10k, "10-Q": missing10q },
        requiresFilings: missing10k.length > 0 || missing10q.length > 0,
        vectorStoreCount: vectorStoreIds.length,
      };
      const contentHash = stableHash({ packet, sources, reportSnapshot, engine, investmentPolicy });
      const automaticPacket = await insertInvestmentCommitteePacket({
        userId: authUser.userId,
        caseId,
        reportId: String(savedReport.id),
        policyId: investmentPolicy?.id ?? null,
        ticker: decisionSupport.focusTicker,
        version,
        packet,
        sources,
        reportSnapshot,
        engineSnapshot: engine,
        policySnapshot: investmentPolicy ?? {},
        evidenceSnapshot,
        contentHash,
        generatedBy: "deterministic_fallback",
      });
      automaticCommitteePacketId = automaticPacket?.id ? String(automaticPacket.id) : null;
    }
    await insertNeuroSnapshot({
      userId: authUser.userId,
      caseId,
      snapshotType: "analysis",
      payload: {
        reportId: savedReport?.id ?? null,
        automaticCommitteePacketId,
        portfolio: engine.portfolio,
        allocation: engine.allocation,
        simulation: engine.simulation,
        businessQualityAnalysis,
        managementCapitalAllocationAnalysis,
        earningsQualityAccountingRiskAnalysis,
        independentBearCaseAnalysis,
        portfolioExposureMap,
        macroContext,
        capitalAllocationDashboard,
        performanceAttribution,
        originalInvestmentThesis,
        investmentThesisReview,
        positionExitReview,
        decisionSupport,
      },
    });
    await recordNeuroUsage({
      userId: authUser.userId,
      caseId,
      eventType: "analysis",
      model: MODEL,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      metadata: {
        responseId: response.id,
        reportId: savedReport?.id ?? null,
        vectorStoreCount: vectorStoreIds.length,
        webSearchEnabled: Boolean(webSearchTool),
        webSourceCount: webSources.length,
        holdings: payloadWithLibrary.holdings.length,
      },
    });
    await recordAiUsage({
      userId: authUser.userId,
      requestId: req.headers.get("x-request-id"),
      feature: "neuro_analysis",
      category: "market_intelligence",
      operation: "portfolio_research",
      model: String((response as any)?.model || MODEL),
      usage: (response as any)?.usage,
      apiKind: "responses",
      fileSearchCalls: countResponseFileSearchCalls(response),
      metadata: {
        responseId: response.id,
        vectorStoreCount: vectorStoreIds.length,
        webSearchEnabled: Boolean(webSearchTool),
        webSourceCount: webSources.length,
      },
    });
    return NextResponse.json({
      report,
      structured,
      engine,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
      portfolioExposureMap,
      macroContext,
      capitalAllocationDashboard,
      performanceAttribution,
      originalInvestmentThesis,
      investmentThesisReview,
      positionExitReview,
      investmentPolicy,
      decisionSupport,
      financialDataIntegrity,
      caseId,
      reportId: savedReport?.id ?? null,
      automaticCommitteePacketId,
      responseId: response.id,
      webSources,
      vectorStoresUsed: vectorStoreIds,
      filingsUsed: payloadWithLibrary.uploadedFilings,
      missingFilings: { "10-K": missing10k, "10-Q": missing10q },
      requiresFilings: missing10k.length > 0 || missing10q.length > 0,
    });
  } catch (error: any) {
    console.error("[neuro-analysis/analyze] error:", error);
    return NextResponse.json(
      { error: error?.message || "Neuro Analysis failed." },
      { status: 500 }
    );
  }
}
