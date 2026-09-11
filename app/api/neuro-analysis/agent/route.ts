import { NextResponse } from "next/server";
import OpenAI from "openai";

import { getAuthUser } from "@/lib/authServer";
import { countResponseFileSearchCalls, recordAiUsage, requireAiBudget } from "@/lib/aiUsageServer";
import {
  buildNeuroAnalysisQuestionInput,
  neuroResponseTokenUsage,
  NEURO_ANALYSIS_QA_SYSTEM_PROMPT,
  sanitizeNeuroAnalysisOutput,
} from "@/lib/neuroAnalysisAgent";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { getNeuroCase, insertNeuroSnapshot, listNeuroReports } from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL =
  process.env.OPENAI_NEURO_AGENT_MODEL ||
  process.env.OPENAI_NEURO_ANALYSIS_MODEL ||
  "gpt-4.1";

function cleanQuestion(value: unknown) {
  return String(value ?? "").trim().slice(0, 3_000);
}

function normalizeTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function tickersFromContext(researchCase: any, clientContext: any) {
  const tickers = new Set<string>();
  const addTicker = (value: unknown) => {
    const ticker = normalizeTicker(value);
    if (ticker) tickers.add(ticker);
  };

  addTicker(researchCase?.focus_ticker);
  addTicker(clientContext?.focusTicker);

  for (const holding of Array.isArray(researchCase?.holdings) ? researchCase.holdings : []) {
    addTicker((holding as any)?.ticker);
  }
  for (const holding of Array.isArray(clientContext?.holdings) ? clientContext.holdings : []) {
    addTicker((holding as any)?.ticker);
  }

  return Array.from(tickers);
}

async function loadFilingMetadata(userId: string, tickers: string[]) {
  if (!tickers.length) return [];
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_filings")
    .select("ticker,form,fiscal_year,period,period_end,file_name,openai_file_id,vector_store_id,bytes,usage_bytes,created_at,last_verified_at")
    .eq("user_id", userId)
    .in("ticker", tickers)
    .is("deleted_at", null)
    .order("fiscal_year", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(80);

  if (error || !Array.isArray(data)) return [];
  return data;
}

async function loadPriorAgentMemory(userId: string, caseId?: string | null) {
  let query = supabaseAdmin
    .from("neuro_analysis_snapshots")
    .select("snapshot_type,payload,created_at")
    .eq("user_id", userId)
    .eq("snapshot_type", "agent_qa")
    .order("created_at", { ascending: false })
    .limit(8);

  if (caseId) query = query.eq("case_id", caseId);
  else query = query.is("case_id", null);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  return data.map((row: any) => ({
    createdAt: row.created_at,
    question: row.payload?.question ?? null,
    answer: row.payload?.answer ?? null,
  }));
}

function vectorStoreIdsFrom(filings: any[], reports: any[]) {
  const ids = new Set<string>();
  const cfaStoreId = String(process.env.NEURO_ANALYSIS_CFA_VECTOR_STORE_ID ?? "").trim();
  if (cfaStoreId) ids.add(cfaStoreId);

  for (const filing of filings) {
    const id = String(filing?.vector_store_id ?? "").trim();
    if (id) ids.add(id);
  }

  for (const report of reports) {
    for (const id of Array.isArray(report?.vector_stores_used) ? report.vector_stores_used : []) {
      const clean = String(id ?? "").trim();
      if (clean) ids.add(clean);
    }
  }

  return Array.from(ids);
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const rate = await rateLimit(`neuro-analysis:agent:${authUser.userId}`, {
      limit: 8,
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

    const body = await req.json().catch(() => ({}));
    const question = cleanQuestion(body?.question);
    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const caseId = String(body?.caseId ?? "").trim() || null;
    const clientContext = body?.clientContext && typeof body.clientContext === "object" ? body.clientContext : {};

    const quota = await checkNeuroQuota(authUser.userId, "agent_chat");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Monthly Neuro agent question quota exceeded.", quota },
        { status: 429 }
      );
    }

    const budgetGate = await requireAiBudget({ userId: authUser.userId, category: "market_intelligence" });
    if (budgetGate) return budgetGate;

    const researchCase = caseId ? await getNeuroCase(authUser.userId, caseId) : null;
    if (caseId && !researchCase) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }

    const reports = caseId ? await listNeuroReports(authUser.userId, caseId) : [];
    const tickers = tickersFromContext(researchCase, clientContext);
    const [filings, priorMemory] = await Promise.all([
      loadFilingMetadata(authUser.userId, tickers),
      loadPriorAgentMemory(authUser.userId, caseId),
    ]);
    const vectorStoreIds = vectorStoreIdsFrom(filings, reports);
    const tools =
      vectorStoreIds.length > 0
        ? [
            {
              type: "file_search" as const,
              vector_store_ids: vectorStoreIds,
              max_num_results: 16,
            },
          ]
        : [];

    const response = await client.responses.create({
      model: MODEL,
      instructions: NEURO_ANALYSIS_QA_SYSTEM_PROMPT,
      input: buildNeuroAnalysisQuestionInput({
        question,
        caseContext: researchCase,
        latestReports: reports,
        filings,
        priorMemory,
        clientContext,
      }),
      tools,
      include: tools.length > 0 ? ["file_search_call.results"] : undefined,
      max_output_tokens: 2200,
      metadata: {
        feature: "neuro_analysis_agent",
        user_id: authUser.userId,
        case_id: caseId ?? "",
      },
    });

    const answer = sanitizeNeuroAnalysisOutput(response.output_text);
    const tokenUsage = neuroResponseTokenUsage(response);

    await insertNeuroSnapshot({
      userId: authUser.userId,
      caseId,
      snapshotType: "agent_qa",
      payload: {
        question,
        answer,
        responseId: response.id,
        model: String((response as any)?.model || MODEL),
        tickers,
        vectorStoreCount: vectorStoreIds.length,
        reportCount: reports.length,
        filingCount: filings.length,
        usage: tokenUsage,
      },
    });

    await recordNeuroUsage({
      userId: authUser.userId,
      caseId,
      eventType: "agent_chat",
      model: MODEL,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      metadata: {
        responseId: response.id,
        vectorStoreCount: vectorStoreIds.length,
        reportCount: reports.length,
        filingCount: filings.length,
      },
    });

    await recordAiUsage({
      userId: authUser.userId,
      requestId: req.headers.get("x-request-id"),
      feature: "neuro_analysis",
      category: "market_intelligence",
      operation: "agent_question",
      model: String((response as any)?.model || MODEL),
      usage: (response as any)?.usage,
      apiKind: "responses",
      fileSearchCalls: countResponseFileSearchCalls(response),
      metadata: {
        responseId: response.id,
        caseId,
        vectorStoreCount: vectorStoreIds.length,
      },
    });

    return NextResponse.json({
      answer,
      responseId: response.id,
      model: String((response as any)?.model || MODEL),
      groundedContext: {
        caseLoaded: Boolean(researchCase),
        reports: reports.length,
        filings: filings.length,
        vectorStores: vectorStoreIds.length,
        priorMemory: priorMemory.length,
      },
    });
  } catch (error: any) {
    console.error("[neuro-analysis/agent] error:", error);
    return NextResponse.json(
      { error: error?.message || "Neuro Analysis agent failed." },
      { status: 500 }
    );
  }
}
