export const NOT_TRADED_JOURNAL_TAG = "NTJ:NOT_TRADED";

export type JournalSessionStatus = "traded" | "not_traded";

type JournalSessionRecord = {
  sessionStatus?: unknown;
  session_status?: unknown;
  notes?: unknown;
  tags?: unknown;
};

function normalizeStatus(value: unknown): JournalSessionStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["not_traded", "not-traded", "no_trade", "no-trade"].includes(normalized)) {
    return "not_traded";
  }
  if (normalized === "traded") return "traded";
  return null;
}

function notesStatus(notes: unknown): JournalSessionStatus | null {
  if (!notes || typeof notes !== "string") return null;
  try {
    const parsed = JSON.parse(notes);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return normalizeStatus((parsed as Record<string, unknown>).session_status);
  } catch {
    return null;
  }
}

export function getJournalSessionStatus(record?: JournalSessionRecord | null): JournalSessionStatus {
  if (!record) return "traded";
  const direct = normalizeStatus(record.sessionStatus ?? record.session_status);
  if (direct) return direct;
  const tags = Array.isArray(record.tags) ? record.tags.map((tag) => String(tag)) : [];
  if (tags.includes(NOT_TRADED_JOURNAL_TAG)) return "not_traded";
  return notesStatus(record.notes) ?? "traded";
}

export function isNotTradedJournalEntry(record?: JournalSessionRecord | null) {
  return getJournalSessionStatus(record) === "not_traded";
}

export function applyJournalSessionStatusTags(
  tags: unknown,
  status: JournalSessionStatus
): string[] {
  const clean = Array.isArray(tags)
    ? Array.from(new Set(tags.map((tag) => String(tag).trim()).filter(Boolean)))
    : [];
  const withoutMarker = clean.filter((tag) => tag !== NOT_TRADED_JOURNAL_TAG);
  return status === "not_traded" ? [...withoutMarker, NOT_TRADED_JOURNAL_TAG] : withoutMarker;
}
