import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { buildOriginalInvestmentThesisPayload } from "@/lib/neuroInvestmentThesis";
import {
  getInvestmentCommitteeDecision,
  getInvestmentCommitteePacket,
  getNeuroCase,
  getOriginalInvestmentThesisRecord,
  insertOriginalInvestmentThesisRecord,
  listInvestmentThesisReviews,
  listPositionExitReviews,
} from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

const FREEZE_CONFIRMATION = "FREEZE_ORIGINAL_THESIS";

function cleanText(value: unknown, maxLength = 100) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}

function validPurchaseDate(value: unknown) {
  const date = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return date;
}

function finitePositive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const caseId = cleanText(new URL(req.url).searchParams.get("caseId"), 80);
    if (!caseId) return NextResponse.json({ error: "caseId is required." }, { status: 400 });
    const researchCase = await getNeuroCase(authUser.userId, caseId);
    if (!researchCase) return NextResponse.json({ error: "Research case not found." }, { status: 404 });

    const originalThesis = await getOriginalInvestmentThesisRecord(authUser.userId, caseId);
    const [reviews, positionExitReviews] = originalThesis
      ? await Promise.all([
          listInvestmentThesisReviews({
            userId: authUser.userId,
            caseId,
            originalThesisId: originalThesis.id,
            limit: 50,
          }),
          listPositionExitReviews({
            userId: authUser.userId,
            caseId,
            originalThesisId: originalThesis.id,
            limit: 50,
          }),
        ])
      : [[], []];
    return NextResponse.json({ originalThesis, reviews, positionExitReviews });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load the permanent investment thesis." },
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

    const limiter = await rateLimit(`neuro-analysis:freeze-thesis:${authUser.userId}`, {
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Permanent thesis creation rate limit exceeded." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const decisionId = cleanText(body?.decisionId, 80);
    const purchaseDate = validPurchaseDate(body?.purchaseDate);
    const purchasePrice = finitePositive(body?.purchasePrice);
    const portfolioWeightPct = finitePositive(body?.portfolioWeightPct);
    const confirmation = cleanText(body?.confirmation, 80);

    if (!decisionId || !purchaseDate || purchasePrice == null || portfolioWeightPct == null) {
      return NextResponse.json(
        { error: "An approved decision, valid purchase date, purchase price, and portfolio weight are required." },
        { status: 400 }
      );
    }
    if (portfolioWeightPct > 100) {
      return NextResponse.json({ error: "Portfolio weight cannot exceed 100%." }, { status: 400 });
    }
    if (confirmation !== FREEZE_CONFIRMATION) {
      return NextResponse.json(
        { error: "Explicit human confirmation is required before freezing the original thesis." },
        { status: 400 }
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    if (purchaseDate > today) {
      return NextResponse.json({ error: "Purchase date cannot be in the future." }, { status: 400 });
    }

    const decision = await getInvestmentCommitteeDecision(authUser.userId, decisionId);
    if (!decision) return NextResponse.json({ error: "Investment Committee decision not found." }, { status: 404 });
    if (decision.decision !== "APPROVED" || !decision.portfolio_eligible) {
      return NextResponse.json(
        { error: "Only an APPROVED human Investment Committee decision can create an original thesis." },
        { status: 409 }
      );
    }
    if (purchaseDate < String(decision.decided_at ?? "").slice(0, 10)) {
      return NextResponse.json(
        { error: "Purchase date cannot precede the Investment Committee approval date." },
        { status: 400 }
      );
    }

    const caseId = String(decision.case_id);
    const researchCase = await getNeuroCase(authUser.userId, caseId);
    if (!researchCase) return NextResponse.json({ error: "Research case not found." }, { status: 404 });
    const existing = await getOriginalInvestmentThesisRecord(authUser.userId, caseId);
    if (existing) {
      return NextResponse.json(
        {
          error: "This position already has an original frozen thesis. It cannot be replaced.",
          originalThesis: existing,
        },
        { status: 409 }
      );
    }

    const packet = await getInvestmentCommitteePacket(authUser.userId, String(decision.packet_id));
    if (!packet || String(packet.case_id) !== caseId) {
      return NextResponse.json({ error: "The approved committee packet could not be verified." }, { status: 409 });
    }
    if (String(packet.content_hash) !== String(decision.reviewed_packet_hash)) {
      return NextResponse.json(
        { error: "The approved packet hash does not match the packet under review." },
        { status: 409 }
      );
    }

    const payload = buildOriginalInvestmentThesisPayload({
      ticker: String(decision.ticker),
      purchaseDate,
      purchasePrice,
      portfolioWeightPct,
      packet: packet.packet,
      packetRow: packet,
      decision,
    });
    const contentHash = stableHash(payload);
    const originalThesis = await insertOriginalInvestmentThesisRecord({
      userId: authUser.userId,
      caseId,
      committeeDecisionId: String(decision.id),
      committeePacketId: String(packet.id),
      payload,
      contentHash,
    });

    return NextResponse.json({ originalThesis, reviews: [] }, { status: 201 });
  } catch (error: any) {
    console.error("[neuro-analysis/investment-theses] error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not freeze the original investment thesis." },
      { status: 500 }
    );
  }
}
