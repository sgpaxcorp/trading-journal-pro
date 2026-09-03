export const TRADING_INSTRUMENTS = [
  "stocks",
  "options",
  "futures",
  "forex",
  "crypto",
  "other",
] as const;

export type TradingInstrument = (typeof TRADING_INSTRUMENTS)[number];

export const TRADING_RUNWAY_UNITS = ["days", "weeks", "months", "years"] as const;

export type TradingRunwayUnit = (typeof TRADING_RUNWAY_UNITS)[number];

export const MAX_TRADING_RUNWAY_YEARS = 50;

const MAX_TRADING_RUNWAY_BY_UNIT: Record<TradingRunwayUnit, number> = {
  days: 18_262,
  weeks: 2_608,
  months: MAX_TRADING_RUNWAY_YEARS * 12,
  years: MAX_TRADING_RUNWAY_YEARS,
};

export function getTradingRunwayLimit(unit: TradingRunwayUnit): number {
  return MAX_TRADING_RUNWAY_BY_UNIT[unit];
}

export function clampTradingRunwayAmount(amount: number, unit: TradingRunwayUnit): number {
  const normalizedAmount = Math.floor(Number.isFinite(amount) ? amount : 1);
  return Math.max(1, Math.min(getTradingRunwayLimit(unit), normalizedAmount));
}

export type TradingCalendarProfile = {
  key: "nyse" | "cboe" | "cme_estimate" | "fx_weekday" | "crypto_24_7" | "weekday";
  sessionsPerWeek: 5 | 7;
  excludesNyseHolidays: boolean;
  isEstimate: boolean;
};

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number): Date {
  const first = new Date(year, month, 1);
  const offset = (7 + weekday - first.getDay()) % 7;
  return new Date(year, month, 1 + offset + 7 * (occurrence - 1));
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (7 + last.getDay() - weekday) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function observedFixedHoliday(date: Date): Date {
  if (date.getDay() === 6) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  }
  if (date.getDay() === 0) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  return date;
}

const nyseClosureCache = new Map<number, Set<string>>();

function nyseClosuresForYear(year: number): Set<string> {
  const cached = nyseClosureCache.get(year);
  if (cached) return cached;
  const closures = new Set(getNyseFullClosureDates(year));
  nyseClosureCache.set(year, closures);
  return closures;
}

export function getNyseFullClosureDates(year: number): string[] {
  const holidays: Date[] = [];
  const newYearsDay = new Date(year, 0, 1);

  // NYSE does not observe New Year's Day on the prior Friday when January 1 is Saturday.
  if (newYearsDay.getDay() !== 6) holidays.push(observedFixedHoliday(newYearsDay));

  holidays.push(nthWeekdayOfMonth(year, 0, 1, 3));
  holidays.push(nthWeekdayOfMonth(year, 1, 1, 3));

  const easter = easterDate(year);
  holidays.push(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2));
  holidays.push(lastWeekdayOfMonth(year, 4, 1));

  if (year >= 2022) holidays.push(observedFixedHoliday(new Date(year, 5, 19)));

  holidays.push(observedFixedHoliday(new Date(year, 6, 4)));
  holidays.push(nthWeekdayOfMonth(year, 8, 1, 1));
  holidays.push(nthWeekdayOfMonth(year, 10, 4, 4));
  holidays.push(observedFixedHoliday(new Date(year, 11, 25)));

  return [...new Set(holidays.map(toIsoDate))].sort();
}

export function normalizeTradingInstrument(value: unknown): TradingInstrument {
  const normalized = String(value ?? "").trim().toLowerCase();
  return TRADING_INSTRUMENTS.includes(normalized as TradingInstrument)
    ? (normalized as TradingInstrument)
    : "stocks";
}

export function normalizeTradingRunwayUnit(value: unknown): TradingRunwayUnit {
  const normalized = String(value ?? "").trim().toLowerCase();
  return TRADING_RUNWAY_UNITS.includes(normalized as TradingRunwayUnit)
    ? (normalized as TradingRunwayUnit)
    : "months";
}

export function getTradingCalendarProfile(instrument: TradingInstrument): TradingCalendarProfile {
  if (instrument === "stocks") {
    return { key: "nyse", sessionsPerWeek: 5, excludesNyseHolidays: true, isEstimate: false };
  }
  if (instrument === "options") {
    return { key: "cboe", sessionsPerWeek: 5, excludesNyseHolidays: true, isEstimate: false };
  }
  if (instrument === "futures") {
    return { key: "cme_estimate", sessionsPerWeek: 5, excludesNyseHolidays: false, isEstimate: true };
  }
  if (instrument === "forex") {
    return { key: "fx_weekday", sessionsPerWeek: 5, excludesNyseHolidays: false, isEstimate: true };
  }
  if (instrument === "crypto") {
    return { key: "crypto_24_7", sessionsPerWeek: 7, excludesNyseHolidays: false, isEstimate: false };
  }
  return { key: "weekday", sessionsPerWeek: 5, excludesNyseHolidays: false, isEstimate: true };
}

export function isTradingSessionDate(
  dateIso: string,
  instrument: TradingInstrument = "stocks"
): boolean {
  const date = parseIsoDate(dateIso);
  if (!date) return false;

  const profile = getTradingCalendarProfile(instrument);
  if (profile.sessionsPerWeek === 7) return true;
  if (date.getDay() === 0 || date.getDay() === 6) return false;
  return !profile.excludesNyseHolidays || !nyseClosuresForYear(date.getFullYear()).has(dateIso);
}

export function listTradingSessionsBetween(
  startIso: string,
  endIso: string,
  instrument: TradingInstrument = "stocks"
): string[] {
  const first = parseIsoDate(startIso);
  const last = parseIsoDate(endIso);
  if (!first || !last) return [];

  const start = first <= last ? first : last;
  const end = first <= last ? last : first;
  const sessions: string[] = [];
  for (
    let date = new Date(start);
    date <= end;
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  ) {
    const dateIso = toIsoDate(date);
    if (isTradingSessionDate(dateIso, instrument)) sessions.push(dateIso);
  }

  return sessions;
}

export function listTradingSessionsFrom(
  startIso: string,
  count: number,
  instrument: TradingInstrument = "stocks"
): string[] {
  const start = parseIsoDate(startIso);
  const targetCount = Math.max(0, Math.min(5000, Math.floor(count)));
  if (!start || targetCount <= 0) return [];

  const sessions: string[] = [];
  let cursor = new Date(start);
  while (sessions.length < targetCount) {
    const cursorIso = toIsoDate(cursor);
    if (isTradingSessionDate(cursorIso, instrument)) sessions.push(cursorIso);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return sessions;
}

export function computeTradingSessionsBetween(
  startIso: string,
  endIso: string,
  instrument: TradingInstrument = "stocks"
): number {
  return listTradingSessionsBetween(startIso, endIso, instrument).length;
}

export function addTradingRunway(
  startIso: string,
  amount: number,
  unit: TradingRunwayUnit
): string {
  const start = parseIsoDate(startIso);
  if (!start) return startIso;
  const normalizedAmount = clampTradingRunwayAmount(amount, unit);

  if (unit === "days" || unit === "weeks") {
    start.setDate(start.getDate() + normalizedAmount * (unit === "weeks" ? 7 : 1));
    return toIsoDate(start);
  }

  const originalDay = start.getDate();
  const monthOffset = normalizedAmount * (unit === "years" ? 12 : 1);
  start.setDate(1);
  start.setMonth(start.getMonth() + monthOffset);
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  start.setDate(Math.min(originalDay, lastDay));
  return toIsoDate(start);
}

export function inferTradingRunway(startIso: string, targetIso: string): {
  amount: number;
  unit: TradingRunwayUnit;
} {
  const start = parseIsoDate(startIso);
  const target = parseIsoDate(targetIso);
  if (!start || !target || target <= start) return { amount: 1, unit: "years" };

  for (let amount = 1; amount <= getTradingRunwayLimit("years"); amount += 1) {
    if (addTradingRunway(startIso, amount, "years") === targetIso) return { amount, unit: "years" };
  }
  for (let amount = 1; amount <= getTradingRunwayLimit("months"); amount += 1) {
    if (addTradingRunway(startIso, amount, "months") === targetIso) return { amount, unit: "months" };
  }
  for (let amount = 1; amount <= getTradingRunwayLimit("weeks"); amount += 1) {
    if (addTradingRunway(startIso, amount, "weeks") === targetIso) return { amount, unit: "weeks" };
  }

  const days = Math.max(1, Math.round((target.getTime() - start.getTime()) / 86_400_000));
  return { amount: clampTradingRunwayAmount(days, "days"), unit: "days" };
}
