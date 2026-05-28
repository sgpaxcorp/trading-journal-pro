import { NextResponse } from "next/server";
import OpenAI from "openai";

import {
  buildNeuroAnalysisInput,
  NEURO_ANALYSIS_SYSTEM_PROMPT,
  type NeuroAnalysisRequest,
} from "@/lib/neuroAnalysisAgent";
import { getAuthUser } from "@/lib/authServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_NEURO_ANALYSIS_MODEL || "gpt-4.1";

function cleanVectorStoreIds(payload: NeuroAnalysisRequest): string[] {
  const ids = new Set<string>();
  const cfaStoreId = String(process.env.NEURO_ANALYSIS_CFA_VECTOR_STORE_ID ?? "").trim();
  if (cfaStoreId) ids.add(cfaStoreId);

  for (const filing of payload.uploadedFilings ?? []) {
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

    const payload = (await req.json()) as NeuroAnalysisRequest;
    if (!Array.isArray(payload?.holdings) || payload.holdings.length === 0) {
      return NextResponse.json({ error: "At least one holding is required." }, { status: 400 });
    }

    const savedFilings = await loadSavedFilingLibrary(authUser.userId, payload.holdings);
    const payloadWithLibrary: NeuroAnalysisRequest = {
      ...payload,
      uploadedFilings: mergeFilings(payload.uploadedFilings ?? [], savedFilings),
    };

    const vectorStoreIds = cleanVectorStoreIds(payloadWithLibrary);
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
      input: buildNeuroAnalysisInput(payloadWithLibrary),
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

    return NextResponse.json({
      report: response.output_text,
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
