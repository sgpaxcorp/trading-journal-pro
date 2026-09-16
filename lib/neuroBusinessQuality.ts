import { financialNumberOrNull } from "@/lib/neuroFinancialDataIntegrity";

export const BUSINESS_QUALITY_DIMENSIONS = [
  { key: "businessModel", label: "Business model" },
  { key: "revenueSources", label: "Revenue sources" },
  { key: "revenuePredictability", label: "Revenue predictability" },
  { key: "pricingPower", label: "Pricing power" },
  { key: "customerConcentration", label: "Customer concentration" },
  { key: "supplierConcentration", label: "Supplier concentration" },
  { key: "competitiveAdvantages", label: "Competitive advantages" },
  { key: "barriersToEntry", label: "Barriers to entry" },
  { key: "marketStructure", label: "Market structure" },
  { key: "capitalIntensity", label: "Capital intensity" },
  { key: "returnOnInvestedCapital", label: "Return on invested capital" },
  { key: "freeCashFlowGeneration", label: "Free cash flow generation" },
  { key: "debtRequirements", label: "Debt requirements" },
  { key: "acquisitionDependency", label: "Acquisition dependency" },
  { key: "shareDilution", label: "Share dilution" },
  { key: "managementCapitalAllocation", label: "Management capital allocation" },
  { key: "cyclicality", label: "Cyclicality" },
  { key: "regulatoryExposure", label: "Regulatory exposure" },
  { key: "technologyDisruptionRisk", label: "Technology disruption risk" },
  { key: "longTermReinvestmentOpportunities", label: "Long-term reinvestment opportunities" },
] as const;

export type BusinessQualityDimensionKey = (typeof BUSINESS_QUALITY_DIMENSIONS)[number]["key"];
export type BusinessQualityStatus = "complete" | "provisional" | "insufficient_information" | "not_applicable";
export type BusinessQualityEvidenceStatus = "identified" | "not_identified";

export type BusinessQualityEvidence = {
  status: BusinessQualityEvidenceStatus;
  statement: string;
  sourceLabel: string;
  sourceDate: string | null;
  sourceType: "company_filing" | "public_source" | "financial_statement" | "user_input" | "not_available";
  sourceUrl: string | null;
};

export type BusinessQualityDimension = {
  key: BusinessQualityDimensionKey;
  label: string;
  conclusion: string;
  supportingEvidence: BusinessQualityEvidence[];
  contradictoryEvidence: BusinessQualityEvidence[];
  uncertainty: string[];
  additionalInformation: string[];
};

export type BusinessQualityCondition = {
  condition: string;
  whyItMatters: string;
  evidenceNeeded: string;
  failureSignal: string;
};

export type BusinessQualityAnalysis = {
  schemaVersion: "1.0";
  ticker: string;
  companyName: string;
  status: BusinessQualityStatus;
  analysisOrder: "business_before_valuation";
  priceDataExcluded: true;
  generatedAt: string;
  generatedBy: "ai_research" | "deterministic_fallback";
  dimensions: BusinessQualityDimension[];
  whatMustBeTrue: BusinessQualityCondition[];
};

export const BUSINESS_QUALITY_SYSTEM_PROMPT = `
You are the Business Quality Analysis Engine inside Neuro Analysis.

Mandatory analysis order:
1. Understand the operating business.
2. Only a later, separate process may analyze the stock price or valuation.

You are deliberately not given market price, market capitalization, valuation multiples, portfolio cost, position size, or price history. Do not search for, infer, mention, or use them. This stage evaluates the business, not the stock.

Evaluate exactly these 20 dimensions:
${BUSINESS_QUALITY_DIMENSIONS.map((dimension, index) => `${index + 1}. ${dimension.key} — ${dimension.label}`).join("\n")}

Do not create a score, grade, rank, weighted average, traffic-light rating, or synthetic quality number. A nuanced conclusion with explicit uncertainty is required.

For every dimension, return:
- conclusion: the narrowest conclusion supported by current evidence.
- supportingEvidence: evidence that supports the conclusion.
- contradictoryEvidence: evidence that weakens, complicates, or contradicts the conclusion. If none was found, explicitly say it was not identified and that this is not proof none exists.
- uncertainty: unresolved interpretation or data limitations.
- additionalInformation: specific information that would materially change the conclusion.

Evidence rules:
- Prefer company filings and dated primary sources.
- Financial-statement history may support a conclusion but cannot prove customer behavior, competitive advantage, management quality, or future durability by itself.
- Never invent a fact, source, date, customer, supplier, competitor, market share, metric, quotation, or management intent.
- Every identified evidence item must name its source and date. Use status "not_identified" when evidence was not found.
- A missing disclosure is an uncertainty, not favorable evidence.
- If current filings are incomplete, use status "provisional" or "insufficient_information".
- If the instrument is an ETF or fund, return status "not_applicable"; do not pretend it is an operating company.
- Use Spanish when the requested language is Spanish; otherwise use English.

End the analysis with whatMustBeTrue: the falsifiable conditions required for this business to be an attractive investment candidate before valuation. Each condition must include whyItMatters, evidenceNeeded, and failureSignal.

Return one JSON object only with this shape:
{
  "companyName": "string",
  "status": "complete | provisional | insufficient_information | not_applicable",
  "dimensions": [
    {
      "key": "one exact key from the 20-dimension list",
      "label": "dimension label",
      "conclusion": "string",
      "supportingEvidence": [
        {
          "status": "identified | not_identified",
          "statement": "string",
          "sourceLabel": "string",
          "sourceDate": "YYYY-MM-DD or null",
          "sourceType": "company_filing | public_source | financial_statement | user_input | not_available",
          "sourceUrl": "https URL or null"
        }
      ],
      "contradictoryEvidence": ["same evidence object shape"],
      "uncertainty": ["string"],
      "additionalInformation": ["string"]
    }
  ],
  "whatMustBeTrue": [
    {
      "condition": "string",
      "whyItMatters": "string",
      "evidenceNeeded": "string",
      "failureSignal": "string"
    }
  ]
}
`.trim();

export function buildBusinessQualityInput(input: {
  language?: "en" | "es";
  ticker: string;
  company?: unknown;
  instrumentType?: string | null;
  annualFundamentals?: unknown[];
  uploadedFilings?: unknown[];
}) {
  const filings = (Array.isArray(input.uploadedFilings) ? input.uploadedFilings : []).map((filing: any) => ({
    ticker: cleanTicker(filing?.ticker),
    form: filing?.form === "10-Q" ? "10-Q" : "10-K",
    fileName: cleanText(filing?.fileName, "", 512) || null,
    fiscalYear: Number.isFinite(Number(filing?.fiscalYear)) ? Number(filing.fiscalYear) : null,
    period: cleanText(filing?.period, "", 64) || null,
    periodEnd: cleanText(filing?.periodEnd, "", 32) || null,
    indexedForSearch: Boolean(cleanText(filing?.vectorStoreId)),
  }));
  return [
    `Language: ${input.language === "es" ? "es" : "en"}`,
    `Focus ticker: ${cleanTicker(input.ticker)}`,
    `Instrument type: ${cleanText(input.instrumentType, "unknown", 40)}`,
    "",
    "Company identity (contains no price or valuation data):",
    JSON.stringify(input.company ?? {}, null, 2),
    "",
    "Annual financial-statement history (contains no market price or valuation data):",
    JSON.stringify(Array.isArray(input.annualFundamentals) ? input.annualFundamentals : [], null, 2),
    "",
    "Indexed company document metadata:",
    JSON.stringify(filings, null, 2),
    "",
    "Analyze the business now. Do not perform valuation and do not discuss the stock price.",
  ].join("\n");
}

function cleanText(value: unknown, fallback = "", maxLength = 2_000) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanTicker(value: unknown) {
  return cleanText(value, "", 12)
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function cleanList(value: unknown, fallback: string, maxItems = 8) {
  const rows = Array.isArray(value) ? value : [];
  const cleaned = rows.map((item) => cleanText(item, "", 800)).filter(Boolean).slice(0, maxItems);
  return cleaned.length ? cleaned : [fallback];
}

function finiteNumber(value: unknown) {
  return financialNumberOrNull(value);
}

function evidencePlaceholder(kind: "supporting" | "contradictory", label: string): BusinessQualityEvidence {
  return {
    status: "not_identified",
    statement:
      kind === "supporting"
        ? `No verified supporting evidence was identified for ${label.toLowerCase()}.`
        : `No verified contradictory evidence was identified for ${label.toLowerCase()}. This is an evidence gap, not proof that none exists.`,
    sourceLabel: "Evidence not available",
    sourceDate: null,
    sourceType: "not_available",
    sourceUrl: null,
  };
}

function normalizeSourceType(value: unknown): BusinessQualityEvidence["sourceType"] {
  const sourceType = String(value ?? "").trim().toLowerCase();
  if (sourceType === "company_filing") return "company_filing";
  if (sourceType === "public_source") return "public_source";
  if (sourceType === "financial_statement") return "financial_statement";
  if (sourceType === "user_input") return "user_input";
  return "not_available";
}

function normalizeEvidence(
  value: unknown,
  kind: "supporting" | "contradictory",
  label: string
): BusinessQualityEvidence[] {
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows
    .map((row: any) => {
      if (typeof row === "string") {
        return {
          status: "identified" as const,
          statement: cleanText(row, "", 1_200),
          sourceLabel: "Source not specified",
          sourceDate: null,
          sourceType: "not_available" as const,
          sourceUrl: null,
        };
      }
      const statement = cleanText(row?.statement ?? row?.text, "", 1_200);
      if (!statement) return null;
      const status = row?.status === "not_identified" ? "not_identified" : "identified";
      const sourceUrl = /^https?:\/\//i.test(String(row?.sourceUrl ?? row?.url ?? ""))
        ? cleanText(row?.sourceUrl ?? row?.url, "", 2_000)
        : null;
      return {
        status,
        statement,
        sourceLabel: cleanText(row?.sourceLabel ?? row?.source, "Source not specified", 300),
        sourceDate: cleanText(row?.sourceDate ?? row?.date, "", 40) || null,
        sourceType: normalizeSourceType(row?.sourceType),
        sourceUrl,
      } satisfies BusinessQualityEvidence;
    })
    .filter((row): row is BusinessQualityEvidence => Boolean(row))
    .slice(0, 8);
  return normalized.length ? normalized : [evidencePlaceholder(kind, label)];
}

function dimensionIdentity(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fallbackDimension(
  key: BusinessQualityDimensionKey,
  label: string,
  language: "en" | "es"
): BusinessQualityDimension {
  const isEs = language === "es";
  return {
    key,
    label,
    conclusion: isEs
      ? `La evidencia disponible no permite llegar todavía a una conclusión confiable sobre ${label.toLowerCase()}.`
      : `The available evidence does not yet support a reliable conclusion about ${label.toLowerCase()}.`,
    supportingEvidence: [evidencePlaceholder("supporting", label)],
    contradictoryEvidence: [evidencePlaceholder("contradictory", label)],
    uncertainty: [
      isEs
        ? "La ausencia de evidencia verificada limita la conclusión."
        : "The absence of verified evidence limits the conclusion.",
    ],
    additionalInformation: [
      isEs
        ? `Obtén divulgaciones específicas y actuales que permitan evaluar ${label.toLowerCase()}.`
        : `Obtain current, specific disclosures that allow ${label.toLowerCase()} to be evaluated.`,
    ],
  };
}

function financialEvidence(
  statement: string,
  sourceDate: string | null
): BusinessQualityEvidence {
  return {
    status: "identified",
    statement,
    sourceLabel: "Annual financial statement data",
    sourceDate,
    sourceType: "financial_statement",
    sourceUrl: null,
  };
}

export function buildBusinessQualityFallback(input: {
  ticker: string;
  companyName?: string | null;
  instrumentType?: string | null;
  annualFundamentals?: any[];
  uploadedFilings?: any[];
  language?: "en" | "es";
  generatedAt?: string;
}): BusinessQualityAnalysis {
  const generatedAt = cleanText(input.generatedAt, new Date().toISOString(), 40);
  const language = input.language === "es" ? "es" : "en";
  const instrumentType = cleanText(input.instrumentType).toLowerCase();
  const fundLike = instrumentType === "etf" || instrumentType === "fund";
  const filings = Array.isArray(input.uploadedFilings) ? input.uploadedFilings : [];
  const has10k = filings.some((filing) => filing?.form === "10-K");
  const has10q = filings.some((filing) => filing?.form === "10-Q");
  const fundamentals = (Array.isArray(input.annualFundamentals) ? input.annualFundamentals : [])
    .filter((row) => Number.isFinite(Number(row?.year)))
    .sort((a, b) => Number(b.year) - Number(a.year));
  const latest = fundamentals[0] ?? null;
  const ticker = cleanTicker(input.ticker);
  const dimensions = BUSINESS_QUALITY_DIMENSIONS.map(({ key, label }) => fallbackDimension(key, label, language));
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));

  if (!fundLike && latest) {
    const revenue = finiteNumber(latest.totalRevenue);
    const freeCashFlow = finiteNumber(latest.freeCashFlow);
    const fcfMargin = finiteNumber(latest.fcfMargin);
    const totalDebt = finiteNumber(latest.totalDebt);
    const debtToEquity = finiteNumber(latest.debtToEquity);
    const sourceDate = Number.isFinite(Number(latest.year)) ? `${latest.year}-12-31` : null;

    if (revenue != null) {
      const dimension = byKey.get("revenuePredictability");
      if (dimension) {
        dimension.conclusion = language === "es"
          ? "Existe historial financiero para comenzar a evaluar la estabilidad de ingresos, pero los estados anuales por sí solos no demuestran predictibilidad."
          : "Financial history is available to begin assessing revenue stability, but annual statements alone do not establish predictability.";
        dimension.supportingEvidence = [
          financialEvidence(`Reported revenue for ${latest.year}: ${revenue}.`, sourceDate),
        ];
      }
    }

    if (freeCashFlow != null) {
      const dimension = byKey.get("freeCashFlowGeneration");
      if (dimension) {
        dimension.conclusion = freeCashFlow > 0
          ? language === "es"
            ? "El periodo más reciente muestra flujo de caja libre positivo; falta confirmar su durabilidad y calidad."
            : "The latest period shows positive free cash flow; durability and quality still require verification."
          : language === "es"
            ? "El periodo más reciente no muestra flujo de caja libre positivo y requiere explicación."
            : "The latest period does not show positive free cash flow and requires explanation.";
        dimension.supportingEvidence = [
          financialEvidence(
            `Reported free cash flow for ${latest.year}: ${freeCashFlow}${fcfMargin == null ? "" : `; FCF margin: ${fcfMargin}`}.`,
            sourceDate
          ),
        ];
      }
    }

    if (totalDebt != null || debtToEquity != null) {
      const dimension = byKey.get("debtRequirements");
      if (dimension) {
        dimension.conclusion = language === "es"
          ? "La deuda reportada permite una revisión inicial, pero se necesita el calendario de vencimientos y la cobertura de intereses."
          : "Reported debt supports an initial review, but the maturity schedule and interest coverage are still required.";
        dimension.supportingEvidence = [
          financialEvidence(
            `Reported debt for ${latest.year}: ${totalDebt ?? "unavailable"}; debt-to-equity: ${debtToEquity ?? "unavailable"}.`,
            sourceDate
          ),
        ];
      }
    }
  }

  return {
    schemaVersion: "1.0",
    ticker,
    companyName: cleanText(input.companyName, ticker || "Company", 300),
    status: fundLike
      ? "not_applicable"
      : has10k && has10q
        ? "provisional"
        : fundamentals.length
          ? "insufficient_information"
          : "insufficient_information",
    analysisOrder: "business_before_valuation",
    priceDataExcluded: true,
    generatedAt,
    generatedBy: "deterministic_fallback",
    dimensions,
    whatMustBeTrue: [
      {
        condition:
          language === "es"
            ? "El negocio debe convertir ventajas defendibles en flujo de caja libre durable sin depender de deuda, dilución o adquisiciones destructivas."
            : "The business must convert defensible advantages into durable free cash flow without depending on debt, dilution, or value-destructive acquisitions.",
        whyItMatters:
          language === "es"
            ? "Una valoración atractiva no compensa un negocio cuya economía se deteriora."
            : "An attractive valuation does not compensate for deteriorating business economics.",
        evidenceNeeded:
          language === "es"
            ? "10-K y 10-Q actuales, economía por segmento, ROIC normalizado, puente de FCF, deuda, dilución y asignación de capital."
            : "Current 10-K and 10-Q, segment economics, normalized ROIC, FCF bridge, debt, dilution, and capital-allocation evidence.",
        failureSignal:
          language === "es"
            ? "Pérdida persistente de poder de precio, ROIC, FCF o ventaja competitiva."
            : "Persistent erosion in pricing power, ROIC, free cash flow, or competitive advantage.",
      },
    ],
  };
}

export function normalizeBusinessQualityAnalysis(input: {
  candidate: any;
  fallback: BusinessQualityAnalysis;
}): BusinessQualityAnalysis {
  const candidate = input.candidate && typeof input.candidate === "object" ? input.candidate : {};
  const candidateDimensions = Array.isArray(candidate.dimensions) ? candidate.dimensions : [];
  const byIdentity = new Map<string, any>();
  candidateDimensions.forEach((dimension: any) => {
    const identities = [dimensionIdentity(dimension?.key), dimensionIdentity(dimension?.label)].filter(Boolean);
    identities.forEach((identity) => byIdentity.set(identity, dimension));
  });
  const recognizedDimensionCount = BUSINESS_QUALITY_DIMENSIONS.filter(
    ({ key, label }) => byIdentity.has(dimensionIdentity(key)) || byIdentity.has(dimensionIdentity(label))
  ).length;
  const generatedBy = recognizedDimensionCount === BUSINESS_QUALITY_DIMENSIONS.length
    ? "ai_research"
    : "deterministic_fallback";

  const dimensions = BUSINESS_QUALITY_DIMENSIONS.map(({ key, label }, index) => {
    const fallbackDimensionValue = input.fallback.dimensions[index] ?? fallbackDimension(key, label, "en");
    const source = byIdentity.get(dimensionIdentity(key)) ?? byIdentity.get(dimensionIdentity(label));
    if (!source) return fallbackDimensionValue;
    return {
      key,
      label,
      conclusion: cleanText(source.conclusion, fallbackDimensionValue.conclusion, 2_000),
      supportingEvidence: normalizeEvidence(source.supportingEvidence, "supporting", label),
      contradictoryEvidence: normalizeEvidence(source.contradictoryEvidence, "contradictory", label),
      uncertainty: cleanList(
        source.uncertainty,
        "The remaining uncertainty was not specified; additional verified evidence is required."
      ),
      additionalInformation: cleanList(
        source.additionalInformation,
        `Obtain current, specific disclosures that would materially change the conclusion about ${label.toLowerCase()}.`
      ),
    } satisfies BusinessQualityDimension;
  });

  const candidateConditions = Array.isArray(candidate.whatMustBeTrue) ? candidate.whatMustBeTrue : [];
  const whatMustBeTrue = candidateConditions
    .map((row: any) => ({
      condition: cleanText(row?.condition, "", 1_200),
      whyItMatters: cleanText(row?.whyItMatters, "", 1_200),
      evidenceNeeded: cleanText(row?.evidenceNeeded, "", 1_200),
      failureSignal: cleanText(row?.failureSignal, "", 1_200),
    }))
    .filter((row: BusinessQualityCondition) => row.condition && row.whyItMatters && row.evidenceNeeded && row.failureSignal)
    .slice(0, 12);
  const status = String(candidate.status ?? "").toLowerCase();

  return {
    schemaVersion: "1.0",
    ticker: input.fallback.ticker,
    companyName: cleanText(candidate.companyName, input.fallback.companyName, 300),
    status:
      input.fallback.status === "not_applicable"
        ? "not_applicable"
        : input.fallback.status === "insufficient_information"
          ? "insufficient_information"
        : generatedBy === "ai_research" &&
            (status === "complete" || status === "provisional" || status === "insufficient_information")
          ? status
          : input.fallback.status,
    analysisOrder: "business_before_valuation",
    priceDataExcluded: true,
    generatedAt: input.fallback.generatedAt,
    generatedBy,
    dimensions,
    whatMustBeTrue: whatMustBeTrue.length ? whatMustBeTrue : input.fallback.whatMustBeTrue,
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

export function constrainBusinessQualityEvidenceSources(input: {
  analysis: BusinessQualityAnalysis;
  uploadedFilings?: any[];
  annualFundamentals?: any[];
  webSources?: Array<{ url: string; title?: string | null }>;
}): BusinessQualityAnalysis {
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

  const verifyEvidence = (evidence: BusinessQualityEvidence): BusinessQualityEvidence => {
    if (evidence.status === "not_identified") return evidence;
    if (evidence.sourceType === "public_source") {
      const source = publicSources.get(normalizedUrl(evidence.sourceUrl));
      if (source) {
        return {
          ...evidence,
          sourceLabel: cleanText(source.title, evidence.sourceLabel, 300),
          sourceUrl: source.url,
        };
      }
    }
    if (evidence.sourceType === "company_filing" && filings.length) {
      const identity = dimensionIdentity(evidence.sourceLabel);
      const filing =
        filings.find((item) => {
          const fileIdentity = dimensionIdentity(item?.fileName);
          return Boolean(fileIdentity) && identity.includes(fileIdentity);
        }) ??
        filings.find((item) => {
          const formIdentity = dimensionIdentity(item?.form);
          return Boolean(formIdentity) && identity.includes(formIdentity);
        }) ??
        filings[0];
      const fiscalYear = Number(filing?.fiscalYear);
      return {
        ...evidence,
        sourceLabel: cleanText(
          filing?.fileName,
          `${cleanTicker(filing?.ticker)} ${filing?.form}`.trim(),
          300
        ),
        sourceDate:
          cleanText(filing?.periodEnd, "", 40) ||
          (Number.isFinite(fiscalYear) ? `${fiscalYear}-12-31` : evidence.sourceDate),
        sourceUrl: null,
      };
    }
    if (
      evidence.sourceType === "financial_statement" &&
      evidence.sourceDate &&
      financialYears.has(String(evidence.sourceDate).slice(0, 4))
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

  return {
    ...input.analysis,
    dimensions: input.analysis.dimensions.map((dimension) => ({
      ...dimension,
      supportingEvidence: dimension.supportingEvidence.map(verifyEvidence),
      contradictoryEvidence: dimension.contradictoryEvidence.map(verifyEvidence),
    })),
  };
}
