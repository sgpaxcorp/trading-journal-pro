import { describe, expect, it } from "vitest";

import {
  NOTEBOOK_TEMPLATES,
  normalizeNotebookPageStatus,
  normalizeNotebookPageType,
  normalizeNotebookScope,
  normalizeNotebookTags,
  notebookTemplateByKey,
  stripNotebookHtml,
} from "@/lib/notebookKnowledge";

describe("business notebook knowledge model", () => {
  it("keeps business knowledge separate from account evidence", () => {
    expect(normalizeNotebookScope("business")).toBe("business");
    expect(normalizeNotebookScope("account")).toBe("account");
    expect(normalizeNotebookScope("unknown")).toBe("account");
  });

  it("falls back to conservative page metadata", () => {
    expect(normalizeNotebookPageType("setup_playbook")).toBe("setup_playbook");
    expect(normalizeNotebookPageType("signal" as never)).toBe("general");
    expect(normalizeNotebookPageStatus("validated")).toBe("validated");
    expect(normalizeNotebookPageStatus("approved" as never)).toBe("draft");
  });

  it("normalizes, deduplicates, and caps tags", () => {
    const tags = normalizeNotebookTags([" Risk ", "risk", "A+ Setup", "", ...Array.from({ length: 30 }, (_, index) => `tag-${index}`)]);
    expect(tags.slice(0, 2)).toEqual(["risk", "a+ setup"]);
    expect(tags).toHaveLength(20);
  });

  it("ships decision-oriented templates in both languages", () => {
    expect(NOTEBOOK_TEMPLATES.map((template) => template.key)).toEqual(expect.arrayContaining([
      "daily-review",
      "lesson",
      "setup-playbook",
      "risk-rule",
      "research-thesis",
      "decision-log",
      "funded-program",
    ]));
    const lesson = notebookTemplateByKey("lesson");
    expect(lesson.pageType).toBe("lesson");
    expect(lesson.content.en).toContain("What would disprove it");
    expect(lesson.content.es).toContain("Qué la refutaría");
  });

  it("turns rich content into safe searchable text", () => {
    expect(stripNotebookHtml("<h2>Evidence</h2><script>ignore()</script><p>A &amp; B</p>"))
      .toBe("Evidence A & B");
  });
});
