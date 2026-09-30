import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { hasOptionFlowBetaAccess } from "@/lib/optionFlowBeta";
import { isSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ allowed: false, beta: true });
  }

  const feature = new URL(req.url).searchParams.get("feature");
  const allowed =
    feature === "option_flow"
      ? await hasOptionFlowBetaAccess(auth.userId)
      : await isSmartToolsOwner(auth);

  return NextResponse.json({
    allowed,
    beta: true,
  });
}
