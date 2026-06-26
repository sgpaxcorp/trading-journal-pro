import { NextResponse } from "next/server";
import OpenAI from "openai";

import {
  buildNeuroAnalysisInput,
  NEURO_ANALYSIS_SYSTEM_PROMPT,
  type NeuroAnalysisRequest,
} from "@/lib/neuroAnalysisAgent";
import { getAuthUser } from "@/lib/authServer";
import { buildNeuroAnalysisEngine } from "@/lib/neuroAnalysisEngine";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import {
  insertNeuroReport,
  insertNeuroSnapshot,
  upsertNeuroCase,
} from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_NEURO_ANALYSIS_MODEL || "gpt-4.1";

type FilingMetadata = NonNullable<NeuroAnalysisRequest["uploadedFilings"]>[number];

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

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

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

    const payload = (await req.json()) as NeuroAnalysisRequest & {
      caseId?: string | null;
      caseTitle?: string | null;
      selectedAccountId?: string | null;
      brokerSnapshot?: unknown;
      readiness?: unknown;
    };
    if (!Array.isArray(payload?.holdings) || payload.holdings.length === 0) {
      return NextResponse.json({ error: "At least one holding is required." }, { status: 400 });
    }

    const quota = await checkNeuroQuota(authUser.userId, "analysis");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Monthly analysis quota exceeded.", quota },
        { status: 429 }
      );
    }

    const savedFilings = await loadSavedFilingLibrary(authUser.userId, payload.holdings);
    const payloadWithLibrary: NeuroAnalysisRequest = {
      ...payload,
      uploadedFilings: mergeFilings(sanitizeClientFilings(payload.uploadedFilings ?? []), savedFilings),
    };
    const engine = buildNeuroAnalysisEngine({
      holdings: payloadWithLibrary.holdings,
      marketData: payloadWithLibrary.marketData,
      filings: payloadWithLibrary.uploadedFilings,
      assumptions: payloadWithLibrary.assumptions,
    });

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
        readiness: payload.readiness ?? {},
      },
    });
    const caseId = savedCase?.id ? String(savedCase.id) : null;

    const vectorStoreIds = cleanVectorStoreIds(payloadWithLibrary.uploadedFilings ?? []);
    const tools =
      vectorStoreIds.length > 0
        ? [
            {
              type: "file_search" as const,
              vector_store_ids: vectorStoreIds,
              max_num_results: 20,
            },
          ]
        : [];

    const response = await client.responses.create({
      model: MODEL,
      instructions: NEURO_ANALYSIS_SYSTEM_PROMPT,
      input: [
        buildNeuroAnalysisInput(payloadWithLibrary),
        "",
        "Deterministic engine snapshot:",
        JSON.stringify(engine, null, 2),
      ].join("\n"),
      tools,
      include: tools.length > 0 ? ["file_search_call.results"] : undefined,
      max_output_tokens: 3500,
      metadata: {
        feature: "neuro_analysis",
        user_id: authUser.userId,
      },
    });

    const missing10k = missingIndexedFilingTickers(payloadWithLibrary, "10-K");
    const missing10q = missingIndexedFilingTickers(payloadWithLibrary, "10-Q");
    const parsedAgent = parseAgentJson(response.output_text);
    const rawReport =
      typeof parsedAgent?.reportMarkdown === "string"
        ? parsedAgent.reportMarkdown
        : typeof parsedAgent?.report === "string"
        ? parsedAgent.report
        : response.output_text;
    const report = sanitizeAgentReport(rawReport);
    const tokenUsage = responseTokenUsage(response);
    const structured = {
      agent: parsedAgent ?? { reportMarkdown: report },
      engine,
    };

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
    await insertNeuroSnapshot({
      userId: authUser.userId,
      caseId,
      snapshotType: "analysis",
      payload: {
        reportId: savedReport?.id ?? null,
        portfolio: engine.portfolio,
        allocation: engine.allocation,
        simulation: engine.simulation,
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
        holdings: payloadWithLibrary.holdings.length,
      },
    });

    return NextResponse.json({
      report,
      structured,
      engine,
      caseId,
      reportId: savedReport?.id ?? null,
      responseId: response.id,
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
