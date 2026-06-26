import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { enqueueNeuroJob, listNeuroJobs } from "@/lib/neuroAnalysisJobs";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const url = new URL(req.url);
    const caseId = String(url.searchParams.get("caseId") ?? "").trim();
    const jobs = await listNeuroJobs(authUser.userId, caseId || null);
    return NextResponse.json({ jobs });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not load jobs." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const body = await req.json().catch(() => ({}));
    const job = await enqueueNeuroJob({
      userId: authUser.userId,
      caseId: body?.caseId ? String(body.caseId) : null,
      jobType: String(body?.jobType ?? "analysis"),
      payload: body?.payload ?? {},
      runAfter: body?.runAfter ? String(body.runAfter) : null,
    });
    return NextResponse.json({ job });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not enqueue job." }, { status: 500 });
  }
}
