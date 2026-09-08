import { NextRequest, NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { WAITLIST_CAMPAIGN } from "@/lib/waitlistCampaign";
import {
  dispatchWaitlistLaunch,
  getWaitlistLaunchOverview,
} from "@/lib/waitlistLaunchDelivery";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parsePositiveLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return WAITLIST_CAMPAIGN.discountLimit;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

async function readRequestOptions(req: NextRequest) {
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  return {
    dryRun: String(url.searchParams.get("dryRun") || body?.dryRun || "") === "true",
    force:
      process.env.NODE_ENV !== "production" &&
      String(url.searchParams.get("force") || body?.force || "") === "true",
    limit: parsePositiveLimit(url.searchParams.get("limit") || body?.limit),
  };
}

async function handleRequest(req: NextRequest) {
  const cronAuth = requireCronSecret(req);
  if (!cronAuth.ok) return cronAuth.response;

  const options = await readRequestOptions(req);
  const launchAt = new Date(WAITLIST_CAMPAIGN.launchDateIso).getTime();

  if (!options.force && Date.now() < launchAt) {
    return NextResponse.json(
      {
        ok: false,
        error: "Launch discount emails are not due yet.",
        launchDateIso: WAITLIST_CAMPAIGN.launchDateIso,
      },
      { status: 425 }
    );
  }

  if (options.dryRun) {
    const overview = await getWaitlistLaunchOverview();
    return NextResponse.json({ ok: true, dryRun: true, overview });
  }

  try {
    const result = await dispatchWaitlistLaunch({ mode: "pending", limit: options.limit });
    return NextResponse.json({ ok: true, dryRun: false, result });
  } catch (error) {
    console.error("[waitlist-launch] automated delivery failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Launch delivery failed." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
