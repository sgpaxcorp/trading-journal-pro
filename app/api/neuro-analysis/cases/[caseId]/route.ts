import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { archiveNeuroCase, getNeuroCase, listNeuroReports, upsertNeuroCase } from "@/lib/neuroAnalysisStorage";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

type Params = { params: Promise<{ caseId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;
    const { caseId } = await params;
    const [researchCase, reports] = await Promise.all([
      getNeuroCase(authUser.userId, caseId),
      listNeuroReports(authUser.userId, caseId),
    ]);
    if (!researchCase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ case: researchCase, reports });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not load case." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;
    const { caseId } = await params;
    const body = await req.json().catch(() => ({}));
    const saved = await upsertNeuroCase({
      userId: authUser.userId,
      caseId,
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
    return NextResponse.json({ error: error?.message || "Could not update case." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;
    const { caseId } = await params;
    const archived = await archiveNeuroCase(authUser.userId, caseId);
    return NextResponse.json({ case: archived });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not archive case." }, { status: 500 });
  }
}
