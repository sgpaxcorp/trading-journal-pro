export type WithdrawalFrequency = "monthly" | "quarterly" | "semiannual";

export type PlannedWithdrawalStatus = "pending" | "taken" | "skipped";

export type PlannedWithdrawalSettings = {
  enabled: boolean;
  frequency: WithdrawalFrequency;
  amount: number;
  startPeriodIndex?: number | null;
};

export type PlannedWithdrawalEvent = {
  id: string;
  amount: number;
  targetEquity: number;
  status?: PlannedWithdrawalStatus;
  achievedAt?: string | null;
  decidedAt?: string | null;
  plannedDate?: string | null;
  periodIndex?: number | null;
  periodLabel?: string | null;
  frequency?: WithdrawalFrequency | null;
  projectedEquityBeforeWithdrawal?: number | null;
  projectedEquityAfterWithdrawal?: number | null;
};

export type ProjectionRow = {
  day: number;
  isoDate: string;
  type: "goal" | "loss";
  pct: number;
  startBalance: number;
  expectedUSD: number;
  withdrawalUSD: number;
  endBalance: number;
  cumulativeWithdrawals: number;
};

export type CadenceTarget = {
  targetEquity: number;
  targetDate: string | null;
  monthIndex?: number;
  weekIndex?: number;
  weeksInMonth?: number;
  monthGoal?: number;
  monthLabel?: string;
  monthStartBalance?: number;
  monthEndBalance?: number;
  monthWithdrawal?: number;
  cumulativeWithdrawals?: number;
};

export type ProjectionResult = {
  rows: ProjectionRow[];
  requiredGoalPct: number;
  tradingDays: string[];
  withdrawals: PlannedWithdrawalEvent[];
  milestones: CadenceTarget[];
};

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : 0)));
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `pw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function observedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  if (day === 0) return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return date;
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekdayOffset = (7 + weekday - firstOfMonth.getDay()) % 7;
  const day = 1 + firstWeekdayOffset + 7 * (n - 1);
  return new Date(year, month, day);
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastOfMonth = new Date(year, month + 1, 0);
  const offsetBack = (7 + lastOfMonth.getDay() - weekday) % 7;
  const day = lastOfMonth.getDate() - offsetBack;
  return new Date(year, month, day);
}

function getEasterDate(year: number): Date {
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

function getUsMarketHolidayDates(year: number): string[] {
  const holidays: string[] = [];
  holidays.push(toYMD(observedDate(new Date(year, 0, 1))));
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 0, 1, 3)));
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 1, 1, 3)));
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
  holidays.push(toYMD(goodFriday));
  holidays.push(toYMD(getLastWeekdayOfMonth(year, 4, 1)));
  holidays.push(toYMD(observedDate(new Date(year, 5, 19))));
  holidays.push(toYMD(observedDate(new Date(year, 6, 4))));
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 8, 1, 1)));
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 10, 4, 4)));
  holidays.push(toYMD(observedDate(new Date(year, 11, 25))));
  return holidays;
}

export function listTradingDaysBetween(startIso: string, endIso: string): string[] {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return [];
  const start = s <= e ? s : e;
  const end = s <= e ? e : s;
  const years: number[] = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) years.push(y);
  const holidaySet = new Set(years.flatMap(getUsMarketHolidayDates));

  const days: string[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const ds = toYMD(d);
    const dow = d.getDay();
    const isTradingDay = dow !== 0 && dow !== 6 && !holidaySet.has(ds);
    if (isTradingDay) days.push(ds);
  }
  return days;
}

export function computeTradingDaysBetween(startIso: string, endIso: string): number {
  return listTradingDaysBetween(startIso, endIso).length;
}

function normalizeFrequency(raw: unknown): WithdrawalFrequency {
  const value = String(raw ?? "").toLowerCase();
  if (value === "quarterly") return "quarterly";
  if (value === "semiannual" || value === "biannual") return "semiannual";
  return "monthly";
}

export function normalizeWithdrawalSettings(raw: unknown): PlannedWithdrawalSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    enabled: !!obj.enabled,
    frequency: normalizeFrequency(obj.frequency),
    amount: Math.max(0, toNum(obj.amount, 0)),
    startPeriodIndex: Math.max(1, clampInt(toNum(obj.startPeriodIndex ?? 1, 1), 1)),
  };
}

export function normalizePlannedWithdrawals(rows: unknown): PlannedWithdrawalEvent[] {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row: any) => ({
    id: String(row?.id ?? makeId()),
    amount: Math.max(0, toNum(row?.amount, 0)),
    targetEquity: Math.max(0, toNum(row?.targetEquity ?? row?.projectedEquityBeforeWithdrawal, 0)),
    status: row?.status === "taken" || row?.status === "skipped" ? row.status : "pending",
    achievedAt: row?.achievedAt ? String(row.achievedAt).slice(0, 10) : null,
    decidedAt: row?.decidedAt ? String(row.decidedAt).slice(0, 10) : null,
    plannedDate: row?.plannedDate ? String(row.plannedDate).slice(0, 10) : null,
    periodIndex: row?.periodIndex != null ? clampInt(toNum(row.periodIndex, 0), 0) : null,
    periodLabel: row?.periodLabel ? String(row.periodLabel) : null,
    frequency: row?.frequency ? normalizeFrequency(row.frequency) : null,
    projectedEquityBeforeWithdrawal:
      row?.projectedEquityBeforeWithdrawal != null
        ? Math.max(0, toNum(row.projectedEquityBeforeWithdrawal, 0))
        : null,
    projectedEquityAfterWithdrawal:
      row?.projectedEquityAfterWithdrawal != null
        ? Math.max(0, toNum(row.projectedEquityAfterWithdrawal, 0))
        : null,
  }));
}

export function inferWithdrawalSettingsFromEvents(rows: unknown): PlannedWithdrawalSettings | null {
  const events = normalizePlannedWithdrawals(rows);
  if (!events.length) return null;
  const first = events[0];
  const second = events[1];
  let frequency: WithdrawalFrequency = "monthly";
  if (first?.plannedDate && second?.plannedDate) {
    const a = new Date(`${first.plannedDate}T00:00:00Z`);
    const b = new Date(`${second.plannedDate}T00:00:00Z`);
    const monthDiff =
      (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    if (monthDiff >= 5) frequency = "semiannual";
    else if (monthDiff >= 2) frequency = "quarterly";
  }
  return {
    enabled: true,
    frequency,
    amount: first.amount,
    startPeriodIndex: Math.max(1, first.periodIndex ?? 1),
  };
}

function buildPeriodBuckets(tradingDays: string[], frequency: WithdrawalFrequency) {
  const monthGroups = new Map<string, { monthIndex: number; startIndex: number; endIndex: number; monthKey: string }>();
  let monthIndex = 0;
  for (let i = 0; i < tradingDays.length; i++) {
    const monthKey = tradingDays[i].slice(0, 7);
    const existing = monthGroups.get(monthKey);
    if (existing) {
      existing.endIndex = i + 1;
      continue;
    }
    monthIndex += 1;
    monthGroups.set(monthKey, {
      monthIndex,
      startIndex: i + 1,
      endIndex: i + 1,
      monthKey,
    });
  }

  const months = Array.from(monthGroups.values()).sort((a, b) => a.monthIndex - b.monthIndex);
  const chunkSize = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 6;

  const buckets: Array<{
    periodIndex: number;
    periodLabel: string;
    startDayIndex: number;
    endDayIndex: number;
    endDate: string;
    monthIndex: number;
  }> = [];

  for (let i = 0; i < months.length; i += chunkSize) {
    const group = months.slice(i, i + chunkSize);
    if (!group.length) continue;
    const periodIndex = buckets.length + 1;
    const last = group[group.length - 1];
    buckets.push({
      periodIndex,
      periodLabel:
        frequency === "monthly"
          ? `Month ${periodIndex}`
          : frequency === "quarterly"
            ? `Quarter ${periodIndex}`
            : `Semester ${periodIndex}`,
      startDayIndex: group[0].startIndex,
      endDayIndex: last.endIndex,
      endDate: tradingDays[last.endIndex - 1] ?? tradingDays[tradingDays.length - 1],
      monthIndex: last.monthIndex,
    });
  }

  return buckets;
}

function buildWithdrawalSchedule(
  tradingDays: string[],
  settings: PlannedWithdrawalSettings | null,
  existingEvents?: PlannedWithdrawalEvent[]
) {
  if (!settings?.enabled || settings.amount <= 0 || tradingDays.length === 0) {
    return {
      events: [] as Array<{
        id: string;
        amount: number;
        endDayIndex: number;
        plannedDate: string;
        periodIndex: number;
        periodLabel: string;
        frequency: WithdrawalFrequency;
        existing?: PlannedWithdrawalEvent;
      }>,
      byDay: new Map<number, number>(),
    };
  }

  const normalizedExisting = normalizePlannedWithdrawals(existingEvents);
  const byKey = new Map<string, PlannedWithdrawalEvent>();
  normalizedExisting.forEach((event) => {
    const key = `${event.periodIndex ?? 0}|${event.plannedDate ?? ""}`;
    byKey.set(key, event);
  });

  const buckets = buildPeriodBuckets(tradingDays, settings.frequency);
  const startPeriodIndex = Math.max(1, settings.startPeriodIndex ?? 1);

  const events = buckets
    .filter((bucket) => bucket.periodIndex >= startPeriodIndex)
    .map((bucket) => {
      const key = `${bucket.periodIndex}|${bucket.endDate}`;
      return {
        id: byKey.get(key)?.id ?? makeId(),
        amount: settings.amount,
        endDayIndex: bucket.endDayIndex,
        plannedDate: bucket.endDate,
        periodIndex: bucket.periodIndex,
        periodLabel: bucket.periodLabel,
        frequency: settings.frequency,
        existing: byKey.get(key),
      };
    });

  const byDay = new Map<number, number>();
  events.forEach((event) => {
    byDay.set(event.endDayIndex, (byDay.get(event.endDayIndex) ?? 0) + event.amount);
  });

  return { events, byDay };
}

function simulatePlanRows(params: {
  starting: number;
  tradingDays: string[];
  lossDaysPerWeek: number;
  lossPct: number;
  goalPctDecimal: number;
  withdrawalByDay: Map<number, number>;
}) {
  const rows: ProjectionRow[] = [];
  const perWeek = clampInt(params.lossDaysPerWeek, 0, 5);
  let balance = params.starting;
  let cumulativeWithdrawals = 0;

  for (let i = 0; i < params.tradingDays.length; i++) {
    const day = i + 1;
    const dayInWeek = i % 5;
    const isLoss = perWeek > 0 && dayInWeek < perWeek;
    const pctDecimal = isLoss ? -(params.lossPct / 100) : params.goalPctDecimal;
    const startBalance = balance;
    const expectedUSD = startBalance * pctDecimal;
    const beforeWithdrawal = startBalance + expectedUSD;
    const withdrawalUSD = params.withdrawalByDay.get(day) ?? 0;
    const endBalance = beforeWithdrawal - withdrawalUSD;
    cumulativeWithdrawals += withdrawalUSD;

    rows.push({
      day,
      isoDate: params.tradingDays[i],
      type: isLoss ? "loss" : "goal",
      pct: pctDecimal * 100,
      startBalance,
      expectedUSD,
      withdrawalUSD,
      endBalance,
      cumulativeWithdrawals,
    });

    balance = endBalance;
  }

  return rows;
}

function solveRequiredGoalPct(params: {
  starting: number;
  target: number;
  tradingDays: string[];
  lossDaysPerWeek: number;
  lossPct: number;
  withdrawalByDay: Map<number, number>;
}) {
  if (params.starting <= 0 || params.target <= 0 || params.tradingDays.length === 0) return 0;

  const endWithGoal = (goalPctDecimal: number) => {
    const rows = simulatePlanRows({
      starting: params.starting,
      tradingDays: params.tradingDays,
      lossDaysPerWeek: params.lossDaysPerWeek,
      lossPct: params.lossPct,
      goalPctDecimal,
      withdrawalByDay: params.withdrawalByDay,
    });
    return rows[rows.length - 1]?.endBalance ?? params.starting;
  };

  if (endWithGoal(0) >= params.target) return 0;

  let low = 0;
  let high = 0.01;
  while (endWithGoal(high) < params.target && high < 25) high *= 2;

  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (endWithGoal(mid) >= params.target) high = mid;
    else low = mid;
  }

  return high;
}

function buildMilestonesFromRows(
  rows: ProjectionRow[],
  tradingDays: string[]
): CadenceTarget[] {
  if (!rows.length || !tradingDays.length) return [];

  const monthMap = new Map<string, number[]>();
  for (let i = 0; i < tradingDays.length; i++) {
    const monthKey = tradingDays[i]?.slice(0, 7) ?? "";
    if (!monthKey) continue;
    const list = monthMap.get(monthKey) ?? [];
    list.push(i + 1);
    monthMap.set(monthKey, list);
  }

  const milestones: CadenceTarget[] = [];
  let monthIndex = 0;
  for (const [monthKey, indices] of monthMap.entries()) {
    if (!indices.length) continue;
    monthIndex += 1;
    const startIndex = indices[0];
    const endIndex = indices[indices.length - 1];
    const startRow = rows[startIndex - 1];
    const endRow = rows[endIndex - 1];
    const monthStartBalance = startIndex > 1 ? rows[startIndex - 2]?.endBalance ?? rows[0].startBalance : rows[0].startBalance;
    const monthEndBalance = endRow?.endBalance ?? monthStartBalance;
    const monthGoalProfit = indices.reduce((sum, idx) => sum + (rows[idx - 1]?.expectedUSD ?? 0), 0);
    const monthWithdrawal = indices.reduce((sum, idx) => sum + (rows[idx - 1]?.withdrawalUSD ?? 0), 0);
    const weeksInMonth = Math.max(1, Math.ceil(indices.length / 5));

    for (let w = 1; w <= weeksInMonth; w++) {
      const weekEndIndex = Math.min(endIndex, startIndex + w * 5 - 1);
      const weekEndRow = rows[weekEndIndex - 1];
      milestones.push({
        targetEquity: Number((weekEndRow?.endBalance ?? monthEndBalance).toFixed(2)),
        targetDate: tradingDays[weekEndIndex - 1] ?? tradingDays[tradingDays.length - 1] ?? null,
        monthIndex,
        weekIndex: w,
        weeksInMonth,
        monthGoal: Number(monthGoalProfit.toFixed(2)),
        monthLabel: monthKey,
        monthStartBalance: Number(monthStartBalance.toFixed(2)),
        monthEndBalance: Number(monthEndBalance.toFixed(2)),
        monthWithdrawal: Number(monthWithdrawal.toFixed(2)),
        cumulativeWithdrawals: Number((weekEndRow?.cumulativeWithdrawals ?? 0).toFixed(2)),
      });
    }
  }

  return milestones;
}

export function buildPlanProjection(params: {
  starting: number;
  target: number;
  startIso: string;
  targetIso: string;
  lossDaysPerWeek: number;
  maxDailyLossPercent: number;
  withdrawalSettings?: PlannedWithdrawalSettings | null;
  existingWithdrawals?: PlannedWithdrawalEvent[] | null;
}) : ProjectionResult {
  if (params.starting <= 0 || params.target <= 0) {
    return { rows: [], requiredGoalPct: 0, tradingDays: [], withdrawals: [], milestones: [] };
  }

  const tradingDays = listTradingDaysBetween(params.startIso, params.targetIso);
  if (!tradingDays.length) {
    return { rows: [], requiredGoalPct: 0, tradingDays: [], withdrawals: [], milestones: [] };
  }

  const schedule = buildWithdrawalSchedule(
    tradingDays,
    params.withdrawalSettings ?? null,
    params.existingWithdrawals ?? []
  );

  const goalPctDecimal = solveRequiredGoalPct({
    starting: params.starting,
    target: params.target,
    tradingDays,
    lossDaysPerWeek: params.lossDaysPerWeek,
    lossPct: Math.max(0, params.maxDailyLossPercent),
    withdrawalByDay: schedule.byDay,
  });

  const rows = simulatePlanRows({
    starting: params.starting,
    tradingDays,
    lossDaysPerWeek: params.lossDaysPerWeek,
    lossPct: Math.max(0, params.maxDailyLossPercent),
    goalPctDecimal,
    withdrawalByDay: schedule.byDay,
  });

  const withdrawals = schedule.events.map((event) => {
    const row = rows[event.endDayIndex - 1];
    const before = row ? row.endBalance + row.withdrawalUSD : 0;
    const after = row?.endBalance ?? 0;
    return {
      id: event.id,
      amount: event.amount,
      targetEquity: Number(before.toFixed(2)),
      status: event.existing?.status ?? "pending",
      achievedAt: event.existing?.achievedAt ?? null,
      decidedAt: event.existing?.decidedAt ?? null,
      plannedDate: event.plannedDate,
      periodIndex: event.periodIndex,
      periodLabel: event.periodLabel,
      frequency: event.frequency,
      projectedEquityBeforeWithdrawal: Number(before.toFixed(2)),
      projectedEquityAfterWithdrawal: Number(after.toFixed(2)),
    } satisfies PlannedWithdrawalEvent;
  });

  const milestones = buildMilestonesFromRows(rows, tradingDays);

  return {
    rows,
    requiredGoalPct: goalPctDecimal * 100,
    tradingDays,
    withdrawals,
    milestones,
  };
}

export function getTotalPlannedWithdrawalAmount(rows: unknown): number {
  return normalizePlannedWithdrawals(rows)
    .filter((row) => row.status !== "skipped")
    .reduce((sum, row) => sum + row.amount, 0);
}

export function getTakenPlannedWithdrawalAmount(rows: unknown): number {
  return normalizePlannedWithdrawals(rows)
    .filter((row) => row.status === "taken")
    .reduce((sum, row) => sum + row.amount, 0);
}
