import { describe, expect, it } from "vitest";

import { calculateDeterministicFinancialMetrics } from "@/lib/neuroDeterministicMetrics";
import type { CanonicalFinancialConcept, NormalizedFinancialFact } from "@/lib/neuroFinancialStatements";

function annual(concept: CanonicalFinancialConcept, year: number, value: number): NormalizedFinancialFact {
  const id = `${concept}-${year}`;
  const instant = ["cash", "current_assets", "total_assets", "current_liabilities", "short_term_debt", "long_term_debt", "total_debt", "shareholders_equity"].includes(concept);
  return {
    id,
    rawFactId: id,
    cik: "0000000001",
    canonicalConcept: concept,
    originalTaxonomy: "us-gaap",
    originalConcept: concept,
    mappingPriority: 100,
    value,
    units: concept.includes("shares") ? "shares" : "USD",
    periodType: instant ? "instant" : "annual",
    periodStartDate: instant ? null : `${year}-01-01`,
    periodEndDate: `${year}-12-31`,
    fiscalYear: year,
    fiscalPeriod: "FY",
    reportedOrDerived: "REPORTED",
    formula: null,
    inputFactIds: [id],
    accessionNumber: null,
    filingDate: `${year + 1}-02-15`,
    acceptedAt: `${year + 1}-02-15T20:00:00.000Z`,
    publicAt: `${year + 1}-02-15T20:00:00.000Z`,
    mappingVersion: "test-v1",
    calculationVersion: null,
    normalizedAt: `${year + 1}-02-15T21:00:00.000Z`,
    lineageSha256: id.padEnd(64, "a").slice(0, 64),
    unavailableReason: null,
  };
}

function facts(includeCapex = true) {
  const rows: NormalizedFinancialFact[] = [];
  for (const [year, scale] of [[2023, 1], [2024, 1.2]] as const) {
    rows.push(
      annual("revenue", year, 1_000 * scale),
      annual("gross_profit", year, 500 * scale),
      annual("operating_income", year, 200 * scale),
      annual("pretax_income", year, 180 * scale),
      annual("income_taxes", year, 45 * scale),
      annual("net_income", year, 135 * scale),
      annual("operating_cash_flow", year, 180 * scale),
      annual("interest_expense", year, 20 * scale),
      annual("diluted_shares", year, year === 2023 ? 100 : 102),
      annual("cash", year, 100 * scale),
      annual("current_assets", year, 400 * scale),
      annual("current_liabilities", year, 200 * scale),
      annual("total_assets", year, 1_500 * scale),
      annual("total_debt", year, 300 * scale),
      annual("shareholders_equity", year, 800 * scale)
    );
    if (includeCapex) rows.push(annual("capital_expenditures", year, 60 * scale));
  }
  return rows;
}

describe("deterministic financial metrics", () => {
  it("calculates traceable FCF, margins, growth and transparent ROIC without an LLM", () => {
    const result = calculateDeterministicFinancialMetrics({ facts: facts(), periodType: "annual", calculatedAt: "2026-09-16T12:00:00.000Z" });

    expect(result.metrics.free_cash_flow.value).toBe(144);
    expect(result.metrics.free_cash_flow.formula).toContain("operating cash flow");
    expect(result.metrics.revenue_growth.value).toBeCloseTo(0.2);
    expect(result.metrics.operating_margin.value).toBeCloseTo(0.2);
    expect(result.metrics.return_on_invested_capital.value).not.toBeNull();
    expect(result.metrics.return_on_invested_capital.inputs.some((row) => row.name === "NOPAT")).toBe(true);
    expect(result.sourceFactIds.length).toBeGreaterThan(0);
  });

  it("returns DATA NOT AVAILABLE when CapEx or EBITDA is missing instead of inventing zero", () => {
    const result = calculateDeterministicFinancialMetrics({ facts: facts(false), periodType: "annual" });

    expect(result.metrics.free_cash_flow.status).toBe("unavailable");
    expect(result.metrics.free_cash_flow.displayValue).toBe("DATA NOT AVAILABLE");
    expect(result.metrics.free_cash_flow.unavailableReason).toMatch(/Capital expenditures/i);
    expect(result.metrics.debt_to_ebitda.status).toBe("unavailable");
  });

  it("does not divide by zero", () => {
    const rows = facts().filter((row) => row.canonicalConcept !== "current_liabilities");
    rows.push(annual("current_liabilities", 2024, 0));
    const result = calculateDeterministicFinancialMetrics({ facts: rows, periodType: "annual" });
    expect(result.metrics.current_ratio.status).toBe("unavailable");
  });

  it("uses a five-year comparison when enough history exists for revenue CAGR", () => {
    const rows = facts();
    for (const [year, revenue] of [[2019, 500], [2020, 600], [2021, 700], [2022, 800]] as const) {
      rows.push(annual("revenue", year, revenue));
    }
    const result = calculateDeterministicFinancialMetrics({ facts: rows, periodType: "annual" });
    expect(result.metrics.revenue_cagr.inputs.find((item) => item.name === "comparison revenue")?.factId).toBe("revenue-2019");
    expect(result.metrics.revenue_cagr.value).toBeCloseTo((1_200 / 500) ** (1 / 5) - 1, 8);
  });
});
