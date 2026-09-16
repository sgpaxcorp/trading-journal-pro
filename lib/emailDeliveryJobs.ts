import "server-only";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export async function enqueueEmailDeliveryJob(input: {
  kind: string;
  dedupeKey: string;
  payload: unknown;
  runAfter?: string | null;
  maxAttempts?: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("email_delivery_jobs")
    .upsert(
      {
        kind: input.kind,
        dedupe_key: input.dedupeKey,
        payload: input.payload ?? {},
        run_after: input.runAfter ?? new Date().toISOString(),
        max_attempts: Math.max(1, Math.min(10, input.maxAttempts ?? 4)),
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    )
    .select("id,status,dedupe_key")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (data) return data;
  const existing = await supabaseAdmin
    .from("email_delivery_jobs")
    .select("id,status,dedupe_key")
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  return existing.data;
}

export async function claimEmailDeliveryJobs(limit = 20) {
  const { data, error } = await supabaseAdmin.rpc("claim_email_delivery_jobs", {
    p_limit: Math.max(1, Math.min(100, Math.floor(limit))),
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function updateEmailDeliveryJob(input: {
  id: string;
  status: "queued" | "succeeded" | "failed" | "cancelled";
  result?: unknown;
  error?: string | null;
  runAfter?: string | null;
}) {
  const patch: Record<string, unknown> = {
    status: input.status,
    result: input.result ?? {},
    error: input.error ?? null,
    locked_at: null,
  };
  if (input.status === "queued") {
    patch.run_after = input.runAfter ?? new Date().toISOString();
    patch.completed_at = null;
  } else {
    patch.completed_at = new Date().toISOString();
  }
  const { error } = await supabaseAdmin.from("email_delivery_jobs").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
}

