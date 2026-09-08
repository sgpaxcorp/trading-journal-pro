import { describe, expect, it } from "vitest";
import { canSyncJournalDate, normalizeJournalSyncDates } from "@/lib/journalSync";

describe("journal sync date selection", () => {
  it("normalizes, deduplicates, and orders imported dates newest first", () => {
    expect(
      normalizeJournalSyncDates([
        "2026-08-20",
        "bad-date",
        "2026-02-30",
        "2026-09-08",
        "2026-08-20",
      ])
    ).toEqual(["2026-09-08", "2026-08-20"]);
  });

  it("allows synchronization only when the selected journal date is in the statement", () => {
    expect(canSyncJournalDate("2026-09-08", ["2026-09-08"])).toBe(true);
    expect(canSyncJournalDate("2026-09-08", ["2026-08-20"])).toBe(false);
  });
});
