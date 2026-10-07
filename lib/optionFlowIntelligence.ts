export type OptionFlowAnalysisMode = "today" | "forward_positioning";

export type OptionFlowHorizon =
  | "today"
  | "next_session"
  | "one_week"
  | "one_month"
  | "three_months"
  | "six_months"
  | "leaps"
  | "custom";

export type OptionFlowDailyBar = {
  id?: string;
  symbol: string;
  sessionDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose?: number | null;
  volume?: number | null;
  currency?: string | null;
  availableAt?: string | null;
  sourceId?: string | null;
  sourceReference?: string | null;
};

export type OptionFlowMarketEvidence = {
  version: 1;
  status: "complete" | "partial" | "unavailable";
  requestedPeriod: {
    startDate: string;
    endDate: string;
  };
  requestedSessionDates: string[];
  sessions: Array<{
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    adjustedClose: number | null;
    volume: number | null;
    currency: string | null;
    sourceId: string | null;
    sourceReference: string | null;
    availableAt: string | null;
  }>;
  previousSession: {
    sessionDate: string;
    close: number;
  } | null;
  missingRequestedDates: string[];
  sourceManifest: Array<{
    sourceId: string;
    sourceReference: string | null;
    currency: string | null;
    units: "price_per_share";
    latestAvailableAt: string | null;
  }>;
  limitations: string[];
};

export type OptionFlowTrendSnapshot = {
  version: 1;
  sessionDate: string | null;
  sessionCount: number;
  close: number | null;
  dailyReturnPct: number | null;
  fiveSessionReturnPct: number | null;
  twentySessionReturnPct: number | null;
  sixtySessionReturnPct: number | null;
  gapPct: number | null;
  rangePct: number | null;
  closeLocationValue: number | null;
  sma5: number | null;
  sma20: number | null;
  sma50: number | null;
  atr14: number | null;
  realizedVolatility20Pct: number | null;
  averageVolume20: number | null;
  volumeRatio20: number | null;
  twentySessionHigh: number | null;
  twentySessionLow: number | null;
  trendState: "uptrend" | "downtrend" | "mixed" | "insufficient_data";
  formulas: Record<string, string>;
};

export type OptionFlowMaterialChange = {
  material: boolean;
  reasons: string[];
};

export type OptionFlowCheckpointClassification =
  | "price_confirms_flow"
  | "price_diverges_from_flow"
  | "insufficient_evidence"
  | "horizon_still_open";

export type OptionFlowThesisStatus =
  | "STRENGTHENED"
  | "WEAKENED"
  | "UNCHANGED"
  | "INSUFFICIENT_EVIDENCE";

export type OptionFlowOiTemporalStatus =
  | "verified_prior_close"
  | "reported_by_source"
  | "date_not_verified";

export type OptionFlowContractSnapshot = {
  id?: string;
  contractSymbol: string;
  underlyingSymbol: string;
  expiry?: string | null;
  strike?: number | null;
  optionType?: "C" | "P" | null;
  snapshotKind?: string | null;
  priceSessionDate?: string | null;
  openInterestAsOfDate?: string | null;
  observedAt: string;
  sourceId: string;
  sourceReference?: string | null;
  openInterest?: number | null;
  reportedOpenInterestChange?: number | null;
  volume?: number | null;
  lastPrice?: number | null;
  closePrice?: number | null;
  bid?: number | null;
  ask?: number | null;
  midpoint?: number | null;
  impliedVolatility?: number | null;
  delta?: number | null;
  underlyingPrice?: number | null;
  oiTemporalStatus: OptionFlowOiTemporalStatus;
};

export type OptionFlowOiRelationship =
  | "price_up_oi_up"
  | "price_down_oi_up"
  | "price_up_oi_down"
  | "price_down_oi_down"
  | "oi_unchanged"
  | "price_unavailable"
  | "insufficient_evidence";

export type OptionFlowOiContractRead = {
  contractSymbol: string;
  expiry: string | null;
  strike: number | null;
  optionType: "C" | "P" | null;
  openInterest: number | null;
  previousOpenInterest: number | null;
  openInterestChange: number | null;
  openInterestChangePct: number | null;
  openInterestAsOfDate: string | null;
  price: number | null;
  previousPrice: number | null;
  priceChangePct: number | null;
  priceSessionDate: string | null;
  volume: number | null;
  volumeToOpenInterest: number | null;
  relationship: OptionFlowOiRelationship;
  evidenceQuality: "verified" | "reported" | "unverified" | "insufficient";
  sourceId: string;
  observedAt: string;
};

export type OptionFlowOpenInterestIntelligence = {
  version: 1;
  asOfDate: string | null;
  calculatedAt: string;
  coverage: {
    contractsTracked: number;
    contractsWithOpenInterest: number;
    contractsWithComparableOpenInterest: number;
    verifiedContracts: number;
    reportedContracts: number;
    unverifiedContracts: number;
  };
  totals: {
    latestOpenInterest: number | null;
    confirmedOpenInterestChange: number | null;
    reportedOpenInterestChange: number | null;
    contractsWithIncrease: number;
    contractsWithDecrease: number;
    contractsUnchanged: number;
  };
  contracts: OptionFlowOiContractRead[];
  limitations: string[];
  formulas: Record<string, string>;
};

export function summarizeOptionFlowEvidenceWindow(input: {
  sessionDates: Array<string | null | undefined>;
  fallbackDate?: string | null;
}) {
  const sessionDates = Array.from(
    new Set(input.sessionDates.filter(validDateKey))
  ).sort();
  const fallbackDate = validDateKey(input.fallbackDate) ? input.fallbackDate : null;
  const startDate = sessionDates.at(0) ?? fallbackDate;
  const endDate = sessionDates.at(-1) ?? fallbackDate;
  return {
    sessionDates,
    startDate,
    endDate,
    sessionCount: sessionDates.length || (fallbackDate ? 1 : 0),
  };
}

export function buildOptionFlowMarketEvidence(input: {
  bars: OptionFlowDailyBar[];
  requestedSessionDates: Array<string | null | undefined>;
  startDate: string;
  endDate: string;
  providerError?: string | null;
}): OptionFlowMarketEvidence {
  const byDate = new Map<string, OptionFlowDailyBar>();
  for (const bar of input.bars) {
    if (!validDateKey(bar.sessionDate)) continue;
    if (![bar.open, bar.high, bar.low, bar.close].every((value) => finite(value) != null)) continue;
    const current = byDate.get(bar.sessionDate);
    const currentAvailableAt = String(current?.availableAt ?? "");
    const candidateAvailableAt = String(bar.availableAt ?? "");
    if (!current || candidateAvailableAt >= currentAvailableAt) byDate.set(bar.sessionDate, bar);
  }

  const bars = Array.from(byDate.values()).sort((left, right) => left.sessionDate.localeCompare(right.sessionDate));
  const requestedSessionDates = Array.from(
    new Set(input.requestedSessionDates.filter(validDateKey))
  ).sort();
  const effectiveRequestedDates = requestedSessionDates.length
    ? requestedSessionDates
    : bars
        .filter((bar) => bar.sessionDate >= input.startDate && bar.sessionDate <= input.endDate)
        .map((bar) => bar.sessionDate);
  const matchedBars = effectiveRequestedDates
    .map((date) => byDate.get(date) ?? null)
    .filter((bar): bar is OptionFlowDailyBar => Boolean(bar));
  const missingRequestedDates = effectiveRequestedDates.filter((date) => !byDate.has(date));
  const previous = bars.filter((bar) => bar.sessionDate < input.startDate).at(-1) ?? null;
  const sources = new Map<string, OptionFlowMarketEvidence["sourceManifest"][number]>();
  for (const bar of matchedBars) {
    const sourceId = String(bar.sourceId ?? "market_data_provider");
    const existing = sources.get(sourceId);
    const availableAt = bar.availableAt ?? null;
    sources.set(sourceId, {
      sourceId,
      sourceReference: bar.sourceReference ?? existing?.sourceReference ?? null,
      currency: bar.currency ?? existing?.currency ?? null,
      units: "price_per_share",
      latestAvailableAt:
        !existing?.latestAvailableAt || String(availableAt ?? "") > existing.latestAvailableAt
          ? availableAt
          : existing.latestAvailableAt,
    });
  }

  const sessions = matchedBars.map((bar) => ({
    sessionDate: bar.sessionDate,
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    adjustedClose: finite(bar.adjustedClose),
    volume: finite(bar.volume),
    currency: bar.currency ?? null,
    sourceId: bar.sourceId ?? null,
    sourceReference: bar.sourceReference ?? null,
    availableAt: bar.availableAt ?? null,
  }));
  const status: OptionFlowMarketEvidence["status"] = !sessions.length
    ? "unavailable"
    : missingRequestedDates.length
      ? "partial"
      : "complete";
  const limitations = [
    "OHLC values describe the underlying asset for the stated market session, not the option contract.",
    "A missing date can be a non-trading day, a provider gap, or an unavailable observation; it is never converted to zero.",
  ];
  if (input.providerError) limitations.push(`Market-data provider error: ${input.providerError}`);

  return {
    version: 1,
    status,
    requestedPeriod: { startDate: input.startDate, endDate: input.endDate },
    requestedSessionDates: effectiveRequestedDates,
    sessions,
    previousSession: previous
      ? { sessionDate: previous.sessionDate, close: Number(previous.close) }
      : null,
    missingRequestedDates,
    sourceManifest: Array.from(sources.values()),
    limitations,
  };
}

export function enforceOptionFlowThesisStatus(input: {
  hasPriorAnalysis: boolean;
  newUniqueRows: number;
  candidate: OptionFlowThesisStatus;
}): OptionFlowThesisStatus {
  if (!input.hasPriorAnalysis) return "INSUFFICIENT_EVIDENCE";
  if (!Number.isFinite(input.newUniqueRows) || input.newUniqueRows <= 0) return "UNCHANGED";
  return input.candidate;
}

export function normalizeOccOptionSymbol(value: unknown): string | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^O:/, "")
    .replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{1,8}\d{6}[CP]\d{8}$/.test(normalized) ? normalized : null;
}

export function buildOccOptionSymbol(input: {
  root: unknown;
  expiry: unknown;
  strike: unknown;
  optionType: unknown;
}): string | null {
  const root = String(input.root ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const expiry = String(input.expiry ?? "");
  const strike = finite(input.strike);
  const optionType = String(input.optionType ?? "").trim().toUpperCase();
  if (!root || !validDateKey(expiry) || strike == null || strike < 0 || !["C", "P"].includes(optionType)) {
    return null;
  }
  const strikeCode = String(Math.round(strike * 1_000)).padStart(8, "0");
  if (strikeCode.length > 8) return null;
  return `${root}${expiry.slice(2).replaceAll("-", "")}${optionType}${strikeCode}`;
}

function contractReferencePrice(snapshot: OptionFlowContractSnapshot): number | null {
  const direct = [snapshot.lastPrice, snapshot.midpoint, snapshot.closePrice]
    .map(finite)
    .find((value) => value != null);
  if (direct != null) return direct;
  const bid = finite(snapshot.bid);
  const ask = finite(snapshot.ask);
  return bid != null && ask != null ? (bid + ask) / 2 : null;
}

function snapshotSortKey(snapshot: OptionFlowContractSnapshot): string {
  return `${snapshot.openInterestAsOfDate ?? "0000-00-00"}|${snapshot.priceSessionDate ?? "0000-00-00"}|${snapshot.observedAt}`;
}

function evidenceQuality(input: {
  latest: OptionFlowContractSnapshot;
  previous: OptionFlowContractSnapshot | null;
  hasDatedComparison: boolean;
  hasReportedChange: boolean;
}): OptionFlowOiContractRead["evidenceQuality"] {
  if (finite(input.latest.openInterest) == null) {
    return input.hasReportedChange ? "reported" : "insufficient";
  }
  if (input.hasDatedComparison) {
    const sameVerifiedSource =
      input.latest.oiTemporalStatus === "verified_prior_close" &&
      input.previous?.oiTemporalStatus === "verified_prior_close" &&
      input.previous.sourceId === input.latest.sourceId;
    return sameVerifiedSource ? "verified" : "reported";
  }
  if (input.hasReportedChange || input.latest.oiTemporalStatus === "reported_by_source") return "reported";
  if (input.latest.oiTemporalStatus === "verified_prior_close") return "verified";
  return "unverified";
}

function relationshipFor(input: {
  oiChange: number | null;
  priceChangePct: number | null;
}): OptionFlowOiRelationship {
  if (input.oiChange == null) return "insufficient_evidence";
  if (input.oiChange === 0) return "oi_unchanged";
  if (input.priceChangePct == null) return "price_unavailable";
  if (input.oiChange > 0) return input.priceChangePct >= 0 ? "price_up_oi_up" : "price_down_oi_up";
  return input.priceChangePct >= 0 ? "price_up_oi_down" : "price_down_oi_down";
}

export function buildOptionFlowOpenInterestIntelligence(
  inputSnapshots: OptionFlowContractSnapshot[],
  calculatedAt = new Date().toISOString()
): OptionFlowOpenInterestIntelligence {
  const groups = new Map<string, OptionFlowContractSnapshot[]>();
  for (const snapshot of inputSnapshots) {
    const contractSymbol = normalizeOccOptionSymbol(snapshot.contractSymbol);
    if (!contractSymbol) continue;
    const group = groups.get(contractSymbol) ?? [];
    group.push({ ...snapshot, contractSymbol });
    groups.set(contractSymbol, group);
  }

  const contracts: OptionFlowOiContractRead[] = [];
  for (const [contractSymbol, rawSnapshots] of groups.entries()) {
    const snapshots = rawSnapshots.slice().sort((left, right) => snapshotSortKey(left).localeCompare(snapshotSortKey(right)));
    const latest = snapshots.at(-1)!;
    const latestOi = finite(latest.openInterest);
    const latestPrice = contractReferencePrice(latest);
    let previous: OptionFlowContractSnapshot | null = null;
    if (latest.openInterestAsOfDate) {
      previous = snapshots
        .slice(0, -1)
        .reverse()
        .find(
          (candidate) =>
            finite(candidate.openInterest) != null &&
            Boolean(candidate.openInterestAsOfDate) &&
            candidate.openInterestAsOfDate !== latest.openInterestAsOfDate
        ) ?? null;
    }

    const previousOi = finite(previous?.openInterest);
    const reportedChange = finite(latest.reportedOpenInterestChange);
    const canCalculateDatedChange =
      latestOi != null &&
      previousOi != null &&
      latest.oiTemporalStatus !== "date_not_verified" &&
      previous?.oiTemporalStatus !== "date_not_verified";
    const oiChange = canCalculateDatedChange
      ? latestOi - previousOi
      : latest.oiTemporalStatus === "reported_by_source"
        ? reportedChange
        : null;
    const previousPrice = previous ? contractReferencePrice(previous) : null;
    const priceChangePct = percentChange(previousPrice, latestPrice);
    const volume = finite(latest.volume);

    contracts.push({
      contractSymbol,
      expiry: validDateKey(latest.expiry) ? latest.expiry! : null,
      strike: finite(latest.strike),
      optionType: latest.optionType === "C" || latest.optionType === "P" ? latest.optionType : null,
      openInterest: round(latestOi, 0),
      previousOpenInterest: round(previousOi, 0),
      openInterestChange: round(oiChange, 0),
      openInterestChangePct: round(percentChange(previousOi, latestOi)),
      openInterestAsOfDate: validDateKey(latest.openInterestAsOfDate) ? latest.openInterestAsOfDate! : null,
      price: round(latestPrice),
      previousPrice: round(previousPrice),
      priceChangePct: round(priceChangePct),
      priceSessionDate: validDateKey(latest.priceSessionDate) ? latest.priceSessionDate! : null,
      volume: round(volume, 0),
      volumeToOpenInterest: round(
        volume != null && latestOi != null && latestOi > 0 ? volume / latestOi : null
      ),
      relationship: relationshipFor({ oiChange, priceChangePct }),
      evidenceQuality: evidenceQuality({
        latest,
        previous,
        hasDatedComparison: canCalculateDatedChange,
        hasReportedChange: reportedChange != null,
      }),
      sourceId: latest.sourceId,
      observedAt: latest.observedAt,
    });
  }

  contracts.sort((left, right) => {
    const leftChange = left.openInterestChange == null ? -1 : Math.abs(left.openInterestChange);
    const rightChange = right.openInterestChange == null ? -1 : Math.abs(right.openInterestChange);
    return rightChange - leftChange || left.contractSymbol.localeCompare(right.contractSymbol);
  });
  const withOi = contracts.filter((contract) => contract.openInterest != null);
  const comparable = contracts.filter((contract) => contract.openInterestChange != null);
  const verified = contracts.filter((contract) => contract.evidenceQuality === "verified");
  const reported = contracts.filter((contract) => contract.evidenceQuality === "reported");
  const unverified = contracts.filter((contract) => contract.evidenceQuality === "unverified");
  const asOfDates = contracts
    .map((contract) => contract.openInterestAsOfDate)
    .filter((value): value is string => validDateKey(value))
    .sort();

  return {
    version: 1,
    asOfDate: asOfDates.at(-1) ?? null,
    calculatedAt,
    coverage: {
      contractsTracked: contracts.length,
      contractsWithOpenInterest: withOi.length,
      contractsWithComparableOpenInterest: comparable.length,
      verifiedContracts: verified.length,
      reportedContracts: reported.length,
      unverifiedContracts: unverified.length,
    },
    totals: {
      latestOpenInterest: withOi.length
        ? round(withOi.reduce((sum, contract) => sum + Number(contract.openInterest), 0), 0)
        : null,
      confirmedOpenInterestChange: verified.some((contract) => contract.openInterestChange != null)
        ? round(verified.reduce((sum, contract) => sum + Number(contract.openInterestChange ?? 0), 0), 0)
        : null,
      reportedOpenInterestChange: reported.some((contract) => contract.openInterestChange != null)
        ? round(reported.reduce((sum, contract) => sum + Number(contract.openInterestChange ?? 0), 0), 0)
        : null,
      contractsWithIncrease: comparable.filter((contract) => Number(contract.openInterestChange) > 0).length,
      contractsWithDecrease: comparable.filter((contract) => Number(contract.openInterestChange) < 0).length,
      contractsUnchanged: comparable.filter((contract) => Number(contract.openInterestChange) === 0).length,
    },
    contracts,
    limitations: [
      "Open interest is an end-of-day position count that is generally available the following morning; it is not an intraday counter.",
      "An open-interest increase does not identify who is long or short and does not prove that a specific flow print opened a position.",
      "Price/open-interest relationships are deterministic observations, not buy or sell instructions.",
    ],
    formulas: {
      openInterestChange: "OI_effective_session_t - OI_effective_session_t-1",
      openInterestChangePct: "((OI_t / OI_t-1) - 1) * 100",
      priceChangePct: "((contract_reference_price_t / contract_reference_price_t-1) - 1) * 100",
      volumeToOpenInterest: "session_volume / latest_available_open_interest",
      contractReferencePrice: "last_price else provider_midpoint else session_close else (bid + ask) / 2",
    },
  };
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number | null, places = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function percentChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

function average(values: Array<number | null | undefined>): number | null {
  const clean = values.map(finite).filter((value): value is number => value != null);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function validDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addUtcDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addUtcMonths(dateKey: string, months: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const expectedDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(expectedDay, lastDay));
  return date.toISOString().slice(0, 10);
}

function moveOffWeekend(dateKey: string): string {
  let current = dateKey;
  for (let attempts = 0; attempts < 3; attempts += 1) {
    const weekday = new Date(`${current}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return current;
    current = addUtcDays(current, 1);
  }
  return current;
}

export function normalizeOptionFlowSymbol(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.^=-]/g, "")
    .slice(0, 24);
}

export function optionFlowTargetDate(input: {
  sourceSessionDate: string;
  horizon: OptionFlowHorizon;
  customTargetDate?: string | null;
}): string {
  const source = validDateKey(input.sourceSessionDate)
    ? input.sourceSessionDate
    : new Date().toISOString().slice(0, 10);

  if (input.horizon === "custom" && validDateKey(input.customTargetDate)) {
    return moveOffWeekend(input.customTargetDate);
  }
  if (input.horizon === "today") return source;
  if (input.horizon === "next_session") return moveOffWeekend(addUtcDays(source, 1));
  if (input.horizon === "one_week") return moveOffWeekend(addUtcDays(source, 7));
  if (input.horizon === "one_month") return moveOffWeekend(addUtcMonths(source, 1));
  if (input.horizon === "three_months") return moveOffWeekend(addUtcMonths(source, 3));
  if (input.horizon === "six_months") return moveOffWeekend(addUtcMonths(source, 6));
  if (input.horizon === "leaps") return moveOffWeekend(addUtcMonths(source, 12));
  return source;
}

export function computeOptionFlowTrend(inputBars: OptionFlowDailyBar[]): OptionFlowTrendSnapshot {
  const bars = inputBars
    .filter(
      (bar) =>
        validDateKey(bar.sessionDate) &&
        [bar.open, bar.high, bar.low, bar.close].every((value) => finite(value) != null)
    )
    .sort((left, right) => left.sessionDate.localeCompare(right.sessionDate));
  const current = bars.at(-1) ?? null;
  const previous = bars.at(-2) ?? null;
  const closes = bars.map((bar) => Number(bar.close));
  const volumes = bars.map((bar) => finite(bar.volume));
  const sma = (period: number) =>
    closes.length >= period ? average(closes.slice(-period)) : null;
  const returnForSessions = (sessions: number) => {
    if (closes.length <= sessions) return null;
    return percentChange(closes.at(-(sessions + 1)) ?? null, closes.at(-1) ?? null);
  };

  const trueRanges = bars.map((bar, index) => {
    const previousClose = index > 0 ? bars[index - 1].close : null;
    const highLow = bar.high - bar.low;
    if (previousClose == null) return highLow;
    return Math.max(highLow, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
  const atr14 = trueRanges.length >= 14 ? average(trueRanges.slice(-14)) : null;

  const logReturns: number[] = [];
  for (let index = Math.max(1, closes.length - 20); index < closes.length; index += 1) {
    const prior = closes[index - 1];
    const next = closes[index];
    if (prior > 0 && next > 0) logReturns.push(Math.log(next / prior));
  }
  const realizedVolatility = standardDeviation(logReturns);
  const sma5 = sma(5);
  const sma20 = sma(20);
  const sma50 = sma(50);
  const close = current?.close ?? null;
  let trendState: OptionFlowTrendSnapshot["trendState"] = "insufficient_data";
  if (close != null && sma5 != null && sma20 != null) {
    if (close > sma5 && sma5 > sma20) trendState = "uptrend";
    else if (close < sma5 && sma5 < sma20) trendState = "downtrend";
    else trendState = "mixed";
  }

  const recent20 = bars.slice(-20);
  const twentySessionHigh = recent20.length ? Math.max(...recent20.map((bar) => bar.high)) : null;
  const twentySessionLow = recent20.length ? Math.min(...recent20.map((bar) => bar.low)) : null;
  const averageVolume20 = average(volumes.slice(-20));
  const currentVolume = finite(current?.volume);
  const currentRange = current ? current.high - current.low : null;

  return {
    version: 1,
    sessionDate: current?.sessionDate ?? null,
    sessionCount: bars.length,
    close: round(close),
    dailyReturnPct: round(percentChange(previous?.close ?? null, close)),
    fiveSessionReturnPct: round(returnForSessions(5)),
    twentySessionReturnPct: round(returnForSessions(20)),
    sixtySessionReturnPct: round(returnForSessions(60)),
    gapPct: round(percentChange(previous?.close ?? null, current?.open ?? null)),
    rangePct: round(currentRange != null && current?.open ? (currentRange / Math.abs(current.open)) * 100 : null),
    closeLocationValue: round(
      currentRange != null && currentRange > 0 && current
        ? ((current.close - current.low) - (current.high - current.close)) / currentRange
        : null
    ),
    sma5: round(sma5),
    sma20: round(sma20),
    sma50: round(sma50),
    atr14: round(atr14),
    realizedVolatility20Pct: round(realizedVolatility == null ? null : realizedVolatility * Math.sqrt(252) * 100),
    averageVolume20: round(averageVolume20, 0),
    volumeRatio20: round(
      currentVolume != null && averageVolume20 != null && averageVolume20 > 0
        ? currentVolume / averageVolume20
        : null
    ),
    twentySessionHigh: round(twentySessionHigh),
    twentySessionLow: round(twentySessionLow),
    trendState,
    formulas: {
      dailyReturnPct: "((close_t / close_t-1) - 1) * 100",
      gapPct: "((open_t / close_t-1) - 1) * 100",
      rangePct: "((high_t - low_t) / open_t) * 100",
      closeLocationValue: "((close-low) - (high-close)) / (high-low)",
      atr14: "mean(max(high-low, abs(high-prev_close), abs(low-prev_close)), 14 sessions)",
      realizedVolatility20Pct: "sample_stdev(log(close_t/close_t-1), 20 sessions) * sqrt(252) * 100",
    },
  };
}

export function detectOptionFlowMaterialChange(
  bars: OptionFlowDailyBar[],
  trend: OptionFlowTrendSnapshot
): OptionFlowMaterialChange {
  const ordered = [...bars].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate));
  const current = ordered.at(-1);
  const prior = ordered.at(-2);
  const reasons: string[] = [];
  if (!current) return { material: false, reasons };

  if (trend.dailyReturnPct != null && Math.abs(trend.dailyReturnPct) >= 3) {
    reasons.push(`Absolute daily return reached ${Math.abs(trend.dailyReturnPct).toFixed(2)}%.`);
  }
  if (trend.volumeRatio20 != null && trend.volumeRatio20 >= 2) {
    reasons.push(`Volume reached ${trend.volumeRatio20.toFixed(2)}x its 20-session average.`);
  }
  if (trend.atr14 != null && current.high - current.low >= trend.atr14 * 2) {
    reasons.push("The session range reached at least 2x ATR(14).");
  }

  const previous20 = ordered.slice(-21, -1);
  if (previous20.length >= 5) {
    const priorHigh = Math.max(...previous20.map((bar) => bar.high));
    const priorLow = Math.min(...previous20.map((bar) => bar.low));
    if (current.close > priorHigh) reasons.push("Close broke above the prior 20-session high.");
    if (current.close < priorLow) reasons.push("Close broke below the prior 20-session low.");
  }
  if (prior && trend.sma20 != null) {
    const crossedUp = prior.close <= trend.sma20 && current.close > trend.sma20;
    const crossedDown = prior.close >= trend.sma20 && current.close < trend.sma20;
    if (crossedUp) reasons.push("Close crossed above SMA(20).");
    if (crossedDown) reasons.push("Close crossed below SMA(20).");
  }
  return { material: reasons.length > 0, reasons };
}

export function classifyOptionFlowCheckpoint(input: {
  flowBias?: string | null;
  sourceClose?: number | null;
  checkpointClose?: number | null;
  targetDate: string;
  evaluatedSessionDate: string;
  minimumMovePct?: number;
}): {
  classification: OptionFlowCheckpointClassification;
  directionalReturnPct: number | null;
  rawReturnPct: number | null;
  formula: string;
} {
  const sourceClose = finite(input.sourceClose);
  const checkpointClose = finite(input.checkpointClose);
  const rawReturnPct = percentChange(sourceClose, checkpointClose);
  const bias = String(input.flowBias ?? "").toLowerCase();
  const threshold = Math.max(0.01, finite(input.minimumMovePct) ?? 0.25);

  if (input.evaluatedSessionDate < input.targetDate) {
    return {
      classification: "horizon_still_open",
      directionalReturnPct: null,
      rawReturnPct: round(rawReturnPct),
      formula: "checkpoint session precedes the frozen target date",
    };
  }
  if (rawReturnPct == null || !["bullish", "bearish"].includes(bias)) {
    return {
      classification: "insufficient_evidence",
      directionalReturnPct: null,
      rawReturnPct: round(rawReturnPct),
      formula: "requires verified source/checkpoint closes and a directional original flow bias",
    };
  }
  const directionalReturnPct = bias === "bearish" ? -rawReturnPct : rawReturnPct;
  return {
    classification:
      directionalReturnPct >= threshold ? "price_confirms_flow" : "price_diverges_from_flow",
    directionalReturnPct: round(directionalReturnPct),
    rawReturnPct: round(rawReturnPct),
    formula: `directional_return = ${bias === "bearish" ? "-1" : "1"} * ((checkpoint_close / source_close) - 1) * 100; threshold=${threshold}%`,
  };
}
