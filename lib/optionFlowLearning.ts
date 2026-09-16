export const OPTION_FLOW_MARKET_TIME_ZONE = "America/New_York";
export const OPTION_FLOW_CONFIRMATION_THRESHOLD_PCT = 0.25;
export const OPTION_FLOW_WINDOW_START_MINUTES = 13 * 60 + 30;
export const OPTION_FLOW_WINDOW_END_MINUTES = 16 * 60 + 15;

export type OptionFlowDirection = "bullish" | "bearish" | "unknown";
export type OptionFlowVerdict =
  | "supports"
  | "partially_supports"
  | "does_not_support"
  | "insufficient_data";

export type OptionFlowCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type OptionFlowTrackedFlow = {
  contract: string;
  underlying: string;
  expiry: string | null;
  strike: number | null;
  type: string | null;
  side: string;
  direction: OptionFlowDirection;
  time: string | null;
  clockMinutes: number | null;
  timestamp: string | null;
  referenceUnderlyingPrice: number | null;
  entryOptionPrice?: number | null;
  premium: number;
  size: number | null;
  oi: number | null;
};

export type OptionFlowContractEvaluation = {
  status: "available" | "missing_entry_price" | "no_market_data";
  entryPrice: number | null;
  targetOpen: number | null;
  maxPrice: number | null;
  maxPriceAt: string | null;
  maxPriceReturnPct: number | null;
  minPrice: number | null;
  minPriceAt: string | null;
  minPriceReturnPct: number | null;
  closePrice: number | null;
  closePriceReturnPct: number | null;
  first25PctAt: string | null;
  first50PctAt: string | null;
  first100PctAt: string | null;
  minutesToMaxPrice: number | null;
  aggressorAlignedMaxPct: number | null;
  aggressorAlignedClosePct: number | null;
};

export type OptionFlowLateSessionBucket = {
  key: "positioning" | "transition" | "closing";
  label: string;
  startMinutes: number;
  endMinutes: number;
  printCount: number;
  callAskPremium: number;
  putAskPremium: number;
  callBidPremium: number;
  putBidPremium: number;
  bullishPremium: number;
  bearishPremium: number;
  netDirectionalPremium: number;
  bias: OptionFlowDirection | "mixed" | "neutral";
  spotStart: number | null;
  spotEnd: number | null;
  spotChangePct: number | null;
  topContracts: OptionFlowTrackedFlow[];
};

export type OptionFlowLateSessionTape = {
  version: 1;
  sourceSessionDate: string | null;
  window: string;
  totalPrints: number;
  buckets: OptionFlowLateSessionBucket[];
  regimeShift: {
    detected: boolean;
    at: string | null;
    from: OptionFlowDirection | "mixed" | "neutral" | null;
    to: OptionFlowDirection | "mixed" | "neutral" | null;
  };
  carryForwardBias: OptionFlowDirection | "mixed" | "neutral";
  closingContracts: OptionFlowTrackedFlow[];
};

export type OptionFlowEvaluation = {
  direction: OptionFlowDirection;
  verdict: OptionFlowVerdict;
  referencePrice: number;
  confirmationThresholdPct: number;
  firstConfirmedAt: string | null;
  minutesFromOpen: number | null;
  maxFavorablePct: number;
  maxFavorableAt: string | null;
  maxAdversePct: number;
  maxAdverseAt: string | null;
  closeDirectionalPct: number;
  closeRawPct: number;
};

export type OptionFlowMarketValidation = {
  version: 2;
  dataSource: string;
  interval: "5m";
  evaluatedAt: string;
  sourceSession: {
    date: string;
    close: number;
  };
  targetSession: {
    date: string;
    open: number;
    high: number;
    highAt: string;
    low: number;
    lowAt: string;
    close: number;
    gapPct: number;
    closeFromSourcePct: number;
  };
  thesis: OptionFlowEvaluation & {
    analysisBias: string;
    bullishPremium: number;
    bearishPremium: number;
  };
  flows: Array<
    OptionFlowTrackedFlow & {
      evaluation: OptionFlowEvaluation | null;
      contractEvaluation: OptionFlowContractEvaluation | null;
    }
  >;
  caveats: string[];
};

export type OptionFlowNormalizedRowLike = {
  symbol?: string | null;
  underlying?: string | null;
  sourceSessionDate?: string | null;
  expiry?: string | null;
  strike?: number | null;
  type?: string | null;
  side?: string | null;
  size?: number | null;
  premium?: number | null;
  oi?: number | null;
  time?: string | null;
  timestamp?: string | null;
  underlyingPrice?: number | null;
  tradePrice?: number | null;
  bid?: number | null;
  ask?: number | null;
};

const MARKET_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: OPTION_FLOW_MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const MARKET_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: OPTION_FLOW_MARKET_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, places = 4) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function partsRecord(formatter: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

export function marketDateKey(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = partsRecord(MARKET_DATE_FORMATTER, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function marketClockMinutes(value: Date | number | string): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = partsRecord(MARKET_CLOCK_FORMATTER, date);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

export function normalizeFlowSessionDateValue(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : marketDateKey(value);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\D|$)/);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = new Date(`${candidate}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
      ? candidate
      : null;
  }

  const us = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:\D|$)/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    const month = us[1].padStart(2, "0");
    const day = us[2].padStart(2, "0");
    const candidate = `${year}-${month}-${day}`;
    const parsed = new Date(`${candidate}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
      ? candidate
      : null;
  }
  return null;
}

export function flowRowSessionDate(row: Record<string, unknown>): string | null {
  const entries = Object.entries(row);
  const normalizedKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const candidate of ["sourcesessiondate", "tradedate", "date"]) {
    const match = entries.find(([key]) => normalizedKey(key) === candidate);
    const dateKey = normalizeFlowSessionDateValue(match?.[1]);
    if (dateKey) return dateKey;
  }
  for (const candidate of ["timestamp", "datetime"]) {
    const match = entries.find(([key]) => normalizedKey(key) === candidate);
    const raw = match?.[1];
    if (raw == null || raw === "") continue;
    const date = new Date(String(raw));
    if (!Number.isNaN(date.getTime())) return marketDateKey(date);
  }
  return null;
}

export function flowSessionDates(rows: Array<Record<string, unknown>>): string[] {
  return Array.from(new Set(rows.map(flowRowSessionDate).filter((value): value is string => Boolean(value))))
    .sort();
}

export function resolveFlowSessionDateForRows(
  rows: Array<Record<string, unknown>>,
  preferredDate?: string | null
): string | null {
  const dates = flowSessionDates(rows);
  if (preferredDate && dates.includes(preferredDate)) return preferredDate;
  return dates[dates.length - 1] ?? preferredDate ?? null;
}

export function parseFlowClockMinutes(value?: string | null): number | null {
  const seconds = parseFlowClockSeconds(value);
  return seconds == null ? null : Math.floor(seconds / 60);
}

export function parseFlowClockSeconds(value?: string | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^(?:0?\.\d+|1(?:\.0+)?)$/.test(text)) {
    const dayFraction = Number(text);
    if (Number.isFinite(dayFraction) && dayFraction >= 0 && dayFraction <= 1) {
      return Math.min(24 * 60 * 60 - 1, Math.round(dayFraction * 24 * 60 * 60));
    }
  }
  const timeMatches = Array.from(
    text.matchAll(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(AM|PM)?(?:\s|$)/gi)
  );
  const match = timeMatches[timeMatches.length - 1];
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const meridiem = String(match[4] ?? "").toUpperCase();
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    minute > 59 ||
    second > 59
  ) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (meridiem === "PM" && hour !== 12) hour += 12;
  }
  if (hour > 23) return null;
  return hour * 60 * 60 + minute * 60 + second;
}

function parseDateKey(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function addCalendarDays(dateKey: string, days: number): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return "";
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return date.toISOString().slice(0, 10);
}

export function nextWeekdayDateKey(dateKey: string): string {
  let next = addCalendarDays(dateKey, 1);
  for (let guard = 0; guard < 7 && next; guard += 1) {
    const day = new Date(`${next}T12:00:00Z`).getUTCDay();
    if (day >= 1 && day <= 5) return next;
    next = addCalendarDays(next, 1);
  }
  return next;
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = partsRecord(formatter, date);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

export function zonedDateTimeToUtc(
  dateKey: string,
  hour: number,
  minute = 0,
  timeZone = OPTION_FLOW_MARKET_TIME_ZONE
): Date {
  const parts = parseDateKey(dateKey);
  if (!parts) return new Date(Number.NaN);
  const wallClockUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0);
  let candidate = new Date(wallClockUtc);
  candidate = new Date(wallClockUtc - timeZoneOffsetMs(candidate, timeZone));
  candidate = new Date(wallClockUtc - timeZoneOffsetMs(candidate, timeZone));
  return candidate;
}

export function buildLearningSchedule(sourceSessionDate: string) {
  const targetSessionDate = nextWeekdayDateKey(sourceSessionDate);
  return {
    sourceSessionDate,
    targetSessionDate,
    evaluationDueAt: zonedDateTimeToUtc(targetSessionDate, 17).toISOString(),
  };
}

export function resolveSourceSessionDate(
  rows: OptionFlowNormalizedRowLike[],
  now: Date = new Date()
): string {
  const rowDates = rows
    .map((row) => row.sourceSessionDate || (row.timestamp ? marketDateKey(row.timestamp) : ""))
    .filter(Boolean)
    .sort();
  if (rowDates.length) return rowDates[rowDates.length - 1];

  let fallback = marketDateKey(now);
  while (fallback) {
    const day = new Date(`${fallback}T12:00:00Z`).getUTCDay();
    if (day >= 1 && day <= 5) return fallback;
    fallback = addCalendarDays(fallback, -1);
  }
  return marketDateKey(now);
}

export function directionFromOptionPrint(
  typeValue?: string | null,
  sideValue?: string | null
): OptionFlowDirection {
  const type = String(typeValue ?? "").trim().toUpperCase();
  const side = String(sideValue ?? "").trim().toUpperCase();
  if (type === "C" && side === "ASK") return "bullish";
  if (type === "P" && side === "ASK") return "bearish";
  if (type === "C" && side === "BID") return "bearish";
  if (type === "P" && side === "BID") return "bullish";
  return "unknown";
}

function optionPriceFromFlow(row: OptionFlowNormalizedRowLike): number | null {
  const tradePrice = finiteNumber(row.tradePrice);
  if (tradePrice != null && tradePrice > 0) return tradePrice;
  const bid = finiteNumber(row.bid);
  const ask = finiteNumber(row.ask);
  if (bid != null && ask != null && bid >= 0 && ask > 0) return (bid + ask) / 2;
  const premium = finiteNumber(row.premium);
  const size = finiteNumber(row.size);
  return premium != null && size != null && premium > 0 && size > 0
    ? premium / (size * 100)
    : null;
}

function trackedFlowCandidate(row: OptionFlowNormalizedRowLike, underlying: string) {
  const parsedClockSeconds = parseFlowClockSeconds(row.time);
  const timestampClockMinutes = row.timestamp ? marketClockMinutes(row.timestamp) : null;
  const clockMinutes = parsedClockSeconds != null
    ? Math.floor(parsedClockSeconds / 60)
    : timestampClockMinutes;
  const clockSeconds = parsedClockSeconds ??
    (timestampClockMinutes == null ? null : timestampClockMinutes * 60);
  const rowUnderlying = String(row.underlying ?? underlying).trim().toUpperCase();
  const type = String(row.type ?? "").trim().toUpperCase() || null;
  const side = String(row.side ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
  const strike = finiteNumber(row.strike);
  const expiry = String(row.expiry ?? "").trim() || null;
  const symbol = String(row.symbol ?? "").trim();
  const descriptiveContract = [
    rowUnderlying || underlying,
    expiry,
    strike == null ? null : `${strike}${type ?? ""}`,
  ]
    .filter(Boolean)
    .join(" ");
  const contract = symbol && symbol.toUpperCase() !== rowUnderlying
    ? symbol
    : descriptiveContract || symbol;
  return {
    clockSeconds,
    flow: {
      contract,
      underlying: rowUnderlying || underlying,
      expiry,
      strike,
      type,
      side,
      direction: directionFromOptionPrint(type, side),
      time: String(row.time ?? "").trim() || null,
      clockMinutes,
      timestamp: String(row.timestamp ?? "").trim() || null,
      referenceUnderlyingPrice: finiteNumber(row.underlyingPrice),
      entryOptionPrice: optionPriceFromFlow(row),
      premium: Math.max(0, finiteNumber(row.premium) ?? 0),
      size: finiteNumber(row.size),
      oi: finiteNumber(row.oi),
    } satisfies OptionFlowTrackedFlow,
  };
}

export function filterLateSessionFlowRows<T extends OptionFlowNormalizedRowLike>(rows: T[]): T[] {
  return rows.filter((row) => {
    const parsedClockSeconds = parseFlowClockSeconds(row.time);
    const timestampClockMinutes = row.timestamp ? marketClockMinutes(row.timestamp) : null;
    const clockSeconds = parsedClockSeconds ??
      (timestampClockMinutes == null ? null : timestampClockMinutes * 60);
    return clockSeconds != null &&
      clockSeconds >= OPTION_FLOW_WINDOW_START_MINUTES * 60 &&
      clockSeconds <= OPTION_FLOW_WINDOW_END_MINUTES * 60;
  });
}

export function buildLateSessionTrackedFlows(
  rows: OptionFlowNormalizedRowLike[],
  underlyingValue: string,
  limit = 200
): OptionFlowTrackedFlow[] {
  const underlying = underlyingValue.trim().toUpperCase();
  return rows
    .map((row) => trackedFlowCandidate(row, underlying))
    .filter(
      ({ clockSeconds, flow }) =>
        (!underlying || optionFlowUnderlyingsMatch(flow.underlying, underlying)) &&
        clockSeconds != null &&
        clockSeconds >= OPTION_FLOW_WINDOW_START_MINUTES * 60 &&
        clockSeconds <= OPTION_FLOW_WINDOW_END_MINUTES * 60
    )
    .sort((a, b) => b.flow.premium - a.flow.premium)
    .map(({ flow }) => flow)
    .slice(0, limit);
}

function directionalBucketBias(bullishPremium: number, bearishPremium: number) {
  const total = bullishPremium + bearishPremium;
  if (total <= 0) return "neutral" as const;
  if (bullishPremium >= bearishPremium * 1.2) return "bullish" as const;
  if (bearishPremium >= bullishPremium * 1.2) return "bearish" as const;
  return "mixed" as const;
}

function uniqueTopFlows(flows: OptionFlowTrackedFlow[], limit = 6) {
  const seen = new Set<string>();
  return [...flows]
    .sort((left, right) => right.premium - left.premium)
    .filter((flow) => {
      const key = `${flow.contract}|${flow.side}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function buildLateSessionTape(
  rows: OptionFlowNormalizedRowLike[],
  underlyingValue = "",
  sourceSessionDate?: string | null
): OptionFlowLateSessionTape {
  const selectedDate = sourceSessionDate || resolveSourceSessionDate(rows);
  const selectedRows = rows.filter((row) => {
    const rowDate = row.sourceSessionDate ||
      (row.timestamp ? marketDateKey(row.timestamp) : null);
    return !selectedDate || !rowDate || rowDate === selectedDate;
  });
  const underlying = underlyingValue.trim().toUpperCase() ||
    String(selectedRows.find((row) => row.underlying)?.underlying ?? "").trim().toUpperCase();
  const candidates = selectedRows
    .map((row) => ({ row, ...trackedFlowCandidate(row, underlying) }))
    .filter(({ clockSeconds, flow }) =>
      clockSeconds != null &&
      clockSeconds >= OPTION_FLOW_WINDOW_START_MINUTES * 60 &&
      clockSeconds <= OPTION_FLOW_WINDOW_END_MINUTES * 60 &&
      (!underlying || optionFlowUnderlyingsMatch(flow.underlying, underlying))
    );
  const definitions: Array<{
    key: OptionFlowLateSessionBucket["key"];
    label: string;
    startMinutes: number;
    endMinutes: number;
  }> = [
    { key: "positioning", label: "13:30-15:00 ET", startMinutes: 13 * 60 + 30, endMinutes: 15 * 60 },
    { key: "transition", label: "15:00-15:30 ET", startMinutes: 15 * 60, endMinutes: 15 * 60 + 30 },
    { key: "closing", label: "15:30-16:15 ET", startMinutes: 15 * 60 + 30, endMinutes: 16 * 60 + 15 },
  ];

  const buckets = definitions.map((definition) => {
    const bucketCandidates = candidates
      .filter(({ clockSeconds }) => {
        const minute = Number(clockSeconds) / 60;
        return minute >= definition.startMinutes &&
          (definition.key === "closing" ? minute <= definition.endMinutes : minute < definition.endMinutes);
      })
      .sort((left, right) => Number(left.clockSeconds) - Number(right.clockSeconds));
    let callAskPremium = 0;
    let putAskPremium = 0;
    let callBidPremium = 0;
    let putBidPremium = 0;
    let bullishPremium = 0;
    let bearishPremium = 0;
    for (const { flow } of bucketCandidates) {
      const weight = flow.premium > 0 ? flow.premium : Math.max(1, flow.size ?? 1) * 100;
      if (flow.type === "C" && flow.side === "ASK") callAskPremium += flow.premium;
      if (flow.type === "P" && flow.side === "ASK") putAskPremium += flow.premium;
      if (flow.type === "C" && flow.side === "BID") callBidPremium += flow.premium;
      if (flow.type === "P" && flow.side === "BID") putBidPremium += flow.premium;
      if (flow.direction === "bullish") bullishPremium += weight;
      if (flow.direction === "bearish") bearishPremium += weight;
    }
    const spotRows = bucketCandidates
      .map(({ clockSeconds, flow }) => ({
        clockSeconds: Number(clockSeconds),
        price: flow.referenceUnderlyingPrice,
      }))
      .filter((item): item is { clockSeconds: number; price: number } =>
        item.price != null && item.price > 0
      );
    const spotStart = spotRows[0]?.price ?? null;
    const spotEnd = spotRows[spotRows.length - 1]?.price ?? null;
    return {
      ...definition,
      printCount: bucketCandidates.length,
      callAskPremium: round(callAskPremium, 2),
      putAskPremium: round(putAskPremium, 2),
      callBidPremium: round(callBidPremium, 2),
      putBidPremium: round(putBidPremium, 2),
      bullishPremium: round(bullishPremium, 2),
      bearishPremium: round(bearishPremium, 2),
      netDirectionalPremium: round(bullishPremium - bearishPremium, 2),
      bias: directionalBucketBias(bullishPremium, bearishPremium),
      spotStart: spotStart == null ? null : round(spotStart),
      spotEnd: spotEnd == null ? null : round(spotEnd),
      spotChangePct:
        spotStart == null || spotEnd == null ? null : round(rawPct(spotEnd, spotStart)),
      topContracts: uniqueTopFlows(bucketCandidates.map(({ flow }) => flow)),
    } satisfies OptionFlowLateSessionBucket;
  });

  const directionalBuckets = buckets.filter(
    (bucket) => bucket.bias === "bullish" || bucket.bias === "bearish"
  );
  let regimeFrom: OptionFlowLateSessionTape["regimeShift"]["from"] = null;
  let regimeTo: OptionFlowLateSessionTape["regimeShift"]["to"] = null;
  let regimeAt: string | null = null;
  for (let index = 1; index < directionalBuckets.length; index += 1) {
    const previous = directionalBuckets[index - 1];
    const current = directionalBuckets[index];
    if (previous.bias !== current.bias) {
      regimeFrom = previous.bias;
      regimeTo = current.bias;
      regimeAt = current.label.split("-")[0] + " ET";
    }
  }
  const closing = buckets.find((bucket) => bucket.key === "closing");
  const lastActive = [...buckets].reverse().find((bucket) => bucket.printCount > 0);

  return {
    version: 1,
    sourceSessionDate: selectedDate || null,
    window: "13:30-16:15 America/New_York",
    totalPrints: candidates.length,
    buckets,
    regimeShift: {
      detected: Boolean(regimeFrom && regimeTo),
      at: regimeAt,
      from: regimeFrom,
      to: regimeTo,
    },
    carryForwardBias: closing?.printCount ? closing.bias : lastActive?.bias ?? "neutral",
    closingContracts: closing?.topContracts ?? [],
  };
}

export function optionFlowUnderlyingsMatch(leftValue: string, rightValue: string): boolean {
  const aliases: Record<string, string> = {
    SPXW: "SPX",
    NDXW: "NDX",
  };
  const normalize = (value: string) => {
    const cleaned = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return aliases[cleaned] ?? cleaned;
  };
  const left = normalize(leftValue);
  const right = normalize(rightValue);
  return Boolean(left && right && left === right);
}

export function filterSessionCandles(candles: OptionFlowCandle[], dateKey: string) {
  return candles
    .filter((candle) => {
      if (marketDateKey(candle.time) !== dateKey) return false;
      const minute = marketClockMinutes(candle.time);
      return minute != null && minute >= 9 * 60 + 30 && minute <= 16 * 60;
    })
    .sort((a, b) => a.time - b.time);
}

export function filterOptionSessionCandles(candles: OptionFlowCandle[], dateKey: string) {
  return candles
    .filter((candle) => {
      if (marketDateKey(candle.time) !== dateKey) return false;
      const minute = marketClockMinutes(candle.time);
      return minute != null && minute >= 9 * 60 + 30 && minute <= OPTION_FLOW_WINDOW_END_MINUTES;
    })
    .sort((a, b) => a.time - b.time);
}

function rawPct(price: number, reference: number) {
  return reference > 0 ? ((price / reference) - 1) * 100 : 0;
}

function candleTimestamp(candle?: OptionFlowCandle | null) {
  return candle ? new Date(candle.time).toISOString() : null;
}

export function evaluateOptionFlowContractResponse(
  flow: OptionFlowTrackedFlow,
  targetCandles: OptionFlowCandle[]
): OptionFlowContractEvaluation {
  const entryPrice = finiteNumber(flow.entryOptionPrice);
  if (!entryPrice || entryPrice <= 0) {
    return {
      status: "missing_entry_price",
      entryPrice: null,
      targetOpen: null,
      maxPrice: null,
      maxPriceAt: null,
      maxPriceReturnPct: null,
      minPrice: null,
      minPriceAt: null,
      minPriceReturnPct: null,
      closePrice: null,
      closePriceReturnPct: null,
      first25PctAt: null,
      first50PctAt: null,
      first100PctAt: null,
      minutesToMaxPrice: null,
      aggressorAlignedMaxPct: null,
      aggressorAlignedClosePct: null,
    };
  }
  if (!targetCandles.length) {
    return {
      status: "no_market_data",
      entryPrice: round(entryPrice),
      targetOpen: null,
      maxPrice: null,
      maxPriceAt: null,
      maxPriceReturnPct: null,
      minPrice: null,
      minPriceAt: null,
      minPriceReturnPct: null,
      closePrice: null,
      closePriceReturnPct: null,
      first25PctAt: null,
      first50PctAt: null,
      first100PctAt: null,
      minutesToMaxPrice: null,
      aggressorAlignedMaxPct: null,
      aggressorAlignedClosePct: null,
    };
  }

  const first = targetCandles[0];
  const last = targetCandles[targetCandles.length - 1];
  const high = [...targetCandles].sort((left, right) => right.high - left.high)[0];
  const low = [...targetCandles].sort((left, right) => left.low - right.low)[0];
  const maxPriceReturnPct = rawPct(high.high, entryPrice);
  const minPriceReturnPct = rawPct(low.low, entryPrice);
  const closePriceReturnPct = rawPct(last.close, entryPrice);
  const isSeller = flow.side === "BID";
  const thresholdCandle = (thresholdPct: number) =>
    isSeller
      ? targetCandles.find((candle) => candle.low <= entryPrice * (1 - thresholdPct / 100))
      : targetCandles.find((candle) => candle.high >= entryPrice * (1 + thresholdPct / 100));

  return {
    status: "available",
    entryPrice: round(entryPrice),
    targetOpen: round(first.open),
    maxPrice: round(high.high),
    maxPriceAt: candleTimestamp(high),
    maxPriceReturnPct: round(maxPriceReturnPct),
    minPrice: round(low.low),
    minPriceAt: candleTimestamp(low),
    minPriceReturnPct: round(minPriceReturnPct),
    closePrice: round(last.close),
    closePriceReturnPct: round(closePriceReturnPct),
    first25PctAt: candleTimestamp(thresholdCandle(25)),
    first50PctAt: candleTimestamp(thresholdCandle(50)),
    first100PctAt: candleTimestamp(thresholdCandle(100)),
    minutesToMaxPrice: Math.max(0, Math.round((high.time - first.time) / 60_000)),
    aggressorAlignedMaxPct: round(Math.max(0, isSeller ? -minPriceReturnPct : maxPriceReturnPct)),
    aggressorAlignedClosePct: round(isSeller ? -closePriceReturnPct : closePriceReturnPct),
  };
}

function evaluateDirection(
  direction: OptionFlowDirection,
  referencePrice: number,
  targetCandles: OptionFlowCandle[]
): OptionFlowEvaluation {
  const first = targetCandles[0];
  const last = targetCandles[targetCandles.length - 1];
  const highs = [...targetCandles].sort((a, b) => b.high - a.high);
  const lows = [...targetCandles].sort((a, b) => a.low - b.low);
  const high = highs[0];
  const low = lows[0];
  const highPct = rawPct(high.high, referencePrice);
  const lowPct = rawPct(low.low, referencePrice);
  const closeRawPct = rawPct(last.close, referencePrice);
  const bullish = direction === "bullish";
  const bearish = direction === "bearish";
  const maxFavorablePct = bullish ? highPct : bearish ? -lowPct : Math.max(highPct, -lowPct);
  const maxAdversePct = bullish ? Math.max(0, -lowPct) : bearish ? Math.max(0, highPct) : 0;
  const closeDirectionalPct = bullish ? closeRawPct : bearish ? -closeRawPct : 0;
  const confirmationMultiplier = OPTION_FLOW_CONFIRMATION_THRESHOLD_PCT / 100;
  const firstConfirmed =
    direction === "bullish"
      ? targetCandles.find((candle) => candle.high >= referencePrice * (1 + confirmationMultiplier))
      : direction === "bearish"
        ? targetCandles.find((candle) => candle.low <= referencePrice * (1 - confirmationMultiplier))
        : undefined;

  let verdict: OptionFlowVerdict = "insufficient_data";
  if (direction !== "unknown") {
    if (closeDirectionalPct >= OPTION_FLOW_CONFIRMATION_THRESHOLD_PCT) verdict = "supports";
    else if (firstConfirmed || maxFavorablePct >= OPTION_FLOW_CONFIRMATION_THRESHOLD_PCT) {
      verdict = "partially_supports";
    } else if (
      closeDirectionalPct <= -OPTION_FLOW_CONFIRMATION_THRESHOLD_PCT ||
      maxAdversePct >= OPTION_FLOW_CONFIRMATION_THRESHOLD_PCT
    ) {
      verdict = "does_not_support";
    }
  }

  return {
    direction,
    verdict,
    referencePrice: round(referencePrice),
    confirmationThresholdPct: OPTION_FLOW_CONFIRMATION_THRESHOLD_PCT,
    firstConfirmedAt: candleTimestamp(firstConfirmed),
    minutesFromOpen: firstConfirmed ? Math.max(0, Math.round((firstConfirmed.time - first.time) / 60_000)) : null,
    maxFavorablePct: round(Math.max(0, maxFavorablePct)),
    maxFavorableAt: candleTimestamp(bullish ? high : bearish ? low : null),
    maxAdversePct: round(maxAdversePct),
    maxAdverseAt: candleTimestamp(bullish ? low : bearish ? high : null),
    closeDirectionalPct: round(closeDirectionalPct),
    closeRawPct: round(closeRawPct),
  };
}

function nearestSourcePrice(
  flow: OptionFlowTrackedFlow,
  sourceCandles: OptionFlowCandle[],
  sourceClose: number
) {
  if (flow.referenceUnderlyingPrice && flow.referenceUnderlyingPrice > 0) {
    return flow.referenceUnderlyingPrice;
  }
  if (flow.clockMinutes == null || !sourceCandles.length) return sourceClose;
  const nearest = [...sourceCandles].sort((left, right) => {
    const leftMinute = marketClockMinutes(left.time) ?? 0;
    const rightMinute = marketClockMinutes(right.time) ?? 0;
    return Math.abs(leftMinute - flow.clockMinutes!) - Math.abs(rightMinute - flow.clockMinutes!);
  })[0];
  return nearest?.close ?? sourceClose;
}

export function inferTrackedFlowDirection(
  trackedFlows: OptionFlowTrackedFlow[],
  fallbackBias?: string | null
) {
  let bullishPremium = 0;
  let bearishPremium = 0;
  for (const flow of trackedFlows) {
    const weight = flow.premium > 0 ? flow.premium : Math.max(1, flow.size ?? 1) * 100;
    if (flow.direction === "bullish") bullishPremium += weight;
    if (flow.direction === "bearish") bearishPremium += weight;
  }
  let direction: OptionFlowDirection = "unknown";
  if (bullishPremium > bearishPremium * 1.2) direction = "bullish";
  else if (bearishPremium > bullishPremium * 1.2) direction = "bearish";
  else {
    const fallback = String(fallbackBias ?? "").toLowerCase();
    if (fallback === "bullish" || fallback === "bearish") direction = fallback;
  }
  return { direction, bullishPremium: round(bullishPremium, 2), bearishPremium: round(bearishPremium, 2) };
}

export function evaluateOptionFlowMarketResponse(input: {
  sourceSessionDate: string;
  targetSessionDate: string;
  candles: OptionFlowCandle[];
  trackedFlows: OptionFlowTrackedFlow[];
  analysisBias?: string | null;
  fallbackSourceClose?: number | null;
  contractCandlesBySymbol?: Record<string, OptionFlowCandle[]>;
  evaluatedAt?: Date;
}): OptionFlowMarketValidation | null {
  const sourceCandles = filterSessionCandles(input.candles, input.sourceSessionDate);
  const targetCandles = filterSessionCandles(input.candles, input.targetSessionDate);
  if (!targetCandles.length) return null;
  const sourceClose = sourceCandles[sourceCandles.length - 1]?.close ?? finiteNumber(input.fallbackSourceClose);
  if (!sourceClose || sourceClose <= 0) return null;

  const targetOpen = targetCandles[0].open;
  const targetClose = targetCandles[targetCandles.length - 1].close;
  const highCandle = [...targetCandles].sort((a, b) => b.high - a.high)[0];
  const lowCandle = [...targetCandles].sort((a, b) => a.low - b.low)[0];
  const inferred = inferTrackedFlowDirection(input.trackedFlows, input.analysisBias);
  const thesis = evaluateDirection(inferred.direction, sourceClose, targetCandles);
  const flows = input.trackedFlows.map((flow) => {
    const referencePrice = nearestSourcePrice(flow, sourceCandles, sourceClose);
    const contractCandles = filterOptionSessionCandles(
      input.contractCandlesBySymbol?.[flow.contract] ?? [],
      input.targetSessionDate
    );
    return {
      ...flow,
      evaluation:
        flow.direction === "unknown"
          ? null
          : evaluateDirection(flow.direction, referencePrice, targetCandles),
      contractEvaluation: evaluateOptionFlowContractResponse(flow, contractCandles),
    };
  });

  const caveats = [
    "Underlying confirmation and option-contract performance are measured separately.",
    "ASK/BID infers aggressor direction but does not prove whether the trader opened or closed the position.",
    "Contract results use observed one-minute option candles when available; they do not guarantee an executable fill at the candle high or low.",
    "Option premium changes include direction, decay, implied volatility, and spread effects.",
    "Confirmation time is approximate to the first five-minute candle that touched the threshold.",
  ];
  if (!input.trackedFlows.length) {
    caveats.unshift("No timestamped 1:30-4:15 PM ET prints were available; thesis timing uses the report bias only.");
  }

  return {
    version: 2,
    dataSource: "Yahoo Finance underlying and option-contract candles",
    interval: "5m",
    evaluatedAt: (input.evaluatedAt ?? new Date()).toISOString(),
    sourceSession: {
      date: input.sourceSessionDate,
      close: round(sourceClose),
    },
    targetSession: {
      date: input.targetSessionDate,
      open: round(targetOpen),
      high: round(highCandle.high),
      highAt: new Date(highCandle.time).toISOString(),
      low: round(lowCandle.low),
      lowAt: new Date(lowCandle.time).toISOString(),
      close: round(targetClose),
      gapPct: round(rawPct(targetOpen, sourceClose)),
      closeFromSourcePct: round(rawPct(targetClose, sourceClose)),
    },
    thesis: {
      ...thesis,
      analysisBias: String(input.analysisBias ?? "neutral"),
      bullishPremium: inferred.bullishPremium,
      bearishPremium: inferred.bearishPremium,
    },
    flows,
    caveats,
  };
}
