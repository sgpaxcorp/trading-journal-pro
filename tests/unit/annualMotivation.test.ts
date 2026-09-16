import { describe, expect, it } from "vitest";

import { buildDailyPushMotivationMessage } from "@/lib/annualMotivation";

describe("daily phone motivation", () => {
  it("keeps the phone copy compact in both languages", () => {
    for (const locale of ["en", "es"] as const) {
      const message = buildDailyPushMotivationMessage("2026-09-16", locale);
      expect(message.title.length).toBeLessThanOrEqual(64);
      expect(message.body.length).toBeLessThanOrEqual(140);
      expect(message.body.split(/\s+/).length).toBeLessThanOrEqual(24);
    }
  });

  it("produces a visibly different notification for every calendar day", () => {
    const start = Date.UTC(2026, 0, 1);
    const notifications = Array.from({ length: 2_000 }, (_, offset) => {
      const date = new Date(start + offset * 86_400_000);
      const message = buildDailyPushMotivationMessage(date, "es");
      return `${message.title}|${message.body}`;
    });

    expect(new Set(notifications).size).toBe(notifications.length);
  });

  it("uses the requested language and preserves the delivery date", () => {
    const english = buildDailyPushMotivationMessage("2026-09-16", "en-US");
    const spanish = buildDailyPushMotivationMessage("2026-09-16", "es-PR");

    expect(english.dateKey).toBe("2026-09-16");
    expect(spanish.dateKey).toBe("2026-09-16");
    expect(english.title).not.toBe(spanish.title);
    expect(english.body).not.toBe(spanish.body);
  });
});
