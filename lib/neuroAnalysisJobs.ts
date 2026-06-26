import "server-only";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export async function enqueueNeuroJob(input: {
  userId?: string | null;
  caseId?: string | null;
  jobType: string;
  payload?: unknown;
  runAfter?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_jobs")
    .insert({
      user_id: input.userId ?? null,
      case_id: input.caseId ?? null,
      job_type: input.jobType,
      payload: input.payload ?? {},
      run_after: input.runAfter ?? new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listNeuroJobs(userId: string, caseId?: string | null) {
  let query = supabaseAdmin
    .from("neuro_analysis_jobs")
    .select("id,case_id,job_type,status,result,error,attempts,run_after,started_at,completed_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (caseId) query = query.eq("case_id", caseId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markNeuroJob(input: {
  jobId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  result?: unknown;
  error?: string | null;
}) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    result: input.result ?? {},
    error: input.error ?? null,
  };
  if (input.status === "running") patch.started_at = now;
  if (input.status === "succeeded" || input.status === "failed" || input.status === "cancelled") {
    patch.completed_at = now;
  }
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_jobs")
    .update(patch)
    .eq("id", input.jobId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
