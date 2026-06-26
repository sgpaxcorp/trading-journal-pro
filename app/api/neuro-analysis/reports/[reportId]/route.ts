import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type Params = { params: Promise<{ reportId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const { reportId } = await params;
    const { data, error } = await supabaseAdmin
      .from("neuro_analysis_reports")
      .select("*")
      .eq("id", reportId)
      .eq("user_id", authUser.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    return NextResponse.json({ report: data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not load report." }, { status: 500 });
  }
}
