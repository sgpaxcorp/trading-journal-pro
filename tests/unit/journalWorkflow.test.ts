import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  getJournalPersistenceErrorMessage,
  getJournalWizardPrimaryAction,
} from "@/lib/journalWorkflow";

describe("journal wizard actions", () => {
  it("advances before the final step", () => {
    expect(getJournalWizardPrimaryAction(0, 3)).toBe("next");
    expect(getJournalWizardPrimaryAction(1, 3)).toBe("next");
  });

  it("finishes on the final step instead of disabling the action", () => {
    expect(getJournalWizardPrimaryAction(2, 3)).toBe("finish");
    expect(getJournalWizardPrimaryAction(99, 3)).toBe("finish");
  });
});

describe("journal persistence errors", () => {
  it("turns the database primary-key failure into an actionable message", () => {
    expect(
      getJournalPersistenceErrorMessage(
        new Error('duplicate key value violates unique constraint "journal_entries_pkey"'),
        "es"
      )
    ).toContain("consolidar");
  });
});

describe("journal button wiring", () => {
  const journalPageSource = readFileSync(
    resolve(process.cwd(), "app/(private)/journal/[date]/page.tsx"),
    "utf8"
  );

  it("keeps the final Done action enabled and wired to completion", () => {
    expect(journalPageSource).toContain("onClick={handlePrimaryWizardAction}");
    expect(journalPageSource).not.toContain("disabled={currentStep >= stepCount - 1}");
    expect(journalPageSource).toContain('primaryWizardAction === "finish"');
  });

  it("gives every journal button an explicit non-submit type and click action", () => {
    const buttonOpenTags = journalPageSource.match(/<button\b[\s\S]*?>/g) ?? [];
    expect(buttonOpenTags.length).toBeGreaterThan(10);
    for (const button of buttonOpenTags) {
      expect(button).toContain('type="button"');
      expect(button).toMatch(/onClick=/);
    }
  });
});
