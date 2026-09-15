export type RecurringBillingCycle = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";

export type RenewalSchedule = {
  billing_cycle: RecurringBillingCycle | "one_time";
  starts_at?: string | null;
  next_renewal_at?: string | null;
  ends_at?: string | null;
  auto_renews?: boolean | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

export type BillingEvent = {
  date: Date;
  kind: "renewal" | "expiration";
};

export type RenewalNoticeStage = "due_soon" | "next_month" | "upcoming";

const DAY_MS = 86_400_000;

export function parseCalendarDate(value?: string | null) {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function calendarDateToIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarDaysUntil(target: Date, base: Date) {
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const baseUtc = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  return Math.round((targetUtc - baseUtc) / DAY_MS);
}

function addMonthsClamped(date: Date, months: number, preferredDay: number) {
  const firstOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0
  ).getDate();
  firstOfTargetMonth.setDate(Math.min(preferredDay, lastDay));
  return firstOfTargetMonth;
}

function addBillingStep(date: Date, cycle: RecurringBillingCycle, preferredDay: number) {
  if (cycle === "weekly") {
    const next = new Date(date);
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (cycle === "monthly") return addMonthsClamped(date, 1, preferredDay);
  if (cycle === "quarterly") return addMonthsClamped(date, 3, preferredDay);
  if (cycle === "semiannual") return addMonthsClamped(date, 6, preferredDay);
  return addMonthsClamped(date, 12, preferredDay);
}

export function getNextBillingEvent(schedule: RenewalSchedule, today = new Date()): BillingEvent | null {
  if ((schedule.is_active ?? true) === false || schedule.billing_cycle === "one_time") return null;

  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const contractEnd = parseCalendarDate(schedule.ends_at);
  const explicitRenewal = parseCalendarDate(schedule.next_renewal_at);
  const autoRenews = schedule.auto_renews ?? true;

  if (!autoRenews) {
    const expiration = explicitRenewal ?? contractEnd;
    if (!expiration || expiration < currentDate) return null;
    return { date: expiration, kind: "expiration" };
  }

  if (contractEnd && contractEnd < currentDate) return null;

  const startDate = parseCalendarDate(schedule.starts_at) ?? parseCalendarDate(schedule.created_at);
  const base = explicitRenewal ?? startDate;
  if (!base) return null;

  const preferredDay = startDate?.getDate() ?? base.getDate();
  // A start date is the first paid period. Its next billing event is one full
  // cycle later; an explicit renewal date already represents the next event.
  let next = explicitRenewal
    ? new Date(explicitRenewal)
    : addBillingStep(base, schedule.billing_cycle, preferredDay);
  let guard = 0;
  while (next < currentDate && guard < 5_000) {
    next = addBillingStep(next, schedule.billing_cycle, preferredDay);
    guard += 1;
  }

  if (guard >= 5_000 || (contractEnd && next > contractEnd)) return null;
  return { date: next, kind: "renewal" };
}

export function getRenewalNoticeStage(
  event: BillingEvent,
  today = new Date(),
  alertDays = 7
): RenewalNoticeStage | null {
  const days = calendarDaysUntil(event.date, today);
  if (days < 0) return null;
  if (days <= Math.max(1, Math.round(alertDays))) return "due_soon";

  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  if (
    event.date.getFullYear() === nextMonth.getFullYear() &&
    event.date.getMonth() === nextMonth.getMonth()
  ) {
    return "next_month";
  }

  return days <= 30 ? "upcoming" : null;
}
