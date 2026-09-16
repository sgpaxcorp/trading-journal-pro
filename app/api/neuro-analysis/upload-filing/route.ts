import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { after, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { enqueueNeuroJob } from "@/lib/neuroAnalysisJobs";
import { processNeuroJobBatch } from "@/lib/neuroAnalysisJobWorker";
import { checkNeuroQuota, checkNeuroStorageQuota } from "@/lib/neuroAnalysisQuota";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireRuntimeControl } from "@/lib/runtimeControls";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const MAX_FILING_PDF_BYTES = 35 * 1024 * 1024;
const STAGING_BUCKET = "neuro-analysis-staging";

function sanitizeTicker(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
}

function sanitizeForm(value: FormDataEntryValue | null): "10-K" | "10-Q" | null {
  const form = String(value ?? "").trim().toUpperCase();
  return form === "10-K" || form === "10-Q" ? form : null;
}

function sanitizeFiscalYear(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed >= 1990 && parsed <= 2100 ? parsed : null;
}

function sanitizeShortText(value: FormDataEntryValue | null, max = 64) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

export async function POST(req: Request) {
  let stagedPath = "";
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;
    const runtimeGate = await requireRuntimeControl("pdf_uploads");
    if (runtimeGate) return runtimeGate;

    const rate = await rateLimit(`neuro-analysis:filing:${authUser.userId}`, {
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
      return NextResponse.json({ error: "Document analysis is not configured." }, { status: 503 });
    }

    const formData = await req.formData();
    const ticker = sanitizeTicker(formData.get("ticker"));
    const filingForm = sanitizeForm(formData.get("form"));
    const fiscalYear = sanitizeFiscalYear(formData.get("fiscalYear"));
    const period = sanitizeShortText(formData.get("period"));
    const periodEnd = sanitizeShortText(formData.get("periodEnd"), 16);
    const file = formData.get("file");

    if (!ticker) return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    if (!filingForm) return NextResponse.json({ error: "Form must be 10-K or 10-Q." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
    if (file.size <= 0) return NextResponse.json({ error: "The PDF is empty." }, { status: 400 });
    if (file.size > MAX_FILING_PDF_BYTES) {
      return NextResponse.json({ error: "PDF is too large. Upload a document up to 35MB." }, { status: 413 });
    }

    const fileName = (String(file.name ?? "").trim() || `${ticker}-${filingForm}.pdf`).slice(0, 512);
    if (file.type !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF documents are supported." }, { status: 400 });
    }

    const content = Buffer.from(await file.arrayBuffer());
    if (content.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "The uploaded file is not a valid PDF document." }, { status: 400 });
    }

    const [quota, storageQuota] = await Promise.all([
      checkNeuroQuota(authUser.userId, "filing_upload"),
      checkNeuroStorageQuota(authUser.userId, content.length),
    ]);
    if (!quota.allowed) {
      return NextResponse.json({ error: "Monthly document upload quota exceeded.", quota }, { status: 429 });
    }
    if (!storageQuota.allowed) {
      return NextResponse.json({ error: "Document storage quota exceeded.", quota: storageQuota }, { status: 429 });
    }

    stagedPath = `${authUser.userId}/${Date.now()}-${randomUUID()}.pdf`;
    const upload = await supabaseAdmin.storage.from(STAGING_BUCKET).upload(stagedPath, content, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const job = await enqueueNeuroJob({
      userId: authUser.userId,
      jobType: "filing_upload_index",
      dedupeKey: `filing:${stagedPath}`,
      payload: {
        storagePath: stagedPath,
        ticker,
        form: filingForm,
        fiscalYear,
        period,
        periodEnd,
        fileName,
        contentType: "application/pdf",
        source: "user_uploaded_filing",
        metadata: {
          upload_source: "neuro_analysis_ui",
          original_type: file.type || "application/pdf",
        },
      },
    });

    after(async () => {
      await processNeuroJobBatch(1).catch((error) => {
        console.error("[neuro-analysis/upload-filing] background worker error:", error);
      });
    });

    return NextResponse.json(
      {
        queued: true,
        job: { id: job?.id, status: job?.status ?? "queued" },
        ticker,
        form: filingForm,
        fiscalYear,
        period,
        periodEnd,
        fileName,
      },
      { status: 202 }
    );
  } catch (error) {
    if (stagedPath) {
      await supabaseAdmin.storage.from(STAGING_BUCKET).remove([stagedPath]).catch(() => null);
    }
    console.error("[neuro-analysis/upload-filing] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Document upload failed." },
      { status: 500 }
    );
  }
}

