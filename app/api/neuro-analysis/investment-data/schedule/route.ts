import { NextRequest, NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { getEmergencyPortfolioControls } from "@/lib/emergencyPortfolioControls";
import { enqueueNeuroJob } from "@/lib/neuroAnalysisJobs";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { isTradingSessionDate } from "@/lib/tradingCalendar";

export const runtime = "nodejs";
export const maxDuration = 300;

function marketDateIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return auth.response;

  const refreshDate = marketDateIso();
  if (!isTradingSessionDate(refreshDate, "stocks")) {
    return NextResponse.json({ ok: true, skipped: true, reason: "non_market_day", refreshDate });
  }
  const controls = await getEmergencyPortfolioControls();
  if (controls.readOnly || controls.failSafe) {
    return NextResponse.json(
      { error: "Investment data scheduling is blocked while the portfolio system is READ ONLY." },
      { status: 423 }
    );
  }

  const [watchlistResult, thesesResult] = await Promise.all([
    supabaseAdmin
      .from("investment_watchlist_entries")
      .select("company_id")
      .eq("status", "active")
      .limit(5_000),
    supabaseAdmin
      .from("neuro_analysis_original_theses")
      .select("ticker")
      .limit(5_000),
  ]);
  if (watchlistResult.error) throw new Error(watchlistResult.error.message);
  if (thesesResult.error) throw new Error(thesesResult.error.message);

  const tickers = new Set<string>();
  for (const thesis of thesesResult.data ?? []) {
    const ticker = String(thesis.ticker ?? "").trim().toUpperCase();
    if (ticker) tickers.add(ticker);
  }

  const companyIds = Array.from(new Set((watchlistResult.data ?? []).map((entry) => entry.company_id).filter(Boolean)));
  if (companyIds.length) {
    const { data: securities, error: securitiesError } = await supabaseAdmin
      .from("investment_securities")
      .select("id")
      .in("company_id", companyIds)
      .eq("is_primary", true)
      .eq("status", "active");
    if (securitiesError) throw new Error(securitiesError.message);
    const securityIds = (securities ?? []).map((security) => security.id);
    if (securityIds.length) {
      const { data: identifiers, error: identifiersError } = await supabaseAdmin
        .from("investment_security_identifiers")
        .select("identifier_value")
        .in("security_id", securityIds)
        .eq("identifier_type", "ticker")
        .is("valid_to", null);
      if (identifiersError) throw new Error(identifiersError.message);
      for (const identifier of identifiers ?? []) {
        const ticker = String(identifier.identifier_value ?? "").trim().toUpperCase();
        if (ticker) tickers.add(ticker);
      }
    }
  }

  let queued = 0;
  let existing = 0;
  const failures: string[] = [];
  for (const ticker of [...tickers].sort().slice(0, 2_000)) {
    try {
      await enqueueNeuroJob({
        jobType: "investment_data_refresh",
        payload: { ticker, asOfTimestamp: new Date().toISOString(), requestedBy: "daily_discovery_scheduler" },
        dedupeKey: `investment-data-daily:${ticker}:${refreshDate}`,
      });
      queued += 1;
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (error?.code === "23505" || message.toLowerCase().includes("duplicate")) {
        existing += 1;
      } else {
        failures.push(`${ticker}: ${message || "queue failed"}`);
      }
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    refreshDate,
    researchUniverse: tickers.size,
    queued,
    existing,
    failures: failures.slice(0, 25),
    deterministicFirst: true,
    llmMarketWideScan: false,
  });
}
