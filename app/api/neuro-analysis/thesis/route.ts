import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { getNeuroCase, insertNeuroSnapshot, listNeuroSnapshots } from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

const THESIS_SNAPSHOT_TYPES = ["thesis_context", "thesis_update"];

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function cleanImpact(value: unknown) {
  const text = String(value ?? "").trim();
  return ["positive", "negative", "mixed", "uncertain"].includes(text) ? text : "uncertain";
}

function cleanSourceType(value: unknown) {
  const text = String(value ?? "").trim();
  return ["news", "filing", "earnings", "management", "competition", "macro", "personal_observation"].includes(text)
    ? text
    : "personal_observation";
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const url = new URL(req.url);
    const caseId = cleanText(url.searchParams.get("caseId"), 80);
    if (!caseId) {
      return NextResponse.json({ notes: [] });
    }

    const researchCase = await getNeuroCase(authUser.userId, caseId);
    if (!researchCase) return NextResponse.json({ error: "Case not found." }, { status: 404 });

    const notes = await listNeuroSnapshots({
      userId: authUser.userId,
      caseId,
      snapshotTypes: THESIS_SNAPSHOT_TYPES,
      limit: 50,
    });

    return NextResponse.json({ notes });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load thesis context." },
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

    const rate = await rateLimit(`neuro-analysis:thesis:${authUser.userId}`, {
      limit: 20,
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

    const body = await req.json().catch(() => ({}));
    const caseId = cleanText(body?.caseId, 80);
    if (!caseId) {
      return NextResponse.json({ error: "Save the research case before adding thesis context." }, { status: 400 });
    }

    const researchCase = await getNeuroCase(authUser.userId, caseId);
    if (!researchCase) return NextResponse.json({ error: "Case not found." }, { status: 404 });

    const note = cleanText(body?.note, 8_000);
    if (!note) {
      return NextResponse.json({ error: "Thesis context note is required." }, { status: 400 });
    }

    const ticker = cleanTicker(body?.ticker || researchCase.focus_ticker);
    const payload = {
      ticker,
      note,
      sourceType: cleanSourceType(body?.sourceType),
      sourceLabel: cleanText(body?.sourceLabel, 240),
      impact: cleanImpact(body?.impact),
      happenedAt: cleanText(body?.happenedAt, 40),
      status: "user_context",
      evidenceLevel: "user_provided_unverified",
    };

    await insertNeuroSnapshot({
      userId: authUser.userId,
      caseId,
      snapshotType: "thesis_context",
      payload,
    });

    const notes = await listNeuroSnapshots({
      userId: authUser.userId,
      caseId,
      snapshotTypes: THESIS_SNAPSHOT_TYPES,
      limit: 50,
    });

    return NextResponse.json({ ok: true, notes });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not save thesis context." },
      { status: 500 }
    );
  }
}
