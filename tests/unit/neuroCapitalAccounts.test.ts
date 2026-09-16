import { describe, expect, it } from "vitest";

import {
  calculateCapitalPoolAccounts,
  type CapitalPoolInput,
} from "@/lib/neuroCapitalAccounts";

function baseInput(): CapitalPoolInput {
  return {
    id: "pool-1",
    name: "North Star Fund",
    baseCurrency: "USD",
    asOfDate: "2026-12-31",
    accounts: [
      {
        id: "account-1",
        investorName: "Founder",
        openedOn: "2026-01-01",
        events: [
          {
            id: "event-1",
            accountId: "account-1",
            sequenceNo: 1,
            eventDate: "2026-01-01",
            eventType: "initial_contribution",
            amount: 1_000,
            navPerUnit: 10,
            unitsDelta: 100,
            externalCashFlow: true,
            expenseTreatment: null,
          },
          {
            id: "event-2",
            accountId: "account-1",
            sequenceNo: 2,
            eventDate: "2026-06-01",
            eventType: "contribution",
            amount: 1_200,
            navPerUnit: 12,
            unitsDelta: 100,
            externalCashFlow: true,
            expenseTreatment: null,
          },
          {
            id: "event-3",
            accountId: "account-1",
            sequenceNo: 3,
            eventDate: "2026-09-01",
            eventType: "distribution",
            amount: 100,
            navPerUnit: null,
            unitsDelta: 0,
            externalCashFlow: true,
            expenseTreatment: null,
          },
          {
            id: "event-4",
            accountId: "account-1",
            sequenceNo: 4,
            eventDate: "2026-10-01",
            eventType: "allocated_expense",
            amount: 50,
            navPerUnit: null,
            unitsDelta: 0,
            externalCashFlow: false,
            expenseTreatment: "included_in_nav",
          },
        ],
      },
    ],
    navHistory: [
      {
        id: "nav-1",
        navDate: "2026-01-01",
        totalNetAssets: 1_000,
        totalUnits: 100,
        navPerUnit: 10,
        eventSequenceCutoff: 1,
      },
      {
        id: "nav-2",
        navDate: "2026-06-30",
        totalNetAssets: 2_400,
        totalUnits: 200,
        navPerUnit: 12,
        eventSequenceCutoff: 2,
      },
      {
        id: "nav-3",
        navDate: "2026-12-31",
        totalNetAssets: 2_600,
        totalUnits: 200,
        navPerUnit: 13,
        eventSequenceCutoff: 4,
      },
    ],
  };
}

describe("Capital Accounts", () => {
  it("passes the required unit-accounting contribution example exactly", () => {
    const report = calculateCapitalPoolAccounts({
      id: "pool-unit-example",
      name: "Unit accounting example",
      baseCurrency: "USD",
      asOfDate: "2026-03-01",
      accounts: [
        {
          id: "investor-a",
          investorName: "Investor A",
          openedOn: "2026-01-01",
          events: [{
            id: "a-initial",
            accountId: "investor-a",
            sequenceNo: 1,
            eventDate: "2026-01-01",
            eventType: "initial_contribution",
            amount: 100_000,
            navPerUnit: 100,
            unitsDelta: 1_000,
            externalCashFlow: true,
            expenseTreatment: null,
          }],
        },
        {
          id: "investor-b",
          investorName: "Investor B",
          openedOn: "2026-03-01",
          events: [{
            id: "b-initial",
            accountId: "investor-b",
            sequenceNo: 2,
            eventDate: "2026-03-01",
            eventType: "initial_contribution",
            amount: 55_000,
            navPerUnit: 110,
            unitsDelta: 500,
            externalCashFlow: true,
            expenseTreatment: null,
          }],
        },
      ],
      navHistory: [
        { id: "nav-a", navDate: "2026-01-01", totalNetAssets: 100_000, totalUnits: 1_000, navPerUnit: 100, eventSequenceCutoff: 1 },
        { id: "nav-before-b", navDate: "2026-02-28", totalNetAssets: 110_000, totalUnits: 1_000, navPerUnit: 110, eventSequenceCutoff: 1 },
        { id: "nav-after-b", navDate: "2026-03-01", totalNetAssets: 165_000, totalUnits: 1_500, navPerUnit: 110, eventSequenceCutoff: 2 },
      ],
    });

    expect(report.latestLockedPoolNav).toBe(165_000);
    expect(report.latestNavPerUnit).toBe(110);
    expect(report.totalCurrentUnits).toBe(1_500);
    expect(report.accounts.find((account) => account.accountId === "investor-a")?.currentNav).toBe(110_000);
    expect(report.accounts.find((account) => account.accountId === "investor-b")?.currentNav).toBe(55_000);
    expect(report.reconciliation.reconciled).toBe(true);
  });

  it("preserves contributions, issued units, distributions, expenses, and historical NAV", () => {
    const report = calculateCapitalPoolAccounts(baseInput());
    const account = report.accounts[0];

    expect(account.initialContribution).toBe(1_000);
    expect(account.additionalContributions).toBe(1_200);
    expect(account.contributionHistory).toEqual([
      expect.objectContaining({ date: "2026-01-01", amount: 1_000, unitsIssued: 100 }),
      expect.objectContaining({ date: "2026-06-01", amount: 1_200, unitsIssued: 100 }),
    ]);
    expect(account.distributions).toBe(100);
    expect(account.allocatedExpenses).toBe(50);
    expect(account.currentUnits).toBe(200);
    expect(account.currentNav).toBe(2_600);
    expect(account.netInvestmentResult).toBe(500);
    expect(account.historicalNav.map((point) => point.accountNav)).toEqual([1_000, 2_400, 2_600]);
    expect(account.moneyWeightedReturn.status).toBe("calculated");
    expect(report.reconciliation.reconciled).toBe(true);
    expect(report.llmUsed).toBe(false);
  });

  it("redeems units for withdrawals without counting the withdrawal as investment performance", () => {
    const input = baseInput();
    input.accounts[0].events = [
      input.accounts[0].events[0],
      {
        id: "event-2",
        accountId: "account-1",
        sequenceNo: 2,
        eventDate: "2026-07-01",
        eventType: "withdrawal",
        amount: 300,
        navPerUnit: 15,
        unitsDelta: -20,
        externalCashFlow: true,
        expenseTreatment: null,
      },
    ];
    input.navHistory = [
      input.navHistory[0],
      {
        id: "nav-2",
        navDate: "2026-06-30",
        totalNetAssets: 1_500,
        totalUnits: 100,
        navPerUnit: 15,
        eventSequenceCutoff: 1,
      },
      {
        id: "nav-3",
        navDate: "2026-12-31",
        totalNetAssets: 1_600,
        totalUnits: 80,
        navPerUnit: 20,
        eventSequenceCutoff: 2,
      },
    ];

    const account = calculateCapitalPoolAccounts(input).accounts[0];
    expect(account.withdrawals).toBe(300);
    expect(account.currentUnits).toBe(80);
    expect(account.currentNav).toBe(1_600);
    expect(account.netInvestmentResult).toBe(900);
  });

  it("uses cash-flow timing so equal lifetime contributions can have different investor returns", () => {
    const input: CapitalPoolInput = {
      id: "pool-1",
      name: "Timing Fund",
      baseCurrency: "USD",
      asOfDate: "2026-12-31",
      accounts: [
        {
          id: "early",
          investorName: "Early investor",
          openedOn: "2026-01-01",
          events: [{
            id: "event-1",
            accountId: "early",
            sequenceNo: 1,
            eventDate: "2026-01-01",
            eventType: "initial_contribution",
            amount: 1_000,
            navPerUnit: 10,
            unitsDelta: 100,
            externalCashFlow: true,
            expenseTreatment: null,
          }],
        },
        {
          id: "late",
          investorName: "Late investor",
          openedOn: "2026-07-01",
          events: [{
            id: "event-2",
            accountId: "late",
            sequenceNo: 2,
            eventDate: "2026-07-01",
            eventType: "initial_contribution",
            amount: 1_000,
            navPerUnit: 10,
            unitsDelta: 100,
            externalCashFlow: true,
            expenseTreatment: null,
          }],
        },
      ],
      navHistory: [
        {
          id: "nav-1",
          navDate: "2026-01-01",
          totalNetAssets: 1_000,
          totalUnits: 100,
          navPerUnit: 10,
          eventSequenceCutoff: 1,
        },
        {
          id: "nav-2",
          navDate: "2026-12-31",
          totalNetAssets: 2_400,
          totalUnits: 200,
          navPerUnit: 12,
          eventSequenceCutoff: 2,
        },
      ],
    };

    const report = calculateCapitalPoolAccounts(input);
    const early = report.accounts.find((account) => account.accountId === "early")!;
    const late = report.accounts.find((account) => account.accountId === "late")!;

    expect(early.totalContributions).toBe(late.totalContributions);
    expect(early.currentNav).toBe(late.currentNav);
    expect(early.moneyWeightedReturn.annualizedValuePct).toBeCloseTo(20.06, 2);
    expect(late.moneyWeightedReturn.annualizedValuePct).toBeGreaterThan(40);
    expect(report.separation.portfolioPerformance).toContain("separate Performance Attribution Engine");
  });

  it("does not double count expenses already included in NAV", () => {
    const internal = baseInput();
    internal.accounts[0].events = [internal.accounts[0].events[0], internal.accounts[0].events[3]];
    internal.accounts[0].events[1] = { ...internal.accounts[0].events[1], sequenceNo: 2 };
    internal.navHistory = [
      internal.navHistory[0],
      {
        id: "nav-2",
        navDate: "2026-12-31",
        totalNetAssets: 950,
        totalUnits: 100,
        navPerUnit: 9.5,
        eventSequenceCutoff: 2,
      },
    ];
    const internalAccount = calculateCapitalPoolAccounts(internal).accounts[0];
    expect(internalAccount.allocatedExpenses).toBe(50);
    expect(internalAccount.investorPaidExpenses).toBe(0);
    expect(internalAccount.netInvestmentResult).toBe(-50);

    const external = baseInput();
    external.accounts[0].events = [
      external.accounts[0].events[0],
      {
        ...external.accounts[0].events[3],
        sequenceNo: 2,
        externalCashFlow: true,
        expenseTreatment: "investor_paid",
      },
    ];
    external.navHistory = [
      external.navHistory[0],
      {
        id: "nav-2",
        navDate: "2026-12-31",
        totalNetAssets: 1_000,
        totalUnits: 100,
        navPerUnit: 10,
        eventSequenceCutoff: 2,
      },
    ];
    const externalAccount = calculateCapitalPoolAccounts(external).accounts[0];
    expect(externalAccount.investorPaidExpenses).toBe(50);
    expect(externalAccount.netInvestmentResult).toBe(-50);
  });

  it("marks returns provisional when activity occurred after the latest frozen NAV", () => {
    const input = baseInput();
    input.navHistory = input.navHistory.slice(0, 2);

    const account = calculateCapitalPoolAccounts(input).accounts[0];
    expect(account.pendingEventsAfterLatestNav).toBe(2);
    expect(account.moneyWeightedReturn.status).toBe("provisional");
    expect(account.dataQuality.latestNavIsCurrent).toBe(false);
  });

  it("rejects unit issuance that cannot be reproduced from amount and NAV", () => {
    const input = baseInput();
    input.accounts[0].events[0].unitsDelta = 99;

    expect(() => calculateCapitalPoolAccounts(input)).toThrow(
      "Contribution units do not reconcile"
    );
  });

  it("replays frozen calculation input to the identical report", () => {
    const first = calculateCapitalPoolAccounts(baseInput());
    const replay = calculateCapitalPoolAccounts(first.calculationInput);

    expect(replay).toEqual(first);
  });
});
