import { financialNumberOrNull } from "@/lib/neuroFinancialDataIntegrity";

export const EARNINGS_QUALITY_AREAS = [
  { key: "netIncomeVsOperatingCashFlow", label: "Net income versus operating cash flow" },
  { key: "freeCashFlowVsReportedEarnings", label: "Free cash flow versus reported earnings" },
  { key: "accountsReceivableVsRevenue", label: "Accounts receivable versus revenue" },
  { key: "inventoryVsRevenue", label: "Inventory versus revenue" },
  { key: "capitalExpenditures", label: "Capital expenditures" },
  { key: "capitalizedExpenses", label: "Capitalized expenses" },
  { key: "goodwillAndIntangibleAssets", label: "Goodwill and intangible assets" },
  { key: "acquisitionAccounting", label: "Acquisition accounting" },
  { key: "stockBasedCompensation", label: "Stock-based compensation" },
  { key: "shareDilution", label: "Share dilution" },
  { key: "oneTimeAdjustments", label: "One-time adjustments" },
  { key: "nonGaapAdjustments", label: "Non-GAAP adjustments" },
  { key: "restructuringCharges", label: "Restructuring charges" },
  { key: "deferredRevenue", label: "Deferred revenue" },
  { key: "deferredTaxes", label: "Deferred taxes" },
  { key: "changesInWorkingCapital", label: "Changes in working capital" },
  { key: "relatedPartyTransactions", label: "Related-party transactions" },
  { key: "auditorChanges", label: "Auditor changes" },
  { key: "restatements", label: "Restatements" },
  { key: "accountingEstimateChanges", label: "Changes in accounting estimates" },
] as const;

export type EarningsQualityAreaKey = (typeof EARNINGS_QUALITY_AREAS)[number]["key"];
export type EarningsQualityStatus = "complete" | "provisional" | "insufficient_information" | "not_applicable";
export type EarningsQualityFlagStatus = "investigate" | "watch" | "no_unusual_divergence" | "data_gap";

export type EarningsQualityEvidence = {
  status: "identified" | "not_identified";
  statement: string;
  sourceLabel: string;
  sourceDate: string | null;
  sourceType: "company_filing" | "public_source" | "financial_statement" | "not_available";
  sourceUrl: string | null;
};

export type EarningsQualityTrendPoint = {
  period: string;
  primaryLabel: string;
  primaryValue: number | null;
  comparisonLabel: string;
  comparisonValue: number | null;
  calculation: "ratio" | "difference" | "growth_spread";
  calculatedValue: number | null;
  source: EarningsQualityEvidence;
};

export type EarningsQualityInvestigationFlag = {
  status: EarningsQualityFlagStatus;
  formula: string;
  mathematicalExplanation: string;
  whyInvestigate: string;
};

export type EarningsQualityArea = {
  key: EarningsQualityAreaKey;
  label: string;
  conclusion: string;
  documentedEvidence: EarningsQualityEvidence[];
  mitigatingEvidence: EarningsQualityEvidence[];
  multiYearTrend: EarningsQualityTrendPoint[];
  investigationFlag: EarningsQualityInvestigationFlag;
  uncertainty: string[];
  additionalInformation: string[];
};

export type EarningsQualityAccountingRiskAnalysis = {
  schemaVersion: "1.0";
  ticker: string;
  companyName: string;
  status: EarningsQualityStatus;
  analysisOrder: "earnings_quality_before_valuation";
  priceDataExcluded: true;
  generatedAt: string;
  generatedBy: "ai_research" | "deterministic_fallback";
  fraudDetermination: "not_made";
  statisticalAnomaliesAreNotFraudFindings: true;
  summary: string;
  areas: EarningsQualityArea[];
  prioritizedInvestigationQuestions: string[];
};

export const EARNINGS_QUALITY_SYSTEM_PROMPT = `
You are the Earnings Quality and Accounting Risk Agent inside Neuro Analysis.

Objective:
- Identify financial relationships and accounting disclosures that require additional investigation.
- Do not accuse a company, management team, employee, auditor, or counterparty of fraud or misconduct.
- Statistical anomalies, divergences, restatements, adjustments, or unusual accounting relationships are not by themselves evidence of fraud.
- Do not create a fraud score, accounting-quality score, grade, rank, probability of fraud, or accusation.
- This analysis occurs before stock price and valuation. Do not search for or use price, market capitalization, valuation multiples, portfolio cost, or position size.

Analyze exactly these 20 areas:
${EARNINGS_QUALITY_AREAS.map((area, index) => `${index + 1}. ${area.key} - ${area.label}`).join("\n")}

Method:
- Perform a multi-year trend analysis, preferably three to five fiscal years, using consistent definitions and periods.
- Use company filings and audited financial statements as primary evidence. Use dated public sources for auditor changes, restatements, or regulatory disclosures when needed.
- Compare levels, growth rates, margins, conversion ratios, and cumulative values when the data permits.
- For every unusual divergence, show the raw values, formula, calculated relationship, period, and mathematical reason it deserves investigation.
- Provide raw primaryValue and comparisonValue. The application recomputes ratios, differences, and growth spreads.
- A screening threshold is a prompt for research, not a universal accounting rule or finding of wrongdoing. Explain industry, acquisition, seasonality, business-model, and classification limitations.
- Never invent a value, filing, adjustment, auditor event, restatement, accounting policy, estimate, source, or date.
- When reliable values are unavailable, return data_gap and name the exact disclosure needed.
- Distinguish documented evidence from mitigating or contradictory evidence.
- Use Spanish when requested; otherwise use English.

Return one JSON object only with this shape:
{
  "companyName": "string",
  "status": "complete | provisional | insufficient_information | not_applicable",
  "summary": "objective synthesis without fraud allegations",
  "areas": [
    {
      "key": "one exact key from the 20-area list",
      "label": "area label",
      "conclusion": "narrow evidence-based conclusion",
      "documentedEvidence": [
        {
          "status": "identified | not_identified",
          "statement": "documented fact",
          "sourceLabel": "source name",
          "sourceDate": "YYYY-MM-DD or null",
          "sourceType": "company_filing | public_source | financial_statement | not_available",
          "sourceUrl": "https URL or null"
        }
      ],
      "mitigatingEvidence": ["same evidence object shape"],
      "multiYearTrend": [
        {
          "period": "fiscal year or period",
          "primaryLabel": "first metric",
          "primaryValue": "number or null",
          "comparisonLabel": "second metric",
          "comparisonValue": "number or null",
          "calculation": "ratio | difference | growth_spread",
          "source": "evidence object"
        }
      ],
      "investigationFlag": {
        "status": "investigate | watch | no_unusual_divergence | data_gap",
        "formula": "explicit formula",
        "mathematicalExplanation": "why the multi-year relationship is unusual or not calculable",
        "whyInvestigate": "specific follow-up, never an accusation"
      },
      "uncertainty": ["string"],
      "additionalInformation": ["specific disclosure that would change the conclusion"]
    }
  ],
  "prioritizedInvestigationQuestions": ["question tied to a documented divergence or data gap"]
}
`.trim();

function cleanText(value: unknown, fallback = "", maxLength = 2_000) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function guardedText(value: unknown, fallback: string, maxLength = 2_000) {
  const text = cleanText(value, fallback, maxLength);
  const accusation =
    /\b(is|are|was|were|committed|committing|constitutes?|proves?|demonstrates?)\b.{0,60}\b(fraud|fraudulent|manipulation|misconduct)\b/i.test(text) ||
    /\b(high|likely|probable)\s+(risk\s+of\s+)?fraud\b/i.test(text);
  return accusation
    ? "The documented relationship requires additional investigation; statistical evidence alone does not establish fraud or misconduct."
    : text;
}

function cleanTicker(value: unknown) {
  return cleanText(value, "", 12).toUpperCase().replace(/[^A-Z0-9.-]/g, "");
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

function cleanList(value: unknown, fallback: string, maxItems = 12) {
  const rows = Array.isArray(value) ? value : [];
  const cleaned = rows.map((row) => guardedText(row, "", 1_000)).filter(Boolean).slice(0, maxItems);
  return cleaned.length ? cleaned : [fallback];
}

function identity(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function missingEvidence(statement: string): EarningsQualityEvidence {
  return {
    status: "not_identified",
    statement,
    sourceLabel: "Evidence not available",
    sourceDate: null,
    sourceType: "not_available",
    sourceUrl: null,
  };
}

function financialEvidence(statement: string, year: number): EarningsQualityEvidence {
  return {
    status: "identified",
    statement,
    sourceLabel: "Annual financial statement data",
    sourceDate: `${year}-12-31`,
    sourceType: "financial_statement",
    sourceUrl: null,
  };
}

function normalizeSourceType(value: unknown): EarningsQualityEvidence["sourceType"] {
  const type = cleanText(value).toLowerCase();
  if (type === "company_filing") return "company_filing";
  if (type === "public_source") return "public_source";
  if (type === "financial_statement") return "financial_statement";
  return "not_available";
}

function normalizeEvidence(value: any, fallback: string): EarningsQualityEvidence {
  if (!value || typeof value !== "object") return missingEvidence(fallback);
  const sourceUrl = /^https?:\/\//i.test(String(value.sourceUrl ?? value.url ?? ""))
    ? cleanText(value.sourceUrl ?? value.url, "", 2_000)
    : null;
  return {
    status: value.status === "not_identified" ? "not_identified" : "identified",
    statement: guardedText(value.statement ?? value.text, fallback, 1_200),
    sourceLabel: cleanText(value.sourceLabel ?? value.source, "Source not specified", 300),
    sourceDate: cleanDate(value.sourceDate ?? value.date),
    sourceType: normalizeSourceType(value.sourceType),
    sourceUrl,
  };
}

function placeholderArea(
  key: EarningsQualityAreaKey,
  label: string,
  language: "en" | "es"
): EarningsQualityArea {
  const isEs = language === "es";
  return {
    key,
    label,
    conclusion: isEs
      ? `La evidencia disponible no permite evaluar todavía ${label.toLowerCase()}.`
      : `The available evidence does not yet support an assessment of ${label.toLowerCase()}.`,
    documentedEvidence: [
      missingEvidence(
        isEs
          ? `No se identificó evidencia suficiente para ${label.toLowerCase()}.`
          : `Sufficient evidence was not identified for ${label.toLowerCase()}.`
      ),
    ],
    mitigatingEvidence: [
      missingEvidence(
        isEs
          ? "No se identificó evidencia mitigante; esto es una brecha, no prueba de que no exista."
          : "No mitigating evidence was identified; this is a gap, not proof that none exists."
      ),
    ],
    multiYearTrend: [],
    investigationFlag: {
      status: "data_gap",
      formula: "Not calculable from available verified data.",
      mathematicalExplanation: isEs
        ? "No hay suficientes periodos y valores comparables para calcular una relación."
        : "There are not enough comparable periods and values to calculate a relationship.",
      whyInvestigate: isEs
        ? "Obtén los estados y notas que contienen ambos lados de la relación."
        : "Obtain the statements and notes containing both sides of the relationship.",
    },
    uncertainty: [
      isEs ? "La ausencia de data limita cualquier conclusión." : "Missing data limits any conclusion.",
    ],
    additionalInformation: [
      isEs
        ? `Obtén divulgaciones multianuales consistentes para ${label.toLowerCase()}.`
        : `Obtain consistent multi-year disclosures for ${label.toLowerCase()}.`,
    ],
  };
}

const deterministicRelationships: Partial<
  Record<
    EarningsQualityAreaKey,
    {
      primaryKey: string;
      primaryLabel: string;
      comparisonKey: string;
      comparisonLabel: string;
      calculation: EarningsQualityTrendPoint["calculation"];
    }
  >
> = {
  netIncomeVsOperatingCashFlow: {
    primaryKey: "operatingCashFlow",
    primaryLabel: "Operating cash flow",
    comparisonKey: "netIncome",
    comparisonLabel: "Net income",
    calculation: "ratio",
  },
  freeCashFlowVsReportedEarnings: {
    primaryKey: "freeCashFlow",
    primaryLabel: "Free cash flow",
    comparisonKey: "netIncome",
    comparisonLabel: "Net income",
    calculation: "ratio",
  },
  accountsReceivableVsRevenue: {
    primaryKey: "accountsReceivable",
    primaryLabel: "Accounts receivable",
    comparisonKey: "totalRevenue",
    comparisonLabel: "Revenue",
    calculation: "growth_spread",
  },
  inventoryVsRevenue: {
    primaryKey: "inventory",
    primaryLabel: "Inventory",
    comparisonKey: "totalRevenue",
    comparisonLabel: "Revenue",
    calculation: "growth_spread",
  },
  capitalExpenditures: {
    primaryKey: "capitalExpenditures",
    primaryLabel: "Capital expenditures",
    comparisonKey: "totalRevenue",
    comparisonLabel: "Revenue",
    calculation: "ratio",
  },
  goodwillAndIntangibleAssets: {
    primaryKey: "goodwillAndIntangibleAssets",
    primaryLabel: "Goodwill and intangible assets",
    comparisonKey: "stockholdersEquity",
    comparisonLabel: "Stockholders' equity",
    calculation: "ratio",
  },
  stockBasedCompensation: {
    primaryKey: "stockBasedCompensation",
    primaryLabel: "Stock-based compensation",
    comparisonKey: "totalRevenue",
    comparisonLabel: "Revenue",
    calculation: "ratio",
  },
  deferredRevenue: {
    primaryKey: "deferredRevenue",
    primaryLabel: "Deferred revenue",
    comparisonKey: "totalRevenue",
    comparisonLabel: "Revenue",
    calculation: "ratio",
  },
  deferredTaxes: {
    primaryKey: "netDeferredTaxes",
    primaryLabel: "Net deferred tax balance",
    comparisonKey: "stockholdersEquity",
    comparisonLabel: "Stockholders' equity",
    calculation: "ratio",
  },
  changesInWorkingCapital: {
    primaryKey: "changeInWorkingCapital",
    primaryLabel: "Change in working capital",
    comparisonKey: "operatingCashFlow",
    comparisonLabel: "Operating cash flow",
    calculation: "ratio",
  },
};

function calculateTrend(points: EarningsQualityTrendPoint[]) {
  const sorted = [...points].sort((a, b) => a.period.localeCompare(b.period));
  return sorted.map((point, index) => {
    let calculatedValue: number | null = null;
    if (point.primaryValue != null && point.comparisonValue != null) {
      if (point.calculation === "ratio" && point.comparisonValue !== 0) {
        calculatedValue = point.primaryValue / point.comparisonValue;
      } else if (point.calculation === "difference") {
        calculatedValue = point.primaryValue - point.comparisonValue;
      } else if (point.calculation === "growth_spread" && index > 0) {
        const previous = sorted[index - 1];
        if (
          previous.primaryValue != null &&
          previous.comparisonValue != null &&
          previous.primaryValue !== 0 &&
          previous.comparisonValue !== 0
        ) {
          const primaryGrowth = point.primaryValue / previous.primaryValue - 1;
          const comparisonGrowth = point.comparisonValue / previous.comparisonValue - 1;
          calculatedValue = primaryGrowth - comparisonGrowth;
        }
      }
    }
    return { ...point, calculatedValue: calculatedValue != null && Number.isFinite(calculatedValue) ? calculatedValue : null };
  });
}

function formulaFor(points: EarningsQualityTrendPoint[]) {
  const point = points[0];
  if (!point) return "Not calculable from available verified data.";
  if (point.calculation === "difference") return `${point.primaryLabel} - ${point.comparisonLabel}`;
  if (point.calculation === "growth_spread") {
    return `YoY growth in ${point.primaryLabel} - YoY growth in ${point.comparisonLabel}`;
  }
  return `${point.primaryLabel} / ${point.comparisonLabel}`;
}

function evaluateTrend(
  key: EarningsQualityAreaKey,
  points: EarningsQualityTrendPoint[],
  language: "en" | "es"
): EarningsQualityInvestigationFlag {
  const values = points.map((point) => point.calculatedValue).filter((value): value is number => value != null);
  const formula = formulaFor(points);
  const isEs = language === "es";
  if (values.length < 2) {
    return {
      status: "data_gap",
      formula,
      mathematicalExplanation: isEs
        ? "Se necesitan al menos dos periodos comparables para evaluar una divergencia."
        : "At least two comparable periods are required to assess a divergence.",
      whyInvestigate: isEs
        ? "Obtén valores consistentes y sus notas para periodos adicionales."
        : "Obtain consistent values and their notes for additional periods.",
    };
  }

  const latest = values.at(-1)!;
  const first = values[0];
  let status: EarningsQualityFlagStatus = "no_unusual_divergence";
  let trigger = "No screening threshold was crossed by the verified relationship.";

  if (key === "netIncomeVsOperatingCashFlow") {
    const lowPeriods = values.filter((value) => value < 0.8).length;
    status = lowPeriods >= 2 ? "investigate" : latest < 0.8 ? "watch" : "no_unusual_divergence";
    trigger = `${lowPeriods} of ${values.length} comparable periods had operating cash flow below 80% of net income; latest ratio ${latest.toFixed(2)}x.`;
  } else if (key === "freeCashFlowVsReportedEarnings") {
    const lowPeriods = values.filter((value) => value < 0.6).length;
    status = lowPeriods >= 2 ? "investigate" : latest < 0.6 ? "watch" : "no_unusual_divergence";
    trigger = `${lowPeriods} of ${values.length} comparable periods had free cash flow below 60% of net income; latest ratio ${latest.toFixed(2)}x.`;
  } else if (key === "accountsReceivableVsRevenue" || key === "inventoryVsRevenue") {
    const largeSpreads = values.filter((value) => value > 0.15).length;
    status = largeSpreads >= 2 || latest > 0.25 ? "investigate" : latest > 0.15 ? "watch" : "no_unusual_divergence";
    trigger = `${largeSpreads} period(s) had metric growth exceed revenue growth by more than 15 percentage points; latest spread ${(latest * 100).toFixed(1)} points.`;
  } else if (key === "stockBasedCompensation") {
    status = latest > 0.1 ? "investigate" : latest > 0.05 ? "watch" : "no_unusual_divergence";
    trigger = `Latest stock-based compensation equals ${(latest * 100).toFixed(1)}% of revenue.`;
  } else if (key === "shareDilution") {
    const materialPeriods = values.filter((value) => value > 1.02).length;
    const severePeriods = values.filter((value) => value > 1.05).length;
    status = severePeriods >= 1 || materialPeriods >= 2
      ? "investigate"
      : materialPeriods === 1
        ? "watch"
        : "no_unusual_divergence";
    trigger = `${materialPeriods} of ${values.length} comparable periods increased diluted average shares by more than 2%; the latest year-over-year ratio was ${latest.toFixed(3)}x (${((latest - 1) * 100).toFixed(1)}%).`;
  } else if (key === "goodwillAndIntangibleAssets") {
    status = latest > 2 ? "investigate" : latest > 1 ? "watch" : "no_unusual_divergence";
    trigger = `Latest goodwill and intangible assets equal ${latest.toFixed(2)}x stockholders' equity.`;
  } else if (key === "capitalExpenditures") {
    const relativeChange = first === 0 ? null : latest / first - 1;
    status = relativeChange != null && relativeChange > 0.5 && latest > 0.1 ? "watch" : "no_unusual_divergence";
    trigger = `Capital expenditures moved from ${(first * 100).toFixed(1)}% to ${(latest * 100).toFixed(1)}% of revenue.`;
  } else {
    const relativeChange = first === 0 ? null : Math.abs(latest / first - 1);
    status = relativeChange != null && relativeChange > 0.5 ? "watch" : "no_unusual_divergence";
    trigger = `The verified relationship changed from ${first.toFixed(2)} to ${latest.toFixed(2)} across the available periods.`;
  }

  return {
    status,
    formula,
    mathematicalExplanation: trigger,
    whyInvestigate:
      status === "investigate" || status === "watch"
        ? isEs
          ? "La divergencia requiere reconciliar definiciones, timing, adquisiciones, estacionalidad y notas contables antes de concluir."
          : "The divergence requires reconciliation of definitions, timing, acquisitions, seasonality, and accounting notes before drawing a conclusion."
        : isEs
          ? "La relación no cruzó el filtro matemático; todavía deben revisarse las notas y cambios de definición."
          : "The relationship did not cross the mathematical screen; notes and definition changes still require review.",
  };
}

function fallbackTrendPoints(
  key: EarningsQualityAreaKey,
  fundamentals: any[]
): EarningsQualityTrendPoint[] {
  if (key === "shareDilution") {
    const rows = fundamentals
      .filter((row) => finiteNumber(row?.dilutedAverageShares) != null)
      .sort((a, b) => Number(a.year) - Number(b.year));
    return calculateTrend(
      rows.slice(1).map((row, index) => {
        const previous = rows[index];
        const year = Number(row.year);
        return {
          period: String(year),
          primaryLabel: "Diluted average shares",
          primaryValue: finiteNumber(row.dilutedAverageShares),
          comparisonLabel: "Prior-year diluted average shares",
          comparisonValue: finiteNumber(previous?.dilutedAverageShares),
          calculation: "ratio" as const,
          calculatedValue: null,
          source: financialEvidence(`Diluted average shares reported for ${year}.`, year),
        };
      })
    );
  }

  const definition = deterministicRelationships[key];
  if (!definition) return [];
  const points = fundamentals
    .filter((row) => Number.isFinite(Number(row?.year)))
    .sort((a, b) => Number(a.year) - Number(b.year))
    .map((row): EarningsQualityTrendPoint | null => {
      let resolvedPrimary = finiteNumber(row?.[definition.primaryKey]);
      if (key === "goodwillAndIntangibleAssets" && resolvedPrimary == null) {
        return null;
      }
      if (key === "deferredTaxes" && resolvedPrimary == null) {
        const asset = finiteNumber(row?.deferredTaxAssets);
        const liability = finiteNumber(row?.deferredTaxLiabilities);
        if (asset != null && liability != null) resolvedPrimary = asset - liability;
      }
      const comparisonValue = finiteNumber(row?.[definition.comparisonKey]);
      if (resolvedPrimary == null || comparisonValue == null) return null;
      const year = Number(row.year);
      return {
        period: String(year),
        primaryLabel: definition.primaryLabel,
        primaryValue: key === "capitalExpenditures" ? Math.abs(resolvedPrimary) : resolvedPrimary,
        comparisonLabel: definition.comparisonLabel,
        comparisonValue,
        calculation: definition.calculation,
        calculatedValue: null,
        source: financialEvidence(
          `${definition.primaryLabel} and ${definition.comparisonLabel} reported for ${year}.`,
          year
        ),
      } satisfies EarningsQualityTrendPoint;
    })
    .filter((point: EarningsQualityTrendPoint | null): point is EarningsQualityTrendPoint => point !== null)
    .slice(-10);
  return calculateTrend(points);
}

export function buildEarningsQualityFallback(input: {
  ticker: string;
  companyName?: string | null;
  instrumentType?: string | null;
  annualFundamentals?: any[];
  uploadedFilings?: any[];
  language?: "en" | "es";
  generatedAt?: string;
}): EarningsQualityAccountingRiskAnalysis {
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
  const areas = EARNINGS_QUALITY_AREAS.map(({ key, label }) => {
    const area = placeholderArea(key, label, language);
    const points = fallbackTrendPoints(key, fundamentals);
    if (!points.length) return area;
    area.multiYearTrend = points;
    area.investigationFlag = evaluateTrend(key, points, language);
    area.documentedEvidence = points.map((point) => point.source);
    area.conclusion = isEs
      ? `Hay ${points.length} periodo(s) comparables para revisar ${label.toLowerCase()}; el resultado es un filtro de investigación, no una determinación de fraude.`
      : `${points.length} comparable period(s) are available for ${label.toLowerCase()}; the result is a research screen, not a fraud determination.`;
    return area;
  });

  return {
    schemaVersion: "1.0",
    ticker: cleanTicker(input.ticker),
    companyName: cleanText(input.companyName, cleanTicker(input.ticker) || "Company", 300),
    status: fundLike ? "not_applicable" : has10k && has10q ? "provisional" : "insufficient_information",
    analysisOrder: "earnings_quality_before_valuation",
    priceDataExcluded: true,
    generatedAt: cleanText(input.generatedAt, new Date().toISOString(), 40),
    generatedBy: "deterministic_fallback",
    fraudDetermination: "not_made",
    statisticalAnomaliesAreNotFraudFindings: true,
    summary: isEs
      ? "Este expediente identifica relaciones contables que requieren revisión adicional; no determina fraude ni conducta indebida."
      : "This dossier identifies accounting relationships requiring further review; it does not determine fraud or misconduct.",
    areas,
    prioritizedInvestigationQuestions: [
      isEs
        ? "¿Qué reconciliaciones y notas explican las divergencias multianuales más materiales?"
        : "Which reconciliations and footnotes explain the most material multi-year divergences?",
      isEs
        ? "¿Cambió alguna definición, estimado, política contable o perímetro de consolidación entre periodos?"
        : "Did any definition, estimate, accounting policy, or consolidation scope change across periods?",
    ],
  };
}

function normalizeCalculation(value: unknown): EarningsQualityTrendPoint["calculation"] {
  if (value === "difference" || value === "growth_spread") return value;
  return "ratio";
}

function normalizeTrendPoint(value: any): EarningsQualityTrendPoint | null {
  const period = cleanText(value?.period ?? value?.year, "", 40);
  const primaryLabel = cleanText(value?.primaryLabel, "", 200);
  const comparisonLabel = cleanText(value?.comparisonLabel, "", 200);
  if (!period || !primaryLabel || !comparisonLabel) return null;
  return {
    period,
    primaryLabel,
    primaryValue: finiteNumber(value?.primaryValue),
    comparisonLabel,
    comparisonValue: finiteNumber(value?.comparisonValue),
    calculation: normalizeCalculation(value?.calculation),
    calculatedValue: null,
    source: normalizeEvidence(value?.source, "The source for this trend point was not identified."),
  };
}

function normalizeFlag(value: any, fallback: EarningsQualityInvestigationFlag): EarningsQualityInvestigationFlag {
  const status = ["investigate", "watch", "no_unusual_divergence", "data_gap"].includes(value?.status)
    ? value.status as EarningsQualityFlagStatus
    : fallback.status;
  return {
    status,
    formula: cleanText(value?.formula, fallback.formula, 500),
    mathematicalExplanation: guardedText(
      value?.mathematicalExplanation,
      fallback.mathematicalExplanation,
      1_500
    ),
    whyInvestigate: guardedText(value?.whyInvestigate, fallback.whyInvestigate, 1_500),
  };
}

export function normalizeEarningsQualityAnalysis(input: {
  candidate: any;
  fallback: EarningsQualityAccountingRiskAnalysis;
}): EarningsQualityAccountingRiskAnalysis {
  const candidate = input.candidate && typeof input.candidate === "object" ? input.candidate : {};
  const candidateAreas = Array.isArray(candidate.areas) ? candidate.areas : [];
  const byIdentity = new Map<string, any>();
  candidateAreas.forEach((area: any) => {
    [identity(area?.key), identity(area?.label)].filter(Boolean).forEach((key) => byIdentity.set(key, area));
  });
  const recognizedCount = EARNINGS_QUALITY_AREAS.filter(
    ({ key, label }) => byIdentity.has(identity(key)) || byIdentity.has(identity(label))
  ).length;
  const generatedBy = recognizedCount === EARNINGS_QUALITY_AREAS.length ? "ai_research" : "deterministic_fallback";
  const areas = EARNINGS_QUALITY_AREAS.map(({ key, label }, index) => {
    const fallbackArea = input.fallback.areas[index] ?? placeholderArea(key, label, "en");
    const source = byIdentity.get(identity(key)) ?? byIdentity.get(identity(label));
    if (!source) return fallbackArea;
    const candidatePoints = (Array.isArray(source.multiYearTrend) ? source.multiYearTrend : [])
      .map((value: any): EarningsQualityTrendPoint | null => normalizeTrendPoint(value))
      .filter((value: EarningsQualityTrendPoint | null): value is EarningsQualityTrendPoint => value !== null);
    const pointMap = new Map<string, EarningsQualityTrendPoint>();
    [...fallbackArea.multiYearTrend, ...candidatePoints].forEach((point) => {
      const pointKey = `${point.period}|${identity(point.primaryLabel)}|${identity(point.comparisonLabel)}|${point.calculation}`;
      if (!pointMap.has(pointKey) || point.source.sourceType === "financial_statement") pointMap.set(pointKey, point);
    });
    const multiYearTrend = calculateTrend(Array.from(pointMap.values()).slice(-12));
    const documentedEvidence = (Array.isArray(source.documentedEvidence) ? source.documentedEvidence : [])
      .map((row: any) => normalizeEvidence(row, `Evidence for ${label.toLowerCase()} was not identified.`))
      .slice(0, 16);
    const mitigatingEvidence = (Array.isArray(source.mitigatingEvidence) ? source.mitigatingEvidence : [])
      .map((row: any) => normalizeEvidence(row, `Mitigating evidence for ${label.toLowerCase()} was not identified.`))
      .slice(0, 12);
    const deterministicFlag = multiYearTrend.length
      ? evaluateTrend(key, multiYearTrend, "en")
      : fallbackArea.investigationFlag;
    return {
      key,
      label,
      conclusion: guardedText(source.conclusion, fallbackArea.conclusion, 2_000),
      documentedEvidence: documentedEvidence.length ? documentedEvidence : fallbackArea.documentedEvidence,
      mitigatingEvidence: mitigatingEvidence.length ? mitigatingEvidence : fallbackArea.mitigatingEvidence,
      multiYearTrend,
      investigationFlag: normalizeFlag(source.investigationFlag, deterministicFlag),
      uncertainty: cleanList(source.uncertainty, fallbackArea.uncertainty[0]),
      additionalInformation: cleanList(source.additionalInformation, fallbackArea.additionalInformation[0]),
    } satisfies EarningsQualityArea;
  });
  const requestedStatus = cleanText(candidate.status).toLowerCase();

  return {
    schemaVersion: "1.0",
    ticker: input.fallback.ticker,
    companyName: cleanText(candidate.companyName, input.fallback.companyName, 300),
    status:
      input.fallback.status === "not_applicable"
        ? "not_applicable"
        : input.fallback.status === "insufficient_information"
          ? "insufficient_information"
          : generatedBy === "ai_research" && ["complete", "provisional", "insufficient_information"].includes(requestedStatus)
            ? requestedStatus as EarningsQualityStatus
            : input.fallback.status,
    analysisOrder: "earnings_quality_before_valuation",
    priceDataExcluded: true,
    generatedAt: input.fallback.generatedAt,
    generatedBy,
    fraudDetermination: "not_made",
    statisticalAnomaliesAreNotFraudFindings: true,
    summary: guardedText(candidate.summary, input.fallback.summary, 2_000),
    areas,
    prioritizedInvestigationQuestions: cleanList(
      candidate.prioritizedInvestigationQuestions,
      input.fallback.prioritizedInvestigationQuestions[0],
      16
    ),
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

export function constrainEarningsQualitySources(input: {
  analysis: EarningsQualityAccountingRiskAnalysis;
  uploadedFilings?: any[];
  annualFundamentals?: any[];
  webSources?: Array<{ url: string; title?: string | null }>;
}): EarningsQualityAccountingRiskAnalysis {
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
  const verifyEvidence = (evidence: EarningsQualityEvidence): EarningsQualityEvidence => {
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
          return formMatches && (!sourceYear || sourceYear === filingYear);
        });
      if (filing) {
        const fiscalYear = Number(filing?.fiscalYear);
        return {
          ...evidence,
          sourceLabel: cleanText(filing?.fileName, `${cleanTicker(filing?.ticker)} ${filing?.form}`.trim(), 300),
          sourceDate: cleanDate(filing?.periodEnd) ?? (Number.isFinite(fiscalYear) ? `${fiscalYear}-12-31` : evidence.sourceDate),
          sourceUrl: null,
        };
      }
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

  const areas = input.analysis.areas.map((area) => {
    const documentedEvidence = area.documentedEvidence.map(verifyEvidence);
    const mitigatingEvidence = area.mitigatingEvidence.map(verifyEvidence);
    const multiYearTrend = calculateTrend(
      area.multiYearTrend.map((point) => {
        const source = verifyEvidence(point.source);
        return {
          ...point,
          source,
          primaryValue: source.status === "identified" ? point.primaryValue : null,
          comparisonValue: source.status === "identified" ? point.comparisonValue : null,
          calculatedValue: null,
        };
      })
    );
    const verifiedCalculations = multiYearTrend.filter((point) => point.calculatedValue != null);
    const verifiedNarrative = [...documentedEvidence, ...mitigatingEvidence].some(
      (evidence) => evidence.status === "identified"
    );
    const deterministicFlag = verifiedCalculations.length
      ? evaluateTrend(area.key, multiYearTrend, "en")
      : null;
    const investigationFlag = deterministicFlag ?? (
      verifiedNarrative
        ? area.investigationFlag
        : {
            status: "data_gap" as const,
            formula: area.investigationFlag.formula,
            mathematicalExplanation: "The claimed relationship could not be recomputed from verified source-linked values.",
            whyInvestigate: "Obtain source-linked values and consistent periods before interpreting the relationship.",
          }
    );
    return { ...area, documentedEvidence, mitigatingEvidence, multiYearTrend, investigationFlag };
  });
  const identifiedAreaCount = areas.filter((area) =>
    [...area.documentedEvidence, ...area.mitigatingEvidence].some((evidence) => evidence.status === "identified") ||
    area.multiYearTrend.some((point) => point.calculatedValue != null)
  ).length;
  const status = input.analysis.status === "not_applicable"
    ? "not_applicable"
    : identifiedAreaCount === 0
      ? "insufficient_information"
      : input.analysis.status === "complete" && identifiedAreaCount < 10
        ? "provisional"
        : input.analysis.status;

  return { ...input.analysis, status, areas };
}
