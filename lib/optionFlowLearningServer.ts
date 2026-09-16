import "server-only";

import {
  buildLearningSchedule,
  evaluateOptionFlowMarketResponse,
  filterSessionCandles,
  nextWeekdayDateKey,
  type OptionFlowTrackedFlow,
} from "@/lib/optionFlowLearning";
import { fetchOptionFlowIntradayCandles, optionFlowYahooSymbol } from "@/lib/optionFlowMarketData";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type ScheduleLearningInput = {
  userId: string;
  memoryId: string;
  underlying: string;
  sourceSessionDate: string;
  provider?: string | null;
  tradeIntent?: string | null;
  trackedFlows: OptionFlowTrackedFlow[];
  analysisSnapshot: Record<string, unknown>;
};

type LearningRunRow = {
  id: string;
  user_id: string;
  memory_id?: string | null;
  underlying: string;
  source_session_date: string;
  target_session_date: string;
  evaluation_due_at: string;
  status: string;
  attempt_count?: number | null;
  tracked_flows?: OptionFlowTrackedFlow[] | null;
  analysis_snapshot?: Record<string, any> | null;
};

export async function scheduleOptionFlowLearning(input: ScheduleLearningInput) {
  const schedule = buildLearningSchedule(input.sourceSessionDate);
  const payload = {
    user_id: input.userId,
    memory_id: input.memoryId,
    underlying: input.underlying.trim().toUpperCase(),
    market_symbol: optionFlowYahooSymbol(input.underlying),
    provider: input.provider ?? null,
    trade_intent: input.tradeIntent ?? null,
    source_session_date: schedule.sourceSessionDate,
    target_session_date: schedule.targetSessionDate,
    evaluation_due_at: schedule.evaluationDueAt,
    status: "pending",
    tracked_flows: input.trackedFlows,
    analysis_snapshot: input.analysisSnapshot,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("option_flow_learning_runs")
    .upsert(payload, { onConflict: "user_id,memory_id" })
    .select(
      "id,memory_id,underlying,source_session_date,target_session_date,evaluation_due_at,status,tracked_flows,market_validation,evaluated_at,created_at"
    )
    .single();
  if (error) throw error;
  return data;
}

async function updateRun(id: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("option_flow_learning_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function evaluateOneRun(row: LearningRunRow, now: Date) {
  const candles = await fetchOptionFlowIntradayCandles({
    underlying: row.underlying,
    startDate: row.source_session_date,
    endDate: row.target_session_date,
  });
  const targetCandles = filterSessionCandles(candles, row.target_session_date);
  if (!targetCandles.length) {
    const nextTarget = nextWeekdayDateKey(row.target_session_date);
    const nextSchedule = buildLearningSchedule(row.target_session_date);
    await updateRun(row.id, {
      status: "pending",
      target_session_date: nextTarget,
      evaluation_due_at: nextSchedule.evaluationDueAt,
      attempt_count: Number(row.attempt_count ?? 0) + 1,
      last_error: "No regular-session candles were available; moved to the next weekday.",
    });
    return "rescheduled" as const;
  }

  const snapshot = row.analysis_snapshot ?? {};
  const validation = evaluateOptionFlowMarketResponse({
    sourceSessionDate: row.source_session_date,
    targetSessionDate: row.target_session_date,
    candles,
    trackedFlows: Array.isArray(row.tracked_flows) ? row.tracked_flows : [],
    analysisBias: snapshot.flowBias,
    fallbackSourceClose: snapshot.previousClose ?? snapshot.spotEstimate,
    evaluatedAt: now,
  });
  if (!validation) {
    throw new Error("The source reference price or target session was unavailable.");
  }

  await updateRun(row.id, {
    status: "completed",
    market_validation: validation,
    evaluated_at: now.toISOString(),
    attempt_count: Number(row.attempt_count ?? 0) + 1,
    last_error: null,
  });
  return "completed" as const;
}

export async function evaluateOptionFlowLearningRuns(input?: {
  userId?: string | null;
  limit?: number;
  now?: Date;
}) {
  const now = input?.now ?? new Date();
  const limit = Math.min(50, Math.max(1, Number(input?.limit ?? 20)));
  let query = supabaseAdmin
    .from("option_flow_learning_runs")
    .select(
      "id,user_id,memory_id,underlying,source_session_date,target_session_date,evaluation_due_at,status,attempt_count,tracked_flows,analysis_snapshot"
    )
    .in("status", ["pending", "retry"])
    .lte("evaluation_due_at", now.toISOString())
    .order("evaluation_due_at", { ascending: true })
    .limit(limit);
  if (input?.userId) query = query.eq("user_id", input.userId);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as LearningRunRow[];
  const result = { scanned: rows.length, completed: 0, rescheduled: 0, failed: 0 };

  for (const row of rows) {
    try {
      const outcome = await evaluateOneRun(row, now);
      if (outcome === "completed") result.completed += 1;
      else result.rescheduled += 1;
    } catch (error: any) {
      const attempts = Number(row.attempt_count ?? 0) + 1;
      const terminal = attempts >= 12;
      await updateRun(row.id, {
        status: terminal ? "failed" : "retry",
        attempt_count: attempts,
        last_error: String(error?.message ?? "Market validation failed.").slice(0, 500),
      }).catch(() => undefined);
      result.failed += 1;
    }
  }

  return result;
}
