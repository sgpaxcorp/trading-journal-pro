// lib/analyticsEngine.ts
export type SideType = "long" | "short";
export type InstrumentType = "option" | "future" | "stock" | "crypto" | "forex" | "other";

export type TradeRow = {
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  price: number;      // parsed
  quantity: number;   // parsed
  time?: string;      // "HH:mm" or "HH:mm:ss"
  dte?: number | null;
  expiry?: string | null; // "YYYY-MM-DD"
};

export type SessionRow = {
  date: string; // "YYYY-MM-DD"
  pnl: number;
  respectedPlan?: boolean | null;
  tags?: string[] | null;
  emotions?: string[] | null;
  entries: TradeRow[];
  exits: TradeRow[];
};

export type SnapshotOut = {
  as_of_date: string;
  range_start: string | null;
  range_end: string | null;

  sessions_count: number;
  trades_count: number;

  total_pnl: number;
  avg_pnl: number;
  median_pnl: number | null;
  win_rate: number; // 0..100
  profit_factor: number | null;
  expectancy: number | null;
  pnl_std: number | null;

  best_day: string | null;
  best_day_pnl: number | null;
  worst_day: string | null;
  worst_day_pnl: number | null;

  payload: any;
};

export type EdgeOut = {
  symbol: string | null;
  kind: string | null;
  side: string | null;
  dow: number | null;
  time_bucket: string | null;
  dte_bucket: string | null;
  plan_respected: boolean | null;
  has_fomo: boolean | null;
  has_revenge: boolean | null;

  n_sessions: number;
  n_trades: number;
  wins: number;
  losses: number;

  win_rate: number;         // 0..100
  win_rate_shrunk: number;  // 0..100
  avg_pnl: number;
  expectancy: number | null;
  profit_factor: number | null;
  avg_win: number | null;
  avg_loss: number | null;

  edge_score: number;   // 0..100
  confidence: number;   // 0..1
};

const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function safeUpper(s: string) {
  return (s || "").trim().toUpperCase();
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function mean(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const arr = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function std(xs: number[]) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const v = xs.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function toDOW(dateYYYYMMDD: string): number | null {
  try {
    const d = new Date(dateYYYYMMDD + "T00:00:00");
    if (Number.isNaN(d.getTime())) return null;
    return d.getDay();
  } catch {
    return null;
  }
}

function parseTimeToMinutes(t?: string) {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export function timeBucket30m(t?: string): string | null {
  const mins = parseTimeToMinutes(t);
  if (mins == null) return null;
  const start = Math.floor(mins / 30) * 30;
  const end = start + 30;
  const pad = (n: number) => String(n).padStart(2, "0");
  const sH = Math.floor(start / 60);
  const sM = start % 60;
  const eH = Math.floor(end / 60);
  const eM = end % 60;
  return `${pad(sH)}:${pad(sM)}-${pad(eH)}:${pad(eM)}`;
}

export function dteBucket(dte?: number | null): string | null {
  if (dte == null || !Number.isFinite(dte)) return null;
  if (dte <= 1) return "0-1";
  if (dte <= 2) return "2";
  if (dte <= 7) return "3-7";
  if (dte <= 14) return "8-14";
  if (dte <= 30) return "15-30";
  if (dte <= 60) return "31-60";
  return "60+";
}

/**
 * Session-level PnL per symbol using avg entry/exit per (symbol|kind|side).
 * This is a simplified but stable approximation (fast).
 */
function computePnLBySymbol(entries: TradeRow[], exits: TradeRow[]) {
  const key = (s: string, k: string, side: string) => `${s}|${k}|${side}`;

  const entryAgg: Record<string, { sumPxQty: number; sumQty: number }> = {};
  const exitAgg: Record<string, { sumPxQty: number; sumQty: number }> = {};

  for (const e of entries) {
    const sym = safeUpper(e.symbol);
    if (!sym) continue;
    if (!Number.isFinite(e.price) || !Number.isFinite(e.quantity) || e.quantity <= 0) continue;
    const k = key(sym, e.kind, e.side);
    entryAgg[k] ||= { sumPxQty: 0, sumQty: 0 };
    entryAgg[k].sumPxQty += e.price * e.quantity;
    entryAgg[k].sumQty += e.quantity;
  }

  for (const x of exits) {
    const sym = safeUpper(x.symbol);
    if (!sym) continue;
    if (!Number.isFinite(x.price) || !Number.isFinite(x.quantity) || x.quantity <= 0) continue;
    const k = key(sym, x.kind, x.side);
    exitAgg[k] ||= { sumPxQty: 0, sumQty: 0 };
    exitAgg[k].sumPxQty += x.price * x.quantity;
    exitAgg[k].sumQty += x.quantity;
  }

  const out: Record<string, number> = {};
  for (const k of Object.keys(exitAgg)) {
    const e = entryAgg[k];
    const x = exitAgg[k];
    if (!e || !x) continue;

    const avgEntry = e.sumPxQty / e.sumQty;
    const avgExit = x.sumPxQty / x.sumQty;
    const closedQty = Math.min(e.sumQty, x.sumQty);

    const [symbol, , side] = k.split("|") as [string, string, SideType];
    const sign = side === "short" ? -1 : 1;
    const pnl = (avgExit - avgEntry) * closedQty * sign;

    out[symbol] = (out[symbol] || 0) + pnl;
  }
  return out;
}

function pnlHistogramBuckets(pnls: number[]) {
  // Bloomberg-like buckets: dynamic width based on volatility, with caps.
  if (!pnls.length) return [];
  const s = std(pnls) ?? 50;
  const width = clamp(Math.round(s / 2), 25, 200); // 25..200
  const min = Math.min(...pnls);
  const max = Math.max(...pnls);

  // Expand range a bit
  const start = Math.floor((min - width) / width) * width;
  const end = Math.ceil((max + width) / width) * width;

  const buckets: { lo: number; hi: number; count: number }[] = [];
  for (let lo = start; lo < end; lo += width) {
    buckets.push({ lo, hi: lo + width, count: 0 });
  }
  for (const p of pnls) {
    const idx = Math.floor((p - start) / width);
    if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1;
  }
  return buckets.map((b) => ({
    bucket: `${b.lo}..${b.hi}`,
    count: b.count,
  }));
}

function computeProfitFactor(pnls: number[]) {
  let gp = 0;
  let gl = 0;
  for (const p of pnls) {
    if (p > 0) gp += p;
    if (p < 0) gl += Math.abs(p);
  }
  if (gl === 0) return gp > 0 ? 999 : null;
  return gp / gl;
}

function computeExpectancy(pnls: number[]) {
  if (!pnls.length) return null;
  const wins = pnls.filter((x) => x > 0);
  const losses = pnls.filter((x) => x < 0);
  const pWin = wins.length / pnls.length;
  const avgWin = wins.length ? mean(wins) : 0;
  const avgLoss = losses.length ? mean(losses.map((x) => Math.abs(x))) : 0;
  // expectancy per session
  return pWin * avgWin - (1 - pWin) * avgLoss;
}

function betaShrinkWinRate(wins: number, n: number, alpha = 2, beta = 2) {
  // returns 0..1
  return (wins + alpha) / (n + alpha + beta);
}

function confidenceFromN(n: number) {
  // n=1 => ~0.15, n=10 => ~0.5, n=100 => ~1.0
  return clamp(Math.log10(n + 1) / 2, 0, 1);
}

function normalizeReturn(x: number) {
  // squash heavy tails to 0..1-ish
  // tanh makes outliers not dominate
  const z = Math.tanh(x / 200); // 200 is a typical scale; adjust later
  return (z + 1) / 2; // 0..1
}

function edgeScore({
  winRateShrunk01,
  expectancy,
  nSessions,
  profitFactor,
  avgWin,
  avgLoss,
}: {
  winRateShrunk01: number;
  expectancy: number;
  nSessions: number;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
}) {
  const conf = confidenceFromN(nSessions);
  const p = clamp(winRateShrunk01, 0, 1);
  const r = normalizeReturn(expectancy);

  // base blend
  let score = 100 * conf * (0.55 * p + 0.45 * r);

  // penalize weak PF
  if (profitFactor != null && profitFactor < 1) score *= 0.85;

  // penalize bad R:R (avgLoss >> avgWin)
  if (avgWin != null && avgLoss != null && avgWin > 0 && avgLoss / avgWin > 1.5) {
    score *= 0.9;
  }

  return clamp(score, 0, 100);
}

type EdgeAgg = {
  dims: {
    symbol: string | null;
    kind: string | null;
    side: string | null;
    dow: number | null;
    time_bucket: string | null;
    dte_bucket: string | null;
    plan_respected: boolean | null;
    has_fomo: boolean | null;
    has_revenge: boolean | null;
  };
  n_sessions: number;
  n_trades: number;
  wins: number;
  losses: number;
  sum_pnl: number;
  wins_pnls: number[];
  loss_pnls: number[];
  all_pnls: number[];
};

function dimsKey(d: EdgeAgg["dims"]) {
  // stable string key
  return [
    d.symbol ?? "ALL",
    d.kind ?? "ALL",
    d.side ?? "ALL",
    d.dow ?? "ALL",
    d.time_bucket ?? "ALL",
    d.dte_bucket ?? "ALL",
    d.plan_respected ?? "ALL",
    d.has_fomo ?? "ALL",
    d.has_revenge ?? "ALL",
  ].join("|");
}

function addAgg(map: Map<string, EdgeAgg>, dims: EdgeAgg["dims"], sessionPnl: number, tradesCount: number) {
  const k = dimsKey(dims);
  let agg = map.get(k);
  if (!agg) {
    agg = {
      dims,
      n_sessions: 0,
      n_trades: 0,
      wins: 0,
      losses: 0,
      sum_pnl: 0,
      wins_pnls: [],
      loss_pnls: [],
      all_pnls: [],
    };
    map.set(k, agg);
  }

  agg.n_sessions += 1;
  agg.n_trades += tradesCount;
  agg.sum_pnl += sessionPnl;
  agg.all_pnls.push(sessionPnl);

  if (sessionPnl > 0) {
    agg.wins += 1;
    agg.wins_pnls.push(sessionPnl);
  } else if (sessionPnl < 0) {
    agg.losses += 1;
    agg.loss_pnls.push(sessionPnl);
  }
}

/**
 * Generate edge aggregations with controlled combinations (no explosion).
 * For 50k users, we MUST cap dims combos.
 */
function buildEdgesAgg(sessions: SessionRow[]) {
  const map = new Map<string, EdgeAgg>();

  for (const s of sessions) {
    const pnl = s.pnl ?? 0;
    const dow = toDOW(s.date);
    const tagsU = (s.tags ?? []).map(safeUpper);
    const hasFomo = tagsU.includes("FOMO");
    const hasRevenge = tagsU.includes("REVENGE TRADE") || tagsU.includes("REVENGE");

    const planRespected = s.respectedPlan == null ? null : !!s.respectedPlan;

    const allTrades = [...(s.entries ?? []), ...(s.exits ?? [])];
    const tradesCount = allTrades.length;

    // time bucket: take first trade time if present, else null
    // (Later we can compute per-trade edges too, but per-session is stable/cheap)
    const firstTime = allTrades.find((t) => t.time)?.time;
    const tBucket = timeBucket30m(firstTime ?? undefined);

    // dte bucket: if options exist, take min DTE present that session
    const dtes = allTrades.map((t) => t.dte).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const minDte = dtes.length ? Math.min(...dtes) : null;
    const dBucket = dteBucket(minDte);

    // symbols in session (unique) for symbol-based edges
    const uniqueSymbols = Array.from(new Set(allTrades.map((t) => safeUpper(t.symbol)).filter(Boolean)));
    const uniqueKinds = Array.from(new Set(allTrades.map((t) => t.kind)));

    // 1) global (ALL)
    addAgg(map, {
      symbol: null, kind: null, side: null, dow: null, time_bucket: null, dte_bucket: null,
      plan_respected: null, has_fomo: null, has_revenge: null,
    }, pnl, tradesCount);

    // 2) DOW only
    if (dow != null) addAgg(map, {
      symbol: null, kind: null, side: null, dow, time_bucket: null, dte_bucket: null,
      plan_respected: null, has_fomo: null, has_revenge: null,
    }, pnl, tradesCount);

    // 3) Time bucket only
    if (tBucket) addAgg(map, {
      symbol: null, kind: null, side: null, dow: null, time_bucket: tBucket, dte_bucket: null,
      plan_respected: null, has_fomo: null, has_revenge: null,
    }, pnl, tradesCount);

    // 4) DTE bucket only
    if (dBucket) addAgg(map, {
      symbol: null, kind: null, side: null, dow: null, time_bucket: null, dte_bucket: dBucket,
      plan_respected: null, has_fomo: null, has_revenge: null,
    }, pnl, tradesCount);

    // 5) Plan respected only
    if (planRespected != null) addAgg(map, {
      symbol: null, kind: null, side: null, dow: null, time_bucket: null, dte_bucket: null,
      plan_respected: planRespected, has_fomo: null, has_revenge: null,
    }, pnl, tradesCount);

    // 6) Psychology tags
    addAgg(map, {
      symbol: null, kind: null, side: null, dow: null, time_bucket: null, dte_bucket: null,
      plan_respected: null, has_fomo: hasFomo, has_revenge: null,
    }, pnl, tradesCount);

    addAgg(map, {
      symbol: null, kind: null, side: null, dow: null, time_bucket: null, dte_bucket: null,
      plan_respected: null, has_fomo: null, has_revenge: hasRevenge,
    }, pnl, tradesCount);

    // 7) Combined DOW x Time (heatmap)
    if (dow != null && tBucket) addAgg(map, {
      symbol: null, kind: null, side: null, dow, time_bucket: tBucket, dte_bucket: null,
      plan_respected: null, has_fomo: null, has_revenge: null,
    }, pnl, tradesCount);

    // 8) Combined DOW x Plan (discipline by weekday)
    if (dow != null && planRespected != null) addAgg(map, {
      symbol: null, kind: null, side: null, dow, time_bucket: null, dte_bucket: null,
      plan_respected: planRespected, has_fomo: null, has_revenge: null,
    }, pnl, tradesCount);

    // 9) Per symbol edges (cap symbols)
    // If session has too many symbols, we still process but later we cap stored edges by score
    for (const sym of uniqueSymbols) {
      addAgg(map, {
        symbol: sym, kind: null, side: null, dow: null, time_bucket: null, dte_bucket: null,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);

      if (dow != null) addAgg(map, {
        symbol: sym, kind: null, side: null, dow, time_bucket: null, dte_bucket: null,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);

      if (tBucket) addAgg(map, {
        symbol: sym, kind: null, side: null, dow: null, time_bucket: tBucket, dte_bucket: null,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);

      if (dBucket) addAgg(map, {
        symbol: sym, kind: null, side: null, dow: null, time_bucket: null, dte_bucket: dBucket,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);

      if (dow != null && tBucket) addAgg(map, {
        symbol: sym, kind: null, side: null, dow, time_bucket: tBucket, dte_bucket: null,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);

      if (planRespected != null) addAgg(map, {
        symbol: sym, kind: null, side: null, dow: null, time_bucket: null, dte_bucket: null,
        plan_respected: planRespected, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);
    }

    // 10) Per instrument type edges
    for (const k of uniqueKinds) {
      addAgg(map, {
        symbol: null, kind: k, side: null, dow: null, time_bucket: null, dte_bucket: null,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);
      if (dow != null) addAgg(map, {
        symbol: null, kind: k, side: null, dow, time_bucket: null, dte_bucket: null,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);
      if (tBucket) addAgg(map, {
        symbol: null, kind: k, side: null, dow: null, time_bucket: tBucket, dte_bucket: null,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);
      if (dBucket) addAgg(map, {
        symbol: null, kind: k, side: null, dow: null, time_bucket: null, dte_bucket: dBucket,
        plan_respected: null, has_fomo: null, has_revenge: null,
      }, pnl, tradesCount);
    }
  }

  return map;
}

function aggToEdge(agg: EdgeAgg): EdgeOut {
  const n = agg.n_sessions;
  const wins = agg.wins;
  const losses = agg.losses;
  const winRate = n > 0 ? (wins / n) * 100 : 0;
  const shr01 = betaShrinkWinRate(wins, n, 2, 2);
  const winRateShr = shr01 * 100;

  const avgPnl = n > 0 ? agg.sum_pnl / n : 0;
  const pf = computeProfitFactor(agg.all_pnls);
  const exp = computeExpectancy(agg.all_pnls);

  const avgWin = agg.wins_pnls.length ? mean(agg.wins_pnls) : null;
  const avgLoss = agg.loss_pnls.length ? mean(agg.loss_pnls.map((x) => Math.abs(x))) : null;

  const score = edgeScore({
    winRateShrunk01: shr01,
    expectancy: exp ?? 0,
    nSessions: n,
    profitFactor: pf,
    avgWin,
    avgLoss,
  });

  const conf = confidenceFromN(n);

  return {
    ...agg.dims,
    n_sessions: n,
    n_trades: agg.n_trades,
    wins,
    losses,
    win_rate: winRate,
    win_rate_shrunk: winRateShr,
    avg_pnl: avgPnl,
    expectancy: exp,
    profit_factor: pf,
    avg_win: avgWin,
    avg_loss: avgLoss,
    edge_score: score,
    confidence: conf,
  };
}

export function buildSnapshotAndEdges(input: {
  sessions: SessionRow[];
  asOfDate?: string;          // default today
  rangeStart?: string | null; // optional
  rangeEnd?: string | null;   // optional
  maxEdgesToStore?: number;   // default 1500
}) {
  const sessions = [...input.sessions].filter((s) => !!s.date).sort((a, b) => a.date.localeCompare(b.date));
  const as_of_date = input.asOfDate ?? new Date().toISOString().slice(0, 10);

  const pnls = sessions.map((s) => s.pnl ?? 0);
  const sessions_count = sessions.length;

  const trades_count = sessions.reduce((acc, s) => acc + (s.entries?.length ?? 0) + (s.exits?.length ?? 0), 0);

  const total_pnl = pnls.reduce((a, b) => a + b, 0);
  const avg_pnl = sessions_count ? total_pnl / sessions_count : 0;
  const median_pnl = median(pnls);
  const pnl_std = std(pnls);

  const wins = pnls.filter((p) => p > 0).length;
  const win_rate = sessions_count ? (wins / sessions_count) * 100 : 0;

  const profit_factor = computeProfitFactor(pnls);
  const expectancy = computeExpectancy(pnls);

  let bestDay: { date: string; pnl: number } | null = null;
  let worstDay: { date: string; pnl: number } | null = null;
  for (const s of sessions) {
    const p = s.pnl ?? 0;
    if (!bestDay || p > bestDay.pnl) bestDay = { date: s.date, pnl: p };
    if (!worstDay || p < worstDay.pnl) worstDay = { date: s.date, pnl: p };
  }

  // Equity & drawdown curves
  const equityCurve: { date: string; cumPnl: number }[] = [];
  const drawdownCurve: { date: string; dd: number }[] = [];
  let cum = 0;
  let peak = 0;
  for (const s of sessions) {
    cum += s.pnl ?? 0;
    peak = Math.max(peak, cum);
    const dd = cum - peak; // <= 0
    equityCurve.push({ date: s.date, cumPnl: Number(cum.toFixed(2)) });
    drawdownCurve.push({ date: s.date, dd: Number(dd.toFixed(2)) });
  }

  // DOW bars
  const dowAgg: Record<number, { sessions: number; wins: number; sumPnl: number }> = {
    0: { sessions: 0, wins: 0, sumPnl: 0 },
    1: { sessions: 0, wins: 0, sumPnl: 0 },
    2: { sessions: 0, wins: 0, sumPnl: 0 },
    3: { sessions: 0, wins: 0, sumPnl: 0 },
    4: { sessions: 0, wins: 0, sumPnl: 0 },
    5: { sessions: 0, wins: 0, sumPnl: 0 },
    6: { sessions: 0, wins: 0, sumPnl: 0 },
  };
  for (const s of sessions) {
    const dow = toDOW(s.date);
    if (dow == null) continue;
    dowAgg[dow].sessions += 1;
    dowAgg[dow].sumPnl += s.pnl ?? 0;
    if ((s.pnl ?? 0) > 0) dowAgg[dow].wins += 1;
  }
  const dowBars = Object.keys(dowAgg).map((k) => {
    const dow = Number(k);
    const x = dowAgg[dow];
    const wr = x.sessions ? (x.wins / x.sessions) * 100 : 0;
    const ap = x.sessions ? x.sumPnl / x.sessions : 0;
    return {
      dow,
      label: DAY_LABELS[dow] ?? String(dow),
      winRate: Number(wr.toFixed(1)),
      avgPnl: Number(ap.toFixed(2)),
      sessions: x.sessions,
    };
  });

  const pnlHistogram = pnlHistogramBuckets(pnls);

  // Build edges
  const aggMap = buildEdgesAgg(sessions);
  let edges = Array.from(aggMap.values()).map(aggToEdge);

  // Drop low-sample edges unless global
  edges = edges.filter((e) => {
    const isGlobal = e.symbol == null && e.kind == null && e.dow == null && e.time_bucket == null && e.dte_bucket == null;
    if (isGlobal) return true;
    return e.n_sessions >= 3; // threshold; tune later
  });

  // Keep only top edges to store
  const maxEdges = input.maxEdgesToStore ?? 1500;
  edges.sort((a, b) => b.edge_score - a.edge_score);
  edges = edges.slice(0, maxEdges);

  // Heatmap data (dow x time bucket)
  const heatmap = edges
    .filter((e) => e.symbol == null && e.dow != null && e.time_bucket != null && e.plan_respected == null)
    .slice(0, 500)
    .map((e) => ({
      dow: e.dow,
      bucket: e.time_bucket,
      edgeScore: Number(e.edge_score.toFixed(1)),
      winRate: Number(e.win_rate_shrunk.toFixed(1)),
      n: e.n_sessions,
    }));

  const payload = {
    equityCurve,
    drawdownCurve,
    pnlHistogram,
    dowBars,
    heatmap,
    meta: {
      generatedAt: new Date().toISOString(),
    },
  };

  const snapshot: SnapshotOut = {
    as_of_date,
    range_start: input.rangeStart ?? null,
    range_end: input.rangeEnd ?? null,
    sessions_count,
    trades_count,
    total_pnl: Number(total_pnl.toFixed(2)),
    avg_pnl: Number(avg_pnl.toFixed(2)),
    median_pnl: median_pnl == null ? null : Number(median_pnl.toFixed(2)),
    win_rate: Number(win_rate.toFixed(2)),
    profit_factor: profit_factor == null ? null : Number(profit_factor.toFixed(3)),
    expectancy: expectancy == null ? null : Number(expectancy.toFixed(3)),
    pnl_std: pnl_std == null ? null : Number(pnl_std.toFixed(3)),
    best_day: bestDay?.date ?? null,
    best_day_pnl: bestDay ? Number(bestDay.pnl.toFixed(2)) : null,
    worst_day: worstDay?.date ?? null,
    worst_day_pnl: worstDay ? Number(worstDay.pnl.toFixed(2)) : null,
    payload,
  };

  return { snapshot, edges };
}
