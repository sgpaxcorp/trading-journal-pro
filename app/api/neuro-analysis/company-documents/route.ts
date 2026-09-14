import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { listRecentSecCompanyDocuments, sanitizeSecTicker } from "@/lib/neuroSecFilings";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const limiter = await rateLimit(`neuro-analysis:company-documents:${authUser.userId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const url = new URL(req.url);
    const ticker = sanitizeSecTicker(url.searchParams.get("ticker"));
    if (!ticker) return NextResponse.json({ error: "Ticker is required." }, { status: 400 });

    const result = await listRecentSecCompanyDocuments(ticker);
    if (!result.company) {
      return NextResponse.json({ ticker, documents: [], error: "Company document profile not found." });
    }

    return NextResponse.json({
      ...result,
    });
  } catch (error: any) {
    console.error("[neuro-analysis/company-documents] error:", error);
    return NextResponse.json({ error: error?.message || "Company document lookup failed." }, { status: 500 });
  }
}
