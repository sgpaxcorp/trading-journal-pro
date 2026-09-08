import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import {
  WAITLIST_CAMPAIGN,
  isAnnualDiscountReserved,
  isValidWaitlistEmail,
  normalizeWaitlistEmail,
  sanitizeWaitlistName,
  waitlistProgressPercent,
  waitlistSpotsRemaining,
} from "@/lib/waitlistCampaign";

export const dynamic = "force-dynamic";

const SUPPORT_EMAIL = "support@neurotrader-journal.com";
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "NeuroTrader <support@neurotrader-journal.com>";
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

type SupabaseAdmin = Awaited<ReturnType<typeof resolveSupabaseAdmin>>;

type WaitlistRow = {
  position: number | null;
  discount_reserved: boolean | null;
  created_at: string | null;
};

type DevWaitlistEntry = WaitlistRow & {
  email: string;
  name: string | null;
};

type WaitlistRateLimitOptions = {
  limit: number;
  windowMs: number;
};

type WaitlistRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
};

type WaitlistRateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalForWaitlist = globalThis as typeof globalThis & {
  __neuroTraderLaunchWaitlist?: Map<string, DevWaitlistEntry>;
  __neuroTraderLaunchWaitlistRateLimits?: Map<string, WaitlistRateLimitBucket>;
};

const devWaitlist =
  globalForWaitlist.__neuroTraderLaunchWaitlist ??
  new Map<string, DevWaitlistEntry>();
globalForWaitlist.__neuroTraderLaunchWaitlist = devWaitlist;

const devRateLimits =
  globalForWaitlist.__neuroTraderLaunchWaitlistRateLimits ??
  new Map<string, WaitlistRateLimitBucket>();
globalForWaitlist.__neuroTraderLaunchWaitlistRateLimits = devRateLimits;

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function resolveSupabaseAdmin() {
  if (shouldUseLocalPreview()) return null;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const { supabaseAdmin } = await import("@/lib/supaBaseAdmin");
  return supabaseAdmin;
}

function shouldUseLocalPreview() {
  return process.env.NODE_ENV !== "production" && process.env.WAITLIST_USE_SUPABASE_IN_DEV !== "true";
}

function shouldSendPreviewEmails() {
  return shouldUseLocalPreview() && process.env.WAITLIST_SEND_EMAILS_IN_DEV === "true";
}

function localWaitlistRateLimit(
  key: string,
  options: WaitlistRateLimitOptions
): WaitlistRateLimitResult {
  const now = Date.now();
  let bucket = devRateLimits.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = {
      count: 0,
      resetAt: now + options.windowMs,
    };
  }

  bucket.count += 1;
  devRateLimits.set(key, bucket);

  return {
    allowed: bucket.count <= options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    resetAt: bucket.resetAt,
    limit: options.limit,
  };
}

async function waitlistRateLimit(key: string, options: WaitlistRateLimitOptions) {
  if (shouldUseLocalPreview()) {
    return localWaitlistRateLimit(key, options);
  }

  return rateLimit(key, options);
}

function campaignPayload(stats?: { reservedCount?: number | null; totalCount?: number | null }) {
  const reservedCount = Math.max(0, Number(stats?.reservedCount ?? 0));

  return {
    launchDateIso: WAITLIST_CAMPAIGN.launchDateIso,
    launchDateLabel: WAITLIST_CAMPAIGN.launchDateLabel,
    discountLimit: WAITLIST_CAMPAIGN.discountLimit,
    discountPercent: WAITLIST_CAMPAIGN.discountPercent,
    discountPlan: WAITLIST_CAMPAIGN.discountPlan,
    reservedCount,
    totalCount: Math.max(0, Number(stats?.totalCount ?? reservedCount)),
    spotsRemaining: waitlistSpotsRemaining(reservedCount),
    progressPercent: waitlistProgressPercent(reservedCount),
  };
}

function readLocalWaitlistStats() {
  const entries = Array.from(devWaitlist.values());
  return {
    reservedCount: entries.filter((entry) => isAnnualDiscountReserved(entry.position)).length,
    totalCount: entries.length,
  };
}

function joinLocalWaitlist(args: { email: string; name: string }) {
  const existingEntry = devWaitlist.get(args.email);
  if (existingEntry) {
    return {
      existing: true,
      row: existingEntry,
    };
  }

  const position = devWaitlist.size + 1;
  const entry: DevWaitlistEntry = {
    email: args.email,
    name: args.name || null,
    position,
    discount_reserved: isAnnualDiscountReserved(position),
    created_at: new Date().toISOString(),
  };

  devWaitlist.set(args.email, entry);

  return {
    existing: false,
    row: entry,
  };
}

async function readWaitlistStats(supabase: NonNullable<SupabaseAdmin>) {
  const [reservedResult, totalResult] = await Promise.all([
    supabase
      .from("launch_waitlist")
      .select("id", { count: "exact", head: true })
      .lte("position", WAITLIST_CAMPAIGN.discountLimit),
    supabase
      .from("launch_waitlist")
      .select("id", { count: "exact", head: true }),
  ]);

  if (reservedResult.error) throw reservedResult.error;
  if (totalResult.error) throw totalResult.error;

  return {
    reservedCount: reservedResult.count ?? 0,
    totalCount: totalResult.count ?? 0,
  };
}

async function sendWaitlistEmails(args: {
  name: string;
  email: string;
  position: number | null;
  discountReserved: boolean;
  existing: boolean;
}) {
  const name = args.name || "Trader Entrepreneur";
  const safeName = escapeHtml(name);
  const spotLabel = args.position ? `#${args.position}` : "confirmed";
  const discountLine = args.discountReserved
    ? `Your 30% launch discount for the annual plan is reserved. Your waitlist spot is ${spotLabel}. On launch day, we will email you the annual discount access.`
    : `Your waitlist spot is ${spotLabel}. On launch day, we will email launch access. The first ${WAITLIST_CAMPAIGN.discountLimit} annual discount spots may already be reserved.`;

  const userSubject = args.discountReserved
    ? "Your NeuroTrader annual launch discount is reserved"
    : "You are on the NeuroTrader launch waitlist";
  const userText = [
    `Hi ${name},`,
    "",
    "You are on the NeuroTrader 60-day launch waitlist.",
    discountLine,
    `Launch date: ${WAITLIST_CAMPAIGN.launchDateLabel.en}.`,
    "",
    "What happens next:",
    "1) This email confirms your waitlist registration.",
    "2) We will send product launch updates before release.",
    "3) On launch day, eligible first-500 waitlist members receive the annual discount access by email.",
    "",
    "NeuroTrader is educational software for trading business structure, execution review, risk controls, and accountability. It does not provide financial advice and does not guarantee trading results, income, or capital growth.",
    "",
    "Thank you for joining the launch list.",
  ].join("\n");
  const userHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6">
      <h2 style="margin:0 0 12px 0">NeuroTrader launch waitlist confirmed</h2>
      <p>Hi ${safeName},</p>
      <p>Thank you for joining the NeuroTrader launch waitlist.</p>
      <p>You are on the NeuroTrader 60-day launch waitlist.</p>
      <p><strong>${escapeHtml(discountLine)}</strong></p>
      <p><strong>Launch date:</strong> ${escapeHtml(WAITLIST_CAMPAIGN.launchDateLabel.en)}</p>
      <div style="margin:16px 0;padding:14px 16px;border:1px solid #99f6e4;border-radius:18px;background:#ecfdf5">
        <p style="margin:0 0 8px 0;font-weight:700;color:#064e3b">What happens next</p>
        <ol style="margin:0;padding-left:18px;color:#0f172a">
          <li>This email confirms your waitlist registration.</li>
          <li>We will send product launch updates before release.</li>
          <li>On launch day, eligible first-500 waitlist members receive the annual discount access by email.</li>
        </ol>
      </div>
      <p style="font-size:12px;color:#475569">NeuroTrader is educational software for trading business structure, execution review, risk controls, and accountability. It does not provide financial advice and does not guarantee trading results, income, or capital growth.</p>
    </div>
  `;

  const adminSubject = `Launch waitlist ${args.existing ? "duplicate" : "signup"} - ${args.email}`;
  const adminText = [
    "NeuroTrader launch waitlist activity:",
    "",
    `Name: ${name}`,
    `Email: ${args.email}`,
    `Spot: ${spotLabel}`,
    `Annual discount reserved: ${args.discountReserved ? "yes" : "no"}`,
    `Existing record: ${args.existing ? "yes" : "no"}`,
  ].join("\n");

  if (!resend) {
    console.log("[waitlist] Resend not configured. Emails:", {
      user: { to: args.email, subject: userSubject },
      admin: { to: SUPPORT_EMAIL, subject: adminSubject, body: adminText },
    });
    return;
  }

  await Promise.allSettled([
    resend.emails.send({
      from: FROM_EMAIL,
      to: args.email,
      subject: userSubject,
      text: userText,
      html: userHtml,
    }),
    resend.emails.send({
      from: FROM_EMAIL,
      to: SUPPORT_EMAIL,
      replyTo: args.email,
      subject: adminSubject,
      text: adminText,
    }),
  ]);
}

export async function GET() {
  try {
    const supabase = await resolveSupabaseAdmin();
    if (!supabase) {
      const stats = readLocalWaitlistStats();
      return NextResponse.json({
        ok: true,
        storageReady: false,
        previewMode: shouldUseLocalPreview(),
        campaign: campaignPayload(stats),
      });
    }

    const stats = await readWaitlistStats(supabase);
    return NextResponse.json({
      ok: true,
      storageReady: true,
      previewMode: false,
      campaign: campaignPayload(stats),
    });
  } catch (error) {
    console.error("[waitlist] stats error:", error);
    return NextResponse.json({
      ok: true,
      storageReady: false,
      previewMode: shouldUseLocalPreview(),
      campaign: campaignPayload(),
    });
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipLimiter = await waitlistRateLimit(`waitlist:ip:${ip}`, {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });

  if (!ipLimiter.allowed) {
    const retryAfter = Math.max(1, Math.ceil((ipLimiter.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many waitlist requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          ...rateLimitHeaders(ipLimiter),
        },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const honeypot = String(body?.company || body?.website || "").trim();
  if (honeypot) {
    return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(ipLimiter) });
  }

  const email = normalizeWaitlistEmail(String(body?.email || ""));
  const name = sanitizeWaitlistName(String(body?.name || ""));
  const source = String(body?.source || "homepage")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 64) || "homepage";
  const acceptedWaitlistTerms = Boolean(body?.acceptedWaitlistTerms);

  if (!isValidWaitlistEmail(email)) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400, headers: rateLimitHeaders(ipLimiter) }
    );
  }

  if (!acceptedWaitlistTerms) {
    return NextResponse.json(
      { error: "Please confirm the waitlist terms before joining." },
      { status: 400, headers: rateLimitHeaders(ipLimiter) }
    );
  }

  const emailLimiter = await waitlistRateLimit(`waitlist:email:${email}`, {
    limit: 3,
    windowMs: 24 * 60 * 60 * 1000,
  });

  if (!emailLimiter.allowed) {
    return NextResponse.json(
      { error: "This email has reached the waitlist request limit for today." },
      { status: 429, headers: rateLimitHeaders(emailLimiter) }
    );
  }

  try {
    const supabase = await resolveSupabaseAdmin();
    if (!supabase) {
      if (shouldUseLocalPreview()) {
        const localResult = joinLocalWaitlist({ email, name });
        const position =
          typeof localResult.row.position === "number" ? localResult.row.position : null;
        const discountReserved = Boolean(
          localResult.row.discount_reserved ?? isAnnualDiscountReserved(position)
        );

        if (!localResult.existing && shouldSendPreviewEmails()) {
          await sendWaitlistEmails({
            name,
            email,
            position,
            discountReserved,
            existing: localResult.existing,
          }).catch((emailError) => {
            console.error("[waitlist] preview email error:", emailError);
          });
        }

        return NextResponse.json(
          {
            ok: true,
            previewMode: true,
            storageReady: false,
            existing: localResult.existing,
            position,
            discountReserved,
            campaign: campaignPayload(readLocalWaitlistStats()),
          },
          { headers: rateLimitHeaders(emailLimiter) }
        );
      }

      return NextResponse.json(
        { error: "Waitlist storage is not configured yet." },
        { status: 503, headers: rateLimitHeaders(ipLimiter) }
      );
    }

    let row: WaitlistRow | null = null;
    let existing = false;

    const insertResult = await supabase
      .from("launch_waitlist")
      .insert({
        name: name || null,
        email,
        source,
        accepted_marketing: true,
        accepted_terms: true,
        ip,
        user_agent: req.headers.get("user-agent") || null,
        metadata: {
          campaign: WAITLIST_CAMPAIGN.name,
          launchDateIso: WAITLIST_CAMPAIGN.launchDateIso,
          discountPercent: WAITLIST_CAMPAIGN.discountPercent,
          discountPlan: WAITLIST_CAMPAIGN.discountPlan,
        },
      })
      .select("position, discount_reserved, created_at")
      .single();

    if (insertResult.error) {
      if (insertResult.error.code !== "23505") throw insertResult.error;

      existing = true;
      const existingResult = await supabase
        .from("launch_waitlist")
        .select("position, discount_reserved, created_at")
        .eq("email_normalized", email)
        .maybeSingle();

      if (existingResult.error) throw existingResult.error;
      row = existingResult.data as WaitlistRow | null;
    } else {
      row = insertResult.data as WaitlistRow | null;
    }

    if (!row) {
      return NextResponse.json(
        { error: "Could not confirm this waitlist spot." },
        { status: 500, headers: rateLimitHeaders(ipLimiter) }
      );
    }

    const position = typeof row.position === "number" ? row.position : null;
    const discountReserved = Boolean(row.discount_reserved ?? isAnnualDiscountReserved(position));
    const stats = await readWaitlistStats(supabase).catch(() => null);

    if (!existing) {
      await sendWaitlistEmails({
        name,
        email,
        position,
        discountReserved,
        existing,
      }).catch((emailError) => {
        console.error("[waitlist] email error:", emailError);
      });
    }

    return NextResponse.json(
      {
        ok: true,
        previewMode: false,
        storageReady: true,
        existing,
        position,
        discountReserved,
        campaign: campaignPayload(stats || undefined),
      },
      { headers: rateLimitHeaders(emailLimiter) }
    );
  } catch (error) {
    console.error("[waitlist] signup error:", error);
    return NextResponse.json(
      { error: "Could not join the waitlist right now." },
      { status: 500, headers: rateLimitHeaders(ipLimiter) }
    );
  }
}
