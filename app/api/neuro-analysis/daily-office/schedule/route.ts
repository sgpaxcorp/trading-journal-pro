import { NextRequest, NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { getEmergencyPortfolioControls } from "@/lib/emergencyPortfolioControls";
import { enqueueNeuroJob } from "@/lib/neuroAnalysisJobs";
import { currentMarketDateIso } from "@/lib/neuroDailyInvestmentOffice";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { isTradingSessionDate } from "@/lib/tradingCalendar";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return auth.response;

  const briefingDate = currentMarketDateIso();
  if (!isTradingSessionDate(briefingDate, "stocks")) {
    return NextResponse.json({ ok: true, skipped: true, reason: "non_market_day", briefingDate });
  }
  const controls = await getEmergencyPortfolioControls();
  if (controls.readOnly || controls.failSafe) {
    return NextResponse.json(
      { error: "Daily Investment Office scheduling is blocked while the portfolio system is READ ONLY." },
      { status: 423 }
    );
  }

  const [thesesResult, casesResult] = await Promise.all([
    supabaseAdmin.from("neuro_analysis_original_theses").select("user_id").limit(5_000),
    supabaseAdmin
      .from("neuro_analysis_cases")
      .select("user_id,holdings")
      .eq("status", "active")
      .limit(5_000),
  ]);
  if (thesesResult.error) throw new Error(thesesResult.error.message);
  if (casesResult.error) throw new Error(casesResult.error.message);

  const userIds = new Set<string>();
  for (const row of thesesResult.data ?? []) {
    if (row.user_id) userIds.add(String(row.user_id));
  }
  for (const row of casesResult.data ?? []) {
    if (row.user_id && Array.isArray(row.holdings) && row.holdings.length > 0) {
      userIds.add(String(row.user_id));
    }
  }

  let queued = 0;
  let existing = 0;
  const failures: string[] = [];
  for (const userId of userIds) {
    const dedupeKey = `daily-office:scheduled:${userId}:${briefingDate}`;
    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from("neuro_analysis_jobs")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (duplicateError) {
      failures.push(`${userId}: ${duplicateError.message}`);
      continue;
    }
    if (duplicate) {
      existing += 1;
      continue;
    }
    try {
      await enqueueNeuroJob({
        userId,
        jobType: "daily_investment_office",
        payload: { briefingDate, requestedBy: "market_day_scheduler" },
        dedupeKey,
      });
      queued += 1;
    } catch (error) {
      failures.push(`${userId}: ${error instanceof Error ? error.message : "queue failed"}`);
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    briefingDate,
    eligibleUsers: userIds.size,
    queued,
    existing,
    failures: failures.slice(0, 20),
  });
}
