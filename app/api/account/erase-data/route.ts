import { NextRequest, NextResponse } from "next/server";

import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const CONFIRMATION = "ERASE ALL DATA";
const IGNORABLE_CODES = new Set(["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"]);

type DeleteResult = {
  table: string;
  count: number | null;
  skipped?: boolean;
};

function isIgnorable(error: any) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return (
    IGNORABLE_CODES.has(code) ||
    message.includes("could not find the table") ||
    message.includes("could not find a relationship") ||
    message.includes("column") && message.includes("does not exist")
  );
}

async function deleteByUser(table: string, userId: string, column = "user_id"): Promise<DeleteResult> {
  const { error, count } = await supabaseAdmin
    .from(table)
    .delete({ count: "exact" })
    .eq(column, userId);
  if (error) {
    if (isIgnorable(error)) return { table, count: null, skipped: true };
    throw error;
  }
  return { table, count: count ?? null };
}

async function deleteSupportStorage(userId: string) {
  try {
    const bucket = supabaseAdmin.storage.from("support_attachments");
    const listed = await bucket.list(userId, { limit: 1000 });
    if (listed.error) return { bucket: "support_attachments", removed: 0, skipped: true };
    const paths = (listed.data ?? []).map((item) => `${userId}/${item.name}`).filter(Boolean);
    if (!paths.length) return { bucket: "support_attachments", removed: 0 };
    const removed = await bucket.remove(paths);
    if (removed.error) return { bucket: "support_attachments", removed: 0, skipped: true };
    return { bucket: "support_attachments", removed: paths.length };
  } catch {
    return { bucket: "support_attachments", removed: 0, skipped: true };
  }
}

async function recreateDefaultAccount(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("trading_accounts")
    .insert({
      user_id: userId,
      name: "Main trading account",
      broker: null,
      is_default: true,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabaseAdmin.from("user_preferences").upsert(
    {
      user_id: userId,
      active_account_id: data.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return String(data.id);
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;
    const limiter = await rateLimit(`account-erase-data:${userId}:${getClientIp(req)}`, {
      limit: 2,
      windowMs: 60 * 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many data erase attempts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const confirmation = String(body?.confirmation ?? "").trim().toUpperCase();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const authEmail = String(access.context.user.email ?? "").trim().toLowerCase();

    if (confirmation !== CONFIRMATION) {
      return NextResponse.json({ error: `Type ${CONFIRMATION} to erase your data.` }, { status: 400 });
    }
    if (authEmail && email !== authEmail) {
      return NextResponse.json({ error: "Email confirmation does not match this account." }, { status: 400 });
    }

    const storage = await deleteSupportStorage(userId);
    const deletes: DeleteResult[] = [];

    const tablesInDeleteOrder = [
      "support_messages",
      "support_tickets",
      "ai_coach_feedback",
      "ai_coach_messages",
      "ai_coach_threads",
      "ai_coach_memory",
      "option_flow_chat_messages",
      "option_flow_chat_sessions",
      "option_flow_uploads",
      "option_flow_outcomes",
      "option_flow_reports",
      "option_flow_memory",
      "neuro_analysis_jobs",
      "neuro_analysis_usage_events",
      "neuro_analysis_snapshots",
      "neuro_analysis_reports",
      "neuro_analysis_filings",
      "neuro_analysis_cases",
      "neuro_analysis_snaptrade_users",
      "profit_loss_alert_deliveries",
      "profit_loss_budgets",
      "profit_loss_costs",
      "profit_loss_profiles",
      "goal_achievement_deliveries",
      "motivational_message_deliveries",
      "push_tokens",
      "ntj_alert_events",
      "ntj_alert_rules",
      "business_milestones",
      "challenge_run_days",
      "challenge_runs",
      "user_trophies",
      "profile_gamification",
      "journal_trades",
      "journal_entries",
      "daily_checklists",
      "daily_snapshots",
      "cashflows",
      "ntj_cashflows",
      "trades",
      "analytics_edges",
      "analytics_snapshots",
      "broker_order_events",
      "broker_imports",
      "broker_transactions",
      "trade_import_batches",
      "broker_oauth_connections",
      "snaptrade_users",
      "growth_plan_history",
      "growth_plans",
      "ntj_notebook_free_notes",
      "ntj_notebook_pages",
      "ntj_notebook_books",
      "journal_templates",
      "journal_ui_settings",
      "user_preferences",
      "trading_accounts",
    ];

    for (const table of tablesInDeleteOrder) {
      deletes.push(await deleteByUser(table, userId));
    }

    const activeAccountId = await recreateDefaultAccount(userId);

    return NextResponse.json({
      ok: true,
      activeAccountId,
      deleted: deletes,
      storage,
      preserved: ["auth user", "profile", "subscription", "entitlements", "billing records"],
    });
  } catch (err: any) {
    console.error("[account/erase-data] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
