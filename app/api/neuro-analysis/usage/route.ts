import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const body = await req.json().catch(() => ({}));
    const eventType = String(body?.eventType ?? "");
    if (eventType !== "pdf_export") {
      return NextResponse.json({ error: "Unsupported usage event." }, { status: 400 });
    }

    const quota = await checkNeuroQuota(authUser.userId, "pdf_export");
    if (!quota.allowed) {
      return NextResponse.json({ error: "Monthly PDF export quota exceeded.", quota }, { status: 429 });
    }

    await recordNeuroUsage({
      userId: authUser.userId,
      caseId: body?.caseId ? String(body.caseId) : null,
      eventType,
      metadata: {
        reportId: body?.reportId ? String(body.reportId) : null,
      },
    });

    return NextResponse.json({ ok: true, quota });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not record usage." }, { status: 500 });
  }
}
