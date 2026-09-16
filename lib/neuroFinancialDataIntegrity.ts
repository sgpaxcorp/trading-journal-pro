export const DATA_NOT_AVAILABLE = "DATA NOT AVAILABLE" as const;

export const FINANCIAL_CLAIM_CLASSIFICATIONS = [
  "FACT",
  "CALCULATION",
  "ASSUMPTION",
  "ESTIMATE",
  "AI_INTERPRETATION",
  "USER_DECISION",
] as const;

export type FinancialClaimClassification = (typeof FINANCIAL_CLAIM_CLASSIFICATIONS)[number];

export type FinancialTraceInput = {
  name: string;
  value: number | null;
  traceId?: string | null;
};

export type FinancialTraceRecord = {
  id: string;
  path: string;
  label: string;
  status: "verified" | "calculated" | "assumption" | "estimate" | "unavailable";
  classification: FinancialClaimClassification;
  value: number | null;
  displayValue: number | typeof DATA_NOT_AVAILABLE;
  source: string;
  document: string;
  reportingPeriod: string;
  publicationDate: string;
  currency: string;
  units: string;
  formula: string | null;
  inputs: FinancialTraceInput[];
  calculationTimestamp: string | null;
  unavailableReason: string | null;
};

export type FinancialDataIntegrityManifest = {
  schemaVersion: "1.0";
  policy: "verified_numbers_only";
  generatedAt: string;
  missingValueDisplay: typeof DATA_NOT_AVAILABLE;
  llmMayCalculate: false;
  records: FinancialTraceRecord[];
  violations: string[];
};

type FactRecordInput = {
  id?: string;
  path: string;
  label: string;
  value: unknown;
  source: unknown;
  document: unknown;
  reportingPeriod: unknown;
  publicationDate: unknown;
  currency: unknown;
  units: unknown;
  unavailableReason?: unknown;
};

type DerivedRecordInput = Omit<FactRecordInput, "value" | "source" | "document" | "publicationDate"> & {
  value: unknown;
  classification?: "CALCULATION" | "ESTIMATE";
  formula: unknown;
  inputs: FinancialTraceInput[];
  calculationTimestamp: unknown;
  source?: unknown;
  document?: unknown;
  publicationDate?: unknown;
};

type AssumptionRecordInput = Omit<FactRecordInput, "source" | "document" | "publicationDate"> & {
  source?: unknown;
  document?: unknown;
  publicationDate?: unknown;
};

function textOrUnavailable(value: unknown) {
  const text = String(value ?? "").trim();
  return text || DATA_NOT_AVAILABLE;
}

export function financialNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "string"
    ? Number(value.trim().replace(/[$,\s]/g, "").replace(/%$/, ""))
    : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function financialNumberOrFallback<T extends number | null>(value: unknown, fallback: T): number | T {
  return financialNumberOrNull(value) ?? fallback;
}

export function financialTraceId(scope: string, path: string) {
  const normalized = `${scope}-${path}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return `FIN-${normalized || "unavailable"}`;
}

function unavailableRecord(input: {
  id?: string;
  path: string;
  label: string;
  currency?: unknown;
  units?: unknown;
  reason?: unknown;
}): FinancialTraceRecord {
  return {
    id: input.id || financialTraceId("research", input.path),
    path: input.path,
    label: input.label,
    status: "unavailable",
    classification: "FACT",
    value: null,
    displayValue: DATA_NOT_AVAILABLE,
    source: DATA_NOT_AVAILABLE,
    document: DATA_NOT_AVAILABLE,
    reportingPeriod: DATA_NOT_AVAILABLE,
    publicationDate: DATA_NOT_AVAILABLE,
    currency: textOrUnavailable(input.currency),
    units: textOrUnavailable(input.units),
    formula: null,
    inputs: [],
    calculationTimestamp: null,
    unavailableReason: textOrUnavailable(input.reason || "The required value or source metadata could not be verified."),
  };
}

export function financialFact(input: FactRecordInput): FinancialTraceRecord {
  const value = financialNumberOrNull(input.value);
  const source = textOrUnavailable(input.source);
  const document = textOrUnavailable(input.document);
  const reportingPeriod = textOrUnavailable(input.reportingPeriod);
  const publicationDate = textOrUnavailable(input.publicationDate);
  const currency = textOrUnavailable(input.currency);
  const units = textOrUnavailable(input.units);
  if (
    value == null ||
    [source, document, reportingPeriod, publicationDate, currency, units].includes(DATA_NOT_AVAILABLE)
  ) {
    return unavailableRecord({
      id: input.id,
      path: input.path,
      label: input.label,
      currency,
      units,
      reason: input.unavailableReason,
    });
  }
  return {
    id: input.id || financialTraceId("research", input.path),
    path: input.path,
    label: input.label,
    status: "verified",
    classification: "FACT",
    value,
    displayValue: value,
    source,
    document,
    reportingPeriod,
    publicationDate,
    currency,
    units,
    formula: null,
    inputs: [],
    calculationTimestamp: null,
    unavailableReason: null,
  };
}

export function financialCalculation(input: DerivedRecordInput): FinancialTraceRecord {
  const value = financialNumberOrNull(input.value);
  const formula = textOrUnavailable(input.formula);
  const calculationTimestamp = textOrUnavailable(input.calculationTimestamp);
  const normalizedInputs = Array.isArray(input.inputs)
    ? input.inputs.map((row) => ({
        name: String(row?.name ?? "input").trim() || "input",
        value: financialNumberOrNull(row?.value),
        traceId: String(row?.traceId ?? "").trim() || null,
      }))
    : [];
  const missingInput = !normalizedInputs.length || normalizedInputs.some((row) => row.value == null);
  if (value == null || formula === DATA_NOT_AVAILABLE || calculationTimestamp === DATA_NOT_AVAILABLE || missingInput) {
    const unavailable = unavailableRecord({
      id: input.id,
      path: input.path,
      label: input.label,
      currency: input.currency,
      units: input.units,
      reason: input.unavailableReason || "A required calculation input was unavailable.",
    });
    return {
      ...unavailable,
      classification: input.classification ?? "CALCULATION",
      formula: formula === DATA_NOT_AVAILABLE ? null : formula,
      inputs: normalizedInputs,
      calculationTimestamp: calculationTimestamp === DATA_NOT_AVAILABLE ? null : calculationTimestamp,
    };
  }
  const classification = input.classification ?? "CALCULATION";
  return {
    id: input.id || financialTraceId("research", input.path),
    path: input.path,
    label: input.label,
    status: classification === "ESTIMATE" ? "estimate" : "calculated",
    classification,
    value,
    displayValue: value,
    source: textOrUnavailable(input.source || "Deterministic financial code"),
    document: textOrUnavailable(input.document || "Deterministic calculation record"),
    reportingPeriod: textOrUnavailable(input.reportingPeriod),
    publicationDate: textOrUnavailable(input.publicationDate || calculationTimestamp),
    currency: textOrUnavailable(input.currency),
    units: textOrUnavailable(input.units),
    formula,
    inputs: normalizedInputs,
    calculationTimestamp,
    unavailableReason: null,
  };
}

export function financialAssumption(input: AssumptionRecordInput): FinancialTraceRecord {
  const value = financialNumberOrNull(input.value);
  if (value == null) {
    const unavailable = unavailableRecord({
      id: input.id,
      path: input.path,
      label: input.label,
      currency: input.currency,
      units: input.units,
      reason: input.unavailableReason || "The assumption was not explicitly supplied.",
    });
    return { ...unavailable, classification: "ASSUMPTION" };
  }
  const publicationDate = textOrUnavailable(input.publicationDate);
  return {
    id: input.id || financialTraceId("research", input.path),
    path: input.path,
    label: input.label,
    status: "assumption",
    classification: "ASSUMPTION",
    value,
    displayValue: value,
    source: textOrUnavailable(input.source || "Explicit research assumption"),
    document: textOrUnavailable(input.document || "Research assumption set"),
    reportingPeriod: textOrUnavailable(input.reportingPeriod),
    publicationDate,
    currency: textOrUnavailable(input.currency),
    units: textOrUnavailable(input.units),
    formula: null,
    inputs: [],
    calculationTimestamp: null,
    unavailableReason: null,
  };
}

export function createFinancialIntegrityManifest(
  records: FinancialTraceRecord[],
  generatedAt = new Date().toISOString()
): FinancialDataIntegrityManifest {
  const byId = new Map<string, FinancialTraceRecord>();
  const violations: string[] = [];
  for (const record of records) {
    if (byId.has(record.id)) {
      violations.push(`Duplicate financial trace ID: ${record.id}`);
      continue;
    }
    if (record.value != null && record.displayValue === DATA_NOT_AVAILABLE) {
      violations.push(`Available value cannot use the unavailable display marker: ${record.id}`);
    }
    if (
      record.value != null &&
      [record.source, record.document, record.reportingPeriod, record.publicationDate, record.currency, record.units]
        .includes(DATA_NOT_AVAILABLE)
    ) {
      violations.push(`Trace metadata is incomplete: ${record.id}`);
    }
    if (
      record.value != null &&
      (record.classification === "CALCULATION" || record.classification === "ESTIMATE") &&
      (!record.formula || !record.inputs.length || !record.calculationTimestamp)
    ) {
      violations.push(`Derived value is missing formula, inputs, or calculation timestamp: ${record.id}`);
    }
    byId.set(record.id, record);
  }
  return {
    schemaVersion: "1.0",
    policy: "verified_numbers_only",
    generatedAt,
    missingValueDisplay: DATA_NOT_AVAILABLE,
    llmMayCalculate: false,
    records: Array.from(byId.values()),
    violations,
  };
}

export function mergeFinancialIntegrityManifests(
  manifests: Array<FinancialDataIntegrityManifest | null | undefined>,
  generatedAt = new Date().toISOString()
) {
  return createFinancialIntegrityManifest(
    manifests.flatMap((manifest) => manifest?.records ?? []),
    generatedAt
  );
}

export function verifiedFinancialValue(
  manifest: FinancialDataIntegrityManifest | null | undefined,
  path: string
) {
  const record = manifest?.records.find((row) => row.path === path);
  return record && record.status !== "unavailable" ? record.value : null;
}

const MATERIAL_NUMBER = /(?:[$€£]\s*)?-?\d[\d,]*(?:\.\d+)?(?:\s*(?:%|x|bps|basis points?|million|billion|trillion|millones?|mil millones))?/gi;
const FINANCIAL_CONTEXT = /\b(price|revenue|sales|income|earnings|cash|flow|margin|debt|assets?|equity|shares?|valuation|value|return|yield|capex|opex|ebit|ebitda|nav|pnl|profit|loss|cost|capital|dividend|multiple|growth|tax|rate|horizon|scenario|assumption|forecast|per[- ]share|diluted|precio|ingresos?|ventas?|ganancias?|efectivo|flujo|margen|deuda|activos?|acciones?|valoraci[oó]n|valor|retorno|rendimiento|p[eé]rdida|costo|capital|dividendo|crecimiento|impuesto|tasa|horizonte|escenario|supuesto|pron[oó]stico|por acci[oó]n|diluido)\b/i;
const FINANCIAL_UNIT = /[$€£%]|\b(?:x|bps|basis points?|million|billion|trillion|millones?|mil millones)\b/i;
const TRACE_CITATION = /\[\[FIN:([^\]]+)\]\]/g;

function materialFinancialTokens(line: string) {
  const withoutCitations = line
    .replace(TRACE_CITATION, "")
    .replace(/\b\d{4}-\d{2}-\d{2}(?:T[^\s]+)?\b/g, "")
    .replace(/\b10-[KQ]\b/gi, "");
  MATERIAL_NUMBER.lastIndex = 0;
  return Array.from(withoutCitations.matchAll(MATERIAL_NUMBER))
    .map((match) => match[0])
    .filter((token) => {
      const plain = token.replace(/[$€£,%x\s,]/gi, "");
      const numeric = Number(plain);
      return !(
        !/[$€£%]|\b(?:x|bps|million|billion|trillion|millones?|mil millones)\b/i.test(token) &&
        Number.isInteger(numeric) &&
        numeric >= 1900 &&
        numeric <= 2100
      );
    });
}

function isMaterialFinancialLine(line: string) {
  const financialTableRow = line.includes("|") && FINANCIAL_UNIT.test(line);
  if (!FINANCIAL_CONTEXT.test(line) && !financialTableRow) return false;
  return materialFinancialTokens(line).length > 0;
}

function replaceMaterialNumbers(line: string) {
  return line.replace(MATERIAL_NUMBER, (token) => {
    const plain = token.replace(/[$€£,%x\s,]/gi, "");
    const numeric = Number(plain);
    if (!/[$€£%]|\b(?:x|bps|million|billion|trillion|millones?|mil millones)\b/i.test(token)) {
      if (Number.isInteger(numeric) && numeric >= 1900 && numeric <= 2100) return token;
      if (/^10$/.test(token.trim()) && /\b10-[KQ]\b/i.test(line)) return token;
    }
    return DATA_NOT_AVAILABLE;
  });
}

export function enforceResearchFinancialIntegrity(
  report: string,
  manifest: FinancialDataIntegrityManifest
) {
  const availableIds = new Set(
    manifest.records.filter((record) => record.status !== "unavailable" && record.value != null).map((record) => record.id)
  );
  const usedIds = new Set<string>();
  let replacedClaimCount = 0;
  const output = String(report ?? "")
    .split("\n")
    .map((line) => {
      if (!isMaterialFinancialLine(line)) return line;
      const citations = Array.from(line.matchAll(TRACE_CITATION)).map((match) => match[1]);
      const valid = citations.filter((id) => availableIds.has(id));
      if (valid.length >= materialFinancialTokens(line).length) {
        valid.forEach((id) => usedIds.add(id));
        return line;
      }
      replacedClaimCount += 1;
      return replaceMaterialNumbers(line).replace(TRACE_CITATION, "");
    })
    .join("\n");
  return { report: output, usedTraceIds: Array.from(usedIds), replacedClaimCount };
}

const STANDALONE_AI_NUMBER = /^\s*[$€£]?\s*-?\d[\d,]*(?:\.\d+)?\s*(?:%|x|bps|basis points?|million|billion|trillion|millones?|mil millones)?\s*$/i;

export function auditAiFinancialPayload(
  value: unknown,
  manifest: FinancialDataIntegrityManifest | null | undefined
): unknown {
  const safeManifest = manifest ?? createFinancialIntegrityManifest([]);
  if (typeof value === "number") return null;
  if (typeof value === "string") {
    if (STANDALONE_AI_NUMBER.test(value)) return DATA_NOT_AVAILABLE;
    return enforceResearchFinancialIntegrity(value, safeManifest).report;
  }
  if (Array.isArray(value)) return value.map((item) => auditAiFinancialPayload(item, safeManifest));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, auditAiFinancialPayload(item, safeManifest)])
    );
  }
  return value;
}

export function appendFinancialTraceabilityAppendix(
  report: string,
  manifest: FinancialDataIntegrityManifest,
  usedTraceIds: string[]
) {
  if (!usedTraceIds.length) return report;
  const used = new Set(usedTraceIds);
  const rows = manifest.records.filter((record) => used.has(record.id));
  if (!rows.length) return report;
  const cleanCell = (value: unknown) => String(value ?? DATA_NOT_AVAILABLE).replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const table = [
    "## Financial Data Traceability",
    "| ID | Classification | Source | Document | Reporting period | Publication date | Currency | Units | Formula / inputs |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((record) => {
      const calculation = record.formula
        ? `${record.formula}; inputs: ${record.inputs.map((input) => `${input.name}=${input.value ?? DATA_NOT_AVAILABLE}`).join(", ")}; calculated ${record.calculationTimestamp}`
        : "Direct source value";
      return `| ${cleanCell(record.id)} | ${cleanCell(record.classification)} | ${cleanCell(record.source)} | ${cleanCell(record.document)} | ${cleanCell(record.reportingPeriod)} | ${cleanCell(record.publicationDate)} | ${cleanCell(record.currency)} | ${cleanCell(record.units)} | ${cleanCell(calculation)} |`;
    }),
  ].join("\n");
  const finalBusinessConditionHeading = /^#{1,6}\s+WHAT MUST BE TRUE FOR THIS BUSINESS TO BE AN ATTRACTIVE INVESTMENT\?\s*$/im;
  const match = finalBusinessConditionHeading.exec(report);
  if (!match || match.index == null) return `${report.trim()}\n\n${table}`;
  return `${report.slice(0, match.index).trim()}\n\n${table}\n\n${report.slice(match.index).trim()}`;
}

export const FINANCIAL_DATA_INTEGRITY_PROMPT = `
FINANCIAL DATA INTEGRITY RULE (MANDATORY):
- Never invent, interpolate, approximate, backfill, or silently convert a missing financial value to zero.
- When a required value cannot be verified, output exactly: ${DATA_NOT_AVAILABLE}.
- Every material financial number must come from the supplied Financial Data Integrity Ledger and must be followed on the same line by its exact citation marker: [[FIN:<record id>]].
- Do not cite an unavailable ledger record as support for a number.
- FACT values require source, document, reporting period, publication date, currency, and units.
- CALCULATION and ESTIMATE values additionally require a formula, explicit inputs, and calculation timestamp.
- ASSUMPTION values must remain visibly labeled as assumptions; never restate them as facts.
- The language model may explain deterministic calculations but may not create or recompute financial numbers.
`.trim();
