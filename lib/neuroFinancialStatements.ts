import { createHash } from "node:crypto";

export const CANONICAL_FINANCIAL_CONCEPTS = [
  "revenue",
  "cost_of_revenue",
  "gross_profit",
  "operating_expenses",
  "research_and_development",
  "selling_general_administrative",
  "operating_income",
  "interest_expense",
  "pretax_income",
  "income_taxes",
  "net_income",
  "cash",
  "accounts_receivable",
  "inventory",
  "current_assets",
  "property_plant_equipment",
  "goodwill",
  "intangible_assets",
  "total_assets",
  "accounts_payable",
  "current_liabilities",
  "short_term_debt",
  "long_term_debt",
  "total_debt",
  "total_liabilities",
  "shareholders_equity",
  "operating_cash_flow",
  "capital_expenditures",
  "investing_cash_flow",
  "financing_cash_flow",
  "dividends",
  "share_repurchases",
  "share_issuance",
  "basic_shares",
  "diluted_shares",
  "stock_based_compensation",
  "depreciation_depletion_amortization",
] as const;

export type CanonicalFinancialConcept = (typeof CANONICAL_FINANCIAL_CONCEPTS)[number];
export type FinancialPeriodType = "instant" | "quarter" | "ytd" | "annual" | "ttm";
export type ReportedOrDerived = "REPORTED" | "DERIVED";

export type XbrlConceptMapping = {
  taxonomy: "us-gaap" | "ifrs-full" | string;
  originalConcept: string;
  canonicalConcept: CanonicalFinancialConcept;
  priority: number;
  signMultiplier?: 1 | -1;
};

export type FilingAvailability = {
  accessionNumber: string;
  filingDate: string;
  acceptedAt?: string | null;
  form?: string | null;
};

export type RawSecFinancialFact = {
  id: string;
  cik: string;
  taxonomy: string;
  originalConcept: string;
  value: number;
  units: string;
  periodStartDate: string | null;
  periodEndDate: string;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  reportedForm: string | null;
  frame: string | null;
  accessionNumber: string | null;
  filingDate: string;
  acceptedAt: string | null;
  publicAt: string;
  ingestedAt: string;
  rawFact: Record<string, unknown>;
  factSha256: string;
};

export type NormalizedFinancialFact = {
  id: string;
  rawFactId: string | null;
  cik: string;
  canonicalConcept: CanonicalFinancialConcept;
  originalTaxonomy: string | null;
  originalConcept: string | null;
  mappingPriority: number | null;
  value: number | null;
  units: string;
  periodType: FinancialPeriodType;
  periodStartDate: string | null;
  periodEndDate: string;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  reportedOrDerived: ReportedOrDerived;
  formula: string | null;
  inputFactIds: string[];
  accessionNumber: string | null;
  filingDate: string | null;
  acceptedAt: string | null;
  publicAt: string;
  mappingVersion: string;
  calculationVersion: string | null;
  normalizedAt: string;
  lineageSha256: string;
  unavailableReason: string | null;
};

export type CompanyFactsNormalizationResult = {
  cik: string;
  entityName: string | null;
  rawFacts: RawSecFinancialFact[];
  normalizedFacts: NormalizedFinancialFact[];
  unmappedConcepts: Array<{ taxonomy: string; concept: string }>;
  rejectedFacts: Array<{ taxonomy: string; concept: string; reason: string }>;
  mappingVersion: string;
};

export const DEFAULT_XBRL_MAPPING_VERSION = "sec-xbrl-canonical-v1";
export const FINANCIAL_PERIOD_CALCULATION_VERSION = "financial-periods-v1";

function aliases(
  canonicalConcept: CanonicalFinancialConcept,
  concepts: string[],
  priority = 100,
  signMultiplier: 1 | -1 = 1
): XbrlConceptMapping[] {
  return concepts.map((originalConcept, index) => ({
    taxonomy: "us-gaap",
    originalConcept,
    canonicalConcept,
    priority: priority + index,
    signMultiplier,
  }));
}

export const DEFAULT_XBRL_CONCEPT_MAPPINGS: XbrlConceptMapping[] = [
  ...aliases("revenue", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "SalesRevenueGoodsNet"]),
  ...aliases("cost_of_revenue", ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"]),
  ...aliases("gross_profit", ["GrossProfit"]),
  ...aliases("operating_expenses", ["OperatingExpenses"]),
  ...aliases("research_and_development", ["ResearchAndDevelopmentExpense"]),
  ...aliases("selling_general_administrative", ["SellingGeneralAndAdministrativeExpense"]),
  ...aliases("operating_income", ["OperatingIncomeLoss"]),
  ...aliases("interest_expense", ["InterestExpenseNonOperating", "InterestAndDebtExpense"]),
  ...aliases("pretax_income", ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"]),
  ...aliases("income_taxes", ["IncomeTaxExpenseBenefit"]),
  ...aliases("net_income", ["NetIncomeLoss", "ProfitLoss"]),
  ...aliases("cash", ["CashAndCashEquivalentsAtCarryingValue", "CashAndShortTermInvestments"]),
  ...aliases("accounts_receivable", ["AccountsReceivableNetCurrent", "AccountsNotesAndLoansReceivableNetCurrent"]),
  ...aliases("inventory", ["InventoryNet"]),
  ...aliases("current_assets", ["AssetsCurrent"]),
  ...aliases("property_plant_equipment", ["PropertyPlantAndEquipmentNet"]),
  ...aliases("goodwill", ["Goodwill"]),
  ...aliases("intangible_assets", ["IntangibleAssetsNetExcludingGoodwill"]),
  ...aliases("total_assets", ["Assets"]),
  ...aliases("accounts_payable", ["AccountsPayableCurrent"]),
  ...aliases("current_liabilities", ["LiabilitiesCurrent"]),
  ...aliases("short_term_debt", ["ShortTermBorrowings", "LongTermDebtCurrent", "ShortTermDebtCurrent", "LongTermDebtAndFinanceLeaseObligationsCurrent"]),
  ...aliases("long_term_debt", ["LongTermDebtNoncurrent", "LongTermDebt"]),
  ...aliases("total_debt", ["ShortAndLongTermDebtTotal"]),
  ...aliases("total_liabilities", ["Liabilities"]),
  ...aliases("shareholders_equity", ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]),
  ...aliases("operating_cash_flow", ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]),
  ...aliases("capital_expenditures", ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForProceedsFromProductiveAssets", "PaymentsToAcquireProductiveAssets"]),
  ...aliases("investing_cash_flow", ["NetCashProvidedByUsedInInvestingActivities"]),
  ...aliases("financing_cash_flow", ["NetCashProvidedByUsedInFinancingActivities"]),
  ...aliases("dividends", ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"]),
  ...aliases("share_repurchases", ["PaymentsForRepurchaseOfCommonStock"]),
  ...aliases("share_issuance", ["ProceedsFromStockOptionsExercised", "ProceedsFromIssuanceOfCommonStock"]),
  ...aliases("basic_shares", ["WeightedAverageNumberOfSharesOutstandingBasic"]),
  ...aliases("diluted_shares", ["WeightedAverageNumberOfDilutedSharesOutstanding"]),
  ...aliases("stock_based_compensation", ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"]),
  ...aliases("depreciation_depletion_amortization", ["DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment"]),
  { taxonomy: "ifrs-full", originalConcept: "Revenue", canonicalConcept: "revenue", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "GrossProfit", canonicalConcept: "gross_profit", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "ProfitLossFromOperatingActivities", canonicalConcept: "operating_income", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "ProfitLoss", canonicalConcept: "net_income", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "CashAndCashEquivalents", canonicalConcept: "cash", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "Assets", canonicalConcept: "total_assets", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "Liabilities", canonicalConcept: "total_liabilities", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "Equity", canonicalConcept: "shareholders_equity", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "CashFlowsFromUsedInOperatingActivities", canonicalConcept: "operating_cash_flow", priority: 100 },
  { taxonomy: "ifrs-full", originalConcept: "PurchaseOfPropertyPlantAndEquipment", canonicalConcept: "capital_expenditures", priority: 100 },
];

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isoDate(value: unknown) {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))
    ? date
    : null;
}

function isoTimestamp(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationDays(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export function classifyFinancialPeriod(input: {
  start?: string | null;
  end: string;
  fiscalPeriod?: string | null;
}): FinancialPeriodType {
  if (!input.start) return "instant";
  const days = durationDays(input.start, input.end);
  if (days >= 330) return "annual";
  if (days <= 120) return "quarter";
  return "ytd";
}

function publicTimestamp(filed: string, acceptedAt?: string | null) {
  const accepted = isoTimestamp(acceptedAt);
  if (accepted) return accepted;
  // Company Facts omits acceptance time. End-of-day is conservative and prevents
  // an intraday backtest from seeing a filing before its verified timestamp.
  return `${filed}T23:59:59.999Z`;
}

function mappingIndex(mappings: XbrlConceptMapping[]) {
  const index = new Map<string, XbrlConceptMapping[]>();
  for (const mapping of mappings) {
    const key = `${mapping.taxonomy}:${mapping.originalConcept}`;
    const values = index.get(key) ?? [];
    values.push(mapping);
    values.sort((left, right) => left.priority - right.priority);
    index.set(key, values);
  }
  return index;
}

export function normalizeSecCompanyFacts(input: {
  payload: Record<string, any>;
  filingAvailability?: FilingAvailability[];
  mappings?: XbrlConceptMapping[];
  mappingVersion?: string;
  ingestedAt?: string;
  normalizedAt?: string;
}): CompanyFactsNormalizationResult {
  const payload = input.payload ?? {};
  const cik = String(payload.cik ?? "").replace(/\D/g, "").padStart(10, "0");
  if (!/^\d{10}$/.test(cik)) throw new Error("Company Facts payload is missing a valid CIK.");
  const mappingVersion = input.mappingVersion ?? DEFAULT_XBRL_MAPPING_VERSION;
  const ingestedAt = isoTimestamp(input.ingestedAt) ?? new Date().toISOString();
  const normalizedAt = isoTimestamp(input.normalizedAt) ?? ingestedAt;
  const availability = new Map(
    (input.filingAvailability ?? []).map((row) => [String(row.accessionNumber), row])
  );
  const mappings = mappingIndex(input.mappings ?? DEFAULT_XBRL_CONCEPT_MAPPINGS);
  const rawFacts: RawSecFinancialFact[] = [];
  const normalizedFacts: NormalizedFinancialFact[] = [];
  const unmapped = new Map<string, { taxonomy: string; concept: string }>();
  const rejectedFacts: Array<{ taxonomy: string; concept: string; reason: string }> = [];

  for (const [taxonomy, concepts] of Object.entries(payload.facts ?? {})) {
    if (!concepts || typeof concepts !== "object") continue;
    for (const [originalConcept, conceptPayload] of Object.entries(concepts as Record<string, any>)) {
      const candidates = mappings.get(`${taxonomy}:${originalConcept}`) ?? [];
      if (!candidates.length) unmapped.set(`${taxonomy}:${originalConcept}`, { taxonomy, concept: originalConcept });
      const unitsObject = conceptPayload?.units;
      if (!unitsObject || typeof unitsObject !== "object") continue;

      for (const [units, observations] of Object.entries(unitsObject as Record<string, unknown>)) {
        if (!Array.isArray(observations)) continue;
        for (const observation of observations as Array<Record<string, unknown>>) {
          const value = numberOrNull(observation.val);
          const end = isoDate(observation.end);
          const filed = isoDate(observation.filed);
          if (value == null || !end || !filed) {
            rejectedFacts.push({ taxonomy, concept: originalConcept, reason: "Missing numeric value, period end, or filing date." });
            continue;
          }
          const start = isoDate(observation.start);
          const accessionNumber = String(observation.accn ?? "").trim() || null;
          const filing = accessionNumber ? availability.get(accessionNumber) : undefined;
          const acceptedAt = isoTimestamp(filing?.acceptedAt);
          const publicAt = publicTimestamp(filed, acceptedAt);
          const fiscalYear = Number.isInteger(Number(observation.fy)) ? Number(observation.fy) : null;
          const fiscalPeriod = String(observation.fp ?? "").trim().toUpperCase() || null;
          const reportedForm = String(observation.form ?? filing?.form ?? "").trim().toUpperCase() || null;
          const frame = String(observation.frame ?? "").trim() || null;
          const factIdentity = {
            cik, taxonomy, originalConcept, value, units, start, end, fiscalYear,
            fiscalPeriod, reportedForm, frame, accessionNumber, filed, publicAt,
          };
          const factSha256 = hash(factIdentity);
          const rawFact: RawSecFinancialFact = {
            id: `raw-${factSha256}`,
            cik,
            taxonomy,
            originalConcept,
            value,
            units,
            periodStartDate: start,
            periodEndDate: end,
            fiscalYear,
            fiscalPeriod,
            reportedForm,
            frame,
            accessionNumber,
            filingDate: filed,
            acceptedAt,
            publicAt,
            ingestedAt,
            rawFact: observation,
            factSha256,
          };
          rawFacts.push(rawFact);

          for (const mapping of candidates) {
            const normalizedValue = value * (mapping.signMultiplier ?? 1);
            const lineageSha256 = hash({ factSha256, mappingVersion, canonicalConcept: mapping.canonicalConcept, normalizedValue });
            normalizedFacts.push({
              id: `normalized-${lineageSha256}`,
              rawFactId: rawFact.id,
              cik,
              canonicalConcept: mapping.canonicalConcept,
              originalTaxonomy: taxonomy,
              originalConcept,
              mappingPriority: mapping.priority,
              value: normalizedValue,
              units,
              periodType: classifyFinancialPeriod({ start, end, fiscalPeriod }),
              periodStartDate: start,
              periodEndDate: end,
              fiscalYear,
              fiscalPeriod,
              reportedOrDerived: "REPORTED",
              formula: null,
              inputFactIds: [rawFact.id],
              accessionNumber,
              filingDate: filed,
              acceptedAt,
              publicAt,
              mappingVersion,
              calculationVersion: null,
              normalizedAt,
              lineageSha256,
              unavailableReason: null,
            });
          }
        }
      }
    }
  }

  return {
    cik,
    entityName: String(payload.entityName ?? "").trim() || null,
    rawFacts,
    normalizedFacts,
    unmappedConcepts: [...unmapped.values()],
    rejectedFacts,
    mappingVersion,
  };
}

function factVersionKey(fact: NormalizedFinancialFact) {
  return [fact.canonicalConcept, fact.periodType, fact.periodStartDate ?? "", fact.periodEndDate, fact.units].join("|");
}

export function selectFinancialFactsAsOf(
  facts: NormalizedFinancialFact[],
  asOfTimestamp: string,
  version: "latest" | "original" = "latest"
) {
  const cutoff = Date.parse(asOfTimestamp);
  if (!Number.isFinite(cutoff)) throw new Error("Point-in-time cutoff must be a valid timestamp.");
  const grouped = new Map<string, NormalizedFinancialFact[]>();
  for (const fact of facts) {
    if (Date.parse(fact.publicAt) > cutoff) continue;
    const key = factVersionKey(fact);
    const entries = grouped.get(key) ?? [];
    entries.push(fact);
    grouped.set(key, entries);
  }
  return [...grouped.values()].map((entries) => {
    const availabilityTimes = entries.map((entry) => Date.parse(entry.publicAt));
    const selectedAvailability = version === "original"
      ? Math.min(...availabilityTimes)
      : Math.max(...availabilityTimes);
    const candidates = entries
      .filter((entry) => Date.parse(entry.publicAt) === selectedAvailability)
      .sort((left, right) => {
        const mappingPriority = (left.mappingPriority ?? Number.MAX_SAFE_INTEGER)
          - (right.mappingPriority ?? Number.MAX_SAFE_INTEGER);
        if (mappingPriority !== 0) return mappingPriority;
        const normalized = Date.parse(left.normalizedAt) - Date.parse(right.normalizedAt);
        return version === "original" ? normalized : -normalized;
      });
    return candidates[0];
  });
}

function latestValue(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function derivedFact(input: {
  template: NormalizedFinancialFact;
  value: number;
  periodType: "quarter" | "ttm";
  periodStartDate: string | null;
  periodEndDate: string;
  fiscalPeriod: string | null;
  formula: string;
  inputs: NormalizedFinancialFact[];
  normalizedAt: string;
}) {
  const identity = {
    concept: input.template.canonicalConcept,
    value: input.value,
    periodType: input.periodType,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    formula: input.formula,
    inputs: input.inputs.map((fact) => fact.lineageSha256),
    calculationVersion: FINANCIAL_PERIOD_CALCULATION_VERSION,
  };
  const lineageSha256 = hash(identity);
  return {
    ...input.template,
    id: `normalized-${lineageSha256}`,
    rawFactId: null,
    originalTaxonomy: null,
    originalConcept: null,
    mappingPriority: input.template.mappingPriority,
    value: input.value,
    periodType: input.periodType,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    fiscalPeriod: input.fiscalPeriod,
    reportedOrDerived: "DERIVED" as const,
    formula: input.formula,
    inputFactIds: input.inputs.map((fact) => fact.id),
    accessionNumber: null,
    filingDate: latestValue(input.inputs.map((fact) => fact.filingDate)),
    acceptedAt: latestValue(input.inputs.map((fact) => fact.acceptedAt)),
    publicAt: latestValue(input.inputs.map((fact) => fact.publicAt))!,
    calculationVersion: FINANCIAL_PERIOD_CALCULATION_VERSION,
    normalizedAt: input.normalizedAt,
    lineageSha256,
  } satisfies NormalizedFinancialFact;
}

function sameSeries(left: NormalizedFinancialFact, right: NormalizedFinancialFact) {
  return left.canonicalConcept === right.canonicalConcept && left.units === right.units && left.fiscalYear === right.fiscalYear;
}

export function deriveDiscreteFinancialQuarters(
  reportedFacts: NormalizedFinancialFact[],
  normalizedAt = new Date().toISOString()
) {
  const output: NormalizedFinancialFact[] = [];
  const durationFacts = reportedFacts.filter((fact) => fact.reportedOrDerived === "REPORTED" && fact.periodType !== "instant" && fact.value != null);

  for (const ytd of durationFacts.filter((fact) => fact.periodType === "ytd" && (fact.fiscalPeriod === "Q2" || fact.fiscalPeriod === "Q3"))) {
    const ytdValue = ytd.value;
    if (ytdValue == null) continue;
    const alreadyReported = durationFacts.some(
      (fact) => sameSeries(fact, ytd) && fact.periodType === "quarter" && fact.fiscalPeriod === ytd.fiscalPeriod
    );
    if (alreadyReported) continue;
    const previousFiscalPeriod = ytd.fiscalPeriod === "Q2" ? "Q1" : "Q2";
    const previous = durationFacts
      .filter((fact) => sameSeries(fact, ytd) && fact.fiscalPeriod === previousFiscalPeriod)
      .filter((fact) => ytd.fiscalPeriod === "Q2" || fact.periodType === "ytd")
      .sort((left, right) => Date.parse(right.publicAt) - Date.parse(left.publicAt))[0];
    if (!previous || previous.value == null) continue;
    output.push(derivedFact({
      template: ytd,
      value: ytdValue - previous.value,
      periodType: "quarter",
      periodStartDate: null,
      periodEndDate: ytd.periodEndDate,
      fiscalPeriod: ytd.fiscalPeriod,
      formula: `${ytd.fiscalPeriod} discrete = ${ytd.fiscalPeriod} YTD - ${previousFiscalPeriod} YTD`,
      inputs: [ytd, previous],
      normalizedAt,
    }));
  }

  const withDiscrete = [...reportedFacts, ...output];
  for (const annual of durationFacts.filter((fact) => fact.periodType === "annual" && fact.fiscalYear != null)) {
    const reportedQ4 = durationFacts.some(
      (fact) => sameSeries(fact, annual) && fact.periodType === "quarter" && fact.fiscalPeriod === "Q4"
    );
    if (reportedQ4) continue;
    const quarters = ["Q1", "Q2", "Q3"].map((fiscalPeriod) =>
      withDiscrete
        .filter((fact) => sameSeries(fact, annual) && fact.periodType === "quarter" && fact.fiscalPeriod === fiscalPeriod)
        .sort((left, right) => Date.parse(right.publicAt) - Date.parse(left.publicAt))[0]
    );
    if (quarters.some((fact) => !fact || fact.value == null)) continue;
    const inputs = [annual, ...(quarters as NormalizedFinancialFact[])];
    const value = annual.value! - (quarters as NormalizedFinancialFact[]).reduce((sum, fact) => sum + fact.value!, 0);
    output.push(derivedFact({
      template: annual,
      value,
      periodType: "quarter",
      periodStartDate: null,
      periodEndDate: annual.periodEndDate,
      fiscalPeriod: "Q4",
      formula: "Q4 discrete = FY - Q1 - Q2 - Q3",
      inputs,
      normalizedAt,
    }));
  }
  return output;
}

export function deriveTrailingTwelveMonthFacts(
  facts: NormalizedFinancialFact[],
  normalizedAt = new Date().toISOString()
) {
  const output: NormalizedFinancialFact[] = [];
  const series = new Map<string, NormalizedFinancialFact[]>();
  for (const fact of facts) {
    if (fact.periodType !== "quarter" || fact.value == null) continue;
    const key = `${fact.canonicalConcept}|${fact.units}`;
    const entries = series.get(key) ?? [];
    entries.push(fact);
    series.set(key, entries);
  }
  for (const entries of series.values()) {
    entries.sort((left, right) => left.periodEndDate.localeCompare(right.periodEndDate));
    for (let index = 3; index < entries.length; index += 1) {
      const window = entries.slice(index - 3, index + 1);
      if (new Set(window.map((fact) => fact.periodEndDate)).size !== 4) continue;
      const spanDays = durationDays(window[0].periodEndDate, window[3].periodEndDate);
      if (spanDays < 250 || spanDays > 400) continue;
      output.push(derivedFact({
        template: window[3],
        value: window.reduce((sum, fact) => sum + fact.value!, 0),
        periodType: "ttm",
        periodStartDate: window[0].periodStartDate,
        periodEndDate: window[3].periodEndDate,
        fiscalPeriod: "TTM",
        formula: "TTM = latest four discrete fiscal quarters",
        inputs: window,
        normalizedAt,
      }));
    }
  }
  return output;
}

export function buildFinancialPeriodFacts(
  reportedFacts: NormalizedFinancialFact[],
  normalizedAt = new Date().toISOString()
) {
  const discrete = deriveDiscreteFinancialQuarters(reportedFacts, normalizedAt);
  const withDiscrete = [...reportedFacts, ...discrete];
  const ttm = deriveTrailingTwelveMonthFacts(withDiscrete, normalizedAt);
  return { reported: reportedFacts, derivedQuarters: discrete, trailingTwelveMonths: ttm, all: [...withDiscrete, ...ttm] };
}
