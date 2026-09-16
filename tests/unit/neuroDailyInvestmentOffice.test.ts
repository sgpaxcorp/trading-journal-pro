import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  dailyInvestmentAlertPriority,
  mergeDailyInvestmentOfficeAlerts,
  normalizeDailyInvestmentOfficeAiAlerts,
  type DailyInvestmentOfficeAlert,
  type DailyInvestmentOfficeSource,
} from "@/lib/neuroDailyInvestmentOffice";

const source: DailyInvestmentOfficeSource = {
  id: "source-1",
  title: "Example investor relations release",
  url: "https://investor.example.com/earnings/q3",
  sourceType: "company_investor_relations",
  publicationDate: "2026-09-16",
  accessedAt: "2026-09-16T13:00:00.000Z",
};

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    ticker: "ACME",
    category: "guidance_change",
    headline: { en: "ACME changed guidance", es: "ACME cambió su guidance" },
    whatChanged: {
      en: "Management withdrew its previously documented outlook.",
      es: "La gerencia retiró su proyección previamente documentada.",
    },
    whyItMatters: {
      en: "The change affects the frozen demand assumption.",
      es: "El cambio afecta la premisa congelada de demanda.",
    },
    affectedThesisAssumption: "Demand remains durable through the next cycle.",
    source: {
      title: source.title,
      url: source.url,
      sourceType: source.sourceType,
      publicationDate: source.publicationDate,
    },
    eventDate: "2026-09-16",
    humanReview: "REQUIRED",
    ...overrides,
  };
}

describe("Daily Investment Office", () => {
  it("derives materiality from category and human workflow triage", () => {
    expect(dailyInvestmentAlertPriority({ category: "guidance_change", humanReview: "REQUIRED" })).toEqual({
      priorityScore: 98,
      materiality: "critical",
    });
    expect(dailyInvestmentAlertPriority({ category: "upcoming_earnings", humanReview: "NOT_NOW" })).toEqual({
      priorityScore: 45,
      materiality: "monitor",
    });
  });

  it("accepts a primary-source alert tied to an exact frozen assumption", () => {
    const alerts = normalizeDailyInvestmentOfficeAiAlerts(
      { alerts: [candidate()] },
      {
        trackedTickers: ["ACME"],
        thesisAssumptions: { ACME: ["Demand remains durable through the next cycle."] },
        allowedSources: [source],
        generatedAt: "2026-09-16T13:00:00.000Z",
      }
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      ticker: "ACME",
      materiality: "critical",
      humanReview: "REQUIRED",
      automaticTradingDecision: false,
      affectedThesisAssumption: "Demand remains durable through the next cycle.",
    });
  });

  it("rejects untracked tickers, unsupported sources, and paraphrased assumptions", () => {
    const options = {
      trackedTickers: ["ACME"],
      thesisAssumptions: { ACME: ["Demand remains durable through the next cycle."] },
      allowedSources: [source],
      generatedAt: "2026-09-16T13:00:00.000Z",
    };
    const alerts = normalizeDailyInvestmentOfficeAiAlerts(
      {
        alerts: [
          candidate({ ticker: "OTHER" }),
          candidate({ affectedThesisAssumption: "Demand should probably remain durable." }),
          candidate({ source: { ...candidate().source as object, url: "https://news.example.com/story" } }),
        ],
      },
      options
    );
    expect(alerts).toEqual([]);
  });

  it("rejects otherwise valid sources outside the daily briefing window", () => {
    const alerts = normalizeDailyInvestmentOfficeAiAlerts(
      { alerts: [candidate()] },
      {
        trackedTickers: ["ACME"],
        thesisAssumptions: { ACME: ["Demand remains durable through the next cycle."] },
        allowedSources: [source],
        generatedAt: "2026-09-16T13:00:00.000Z",
        sourceWindowStart: "2026-09-17",
        sourceWindowEnd: "2026-09-18",
      }
    );
    expect(alerts).toEqual([]);
  });

  it("allows a previously announced upcoming earnings date until the event occurs", () => {
    const olderSource = { ...source, publicationDate: "2026-09-01" };
    const alerts = normalizeDailyInvestmentOfficeAiAlerts(
      {
        alerts: [
          candidate({
            category: "upcoming_earnings",
            source: {
              title: olderSource.title,
              url: olderSource.url,
              sourceType: olderSource.sourceType,
              publicationDate: olderSource.publicationDate,
            },
            eventDate: "2026-09-20",
            humanReview: "NOT_NOW",
          }),
        ],
      },
      {
        trackedTickers: ["ACME"],
        thesisAssumptions: { ACME: ["Demand remains durable through the next cycle."] },
        allowedSources: [olderSource],
        generatedAt: "2026-09-16T13:00:00.000Z",
        sourceWindowStart: "2026-09-12",
        sourceWindowEnd: "2026-09-16",
      }
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].eventDate).toBe("2026-09-20");
  });

  it("rejects trade instructions and unsupported investment probabilities", () => {
    const alerts = normalizeDailyInvestmentOfficeAiAlerts(
      {
        alerts: [
          candidate({ whyItMatters: { en: "Buy more shares now.", es: "Compra más acciones ahora." } }),
          candidate({
            headline: { en: "85% chance of success", es: "85% de probabilidad de éxito" },
          }),
        ],
      },
      {
        trackedTickers: ["ACME"],
        thesisAssumptions: { ACME: ["Demand remains durable through the next cycle."] },
        allowedSources: [source],
        generatedAt: "2026-09-16T13:00:00.000Z",
      }
    );
    expect(alerts).toEqual([]);
  });

  it("deduplicates the same material development", () => {
    const alert = {
      id: "one",
      ticker: "ACME",
      category: "guidance_change",
      materiality: "critical",
      priorityScore: 98,
      headline: { en: "Changed guidance", es: "Cambió guidance" },
      whatChanged: { en: "Guidance changed.", es: "Cambió el guidance." },
      whyItMatters: { en: "It affects demand.", es: "Afecta la demanda." },
      affectedThesisAssumption: "Demand remains durable through the next cycle.",
      source,
      eventDate: "2026-09-16",
      humanReview: "REQUIRED",
      evidenceStatus: "CONFIRMED",
      aiInterpretation: true,
      automaticTradingDecision: false,
    } satisfies DailyInvestmentOfficeAlert;
    expect(mergeDailyInvestmentOfficeAlerts([alert], [{ ...alert, id: "two" }])).toHaveLength(1);
  });

  it("defines append-only briefings, human triage, and emergency write barriers", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260916000500_daily_investment_office.sql"),
      "utf8"
    );
    expect(sql).toContain("neuro_daily_investment_briefings");
    expect(sql).toContain("Daily Investment Office briefings are append-only");
    expect(sql).toContain("neuro_daily_investment_attention_reviews");
    expect(sql).toContain("emergency_portfolio_read_only");
  });
});
