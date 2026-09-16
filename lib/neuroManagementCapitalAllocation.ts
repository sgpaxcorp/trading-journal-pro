import { financialNumberOrNull } from "@/lib/neuroFinancialDataIntegrity";

export const MANAGEMENT_ACTION_CATEGORIES = [
  { key: "historicalAcquisitions", label: "Historical acquisitions" },
  { key: "divestitures", label: "Divestitures" },
  { key: "shareRepurchases", label: "Share repurchases" },
  { key: "shareIssuance", label: "Share issuance" },
  { key: "dividends", label: "Dividends" },
  { key: "debtIssuanceRepayment", label: "Debt issuance and repayment" },
  { key: "capitalExpenditures", label: "Capital expenditures" },
  { key: "researchDevelopment", label: "R&D investment" },
  { key: "executiveCompensation", label: "Executive compensation" },
  { key: "insiderOwnership", label: "Insider ownership" },
  { key: "relatedPartyTransactions", label: "Related-party transactions" },
  { key: "accountingPolicyChanges", label: "Changes in accounting policies" },
  { key: "guidanceVsResults", label: "Guidance versus subsequent results" },
] as const;

export type ManagementActionCategoryKey = (typeof MANAGEMENT_ACTION_CATEGORIES)[number]["key"];
export type ManagementAnalysisStatus = "complete" | "provisional" | "insufficient_information" | "not_applicable";
export type ManagementEvidenceStatus = "identified" | "not_identified";

export type ManagementEvidence = {
  status: ManagementEvidenceStatus;
  statement: string;
  sourceLabel: string;
  sourceDate: string | null;
  sourceType: "company_filing" | "public_source" | "financial_statement" | "not_available";
  sourceUrl: string | null;
};

export type DocumentedManagementAction = {
  actionDate: string | null;
  decision: string;
  amount: number | null;
  currency: string | null;
  financialConsequence: string;
  source: ManagementEvidence;
};

export type ManagementActionCategory = {
  key: ManagementActionCategoryKey;
  label: string;
  conclusion: string;
  documentedActions: DocumentedManagementAction[];
  inconsistencies: ManagementEvidence[];
  unresolvedQuestions: string[];
};

export type GuidanceOutcomeComparison = {
  metric: string;
  managementStatement: string;
  statementDate: string | null;
  expectedOutcome: string;
  subsequentDocumentedOutcome: string;
  outcomeDate: string | null;
  result: "met" | "missed" | "mixed" | "not_testable";
  variance: string;
  statementSource: ManagementEvidence;
  outcomeSource: ManagementEvidence;
  unresolvedQuestion: string;
};

export const CAPITAL_ALLOCATION_USE_CATEGORIES = [
  "acquisitions",
  "capital_expenditures",
  "research_and_development",
  "share_repurchases",
  "dividends",
  "debt_repayment",
  "other",
] as const;

export type CapitalAllocationUseCategory = (typeof CAPITAL_ALLOCATION_USE_CATEGORIES)[number];

export type CapitalAllocationRow = {
  category: CapitalAllocationUseCategory;
  label: string;
  amount: number | null;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  basis: "cash_outflow" | "operating_expense" | "balance_change" | "unknown";
  includedInComparableTotal: boolean;
  exclusionReason: string;
  percentOfComparableUses: number | null;
  source: ManagementEvidence;
};

export type CapitalSourceRow = {
  label: string;
  amount: number | null;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  source: ManagementEvidence;
};

export type IncrementalCapitalAllocation = {
  status: "calculated" | "partial" | "not_calculable";
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  methodology: string;
  sourcesOfCapital: CapitalSourceRow[];
  uses: CapitalAllocationRow[];
  totalComparableUses: number | null;
  limitations: string[];
};

export type ManagementCapitalAllocationAnalysis = {
  schemaVersion: "1.0";
  ticker: string;
  companyName: string;
  status: ManagementAnalysisStatus;
  generatedAt: string;
  generatedBy: "ai_research" | "deterministic_fallback";
  characterInferenceProhibited: true;
  observableAllocationPattern: string;
  categories: ManagementActionCategory[];
  incrementalCapitalAllocation: IncrementalCapitalAllocation;
  guidanceOutcomeComparisons: GuidanceOutcomeComparison[];
  financialConsequences: string[];
  inconsistencies: string[];
  unresolvedQuestions: string[];
};

export const MANAGEMENT_CAPITAL_ALLOCATION_PROMPT = `
Create a separate Management and Capital Allocation Analysis based only on documented actions and outcomes.

Review exactly these required categories:
${MANAGEMENT_ACTION_CATEGORIES.map((category, index) => `${index + 1}. ${category.key} — ${category.label}`).join("\n")}

Behavior rules:
- Analyze observable decisions, amounts, dates, financial consequences, inconsistencies, and unresolved questions.
- Compare management guidance or documented commitments with subsequent documented results when a matched pair exists.
- Do not infer or describe honesty, intelligence, competence, motives, intent, trustworthiness, personality, leadership quality, or character.
- Do not turn management into a score, grade, rank, or personality assessment.
- Never invent an acquisition, divestiture, buyback, issuance, dividend, financing, capital expenditure, R&D amount, compensation term, ownership level, related-party transaction, accounting change, statement, result, source, or date.
- When no verified action or inconsistency was found, say that explicitly and identify the document needed to resolve it.

Incremental-capital calculation rules:
- Prefer a comparable three-to-five-fiscal-year history. If the retrieved evidence supports only a shorter period, use that shorter period and state the limitation.
- Calculate allocation only when documented amounts use the same currency and comparable period and represent non-overlapping uses.
- Use cash spent for acquisitions, repurchases, dividends, capex, and debt repayment when disclosed. State whether acquisition amounts are gross or net of acquired cash.
- Treat R&D as operating reinvestment and normally exclude it from a comparable cash-use total when it is already embedded in operating cash flow or free cash flow. Explain the exclusion.
- A change in a balance-sheet account is not proof of issuance, repayment, spending, or proceeds.
- Never mix stock-based compensation expense, share count, authorization amounts, market value, and actual cash paid.
- If reliable allocation cannot be calculated, return not_calculable and list the exact missing cash-flow, debt-note, equity-note, acquisition-note, or proxy data.
- The application recomputes totals and percentages; provide raw documented amounts and source evidence rather than trusting narrative arithmetic.

Add this field to the root JSON object:
"managementCapitalAllocationAnalysis": {
  "companyName": "string",
  "status": "complete | provisional | insufficient_information | not_applicable",
  "observableAllocationPattern": "objective synthesis of documented actions only",
  "categories": [
    {
      "key": "one exact key from the 13-category list",
      "label": "category label",
      "conclusion": "narrow documented conclusion",
      "documentedActions": [
        {
          "actionDate": "YYYY-MM-DD or null",
          "decision": "observable decision",
          "amount": "number or null",
          "currency": "currency code or null",
          "financialConsequence": "documented or calculated consequence",
          "source": {
            "status": "identified | not_identified",
            "statement": "source support",
            "sourceLabel": "source name",
            "sourceDate": "YYYY-MM-DD or null",
            "sourceType": "company_filing | public_source | financial_statement | not_available",
            "sourceUrl": "https URL or null"
          }
        }
      ],
      "inconsistencies": ["evidence object using the same source shape"],
      "unresolvedQuestions": ["specific question"]
    }
  ],
  "incrementalCapitalAllocation": {
    "status": "calculated | partial | not_calculable",
    "periodStart": "YYYY-MM-DD or null",
    "periodEnd": "YYYY-MM-DD or null",
    "currency": "currency code or null",
    "methodology": "what is included, excluded, and why",
    "sourcesOfCapital": [
      {
        "label": "source of incremental capital",
        "amount": "number or null",
        "currency": "currency code or null",
        "periodStart": "YYYY-MM-DD or null",
        "periodEnd": "YYYY-MM-DD or null",
        "source": "evidence object"
      }
    ],
    "uses": [
      {
        "category": "acquisitions | capital_expenditures | research_and_development | share_repurchases | dividends | debt_repayment | other",
        "label": "documented use",
        "amount": "positive number or null",
        "currency": "currency code or null",
        "periodStart": "YYYY-MM-DD or null",
        "periodEnd": "YYYY-MM-DD or null",
        "basis": "cash_outflow | operating_expense | balance_change | unknown",
        "includedInComparableTotal": "boolean",
        "exclusionReason": "string",
        "source": "evidence object"
      }
    ],
    "limitations": ["string"]
  },
  "guidanceOutcomeComparisons": [
    {
      "metric": "string",
      "managementStatement": "documented statement or guidance",
      "statementDate": "YYYY-MM-DD or null",
      "expectedOutcome": "string",
      "subsequentDocumentedOutcome": "string",
      "outcomeDate": "YYYY-MM-DD or null",
      "result": "met | missed | mixed | not_testable",
      "variance": "documented or calculated variance",
      "statementSource": "evidence object",
      "outcomeSource": "evidence object",
      "unresolvedQuestion": "string"
    }
  ],
  "financialConsequences": ["string"],
  "inconsistencies": ["string"],
  "unresolvedQuestions": ["string"]
}
`.trim();

function cleanText(value: unknown, fallback = "", maxLength = 2_000) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanTicker(value: unknown) {
  return cleanText(value, "", 12)
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function finiteNumber(value: unknown) {
  return financialNumberOrNull(value);
}

function cleanDate(value: unknown) {
  const text = cleanText(value, "", 40);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? text : null;
}

function cleanCurrency(value: unknown) {
  const currency = cleanText(value, "", 12).toUpperCase().replace(/[^A-Z]/g, "");
  return currency || null;
}

function cleanList(value: unknown, fallback: string, maxItems = 12) {
  const rows = Array.isArray(value) ? value : [];
  const cleaned = rows.map((row) => cleanText(row, "", 1_000)).filter(Boolean).slice(0, maxItems);
  return cleaned.length ? cleaned : [fallback];
}

function identity(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function missingEvidence(statement: string): ManagementEvidence {
  return {
    status: "not_identified",
    statement,
    sourceLabel: "Evidence not available",
    sourceDate: null,
    sourceType: "not_available",
    sourceUrl: null,
  };
}

function normalizeSourceType(value: unknown): ManagementEvidence["sourceType"] {
  const type = cleanText(value).toLowerCase();
  if (type === "company_filing") return "company_filing";
  if (type === "public_source") return "public_source";
  if (type === "financial_statement") return "financial_statement";
  return "not_available";
}

function normalizeEvidence(value: any, fallback: string): ManagementEvidence {
  if (!value || typeof value !== "object") return missingEvidence(fallback);
  const statement = cleanText(value.statement ?? value.text, fallback, 1_200);
  const sourceUrl = /^https?:\/\//i.test(String(value.sourceUrl ?? value.url ?? ""))
    ? cleanText(value.sourceUrl ?? value.url, "", 2_000)
    : null;
  return {
    status: value.status === "not_identified" ? "not_identified" : "identified",
    statement,
    sourceLabel: cleanText(value.sourceLabel ?? value.source, "Source not specified", 300),
    sourceDate: cleanDate(value.sourceDate ?? value.date),
    sourceType: normalizeSourceType(value.sourceType),
    sourceUrl,
  };
}

function fallbackCategory(
  key: ManagementActionCategoryKey,
  label: string,
  language: "en" | "es"
): ManagementActionCategory {
  const isEs = language === "es";
  return {
    key,
    label,
    conclusion: isEs
      ? `No hay suficiente evidencia documentada para concluir sobre ${label.toLowerCase()}.`
      : `There is not enough documented evidence to conclude on ${label.toLowerCase()}.`,
    documentedActions: [],
    inconsistencies: [
      missingEvidence(
        isEs
          ? `No se identificó una inconsistencia verificable en ${label.toLowerCase()}; esto no demuestra que no exista.`
          : `No verifiable inconsistency was identified for ${label.toLowerCase()}; this does not establish that none exists.`
      ),
    ],
    unresolvedQuestions: [
      isEs
        ? `¿Qué documento y dato fechado permiten evaluar ${label.toLowerCase()}?`
        : `Which dated document and data point would allow ${label.toLowerCase()} to be evaluated?`,
    ],
  };
}

export function buildManagementCapitalAllocationFallback(input: {
  ticker: string;
  companyName?: string | null;
  instrumentType?: string | null;
  currency?: string | null;
  annualFundamentals?: any[];
  uploadedFilings?: any[];
  language?: "en" | "es";
  generatedAt?: string;
}): ManagementCapitalAllocationAnalysis {
  const language = input.language === "es" ? "es" : "en";
  const isEs = language === "es";
  const instrumentType = cleanText(input.instrumentType).toLowerCase();
  const fundLike = instrumentType === "etf" || instrumentType === "fund";
  const filings = Array.isArray(input.uploadedFilings) ? input.uploadedFilings : [];
  const has10k = filings.some((filing) => filing?.form === "10-K");
  const has10q = filings.some((filing) => filing?.form === "10-Q");
  const fundamentals = (Array.isArray(input.annualFundamentals) ? input.annualFundamentals : [])
    .filter((row) => Number.isFinite(Number(row?.year)))
    .sort((a, b) => Number(a.year) - Number(b.year));
  const categories = MANAGEMENT_ACTION_CATEGORIES.map(({ key, label }) => fallbackCategory(key, label, language));
  const debtCategory = categories.find((category) => category.key === "debtIssuanceRepayment");
  const previous = fundamentals.at(-2);
  const latest = fundamentals.at(-1);
  const previousDebt = finiteNumber(previous?.totalDebt);
  const latestDebt = finiteNumber(latest?.totalDebt);

  if (debtCategory && previousDebt != null && latestDebt != null) {
    const change = latestDebt - previousDebt;
    debtCategory.conclusion = isEs
      ? "El cambio en deuda bruta está documentado, pero el balance por sí solo no identifica emisión, repago, conversión, FX ni reclasificaciones."
      : "The gross-debt change is documented, but balance-sheet movement alone does not identify issuance, repayment, conversion, FX, or reclassification effects.";
    debtCategory.documentedActions = [
      {
        actionDate: `${latest.year}-12-31`,
        decision: `Gross debt changed from ${previousDebt} to ${latestDebt}.`,
        amount: Math.abs(change),
        currency: cleanCurrency(input.currency),
        financialConsequence: `Ending gross debt ${change >= 0 ? "increased" : "decreased"} by ${Math.abs(change)}; the causal financing actions remain unverified.`,
        source: {
          status: "identified",
          statement: `Annual financial statements report total debt of ${previousDebt} in ${previous.year} and ${latestDebt} in ${latest.year}.`,
          sourceLabel: "Annual financial statement data",
          sourceDate: `${latest.year}-12-31`,
          sourceType: "financial_statement",
          sourceUrl: null,
        },
      },
    ];
  }

  return {
    schemaVersion: "1.0",
    ticker: cleanTicker(input.ticker),
    companyName: cleanText(input.companyName, cleanTicker(input.ticker) || "Company", 300),
    status: fundLike ? "not_applicable" : has10k && has10q ? "provisional" : "insufficient_information",
    generatedAt: cleanText(input.generatedAt, new Date().toISOString(), 40),
    generatedBy: "deterministic_fallback",
    characterInferenceProhibited: true,
    observableAllocationPattern: isEs
      ? "La evidencia disponible no permite reconstruir todavía un patrón histórico confiable de asignación de capital."
      : "The available evidence does not yet support a reliable reconstruction of the historical capital-allocation pattern.",
    categories,
    incrementalCapitalAllocation: {
      status: "not_calculable",
      periodStart: null,
      periodEnd: null,
      currency: cleanCurrency(input.currency),
      methodology: isEs
        ? "No se sumaron partidas porque no hay suficientes flujos de efectivo no solapados, comparables y documentados."
        : "No amounts were aggregated because sufficient documented, comparable, non-overlapping cash flows are not available.",
      sourcesOfCapital: [],
      uses: [],
      totalComparableUses: null,
      limitations: [
        isEs
          ? "Se necesitan estados de flujo de efectivo, notas de deuda/equity/adquisiciones y proxy statements para el mismo periodo."
          : "Cash-flow statements, debt/equity/acquisition notes, and proxy statements for the same period are required.",
      ],
    },
    guidanceOutcomeComparisons: [],
    financialConsequences: [
      isEs
        ? "No hay suficientes decisiones documentadas para resumir consecuencias financieras históricas."
        : "There are not enough documented decisions to summarize historical financial consequences.",
    ],
    inconsistencies: [
      isEs
        ? "No se identificaron inconsistencias verificables con la evidencia disponible; esto sigue siendo una brecha de investigación."
        : "No verifiable inconsistency was identified with the available evidence; this remains a research gap.",
    ],
    unresolvedQuestions: [
      isEs
        ? "¿Cómo se distribuyó el efectivo incremental entre reinversión, adquisiciones, retornos a accionistas y reducción de deuda?"
        : "How was incremental cash divided among reinvestment, acquisitions, shareholder returns, and debt reduction?",
      isEs
        ? "¿Qué guidance cuantitativo puede compararse con resultados posteriores usando la misma definición?"
        : "Which quantitative guidance can be matched to subsequent results using the same definition?",
    ],
  };
}

function normalizeAction(value: any): DocumentedManagementAction | null {
  const decision = cleanText(value?.decision, "", 1_200);
  if (!decision) return null;
  return {
    actionDate: cleanDate(value?.actionDate),
    decision,
    amount: finiteNumber(value?.amount),
    currency: cleanCurrency(value?.currency),
    financialConsequence: cleanText(
      value?.financialConsequence,
      "The financial consequence was not quantified in the available evidence.",
      1_500
    ),
    source: normalizeEvidence(value?.source, "The source for this action was not identified."),
  };
}

function normalizeCapitalSource(value: any): CapitalSourceRow | null {
  const label = cleanText(value?.label, "", 300);
  if (!label) return null;
  return {
    label,
    amount: finiteNumber(value?.amount),
    currency: cleanCurrency(value?.currency),
    periodStart: cleanDate(value?.periodStart),
    periodEnd: cleanDate(value?.periodEnd),
    source: normalizeEvidence(value?.source, "The source of capital was not verified."),
  };
}

function normalizeCapitalUse(value: any): CapitalAllocationRow | null {
  const label = cleanText(value?.label, "", 300);
  if (!label) return null;
  const category = CAPITAL_ALLOCATION_USE_CATEGORIES.includes(value?.category)
    ? value.category as CapitalAllocationUseCategory
    : "other";
  const basis = ["cash_outflow", "operating_expense", "balance_change", "unknown"].includes(value?.basis)
    ? value.basis as CapitalAllocationRow["basis"]
    : "unknown";
  return {
    category,
    label,
    amount: finiteNumber(value?.amount),
    currency: cleanCurrency(value?.currency),
    periodStart: cleanDate(value?.periodStart),
    periodEnd: cleanDate(value?.periodEnd),
    basis,
    includedInComparableTotal: value?.includedInComparableTotal === true,
    exclusionReason: cleanText(value?.exclusionReason, "", 800),
    percentOfComparableUses: null,
    source: normalizeEvidence(value?.source, "The source for this capital use was not verified."),
  };
}

function normalizeGuidanceComparison(value: any): GuidanceOutcomeComparison | null {
  const metric = cleanText(value?.metric, "", 300);
  if (!metric) return null;
  const result = ["met", "missed", "mixed", "not_testable"].includes(value?.result)
    ? value.result as GuidanceOutcomeComparison["result"]
    : "not_testable";
  return {
    metric,
    managementStatement: cleanText(value?.managementStatement, "Statement not available.", 1_200),
    statementDate: cleanDate(value?.statementDate),
    expectedOutcome: cleanText(value?.expectedOutcome, "Expected outcome not quantified.", 800),
    subsequentDocumentedOutcome: cleanText(value?.subsequentDocumentedOutcome, "Subsequent outcome not verified.", 1_200),
    outcomeDate: cleanDate(value?.outcomeDate),
    result,
    variance: cleanText(value?.variance, "Variance not reliably calculable.", 800),
    statementSource: normalizeEvidence(value?.statementSource, "The management statement source was not verified."),
    outcomeSource: normalizeEvidence(value?.outcomeSource, "The subsequent outcome source was not verified."),
    unresolvedQuestion: cleanText(value?.unresolvedQuestion, "What comparable result would resolve this assessment?", 800),
  };
}

export function normalizeManagementCapitalAllocationAnalysis(input: {
  candidate: any;
  fallback: ManagementCapitalAllocationAnalysis;
}): ManagementCapitalAllocationAnalysis {
  const candidate = input.candidate && typeof input.candidate === "object" ? input.candidate : {};
  const candidateCategories = Array.isArray(candidate.categories) ? candidate.categories : [];
  const byIdentity = new Map<string, any>();
  candidateCategories.forEach((category: any) => {
    [identity(category?.key), identity(category?.label)].filter(Boolean).forEach((key) => byIdentity.set(key, category));
  });
  const recognizedCategoryCount = MANAGEMENT_ACTION_CATEGORIES.filter(
    ({ key, label }) => byIdentity.has(identity(key)) || byIdentity.has(identity(label))
  ).length;
  const generatedBy = recognizedCategoryCount === MANAGEMENT_ACTION_CATEGORIES.length
    ? "ai_research"
    : "deterministic_fallback";
  const categories = MANAGEMENT_ACTION_CATEGORIES.map(({ key, label }, index) => {
    const fallback = input.fallback.categories[index] ?? fallbackCategory(key, label, "en");
    const source = byIdentity.get(identity(key)) ?? byIdentity.get(identity(label));
    if (!source) return fallback;
    const actions = (Array.isArray(source.documentedActions) ? source.documentedActions : [])
      .map((value: any): DocumentedManagementAction | null => normalizeAction(value))
      .filter((action: DocumentedManagementAction | null): action is DocumentedManagementAction => action !== null)
      .slice(0, 20);
    const inconsistencies = (Array.isArray(source.inconsistencies) ? source.inconsistencies : [])
      .map((row: any) => normalizeEvidence(row, `No verified inconsistency was identified for ${label.toLowerCase()}.`))
      .slice(0, 10);
    return {
      key,
      label,
      conclusion: cleanText(source.conclusion, fallback.conclusion, 2_000),
      documentedActions: actions,
      inconsistencies: inconsistencies.length ? inconsistencies : fallback.inconsistencies,
      unresolvedQuestions: cleanList(
        source.unresolvedQuestions,
        `Which additional dated disclosure would materially change the conclusion about ${label.toLowerCase()}?`
      ),
    } satisfies ManagementActionCategory;
  });
  const capital = candidate.incrementalCapitalAllocation ?? {};
  const sourcesOfCapital = (Array.isArray(capital.sourcesOfCapital) ? capital.sourcesOfCapital : [])
    .map((value: any): CapitalSourceRow | null => normalizeCapitalSource(value))
    .filter((row: CapitalSourceRow | null): row is CapitalSourceRow => row !== null)
    .slice(0, 30);
  const uses = (Array.isArray(capital.uses) ? capital.uses : [])
    .map((value: any): CapitalAllocationRow | null => normalizeCapitalUse(value))
    .filter((row: CapitalAllocationRow | null): row is CapitalAllocationRow => row !== null)
    .slice(0, 40);
  const requestedStatus = String(capital.status ?? "");
  const status = String(candidate.status ?? "");

  return {
    schemaVersion: "1.0",
    ticker: input.fallback.ticker,
    companyName: cleanText(candidate.companyName, input.fallback.companyName, 300),
    status:
      input.fallback.status === "not_applicable"
        ? "not_applicable"
        : input.fallback.status === "insufficient_information"
          ? "insufficient_information"
          : generatedBy === "ai_research" && ["complete", "provisional", "insufficient_information"].includes(status)
            ? status as ManagementAnalysisStatus
            : input.fallback.status,
    generatedAt: input.fallback.generatedAt,
    generatedBy,
    characterInferenceProhibited: true,
    observableAllocationPattern: cleanText(
      candidate.observableAllocationPattern,
      input.fallback.observableAllocationPattern,
      2_000
    ),
    categories,
    incrementalCapitalAllocation: {
      status: ["calculated", "partial", "not_calculable"].includes(requestedStatus)
        ? requestedStatus as IncrementalCapitalAllocation["status"]
        : "not_calculable",
      periodStart: cleanDate(capital.periodStart),
      periodEnd: cleanDate(capital.periodEnd),
      currency: cleanCurrency(capital.currency),
      methodology: cleanText(capital.methodology, input.fallback.incrementalCapitalAllocation.methodology, 2_000),
      sourcesOfCapital,
      uses,
      totalComparableUses: null,
      limitations: cleanList(
        capital.limitations,
        "The evidence does not support a complete, non-overlapping capital-allocation calculation."
      ),
    },
    guidanceOutcomeComparisons: (Array.isArray(candidate.guidanceOutcomeComparisons)
      ? candidate.guidanceOutcomeComparisons
      : [])
      .map((value: any): GuidanceOutcomeComparison | null => normalizeGuidanceComparison(value))
      .filter(
        (row: GuidanceOutcomeComparison | null): row is GuidanceOutcomeComparison => row !== null
      )
      .slice(0, 20),
    financialConsequences: cleanList(
      candidate.financialConsequences,
      input.fallback.financialConsequences[0]
    ),
    inconsistencies: cleanList(candidate.inconsistencies, input.fallback.inconsistencies[0]),
    unresolvedQuestions: cleanList(candidate.unresolvedQuestions, input.fallback.unresolvedQuestions[0]),
  };
}

function normalizedUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? "").trim());
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function constrainManagementCapitalAllocationSources(input: {
  analysis: ManagementCapitalAllocationAnalysis;
  uploadedFilings?: any[];
  annualFundamentals?: any[];
  webSources?: Array<{ url: string; title?: string | null }>;
}): ManagementCapitalAllocationAnalysis {
  const filings = (Array.isArray(input.uploadedFilings) ? input.uploadedFilings : []).filter(
    (filing) => filing?.form === "10-K" || filing?.form === "10-Q"
  );
  const financialYears = new Set(
    (Array.isArray(input.annualFundamentals) ? input.annualFundamentals : [])
      .map((row) => String(row?.year ?? "").trim())
      .filter(Boolean)
  );
  const publicSources = new Map(
    (input.webSources ?? [])
      .map((source) => [normalizedUrl(source?.url), source] as const)
      .filter(([url]) => Boolean(url))
  );
  const verifyEvidence = (evidence: ManagementEvidence): ManagementEvidence => {
    if (evidence.status === "not_identified") return evidence;
    if (evidence.sourceType === "public_source") {
      const source = publicSources.get(normalizedUrl(evidence.sourceUrl));
      if (source) return { ...evidence, sourceLabel: cleanText(source.title, evidence.sourceLabel, 300), sourceUrl: source.url };
    }
    if (evidence.sourceType === "company_filing" && filings.length) {
      const sourceIdentity = identity(evidence.sourceLabel);
      const sourceYear = evidence.sourceDate?.slice(0, 4) ?? "";
      const filing =
        filings.find((item) => {
          const fileIdentity = identity(item?.fileName);
          return Boolean(fileIdentity) && (sourceIdentity.includes(fileIdentity) || fileIdentity.includes(sourceIdentity));
        }) ??
        filings.find((item) => {
          const formIdentity = identity(item?.form);
          const filingYear = String(item?.periodEnd ?? item?.fiscalYear ?? "").slice(0, 4);
          const formMatches =
            (Boolean(formIdentity) && sourceIdentity.includes(formIdentity)) ||
            (item?.form === "10-K" && sourceIdentity.includes("annualfiling")) ||
            (item?.form === "10-Q" && sourceIdentity.includes("quarterlyfiling"));
          const yearMatches = Boolean(sourceYear && filingYear && sourceYear === filingYear);
          return formMatches && (!sourceYear || yearMatches);
        });
      if (!filing) {
        return {
          status: "not_identified",
          statement: `The claimed filing evidence could not be matched by file, form, and period: ${evidence.statement}`.slice(0, 1_200),
          sourceLabel: "Filing source could not be verified",
          sourceDate: null,
          sourceType: "not_available",
          sourceUrl: null,
        };
      }
      const fiscalYear = Number(filing?.fiscalYear);
      return {
        ...evidence,
        sourceLabel: cleanText(filing?.fileName, `${cleanTicker(filing?.ticker)} ${filing?.form}`.trim(), 300),
        sourceDate: cleanDate(filing?.periodEnd) ?? (Number.isFinite(fiscalYear) ? `${fiscalYear}-12-31` : evidence.sourceDate),
        sourceUrl: null,
      };
    }
    if (
      evidence.sourceType === "financial_statement" &&
      evidence.sourceDate &&
      financialYears.has(evidence.sourceDate.slice(0, 4))
    ) {
      return { ...evidence, sourceUrl: null };
    }
    return {
      status: "not_identified",
      statement: `The claimed evidence could not be matched to a retrieved source: ${evidence.statement}`.slice(0, 1_200),
      sourceLabel: "Source could not be verified",
      sourceDate: null,
      sourceType: "not_available",
      sourceUrl: null,
    };
  };

  const categories = input.analysis.categories.map((category) => ({
    ...category,
    documentedActions: category.documentedActions.map((action) => ({ ...action, source: verifyEvidence(action.source) })),
    inconsistencies: category.inconsistencies.map(verifyEvidence),
  }));
  const sourcesOfCapital = input.analysis.incrementalCapitalAllocation.sourcesOfCapital.map((row) => ({
    ...row,
    source: verifyEvidence(row.source),
  }));
  const periodStart = input.analysis.incrementalCapitalAllocation.periodStart;
  const periodEnd = input.analysis.incrementalCapitalAllocation.periodEnd;
  const currency = input.analysis.incrementalCapitalAllocation.currency;
  const constrainedUses: CapitalAllocationRow[] = input.analysis.incrementalCapitalAllocation.uses.map((row) => {
    const source = verifyEvidence(row.source);
    const periodMatches = Boolean(periodStart && periodEnd && row.periodStart === periodStart && row.periodEnd === periodEnd);
    const currencyMatches = Boolean(currency && row.currency === currency);
    const amountReliable = row.amount != null && row.amount >= 0;
    const basisComparable = row.basis === "cash_outflow";
    const includedInComparableTotal = Boolean(
      row.includedInComparableTotal &&
        source.status === "identified" &&
        periodMatches &&
        currencyMatches &&
        amountReliable &&
        basisComparable
    );
    const exclusionReason = includedInComparableTotal
      ? ""
      : cleanText(
          row.exclusionReason,
          !basisComparable
            ? "Excluded because the row is not a documented cash outflow."
            : !periodMatches || !currencyMatches
              ? "Excluded because period or currency is not comparable."
              : source.status !== "identified"
                ? "Excluded because the source could not be verified."
                : "Excluded because the amount is not reliable.",
          800
        );
    return { ...row, source, includedInComparableTotal, exclusionReason, percentOfComparableUses: null };
  });
  const comparableUses = constrainedUses.filter(
    (row): row is CapitalAllocationRow & { amount: number } => row.includedInComparableTotal && row.amount != null
  );
  const totalComparableUses = comparableUses.reduce((sum, row) => sum + row.amount, 0);
  const uses = constrainedUses.map((row) => ({
    ...row,
    percentOfComparableUses:
      row.includedInComparableTotal && row.amount != null && totalComparableUses > 0
        ? row.amount / totalComparableUses
        : null,
  }));
  const requestedStatus = input.analysis.incrementalCapitalAllocation.status;
  const allocationStatus: IncrementalCapitalAllocation["status"] =
    comparableUses.length >= 2 && totalComparableUses > 0 && requestedStatus === "calculated"
      ? "calculated"
      : comparableUses.length > 0 && totalComparableUses > 0
        ? "partial"
        : "not_calculable";
  const guidanceOutcomeComparisons = input.analysis.guidanceOutcomeComparisons.map((comparison) => {
    const statementSource = verifyEvidence(comparison.statementSource);
    const outcomeSource = verifyEvidence(comparison.outcomeSource);
    return {
      ...comparison,
      result:
        statementSource.status === "identified" && outcomeSource.status === "identified"
          ? comparison.result
          : "not_testable" as const,
      statementSource,
      outcomeSource,
    };
  });

  return {
    ...input.analysis,
    categories,
    incrementalCapitalAllocation: {
      ...input.analysis.incrementalCapitalAllocation,
      status: allocationStatus,
      sourcesOfCapital,
      uses,
      totalComparableUses: totalComparableUses > 0 ? totalComparableUses : null,
    },
    guidanceOutcomeComparisons,
  };
}
