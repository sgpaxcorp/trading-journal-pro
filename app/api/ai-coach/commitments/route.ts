import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import {
  buildSuggestedCommitment,
  evaluateCoachCommitment,
  type CoachActionPlan,
  type CoachCommitment,
  type CoachCommitmentMetric,
  type CoachEvidenceItem,
  type CommitmentEvaluationSession,
} from "@/lib/aiCoachAccountability";
import { auditOrderEvents } from "@/lib/audit/auditEngine";
import type { NormalizedOrderEvent } from "@/lib/brokers/types";
import { isNotTradedJournalEntry } from "@/lib/journalSessionStatus";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommitmentRow = Record<string, unknown>;

function cleanText(value: unknown, max = 600) {
  return String(value ?? "").trim().slice(0, max);
}

function languageFrom(value: unknown): "en" | "es" {
  return String(value ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

function dateKey(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function isMissingTable(error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? error ?? "");
  return /ai_coach_commitments|relation .* does not exist|schema cache/i.test(message);
}

function mapCommitment(row: CommitmentRow): CoachCommitment {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    threadId: row.thread_id ? String(row.thread_id) : null,
    sourceMessageId: row.source_message_id ? String(row.source_message_id) : null,
    title: String(row.title ?? ""),
    instruction: String(row.instruction ?? ""),
    successCriteria: String(row.success_criteria ?? ""),
    metric: String(row.metric) as CoachCommitmentMetric,
    thresholdUsd: row.threshold_usd == null ? null : Number(row.threshold_usd),
    targetSessions: Number(row.target_sessions ?? 3),
    baselineDate: String(row.baseline_date ?? ""),
    status: row.status as CoachCommitment["status"],
    sessionsObserved: Number(row.sessions_observed ?? 0),
    sessionsEvaluated: Number(row.sessions_evaluated ?? 0),
    sessionsMet: Number(row.sessions_met ?? 0),
    outcomes: Array.isArray(row.outcomes) ? row.outcomes as CoachCommitment["outcomes"] : [],
    evidence: Array.isArray(row.evidence) ? row.evidence as CoachEvidenceItem[] : [],
    acceptedAt: String(row.accepted_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function verifyAccount(userId: string, accountId: string) {
  const { data, error } = await supabaseAdmin
    .from("trading_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data?.id);
}

async function evaluateRow(row: CommitmentRow, userId: string, language: "en" | "es") {
  const accountId = String(row.account_id);
  const baselineDate = String(row.baseline_date);
  const targetSessions = Number(row.target_sessions ?? 3);
  const { data: journalRows, error } = await supabaseAdmin
    .from("journal_entries")
    .select("date,pnl,respected_plan,notes,tags,instrument")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .gt("date", baselineDate)
    .order("date", { ascending: true })
    .limit(Math.max(12, targetSessions * 4));

  if (error) throw error;
  const tradedRows = (journalRows ?? []).filter((entry) => !isNotTradedJournalEntry(entry));
  const selected = tradedRows.slice(0, targetSessions);
  const stopByDate = new Map<string, boolean | null>();

  if (String(row.metric) === "protective_stop" && selected.length) {
    const dates = selected.map((entry) => String(entry.date));
    const { data: orderRows } = await supabaseAdmin
      .from("broker_order_events")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .in("date", dates)
      .order("ts_utc", { ascending: true });

    for (const date of dates) {
      const events = (orderRows ?? []).filter((event) => String(event.date) === date);
      stopByDate.set(
        date,
        events.length ? auditOrderEvents(events as NormalizedOrderEvent[]).stop_present : null
      );
    }
  }

  const sessions: CommitmentEvaluationSession[] = selected.map((entry) => ({
    date: String(entry.date),
    pnl: Number(entry.pnl ?? 0),
    respectedPlan:
      typeof entry.respected_plan === "boolean" ? entry.respected_plan : null,
    stopPresent: stopByDate.get(String(entry.date)),
  }));
  const evaluation = evaluateCoachCommitment({
    metric: String(row.metric) as CoachCommitmentMetric,
    targetSessions,
    thresholdUsd: row.threshold_usd == null ? null : Number(row.threshold_usd),
    sessions,
    language,
  });

  const changed =
    String(row.status) !== evaluation.status ||
    Number(row.sessions_observed ?? 0) !== evaluation.sessionsObserved ||
    Number(row.sessions_evaluated ?? 0) !== evaluation.sessionsEvaluated ||
    Number(row.sessions_met ?? 0) !== evaluation.sessionsMet;
  if (!changed) return row;

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("ai_coach_commitments")
    .update({
      status: evaluation.status,
      sessions_observed: evaluation.sessionsObserved,
      sessions_evaluated: evaluation.sessionsEvaluated,
      sessions_met: evaluation.sessionsMet,
      outcomes: evaluation.outcomes,
      resolved_at: evaluation.status === "active" ? null : now,
      updated_at: now,
    })
    .eq("id", String(row.id))
    .eq("user_id", userId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return updated as CommitmentRow;
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireAdvancedPlan(auth.userId);
    if (gate) return gate;

    const url = new URL(req.url);
    const accountId = cleanText(url.searchParams.get("accountId"), 80);
    const language = languageFrom(url.searchParams.get("language"));
    if (!accountId || !(await verifyAccount(auth.userId, accountId))) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("ai_coach_commitments")
      .select("*")
      .eq("user_id", auth.userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;

    const evaluated: CommitmentRow[] = [];
    for (const row of (data ?? []) as CommitmentRow[]) {
      evaluated.push(String(row.status) === "active" ? await evaluateRow(row, auth.userId, language) : row);
    }
    const commitments = evaluated.map(mapCommitment);
    return NextResponse.json({
      active: commitments.find((item) => item.status === "active") ?? null,
      recent: commitments.filter((item) => item.status !== "active").slice(0, 5),
    });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: "AI Coach accountability is not available until the database migration is applied.", code: "migration_required" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: cleanText((error as Error)?.message) || "Unable to load commitment." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireAdvancedPlan(auth.userId);
    if (gate) return gate;
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const accountId = cleanText(body?.accountId, 80);
    const language = languageFrom(body?.language);
    if (!accountId || !(await verifyAccount(auth.userId, accountId))) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const actionInput = (body?.actionPlan && typeof body.actionPlan === "object" ? body.actionPlan : {}) as Partial<CoachActionPlan>;
    const actionPlan: Partial<CoachActionPlan> = {
      summary: cleanText(actionInput.summary, 180),
      businessImpact: cleanText(actionInput.businessImpact, 220),
      whatISee: cleanText(actionInput.whatISee, 220),
      whatIsDrifting: cleanText(actionInput.whatIsDrifting, 220),
      whatToProtect: cleanText(actionInput.whatToProtect, 180),
      whatChangesNextSession: cleanText(actionInput.whatChangesNextSession, 180),
      nextAction: cleanText(actionInput.nextAction, 180),
      ruleToAdd: cleanText(actionInput.ruleToAdd, 180),
      ruleToRemove: cleanText(actionInput.ruleToRemove, 180),
      checkpointFocus: cleanText(actionInput.checkpointFocus, 140),
    };
    if (!actionPlan.nextAction && !actionPlan.whatChangesNextSession) {
      return NextResponse.json({ error: "A measurable next action is required." }, { status: 400 });
    }

    const { data: plan } = await supabaseAdmin
      .from("growth_plans")
      .select("starting_balance,max_daily_loss_percent")
      .eq("user_id", auth.userId)
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const balance = Number(plan?.starting_balance);
    const dailyLossPct = Number(plan?.max_daily_loss_percent);
    const maxDailyLossUsd =
      Number.isFinite(balance) && balance > 0 && Number.isFinite(dailyLossPct) && dailyLossPct > 0
        ? (balance * dailyLossPct) / 100
        : null;
    const suggested = buildSuggestedCommitment({ actionPlan, language, maxDailyLossUsd });
    const baselineDate = dateKey(body?.baselineDate) ?? new Date().toISOString().slice(0, 10);
    const evidence = Array.isArray(body?.evidence) ? (body.evidence as CoachEvidenceItem[]).slice(0, 6) : [];
    const requestedThreadId = cleanText(body?.threadId, 80);
    const requestedMessageId = cleanText(body?.sourceMessageId, 80);
    const [{ data: ownedThread }, { data: ownedMessage }] = await Promise.all([
      requestedThreadId
        ? supabaseAdmin
            .from("ai_coach_threads")
            .select("id")
            .eq("id", requestedThreadId)
            .eq("user_id", auth.userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      requestedMessageId
        ? supabaseAdmin
            .from("ai_coach_messages")
            .select("id")
            .eq("id", requestedMessageId)
            .eq("user_id", auth.userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    await supabaseAdmin
      .from("ai_coach_commitments")
      .update({ status: "cancelled", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", auth.userId)
      .eq("account_id", accountId)
      .eq("status", "active");

    const { data: inserted, error } = await supabaseAdmin
      .from("ai_coach_commitments")
      .insert({
        user_id: auth.userId,
        account_id: accountId,
        thread_id: ownedThread?.id ?? null,
        source_message_id: ownedMessage?.id ?? null,
        title: suggested.title,
        instruction: suggested.instruction,
        success_criteria: suggested.successCriteria,
        metric: suggested.metric,
        threshold_usd: suggested.thresholdUsd,
        target_sessions: suggested.targetSessions,
        baseline_date: baselineDate,
        evidence,
        metadata: { source: "ai-coach", language },
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ commitment: mapCommitment(inserted as CommitmentRow) }, { status: 201 });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "Database migration required.", code: "migration_required" }, { status: 503 });
    }
    return NextResponse.json({ error: cleanText((error as Error)?.message) || "Unable to accept commitment." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await requireAdvancedPlan(auth.userId);
  if (gate) return gate;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = cleanText(body?.id, 80);
  if (!id) return NextResponse.json({ error: "Commitment id is required." }, { status: 400 });
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("ai_coach_commitments")
    .update({ status: "cancelled", resolved_at: now, updated_at: now })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: cleanText(error.message) }, { status: 500 });
  return NextResponse.json({ commitment: data ? mapCommitment(data as CommitmentRow) : null });
}
