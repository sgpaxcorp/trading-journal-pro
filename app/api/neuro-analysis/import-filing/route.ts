import { randomUUID } from "node:crypto";

import { after, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { MAX_NEURO_FILING_BYTES } from "@/lib/neuroFilingLibrary";
import { enqueueNeuroJob } from "@/lib/neuroAnalysisJobs";
import { processNeuroJobBatch } from "@/lib/neuroAnalysisJobWorker";
import { checkNeuroQuota, checkNeuroStorageQuota } from "@/lib/neuroAnalysisQuota";
import {
  downloadSecCompanyDocument,
  findRecentSecCompanyDocument,
  sanitizeSecAccessionNumber,
  sanitizeSecTicker,
} from "@/lib/neuroSecFilings";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requireRuntimeControl } from "@/lib/runtimeControls";

export const runtime = "nodejs";
const STAGING_BUCKET = "neuro-analysis-staging";

function filingResponse(row: any, alreadyImported: boolean) {
  return {
    id: row.id,
    ticker: row.ticker,
    form: row.form,
    fiscalYear: row.fiscal_year ?? row.fiscalYear ?? null,
    period: row.period ?? null,
    periodEnd: row.period_end ?? row.periodEnd ?? null,
    fileName: row.file_name ?? row.fileName,
    fileId: row.openai_file_id ?? row.fileId,
    vectorStoreId: row.vector_store_id ?? row.vectorStoreId,
    bytes: row.bytes,
    usageBytes: row.usage_bytes ?? row.usageBytes,
    status: row.status,
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    expiresAfterDays: row.expiresAfterDays,
    fileCounts: row.fileCounts,
    alreadyImported,
  };
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;
    const runtimeGate = await requireRuntimeControl("pdf_uploads");
    if (runtimeGate) return runtimeGate;

    const rate = await rateLimit(`neuro-analysis:filing-import:${authUser.userId}`, {
      limit: 8,
      windowMs: 10 * 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(retryAfter), ...rateLimitHeaders(rate) } }
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const ticker = sanitizeSecTicker(body?.ticker);
    const accessionNumber = sanitizeSecAccessionNumber(body?.accessionNumber);
    const form = String(body?.form ?? "").trim().toUpperCase();
    if (!ticker || !accessionNumber || (form !== "10-K" && form !== "10-Q")) {
      return NextResponse.json({ error: "Ticker, form, and accession number are required." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("neuro_analysis_filings")
      .select(
        "id,ticker,form,fiscal_year,period,period_end,file_name,openai_file_id,vector_store_id,bytes,usage_bytes,status,expires_at,created_at"
      )
      .eq("user_id", authUser.userId)
      .eq("ticker", ticker)
      .contains("metadata", { sec_accession_number: accessionNumber })
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (existing) return NextResponse.json(filingResponse(existing, true));

    const quota = await checkNeuroQuota(authUser.userId, "filing_upload");
    if (!quota.allowed) {
      return NextResponse.json({ error: "Monthly document upload quota exceeded.", quota }, { status: 429 });
    }

    const document = await findRecentSecCompanyDocument({ ticker, accessionNumber, form });
    const downloaded = await downloadSecCompanyDocument(document);
    if (downloaded.buffer.length > MAX_NEURO_FILING_BYTES) {
      return NextResponse.json({ error: "The filing is larger than 35MB." }, { status: 413 });
    }

    const storageQuota = await checkNeuroStorageQuota(authUser.userId, downloaded.buffer.length);
    if (!storageQuota.allowed) {
      return NextResponse.json({ error: "Document storage quota exceeded.", quota: storageQuota }, { status: 429 });
    }

    const fiscalYear = document.periodEnd ? Number(document.periodEnd.slice(0, 4)) : null;
    const period = document.form === "10-K" ? (fiscalYear ? `FY ${fiscalYear}` : "Annual") : document.periodEnd ? `Quarter ended ${document.periodEnd}` : "Quarterly";
    const extension = downloaded.contentType === "application/pdf" ? "pdf" : "html";
    const stagedPath = `${authUser.userId}/${Date.now()}-${randomUUID()}.${extension}`;
    const upload = await supabaseAdmin.storage.from(STAGING_BUCKET).upload(stagedPath, downloaded.buffer, {
      contentType: downloaded.contentType,
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    let job: any;
    try {
      job = await enqueueNeuroJob({
        userId: authUser.userId,
        jobType: "filing_upload_index",
        dedupeKey: `sec:${authUser.userId}:${document.accessionNumber}`,
        payload: {
          storagePath: stagedPath,
          ticker: document.ticker,
          form: document.form,
          fiscalYear: Number.isInteger(fiscalYear) ? fiscalYear : null,
          period,
          periodEnd: document.periodEnd,
          fileName: downloaded.fileName,
          contentType: downloaded.contentType,
          source: "official_filing_import",
          metadata: {
            upload_source: "official_company_document_import",
            original_type: downloaded.contentType,
            sec_accession_number: document.accessionNumber,
            filing_date: document.filingDate,
            source_url: document.documentUrl,
            filing_detail_url: document.filingDetailUrl,
          },
        },
      });
    } catch (error) {
      await supabaseAdmin.storage.from(STAGING_BUCKET).remove([stagedPath]);
      throw error;
    }

    after(async () => {
      await processNeuroJobBatch(1).catch((error) => {
        console.error("[neuro-analysis/import-filing] background worker error:", error);
      });
    });

    return NextResponse.json(
      {
        queued: true,
        alreadyImported: false,
        job: { id: job?.id, status: job?.status ?? "queued" },
        ticker: document.ticker,
        form: document.form,
        fiscalYear: Number.isInteger(fiscalYear) ? fiscalYear : null,
        period,
        periodEnd: document.periodEnd,
        fileName: downloaded.fileName,
      },
      { status: 202 }
    );
  } catch (error: any) {
    console.error("[neuro-analysis/import-filing] error:", error);
    const message = String(error?.message || "Company document import failed.");
    const status = message.includes("could not be verified") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
