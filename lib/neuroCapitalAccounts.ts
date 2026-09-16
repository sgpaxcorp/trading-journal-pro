import { calculateXirr } from "@/lib/neuroPerformanceAttribution";

export const CAPITAL_ACCOUNT_CALCULATION_VERSION = "capital-accounts-v1";

export type CapitalAccountEventType =
  | "initial_contribution"
  | "contribution"
  | "withdrawal"
  | "distribution"
  | "allocated_expense";

export type CapitalExpenseTreatment = "included_in_nav" | "investor_paid";

export type CapitalAccountEventInput = {
  id: string;
  accountId: string;
  sequenceNo: number;
  eventDate: string;
  eventType: CapitalAccountEventType;
  amount: number;
  navPerUnit: number | null;
  unitsDelta: number;
  externalCashFlow: boolean;
  expenseTreatment: CapitalExpenseTreatment | null;
  notes?: string | null;
};

export type CapitalNavPointInput = {
  id: string;
  navDate: string;
  totalNetAssets: number;
  totalUnits: number;
  navPerUnit: number | null;
  eventSequenceCutoff: number;
};

export type CapitalAccountInput = {
  id: string;
  investorName: string;
  investorReference?: string | null;
  openedOn: string;
  status?: "active" | "closed";
  events: CapitalAccountEventInput[];
};

export type CapitalPoolInput = {
  id: string;
  name: string;
  baseCurrency: string;
  asOfDate: string;
  accounts: CapitalAccountInput[];
  navHistory: CapitalNavPointInput[];
};

export type CapitalAccountHistoricalNav = {
  navDate: string;
  units: number;
  navPerUnit: number | null;
  accountNav: number;
  poolNetAssets: number;
  eventSequenceCutoff: number;
};

export type CapitalAccountReturn = {
  status: "calculated" | "provisional" | "unavailable";
  method: "xirr_money_weighted_return";
  annualizedValuePct: number | null;
  formula: string;
  note: string;
};

export type CapitalAccountReport = {
  accountId: string;
  investorName: string;
  investorReference: string | null;
  openedOn: string;
  status: "active" | "closed";
  initialContribution: number;
  additionalContributions: number;
  totalContributions: number;
  contributionHistory: Array<{
    date: string;
    type: "initial_contribution" | "contribution";
    amount: number;
    navPerUnit: number;
    unitsIssued: number;
  }>;
  withdrawals: number;
  distributions: number;
  allocatedExpenses: number;
  investorPaidExpenses: number;
  currentUnits: number;
  currentNav: number | null;
  currentNavPerUnit: number | null;
  currentOwnershipPct: number | null;
  netInvestmentResult: number | null;
  historicalNav: CapitalAccountHistoricalNav[];
  moneyWeightedReturn: CapitalAccountReturn;
  pendingEventsAfterLatestNav: number;
  dataQuality: {
    latestNavDate: string | null;
    latestNavIsCurrent: boolean;
    issues: string[];
  };
};

export type CapitalPoolReport = {
  calculationVersion: string;
  generatedBy: "deterministic_financial_code";
  llmUsed: false;
  poolId: string;
  poolName: string;
  baseCurrency: string;
  asOfDate: string;
  totalCurrentUnits: number;
  latestNavDate: string | null;
  latestNavPerUnit: number | null;
  latestLockedPoolNav: number | null;
  accounts: CapitalAccountReport[];
  reconciliation: {
    accountUnits: number;
    poolUnits: number;
    difference: number;
    reconciled: boolean;
  };
  separation: {
    investorPerformance: string;
    portfolioPerformance: string;
  };
  calculationInput: CapitalPoolInput;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PRECISION = 1e-6;
const UNIT_PRECISION = 1e-10;

function finiteNumber(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number.`);
  return parsed;
}

function validDate(value: string, label: string) {
  if (!DATE_PATTERN.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error(`${label} must be a valid ISO date.`);
  }
  return value;
}

function round(value: number, decimals = 10) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function closeEnough(left: number, right: number, tolerance = UNIT_PRECISION) {
  return Math.abs(left - right) <= Math.max(tolerance, Math.abs(right) * tolerance);
}

function normalizeEvent(event: CapitalAccountEventInput): CapitalAccountEventInput {
  const amount = finiteNumber(event.amount, "Capital event amount");
  const unitsDelta = finiteNumber(event.unitsDelta, "Capital event units");
  const sequenceNo = finiteNumber(event.sequenceNo, "Capital event sequence");
  if (amount <= 0) throw new Error("Capital event amount must be greater than zero.");
  if (!Number.isInteger(sequenceNo) || sequenceNo <= 0) {
    throw new Error("Capital event sequence must be a positive integer.");
  }

  const navPerUnit = event.navPerUnit == null
    ? null
    : finiteNumber(event.navPerUnit, "Capital event NAV per unit");
  if (navPerUnit != null && navPerUnit <= 0) {
    throw new Error("Capital event NAV per unit must be greater than zero.");
  }

  if (event.eventType === "initial_contribution" || event.eventType === "contribution") {
    if (navPerUnit == null || unitsDelta <= 0 || !event.externalCashFlow) {
      throw new Error("Contributions require positive NAV, issued units, and an external cash flow.");
    }
    if (!closeEnough(unitsDelta, amount / navPerUnit, 1e-8)) {
      throw new Error("Contribution units do not reconcile to amount divided by NAV per unit.");
    }
  } else if (event.eventType === "withdrawal") {
    if (navPerUnit == null || unitsDelta >= 0 || !event.externalCashFlow) {
      throw new Error("Withdrawals require positive NAV, redeemed units, and an external cash flow.");
    }
    if (!closeEnough(Math.abs(unitsDelta), amount / navPerUnit, 1e-8)) {
      throw new Error("Withdrawal units do not reconcile to amount divided by NAV per unit.");
    }
  } else if (event.eventType === "distribution") {
    if (Math.abs(unitsDelta) > UNIT_PRECISION || !event.externalCashFlow) {
      throw new Error("Distributions must be external cash flows and cannot change units.");
    }
  } else if (event.eventType === "allocated_expense") {
    if (Math.abs(unitsDelta) > UNIT_PRECISION || !event.expenseTreatment) {
      throw new Error("Allocated expenses require an expense treatment and cannot change units.");
    }
    if (event.externalCashFlow !== (event.expenseTreatment === "investor_paid")) {
      throw new Error("Only investor-paid expenses are external investor cash flows.");
    }
  }

  return {
    ...event,
    eventDate: validDate(String(event.eventDate), "Capital event date"),
    amount: round(amount, 6),
    navPerUnit: navPerUnit == null ? null : round(navPerUnit, 10),
    unitsDelta: round(unitsDelta, 12),
    sequenceNo,
    notes: String(event.notes ?? "").trim().slice(0, 2_000) || null,
  };
}

function normalizeNavPoint(point: CapitalNavPointInput): CapitalNavPointInput {
  const totalNetAssets = finiteNumber(point.totalNetAssets, "Pool net assets");
  const totalUnits = finiteNumber(point.totalUnits, "Pool units");
  const cutoff = finiteNumber(point.eventSequenceCutoff, "NAV event cutoff");
  const navPerUnit = point.navPerUnit == null
    ? null
    : finiteNumber(point.navPerUnit, "NAV per unit");
  if (totalNetAssets < 0 || totalUnits < 0) throw new Error("NAV balances cannot be negative.");
  if (!Number.isInteger(cutoff) || cutoff < 0) throw new Error("NAV event cutoff must be a non-negative integer.");
  if (totalUnits <= UNIT_PRECISION) {
    if (Math.abs(totalNetAssets) > MONEY_PRECISION || navPerUnit != null) {
      throw new Error("A zero-unit pool must have zero assets and no NAV per unit.");
    }
  } else {
    if (navPerUnit == null || navPerUnit < 0) throw new Error("A funded pool requires NAV per unit.");
    if (!closeEnough(navPerUnit, totalNetAssets / totalUnits, 1e-8)) {
      throw new Error("NAV per unit does not reconcile to total net assets divided by total units.");
    }
  }
  return {
    ...point,
    navDate: validDate(String(point.navDate), "NAV date"),
    totalNetAssets: round(totalNetAssets, 6),
    totalUnits: round(totalUnits, 12),
    navPerUnit: navPerUnit == null ? null : round(navPerUnit, 10),
    eventSequenceCutoff: cutoff,
  };
}

function normalizePoolInput(input: CapitalPoolInput): CapitalPoolInput {
  const accountIds = new Set<string>();
  const eventIds = new Set<string>();
  const sequenceNumbers = new Set<number>();
  const accounts = input.accounts.map((account) => {
    if (!account.id || accountIds.has(account.id)) throw new Error("Capital account IDs must be unique.");
    accountIds.add(account.id);
    const events = account.events
      .map((event) => normalizeEvent(event))
      .sort((left, right) => left.sequenceNo - right.sequenceNo);
    for (const event of events) {
      if (event.accountId !== account.id) throw new Error("Capital event account ownership is inconsistent.");
      if (eventIds.has(event.id) || sequenceNumbers.has(event.sequenceNo)) {
        throw new Error("Capital event IDs and sequence numbers must be unique.");
      }
      eventIds.add(event.id);
      sequenceNumbers.add(event.sequenceNo);
    }
    const initialEvents = events.filter((event) => event.eventType === "initial_contribution");
    if (initialEvents.length > 1) throw new Error("A capital account can have only one initial contribution.");
    const openedOn = validDate(String(account.openedOn), "Capital account opening date");
    if (events.some((event) => event.eventDate < openedOn)) {
      throw new Error("Capital events cannot predate the account opening date.");
    }
    return {
      ...account,
      investorName: String(account.investorName ?? "").trim().slice(0, 160) || "Investor",
      investorReference: String(account.investorReference ?? "").trim().slice(0, 160) || null,
      openedOn,
      status: account.status === "closed" ? "closed" as const : "active" as const,
      events,
    };
  });
  const navHistory = input.navHistory
    .map((point) => normalizeNavPoint(point))
    .sort((left, right) => left.navDate.localeCompare(right.navDate));
  for (let index = 1; index < navHistory.length; index += 1) {
    if (navHistory[index - 1].navDate === navHistory[index].navDate) {
      throw new Error("Only one frozen NAV is allowed per pool and date.");
    }
    if (navHistory[index - 1].eventSequenceCutoff > navHistory[index].eventSequenceCutoff) {
      throw new Error("NAV event cutoffs must be chronological.");
    }
  }

  return {
    ...input,
    id: String(input.id ?? "").trim(),
    name: String(input.name ?? "").trim().slice(0, 160) || "Capital pool",
    baseCurrency: String(input.baseCurrency ?? "USD").trim().toUpperCase().slice(0, 3) || "USD",
    asOfDate: validDate(String(input.asOfDate), "Capital account as-of date"),
    accounts,
    navHistory,
  };
}

function unitsThroughSequence(events: CapitalAccountEventInput[], cutoff: number) {
  return round(
    events.filter((event) => event.sequenceNo <= cutoff).reduce((sum, event) => sum + event.unitsDelta, 0),
    12
  );
}

function returnUnavailable(note: string): CapitalAccountReturn {
  return {
    status: "unavailable",
    method: "xirr_money_weighted_return",
    annualizedValuePct: null,
    formula: "Solve sum(investor cash flow / (1 + r)^(days/365)) = 0",
    note,
  };
}

export function calculateCapitalPoolAccounts(rawInput: CapitalPoolInput): CapitalPoolReport {
  const input = normalizePoolInput(rawInput);
  const allEvents = input.accounts
    .flatMap((account) => account.events)
    .sort((left, right) => left.sequenceNo - right.sequenceNo);
  let runningPoolUnits = 0;
  for (const event of allEvents) {
    runningPoolUnits += event.unitsDelta;
    if (runningPoolUnits < -UNIT_PRECISION) {
      throw new Error("Capital ledger would produce negative pool units.");
    }
  }

  for (const navPoint of input.navHistory) {
    const expectedUnits = round(
      allEvents
        .filter((event) => event.sequenceNo <= navPoint.eventSequenceCutoff)
        .reduce((sum, event) => sum + event.unitsDelta, 0),
      12
    );
    if (!closeEnough(navPoint.totalUnits, expectedUnits, 1e-8)) {
      throw new Error(`Pool units do not reconcile at NAV date ${navPoint.navDate}.`);
    }
  }

  const latestNav = [...input.navHistory]
    .filter((point) => point.navDate <= input.asOfDate)
    .sort((left, right) => right.navDate.localeCompare(left.navDate))[0] ?? null;
  const totalCurrentUnits = round(
    allEvents
      .filter((event) => event.eventDate <= input.asOfDate)
      .reduce((sum, event) => sum + event.unitsDelta, 0),
    12
  );

  const reports = input.accounts.map((account): CapitalAccountReport => {
    let runningUnits = 0;
    for (const event of account.events) {
      runningUnits += event.unitsDelta;
      if (runningUnits < -UNIT_PRECISION) {
        throw new Error(`${account.investorName}'s capital account would produce negative units.`);
      }
    }
    const relevantEvents = account.events.filter((event) => event.eventDate <= input.asOfDate);
    const currentUnits = round(relevantEvents.reduce((sum, event) => sum + event.unitsDelta, 0), 12);
    const contributionEvents = relevantEvents.filter(
      (event) => event.eventType === "initial_contribution" || event.eventType === "contribution"
    );
    const initialContribution = round(
      contributionEvents
        .filter((event) => event.eventType === "initial_contribution")
        .reduce((sum, event) => sum + event.amount, 0),
      6
    );
    const additionalContributions = round(
      contributionEvents
        .filter((event) => event.eventType === "contribution")
        .reduce((sum, event) => sum + event.amount, 0),
      6
    );
    const totalContributions = round(initialContribution + additionalContributions, 6);
    const withdrawals = round(
      relevantEvents.filter((event) => event.eventType === "withdrawal").reduce((sum, event) => sum + event.amount, 0),
      6
    );
    const distributions = round(
      relevantEvents.filter((event) => event.eventType === "distribution").reduce((sum, event) => sum + event.amount, 0),
      6
    );
    const allocatedExpenses = round(
      relevantEvents.filter((event) => event.eventType === "allocated_expense").reduce((sum, event) => sum + event.amount, 0),
      6
    );
    const investorPaidExpenses = round(
      relevantEvents
        .filter((event) => event.eventType === "allocated_expense" && event.expenseTreatment === "investor_paid")
        .reduce((sum, event) => sum + event.amount, 0),
      6
    );
    const historicalNav = input.navHistory
      .filter((point) => point.navDate <= input.asOfDate)
      .map((point): CapitalAccountHistoricalNav => {
        const units = unitsThroughSequence(account.events, point.eventSequenceCutoff);
        return {
          navDate: point.navDate,
          units,
          navPerUnit: point.navPerUnit,
          accountNav: round(point.navPerUnit == null ? 0 : units * point.navPerUnit, 6),
          poolNetAssets: point.totalNetAssets,
          eventSequenceCutoff: point.eventSequenceCutoff,
        };
      });
    const currentNavPerUnit = latestNav?.navPerUnit ?? null;
    const currentNav = currentNavPerUnit == null ? null : round(currentUnits * currentNavPerUnit, 6);
    const currentOwnershipPct = totalCurrentUnits > UNIT_PRECISION
      ? round((currentUnits / totalCurrentUnits) * 100, 8)
      : null;
    const pendingEventsAfterLatestNav = latestNav
      ? relevantEvents.filter((event) => event.sequenceNo > latestNav.eventSequenceCutoff).length
      : relevantEvents.length;
    const latestNavIsCurrent = Boolean(
      latestNav && latestNav.navDate === input.asOfDate && pendingEventsAfterLatestNav === 0
    );
    const netInvestmentResult = currentNav == null
      ? null
      : round(currentNav + withdrawals + distributions - totalContributions - investorPaidExpenses, 6);

    const cashFlows = relevantEvents.flatMap((event) => {
      if (event.eventType === "initial_contribution" || event.eventType === "contribution") {
        return [{ date: event.eventDate, amount: -event.amount }];
      }
      if (event.eventType === "withdrawal" || event.eventType === "distribution") {
        return [{ date: event.eventDate, amount: event.amount }];
      }
      if (event.eventType === "allocated_expense" && event.expenseTreatment === "investor_paid") {
        return [{ date: event.eventDate, amount: -event.amount }];
      }
      return [];
    });
    if (currentNav != null && currentNav > MONEY_PRECISION) {
      cashFlows.push({ date: input.asOfDate, amount: currentNav });
    }
    const xirr = calculateXirr(cashFlows);
    let moneyWeightedReturn = returnUnavailable(
      "A valid dated cash-flow series and a current NAV are required for money-weighted return."
    );
    if (xirr != null) {
      moneyWeightedReturn = {
        status: latestNavIsCurrent ? "calculated" : "provisional",
        method: "xirr_money_weighted_return",
        annualizedValuePct: round(xirr * 100, 8),
        formula: "Solve sum(investor cash flow / (1 + r)^(days/365)) = 0",
        note: latestNavIsCurrent
          ? "XIRR uses each dated investor cash flow and the account NAV at the as-of date."
          : "XIRR uses the latest available NAV per unit and remains provisional until an as-of-date pool NAV is frozen.",
      };
    }
    const issues = [
      ...(!latestNav ? ["No frozen pool NAV is available."] : []),
      ...(pendingEventsAfterLatestNav > 0
        ? [`${pendingEventsAfterLatestNav} capital event(s) occurred after the latest frozen NAV.`]
        : []),
      ...(latestNav && latestNav.navDate !== input.asOfDate
        ? [`Latest frozen NAV is dated ${latestNav.navDate}, before the ${input.asOfDate} as-of date.`]
        : []),
    ];

    return {
      accountId: account.id,
      investorName: account.investorName,
      investorReference: account.investorReference ?? null,
      openedOn: account.openedOn,
      status: account.status ?? "active",
      initialContribution,
      additionalContributions,
      totalContributions,
      contributionHistory: contributionEvents.map((event) => ({
        date: event.eventDate,
        type: event.eventType as "initial_contribution" | "contribution",
        amount: event.amount,
        navPerUnit: event.navPerUnit as number,
        unitsIssued: event.unitsDelta,
      })),
      withdrawals,
      distributions,
      allocatedExpenses,
      investorPaidExpenses,
      currentUnits,
      currentNav,
      currentNavPerUnit,
      currentOwnershipPct,
      netInvestmentResult,
      historicalNav,
      moneyWeightedReturn,
      pendingEventsAfterLatestNav,
      dataQuality: {
        latestNavDate: latestNav?.navDate ?? null,
        latestNavIsCurrent,
        issues,
      },
    };
  });

  const accountUnits = round(reports.reduce((sum, account) => sum + account.currentUnits, 0), 12);
  const difference = round(accountUnits - totalCurrentUnits, 12);
  return {
    calculationVersion: CAPITAL_ACCOUNT_CALCULATION_VERSION,
    generatedBy: "deterministic_financial_code",
    llmUsed: false,
    poolId: input.id,
    poolName: input.name,
    baseCurrency: input.baseCurrency,
    asOfDate: input.asOfDate,
    totalCurrentUnits,
    latestNavDate: latestNav?.navDate ?? null,
    latestNavPerUnit: latestNav?.navPerUnit ?? null,
    latestLockedPoolNav: latestNav?.totalNetAssets ?? null,
    accounts: reports,
    reconciliation: {
      accountUnits,
      poolUnits: totalCurrentUnits,
      difference,
      reconciled: Math.abs(difference) <= UNIT_PRECISION,
    },
    separation: {
      investorPerformance: "Individual XIRR from that investor's dated external cash flows and ending account NAV.",
      portfolioPerformance: "Portfolio TWR and attribution remain in the separate Performance Attribution Engine.",
    },
    calculationInput: input,
  };
}
