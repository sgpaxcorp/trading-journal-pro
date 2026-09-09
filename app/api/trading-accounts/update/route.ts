import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import {
  defaultFundedAccountProfile,
  fundedProfileRulesSignature,
  fundedProfileToDatabase,
  getFundedProfileMissingFields,
  normalizeFundedAccountProfile,
  normalizeTradingAccountType,
} from "@/lib/fundedAccounts";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function accountHasActivity(userId: string, accountId: string) {
  const [entries, trades] = await Promise.all([
    supabaseAdmin
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("account_id", accountId),
    supabaseAdmin
      .from("journal_trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("account_id", accountId),
  ]);
  return Number(entries.count ?? 0) > 0 || Number(trades.count ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;
    const limiter = await rateLimit(`trading-account-update:${userId}:${getClientIp(req)}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many account update attempts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const accountId = String(body?.accountId ?? "").trim();
    if (!UUID_RE.test(accountId)) {
      return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("trading_accounts")
      .select("id,name,broker,account_type")
      .eq("id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (!existing) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const previousType = normalizeTradingAccountType(existing.account_type);
    const requestedAccountType = body?.accountType ?? body?.account_type;
    const accountType = requestedAccountType == null
      ? previousType
      : normalizeTradingAccountType(requestedAccountType);
    if (accountType !== previousType && (await accountHasActivity(userId, accountId))) {
      return NextResponse.json(
        { error: "Account type cannot be changed after execution records exist." },
        { status: 409 }
      );
    }

    const name = String(body?.name ?? existing.name ?? "").trim().slice(0, 80);
    const broker = String(body?.broker ?? existing.broker ?? "").trim().slice(0, 80) || null;
    if (!name) return NextResponse.json({ error: "Missing account name" }, { status: 400 });

    let previousFundedProfile = null;
    let incomingFundedProfile = null;
    if (accountType === "funded") {
      const { data: previousProfile, error: previousProfileError } = await supabaseAdmin
        .from("funded_account_profiles")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", userId)
        .maybeSingle();
      if (previousProfileError) throw previousProfileError;
      previousFundedProfile = normalizeFundedAccountProfile(previousProfile);
      incomingFundedProfile =
        normalizeFundedAccountProfile(body?.fundedProfile ?? body?.funded_profile) ??
        previousFundedProfile ??
        defaultFundedAccountProfile();
      const missingFields = getFundedProfileMissingFields(incomingFundedProfile);
      if (missingFields.length) {
        return NextResponse.json(
          {
            error: "Complete and confirm the funded-account rules before saving.",
            fields: missingFields,
          },
          { status: 400 }
        );
      }
      if (
        previousFundedProfile &&
        fundedProfileRulesSignature(previousFundedProfile) !==
          fundedProfileRulesSignature(incomingFundedProfile) &&
        incomingFundedProfile.rulesConfirmedAt === previousFundedProfile.rulesConfirmedAt
      ) {
        return NextResponse.json(
          { error: "Confirm the current official program rules after changing a funded limit." },
          { status: 400 }
        );
      }
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("trading_accounts")
      .update({ name, broker, account_type: accountType, updated_at: new Date().toISOString() })
      .eq("id", accountId)
      .eq("user_id", userId)
      .select("id,user_id,name,broker,account_type,is_default,created_at,updated_at")
      .single();
    if (updateErr) throw updateErr;

    let fundedProfile = null;
    if (accountType === "funded") {
      const previous = previousFundedProfile;
      const incoming = incomingFundedProfile ?? defaultFundedAccountProfile();
      const stageChanged = Boolean(previous && previous.stage !== incoming.stage);
      const rulesChanged = Boolean(
        previous &&
        (
          fundedProfileRulesSignature(previous) !== fundedProfileRulesSignature(incoming) ||
          previous.rulesConfirmedAt !== incoming.rulesConfirmedAt
        )
      );
      const equityChanged = Boolean(
        previous && Math.abs(previous.currentEquity - incoming.currentEquity) > 0.005
      );
      const profileChanged = !previous || rulesChanged || equityChanged;
      const rulesVersion = previous
        ? previous.rulesVersion + (rulesChanged ? 1 : 0)
        : 1;

      if (!profileChanged && previous) {
        fundedProfile = previous;
      } else {
        const row = {
          account_id: accountId,
          user_id: userId,
          ...fundedProfileToDatabase(incoming),
          rules_version: rulesVersion,
        };
        const { data: savedProfile, error: profileErr } = await supabaseAdmin
          .from("funded_account_profiles")
          .upsert(row, { onConflict: "account_id" })
          .select("*")
          .single();
        if (profileErr) {
          await supabaseAdmin
            .from("trading_accounts")
            .update({
              name: existing.name,
              broker: existing.broker,
              account_type: previousType,
              updated_at: new Date().toISOString(),
            })
            .eq("id", accountId)
            .eq("user_id", userId);
          throw profileErr;
        }
        fundedProfile = normalizeFundedAccountProfile(savedProfile);

        await supabaseAdmin.from("funded_account_events").insert({
          account_id: accountId,
          user_id: userId,
          event_type: stageChanged
            ? "stage_changed"
            : rulesChanged
              ? "rules_updated"
              : previous
                ? "equity_updated"
                : "created",
          from_stage: previous?.stage ?? null,
          to_stage: fundedProfile?.stage ?? null,
          rules_version: rulesVersion,
          snapshot: row,
        });
      }
    } else if (previousType === "funded") {
      const { error: deleteProfileError } = await supabaseAdmin
        .from("funded_account_profiles")
        .delete()
        .eq("account_id", accountId)
        .eq("user_id", userId);
      if (deleteProfileError) {
        await supabaseAdmin
          .from("trading_accounts")
          .update({ account_type: previousType, updated_at: new Date().toISOString() })
          .eq("id", accountId)
          .eq("user_id", userId);
        throw deleteProfileError;
      }
    }

    return NextResponse.json({
      account: {
        ...updated,
        account_type: accountType,
        funded_profile: fundedProfile,
      },
    });
  } catch (err: any) {
    console.error("[trading-accounts/update] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
