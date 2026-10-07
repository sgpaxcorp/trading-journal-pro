import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { getOptionFlowBetaApiPayload, hasOptionFlowBetaAccess, resolveOptionFlowLang } from "@/lib/optionFlowBeta";
import { refreshOptionFlowProfileSnapshots } from "@/lib/optionFlowOpenInterestServer";
import { getOptionFlowMarketDataStatus } from "@/lib/optionFlowOptionMarketData";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BYPASS_ENTITLEMENT =
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "").toLowerCase() === "true" ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "") === "1";

function marketDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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
  const authorized = await authorize(req);
  if (authorized.response) return authorized.response;
  return NextResponse.json({ marketData: getOptionFlowMarketDataStatus() });
}

export async function POST(req: Request) {
  try {
    const authorized = await authorize(req);
    if (authorized.response) return authorized.response;
    const marketData = getOptionFlowMarketDataStatus();
    if (!marketData.configured) {
      return NextResponse.json(
        { error: "Automatic options market data is not configured.", marketData },
        { status: 409 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const profileId = String(body?.profileId ?? "").trim();
    if (!profileId) return NextResponse.json({ error: "Profile ID is required." }, { status: 400 });
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("option_flow_profiles")
      .select("id,user_id,symbol")
      .eq("id", profileId)
      .eq("user_id", authorized.auth!.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

    const marketDate = marketDateKey();
    const { data: priorBar, error: barError } = await supabaseAdmin
      .from("investment_market_daily_bars")
      .select("session_date")
      .eq("symbol", profile.symbol)
      .lt("session_date", marketDate)
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (barError) throw barError;
    if (!priorBar?.session_date) {
      return NextResponse.json(
        { error: "No prior verified market session is available for OI attribution." },
        { status: 409 }
      );
    }
    const result = await refreshOptionFlowProfileSnapshots({
      userId: authorized.auth!.userId,
      profileId: profile.id,
      symbol: profile.symbol,
      snapshotKind: "on_demand",
      priceSessionDate: marketDate,
      openInterestAsOfDate: priorBar.session_date,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[option-flow/open-interest] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not refresh open-interest evidence." },
      { status: 500 }
    );
  }
}
