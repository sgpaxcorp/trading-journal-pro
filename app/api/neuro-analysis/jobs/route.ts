import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { listNeuroJobs } from "@/lib/neuroAnalysisJobs";
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
  void req;
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
}
