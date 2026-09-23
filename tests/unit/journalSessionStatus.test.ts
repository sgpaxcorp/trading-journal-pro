import { describe, expect, it } from "vitest";

import {
  applyJournalSessionStatusTags,
  getJournalSessionStatus,
  isNotTradedJournalEntry,
  NOT_TRADED_JOURNAL_TAG,
} from "@/lib/journalSessionStatus";

describe("journal session status", () => {
  it("recognizes a not-traded day from structured notes", () => {
    const entry = { notes: JSON.stringify({ session_status: "not_traded" }), tags: [] };
    expect(getJournalSessionStatus(entry)).toBe("not_traded");
    expect(isNotTradedJournalEntry(entry)).toBe(true);
  });

  it("recognizes the durable marker tag and defaults legacy entries to traded", () => {
    expect(getJournalSessionStatus({ tags: [NOT_TRADED_JOURNAL_TAG] })).toBe("not_traded");
    expect(getJournalSessionStatus({ notes: "legacy note", tags: [] })).toBe("traded");
  });

  it("adds and removes the marker without changing user tags", () => {
    const marked = applyJournalSessionStatusTags(["Calm", "Calm"], "not_traded");
    expect(marked).toEqual(["Calm", NOT_TRADED_JOURNAL_TAG]);
    expect(applyJournalSessionStatusTags(marked, "traded")).toEqual(["Calm"]);
  });
});
