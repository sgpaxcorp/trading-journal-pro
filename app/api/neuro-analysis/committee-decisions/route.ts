import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requirePortfolioWriteAccess } from "@/lib/emergencyPortfolioControls";
import { isCommitteeDecision } from "@/lib/neuroInvestmentCommittee";
import {
  getInvestmentCommitteePacket,
  getNeuroCase,
  insertInvestmentCommitteeDecision,
  listInvestmentCommitteeDecisions,
} from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

const HUMAN_CONFIRMATION = "HUMAN_COMMITTEE_DECISION";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
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
    const decisions = await listInvestmentCommitteeDecisions({
      userId: authUser.userId,
      caseId: caseId || null,
      limit: 50,
    });
    return NextResponse.json({ decisions });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load Investment Committee decisions." },
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

    const limiter = await rateLimit(`neuro-analysis:committee-decision:${authUser.userId}`, {
      limit: 20,
      windowMs: 60 * 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Investment Committee decision rate limit exceeded." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const packetId = cleanText(body?.packetId, 80);
    const decision = cleanText(body?.decision, 40).toUpperCase();
    const rationale = cleanText(body?.rationale, 8_000);
    const conditions = cleanText(body?.conditions, 8_000);
    const humanConfirmation = cleanText(body?.humanConfirmation, 80);

    if (!packetId || !isCommitteeDecision(decision)) {
      return NextResponse.json({ error: "A valid packet and committee decision are required." }, { status: 400 });
    }
    if (humanConfirmation !== HUMAN_CONFIRMATION) {
      return NextResponse.json(
        { error: "Explicit human committee confirmation is required. AI cannot record this decision." },
        { status: 400 }
      );
    }
    if (rationale.length < 12) {
      return NextResponse.json(
        { error: "Document the human rationale before recording the decision." },
        { status: 400 }
      );
    }

    const packet = await getInvestmentCommitteePacket(authUser.userId, packetId);
    if (!packet) return NextResponse.json({ error: "Committee packet not found." }, { status: 404 });
    const researchCase = await getNeuroCase(authUser.userId, String(packet.case_id));
    if (!researchCase) return NextResponse.json({ error: "Research case not found." }, { status: 404 });

    const prior = await listInvestmentCommitteeDecisions({
      userId: authUser.userId,
      caseId: String(packet.case_id),
      limit: 100,
    });
    if (prior.some((item: any) => String(item.packet_id) === packetId)) {
      return NextResponse.json(
        { error: "This exact packet version already has a final human decision. Create a new packet version to decide again." },
        { status: 409 }
      );
    }

    if (decision === "APPROVED") {
      const packetReady = packet.generation_status === "ready" && Boolean(packet.packet?.completeness?.isComplete);
      const policyActive = packet.policy_snapshot?.status === "active";
      const evidenceReady = !Boolean(packet.evidence_snapshot?.requiresFilings);
      const businessQualityAnalysis =
        packet.evidence_snapshot?.businessQualityAnalysis ??
        packet.report_snapshot?.structured?.businessQualityAnalysis ??
        null;
      const businessQualityReady =
        businessQualityAnalysis?.status === "not_applicable" ||
        (businessQualityAnalysis?.generatedBy === "ai_research" &&
          (businessQualityAnalysis?.status === "complete" || businessQualityAnalysis?.status === "provisional"));
      const managementCapitalAllocationAnalysis =
        packet.evidence_snapshot?.managementCapitalAllocationAnalysis ??
        packet.report_snapshot?.structured?.managementCapitalAllocationAnalysis ??
        null;
      const managementCapitalAllocationReady =
        managementCapitalAllocationAnalysis?.status === "not_applicable" ||
        (managementCapitalAllocationAnalysis?.generatedBy === "ai_research" &&
          (managementCapitalAllocationAnalysis?.status === "complete" ||
            managementCapitalAllocationAnalysis?.status === "provisional"));
      const earningsQualityAccountingRiskAnalysis =
        packet.evidence_snapshot?.earningsQualityAccountingRiskAnalysis ??
        packet.report_snapshot?.structured?.earningsQualityAccountingRiskAnalysis ??
        null;
      const earningsQualityReady =
        earningsQualityAccountingRiskAnalysis?.status === "not_applicable" ||
        (earningsQualityAccountingRiskAnalysis?.generatedBy === "ai_research" &&
          (earningsQualityAccountingRiskAnalysis?.status === "complete" ||
            earningsQualityAccountingRiskAnalysis?.status === "provisional"));
      const independentBearCaseAnalysis =
        packet.evidence_snapshot?.independentBearCaseAnalysis ??
        packet.report_snapshot?.structured?.independentBearCaseAnalysis ??
        null;
      const independentBearCaseReady =
        independentBearCaseAnalysis?.status === "not_applicable" ||
        (independentBearCaseAnalysis?.generatedBy === "ai_research" &&
          independentBearCaseAnalysis?.status === "complete");
      const missingRequirements = [
        ...(!packetReady ? ["the committee packet is incomplete"] : []),
        ...(!policyActive ? ["the reviewed investment policy is not active"] : []),
        ...(!evidenceReady ? ["required company filings were missing from the reviewed report"] : []),
        ...(!businessQualityReady ? ["the price-blind Business Quality Analysis was not complete"] : []),
        ...(!managementCapitalAllocationReady
          ? ["the documented Management and Capital Allocation Analysis was not complete"]
          : []),
        ...(!earningsQualityReady
          ? ["the Earnings Quality and Accounting Risk Analysis was not complete"]
          : []),
        ...(!independentBearCaseReady
          ? ["the independent Bear Case Analysis was not complete"]
          : []),
      ];
      if (missingRequirements.length) {
        return NextResponse.json(
          {
            error: `APPROVED is blocked because ${missingRequirements.join(", ")}. Create a complete packet version or choose NEEDS MORE RESEARCH.`,
          },
          { status: 409 }
        );
      }
    }

    const decidedAt = new Date().toISOString();
    const packetSnapshot = {
      id: packet.id,
      caseId: packet.case_id,
      reportId: packet.report_id,
      policyId: packet.policy_id,
      ticker: packet.ticker,
      version: packet.version,
      generationStatus: packet.generation_status,
      packet: packet.packet,
      sourceManifest: packet.source_manifest,
      reportSnapshot: packet.report_snapshot,
      engineSnapshot: packet.engine_snapshot,
      policySnapshot: packet.policy_snapshot,
      evidenceSnapshot: packet.evidence_snapshot,
      contentHash: packet.content_hash,
      generatedBy: packet.generated_by,
      createdAt: packet.created_at,
    };
    const decisionHash = stableHash({
      userId: authUser.userId,
      packetId,
      reviewedPacketHash: packet.content_hash,
      decision,
      rationale,
      conditions,
      decidedAt,
    });

    const saved = await insertInvestmentCommitteeDecision({
      userId: authUser.userId,
      userEmail: authUser.email,
      caseId: String(packet.case_id),
      packetId,
      packetVersion: Number(packet.version),
      ticker: String(packet.ticker),
      decision,
      rationale,
      conditions,
      authorizationBasis: "case_owner",
      packetSnapshot,
      sourceManifestSnapshot: packet.source_manifest ?? [],
      reviewedPacketHash: String(packet.content_hash),
      decisionHash,
    });
    const decisions = await listInvestmentCommitteeDecisions({
      userId: authUser.userId,
      caseId: String(packet.case_id),
      limit: 50,
    });

    return NextResponse.json({ decision: saved, decisions });
  } catch (error: any) {
    console.error("[neuro-analysis/committee-decisions] error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not record the Investment Committee decision." },
      { status: 500 }
    );
  }
}
