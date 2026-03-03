export type DailyPnlPoint = { date: string; pnl: number };
export type DailyCashflowPoint = { date: string; net: number };

function looksLikeYYYYMMDD(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Cashflow-adjusted daily returns (percent units).
 * Uses Modified Dietz per day: r = (end - start - flow) / (start + 0.5 * flow).
 * This neutralizes deposits/withdrawals while keeping real equity path.
 */
export function buildCashflowAdjustedDailyReturns(params: {
  startIso: string;
  endIso: string;
  startingBalance: number;
  dailyPnl: DailyPnlPoint[];
  cashflows: DailyCashflowPoint[];
}): number[] {
  const startIso = params.startIso;
  const endIso = params.endIso;
  if (!looksLikeYYYYMMDD(startIso) || !looksLikeYYYYMMDD(endIso)) return [];

  const pnlByDate = new Map<string, number>();
  for (const row of params.dailyPnl ?? []) {
    const d = String(row?.date ?? "").slice(0, 10);
    if (!looksLikeYYYYMMDD(d)) continue;
    const v = Number(row?.pnl ?? 0);
    pnlByDate.set(d, (pnlByDate.get(d) ?? 0) + (Number.isFinite(v) ? v : 0));
  }

  const cashByDate = new Map<string, number>();
  for (const row of params.cashflows ?? []) {
    const d = String(row?.date ?? "").slice(0, 10);
    if (!looksLikeYYYYMMDD(d)) continue;
    const v = Number(row?.net ?? 0);
    cashByDate.set(d, (cashByDate.get(d) ?? 0) + (Number.isFinite(v) ? v : 0));
  }

  let pnlBefore = 0;
  let cashBefore = 0;
  for (const [d, v] of pnlByDate.entries()) {
    if (d < startIso) pnlBefore += v;
  }
  for (const [d, v] of cashByDate.entries()) {
    if (d < startIso) cashBefore += v;
  }

  let equity = (Number.isFinite(params.startingBalance) ? params.startingBalance : 0) + pnlBefore + cashBefore;

  const out: number[] = [];
  let cursor = startIso;
  while (cursor <= endIso) {
    const pnl = pnlByDate.get(cursor) ?? 0;
    const flow = cashByDate.get(cursor) ?? 0;
    const denom = equity + 0.5 * flow;
    if (Number.isFinite(denom) && denom !== 0) {
      out.push((pnl / denom) * 100);
    }
    equity += pnl + flow;
    cursor = addDaysIso(cursor, 1);
  }

  return out;
}
