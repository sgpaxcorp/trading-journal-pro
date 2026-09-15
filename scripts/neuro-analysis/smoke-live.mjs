import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const baseUrl = String(process.env.NEURO_SMOKE_BASE_URL || "http://127.0.0.1:3030").replace(/\/$/, "");
const email = String(process.env.NEURO_SMOKE_EMAIL || process.env.APP_REVIEW_DEMO_EMAIL || "appreview@neurotrader-journal.com")
  .trim()
  .toLowerCase();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runId = `neuro-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const caseTitle = `Neuro live smoke ${runId}`;
const outputPath = resolve("/tmp", `${runId}.json`);

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase URL, anon key, and service role key are required.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const result = {
  runId,
  baseUrl,
  email,
  startedAt: new Date().toISOString(),
  steps: [],
  checks: {},
  warnings: [],
  failures: [],
  cleanup: {},
};

let authorization = "";
let userId = "";
const importedFilings = [];
let caseId = null;

function compactBody(body) {
  if (body == null || typeof body !== "object") return body;
  if (Array.isArray(body)) return { count: body.length };
  return {
    error: body.error,
    ticker: body.ticker,
    tickers: body.tickers,
    caseId: body.caseId,
    reportId: body.reportId,
    requiresFilings: body.requiresFilings,
    alreadyImported: body.alreadyImported,
  };
}

async function timed(name, task, { critical = true } = {}) {
  const started = performance.now();
  try {
    const value = await task();
    result.steps.push({ name, ok: true, durationMs: Math.round(performance.now() - started) });
    return value;
  } catch (error) {
    const failure = {
      name,
      message: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - started),
      critical,
    };
    result.steps.push({ name, ok: false, durationMs: failure.durationMs });
    result.failures.push(failure);
    return null;
  }
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 240_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${pathname} returned ${response.status}: ${body?.error ?? JSON.stringify(compactBody(body))}`
    );
  }
  return { body, status: response.status };
}

function assert(condition, message, { warning = false } = {}) {
  if (condition) return;
  if (warning) result.warnings.push(message);
  else result.failures.push({ name: "assertion", message, critical: true });
}

function normalizeWords(value) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9$%.]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

function jaccardSimilarity(left, right) {
  const a = normalizeWords(left);
  const b = normalizeWords(right);
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function leakedPrivateMethodology(value) {
  return /\b(?:yahoo(?:\s+finance)?|warren\s+buffett?|buffett|cfa(?:\s+level\s+i)?)\b/i.test(String(value ?? ""));
}

try {
  await timed("health", async () => {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null);
    if (![200, 503].includes(response.status) || !body?.checks?.database) {
      throw new Error(`Health returned ${response.status} without a ready database.`);
    }
    result.checks.health = {
      status: body.status,
      configuration: body?.checks?.configuration,
      database: body?.checks?.database,
    };
    if (body.status !== "ready") {
      result.warnings.push("Local health is degraded because the complete production environment is not loaded.");
    }
  });

  await timed("unauthorized owner gate", async () => {
    const response = await fetch(`${baseUrl}/api/smart-tools/access`, { signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null);
    if (response.status !== 200 || body?.allowed !== false) {
      throw new Error(`Expected a closed access response without a session, received ${response.status}.`);
    }
    result.checks.unauthorizedStatus = response.status;
    result.checks.unauthorizedAllowed = body.allowed;
  });

  await timed("demo authentication", async () => {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error(linkError?.message ?? "Could not create the smoke-test session.");
    }
    const { data: authData, error: authError } = await client.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (authError || !authData.session?.access_token || !authData.user?.id) {
      throw new Error(authError?.message ?? "Could not verify the smoke-test session.");
    }
    authorization = `Bearer ${authData.session.access_token}`;
    userId = authData.user.id;
  });

  const access = await timed("authorized owner gate", async () => (await request("/api/smart-tools/access")).body);
  assert(access?.allowed === true, "The configured smoke-test owner was denied access.");
  result.checks.ownerAccess = access?.allowed === true;

  const marketEnvelope = await timed("multi-instrument market data", async () =>
    (await request("/api/neuro-analysis/market-data?tickers=AAPL,MSFT,SPY")).body
  );
  const marketItems = marketEnvelope?.items ?? {};
  const marketSummary = Object.fromEntries(
    ["AAPL", "MSFT", "SPY"].map((ticker) => {
      const item = marketItems[ticker] ?? {};
      return [
        ticker,
        {
          name: item?.company?.name ?? null,
          quoteType: item?.company?.quoteType ?? null,
          price: item?.market?.regularMarketPrice ?? item?.market?.previousClose ?? null,
          annualFundamentals: Array.isArray(item?.annualFundamentals) ? item.annualFundamentals.length : 0,
          historyPoints: Array.isArray(item?.priceHistory) ? item.priceHistory.length : 0,
          degraded: Boolean(item?.dataQuality?.degraded),
          messages: item?.dataQuality?.messages ?? [],
        },
      ];
    })
  );
  result.checks.market = marketSummary;
  for (const ticker of ["AAPL", "MSFT", "SPY"]) {
    assert(Number(marketSummary[ticker]?.price) > 0, `${ticker} did not return a usable price.`);
  }
  assert(
    marketSummary.AAPL?.annualFundamentals >= 3,
    "AAPL returned fewer than three annual fundamental periods; trend analysis is weak.",
    { warning: true }
  );
  assert(
    ["ETF", "FUND"].includes(marketSummary.SPY?.quoteType) || marketItems.SPY?.instrumentType === "etf",
    "SPY was not classified as a fund-like instrument.",
    { warning: true }
  );

  const documents = await timed("official document discovery", async () =>
    (await request("/api/neuro-analysis/company-documents?ticker=AAPL")).body
  );
  const documentRows = Array.isArray(documents?.documents) ? documents.documents : [];
  result.checks.documents = {
    company: documents?.company?.name ?? null,
    count: documentRows.length,
    forms: [...new Set(documentRows.map((row) => row.form))],
  };
  assert(documentRows.some((row) => row.form === "10-K"), "Document discovery did not return a 10-K.");
  assert(documentRows.some((row) => row.form === "10-Q"), "Document discovery did not return a 10-Q.");

  const selectedDocuments = ["10-K", "10-Q"]
    .map((form) => documentRows.find((row) => row.form === form))
    .filter(Boolean);
  for (const selectedDocument of selectedDocuments) {
    const imported = await timed(`official ${selectedDocument.form} download and indexing`, async () =>
      (
        await request("/api/neuro-analysis/import-filing", {
          method: "POST",
          body: JSON.stringify({
            ticker: selectedDocument.ticker,
            form: selectedDocument.form,
            accessionNumber: selectedDocument.accessionNumber,
          }),
        })
      ).body
    );
    if (imported) importedFilings.push(imported);
  }
  result.checks.imports = importedFilings.map((filing) => ({
    form: filing.form,
    periodEnd: filing.periodEnd,
    bytes: filing.bytes,
    status: filing.status,
    alreadyImported: filing.alreadyImported,
    vectorStoreReady: Boolean(filing.vectorStoreId),
  }));
  assert(importedFilings.some((filing) => filing.form === "10-K" && filing.vectorStoreId), "The 10-K was not indexed.");
  assert(importedFilings.some((filing) => filing.form === "10-Q" && filing.vectorStoreId), "The 10-Q was not indexed.");

  const focusPrice = Number(marketSummary.AAPL?.price) || 200;
  const analysis = await timed("grounded company analysis", async () =>
    (
      await request("/api/neuro-analysis/analyze", {
        method: "POST",
        body: JSON.stringify({
          language: "es",
          focusTicker: "AAPL",
          holdings: [
            {
              ticker: "AAPL",
              shares: 12,
              averageCost: 185.5,
              currentPrice: focusPrice,
              openedAt: "2025-01-15",
            },
          ],
          caseTitle,
          question:
            "Evalua objetivamente la calidad del negocio, balance, rentabilidad, tendencias, riesgos, valoracion, flujo de caja futuro y la conveniencia de mantener esta posicion. Distingue hechos, calculos, inferencias y datos faltantes. No uses nombres de proveedores ni metodologias internas.",
          assumptions: {
            horizonYears: 10,
            discountRatePct: 10,
            marginOfSafetyPct: 25,
            baseGrowthPct: null,
          },
          marketData: {
            source: "Market Data",
            focusTicker: "AAPL",
            items: marketItems,
          },
          uploadedFilings: importedFilings.map((filing) => ({
            ticker: filing.ticker,
            form: filing.form,
            fileName: filing.fileName,
            fiscalYear: filing.fiscalYear,
            period: filing.period,
            periodEnd: filing.periodEnd,
            fileId: filing.fileId,
            vectorStoreId: filing.vectorStoreId,
            bytes: filing.bytes,
            usageBytes: filing.usageBytes,
          })),
        }),
      })
    ).body
  );
  caseId = analysis?.caseId ?? null;
  result.checks.analysis = analysis
    ? {
        caseId: analysis.caseId,
        reportId: analysis.reportId,
        reportCharacters: String(analysis.report ?? "").length,
        reportPreview: String(analysis.report ?? "").slice(0, 700),
        positions: analysis?.engine?.positions?.length ?? 0,
        riskFlags: analysis?.engine?.riskFlags?.length ?? 0,
        vectorStoresUsed: analysis?.vectorStoresUsed?.length ?? 0,
        webSources: analysis?.webSources?.length ?? 0,
        missingFilings: analysis?.missingFilings ?? null,
      }
    : null;
  assert(String(analysis?.report ?? "").length >= 700, "The generated analysis is unexpectedly short.");
  assert(!/^\s*\{\s*["']reportMarkdown["']/i.test(String(analysis?.report ?? "")), "The UI report contains the raw internal JSON envelope.");
  assert(!leakedPrivateMethodology(analysis?.report), "The report exposed a hidden provider or private methodology name.");
  assert(Boolean(analysis?.engine?.positions?.[0]?.derived), "The deterministic engine did not produce position metrics.");
  assert(
    (analysis?.missingFilings?.["10-K"]?.length ?? 0) === 0 && (analysis?.missingFilings?.["10-Q"]?.length ?? 0) === 0,
    "The analysis still reports missing filings after both documents were indexed."
  );

  if (caseId) {
    const saved = await timed("case and report persistence", async () =>
      (await request(`/api/neuro-analysis/cases/${encodeURIComponent(caseId)}`)).body
    );
    result.checks.persistence = {
      caseLoaded: saved?.case?.id === caseId,
      reports: Array.isArray(saved?.reports) ? saved.reports.length : 0,
    };
    assert(saved?.case?.id === caseId, "The analysis case could not be reloaded.");
    assert(Array.isArray(saved?.reports) && saved.reports.length > 0, "The saved case has no report history.");

    const question =
      "Con la evidencia disponible, cuales son los tres riesgos mas importantes, que dato falta y que condicion concreta invalidaria la tesis?";
    const clientContext = {
      focusTicker: "AAPL",
      caseTitle,
      holdings: [{ ticker: "AAPL", shares: 12, averageCost: 185.5, currentPrice: focusPrice }],
      marketData: { source: "Market Data", focusTicker: "AAPL", items: marketItems },
      engineSnapshot: analysis?.engine ?? null,
      currentReport: analysis?.report ?? "",
    };
    const firstAnswer = await timed("grounded follow-up question", async () =>
      (
        await request("/api/neuro-analysis/agent", {
          method: "POST",
          body: JSON.stringify({ caseId, reportId: analysis?.reportId, question, clientContext }),
        })
      ).body
    );
    const secondAnswer = await timed("repeatability follow-up question", async () =>
      (
        await request("/api/neuro-analysis/agent", {
          method: "POST",
          body: JSON.stringify({ caseId, reportId: analysis?.reportId, question, clientContext }),
        })
      ).body
    );
    const similarity = jaccardSimilarity(firstAnswer?.answer, secondAnswer?.answer);
    result.checks.followUp = {
      firstCharacters: String(firstAnswer?.answer ?? "").length,
      secondCharacters: String(secondAnswer?.answer ?? "").length,
      lexicalSimilarity: Number(similarity.toFixed(3)),
      secondAnswerCached: secondAnswer?.cached === true,
      groundedContext: firstAnswer?.groundedContext ?? null,
      firstPreview: String(firstAnswer?.answer ?? "").slice(0, 500),
    };
    assert(String(firstAnswer?.answer ?? "").length >= 200, "The follow-up answer is unexpectedly short.");
    assert(!leakedPrivateMethodology(firstAnswer?.answer), "The follow-up answer exposed a hidden provider or methodology name.");
    assert(secondAnswer?.cached === true, "An identical follow-up did not reuse the stable prior answer.");
    assert(similarity >= 0.55, `Repeated objective questions were too inconsistent (${similarity.toFixed(3)} similarity).`, {
      warning: true,
    });
  }
} finally {
  if (authorization) {
    result.cleanup.importedFilings = [];
    for (const filing of importedFilings.filter((item) => item?.id && item?.alreadyImported === false)) {
      const cleanup = await timed(
        `cleanup imported ${filing.form}`,
        async () => (await request(`/api/neuro-analysis/filings?id=${encodeURIComponent(filing.id)}`, { method: "DELETE" })).body,
        { critical: false }
      );
      result.cleanup.importedFilings.push({ id: filing.id, form: filing.form, ok: Boolean(cleanup?.ok) });
    }
  }

  if (userId) {
    const { data: rows } = await admin
      .from("neuro_analysis_cases")
      .select("id")
      .eq("user_id", userId)
      .eq("title", caseTitle);
    const ids = [...new Set([caseId, ...(rows ?? []).map((row) => row.id)].filter(Boolean))];
    if (ids.length) {
      const { error } = await admin.from("neuro_analysis_cases").delete().in("id", ids).eq("user_id", userId);
      result.cleanup.cases = error ? { ok: false, error: error.message } : { ok: true, count: ids.length };
      if (error) result.warnings.push(`Case cleanup failed: ${error.message}`);
    }
  }

  result.finishedAt = new Date().toISOString();
  result.ok = result.failures.filter((failure) => failure.critical !== false).length === 0;
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...result, outputPath }, null, 2)}\n`);
}

if (!result.ok) process.exitCode = 1;
