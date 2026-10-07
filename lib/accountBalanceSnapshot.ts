export function endingBalanceFromJournalNotes(
  rawNotes: unknown,
  journalDate: string
): number | null {
  if (typeof rawNotes !== "string" || !rawNotes.trim()) return null;

  try {
    const parsed = JSON.parse(rawNotes);
    const snapshot = parsed?.account_balance ?? parsed?.accountBalance ?? null;
    if (!snapshot || typeof snapshot !== "object") return null;

    const asOfDate = String(snapshot?.asOfDate ?? snapshot?.date ?? "").slice(0, 10);
    if (asOfDate && asOfDate !== journalDate) return null;

    const balance = Number(
      snapshot?.endingBalance ?? snapshot?.ending_balance ?? snapshot?.balance
    );
    return Number.isFinite(balance) ? Number(balance.toFixed(2)) : null;
  } catch {
    return null;
  }
}

export function advanceActualAccountBalance(params: {
  currentBalance: number;
  tradingPnl: number;
  cashflow: number;
  endingBalance?: number | null;
}): number {
  const snapshot = Number(params.endingBalance);
  if (params.endingBalance != null && Number.isFinite(snapshot)) {
    return Number(snapshot.toFixed(2));
  }

  const next = params.currentBalance + params.tradingPnl + params.cashflow;
  return Number(next.toFixed(2));
}

export type ResolvedAccountEquity = {
  accountEquity: number;
  estimatedEquity: number;
  reconciliationAdjustment: number;
  source: "synced" | "calculated";
};

/**
 * Uses a synchronized broker/account ending balance when one is available.
 * The ledger estimate remains available so the UI can explain any difference
 * without adding the same deposit or withdrawal twice.
 */
export function resolveAccountEquity(params: {
  startingBalance: number;
  tradingPnl: number;
  cashflow: number;
  syncedCurrentBalance?: number | null;
}): ResolvedAccountEquity {
  const estimatedEquity = Number(
    (params.startingBalance + params.tradingPnl + params.cashflow).toFixed(2)
  );
  const synced = Number(params.syncedCurrentBalance);
  const hasSyncedBalance =
    params.syncedCurrentBalance != null && Number.isFinite(synced);
  const accountEquity = hasSyncedBalance
    ? Number(synced.toFixed(2))
    : estimatedEquity;

  return {
    accountEquity,
    estimatedEquity,
    reconciliationAdjustment: Number((accountEquity - estimatedEquity).toFixed(2)),
    source: hasSyncedBalance ? "synced" : "calculated",
  };
}

type AccountSeriesRangeInput = {
  requestedFromDate?: string | null;
  requestedToDate?: string | null;
  planStartIso?: string | null;
  earliestActivityIso?: string | null;
  latestActivityIso?: string | null;
  todayIso: string;
};

export type AccountSeriesRange = {
  startIso: string;
  endIso: string;
  hasPrePlanActivity: boolean;
  earliestActivityIso: string | null;
};

function validIsoDate(value: unknown): string {
  const iso = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}

/**
 * Keeps the plan forecast anchored to its configured start while ensuring that
 * earlier broker/journal activity is not silently removed from the actual
 * account history. Explicit API range filters still take precedence.
 */
export function resolveAccountSeriesRange(input: AccountSeriesRangeInput): AccountSeriesRange {
  const requestedFromDate = validIsoDate(input.requestedFromDate);
  const requestedToDate = validIsoDate(input.requestedToDate);
  const planStartIso = validIsoDate(input.planStartIso);
  const earliestActivityIso = validIsoDate(input.earliestActivityIso);
  const latestActivityIso = validIsoDate(input.latestActivityIso);
  const todayIso = validIsoDate(input.todayIso);

  const naturalStart =
    earliestActivityIso && planStartIso
      ? earliestActivityIso < planStartIso
        ? earliestActivityIso
        : planStartIso
      : earliestActivityIso || planStartIso || todayIso;

  const startIso = requestedFromDate || naturalStart;
  const naturalEnd = [latestActivityIso, todayIso, startIso]
    .filter(Boolean)
    .sort()
    .pop() || startIso;
  const requestedEnd = requestedToDate || naturalEnd;
  const endIso = requestedEnd < startIso ? startIso : requestedEnd;

  return {
    startIso,
    endIso,
    hasPrePlanActivity: Boolean(
      earliestActivityIso && planStartIso && earliestActivityIso < planStartIso
    ),
    earliestActivityIso: earliestActivityIso || null,
  };
}
