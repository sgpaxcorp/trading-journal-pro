import { NextRequest, NextResponse } from "next/server";
import { getOptionFlowBetaApiPayload, hasOptionFlowBetaAccess, resolveOptionFlowLang } from "@/lib/optionFlowBeta";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getAuthUser } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BYPASS_BETA_GATE =
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "").toLowerCase() === "true" ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "") === "1";

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!BYPASS_BETA_GATE && !(await hasOptionFlowBetaAccess(auth.userId))) {
    return NextResponse.json(
      getOptionFlowBetaApiPayload(resolveOptionFlowLang(req.headers.get("accept-language"))),
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const sessionId = body?.sessionId;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from("option_flow_chat_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", auth.userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
