import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  calculateDeterministicFinancialMetrics,
  DETERMINISTIC_METRICS_VERSION,
} from "@/lib/neuroDeterministicMetrics";
import {
  buildFinancialPeriodFacts,
  DEFAULT_XBRL_CONCEPT_MAPPINGS,
  DEFAULT_XBRL_MAPPING_VERSION,
  normalizeSecCompanyFacts,
  selectFinancialFactsAsOf,
  type FilingAvailability,
  type NormalizedFinancialFact,
} from "@/lib/neuroFinancialStatements";
import {
  createSecEdgarClientFromEnv,
  type SecEdgarCache,
  type SecEdgarCacheEntry,
  type SecEdgarResponse,
} from "@/lib/neuroSecEdgarClient";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { detectMaterialFinancialChanges } from "@/lib/neuroMaterialChangeDetection";

const SUPPORTED_SEC_FORM = /^(10-K|10-Q|8-K|20-F|40-F|DEF 14A|3|4|5|SC 13D|SC 13G|13F-HR)(\/A)?$/;

function sha256(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function uuidFromHash(value: string) {
  const hex = /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : sha256(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function cleanTicker(value: unknown) {
  const ticker = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 20);
  if (!ticker) throw new Error("Ticker is required.");
  return ticker;
}

function validDate(value: unknown) {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function validTimestamp(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function publicAt(filingDate: string, acceptedAt: string | null) {
  return acceptedAt ?? `${filingDate}T23:59:59.999Z`;
}

async function ignoreDuplicate<T>(operation: PromiseLike<{ data: T; error: any }>) {
  const result = await operation;
  if (result.error && result.error.code !== "23505") throw new Error(result.error.message);
  return result.data;
}

async function insertChunks(table: string, rows: Record<string, unknown>[], onConflict: string) {
  let persisted = 0;
  for (let index = 0; index < rows.length; index += 400) {
    const chunk = rows.slice(index, index + 400);
    const { data, error } = await supabaseAdmin
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    persisted += Array.isArray(data) ? data.length : 0;
  }
  return persisted;
}

class SupabaseSecEdgarCache implements SecEdgarCache {
  async get(requestKey: string): Promise<SecEdgarCacheEntry | null> {
    const datasetKey = `http-cache:${sha256(requestKey)}`;
    const [responseResult, checkpointResult] = await Promise.all([
      supabaseAdmin
        .from("investment_ingestion_responses")
        .select("payload,content_type,etag,last_modified,fetched_at,content_sha256")
        .eq("source_id", "sec_edgar")
        .eq("request_key", requestKey)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("investment_ingestion_checkpoints")
        .select("etag,last_modified,last_success_at")
        .eq("source_id", "sec_edgar")
        .eq("dataset_key", datasetKey)
        .maybeSingle(),
    ]);
    if (responseResult.error) throw new Error(responseResult.error.message);
    if (checkpointResult.error) throw new Error(checkpointResult.error.message);
    const data = responseResult.data;
    if (!data) return null;
    const body = typeof data.payload === "string" ? data.payload : String((data.payload as any)?.body ?? "");
    if (!body) return null;
    return {
      body,
      contentType: data.content_type ?? null,
      etag: checkpointResult.data?.etag ?? data.etag ?? null,
      lastModified: checkpointResult.data?.last_modified ?? data.last_modified ?? null,
      fetchedAt: checkpointResult.data?.last_success_at ?? data.fetched_at,
      contentSha256: data.content_sha256,
    };
  }

  async set(requestKey: string, entry: SecEdgarCacheEntry) {
    await ignoreDuplicate(
      supabaseAdmin.from("investment_ingestion_responses").insert({
        source_id: "sec_edgar",
        request_key: requestKey,
        request_url: requestKey,
        http_status: 200,
        etag: entry.etag,
        last_modified: entry.lastModified,
        content_type: entry.contentType,
        content_sha256: entry.contentSha256,
        payload: entry.body,
        fetched_at: entry.fetchedAt,
      })
    );
    const { error } = await supabaseAdmin.from("investment_ingestion_checkpoints").upsert({
      source_id: "sec_edgar",
      dataset_key: `http-cache:${sha256(requestKey)}`,
      etag: entry.etag,
      last_modified: entry.lastModified,
      last_success_at: entry.fetchedAt,
      failure_count: 0,
      last_error: null,
    }, { onConflict: "source_id,dataset_key" });
    if (error) throw new Error(error.message);
  }
}

type SubmissionRow = Record<string, any> & { __sourceResponseId?: string | null };

function submissionRows(payload: Record<string, any>, responseId?: string | null): SubmissionRow[] {
  const recent = payload?.filings?.recent ?? payload ?? {};
  const keys = Object.keys(recent).filter((key) => Array.isArray(recent[key]));
  const count = Math.max(0, ...keys.map((key) => recent[key].length));
  return Array.from({ length: count }, (_, index) => ({
    ...Object.fromEntries(keys.map((key) => [key, recent[key][index]])),
    __sourceResponseId: responseId ?? null,
  }));
}

function filingAvailability(rows: SubmissionRow[]): FilingAvailability[] {
  return rows
    .map((row): FilingAvailability | null => {
      const accessionNumber = String(row.accessionNumber ?? "").trim();
      const filingDate = validDate(row.filingDate);
      if (!accessionNumber || !filingDate) return null;
      return {
        accessionNumber,
        filingDate,
        acceptedAt: validTimestamp(row.acceptanceDateTime),
        form: String(row.form ?? "").trim().toUpperCase() || null,
      } satisfies FilingAvailability;
    })
    .filter((row): row is FilingAvailability => Boolean(row));
}

function filingSourceUrl(cik: string, accessionNumber: string, primaryDocument: string | null) {
  const cikPath = cik.replace(/^0+/, "") || "0";
  const accessionPath = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${primaryDocument || ""}`;
}

async function sourceResponseId(response: SecEdgarResponse<unknown>) {
  const { data, error } = await supabaseAdmin
    .from("investment_ingestion_responses")
    .select("id")
    .eq("source_id", "sec_edgar")
    .eq("request_key", response.receipt.requestKey)
    .eq("content_sha256", response.receipt.contentSha256)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function persistCompany(input: { cik: string; ticker: string; legalName: string; submissions: Record<string, any> }) {
  const { data: company, error: companyError } = await supabaseAdmin
    .from("investment_companies")
    .upsert({
      cik: input.cik,
      legal_name: input.legalName,
      status: "active",
      source_id: "sec_edgar",
      source_updated_at: new Date().toISOString(),
      fiscal_year_end: String(input.submissions.fiscalYearEnd ?? "").trim() || null,
      sic_code: String(input.submissions.sic ?? "").trim() || null,
    }, { onConflict: "cik" })
    .select("id")
    .single();
  if (companyError) throw new Error(companyError.message);

  const exchanges = Array.isArray(input.submissions.exchanges) ? input.submissions.exchanges : [];
  const tickers = Array.isArray(input.submissions.tickers) ? input.submissions.tickers : [];
  const tickerIndex = tickers.findIndex((value: unknown) => cleanTicker(value) === input.ticker);
  const exchange = String(exchanges[tickerIndex] ?? exchanges[0] ?? "").trim() || null;
  let { data: security, error: securityError } = await supabaseAdmin
    .from("investment_securities")
    .select("id")
    .eq("company_id", company.id)
    .eq("is_primary", true)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (securityError) throw new Error(securityError.message);
  if (!security) {
    const inserted = await supabaseAdmin
      .from("investment_securities")
      .insert({ company_id: company.id, security_type: "common_stock", security_name: input.legalName, exchange, is_primary: true })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    security = inserted.data;
  }

  const { data: identifier, error: identifierError } = await supabaseAdmin
    .from("investment_security_identifiers")
    .select("id")
    .eq("security_id", security.id)
    .eq("identifier_type", "ticker")
    .eq("identifier_value", input.ticker)
    .is("valid_to", null)
    .limit(1)
    .maybeSingle();
  if (identifierError) throw new Error(identifierError.message);
  if (!identifier) {
    const endDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const { error: closeIdentifierError } = await supabaseAdmin
      .from("investment_security_identifiers")
      .update({ valid_to: endDate })
      .eq("security_id", security.id)
      .eq("identifier_type", "ticker")
      .is("valid_to", null)
      .neq("identifier_value", input.ticker);
    if (closeIdentifierError) throw new Error(closeIdentifierError.message);
    const insertedIdentifier = await supabaseAdmin.from("investment_security_identifiers").insert({
      security_id: security.id,
      identifier_type: "ticker",
      identifier_value: input.ticker,
      exchange,
      source_id: "sec_edgar",
    });
    if (insertedIdentifier.error) throw new Error(insertedIdentifier.error.message);
  }
  return { companyId: company.id as string, securityId: security.id as string, exchange };
}

async function persistMappings() {
  const rows = DEFAULT_XBRL_CONCEPT_MAPPINGS.map((mapping) => ({
    taxonomy: mapping.taxonomy,
    original_concept: mapping.originalConcept,
    canonical_concept: mapping.canonicalConcept,
    priority: mapping.priority,
    sign_multiplier: mapping.signMultiplier ?? 1,
    mapping_version: DEFAULT_XBRL_MAPPING_VERSION,
    rationale: "Configured canonical mapping used by the deterministic normalization engine.",
  }));
  return insertChunks(
    "investment_xbrl_concept_mappings",
    rows,
    "taxonomy,original_concept,canonical_concept,mapping_version"
  );
}

async function persistFilings(input: {
  companyId: string;
  cik: string;
  rows: SubmissionRow[];
}) {
  const rows = input.rows
    .map((row) => {
      const { __sourceResponseId, ...rawSubmission } = row;
      const form = String(row.form ?? "").trim().toUpperCase();
      const accessionNumber = String(row.accessionNumber ?? "").trim();
      const filingDate = validDate(row.filingDate);
      if (!SUPPORTED_SEC_FORM.test(form) || !/^\d{10}-\d{2}-\d{6}$/.test(accessionNumber) || !filingDate) return null;
      const acceptedAt = validTimestamp(row.acceptanceDateTime);
      const primaryDocument = String(row.primaryDocument ?? "").trim() || null;
      const contentSha256 = sha256(rawSubmission);
      return {
        id: uuidFromHash(`${accessionNumber}:${contentSha256}`),
        company_id: input.companyId,
        source_response_id: __sourceResponseId ?? null,
        cik: input.cik,
        accession_number: accessionNumber,
        form,
        filing_date: filingDate,
        accepted_at: acceptedAt,
        public_at: publicAt(filingDate, acceptedAt),
        period_end_date: validDate(row.reportDate),
        primary_document: primaryDocument,
        source_url: filingSourceUrl(input.cik, accessionNumber, primaryDocument),
        is_amendment: form.endsWith("/A"),
        raw_submission: rawSubmission,
        content_sha256: contentSha256,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  await insertChunks("investment_sec_filings", rows, "accession_number,content_sha256");
  return new Map(rows.map((row) => [row.accession_number, row.id]));
}

function databaseFactId(id: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
  const digest = id.match(/[a-f0-9]{64}$/i)?.[0] ?? sha256(id);
  return uuidFromHash(digest);
}

function toDatabaseFact(fact: NormalizedFinancialFact): NormalizedFinancialFact {
  return {
    ...fact,
    id: databaseFactId(fact.id),
    rawFactId: fact.rawFactId ? databaseFactId(fact.rawFactId) : null,
    inputFactIds: fact.inputFactIds.map(databaseFactId),
  };
}

async function persistFacts(input: {
  companyId: string;
  sourceResponseId: string | null;
  filingIds: Map<string, string>;
  normalization: ReturnType<typeof normalizeSecCompanyFacts>;
  normalizedFacts: NormalizedFinancialFact[];
}) {
  const rawRows = input.normalization.rawFacts.map((fact) => ({
    id: databaseFactId(fact.id),
    company_id: input.companyId,
    filing_id: fact.accessionNumber ? input.filingIds.get(fact.accessionNumber) ?? null : null,
    source_response_id: input.sourceResponseId,
    cik: fact.cik,
    accession_number: fact.accessionNumber,
    taxonomy: fact.taxonomy,
    original_concept: fact.originalConcept,
    value_numeric: fact.value,
    units: fact.units,
    period_start_date: fact.periodStartDate,
    period_end_date: fact.periodEndDate,
    fiscal_year: fact.fiscalYear,
    fiscal_period: fact.fiscalPeriod,
    reported_form: fact.reportedForm,
    frame: fact.frame,
    filing_date: fact.filingDate,
    accepted_at: fact.acceptedAt,
    public_at: fact.publicAt,
    raw_fact: fact.rawFact,
    fact_sha256: fact.factSha256,
    ingested_at: fact.ingestedAt,
  }));
  const rawInserted = await insertChunks("investment_sec_raw_facts", rawRows, "company_id,fact_sha256");

  const normalizedRows = input.normalizedFacts.map((fact) => ({
    id: fact.id,
    company_id: input.companyId,
    raw_fact_id: fact.rawFactId,
    canonical_concept: fact.canonicalConcept,
    original_taxonomy: fact.originalTaxonomy,
    original_concept: fact.originalConcept,
    mapping_priority: fact.mappingPriority,
    value_numeric: fact.value,
    units: fact.units,
    period_type: fact.periodType,
    period_start_date: fact.periodStartDate,
    period_end_date: fact.periodEndDate,
    fiscal_year: fact.fiscalYear,
    fiscal_period: fact.fiscalPeriod,
    reported_or_derived: fact.reportedOrDerived,
    formula: fact.formula,
    input_fact_ids: fact.inputFactIds,
    accession_number: fact.accessionNumber,
    filing_date: fact.filingDate,
    accepted_at: fact.acceptedAt,
    public_at: fact.publicAt,
    mapping_version: fact.mappingVersion,
    calculation_version: fact.calculationVersion,
    normalized_at: fact.normalizedAt,
    lineage_sha256: fact.lineageSha256,
    unavailable_reason: fact.unavailableReason,
  }));
  const normalizedInserted = await insertChunks("investment_normalized_facts", normalizedRows, "lineage_sha256");
  return { rawInserted, normalizedInserted };
}

async function persistMetrics(input: {
  companyId: string;
  facts: NormalizedFinancialFact[];
  asOfTimestamp: string;
}) {
  const results = [];
  for (const periodType of ["annual", "ttm"] as const) {
    try {
      const calculated = calculateDeterministicFinancialMetrics({ facts: input.facts, periodType, calculatedAt: input.asOfTimestamp });
      const runHash = sha256({
        companyId: input.companyId,
        periodType,
        periodEndDate: calculated.periodEndDate,
        sourceFactIds: calculated.sourceFactIds.sort(),
        calculationVersion: calculated.calculationVersion,
      });
      const runId = uuidFromHash(runHash);
      const metrics = Object.values(calculated.metrics);
      const { error: runError } = await supabaseAdmin
        .from("investment_calculation_runs")
        .upsert({
          id: runId,
          company_id: input.companyId,
          calculation_version: calculated.calculationVersion,
          as_of_timestamp: input.asOfTimestamp,
          input_cutoff_timestamp: input.asOfTimestamp,
          status: metrics.every((entry) => entry.status === "calculated") ? "complete" : "partial",
          source_fact_ids: calculated.sourceFactIds,
          input_manifest: { periodType, periodEndDate: calculated.periodEndDate, methodology: calculated.methodology },
        }, { onConflict: "id", ignoreDuplicates: true });
      if (runError) throw new Error(runError.message);
      const metricRows = metrics.map((entry) => ({
        id: uuidFromHash(entry.traceSha256),
        calculation_run_id: runId,
        company_id: input.companyId,
        metric_key: entry.metricKey,
        value_numeric: entry.value,
        units: entry.units,
        period_end_date: entry.periodEndDate,
        formula: entry.formula,
        formula_version: entry.formulaVersion,
        inputs: entry.inputs,
        calculated_at: entry.calculationTimestamp,
        unavailable_reason: entry.unavailableReason,
        trace_sha256: entry.traceSha256,
      }));
      await insertChunks("investment_financial_metrics", metricRows, "calculation_run_id,metric_key");
      results.push({ periodType, runId, status: "stored", periodEndDate: calculated.periodEndDate });
    } catch (error) {
      results.push({ periodType, runId: null, status: "unavailable", error: error instanceof Error ? error.message : "Metric calculation failed." });
    }
  }
  return results;
}

type SubmissionHistoryBatch = {
  payloads: Array<{ payload: Record<string, any>; responseId: string | null }>;
  totalFiles: number;
  processedFiles: number;
  remainingFiles: number;
  checkpointVersion: string;
};

function historyBatchSize() {
  const configured = Number(process.env.SEC_SUBMISSION_HISTORY_FILES_PER_JOB ?? 5);
  return Number.isFinite(configured) ? Math.max(1, Math.min(25, Math.floor(configured))) : 5;
}

async function loadSubmissionHistoryBatch(input: {
  cik: string;
  files: string[];
  client: ReturnType<typeof createSecEdgarClientFromEnv>;
}): Promise<SubmissionHistoryBatch> {
  const datasetKey = `submissions-history:${input.cik}`;
  const { data: checkpoint, error: checkpointError } = await supabaseAdmin
    .from("investment_ingestion_checkpoints")
    .select("cursor_value,failure_count")
    .eq("source_id", "sec_edgar")
    .eq("dataset_key", datasetKey)
    .maybeSingle();
  if (checkpointError) throw new Error(checkpointError.message);

  let completed = new Set<string>();
  try {
    const parsed = JSON.parse(String(checkpoint?.cursor_value ?? "{}"));
    if (Array.isArray(parsed?.completed)) completed = new Set(parsed.completed.map(String));
  } catch {
    completed = new Set<string>();
  }
  const knownFiles = new Set(input.files);
  completed = new Set([...completed].filter((file) => knownFiles.has(file)));
  const pending = input.files.filter((file) => !completed.has(file));
  const batch = pending.slice(0, historyBatchSize());
  const payloads: SubmissionHistoryBatch["payloads"] = [];

  try {
    for (const fileName of batch) {
      const response = await input.client.getSubmissionHistoryFile(fileName);
      payloads.push({
        payload: response.data as Record<string, any>,
        responseId: await sourceResponseId(response),
      });
      completed.add(fileName);
      const { error } = await supabaseAdmin.from("investment_ingestion_checkpoints").upsert({
        source_id: "sec_edgar",
        dataset_key: datasetKey,
        cursor_value: JSON.stringify({ completed: [...completed].sort() }),
        last_success_at: new Date().toISOString(),
        failure_count: 0,
        last_error: null,
      }, { onConflict: "source_id,dataset_key" });
      if (error) throw new Error(error.message);
    }
  } catch (error) {
    await supabaseAdmin.from("investment_ingestion_checkpoints").upsert({
      source_id: "sec_edgar",
      dataset_key: datasetKey,
      cursor_value: JSON.stringify({ completed: [...completed].sort() }),
      failure_count: Math.max(1, Number((checkpoint as any)?.failure_count ?? 0) + 1),
      last_error: error instanceof Error ? error.message.slice(0, 1_000) : "Submission history refresh failed.",
      next_run_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }, { onConflict: "source_id,dataset_key" });
    throw error;
  }

  return {
    payloads,
    totalFiles: input.files.length,
    processedFiles: batch.length,
    remainingFiles: Math.max(0, input.files.length - completed.size),
    checkpointVersion: sha256([...completed].sort()),
  };
}

async function refreshInvestmentCompanyDataUnlocked(input: {
  ticker: string;
  userId?: string | null;
  asOfTimestamp?: string;
}) {
  const ticker = cleanTicker(input.ticker);
  const asOfTimestamp = validTimestamp(input.asOfTimestamp) ?? new Date().toISOString();
  const processedAt = new Date().toISOString();
  const client = createSecEdgarClientFromEnv({ cache: new SupabaseSecEdgarCache() });
  const identity = await client.resolveCompany(ticker);
  if (!identity) throw new Error(`SEC EDGAR does not recognize ticker ${ticker}.`);
  const [submissionsResponse, factsResponse] = await Promise.all([
    client.getSubmissions(identity.cik),
    client.getCompanyFacts(identity.cik),
  ]);
  const submissions = submissionsResponse.data as Record<string, any>;
  const companyFacts = factsResponse.data as Record<string, any>;
  const { companyId, securityId } = await persistCompany({ ...identity, submissions });
  await persistMappings();
  const submissionsSourceId = await sourceResponseId(submissionsResponse);
  const factsSourceId = await sourceResponseId(factsResponse);
  const submissionHistoryFiles = Array.isArray(submissions?.filings?.files)
    ? submissions.filings.files.map((row: any) => String(row?.name ?? "").trim()).filter(Boolean).slice(0, 100)
    : [];
  const historyBatch = await loadSubmissionHistoryBatch({ cik: identity.cik, files: submissionHistoryFiles, client });
  const historyPayloads = historyBatch.payloads;
  const allSubmissionRows = [
    ...submissionRows(submissions, submissionsSourceId),
    ...historyPayloads.flatMap((item) => submissionRows(item.payload, item.responseId)),
  ];
  const filingIds = await persistFilings({ companyId, cik: identity.cik, rows: allSubmissionRows });
  const normalization = normalizeSecCompanyFacts({
    payload: companyFacts,
    filingAvailability: filingAvailability(allSubmissionRows),
    ingestedAt: factsResponse.receipt.fetchedAt,
    normalizedAt: processedAt,
  });
  const databaseReported = normalization.normalizedFacts.map(toDatabaseFact);
  const periodFacts = buildFinancialPeriodFacts(databaseReported, processedAt);
  const allFacts = periodFacts.all.map((fact) => fact.id.includes("-") && /^[0-9a-f]{8}-/i.test(fact.id) ? fact : toDatabaseFact(fact));
  const persistence = await persistFacts({ companyId, sourceResponseId: factsSourceId, filingIds, normalization, normalizedFacts: allFacts });
  const pointInTimeFacts = selectFinancialFactsAsOf(allFacts, asOfTimestamp, "latest");
  const metricRuns = await persistMetrics({ companyId, facts: pointInTimeFacts, asOfTimestamp });
  const materialChanges = detectMaterialFinancialChanges({ facts: pointInTimeFacts, detectedAt: processedAt });
  const materialRows = materialChanges.events.map((change) => ({
    id: uuidFromHash(change.eventSha256),
    company_id: companyId,
    event_type: change.eventType,
    materiality: change.materiality,
    detected_value: change.detectedValue,
    threshold_snapshot: change.thresholdSnapshot,
    source_fact_ids: change.sourceFactIds,
    detected_at: change.detectedAt,
    available_at: change.availableAt,
    event_sha256: change.eventSha256,
  }));
  if (materialRows.length) {
    await insertChunks("investment_material_change_events", materialRows, "event_sha256");
  }

  const { error: auditError } = await supabaseAdmin.rpc("append_investment_audit_event", {
    p_user_id: input.userId ?? null,
    p_actor_user_id: input.userId ?? null,
    p_action: "investment_data_company_refresh",
    p_entity_type: "investment_company",
    p_entity_id: companyId,
    p_previous_state: null,
    p_new_state: {
      ticker,
      cik: identity.cik,
      filingCount: filingIds.size,
      rawFactCount: normalization.rawFacts.length,
      normalizedFactCount: allFacts.length,
      asOfTimestamp,
    },
    p_source_data_version: factsResponse.receipt.contentSha256,
    p_calculation_version: DETERMINISTIC_METRICS_VERSION,
    p_ai_model_version: null,
    p_approval_state: null,
  });
  if (auditError) throw new Error(auditError.message);

  return {
    company: { id: companyId, securityId, ticker, cik: identity.cik, legalName: identity.legalName },
    pointInTime: { asOfTimestamp, enforced: true },
    sourceReceipts: {
      submissions: submissionsResponse.receipt,
      companyFacts: factsResponse.receipt,
    },
    ingestion: {
      filingsDiscovered: filingIds.size,
      submissionHistoryFiles: submissionHistoryFiles.length,
      submissionHistoryFilesProcessed: historyBatch.processedFiles,
      submissionHistoryFilesRemaining: historyBatch.remainingFiles,
      submissionHistoryCheckpoint: historyBatch.checkpointVersion,
      rawFactsParsed: normalization.rawFacts.length,
      normalizedFactsBuilt: allFacts.length,
      rawFactsInserted: persistence.rawInserted,
      normalizedFactsInserted: persistence.normalizedInserted,
      unmappedConcepts: normalization.unmappedConcepts.length,
      rejectedFacts: normalization.rejectedFacts.length,
    },
    periods: {
      derivedQuarters: periodFacts.derivedQuarters.length,
      trailingTwelveMonths: periodFacts.trailingTwelveMonths.length,
    },
    metricRuns,
    materialChanges: {
      detected: materialChanges.events.length,
      thresholds: materialChanges.thresholds,
    },
    aiUsed: false,
  };
}

export async function refreshInvestmentCompanyData(input: {
  ticker: string;
  userId?: string | null;
  asOfTimestamp?: string;
}) {
  const ticker = cleanTicker(input.ticker);
  const leaseOwner = randomUUID();
  const datasetKey = `company-refresh:${ticker}`;
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_investment_ingestion_lease", {
    p_source_id: "sec_edgar",
    p_dataset_key: datasetKey,
    p_lease_owner: leaseOwner,
    p_lease_seconds: 360,
  });
  if (claimError) throw new Error(claimError.message);
  if (!claimed) throw new Error(`Investment data refresh for ${ticker} is already in progress.`);

  try {
    return await refreshInvestmentCompanyDataUnlocked({ ...input, ticker });
  } finally {
    const { error } = await supabaseAdmin.rpc("release_investment_ingestion_lease", {
      p_source_id: "sec_edgar",
      p_dataset_key: datasetKey,
      p_lease_owner: leaseOwner,
    });
    if (error) console.error("[investment-data] failed to release ingestion lease:", error.message);
  }
}
