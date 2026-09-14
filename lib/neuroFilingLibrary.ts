import "server-only";

import { Buffer } from "node:buffer";

import OpenAI, { toFile } from "openai";

import { recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const MAX_NEURO_FILING_BYTES = 35 * 1024 * 1024;
export const NEURO_FILING_EXPIRY_DAYS = 90;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type IndexNeuroFilingInput = {
  userId: string;
  ticker: string;
  form: "10-K" | "10-Q";
  fiscalYear: number | null;
  period: string | null;
  periodEnd: string | null;
  fileName: string;
  content: Buffer;
  contentType: string;
  source: "user_uploaded_filing" | "official_filing_import";
  metadata?: Record<string, unknown>;
};

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

export async function indexNeuroFiling(input: IndexNeuroFilingInput) {
  const vectorStore =
    (await findReusableTickerVectorStore(input.userId, input.ticker)) ??
    (await client.vectorStores.create({
      name: `Neuro Analysis ${input.ticker} Filing Library`,
      expires_after: { anchor: "last_active_at", days: NEURO_FILING_EXPIRY_DAYS },
      metadata: {
        product: "neuro_analysis",
        source: "neuro_analysis_filing_library",
        user_id: input.userId,
        ticker: input.ticker,
      },
    }));

  const openaiFile = await client.files.create({
    file: await toFile(input.content, input.fileName, { type: input.contentType }),
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
            source: input.source,
            user_id: input.userId,
            ticker: input.ticker,
            form: input.form,
            fiscal_year: input.fiscalYear ?? "",
            period: input.period ?? "",
            period_end: input.periodEnd ?? "",
            filename: input.fileName.slice(0, 512),
          },
        },
      ],
    },
    { pollIntervalMs: 1500 }
  );

  if (batch.file_counts.failed > 0 || batch.status === "failed") {
    await client.files.delete(openaiFile.id).catch(() => null);
    throw new Error("The system could not index this company document.");
  }

  const readyStore = await client.vectorStores.retrieve(vectorStore.id);
  const expiresAt = readyStore.expires_at
    ? new Date(readyStore.expires_at * 1000).toISOString()
    : null;
  const { data: dbRow, error: dbError } = await supabaseAdmin
    .from("neuro_analysis_filings")
    .insert({
      user_id: input.userId,
      ticker: input.ticker,
      form: input.form,
      fiscal_year: input.fiscalYear,
      period: input.period,
      period_end: input.periodEnd,
      file_name: input.fileName,
      openai_file_id: openaiFile.id,
      vector_store_id: readyStore.id,
      bytes: openaiFile.bytes,
      usage_bytes: readyStore.usage_bytes,
      status: readyStore.status,
      expires_at: expiresAt,
      metadata: input.metadata ?? {},
    })
    .select("id, created_at")
    .maybeSingle();

  if (dbError) {
    await client.files.delete(openaiFile.id).catch(() => null);
    throw new Error(dbError.message);
  }

  await recordNeuroUsage({
    userId: input.userId,
    eventType: "filing_upload",
    bytes: openaiFile.bytes ?? input.content.length,
    metadata: {
      ticker: input.ticker,
      form: input.form,
      fiscalYear: input.fiscalYear,
      fileName: input.fileName,
      vectorStoreId: readyStore.id,
      source: input.source,
    },
  });

  return {
    id: dbRow?.id ?? null,
    ticker: input.ticker,
    form: input.form,
    fiscalYear: input.fiscalYear,
    period: input.period,
    periodEnd: input.periodEnd,
    fileName: input.fileName,
    fileId: openaiFile.id,
    vectorStoreId: readyStore.id,
    bytes: openaiFile.bytes,
    usageBytes: readyStore.usage_bytes,
    status: readyStore.status,
    expiresAt,
    createdAt: dbRow?.created_at ?? null,
    expiresAfterDays: NEURO_FILING_EXPIRY_DAYS,
    fileCounts: readyStore.file_counts,
  };
}
