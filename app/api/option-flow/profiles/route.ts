import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { getOptionFlowBetaApiPayload, hasOptionFlowBetaAccess, resolveOptionFlowLang } from "@/lib/optionFlowBeta";
import {
  getOptionFlowProfileWorkspace,
  listOptionFlowProfiles,
  updateOptionFlowProfileStatus,
} from "@/lib/optionFlowProfileServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BYPASS_ENTITLEMENT =
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "").toLowerCase() === "true" ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "") === "1";

async function authorize(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!BYPASS_ENTITLEMENT && !(await hasOptionFlowBetaAccess(auth.userId))) {
    return {
      response: NextResponse.json(
        getOptionFlowBetaApiPayload(resolveOptionFlowLang(req.headers.get("accept-language"))),
        { status: 403 }
      ),
    };
  }
  return { auth };
}

export async function GET(req: Request) {
  try {
    const authorized = await authorize(req);
    if (authorized.response) return authorized.response;
    const url = new URL(req.url);
    const profileId = String(url.searchParams.get("profileId") ?? "").trim();
    const symbol = String(url.searchParams.get("symbol") ?? "").trim();
    if (profileId || symbol) {
      const workspace = await getOptionFlowProfileWorkspace({
        userId: authorized.auth!.userId,
        profileId: profileId || null,
        symbol: symbol || null,
      });
      if (!workspace) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
      return NextResponse.json({ workspace });
    }
    const profiles = await listOptionFlowProfiles(authorized.auth!.userId);
    return NextResponse.json({ profiles });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load Option Flow profiles." },
      { status: 500 }
    );
  }
}
export async function PATCH(req: Request) {
  try {
    const authorized = await authorize(req);
    if (authorized.response) return authorized.response;
    const body = await req.json().catch(() => ({}));
    const profileId = String(body?.profileId ?? "").trim();
    const status = String(body?.status ?? "").trim();
    if (!profileId || !["active", "paused", "archived"].includes(status)) {
      return NextResponse.json({ error: "A valid profile and status are required." }, { status: 400 });
    }
    const profile = await updateOptionFlowProfileStatus({
      userId: authorized.auth!.userId,
      profileId,
      status: status as "active" | "paused" | "archived",
    });
    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not update Option Flow profile." },
      { status: 500 }
    );
  }
}
