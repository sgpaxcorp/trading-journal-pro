const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeJournalSyncDates(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(isValidIsoDate)
    )
  ).sort((left, right) => right.localeCompare(left));
}

export function canSyncJournalDate(requestedDate: string, importedDates: unknown): boolean {
  const dates = normalizeJournalSyncDates(importedDates);
  return dates.length === 0 || dates.includes(requestedDate);
}
