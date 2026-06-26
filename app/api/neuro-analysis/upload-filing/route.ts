import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

import { getAuthUser } from "@/lib/authServer";
import { checkNeuroQuota, checkNeuroStorageQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_FILING_PDF_BYTES = 35 * 1024 * 1024;
const FILING_VECTOR_STORE_EXPIRY_DAYS = 90;

function sanitizeTicker(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function sanitizeForm(value: FormDataEntryValue | null): "10-K" | "10-Q" | null {
  const form = String(value ?? "").trim().toUpperCase();
  return form === "10-K" || form === "10-Q" ? form : null;
}

function sanitizeFiscalYear(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1990 || parsed > 2100) return null;
  return parsed;
}

function sanitizeShortText(value: FormDataEntryValue | null, max = 64) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

async function findReusableTickerVectorStore(userId: string, ticker: string) {
  const { data, error } = await supabaseAdmin
    .from("neuro_analysis_filings")
    .select("vector_store_id")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .not("vector_store_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.vector_store_id) return null;

  try {
    const store = await client.vectorStores.retrieve(String(data.vector_store_id));
    return store.status === "expired" ? null : store;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const rate = await rateLimit(`neuro-analysis:filing:${authUser.userId}`, {
      limit: 8,
      windowMs: 10 * 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(rate),
          },
        }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
    }

    const formData = await req.formData();
    const ticker = sanitizeTicker(formData.get("ticker"));
    const filingForm = sanitizeForm(formData.get("form"));
    const fiscalYear = sanitizeFiscalYear(formData.get("fiscalYear"));
    const period = sanitizeShortText(formData.get("period"), 64);
    const periodEnd = sanitizeShortText(formData.get("periodEnd"), 16);
    const file = formData.get("file");

    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    }
    if (!filingForm) {
      return NextResponse.json({ error: "Form must be 10-K or 10-Q." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
    }

    const fileName = String(file.name ?? "").trim() || `${ticker}-${filingForm}.pdf`;
    const isPdf = file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: "Only PDF documents are supported." }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "The PDF is empty." }, { status: 400 });
    }
    if (file.size > MAX_FILING_PDF_BYTES) {
      return NextResponse.json(
        { error: "PDF is too large. Upload a document up to 35MB." },
        { status: 413 }
      );
    }

    const quota = await checkNeuroQuota(authUser.userId, "filing_upload");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Monthly document upload quota exceeded.", quota },
        { status: 429 }
      );
    }

    const storageQuota = await checkNeuroStorageQuota(authUser.userId, file.size);
    if (!storageQuota.allowed) {
      return NextResponse.json(
        { error: "Document storage quota exceeded.", quota: storageQuota },
        { status: 429 }
      );
    }

    const vectorStore =
      (await findReusableTickerVectorStore(authUser.userId, ticker)) ??
      (await client.vectorStores.create({
        name: `Neuro Analysis ${ticker} Filing Library`,
        expires_after: {
          anchor: "last_active_at",
          days: FILING_VECTOR_STORE_EXPIRY_DAYS,
        },
        metadata: {
          product: "neuro_analysis",
          source: "user_uploaded_filing_library",
          user_id: authUser.userId,
          ticker,
        },
      }));

    const buffer = Buffer.from(await file.arrayBuffer());
    const openaiFile = await client.files.create({
      file: await toFile(buffer, fileName, { type: "application/pdf" }),
      purpose: "assistants",
    });

    const batch = await client.vectorStores.fileBatches.createAndPoll(
      vectorStore.id,
      {
        files: [
          {
            file_id: openaiFile.id,
            attributes: {
              product: "neuro_analysis",
              source: "user_uploaded_filing",
              user_id: authUser.userId,
              ticker,
              form: filingForm,
              fiscal_year: fiscalYear ?? "",
              period: period ?? "",
              period_end: periodEnd ?? "",
              filename: fileName.slice(0, 512),
            },
          },
        ],
      },
      { pollIntervalMs: 1500 }
    );

    if (batch.file_counts.failed > 0 || batch.status === "failed") {
      return NextResponse.json(
        { error: "The system could not index this PDF. Try a cleaner company document PDF." },
        { status: 422 }
      );
    }

    const readyStore = await client.vectorStores.retrieve(vectorStore.id);
    const expiresAt = readyStore.expires_at
      ? new Date(readyStore.expires_at * 1000).toISOString()
      : null;

    const { data: dbRow, error: dbError } = await supabaseAdmin
      .from("neuro_analysis_filings")
      .insert({
        user_id: authUser.userId,
        ticker,
        form: filingForm,
        fiscal_year: fiscalYear,
        period,
        period_end: periodEnd || null,
        file_name: fileName,
        openai_file_id: openaiFile.id,
        vector_store_id: readyStore.id,
        bytes: openaiFile.bytes,
        usage_bytes: readyStore.usage_bytes,
        status: readyStore.status,
        expires_at: expiresAt,
        metadata: {
          upload_source: "neuro_analysis_ui",
          original_type: file.type || "application/pdf",
        },
      })
      .select("id, created_at")
      .maybeSingle();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    await recordNeuroUsage({
      userId: authUser.userId,
      eventType: "filing_upload",
      bytes: openaiFile.bytes ?? file.size,
      metadata: {
        ticker,
        form: filingForm,
        fiscalYear,
        fileName,
        vectorStoreId: readyStore.id,
      },
    });

    return NextResponse.json({
      id: dbRow?.id ?? null,
      ticker,
      form: filingForm,
      fiscalYear,
      period,
      periodEnd: periodEnd || null,
      fileName,
      fileId: openaiFile.id,
      vectorStoreId: readyStore.id,
      bytes: openaiFile.bytes,
      usageBytes: readyStore.usage_bytes,
      status: readyStore.status,
      expiresAt,
      createdAt: dbRow?.created_at ?? null,
      expiresAfterDays: FILING_VECTOR_STORE_EXPIRY_DAYS,
      fileCounts: readyStore.file_counts,
    });
  } catch (error: any) {
    console.error("[neuro-analysis/upload-filing] error:", error);
    return NextResponse.json(
      { error: error?.message || "Document upload failed." },
      { status: 500 }
    );
  }
}
