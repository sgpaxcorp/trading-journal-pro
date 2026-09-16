import { DATA_NOT_AVAILABLE, financialNumberOrNull } from "@/lib/neuroFinancialDataIntegrity";

export const COMMITTEE_CLAIM_CLASSIFICATIONS = [
  "FACT",
  "CALCULATION",
  "ASSUMPTION",
  "ESTIMATE",
  "AI_INTERPRETATION",
  "USER_DECISION",
] as const;

export type CommitteeClaimClassification = (typeof COMMITTEE_CLAIM_CLASSIFICATIONS)[number];

export const COMMITTEE_DECISIONS = [
  "APPROVED",
  "REJECTED",
  "WATCHLIST",
  "NEEDS_MORE_RESEARCH",
] as const;

export type CommitteeDecision = (typeof COMMITTEE_DECISIONS)[number];

export const COMMITTEE_SECTION_KEYS = [
  "executiveSummary",
  "investmentThesis",
  "currentMarketPrice",
  "intrinsicValueRange",
  "expectedReturnAssumptions",
  "downsideScenario",
  "keyFinancialMetrics",
  "balanceSheetAnalysis",
  "competitivePosition",
  "catalysts",
  "principalRisks",
  "contradictingEvidence",
  "portfolioImpact",
  "positionSizeProposal",
  "invalidationConditions",
] as const;

export type CommitteeSectionKey = (typeof COMMITTEE_SECTION_KEYS)[number];

export type CommitteeClaim = {
  classification: CommitteeClaimClassification;
  text: string;
  sourceIds: string[];
  asOfDate: string;
};

export type CommitteeSource = {
  id: string;
  title: string;
  sourceType:
    | "research_report"
    | "business_quality_analysis"
    | "management_capital_allocation_analysis"
    | "earnings_quality_accounting_risk_analysis"
    | "independent_bear_case_analysis"
    | "company_filing"
    | "market_data"
    | "valuation_model"
    | "investment_policy"
    | "public_source"
    | "user_input";
  documentDate: string | null;
  accessedAt: string;
  url: string | null;
};

export type InvestmentCommitteePacket = {
  schemaVersion: "1.0";
  ticker: string;
  generatedAt: string;
  executiveSummary: CommitteeClaim[];
  investmentThesis: CommitteeClaim[];
  currentMarketPrice: CommitteeClaim[];
  intrinsicValueRange: CommitteeClaim[];
  expectedReturnAssumptions: CommitteeClaim[];
  downsideScenario: CommitteeClaim[];
  keyFinancialMetrics: CommitteeClaim[];
  balanceSheetAnalysis: CommitteeClaim[];
  competitivePosition: CommitteeClaim[];
  catalysts: CommitteeClaim[];
  principalRisks: CommitteeClaim[];
  contradictingEvidence: CommitteeClaim[];
  portfolioImpact: CommitteeClaim[];
  positionSizeProposal: CommitteeClaim[];
  invalidationConditions: CommitteeClaim[];
  completeness: {
    isComplete: boolean;
    missingSections: CommitteeSectionKey[];
    uncitedClaimCount: number;
  };
};

function cleanText(value: unknown, fallback = "", maxLength = 4_000) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanTicker(value: unknown) {
  return cleanText(value, "", 12)
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function finiteNumber(value: unknown): number | null {
  return financialNumberOrNull(value);
}

function isoDate(value: unknown, fallback: string) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function currency(value: number | null) {
  if (value == null) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 0 : 2,
  }).format(value);
}

function percent(value: number | null) {
  if (value == null) return DATA_NOT_AVAILABLE;
  return `${(value * 100).toFixed(1)}%`;
}

function marketItemForTicker(marketData: any, ticker: string) {
  if (!marketData) return null;
  if (marketData.items && typeof marketData.items === "object") {
    return marketData.items[ticker] ?? marketData.items[ticker.toUpperCase()] ?? null;
  }
  return cleanTicker(marketData.ticker) === ticker ? marketData : null;
}

function positionForTicker(engine: any, ticker: string) {
  const positions = Array.isArray(engine?.positions) ? engine.positions : [];
  return positions.find((position: any) => cleanTicker(position?.ticker) === ticker) ?? positions[0] ?? null;
}

function sourceId(value: unknown, fallback: string) {
  return cleanText(value, fallback, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
}

export function buildCommitteeSourceManifest(input: {
  ticker: string;
  report: any;
  policy?: any;
  generatedAt?: string;
}): CommitteeSource[] {
  const generatedAt = isoDate(input.generatedAt, new Date().toISOString());
  const reportDate = isoDate(input.report?.created_at, generatedAt);
  const sources: CommitteeSource[] = [
    {
      id: "research_report",
      title: `${cleanTicker(input.ticker)} Neuro Analysis research report`,
      sourceType: "research_report",
      documentDate: reportDate,
      accessedAt: generatedAt,
      url: null,
    },
    {
      id: "market_data_snapshot",
      title: `${cleanTicker(input.ticker)} frozen market-data snapshot`,
      sourceType: "market_data",
      documentDate: reportDate,
      accessedAt: generatedAt,
      url: null,
    },
    {
      id: "valuation_model",
      title: `${cleanTicker(input.ticker)} deterministic valuation model`,
      sourceType: "valuation_model",
      documentDate: reportDate,
      accessedAt: generatedAt,
      url: null,
    },
  ];

  if (input.report?.structured?.businessQualityAnalysis) {
    sources.push({
      id: "business_quality_analysis",
      title: `${cleanTicker(input.ticker)} price-blind Business Quality Analysis`,
      sourceType: "business_quality_analysis",
      documentDate: isoDate(input.report.structured.businessQualityAnalysis.generatedAt, reportDate),
      accessedAt: generatedAt,
      url: null,
    });
  }

  if (input.report?.structured?.managementCapitalAllocationAnalysis) {
    sources.push({
      id: "management_capital_allocation_analysis",
      title: `${cleanTicker(input.ticker)} documented Management and Capital Allocation Analysis`,
      sourceType: "management_capital_allocation_analysis",
      documentDate: isoDate(input.report.structured.managementCapitalAllocationAnalysis.generatedAt, reportDate),
      accessedAt: generatedAt,
      url: null,
    });
  }

  if (input.report?.structured?.earningsQualityAccountingRiskAnalysis) {
    sources.push({
      id: "earnings_quality_accounting_risk_analysis",
      title: `${cleanTicker(input.ticker)} Earnings Quality and Accounting Risk Analysis`,
      sourceType: "earnings_quality_accounting_risk_analysis",
      documentDate: isoDate(input.report.structured.earningsQualityAccountingRiskAnalysis.generatedAt, reportDate),
      accessedAt: generatedAt,
      url: null,
    });
  }

  if (input.report?.structured?.independentBearCaseAnalysis) {
    sources.push({
      id: "independent_bear_case_analysis",
      title: `${cleanTicker(input.ticker)} independent Bear Case Analysis`,
      sourceType: "independent_bear_case_analysis",
      documentDate: isoDate(input.report.structured.independentBearCaseAnalysis.generatedAt, reportDate),
      accessedAt: generatedAt,
      url: null,
    });
  }

  if (input.policy) {
    sources.push({
      id: "investment_policy",
      title: `Investment policy v${Number(input.policy.version ?? 0) || "draft"}`,
      sourceType: "investment_policy",
      documentDate: isoDate(input.policy.approvedAt ?? input.policy.approved_at ?? input.policy.createdAt ?? input.policy.created_at, reportDate),
      accessedAt: generatedAt,
      url: null,
    });
  }

  const filings = Array.isArray(input.report?.filings_used) ? input.report.filings_used : [];
  filings.forEach((filing: any, index: number) => {
    const form = filing?.form === "10-Q" ? "10-Q" : "10-K";
    const date = cleanText(filing?.periodEnd ?? filing?.period_end, "", 32);
    const fiscalYear = Number(filing?.fiscalYear ?? filing?.fiscal_year);
    sources.push({
      id: `filing_${index + 1}`,
      title: cleanText(
        `${cleanTicker(filing?.ticker || input.ticker)} ${form} ${date || (Number.isFinite(fiscalYear) ? fiscalYear : "")} ${filing?.fileName ?? filing?.file_name ?? ""}`,
        `${form} company filing`,
        300
      ),
      sourceType: "company_filing",
      documentDate: date ? isoDate(date, reportDate) : Number.isFinite(fiscalYear) ? `${fiscalYear}-12-31T00:00:00.000Z` : reportDate,
      accessedAt: generatedAt,
      url: null,
    });
  });

  const publicSources = Array.isArray(input.report?.structured?.webSources)
    ? input.report.structured.webSources
    : [];
  publicSources.slice(0, 12).forEach((source: any, index: number) => {
    sources.push({
      id: `public_${index + 1}`,
      title: cleanText(source?.title ?? source?.url, "Public research source", 300),
      sourceType: "public_source",
      documentDate: source?.publishedAt ? isoDate(source.publishedAt, reportDate) : null,
      accessedAt: reportDate,
      url: /^https?:\/\//i.test(String(source?.url ?? "")) ? String(source.url).slice(0, 2_000) : null,
    });
  });

  const seen = new Set<string>();
  return sources.filter((source) => {
    source.id = sourceId(source.id, "source");
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

function fallbackClaim(
  classification: CommitteeClaimClassification,
  text: string,
  sourceIds: string[],
  asOfDate: string
): CommitteeClaim {
  return { classification, text, sourceIds, asOfDate };
}

export function buildCommitteePacketFallback(input: {
  ticker: string;
  report: any;
  policy?: any;
  sources: CommitteeSource[];
  generatedAt?: string;
}): InvestmentCommitteePacket {
  const generatedAt = isoDate(input.generatedAt, new Date().toISOString());
  const ticker = cleanTicker(input.ticker || input.report?.focus_ticker);
  const engine = input.report?.engine ?? input.report?.structured?.engine ?? {};
  const position = positionForTicker(engine, ticker);
  const capitalAllocationDashboard = input.report?.structured?.capitalAllocationDashboard ?? null;
  const capitalAlternative = Array.isArray(capitalAllocationDashboard?.alternatives)
    ? capitalAllocationDashboard.alternatives.find((row: any) => cleanTicker(row?.ticker) === ticker)
    : null;
  const marketData = input.report?.market_data_snapshot ?? {};
  const marketItem = marketItemForTicker(marketData, ticker);
  const fundamentals = position?.latestFundamentals ?? marketItem?.annualFundamentals?.[0] ?? {};
  const reportText = cleanText(input.report?.report_text, "Research report is not available.", 1_000);
  const price = finiteNumber(position?.currentPrice ?? marketItem?.market?.regularMarketPrice ?? marketItem?.market?.previousClose);
  const marketCap = finiteNumber(position?.marketCap ?? marketItem?.market?.marketCap);
  const impliedShares = price && marketCap ? marketCap / price : null;
  const scenarios = position?.valuationProfile?.selectedHorizonScenarios ?? position?.scenarios ?? {};
  const bearEquity = finiteNumber(scenarios?.bear?.intrinsicEquityValue);
  const baseEquity = finiteNumber(scenarios?.base?.intrinsicEquityValue);
  const bullEquity = finiteNumber(scenarios?.bull?.intrinsicEquityValue);
  const bearPerShare = impliedShares && bearEquity != null ? bearEquity / impliedShares : null;
  const basePerShare = impliedShares && baseEquity != null ? baseEquity / impliedShares : null;
  const bullPerShare = impliedShares && bullEquity != null ? bullEquity / impliedShares : null;
  const baseUpside = finiteNumber(scenarios?.base?.upsideToMarket);
  const bearUpside = finiteNumber(scenarios?.bear?.upsideToMarket);
  const horizonYears = finiteNumber(engine?.assumptions?.horizonYears);
  const annualizedBaseReturn = baseUpside != null && baseUpside > -1 && horizonYears != null && horizonYears > 0
    ? Math.pow(1 + baseUpside, 1 / Math.max(1, horizonYears)) - 1
    : null;
  const reverseDcf = position?.reverseDcf ?? null;
  const reverseScenarios = Array.isArray(reverseDcf?.impliedScenarios)
    ? reverseDcf.impliedScenarios.filter((scenario: any) => scenario?.solutionStatus === "solved")
    : [];
  const reverseGrowthValues = reverseScenarios
    .map((scenario: any) => finiteNumber(scenario?.revenueGrowthPct))
    .filter((value: number | null): value is number => value != null);
  const reverseMarginValues = reverseScenarios
    .map((scenario: any) => finiteNumber(scenario?.targetOperatingMarginPct))
    .filter((value: number | null): value is number => value != null);
  const maxPositionPct = finiteNumber(input.policy?.limits?.maxPositionPct);
  const proposedWeight = maxPositionPct;
  const latestPeriod = fundamentals?.year ? String(fundamentals.year) : generatedAt.slice(0, 10);
  const filingSourceIds = input.sources.filter((source) => source.sourceType === "company_filing").map((source) => source.id);
  const evidenceSources = filingSourceIds.length ? filingSourceIds : ["research_report"];
  const businessQualitySources = input.sources.some((source) => source.id === "business_quality_analysis")
    ? ["business_quality_analysis", ...evidenceSources]
    : evidenceSources;
  const managementAllocationSources = input.sources.some(
    (source) => source.id === "management_capital_allocation_analysis"
  )
    ? ["management_capital_allocation_analysis", ...evidenceSources]
    : evidenceSources;
  const earningsQualitySources = input.sources.some(
    (source) => source.id === "earnings_quality_accounting_risk_analysis"
  )
    ? ["earnings_quality_accounting_risk_analysis", ...evidenceSources]
    : evidenceSources;
  const bearCase = input.report?.structured?.independentBearCaseAnalysis ?? null;
  const bearCaseSources = input.sources.some((source) => source.id === "independent_bear_case_analysis")
    ? ["independent_bear_case_analysis", ...evidenceSources]
    : evidenceSources;
  const qualitativeSources = Array.from(
    new Set([...businessQualitySources, ...managementAllocationSources, ...earningsQualitySources, ...bearCaseSources])
  );
  const modelSources = ["valuation_model", "market_data_snapshot"];

  const packet: InvestmentCommitteePacket = {
    schemaVersion: "1.0",
    ticker,
    generatedAt,
    executiveSummary: [fallbackClaim("AI_INTERPRETATION", reportText, ["research_report"], generatedAt)],
    investmentThesis: [
      fallbackClaim(
        "AI_INTERPRETATION",
        `The working thesis for ${ticker} must be evaluated against business quality, durable cash generation, valuation discipline, and the active investment policy.`,
        ["research_report", ...qualitativeSources, ...(input.policy ? ["investment_policy"] : [])],
        generatedAt
      ),
    ],
    currentMarketPrice: [
      fallbackClaim("FACT", `${ticker} market price in the frozen research snapshot: ${currency(price)}.`, ["market_data_snapshot"], generatedAt),
    ],
    intrinsicValueRange: [
      fallbackClaim(
        "CALCULATION",
        bearPerShare != null || basePerShare != null || bullPerShare != null
          ? `Estimated per-share range: bear ${currency(bearPerShare)}, base ${currency(basePerShare)}, bull ${currency(bullPerShare)}.`
          : `Estimated equity-value range: bear ${currency(bearEquity)}, base ${currency(baseEquity)}, bull ${currency(bullEquity)}. A reliable per-share range requires a verified diluted share count.`,
        modelSources,
        generatedAt
      ),
    ],
    expectedReturnAssumptions: [
      fallbackClaim(
        "ASSUMPTION",
        `Valuation horizon ${horizonYears ?? DATA_NOT_AVAILABLE} years; discount rate ${finiteNumber(engine?.assumptions?.discountRatePct) ?? DATA_NOT_AVAILABLE}%; terminal growth ${finiteNumber(engine?.assumptions?.terminalGrowthPct) ?? DATA_NOT_AVAILABLE}%.`,
        ["valuation_model"],
        generatedAt
      ),
      fallbackClaim(
        "CALCULATION",
        `Base modeled upside is ${percent(baseUpside)}, equivalent to approximately ${percent(annualizedBaseReturn)} annualized over the selected horizon.`,
        modelSources,
        generatedAt
      ),
      fallbackClaim(
        "CALCULATION",
        reverseScenarios.length
          ? "Reverse DCF produced " +
              reverseScenarios.length +
              " solved market-implied combinations. Revenue growth ranges from " +
              Math.min(...reverseGrowthValues).toFixed(1) +
              "% to " +
              Math.max(...reverseGrowthValues).toFixed(1) +
              "%, paired with target operating margins from " +
              Math.min(...reverseMarginValues).toFixed(1) +
              "% to " +
              Math.max(...reverseMarginValues).toFixed(1) +
              "%. These are combinations, not forecasts or recommendations."
          : "Reverse DCF combinations were unavailable or outside the modeled range; the committee should not infer market expectations from a single forward scenario.",
        ["valuation_model"],
        generatedAt
      ),
    ],
    downsideScenario: [
      fallbackClaim("CALCULATION", `Bear-case modeled upside/downside versus the current market capitalization is ${percent(bearUpside)}.`, modelSources, generatedAt),
    ],
    keyFinancialMetrics: [
      fallbackClaim(
        "FACT",
        `Latest available period ${latestPeriod}: revenue ${currency(finiteNumber(fundamentals?.totalRevenue))}; operating income ${currency(finiteNumber(fundamentals?.operatingIncome))}; net income ${currency(finiteNumber(fundamentals?.netIncome))}; free cash flow ${currency(finiteNumber(fundamentals?.freeCashFlow))}.`,
        Array.from(new Set([...evidenceSources, ...earningsQualitySources])),
        generatedAt
      ),
    ],
    balanceSheetAnalysis: [
      fallbackClaim(
        "FACT",
        `Latest available total debt is ${currency(finiteNumber(fundamentals?.totalDebt))}; stockholders' equity is ${currency(finiteNumber(fundamentals?.stockholdersEquity))}; debt-to-equity is ${percent(finiteNumber(fundamentals?.debtToEquity))}.`,
        Array.from(new Set([...evidenceSources, ...earningsQualitySources])),
        generatedAt
      ),
    ],
    competitivePosition: [
      fallbackClaim("AI_INTERPRETATION", "Competitive durability, pricing power, customer concentration, and substitutes require committee review of the price-blind Business Quality Analysis and its cited evidence.", ["research_report", ...businessQualitySources], generatedAt),
    ],
    catalysts: [
      fallbackClaim("AI_INTERPRETATION", "Potential catalysts must be supported by the report evidence and monitored as thesis variables, not treated as guaranteed outcomes.", ["research_report"], generatedAt),
    ],
    principalRisks: [
      fallbackClaim(
        "AI_INTERPRETATION",
        cleanText(
          bearCase?.strongestBearArgument,
          "No sufficiently supported independent bear argument was established from the frozen evidence set.",
          1_500
        ),
        ["research_report", ...bearCaseSources],
        generatedAt
      ),
    ],
    contradictingEvidence: [
      fallbackClaim(
        "AI_INTERPRETATION",
        bearCase
          ? `The independent Bear Case must be reviewed alongside its contradictory evidence. Confirmation conditions: ${(bearCase.confirmationConditions ?? []).slice(0, 3).join("; ") || "not established"}. Invalidation conditions: ${(bearCase.invalidationConditions ?? []).slice(0, 3).join("; ") || "not established"}.`
          : "Independent contradictory evidence has not been completed; absence of identified contrary evidence is not evidence that none exists.",
        ["research_report", ...bearCaseSources],
        generatedAt
      ),
    ],
    portfolioImpact: [
      fallbackClaim(
        "CALCULATION",
        capitalAlternative
          ? `Current capital weight is ${percent(finiteNumber(capitalAlternative?.currentAllocation?.weightPct) == null ? null : finiteNumber(capitalAlternative?.currentAllocation?.weightPct)! / 100)}. If all ${currency(finiteNumber(capitalAllocationDashboard?.availableCapital))} of available capital were assigned to this alternative, the mathematical weight would be ${percent(finiteNumber(capitalAlternative?.existingConcentration?.hypotheticalWeightIfAllAvailableCapitalAllocatedPct) == null ? null : finiteNumber(capitalAlternative?.existingConcentration?.hypotheticalWeightIfAllAvailableCapitalAllocatedPct)! / 100)}. This is not a proposed allocation; cash remains a valid portfolio state.`
          : `Current research-portfolio weight is ${percent(finiteNumber(position?.weight))}. A comparable available-capital scenario is not present in the frozen report; cash remains a valid portfolio state.`,
        ["research_report", ...(input.policy ? ["investment_policy"] : [])],
        generatedAt
      ),
    ],
    positionSizeProposal: [
      fallbackClaim(
        "ESTIMATE",
        proposedWeight == null
          ? "No position size is proposed until the committee has an active policy limit and sufficient portfolio context. Cash may remain unallocated."
          : `The active policy ceiling is ${proposedWeight.toFixed(1)}% of portfolio capital. This is a limit, not a target or instruction to deploy cash; any proposal remains subject to committee approval.`,
        ["valuation_model", ...(input.policy ? ["investment_policy"] : [])],
        generatedAt
      ),
    ],
    invalidationConditions: [
      fallbackClaim("AI_INTERPRETATION", "Invalidate or re-underwrite the thesis when a required business-quality condition fails or its cash-flow, balance-sheet, competitive, documented capital-allocation, governance, or valuation premises materially deteriorate.", ["research_report", ...qualitativeSources], generatedAt),
    ],
    completeness: { isComplete: false, missingSections: [], uncitedClaimCount: 0 },
  };

  return withPacketCompleteness(packet);
}

function cleanClassification(value: unknown): CommitteeClaimClassification {
  const classification = cleanText(value, "AI_INTERPRETATION", 40).toUpperCase() as CommitteeClaimClassification;
  if (!COMMITTEE_CLAIM_CLASSIFICATIONS.includes(classification)) return "AI_INTERPRETATION";
  // The packet generator is not a human decision maker.
  return classification === "USER_DECISION" ? "AI_INTERPRETATION" : classification;
}

function normalizeClaim(input: any, fallback: CommitteeClaim, validSourceIds: Set<string>, generatedAt: string): CommitteeClaim {
  const rawSourceIds = Array.isArray(input?.sourceIds) ? input.sourceIds : [];
  const normalizedSourceIds: string[] = Array.from(
    new Set<string>(rawSourceIds.map((id: unknown): string => sourceId(id, "")).filter((id: string) => validSourceIds.has(id)))
  );
  return {
    classification: cleanClassification(input?.classification ?? fallback.classification),
    text: cleanText(input?.text, fallback.text, 4_000),
    sourceIds: normalizedSourceIds.length ? normalizedSourceIds : fallback.sourceIds,
    asOfDate: isoDate(input?.asOfDate, fallback.asOfDate || generatedAt),
  };
}

export function normalizeInvestmentCommitteePacket(input: {
  candidate: any;
  fallback: InvestmentCommitteePacket;
  sources: CommitteeSource[];
}): InvestmentCommitteePacket {
  const validSourceIds = new Set(input.sources.map((source) => source.id));
  const generatedAt = input.fallback.generatedAt;
  const normalized: any = {
    schemaVersion: "1.0",
    ticker: input.fallback.ticker,
    generatedAt,
  };

  for (const section of COMMITTEE_SECTION_KEYS) {
    const candidateClaims = Array.isArray(input.candidate?.[section]) ? input.candidate[section] : [];
    const fallbackClaims = input.fallback[section];
    const claims = candidateClaims.length ? candidateClaims : fallbackClaims;
    normalized[section] = claims.slice(0, 12).map((claim: any, index: number) =>
      normalizeClaim(claim, fallbackClaims[Math.min(index, fallbackClaims.length - 1)], validSourceIds, generatedAt)
    );
  }

  return withPacketCompleteness(normalized as InvestmentCommitteePacket);
}

export function withPacketCompleteness(packet: InvestmentCommitteePacket): InvestmentCommitteePacket {
  const missingSections = COMMITTEE_SECTION_KEYS.filter((section) => !Array.isArray(packet[section]) || packet[section].length === 0);
  let uncitedClaimCount = 0;
  for (const section of COMMITTEE_SECTION_KEYS) {
    for (const claim of packet[section] ?? []) {
      if (!claim.sourceIds?.length || !claim.asOfDate) uncitedClaimCount += 1;
    }
  }
  return {
    ...packet,
    completeness: {
      isComplete: missingSections.length === 0 && uncitedClaimCount === 0,
      missingSections,
      uncitedClaimCount,
    },
  };
}

export function isCommitteeDecision(value: unknown): value is CommitteeDecision {
  return COMMITTEE_DECISIONS.includes(String(value ?? "").trim().toUpperCase() as CommitteeDecision);
}
