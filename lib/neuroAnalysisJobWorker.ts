import "server-only";

import { Buffer } from "node:buffer";

import { indexNeuroFiling } from "@/lib/neuroFilingLibrary";
import { claimNeuroJobs, enqueueNeuroJob, markNeuroJob } from "@/lib/neuroAnalysisJobs";
import { generateDailyInvestmentOfficeBriefing } from "@/lib/neuroDailyInvestmentOfficeServer";
import { getRuntimeControls } from "@/lib/runtimeControls";
import { getEmergencyPortfolioControls } from "@/lib/emergencyPortfolioControls";
import { refreshInvestmentCompanyData } from "@/lib/neuroInvestmentDataPipeline";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

const STAGING_BUCKET = "neuro-analysis-staging";

type FilingJobPayload = {
  storagePath?: string;
  ticker?: string;
  form?: string;
  fiscalYear?: number | null;
  period?: string | null;
  periodEnd?: string | null;
  fileName?: string;
  contentType?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

function filingPayload(value: unknown): Required<Pick<FilingJobPayload, "storagePath" | "ticker" | "form" | "fileName">> & FilingJobPayload {
  const payload = (value ?? {}) as FilingJobPayload;
  const storagePath = String(payload.storagePath ?? "").trim();
  const ticker = String(payload.ticker ?? "").trim().toUpperCase();
  const form = String(payload.form ?? "").trim().toUpperCase();
  const fileName = String(payload.fileName ?? "").trim();
  if (!storagePath || !ticker || !fileName || (form !== "10-K" && form !== "10-Q")) {
    throw new Error("Invalid filing job payload.");
  }
  return { ...payload, storagePath, ticker, form, fileName };
}

async function processFilingJob(job: any) {
  const payload = filingPayload(job.payload);
  const { data, error } = await supabaseAdmin.storage.from(STAGING_BUCKET).download(payload.storagePath);
  if (error || !data) throw new Error(error?.message || "Staged company document is unavailable.");

  const content = Buffer.from(await data.arrayBuffer());
  const source = payload.source === "official_filing_import"
    ? "official_filing_import"
    : "user_uploaded_filing";
  if (source === "user_uploaded_filing" && content.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("The staged upload is not a valid PDF document.");
  }

  const result = await indexNeuroFiling({
    userId: String(job.user_id),
    ticker: payload.ticker,
    form: payload.form as "10-K" | "10-Q",
    fiscalYear: Number.isInteger(payload.fiscalYear) ? Number(payload.fiscalYear) : null,
    period: payload.period ? String(payload.period) : null,
    periodEnd: payload.periodEnd ? String(payload.periodEnd) : null,
    fileName: payload.fileName,
    content,
    contentType: String(payload.contentType || "application/pdf"),
    source,
    metadata: payload.metadata ?? {},
  });

  await supabaseAdmin.storage.from(STAGING_BUCKET).remove([payload.storagePath]);
  return result;
}

export async function processNeuroJobBatch(limit = 2) {
  const jobs = await claimNeuroJobs(limit);
  const summary = { claimed: jobs.length, succeeded: 0, deferred: 0, retried: 0, failed: 0 };
  const runtimeControls = await getRuntimeControls();
  const emergencyControls = await getEmergencyPortfolioControls();

  for (const job of jobs as any[]) {
    try {
      if (job.job_type === "filing_upload_index") {
        if (!runtimeControls.pdf_uploads) {
          await markNeuroJob({
            jobId: String(job.id),
            status: "queued",
            error: "PDF processing is paused by an operational control.",
            runAfter: new Date(Date.now() + 5 * 60_000).toISOString(),
            attempts: Math.max(0, Number(job.attempts ?? 1) - 1),
          });
          summary.deferred += 1;
          continue;
        }
        const result = await processFilingJob(job);
        await markNeuroJob({ jobId: String(job.id), status: "succeeded", result });
        summary.succeeded += 1;
        continue;
      }
      if (job.job_type === "daily_investment_office") {
        const userId = String(job.user_id ?? "").trim();
        if (!userId) throw new Error("Daily Investment Office job is missing a user.");
        const briefingDate = String(job.payload?.briefingDate ?? "").trim() || null;
        const result = await generateDailyInvestmentOfficeBriefing({ userId, briefingDate });
        await markNeuroJob({ jobId: String(job.id), status: "succeeded", result });
        summary.succeeded += 1;
        continue;
      }
      if (job.job_type === "investment_data_refresh") {
        if (emergencyControls.readOnly) {
          await markNeuroJob({
            jobId: String(job.id),
            status: "queued",
            error: "The investment system is in READ ONLY mode.",
            runAfter: new Date(Date.now() + 5 * 60_000).toISOString(),
            attempts: Math.max(0, Number(job.attempts ?? 1) - 1),
          });
          summary.deferred += 1;
          continue;
        }
        const ticker = String(job.payload?.ticker ?? "").trim();
        if (!ticker) throw new Error("Investment data refresh job is missing a ticker.");
        const result = await refreshInvestmentCompanyData({
          ticker,
          userId: job.user_id ? String(job.user_id) : null,
          asOfTimestamp: String(job.payload?.asOfTimestamp ?? "").trim() || undefined,
        });
        if (result.ingestion.submissionHistoryFilesRemaining > 0) {
          await enqueueNeuroJob({
            userId: job.user_id ? String(job.user_id) : null,
            jobType: "investment_data_refresh",
            payload: {
              ticker,
              asOfTimestamp: String(job.payload?.asOfTimestamp ?? "").trim() || undefined,
            },
            runAfter: new Date(Date.now() + 60_000).toISOString(),
            dedupeKey: `investment-data-history:${ticker}:${result.ingestion.submissionHistoryCheckpoint}`,
          }).catch((error: any) => {
            if (error?.code !== "23505" && !String(error?.message ?? "").includes("duplicate")) throw error;
          });
        }
        await markNeuroJob({ jobId: String(job.id), status: "succeeded", result });
        summary.succeeded += 1;
        continue;
      }
      throw new Error(`Unsupported Neuro Analysis job type: ${job.job_type}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Neuro Analysis job failed.";
      const attempts = Number(job.attempts ?? 1);
      const maxAttempts = Number(job.max_attempts ?? 3);
      if (message.includes("READ ONLY") || message.includes("already in progress")) {
        await markNeuroJob({
          jobId: String(job.id),
          status: "queued",
          error: message,
          runAfter: new Date(Date.now() + 5 * 60_000).toISOString(),
          attempts: Math.max(0, attempts - 1),
        });
        summary.deferred += 1;
        continue;
      }
      if (attempts < maxAttempts) {
        const delaySeconds = Math.min(300, 15 * 2 ** Math.max(0, attempts - 1));
        await markNeuroJob({
          jobId: String(job.id),
          status: "queued",
          error: message,
          runAfter: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        });
        summary.retried += 1;
      } else {
        const storagePath = String((job.payload as FilingJobPayload | null)?.storagePath ?? "").trim();
        if (storagePath) {
          await supabaseAdmin.storage.from(STAGING_BUCKET).remove([storagePath]).catch(() => undefined);
        }
        await markNeuroJob({ jobId: String(job.id), status: "failed", error: message });
        summary.failed += 1;
      }
    }
  }

  return summary;
}
