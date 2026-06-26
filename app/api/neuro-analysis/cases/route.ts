import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { listNeuroCases, listNeuroReports, upsertNeuroCase } from "@/lib/neuroAnalysisStorage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const url = new URL(req.url);
    const caseId = String(url.searchParams.get("caseId") ?? "").trim();
    const [cases, reports] = await Promise.all([
      listNeuroCases(authUser.userId),
      caseId ? listNeuroReports(authUser.userId, caseId) : Promise.resolve([]),
    ]);

    return NextResponse.json({ cases, reports });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not load cases." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const body = await req.json().catch(() => ({}));
    const saved = await upsertNeuroCase({
      userId: authUser.userId,
      caseId: body?.caseId ? String(body.caseId) : null,
      title: body?.title,
      focusTicker: body?.focusTicker,
      researchGoal: body?.researchGoal,
      holdings: Array.isArray(body?.holdings) ? body.holdings : [],
      selectedAccountId: body?.selectedAccountId ? String(body.selectedAccountId) : null,
      brokerSnapshot: body?.brokerSnapshot ?? {},
      marketData: body?.marketData ?? {},
      readiness: body?.readiness ?? {},
    });

    return NextResponse.json({ case: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not save case." }, { status: 500 });
  }
}
