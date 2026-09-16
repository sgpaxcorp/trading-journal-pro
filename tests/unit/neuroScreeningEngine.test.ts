import { describe, expect, it } from "vitest";

import { DEFAULT_SCREENING_TEMPLATES, runDeterministicScreen } from "@/lib/neuroScreeningEngine";

describe("deterministic screening engine", () => {
  it("shows every criterion without producing a magic investment score", () => {
    const result = runDeterministicScreen({
      template: DEFAULT_SCREENING_TEMPLATES.value_candidate,
      companies: [{
        ticker: "ACME",
        companyName: "Acme Corp.",
        metrics: { fcf_yield: 0.08, free_cash_flow: 100, debt_to_equity: 0.4, revenue_growth: 0.06 },
      }],
    });

    expect(result.results[0].status).toBe("PASSED_ALL_REQUIRED_CRITERIA");
    expect(result.results[0].criteria.every((criterion) => criterion.status === "PASS")).toBe(true);
    expect(result).not.toHaveProperty("score");
    expect(result.results[0]).not.toHaveProperty("score");
    expect(result.noLlmUsed).toBe(true);
  });

  it("distinguishes failed evidence from unavailable evidence", () => {
    const result = runDeterministicScreen({
      template: DEFAULT_SCREENING_TEMPLATES.value_candidate,
      companies: [
        { ticker: "FAIL", companyName: "Fail Inc.", metrics: { fcf_yield: 0.01, free_cash_flow: 20, debt_to_equity: 0.5, revenue_growth: 0.01 } },
        { ticker: "MISS", companyName: "Missing Inc.", metrics: { fcf_yield: null, free_cash_flow: 20, debt_to_equity: 0.5, revenue_growth: 0.01 } },
      ],
    });

    expect(result.results.find((row) => row.ticker === "FAIL")?.status).toBe("FAILED_REQUIRED_CRITERIA");
    expect(result.results.find((row) => row.ticker === "MISS")?.status).toBe("INSUFFICIENT_DATA");
    expect(result.results.find((row) => row.ticker === "MISS")?.dataCompletenessPct).toBe(75);
  });
});
