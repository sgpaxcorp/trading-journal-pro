import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requirePortfolioWriteAccess } from "@/lib/emergencyPortfolioControls";
import {
  NEURO_DECISION_STATES,
  type NeuroDecisionState,
} from "@/lib/neuroInvestmentGovernance";
import {
  getLatestNeuroInvestmentPolicy,
  getNeuroCase,
  insertNeuroInvestmentDecision,
  listNeuroInvestmentDecisions,
} from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanDecisionState(value: unknown): NeuroDecisionState {
  const state = cleanText(value, 80) as NeuroDecisionState;
  return NEURO_DECISION_STATES.includes(state) ? state : "investigate";
}

function cleanTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const url = new URL(req.url);
    const caseId = cleanText(url.searchParams.get("caseId"), 80);
    if (caseId) {
      const researchCase = await getNeuroCase(authUser.userId, caseId);
      if (!researchCase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }
    const decisions = await listNeuroInvestmentDecisions({
      userId: authUser.userId,
      caseId: caseId || null,
      limit: 50,
    });
    return NextResponse.json({ decisions });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load investment decisions." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;
    const emergencyGate = await requirePortfolioWriteAccess();
    if (emergencyGate) return emergencyGate;

    const limiter = await rateLimit(`neuro-analysis:decision:${authUser.userId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const caseId = cleanText(body?.caseId, 80);
    if (!caseId) {
      return NextResponse.json({ error: "A saved research case is required." }, { status: 400 });
    }
    const researchCase = await getNeuroCase(authUser.userId, caseId);
    if (!researchCase) return NextResponse.json({ error: "Case not found." }, { status: 404 });

    const reportId = cleanText(body?.reportId, 80) || null;
    let report: any = null;
    if (reportId) {
      const { data, error } = await supabaseAdmin
        .from("neuro_analysis_reports")
        .select("id,case_id,structured,engine,filings_used,missing_filings,vector_stores_used,created_at")
        .eq("id", reportId)
        .eq("user_id", authUser.userId)
        .maybeSingle();
      if (error) throw error;
      if (!data || String(data.case_id ?? "") !== caseId) {
        return NextResponse.json({ error: "Report not found for this case." }, { status: 404 });
      }
      report = data;
    }

    const policy = await getLatestNeuroInvestmentPolicy(authUser.userId);
    const decisionState = cleanDecisionState(body?.decisionState);
    const suggestedState = body?.suggestedState ? cleanDecisionState(body.suggestedState) : null;
    const ticker = cleanTicker(body?.ticker || researchCase.focus_ticker);
    const evidenceSnapshot = {
      decisionSupport: body?.decisionSupport ?? report?.structured?.decisionSupport ?? {},
      reportId,
      reportCreatedAt: report?.created_at ?? null,
      filingsUsed: report?.filings_used ?? [],
      missingFilings: report?.missing_filings ?? {},
      vectorStoresUsed: report?.vector_stores_used ?? [],
      clientEvidence: body?.evidenceSnapshot ?? {},
    };
    const proposalSnapshot = {
      engine: body?.engineSnapshot ?? report?.engine ?? report?.structured?.engine ?? {},
      marketData: body?.marketData ?? {},
    };
    const policySnapshot = policy ?? {};
    const createdAt = new Date().toISOString();
    const immutableHash = stableHash({
      userId: authUser.userId,
      caseId,
      reportId,
      ticker,
      decisionState,
      suggestedState,
      decisionNote: cleanText(body?.decisionNote, 4000),
      evidenceSnapshot,
      policySnapshot,
      createdAt,
    });

    await insertNeuroInvestmentDecision({
      userId: authUser.userId,
      caseId,
      reportId,
      policyId: policy?.id ?? null,
      ticker,
      decisionState,
      suggestedState,
      decisionNote: body?.decisionNote,
      rationale: body?.rationale,
      evidenceSnapshot,
      proposalSnapshot,
      policySnapshot,
      immutableHash,
    });

    const decisions = await listNeuroInvestmentDecisions({
      userId: authUser.userId,
      caseId,
      limit: 50,
    });

    return NextResponse.json({ ok: true, decisions });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not save investment decision." },
      { status: 500 }
    );
  }
}
