import { financialNumberOrFallback } from "@/lib/neuroFinancialDataIntegrity";
import {
  buildMasterInvestmentSystemDisposition,
  type MasterInvestmentSystemDisposition,
} from "@/lib/neuroMasterInvestmentPrinciple";

export type NeuroDecisionState =
  | "investigate"
  | "observe"
  | "propose"
  | "reject"
  | "insufficient_information";

export const NEURO_DECISION_STATES: NeuroDecisionState[] = [
  "investigate",
  "observe",
  "propose",
  "reject",
  "insufficient_information",
];

export type NeuroInvestmentPolicyStatus = "draft" | "active" | "retired";

export type NeuroInvestmentPolicy = {
  id?: string | null;
  version?: number | null;
  status: NeuroInvestmentPolicyStatus;
  universe: string;
  strategy: string;
  horizonYears: number | null;
  baseCurrency: string;
  benchmark: string;
  restrictions: string[];
  liquidityNeeds: string;
  limits: {
    maxPositionPct: number | null;
    maxSectorPct: number | null;
    minCashPct: number | null;
    allowedInstruments: string[];
  };
  approvedAt?: string | null;
  createdAt?: string | null;
};

export type NeuroDecisionSupport = {
  focusTicker: string;
  suggestedState: NeuroDecisionState;
  policyStatus: "active" | "draft" | "missing" | "incomplete";
  committeeReviewEligible: boolean;
  capitalActionAllowed: boolean;
  systemDisposition: MasterInvestmentSystemDisposition;
  evidenceCompleteness: "sufficient" | "partial" | "insufficient";
  rationale: string[];
  missingRequirements: string[];
  blockingReasons: string[];
  evidence: {
    businessQualityReady: boolean;
    businessQualityStatus: string;
    managementAllocationReady: boolean;
    managementAllocationStatus: string;
    earningsQualityReady: boolean;
    earningsQualityStatus: string;
    independentBearCaseReady: boolean;
    independentBearCaseStatus: string;
    marketDataReady: boolean;
    documentsReady: boolean;
    privateMethodologyReady: boolean;
    documentModel: string;
    missingDocuments: string[];
    filingsIndexed: number;
    vectorStoreCount: number;
  };
  valuation: {
    status: string;
    marginOfSafety: number | null;
    baseFairValue: number | null;
    currentMarketCap: number | null;
  };
  scorecard: {
    financialEvidence: number;
    businessQuality?: number;
    valuationDiscipline: number;
    evidenceIntegrity: number;
    financialDurability: number;
    portfolioFit: number;
    marketContext: number;
    overall: number;
  };
  policyChecks: Array<{
    key: string;
    status: "pass" | "fail" | "unknown";
    message: string;
  }>;
};

export function starterNeuroInvestmentPolicy(): NeuroInvestmentPolicy {
  return {
    status: "draft",
    universe: "Liquid public stocks and ETFs",
    strategy: "Long-term owner-quality fundamental research with valuation discipline, dividend durability, and margin of safety.",
    horizonYears: 10,
    baseCurrency: "USD",
    benchmark: "SPY",
    restrictions: ["No margin", "No derivatives", "No short selling", "No automatic trade execution"],
    liquidityNeeds: "Only research capital that is not needed for near-term obligations.",
    limits: {
      maxPositionPct: 20,
      maxSectorPct: 35,
      minCashPct: 0,
      allowedInstruments: ["common_stock", "etf"],
    },
    approvedAt: null,
  };
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function cleanStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean).slice(0, 40);
  }
  return String(value ?? "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function finiteNumber(value: unknown, fallback: number | null = null) {
  return financialNumberOrFallback(value, fallback);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pctToScore(value: number | null, neutral = 50, multiplier = 140) {
  if (value == null || !Number.isFinite(value)) return neutral;
  return clamp(Math.round(neutral + value * multiplier), 0, 100);
}

export function normalizeNeuroInvestmentPolicy(source: any): NeuroInvestmentPolicy {
  const fallback = starterNeuroInvestmentPolicy();
  const limits = source?.limits && typeof source.limits === "object" ? source.limits : {};
  const status = String(source?.status ?? fallback.status);
  return {
    id: source?.id ?? null,
    version: finiteNumber(source?.version, null),
    status: status === "active" || status === "retired" ? status : "draft",
    universe: cleanText(source?.universe, fallback.universe).slice(0, 800),
    strategy: cleanText(source?.strategy, fallback.strategy).slice(0, 1200),
    horizonYears: finiteNumber(source?.horizon_years ?? source?.horizonYears, fallback.horizonYears),
    baseCurrency: cleanText(source?.base_currency ?? source?.baseCurrency, fallback.baseCurrency)
      .toUpperCase()
      .slice(0, 12),
    benchmark: cleanText(source?.benchmark, fallback.benchmark).toUpperCase().slice(0, 24),
    restrictions: cleanStringArray(source?.restrictions ?? fallback.restrictions),
    liquidityNeeds: cleanText(source?.liquidity_needs ?? source?.liquidityNeeds, fallback.liquidityNeeds).slice(0, 1200),
    limits: {
      maxPositionPct: finiteNumber(limits.maxPositionPct ?? limits.max_position_pct, fallback.limits.maxPositionPct),
      maxSectorPct: finiteNumber(limits.maxSectorPct ?? limits.max_sector_pct, fallback.limits.maxSectorPct),
      minCashPct: finiteNumber(limits.minCashPct ?? limits.min_cash_pct, fallback.limits.minCashPct),
      allowedInstruments: cleanStringArray(limits.allowedInstruments ?? limits.allowed_instruments ?? fallback.limits.allowedInstruments),
    },
    approvedAt: source?.approved_at ?? source?.approvedAt ?? null,
    createdAt: source?.created_at ?? source?.createdAt ?? null,
  };
}

export function neuroInvestmentPolicyGaps(policy?: NeuroInvestmentPolicy | null) {
  if (!policy) {
    return [
      "approved investment policy",
      "investment universe",
      "strategy",
      "horizon",
      "benchmark",
      "position limits",
      "allowed instruments",
    ];
  }

  const gaps: string[] = [];
  if (policy.status !== "active" || !policy.approvedAt) gaps.push("approved investment policy");
  if (!policy.universe.trim()) gaps.push("investment universe");
  if (!policy.strategy.trim()) gaps.push("strategy");
  if (!policy.horizonYears || policy.horizonYears <= 0) gaps.push("horizon");
  if (!policy.benchmark.trim()) gaps.push("benchmark");
  if (policy.limits.maxPositionPct == null || policy.limits.maxPositionPct <= 0) gaps.push("max position limit");
  if (policy.limits.maxSectorPct == null || policy.limits.maxSectorPct <= 0) gaps.push("max sector limit");
  if (!policy.limits.allowedInstruments.length) gaps.push("allowed instruments");
  return gaps;
}

function positionForFocus(engine: any, focusTicker?: string | null) {
  const positions = Array.isArray(engine?.positions) ? engine.positions : [];
  const ticker = cleanText(focusTicker).toUpperCase();
  return (
    positions.find((position: any) => cleanText(position?.ticker).toUpperCase() === ticker) ??
    positions[0] ??
    null
  );
}

function documentRowForFocus(engine: any, focusTicker?: string | null) {
  const rows = Array.isArray(engine?.documentReadiness) ? engine.documentReadiness : [];
  const ticker = cleanText(focusTicker).toUpperCase();
  return rows.find((row: any) => cleanText(row?.ticker).toUpperCase() === ticker) ?? rows[0] ?? null;
}

function hasUsableMarketData(position: any, marketData?: any) {
  return Boolean(
    position?.currentPrice ||
      position?.marketCap ||
      position?.latestFundamentals ||
      marketData?.market?.regularMarketPrice ||
      marketData?.market?.previousClose ||
      marketData?.annualFundamentals?.length ||
      marketData?.fund
  );
}

function policyStatus(policy?: NeuroInvestmentPolicy | null): NeuroDecisionSupport["policyStatus"] {
  if (!policy) return "missing";
  if (policy.status !== "active") return "draft";
  return neuroInvestmentPolicyGaps(policy).length ? "incomplete" : "active";
}

export function buildNeuroDecisionSupport(input: {
  engine?: any;
  policy?: NeuroInvestmentPolicy | null;
  focusTicker?: string | null;
  marketData?: any;
  vectorStoreCount?: number;
  filingsIndexed?: number;
  privateMethodologyReady?: boolean;
  businessQualityAnalysis?: any;
  managementCapitalAllocationAnalysis?: any;
  earningsQualityAccountingRiskAnalysis?: any;
  independentBearCaseAnalysis?: any;
  aiTradeProposalsEnabled?: boolean;
}): NeuroDecisionSupport {
  const focusTicker = cleanText(input.focusTicker || input.engine?.positions?.[0]?.ticker, "");
  const position = positionForFocus(input.engine, focusTicker);
  const docs = documentRowForFocus(input.engine, focusTicker);
  const policy = input.policy ?? null;
  const policyGaps = neuroInvestmentPolicyGaps(policy);
  const currentPolicyStatus = policyStatus(policy);
  const marketDataReady = hasUsableMarketData(position, input.marketData);
  const documentsReady = Boolean(docs?.ready);
  const missingDocuments = Array.isArray(docs?.missing) ? docs.missing.map(String) : [];
  const vectorStoreCount = Math.max(0, Math.round(finiteNumber(input.vectorStoreCount, 0) ?? 0));
  const filingsIndexed = Math.max(0, Math.round(finiteNumber(input.filingsIndexed, 0) ?? 0));
  const privateMethodologyReady = input.privateMethodologyReady ?? vectorStoreCount > filingsIndexed;
  const aiTradeProposalsEnabled = input.aiTradeProposalsEnabled !== false;
  const businessQualityStatus = cleanText(input.businessQualityAnalysis?.status, "missing");
  const businessQualityReady =
    businessQualityStatus === "not_applicable" ||
    (input.businessQualityAnalysis?.generatedBy === "ai_research" &&
      (businessQualityStatus === "complete" || businessQualityStatus === "provisional"));
  const managementAllocationStatus = cleanText(input.managementCapitalAllocationAnalysis?.status, "missing");
  const managementAllocationReady =
    managementAllocationStatus === "not_applicable" ||
    (input.managementCapitalAllocationAnalysis?.generatedBy === "ai_research" &&
      (managementAllocationStatus === "complete" || managementAllocationStatus === "provisional"));
  const earningsQualityStatus = cleanText(input.earningsQualityAccountingRiskAnalysis?.status, "missing");
  const earningsQualityReady =
    earningsQualityStatus === "not_applicable" ||
    (input.earningsQualityAccountingRiskAnalysis?.generatedBy === "ai_research" &&
      (earningsQualityStatus === "complete" || earningsQualityStatus === "provisional"));
  const independentBearCaseStatus = cleanText(input.independentBearCaseAnalysis?.status, "missing");
  const independentBearCaseReady =
    independentBearCaseStatus === "not_applicable" ||
    (input.independentBearCaseAnalysis?.generatedBy === "ai_research" &&
      independentBearCaseStatus === "complete");
  const marginOfSafety = finiteNumber(position?.derived?.marginOfSafety, null);
  const fcfMargin = finiteNumber(position?.derived?.fcfMargin ?? position?.latestFundamentals?.fcfMargin, null);
  const debtToEquity = finiteNumber(position?.derived?.debtToEquity ?? position?.latestFundamentals?.debtToEquity, null);
  const weight = finiteNumber(position?.weight, null);
  const baseFairValue = finiteNumber(
    position?.valuationProfile?.selectedHorizonScenarios?.base?.intrinsicEquityValue ??
      position?.scenarios?.base?.intrinsicEquityValue,
    null
  );
  const currentMarketCap = finiteNumber(position?.valuationProfile?.currentMarketCap ?? position?.marketCap, null);
  const valuationStatus = cleanText(position?.derived?.valuationStatus, "unknown");

  const missingRequirements = [
    ...policyGaps.map((gap) => `Policy: ${gap}`),
    ...(!marketDataReady ? ["Market data layer"] : []),
    ...(!businessQualityReady ? ["Business Quality Analysis"] : []),
    ...(!managementAllocationReady ? ["Management and Capital Allocation Analysis"] : []),
    ...(!earningsQualityReady ? ["Earnings Quality and Accounting Risk Analysis"] : []),
    ...(!independentBearCaseReady ? ["Independent Bear Case Analysis"] : []),
    ...(!documentsReady && docs?.requiresCompanyFilings !== false ? [`Company filings: ${missingDocuments.join(", ") || "10-K/10-Q"}`] : []),
    ...(marginOfSafety == null ? ["Valuation margin of safety"] : []),
  ];

  const financialEvidence = clamp(
    Math.round(
      35 +
        (fcfMargin != null && fcfMargin > 0.05 ? 25 : fcfMargin != null && fcfMargin > 0 ? 12 : -12) +
        (debtToEquity == null || debtToEquity < 1.5 ? 20 : debtToEquity < 2.5 ? 8 : -12) +
        (documentsReady ? 12 : 0) +
        (marketDataReady ? 8 : 0)
    ),
    0,
    100
  );
  const valuationDiscipline = pctToScore(marginOfSafety, 50, 160);
  const evidenceIntegrity = clamp(
    (marketDataReady ? 28 : 0) +
      (documentsReady ? 34 : 0) +
      (privateMethodologyReady ? 18 : 0) +
      (filingsIndexed > 1 ? 10 : 0) +
      (input.engine ? 10 : 0),
    0,
    100
  );
  const financialDurability = clamp(
    Math.round(
      45 +
        (fcfMargin != null && fcfMargin > 0.08 ? 25 : fcfMargin != null && fcfMargin > 0 ? 12 : -18) +
        (debtToEquity == null || debtToEquity < 1 ? 20 : debtToEquity < 2 ? 8 : -10) +
        (position?.latestFundamentals?.freeCashFlow != null && Number(position.latestFundamentals.freeCashFlow) > 0 ? 10 : 0)
    ),
    0,
    100
  );
  const maxPosition = policy?.limits.maxPositionPct != null ? policy.limits.maxPositionPct / 100 : null;
  const portfolioFit = clamp(
    Math.round(
      65 +
        (weight != null && maxPosition != null && weight > maxPosition ? -30 : 10) +
        (Array.isArray(input.engine?.riskFlags) && input.engine.riskFlags.length ? -12 : 10)
    ),
    0,
    100
  );
  const marketContext = clamp(
    Math.round(
      50 +
        (valuationStatus === "undervalued" ? 25 : valuationStatus === "overvalued" ? -20 : 0) +
        (marketDataReady ? 12 : -15)
    ),
    0,
    100
  );
  const overall = Math.round(
    (financialEvidence + valuationDiscipline + evidenceIntegrity + financialDurability + portfolioFit + marketContext) / 6
  );

  const policyChecks = [
    {
      key: "policy",
      status: currentPolicyStatus === "active" ? "pass" : "fail",
      message:
        currentPolicyStatus === "active"
          ? "Approved investment policy is active."
          : "A capital proposal is blocked until an investment policy is approved.",
    },
    {
      key: "position_limit",
      status:
        weight == null || maxPosition == null
          ? "unknown"
          : weight <= maxPosition
            ? "pass"
            : "fail",
      message:
        weight == null || maxPosition == null
          ? "Position weight cannot be verified yet."
          : weight <= maxPosition
            ? "Position is inside the policy limit."
            : "Position is above the policy limit.",
    },
    {
      key: "evidence",
      status: documentsReady || docs?.requiresCompanyFilings === false ? "pass" : "fail",
      message:
        documentsReady || docs?.requiresCompanyFilings === false
          ? "Required evidence is present for this instrument type."
          : "Required company filings are missing.",
    },
  ] as NeuroDecisionSupport["policyChecks"];

  const blockingReasons = [
    ...(!aiTradeProposalsEnabled ? ["AI-generated trade proposals disabled by emergency control"] : []),
    ...(currentPolicyStatus === "active" ? [] : ["No approved investment policy"]),
    ...(!marketDataReady ? ["Market data not ready"] : []),
    ...(!businessQualityReady ? ["Business Quality Analysis incomplete"] : []),
    ...(!managementAllocationReady ? ["Management and Capital Allocation Analysis incomplete"] : []),
    ...(!earningsQualityReady ? ["Earnings Quality and Accounting Risk Analysis incomplete"] : []),
    ...(!independentBearCaseReady ? ["Independent Bear Case Analysis incomplete"] : []),
    ...(!documentsReady && docs?.requiresCompanyFilings !== false ? ["Required filings not indexed"] : []),
    ...(policyChecks.some((check) => check.status === "fail" && check.key === "position_limit")
      ? ["Policy position limit failed"]
      : []),
  ];

  let suggestedState: NeuroDecisionState = "investigate";
  if (
    !businessQualityReady ||
    !managementAllocationReady ||
    !earningsQualityReady ||
    !independentBearCaseReady ||
    !marketDataReady ||
    (!documentsReady && docs?.requiresCompanyFilings !== false)
  ) {
    suggestedState = "insufficient_information";
  } else if (financialEvidence < 45 || financialDurability < 40) {
    suggestedState = "reject";
  } else if (currentPolicyStatus !== "active") {
    suggestedState = "observe";
  } else if (marginOfSafety != null && marginOfSafety >= 0.25 && overall >= 68 && !blockingReasons.length) {
    suggestedState = "propose";
  } else if (marginOfSafety != null && marginOfSafety <= -0.15) {
    suggestedState = "observe";
  } else {
    suggestedState = "investigate";
  }

  const onlyAiProposalGateBlocks =
    !aiTradeProposalsEnabled &&
    blockingReasons.length === 1 &&
    blockingReasons[0] === "AI-generated trade proposals disabled by emergency control";
  if (
    !aiTradeProposalsEnabled &&
    (suggestedState === "propose" || (suggestedState === "investigate" && onlyAiProposalGateBlocks))
  ) {
    suggestedState = "observe";
  }

  const committeeReviewEligible = suggestedState === "propose" && !blockingReasons.length;
  // Research and AI can advance an idea to committee, but only an immutable
  // APPROVED human committee decision can make a portfolio position eligible.
  const capitalActionAllowed = false;
  const evidenceCompleteness =
    evidenceIntegrity >= 80
      ? "sufficient"
      : evidenceIntegrity >= 50
        ? "partial"
        : "insufficient";
  const systemDisposition = buildMasterInvestmentSystemDisposition({
    workflowState: suggestedState,
    policyStatus: currentPolicyStatus,
    evidenceCompleteness,
    valuationStatus,
    marginOfSafety,
    missingRequirements,
    blockingReasons,
  });
  const rationale = [
    `Overall score: ${overall}/100.`,
    `Valuation status: ${valuationStatus.replace(/_/g, " ")}.`,
    marginOfSafety == null ? "Margin of safety is not available." : `Modeled margin of safety is ${(marginOfSafety * 100).toFixed(1)}%.`,
    currentPolicyStatus === "active" ? "Policy gate is active." : "Policy gate blocks capital proposals.",
    aiTradeProposalsEnabled
      ? "AI proposal gate is active."
      : "AI-generated trade proposals are disabled by emergency control.",
    documentsReady || docs?.requiresCompanyFilings === false ? "Evidence gate passed." : "Evidence gate is incomplete.",
  ];

  return {
    focusTicker,
    suggestedState,
    policyStatus: currentPolicyStatus,
    committeeReviewEligible,
    capitalActionAllowed,
    systemDisposition,
    evidenceCompleteness,
    rationale,
    missingRequirements,
    blockingReasons,
    evidence: {
      businessQualityReady,
      businessQualityStatus,
      managementAllocationReady,
      managementAllocationStatus,
      earningsQualityReady,
      earningsQualityStatus,
      independentBearCaseReady,
      independentBearCaseStatus,
      marketDataReady,
      documentsReady,
      privateMethodologyReady,
      documentModel: cleanText(docs?.evidenceModel, "unknown"),
      missingDocuments,
      filingsIndexed,
      vectorStoreCount,
    },
    valuation: {
      status: valuationStatus,
      marginOfSafety,
      baseFairValue,
      currentMarketCap,
    },
    scorecard: {
      financialEvidence,
      valuationDiscipline,
      evidenceIntegrity,
      financialDurability,
      portfolioFit,
      marketContext,
      overall,
    },
    policyChecks,
  };
}
