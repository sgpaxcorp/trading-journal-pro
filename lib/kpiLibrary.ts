// lib/kpiLibrary.ts
// Institutional KPI library (60 KPIs)

export type KPIDataType = "float" | "int" | "percent" | "duration" | "currency";
export type KPICategory =
  | "profitability_edge"
  | "risk_drawdown"
  | "risk_adjusted"
  | "distribution"
  | "execution"
  | "exposure";

export type KPIId =
  | "net_pnl"
  | "gross_profit"
  | "gross_loss"
  | "roi_percent"
  | "cagr"
  | "win_rate"
  | "loss_rate"
  | "avg_win"
  | "avg_loss"
  | "expectancy"
  | "profit_factor"
  | "payoff_ratio"
  | "avg_r_multiple"
  | "total_trades"
  | "profit_per_trade"
  | "max_drawdown_percent"
  | "avg_drawdown_percent"
  | "drawdown_duration_avg_days"
  | "time_to_recovery_avg_days"
  | "recovery_factor"
  | "calmar_ratio"
  | "ulcer_index"
  | "mar_ratio"
  | "var_95"
  | "cvar_95"
  | "tail_ratio"
  | "risk_of_ruin"
  | "sharpe_ratio"
  | "sortino_ratio"
  | "treynor_ratio"
  | "information_ratio"
  | "alpha"
  | "beta"
  | "tracking_error"
  | "omega_ratio"
  | "gain_to_pain_ratio"
  | "kappa_3_ratio"
  | "return_std_dev"
  | "skewness"
  | "kurtosis"
  | "sqn_system_quality_number"
  | "avg_trade_duration_minutes"
  | "median_trade_return"
  | "best_trade_pnl"
  | "worst_trade_pnl"
  | "max_consecutive_wins"
  | "max_consecutive_losses"
  | "avg_slippage"
  | "implementation_shortfall"
  | "vwap_slippage"
  | "twap_slippage"
  | "fill_rate"
  | "spread_paid_avg"
  | "commission_per_trade_avg"
  | "execution_latency_avg_ms"
  | "equity_at_risk_avg_percent"
  | "gross_exposure_avg_percent"
  | "concentration_hhi"
  | "mae_avg"
  | "mfe_avg";

export type OrderFill = {
  price: number;
  qty: number;
  time: string | Date;
};

export type Trade = {
  trade_id: string;
  symbol: string;
  asset_class: string;
  side: "long" | "short";
  quantity: number;
  entry_time: string | Date;
  exit_time: string | Date;
  entry_price: number;
  exit_price: number;
  fees_commissions?: number | null;
  realized_pnl: number; // net of fees if available
  planned_risk?: number | null;
  stop_price?: number | null;
  target_price?: number | null;
  entry_reason?: string | null;
  setup_tag?: string | null;
  exit_reason?: string | null;
  order_type?: string | null;
  venue?: string | null;
  intended_qty?: number | null;
  intended_price?: number | null;
  arrival_price?: number | null;
  signal_time?: string | Date | null;
  fills?: OrderFill[];
  vwap?: number | null;
  twap?: number | null;
  spread_bps?: number | null;
  market_regime_tag?: string | null;
  mae?: number | null; // currency
  mfe?: number | null; // currency
};

export type EquityPoint = {
  time: string | Date;
  equity_value: number;
};

export type BenchmarkPoint = {
  time: string | Date;
  benchmark_return?: number; // percent return between points
  benchmark_price?: number; // if return is not available
};

export type KPIComputeConfig = {
  annualizationDays?: number; // default 252
  riskFreeRate?: number; // annual, decimal (0.02)
  omegaThreshold?: number; // in percent units (default 0)
  varConfidence?: number; // default 0.95
  downsideThreshold?: number; // percent (default 0)
};

export type KPIDefinition = {
  id: KPIId;
  name: string;
  category: KPICategory;
  definition: string;
  formula: string;
  notes: string;
  dataType: KPIDataType;
  unit: string;
  requiredInputs: string[];
  method: string;
  edgeCases: string[];
  example: string;
};

export type KPIResult = KPIDefinition & {
  value: number | null;
  reason?: string;
};

export const KPI_CATEGORY_LABELS: Record<KPICategory, string> = {
  profitability_edge: "Profitability & Edge",
  risk_drawdown: "Risk & Drawdown",
  risk_adjusted: "Risk-Adjusted & Relative",
  distribution: "Stability & Trade Stats",
  execution: "Execution / TCA / Costs",
  exposure: "Exposure / Position & MAE/MFE",
};

export type KPILocalizedText = {
  name: string;
  definition: string;
  notes: string;
  method: string;
  example: string;
  formula: string;
};

const DEFAULT_CONFIG: Required<KPIComputeConfig> = {
  annualizationDays: 252,
  riskFreeRate: 0,
  omegaThreshold: 0,
  varConfidence: 0.95,
  downsideThreshold: 0,
};

function cfgWithDefaults(cfg?: KPIComputeConfig): Required<KPIComputeConfig> {
  return {
    annualizationDays: cfg?.annualizationDays ?? DEFAULT_CONFIG.annualizationDays,
    riskFreeRate: cfg?.riskFreeRate ?? DEFAULT_CONFIG.riskFreeRate,
    omegaThreshold: cfg?.omegaThreshold ?? DEFAULT_CONFIG.omegaThreshold,
    varConfidence: cfg?.varConfidence ?? DEFAULT_CONFIG.varConfidence,
    downsideThreshold: cfg?.downsideThreshold ?? DEFAULT_CONFIG.downsideThreshold,
  };
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function minutesBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return ms / (1000 * 60);
}

function sum(nums: number[]): number {
  return nums.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
}

function mean(nums: number[]): number {
  const v = nums.filter((n) => Number.isFinite(n));
  if (v.length === 0) return 0;
  return sum(v) / v.length;
}

function stddev(nums: number[]): number {
  const v = nums.filter((n) => Number.isFinite(n));
  if (v.length < 2) return 0;
  const m = mean(v);
  const variance = mean(v.map((n) => (n - m) ** 2));
  return Math.sqrt(variance);
}

function downsideDeviation(nums: number[], threshold = 0): number {
  const v = nums.filter((n) => Number.isFinite(n));
  if (v.length === 0) return 0;
  const diffs = v.map((n) => Math.min(0, n - threshold));
  const variance = mean(diffs.map((d) => d * d));
  return Math.sqrt(variance);
}

function quantile(nums: number[], q: number): number {
  const v = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const pos = (v.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (v[base + 1] !== undefined) return v[base] + rest * (v[base + 1] - v[base]);
  return v[base];
}

function median(nums: number[]): number {
  return quantile(nums, 0.5);
}

function skewness(nums: number[]): number {
  const v = nums.filter((n) => Number.isFinite(n));
  if (v.length < 3) return 0;
  const m = mean(v);
  const sd = stddev(v);
  if (sd === 0) return 0;
  const n = v.length;
  const m3 = v.reduce((acc, x) => acc + (x - m) ** 3, 0) / n;
  return m3 / sd ** 3;
}

function kurtosis(nums: number[]): number {
  const v = nums.filter((n) => Number.isFinite(n));
  if (v.length < 4) return 0;
  const m = mean(v);
  const sd = stddev(v);
  if (sd === 0) return 0;
  const n = v.length;
  const m4 = v.reduce((acc, x) => acc + (x - m) ** 4, 0) / n;
  return m4 / sd ** 4 - 3; // excess kurtosis
}

function safeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function hasTrades(trades: Trade[]): boolean {
  return Array.isArray(trades) && trades.length > 0;
}

function equityPoints(equity?: EquityPoint[]): { time: Date; value: number }[] {
  return (equity ?? [])
    .map((p) => {
      const d = toDate(p.time);
      const v = safeNumber(p.equity_value);
      if (!d || v == null) return null;
      return { time: d, value: v };
    })
    .filter(Boolean)
    .sort((a, b) => a!.time.getTime() - b!.time.getTime()) as { time: Date; value: number }[];
}

function dailyReturnsFromEquity(equity?: EquityPoint[]): number[] {
  const pts = equityPoints(equity);
  if (pts.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].value;
    const cur = pts[i].value;
    if (!Number.isFinite(prev) || prev === 0 || !Number.isFinite(cur)) continue;
    out.push(((cur - prev) / prev) * 100);
  }
  return out;
}

function tradeReturns(trades: Trade[]): number[] {
  const out: number[] = [];
  for (const t of trades) {
    const pnl = safeNumber(t.realized_pnl);
    const notional = safeNumber(t.entry_price) && safeNumber(t.quantity)
      ? Math.abs((t.entry_price || 0) * (t.quantity || 0))
      : null;
    if (pnl == null || notional == null || notional === 0) continue;
    out.push((pnl / notional) * 100);
  }
  return out;
}

function rMultiples(trades: Trade[]): number[] {
  const out: number[] = [];
  for (const t of trades) {
    const pnl = safeNumber(t.realized_pnl);
    const risk = safeNumber(t.planned_risk ?? null);
    if (pnl == null || risk == null || risk === 0) continue;
    out.push(pnl / risk);
  }
  return out;
}

function maxConsecutive(nums: number[], pred: (n: number) => boolean): number {
  let max = 0;
  let cur = 0;
  for (const n of nums) {
    if (pred(n)) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

function drawdownSeries(equity?: EquityPoint[]): { pct: number; durationDays: number; recoveryDays: number }[] {
  const pts = equityPoints(equity);
  if (pts.length < 2) return [];
  let peak = pts[0];
  let inDrawdown = false;
  let ddStart: Date | null = null;
  let ddTrough: Date | null = null;
  let ddTroughValue = peak.value;
  const out: { pct: number; durationDays: number; recoveryDays: number }[] = [];

  for (const p of pts) {
    if (p.value >= peak.value) {
      if (inDrawdown && ddStart && ddTrough) {
        const duration = daysBetween(ddStart, p.time);
        const recovery = daysBetween(ddTrough, p.time);
        const pct = (peak.value - ddTroughValue) / peak.value;
        out.push({ pct, durationDays: duration, recoveryDays: recovery });
      }
      peak = p;
      inDrawdown = false;
      ddStart = null;
      ddTrough = null;
      ddTroughValue = p.value;
    } else {
      const dd = (peak.value - p.value) / peak.value;
      if (!inDrawdown) {
        inDrawdown = true;
        ddStart = peak.time;
        ddTrough = p.time;
        ddTroughValue = p.value;
      } else if (p.value < ddTroughValue) {
        ddTroughValue = p.value;
        ddTrough = p.time;
      }
      // keep running
      if (!Number.isFinite(dd)) continue;
    }
  }

  // if still in drawdown at end, record duration but no recovery
  if (inDrawdown && ddStart && ddTrough) {
    const last = pts[pts.length - 1].time;
    const duration = daysBetween(ddStart, last);
    const pct = (peak.value - ddTroughValue) / peak.value;
    out.push({ pct, durationDays: duration, recoveryDays: 0 });
  }

  return out;
}

function maxDrawdownPct(equity?: EquityPoint[]): number | null {
  const pts = equityPoints(equity);
  if (pts.length < 2) return null;
  let peak = pts[0].value;
  let max = 0;
  for (const p of pts) {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? (peak - p.value) / peak : 0;
    if (dd > max) max = dd;
  }
  return max * 100;
}

function maxDrawdownAbs(equity?: EquityPoint[]): number | null {
  const pts = equityPoints(equity);
  if (pts.length < 2) return null;
  let peak = pts[0].value;
  let max = 0;
  for (const p of pts) {
    if (p.value > peak) peak = p.value;
    const dd = peak - p.value;
    if (dd > max) max = dd;
  }
  return max;
}

function equityReturnTotal(equity?: EquityPoint[]): number | null {
  const pts = equityPoints(equity);
  if (pts.length < 2) return null;
  const first = pts[0].value;
  const last = pts[pts.length - 1].value;
  if (!Number.isFinite(first) || first === 0) return null;
  return ((last - first) / first) * 100;
}

function computeCagr(equity?: EquityPoint[], annualizationDays = 252): number | null {
  const pts = equityPoints(equity);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.value <= 0 || last.value <= 0) return null;
  const years = Math.max(daysBetween(first.time, last.time) / 365, 1 / 365);
  const cagr = Math.pow(last.value / first.value, 1 / years) - 1;
  return cagr * 100;
}

function alignReturns(equity?: EquityPoint[], benchmark?: BenchmarkPoint[]): { portfolio: number[]; benchmark: number[] } {
  const eq = equityPoints(equity);
  if (!benchmark || benchmark.length === 0 || eq.length < 2) return { portfolio: [], benchmark: [] };

  const benchMap = new Map<string, BenchmarkPoint>();
  for (const b of benchmark) {
    const d = toDate(b.time);
    if (!d) continue;
    benchMap.set(d.toISOString().slice(0, 10), b);
  }

  const portfolio: number[] = [];
  const bench: number[] = [];

  for (let i = 1; i < eq.length; i++) {
    const date = eq[i].time.toISOString().slice(0, 10);
    const prev = eq[i - 1].value;
    const cur = eq[i].value;
    if (!Number.isFinite(prev) || prev === 0 || !Number.isFinite(cur)) continue;
    const r = ((cur - prev) / prev) * 100;

    const b = benchMap.get(date);
    if (!b) continue;

    let br: number | null = null;
    const brRaw = safeNumber(b.benchmark_return);
    if (brRaw != null) br = brRaw;
    else {
      const idx = benchmark.findIndex((p) => toDate(p.time)?.toISOString().slice(0, 10) === date);
      if (idx > 0) {
        const prevB = safeNumber(benchmark[idx - 1]?.benchmark_price ?? null);
        const curB = safeNumber(benchmark[idx]?.benchmark_price ?? null);
        if (prevB != null && curB != null && prevB !== 0) br = ((curB - prevB) / prevB) * 100;
      }
    }

    if (br == null) continue;
    portfolio.push(r);
    bench.push(br);
  }

  return { portfolio, benchmark: bench };
}

function regressionAlphaBeta(portfolio: number[], benchmark: number[]): { alpha: number | null; beta: number | null } {
  if (portfolio.length < 2 || benchmark.length < 2) return { alpha: null, beta: null };
  const n = Math.min(portfolio.length, benchmark.length);
  const x = benchmark.slice(0, n);
  const y = portfolio.slice(0, n);
  const meanX = mean(x);
  const meanY = mean(y);
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) ** 2;
  }
  if (varX === 0) return { alpha: null, beta: null };
  const beta = cov / varX;
  const alpha = meanY - beta * meanX;
  return { alpha, beta };
}

function getExecutionPrice(trade: Trade): number | null {
  const fills = trade.fills ?? [];
  if (fills.length === 0) return safeNumber(trade.entry_price);
  let qty = 0;
  let notional = 0;
  for (const f of fills) {
    const p = safeNumber(f.price);
    const q = safeNumber(f.qty);
    if (p == null || q == null) continue;
    qty += q;
    notional += p * q;
  }
  if (qty === 0) return null;
  return notional / qty;
}

function firstFillTime(trade: Trade): Date | null {
  const fills = trade.fills ?? [];
  if (fills.length === 0) return null;
  let min: Date | null = null;
  for (const f of fills) {
    const d = toDate(f.time);
    if (!d) continue;
    if (!min || d.getTime() < min.getTime()) min = d;
  }
  return min;
}

function getEquityAtTime(equity?: EquityPoint[], time?: string | Date | null): number | null {
  const pts = equityPoints(equity);
  const t = toDate(time ?? null);
  if (!t || pts.length === 0) return null;
  let prev: { time: Date; value: number } | null = null;
  for (const p of pts) {
    if (p.time.getTime() > t.getTime()) break;
    prev = p;
  }
  return prev ? prev.value : null;
}

function buildResult(id: KPIId, value: number | null, reason?: string): KPIResult {
  const def = KPI_DEFS[id];
  if (!def) {
    throw new Error(`Missing KPI definition: ${id}`);
  }
  return { ...def, value: value != null && Number.isFinite(value) ? value : null, reason };
}

const KPI_DEFS: Record<KPIId, KPIDefinition> = {
  net_pnl: {
    id: "net_pnl",
    name: "Net P&L",
    category: "profitability_edge",
    definition: "Total realized profit and loss across trades.",
    formula: "Σ realized_pnl",
    notes: "Assumes realized_pnl is net of fees if provided.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Sum realized_pnl for all trades.",
    edgeCases: ["No trades -> null"],
    example: "Trades: +100, -50 => net_pnl = 50",
  },
  gross_profit: {
    id: "gross_profit",
    name: "Gross Profit",
    category: "profitability_edge",
    definition: "Sum of profits from winning trades.",
    formula: "Σ max(realized_pnl, 0)",
    notes: "Uses only positive P&L.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Sum positive realized_pnl values.",
    edgeCases: ["No winning trades -> 0"],
    example: "Trades: +100, -50 => gross_profit = 100",
  },
  gross_loss: {
    id: "gross_loss",
    name: "Gross Loss",
    category: "profitability_edge",
    definition: "Sum of losses from losing trades (negative value).",
    formula: "Σ min(realized_pnl, 0)",
    notes: "Returned as a negative number by convention.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Sum negative realized_pnl values.",
    edgeCases: ["No losing trades -> 0"],
    example: "Trades: +100, -50 => gross_loss = -50",
  },
  roi_percent: {
    id: "roi_percent",
    name: "ROI %",
    category: "profitability_edge",
    definition: "Net return over the period relative to starting equity.",
    formula: "(equity_last - equity_first) / equity_first",
    notes: "Requires equity curve; expressed as percent.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["equity_curve"],
    method: "Compute total return from first/last equity points.",
    edgeCases: ["No equity curve or zero starting equity -> null"],
    example: "Equity 10,000 → 10,500 => ROI = 5%",
  },
  cagr: {
    id: "cagr",
    name: "CAGR",
    category: "profitability_edge",
    definition: "Annualized growth rate based on equity curve.",
    formula: "(equity_last / equity_first)^(1/years) - 1",
    notes: "Uses calendar years between first/last points; percent output.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["equity_curve"],
    method: "Compute annualized growth from first/last equity values.",
    edgeCases: ["Insufficient equity points -> null"],
    example: "10,000 → 11,000 over 1 year => CAGR = 10%",
  },
  win_rate: {
    id: "win_rate",
    name: "Win Rate",
    category: "profitability_edge",
    definition: "Percent of trades with positive P&L.",
    formula: "wins / total_trades",
    notes: "Trades with pnl = 0 are ignored in win/loss counts.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["realized_pnl"],
    method: "Count pnl > 0 trades divided by total trades.",
    edgeCases: ["No trades -> null"],
    example: "2 wins out of 4 trades => 50%",
  },
  loss_rate: {
    id: "loss_rate",
    name: "Loss Rate",
    category: "profitability_edge",
    definition: "Percent of trades with negative P&L.",
    formula: "losses / total_trades",
    notes: "Trades with pnl = 0 are ignored in loss count.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["realized_pnl"],
    method: "Count pnl < 0 trades divided by total trades.",
    edgeCases: ["No trades -> null"],
    example: "2 losses out of 4 trades => 50%",
  },
  avg_win: {
    id: "avg_win",
    name: "Average Win",
    category: "profitability_edge",
    definition: "Average P&L of winning trades.",
    formula: "mean(realized_pnl | pnl > 0)",
    notes: "Uses only positive P&L trades.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Average of positive realized_pnl values.",
    edgeCases: ["No winning trades -> null"],
    example: "Wins: 100, 200 => avg_win = 150",
  },
  avg_loss: {
    id: "avg_loss",
    name: "Average Loss",
    category: "profitability_edge",
    definition: "Average P&L of losing trades (negative).",
    formula: "mean(realized_pnl | pnl < 0)",
    notes: "Returned as a negative number.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Average of negative realized_pnl values.",
    edgeCases: ["No losing trades -> null"],
    example: "Losses: -50, -100 => avg_loss = -75",
  },
  expectancy: {
    id: "expectancy",
    name: "Expectancy",
    category: "profitability_edge",
    definition: "Average expected P&L per trade.",
    formula: "win_rate * avg_win + loss_rate * avg_loss",
    notes: "Uses win/loss averages.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Compute win/loss rates then expectation.",
    edgeCases: ["No trades -> null"],
    example: "Win 50% with +100 avg, loss 50% with -50 => expectancy = 25",
  },
  profit_factor: {
    id: "profit_factor",
    name: "Profit Factor",
    category: "profitability_edge",
    definition: "Gross profit divided by gross loss (absolute).",
    formula: "gross_profit / abs(gross_loss)",
    notes: "Higher is better; >1 implies profit.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["realized_pnl"],
    method: "Compute gross profit and gross loss.",
    edgeCases: ["No losses -> null"],
    example: "Gross profit 300, gross loss -100 => profit_factor = 3",
  },
  payoff_ratio: {
    id: "payoff_ratio",
    name: "Payoff Ratio",
    category: "profitability_edge",
    definition: "Average win divided by average loss (absolute).",
    formula: "avg_win / abs(avg_loss)",
    notes: "Measures win size vs loss size.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["realized_pnl"],
    method: "Compute avg win and avg loss.",
    edgeCases: ["No losses -> null"],
    example: "Avg win 120, avg loss -40 => payoff_ratio = 3",
  },
  avg_r_multiple: {
    id: "avg_r_multiple",
    name: "Avg R-Multiple",
    category: "profitability_edge",
    definition: "Average R-multiple per trade.",
    formula: "mean(realized_pnl / planned_risk)",
    notes: "Requires planned_risk per trade.",
    dataType: "float",
    unit: "R",
    requiredInputs: ["realized_pnl", "planned_risk"],
    method: "Compute R-multiple for each trade and average.",
    edgeCases: ["Missing planned_risk -> null"],
    example: "P&L 100 with risk 50 => R = 2",
  },
  total_trades: {
    id: "total_trades",
    name: "Total Trades",
    category: "profitability_edge",
    definition: "Total number of trades.",
    formula: "count(trades)",
    notes: "Includes all trades in the sample.",
    dataType: "int",
    unit: "trades",
    requiredInputs: ["trade_id"],
    method: "Count trades.",
    edgeCases: ["No trades -> 0"],
    example: "4 trades => total_trades = 4",
  },
  profit_per_trade: {
    id: "profit_per_trade",
    name: "Profit per Trade",
    category: "profitability_edge",
    definition: "Net P&L divided by total trades.",
    formula: "net_pnl / total_trades",
    notes: "Measures average profitability per trade.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Compute net_pnl and divide by trade count.",
    edgeCases: ["No trades -> null"],
    example: "Net 200 across 4 trades => 50 per trade",
  },
  max_drawdown_percent: {
    id: "max_drawdown_percent",
    name: "Max Drawdown %",
    category: "risk_drawdown",
    definition: "Largest peak-to-trough decline as a percent of peak equity.",
    formula: "max((peak - trough) / peak)",
    notes: "Requires equity curve; percent output.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["equity_curve"],
    method: "Track rolling peaks and compute max drawdown.",
    edgeCases: ["No equity curve -> null"],
    example: "Peak 10,000, trough 9,000 => 10%",
  },
  avg_drawdown_percent: {
    id: "avg_drawdown_percent",
    name: "Avg Drawdown %",
    category: "risk_drawdown",
    definition: "Average drawdown percentage across the equity curve.",
    formula: "mean((peak - equity)/peak)",
    notes: "Uses all drawdown points; percent output.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["equity_curve"],
    method: "Compute drawdown at each point and average.",
    edgeCases: ["No equity curve -> null"],
    example: "Drawdowns 2%, 3% => avg = 2.5%",
  },
  drawdown_duration_avg_days: {
    id: "drawdown_duration_avg_days",
    name: "Avg Drawdown Duration (days)",
    category: "risk_drawdown",
    definition: "Average length of drawdown periods.",
    formula: "mean(days from peak to recovery)",
    notes: "Requires equity curve; uses calendar days.",
    dataType: "duration",
    unit: "days",
    requiredInputs: ["equity_curve"],
    method: "Detect drawdown periods and average durations.",
    edgeCases: ["No drawdowns -> 0"],
    example: "Drawdowns of 3 and 5 days => avg = 4",
  },
  time_to_recovery_avg_days: {
    id: "time_to_recovery_avg_days",
    name: "Avg Time to Recovery (days)",
    category: "risk_drawdown",
    definition: "Average time from trough back to previous peak.",
    formula: "mean(days from trough to recovery)",
    notes: "Requires equity curve.",
    dataType: "duration",
    unit: "days",
    requiredInputs: ["equity_curve"],
    method: "Compute trough-to-recovery durations.",
    edgeCases: ["No recoveries -> 0"],
    example: "Recoveries of 2 and 4 days => avg = 3",
  },
  recovery_factor: {
    id: "recovery_factor",
    name: "Recovery Factor",
    category: "risk_drawdown",
    definition: "Total return divided by max drawdown (absolute).",
    formula: "total_return / max_drawdown_abs",
    notes: "Uses equity curve; higher is better.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["equity_curve"],
    method: "Compute total return and max drawdown.",
    edgeCases: ["Max drawdown = 0 -> null"],
    example: "Return 500, max DD 100 => 5",
  },
  calmar_ratio: {
    id: "calmar_ratio",
    name: "Calmar Ratio",
    category: "risk_drawdown",
    definition: "CAGR divided by max drawdown (absolute).",
    formula: "CAGR / max_drawdown_abs",
    notes: "Uses equity curve; if max drawdown is 0, undefined.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["equity_curve"],
    method: "Compute CAGR and max drawdown.",
    edgeCases: ["Max drawdown = 0 -> null"],
    example: "CAGR 20%, max DD 10% => 2",
  },
  ulcer_index: {
    id: "ulcer_index",
    name: "Ulcer Index",
    category: "risk_drawdown",
    definition: "Root mean square of drawdown percentages.",
    formula: "sqrt(mean(drawdown^2))",
    notes: "Lower is better; percent output.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["equity_curve"],
    method: "Compute drawdown series and RMS.",
    edgeCases: ["No equity curve -> null"],
    example: "Drawdowns 1%, 3% => UI ≈ 2.24%",
  },
  mar_ratio: {
    id: "mar_ratio",
    name: "MAR Ratio",
    category: "risk_drawdown",
    definition: "CAGR divided by max drawdown (variant of Calmar).",
    formula: "CAGR / max_drawdown_abs",
    notes: "Reported separately; same math as Calmar by default.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["equity_curve"],
    method: "Compute CAGR and max drawdown.",
    edgeCases: ["Max drawdown = 0 -> null"],
    example: "CAGR 12%, max DD 6% => 2",
  },
  var_95: {
    id: "var_95",
    name: "VaR 95%",
    category: "risk_drawdown",
    definition: "Value at Risk at 95% confidence.",
    formula: "5th percentile of returns",
    notes: "Uses daily returns if equity curve exists, else trade returns.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["returns"],
    method: "Compute the 5th percentile of return distribution.",
    edgeCases: ["No returns -> null"],
    example: "Returns: -2%, 1%, 3% => VaR95 = -2%",
  },
  cvar_95: {
    id: "cvar_95",
    name: "CVaR 95%",
    category: "risk_drawdown",
    definition: "Expected shortfall below the 5th percentile.",
    formula: "mean(returns | returns <= VaR95)",
    notes: "Uses daily returns if equity curve exists, else trade returns.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["returns"],
    method: "Average of tail losses below VaR.",
    edgeCases: ["No tail losses -> null"],
    example: "Tail returns -3%, -2% => CVaR = -2.5%",
  },
  tail_ratio: {
    id: "tail_ratio",
    name: "Tail Ratio",
    category: "risk_drawdown",
    definition: "95th percentile gain divided by 5th percentile loss (abs).",
    formula: "P95 / abs(P5)",
    notes: "Uses return distribution.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["returns"],
    method: "Compute percentile ratio from returns.",
    edgeCases: ["P5 = 0 -> null"],
    example: "P95=2%, P5=-1% => tail_ratio=2",
  },
  risk_of_ruin: {
    id: "risk_of_ruin",
    name: "Risk of Ruin",
    category: "risk_drawdown",
    definition: "Approximate probability of losing all capital under fixed-risk assumptions.",
    formula: "(q / (p * b))",
    notes: "Uses win rate p and payoff ratio b. This is a simplified proxy (single-unit capital).",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["realized_pnl"],
    method: "Compute win rate and payoff ratio; derive proxy ruin probability.",
    edgeCases: ["p=0 or b=0 -> null"],
    example: "p=0.6, b=1.5 => risk_of_ruin ≈ 44%",
  },
  sharpe_ratio: {
    id: "sharpe_ratio",
    name: "Sharpe Ratio",
    category: "risk_adjusted",
    definition: "Risk-adjusted return vs total volatility.",
    formula: "(mean excess return / std dev) * sqrt(annualization)",
    notes: "Uses daily returns from equity curve when available.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["equity_curve"],
    method: "Compute excess mean return and divide by stddev.",
    edgeCases: ["Std dev = 0 -> null"],
    example: "Mean 0.1%, sd 0.2% => Sharpe ≈ 0.5",
  },
  sortino_ratio: {
    id: "sortino_ratio",
    name: "Sortino Ratio",
    category: "risk_adjusted",
    definition: "Risk-adjusted return vs downside volatility only.",
    formula: "(mean excess return / downside deviation) * sqrt(annualization)",
    notes: "Uses downside deviation below threshold (default 0%).",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["equity_curve"],
    method: "Compute mean return and downside deviation.",
    edgeCases: ["Downside deviation = 0 -> null"],
    example: "Mean 0.1%, downside 0.15% => Sortino ≈ 0.67",
  },
  treynor_ratio: {
    id: "treynor_ratio",
    name: "Treynor Ratio",
    category: "risk_adjusted",
    definition: "Excess return per unit of market beta.",
    formula: "(portfolio_return - rf) / beta",
    notes: "Requires benchmark series for beta.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["equity_curve", "benchmark"],
    method: "Compute beta vs benchmark and divide excess return.",
    edgeCases: ["Beta = 0 -> null"],
    example: "Excess 10%, beta 1.2 => Treynor ≈ 0.083",
  },
  information_ratio: {
    id: "information_ratio",
    name: "Information Ratio",
    category: "risk_adjusted",
    definition: "Active return divided by tracking error.",
    formula: "mean(portfolio - benchmark) / std(active)",
    notes: "Uses aligned returns.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["equity_curve", "benchmark"],
    method: "Compute active return series and stddev.",
    edgeCases: ["Tracking error = 0 -> null"],
    example: "Active mean 0.1%, TE 0.2% => IR = 0.5",
  },
  alpha: {
    id: "alpha",
    name: "Alpha (vs benchmark)",
    category: "risk_adjusted",
    definition: "Intercept of return regression vs benchmark (annualized).",
    formula: "α = mean(rp) - β * mean(rb)",
    notes: "Requires benchmark series; percent output.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["equity_curve", "benchmark"],
    method: "Linear regression of portfolio vs benchmark returns.",
    edgeCases: ["Insufficient data -> null"],
    example: "Alpha 0.02% daily => ~5% annualized",
  },
  beta: {
    id: "beta",
    name: "Beta",
    category: "risk_adjusted",
    definition: "Sensitivity of portfolio returns to benchmark returns.",
    formula: "cov(rp, rb) / var(rb)",
    notes: "Requires benchmark series.",
    dataType: "float",
    unit: "beta",
    requiredInputs: ["equity_curve", "benchmark"],
    method: "Compute covariance and variance of returns.",
    edgeCases: ["Benchmark variance = 0 -> null"],
    example: "Portfolio moves 1.2x benchmark => beta = 1.2",
  },
  tracking_error: {
    id: "tracking_error",
    name: "Tracking Error",
    category: "risk_adjusted",
    definition: "Volatility of active returns vs benchmark.",
    formula: "std(portfolio - benchmark)",
    notes: "Uses aligned returns; percent output.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["equity_curve", "benchmark"],
    method: "Compute stddev of active returns.",
    edgeCases: ["No aligned returns -> null"],
    example: "Active return sd 0.5% => TE = 0.5%",
  },
  omega_ratio: {
    id: "omega_ratio",
    name: "Omega Ratio",
    category: "risk_adjusted",
    definition: "Ratio of gains above threshold to losses below threshold.",
    formula: "Σ max(r - θ,0) / Σ max(θ - r,0)",
    notes: "Default threshold is 0%.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["returns"],
    method: "Compute gain/loss above/below threshold.",
    edgeCases: ["No losses below threshold -> null"],
    example: "Gains 2, losses 1 => omega = 2",
  },
  gain_to_pain_ratio: {
    id: "gain_to_pain_ratio",
    name: "Gain-to-Pain Ratio",
    category: "risk_adjusted",
    definition: "Total gains divided by total losses.",
    formula: "Σ gains / abs(Σ losses)",
    notes: "Uses return series.",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["returns"],
    method: "Sum positive and negative returns.",
    edgeCases: ["No losses -> null"],
    example: "Gains 4%, losses -2% => 2",
  },
  kappa_3_ratio: {
    id: "kappa_3_ratio",
    name: "Kappa-3 Ratio",
    category: "risk_adjusted",
    definition: "Return over third-order downside risk.",
    formula: "mean excess / LPM(3)^(1/3)",
    notes: "Uses downside threshold (default 0%).",
    dataType: "float",
    unit: "ratio",
    requiredInputs: ["returns"],
    method: "Compute lower partial moment of order 3.",
    edgeCases: ["No downside risk -> null"],
    example: "Mean 0.1%, LPM3 0.000001 => Kappa3 ~ 1",
  },
  return_std_dev: {
    id: "return_std_dev",
    name: "Return Std Dev",
    category: "distribution",
    definition: "Standard deviation of trade returns.",
    formula: "std(returns)",
    notes: "Uses trade returns by default; percent output.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["trade_returns"],
    method: "Compute stddev of trade return series.",
    edgeCases: ["No returns -> null"],
    example: "Returns 1%, -1% => std = 1%",
  },
  skewness: {
    id: "skewness",
    name: "Skewness",
    category: "distribution",
    definition: "Asymmetry of return distribution.",
    formula: "E[(r-μ)^3]/σ^3",
    notes: "Uses trade returns.",
    dataType: "float",
    unit: "skew",
    requiredInputs: ["trade_returns"],
    method: "Compute sample skewness of returns.",
    edgeCases: ["<3 returns -> 0"],
    example: "Positive skew > 0",
  },
  kurtosis: {
    id: "kurtosis",
    name: "Kurtosis",
    category: "distribution",
    definition: "Tail heaviness of return distribution (excess).",
    formula: "E[(r-μ)^4]/σ^4 - 3",
    notes: "Uses trade returns; excess kurtosis.",
    dataType: "float",
    unit: "kurtosis",
    requiredInputs: ["trade_returns"],
    method: "Compute excess kurtosis.",
    edgeCases: ["<4 returns -> 0"],
    example: "Normal distribution => ~0",
  },
  sqn_system_quality_number: {
    id: "sqn_system_quality_number",
    name: "SQN (System Quality Number)",
    category: "distribution",
    definition: "Quality score based on R-multiples.",
    formula: "sqrt(n) * mean(R) / std(R)",
    notes: "Requires planned_risk for R-multiples.",
    dataType: "float",
    unit: "score",
    requiredInputs: ["planned_risk"],
    method: "Compute R-multiples and apply SQN formula.",
    edgeCases: ["Std(R)=0 -> null"],
    example: "n=10, meanR=0.5, sdR=0.5 => SQN=3.16",
  },
  avg_trade_duration_minutes: {
    id: "avg_trade_duration_minutes",
    name: "Avg Trade Duration (min)",
    category: "distribution",
    definition: "Average time in trade.",
    formula: "mean(exit_time - entry_time)",
    notes: "Uses minutes.",
    dataType: "duration",
    unit: "minutes",
    requiredInputs: ["entry_time", "exit_time"],
    method: "Compute duration in minutes for each trade and average.",
    edgeCases: ["Missing times -> null"],
    example: "Trades 30m and 60m => avg 45m",
  },
  median_trade_return: {
    id: "median_trade_return",
    name: "Median Trade Return",
    category: "distribution",
    definition: "Median of trade returns.",
    formula: "median(returns)",
    notes: "Uses trade returns; percent output.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["trade_returns"],
    method: "Compute median of return series.",
    edgeCases: ["No returns -> null"],
    example: "Returns 1%, 3%, -1% => median 1%",
  },
  best_trade_pnl: {
    id: "best_trade_pnl",
    name: "Best Trade P&L",
    category: "distribution",
    definition: "Maximum realized P&L.",
    formula: "max(realized_pnl)",
    notes: "Uses realized P&L.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Take max of realized_pnl.",
    edgeCases: ["No trades -> null"],
    example: "Best trade +200 => 200",
  },
  worst_trade_pnl: {
    id: "worst_trade_pnl",
    name: "Worst Trade P&L",
    category: "distribution",
    definition: "Minimum realized P&L.",
    formula: "min(realized_pnl)",
    notes: "Uses realized P&L.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["realized_pnl"],
    method: "Take min of realized_pnl.",
    edgeCases: ["No trades -> null"],
    example: "Worst trade -150 => -150",
  },
  max_consecutive_wins: {
    id: "max_consecutive_wins",
    name: "Max Consecutive Wins",
    category: "distribution",
    definition: "Longest win streak.",
    formula: "max consecutive pnl > 0",
    notes: "Trades sorted by exit time.",
    dataType: "int",
    unit: "trades",
    requiredInputs: ["realized_pnl"],
    method: "Count longest sequence of positive pnl.",
    edgeCases: ["No wins -> 0"],
    example: "Win, Win, Loss => 2",
  },
  max_consecutive_losses: {
    id: "max_consecutive_losses",
    name: "Max Consecutive Losses",
    category: "distribution",
    definition: "Longest loss streak.",
    formula: "max consecutive pnl < 0",
    notes: "Trades sorted by exit time.",
    dataType: "int",
    unit: "trades",
    requiredInputs: ["realized_pnl"],
    method: "Count longest sequence of negative pnl.",
    edgeCases: ["No losses -> 0"],
    example: "Loss, Loss, Win => 2",
  },
  avg_slippage: {
    id: "avg_slippage",
    name: "Avg Slippage",
    category: "execution",
    definition: "Average slippage vs arrival/decision price.",
    formula: "mean((exec_price - arrival_price) * direction * qty)",
    notes: "Positive values indicate worse execution (paid more / sold lower).",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["arrival_price", "fills/entry_price", "quantity"],
    method: "Compute per-trade slippage using execution price.",
    edgeCases: ["Missing arrival price -> null"],
    example: "Arrive 100, exec 100.1, qty 10 => +1",
  },
  implementation_shortfall: {
    id: "implementation_shortfall",
    name: "Implementation Shortfall",
    category: "execution",
    definition: "Performance shortfall vs decision price (cost).",
    formula: "(exec_price - arrival_price) * direction * qty + fees",
    notes: "Simplified: entry slippage + fees; opportunity cost not included.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["arrival_price", "fees_commissions", "fills/entry_price"],
    method: "Compute per-trade cost vs arrival price and average.",
    edgeCases: ["Missing arrival price -> null"],
    example: "Slippage 5 + fees 1 => 6",
  },
  vwap_slippage: {
    id: "vwap_slippage",
    name: "VWAP Slippage",
    category: "execution",
    definition: "Execution price vs VWAP benchmark.",
    formula: "(exec_price - vwap) * direction * qty",
    notes: "Requires VWAP per trade.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["vwap", "fills/entry_price"],
    method: "Compare execution price to VWAP.",
    edgeCases: ["Missing vwap -> null"],
    example: "Exec 100.2, VWAP 100, qty 10 => +2",
  },
  twap_slippage: {
    id: "twap_slippage",
    name: "TWAP Slippage",
    category: "execution",
    definition: "Execution price vs TWAP benchmark.",
    formula: "(exec_price - twap) * direction * qty",
    notes: "Requires TWAP per trade.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["twap", "fills/entry_price"],
    method: "Compare execution price to TWAP.",
    edgeCases: ["Missing twap -> null"],
    example: "Exec 100.2, TWAP 100.1 => +1",
  },
  fill_rate: {
    id: "fill_rate",
    name: "Fill Rate",
    category: "execution",
    definition: "Filled quantity divided by intended quantity.",
    formula: "filled_qty / intended_qty",
    notes: "Uses fills or quantity as filled qty.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["intended_qty", "fills/quantity"],
    method: "Compute per-trade fill rate and average.",
    edgeCases: ["Missing intended qty -> null"],
    example: "Filled 80 of 100 => 80%",
  },
  spread_paid_avg: {
    id: "spread_paid_avg",
    name: "Avg Spread Paid",
    category: "execution",
    definition: "Average spread paid in basis points.",
    formula: "mean(spread_bps)",
    notes: "Requires spread_bps per trade.",
    dataType: "float",
    unit: "bps",
    requiredInputs: ["spread_bps"],
    method: "Average of spread_bps.",
    edgeCases: ["Missing spread data -> null"],
    example: "Spreads 2, 4 => avg 3 bps",
  },
  commission_per_trade_avg: {
    id: "commission_per_trade_avg",
    name: "Commission per Trade",
    category: "execution",
    definition: "Average fees and commissions per trade.",
    formula: "mean(fees_commissions)",
    notes: "Requires fees_commissions.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["fees_commissions"],
    method: "Average of fees_commissions.",
    edgeCases: ["Missing fees -> null"],
    example: "Fees 1, 2 => avg 1.5",
  },
  execution_latency_avg_ms: {
    id: "execution_latency_avg_ms",
    name: "Execution Latency (ms)",
    category: "execution",
    definition: "Average time from signal to first fill.",
    formula: "mean(first_fill_time - signal_time)",
    notes: "Requires signal_time and fills.",
    dataType: "duration",
    unit: "ms",
    requiredInputs: ["signal_time", "fills"],
    method: "Compute milliseconds from signal to first fill.",
    edgeCases: ["Missing fills -> null"],
    example: "Signal 10:00:00, fill 10:00:05 => 5000 ms",
  },
  equity_at_risk_avg_percent: {
    id: "equity_at_risk_avg_percent",
    name: "Equity at Risk Avg %",
    category: "exposure",
    definition: "Average planned risk as a percent of equity.",
    formula: "mean(planned_risk / equity_at_entry)",
    notes: "Requires equity curve and planned_risk.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["planned_risk", "equity_curve"],
    method: "Map equity at entry time and compute ratio.",
    edgeCases: ["Missing equity or risk -> null"],
    example: "Risk 100 on equity 10,000 => 1%",
  },
  gross_exposure_avg_percent: {
    id: "gross_exposure_avg_percent",
    name: "Gross Exposure Avg %",
    category: "exposure",
    definition: "Average notional exposure as percent of equity.",
    formula: "mean(notional / equity_at_entry)",
    notes: "Notional = entry_price * quantity.",
    dataType: "percent",
    unit: "%",
    requiredInputs: ["entry_price", "quantity", "equity_curve"],
    method: "Compute notional per trade and divide by equity.",
    edgeCases: ["Missing equity -> null"],
    example: "Notional 20,000 on equity 100,000 => 20%",
  },
  concentration_hhi: {
    id: "concentration_hhi",
    name: "Concentration HHI",
    category: "exposure",
    definition: "Herfindahl index of notional concentration by symbol.",
    formula: "Σ (symbol_notional / total_notional)^2",
    notes: "Higher means more concentrated.",
    dataType: "float",
    unit: "index",
    requiredInputs: ["symbol", "entry_price", "quantity"],
    method: "Aggregate notional by symbol and compute HHI.",
    edgeCases: ["No notional -> null"],
    example: "Two symbols 50/50 => HHI = 0.5",
  },
  mae_avg: {
    id: "mae_avg",
    name: "MAE Avg",
    category: "exposure",
    definition: "Average Maximum Adverse Excursion.",
    formula: "mean(mae)",
    notes: "Assumes mae provided in currency.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["mae"],
    method: "Average mae values across trades.",
    edgeCases: ["Missing mae -> null"],
    example: "MAE -30, -20 => avg -25",
  },
  mfe_avg: {
    id: "mfe_avg",
    name: "MFE Avg",
    category: "exposure",
    definition: "Average Maximum Favorable Excursion.",
    formula: "mean(mfe)",
    notes: "Assumes mfe provided in currency.",
    dataType: "currency",
    unit: "USD",
    requiredInputs: ["mfe"],
    method: "Average mfe values across trades.",
    edgeCases: ["Missing mfe -> null"],
    example: "MFE 50, 80 => avg 65",
  },
};

export const KPI_DEFINITIONS: KPIDefinition[] = Object.values(KPI_DEFS);

const KPI_I18N_ES: Record<KPIId, Omit<KPILocalizedText, "formula">> = {
  net_pnl: {
    name: "P&L neto",
    definition: "Pérdida/ganancia realizada total en todas las operaciones.",
    notes: "Asume que el P&L realizado ya es neto de comisiones si está disponible.",
    method: "Suma el P&L realizado de todas las operaciones.",
    example: "Operaciones: +100, -50 => net_pnl = 50",
  },
  gross_profit: {
    name: "Ganancia bruta",
    definition: "Suma de ganancias de las operaciones ganadoras.",
    notes: "Usa solo P&L positivo.",
    method: "Suma los valores positivos de P&L realizado.",
    example: "Operaciones: +100, -50 => gross_profit = 100",
  },
  gross_loss: {
    name: "Pérdida bruta",
    definition: "Suma de pérdidas de operaciones perdedoras (valor negativo).",
    notes: "Se devuelve como número negativo por convención.",
    method: "Suma los valores negativos de P&L realizado.",
    example: "Operaciones: +100, -50 => gross_loss = -50",
  },
  roi_percent: {
    name: "ROI %",
    definition: "Retorno neto del periodo respecto al equity inicial.",
    notes: "Requiere curva de equity; salida en %. ",
    method: "Calcula el retorno total entre el primer y último punto de equity.",
    example: "Equity 10,000 → 10,500 => ROI = 5%",
  },
  cagr: {
    name: "CAGR",
    definition: "Tasa anualizada de crecimiento basada en la curva de equity.",
    notes: "Usa años calendario entre el primer y último punto; salida en %.",
    method: "Calcula crecimiento anualizado desde el primer y último equity.",
    example: "10,000 → 11,000 en 1 año => CAGR = 10%",
  },
  win_rate: {
    name: "Tasa de acierto",
    definition: "Porcentaje de trades con P&L positivo.",
    notes: "Trades con pnl = 0 se ignoran.",
    method: "Cuenta trades con pnl > 0 dividido entre total trades.",
    example: "2 ganadas de 4 trades => 50%",
  },
  loss_rate: {
    name: "Tasa de pérdida",
    definition: "Porcentaje de trades con P&L negativo.",
    notes: "Trades con pnl = 0 se ignoran en la cuenta de pérdidas.",
    method: "Cuenta trades con pnl < 0 dividido entre total trades.",
    example: "2 pérdidas de 4 trades => 50%",
  },
  avg_win: {
    name: "Ganancia promedio",
    definition: "P&L promedio de trades ganadores.",
    notes: "Usa solo trades con P&L positivo.",
    method: "Promedio de valores positivos de P&L realizado.",
    example: "Ganadas: 100, 200 => avg_win = 150",
  },
  avg_loss: {
    name: "Pérdida promedio",
    definition: "P&L promedio de trades perdedores (negativo).",
    notes: "Se devuelve como número negativo.",
    method: "Promedio de valores negativos de P&L realizado.",
    example: "Pérdidas: -50, -100 => avg_loss = -75",
  },
  expectancy: {
    name: "Expectativa",
    definition: "P&L esperado promedio por trade.",
    notes: "Usa promedios de ganancia y pérdida.",
    method: "Calcula tasas de ganancia/pérdida y luego la expectativa.",
    example: "Ganas 50% con +100, pierdes 50% con -50 => expectativa = 25",
  },
  profit_factor: {
    name: "Factor de ganancia",
    definition: "Ganancia bruta dividida por pérdida bruta (absoluta).",
    notes: "Más alto es mejor; >1 implica ganancias.",
    method: "Calcula ganancia bruta y pérdida bruta.",
    example: "Ganancia bruta 300, pérdida bruta -100 => profit_factor = 3",
  },
  payoff_ratio: {
    name: "Relación de payoff",
    definition: "Ganancia promedio dividida por pérdida promedio (absoluta).",
    notes: "Mide tamaño de ganancia vs tamaño de pérdida.",
    method: "Calcula ganancia promedio y pérdida promedio.",
    example: "Ganancia prom. 120, pérdida prom. -40 => payoff_ratio = 3",
  },
  avg_r_multiple: {
    name: "R promedio",
    definition: "R-múltiplo promedio por trade.",
    notes: "Requiere riesgo planificado por trade.",
    method: "Calcula R por trade y saca el promedio.",
    example: "P&L 100 con riesgo 50 => R = 2",
  },
  total_trades: {
    name: "Total de trades",
    definition: "Número total de trades.",
    notes: "Incluye todas las operaciones de la muestra.",
    method: "Cuenta trades.",
    example: "4 trades => total_trades = 4",
  },
  profit_per_trade: {
    name: "Ganancia por trade",
    definition: "P&L neto dividido entre total de trades.",
    notes: "Mide rentabilidad promedio por trade.",
    method: "Calcula P&L neto y divide entre el número de trades.",
    example: "Neto 200 en 4 trades => 50 por trade",
  },
  max_drawdown_percent: {
    name: "Drawdown máximo %",
    definition: "Mayor caída de pico a valle como % del pico.",
    notes: "Requiere curva de equity; salida en %.",
    method: "Sigue picos móviles y calcula el drawdown máximo.",
    example: "Pico 10,000, valle 9,000 => 10%",
  },
  avg_drawdown_percent: {
    name: "Drawdown promedio %",
    definition: "Promedio del drawdown a lo largo de la curva de equity.",
    notes: "Usa todos los puntos de drawdown; salida en %.",
    method: "Calcula drawdown en cada punto y promedia.",
    example: "Drawdowns 2%, 3% => promedio 2.5%",
  },
  drawdown_duration_avg_days: {
    name: "Duración promedio de drawdown (días)",
    definition: "Duración promedio de los periodos de drawdown.",
    notes: "Requiere curva de equity; usa días calendario.",
    method: "Detecta periodos de drawdown y promedia sus duraciones.",
    example: "Drawdowns de 3 y 5 días => promedio 4",
  },
  time_to_recovery_avg_days: {
    name: "Tiempo promedio de recuperación (días)",
    definition: "Tiempo promedio desde el valle hasta recuperar el pico previo.",
    notes: "Requiere curva de equity.",
    method: "Calcula duraciones de valle a recuperación.",
    example: "Recuperaciones de 2 y 4 días => promedio 3",
  },
  recovery_factor: {
    name: "Factor de recuperación",
    definition: "Retorno total dividido por el drawdown máximo (absoluto).",
    notes: "Usa curva de equity; más alto es mejor.",
    method: "Calcula retorno total y drawdown máximo.",
    example: "Retorno 500, DD máx 100 => 5",
  },
  calmar_ratio: {
    name: "Ratio Calmar",
    definition: "CAGR dividido por drawdown máximo (absoluto).",
    notes: "Usa curva de equity; si drawdown es 0 no está definido.",
    method: "Calcula CAGR y drawdown máximo.",
    example: "CAGR 20%, DD máx 10% => 2",
  },
  ulcer_index: {
    name: "Índice Ulcer",
    definition: "Raíz del promedio de los cuadrados del drawdown.",
    notes: "Más bajo es mejor; salida en %.",
    method: "Calcula serie de drawdown y su RMS.",
    example: "Drawdowns 1%, 3% => UI ≈ 2.24%",
  },
  mar_ratio: {
    name: "Ratio MAR",
    definition: "CAGR dividido por drawdown máximo (variante de Calmar).",
    notes: "Se reporta por separado; matemáticamente igual a Calmar por defecto.",
    method: "Calcula CAGR y drawdown máximo.",
    example: "CAGR 12%, DD máx 6% => 2",
  },
  var_95: {
    name: "VaR 95%",
    definition: "Value at Risk al 95% de confianza.",
    notes: "Usa retornos diarios si hay equity, si no retornos por trade.",
    method: "Calcula el percentil 5 de la distribución de retornos.",
    example: "Retornos: -2%, 1%, 3% => VaR95 = -2%",
  },
  cvar_95: {
    name: "CVaR 95%",
    definition: "Expected shortfall por debajo del percentil 5.",
    notes: "Usa retornos diarios si hay equity, si no retornos por trade.",
    method: "Promedio de las pérdidas en la cola bajo VaR.",
    example: "Retornos cola -3%, -2% => CVaR = -2.5%",
  },
  tail_ratio: {
    name: "Ratio de cola",
    definition: "Ganancia percentil 95 dividida por pérdida percentil 5 (abs).",
    notes: "Usa distribución de retornos.",
    method: "Calcula la razón entre percentiles de retornos.",
    example: "P95=2%, P5=-1% => tail_ratio=2",
  },
  risk_of_ruin: {
    name: "Riesgo de ruina",
    definition: "Probabilidad aproximada de perder todo el capital bajo supuestos de riesgo fijo.",
    notes: "Usa tasa de acierto p y payoff b. Proxy simplificado (capital de 1 unidad).",
    method: "Calcula p y b, y deriva la probabilidad de ruina.",
    example: "p=0.6, b=1.5 => riesgo de ruina ≈ 44%",
  },
  sharpe_ratio: {
    name: "Ratio Sharpe",
    definition: "Retorno ajustado por riesgo vs volatilidad total.",
    notes: "Usa retornos diarios de la curva de equity cuando está disponible.",
    method: "Calcula retorno medio en exceso y lo divide por la desviación estándar.",
    example: "Media 0.1%, sd 0.2% => Sharpe ≈ 0.5",
  },
  sortino_ratio: {
    name: "Ratio Sortino",
    definition: "Retorno ajustado por riesgo vs volatilidad a la baja.",
    notes: "Usa desviación a la baja bajo el umbral (por defecto 0%).",
    method: "Calcula retorno medio y desviación a la baja.",
    example: "Media 0.1%, downside 0.15% => Sortino ≈ 0.67",
  },
  treynor_ratio: {
    name: "Ratio Treynor",
    definition: "Retorno en exceso por unidad de beta de mercado.",
    notes: "Requiere benchmark para beta.",
    method: "Calcula beta vs benchmark y divide el retorno en exceso.",
    example: "Exceso 10%, beta 1.2 => Treynor ≈ 0.083",
  },
  information_ratio: {
    name: "Ratio de información",
    definition: "Retorno activo dividido por tracking error.",
    notes: "Usa retornos alineados.",
    method: "Calcula serie de retorno activo y su desviación estándar.",
    example: "Media activa 0.1%, TE 0.2% => IR = 0.5",
  },
  alpha: {
    name: "Alpha (vs benchmark)",
    definition: "Intercepto de regresión de retornos vs benchmark (anualizado).",
    notes: "Requiere benchmark; salida en %.",
    method: "Regresión lineal de retornos del portafolio vs benchmark.",
    example: "Alpha 0.02% diario => ~5% anualizado",
  },
  beta: {
    name: "Beta",
    definition: "Sensibilidad de retornos del portafolio a retornos del benchmark.",
    notes: "Requiere benchmark.",
    method: "Calcula covarianza y varianza de retornos.",
    example: "Portafolio se mueve 1.2x benchmark => beta = 1.2",
  },
  tracking_error: {
    name: "Tracking error",
    definition: "Volatilidad del retorno activo vs benchmark.",
    notes: "Usa retornos alineados; salida en %.",
    method: "Calcula desviación estándar de retornos activos.",
    example: "SD retorno activo 0.5% => TE = 0.5%",
  },
  omega_ratio: {
    name: "Ratio Omega",
    definition: "Razón de ganancias por encima de un umbral vs pérdidas por debajo.",
    notes: "Umbral por defecto 0%.",
    method: "Calcula ganancias/pérdidas arriba/abajo del umbral.",
    example: "Ganancias 2, pérdidas 1 => omega = 2",
  },
  gain_to_pain_ratio: {
    name: "Ratio gain-to-pain",
    definition: "Ganancias totales divididas por pérdidas totales.",
    notes: "Usa serie de retornos.",
    method: "Suma retornos positivos y negativos.",
    example: "Ganancias 4%, pérdidas -2% => 2",
  },
  kappa_3_ratio: {
    name: "Ratio Kappa-3",
    definition: "Retorno sobre riesgo a la baja de orden 3.",
    notes: "Usa umbral a la baja (por defecto 0%).",
    method: "Calcula lower partial moment de orden 3.",
    example: "Media 0.1%, LPM3 0.000001 => Kappa3 ~ 1",
  },
  return_std_dev: {
    name: "Desv. estándar de retornos",
    definition: "Desviación estándar de retornos por trade.",
    notes: "Usa retornos por trade; salida en %.",
    method: "Calcula la desviación estándar de la serie de retornos.",
    example: "Retornos 1%, -1% => std = 1%",
  },
  skewness: {
    name: "Asimetría",
    definition: "Asimetría de la distribución de retornos.",
    notes: "Usa retornos por trade.",
    method: "Calcula el skewness muestral.",
    example: "Asimetría positiva > 0",
  },
  kurtosis: {
    name: "Curtosis",
    definition: "Peso de colas de la distribución (exceso).",
    notes: "Usa retornos por trade; curtosis en exceso.",
    method: "Calcula la curtosis en exceso.",
    example: "Distribución normal => ~0",
  },
  sqn_system_quality_number: {
    name: "SQN (Número de calidad del sistema)",
    definition: "Puntaje de calidad basado en R-múltiplos.",
    notes: "Requiere riesgo planificado para R-múltiplos.",
    method: "Calcula R-múltiplos y aplica la fórmula SQN.",
    example: "n=10, meanR=0.5, sdR=0.5 => SQN=3.16",
  },
  avg_trade_duration_minutes: {
    name: "Duración promedio de trade (min)",
    definition: "Tiempo promedio en operación.",
    notes: "Usa minutos.",
    method: "Calcula duración por trade en minutos y promedia.",
    example: "Trades 30m y 60m => promedio 45m",
  },
  median_trade_return: {
    name: "Retorno mediano por trade",
    definition: "Mediana de retornos por trade.",
    notes: "Usa retornos por trade; salida en %.",
    method: "Calcula la mediana de la serie de retornos.",
    example: "Retornos 1%, 3%, -1% => mediana 1%",
  },
  best_trade_pnl: {
    name: "Mejor P&L de trade",
    definition: "P&L realizado máximo.",
    notes: "Usa P&L realizado.",
    method: "Toma el máximo de P&L realizado.",
    example: "Mejor trade +200 => 200",
  },
  worst_trade_pnl: {
    name: "Peor P&L de trade",
    definition: "P&L realizado mínimo.",
    notes: "Usa P&L realizado.",
    method: "Toma el mínimo de P&L realizado.",
    example: "Peor trade -150 => -150",
  },
  max_consecutive_wins: {
    name: "Máximas ganancias consecutivas",
    definition: "Racha más larga de trades ganadores.",
    notes: "Trades ordenados por hora de salida.",
    method: "Cuenta la secuencia más larga de pnl positivo.",
    example: "Gana, Gana, Pierde => 2",
  },
  max_consecutive_losses: {
    name: "Máximas pérdidas consecutivas",
    definition: "Racha más larga de trades perdedores.",
    notes: "Trades ordenados por hora de salida.",
    method: "Cuenta la secuencia más larga de pnl negativo.",
    example: "Pierde, Pierde, Gana => 2",
  },
  avg_slippage: {
    name: "Slippage promedio",
    definition: "Slippage promedio vs precio de llegada/decisión.",
    notes: "Valores positivos indican peor ejecución (pagar más / vender más bajo).",
    method: "Calcula slippage por trade usando el precio de ejecución.",
    example: "Llegada 100, exec 100.1, qty 10 => +1",
  },
  implementation_shortfall: {
    name: "Implementation shortfall",
    definition: "Costo de ejecución vs precio de decisión.",
    notes: "Simplificado: slippage de entrada + fees; no incluye costo de oportunidad.",
    method: "Calcula costo por trade vs arrival y promedia.",
    example: "Slippage 5 + fees 1 => 6",
  },
  vwap_slippage: {
    name: "Slippage vs VWAP",
    definition: "Precio de ejecución vs benchmark VWAP.",
    notes: "Requiere VWAP por trade.",
    method: "Compara precio de ejecución con VWAP.",
    example: "Exec 100.2, VWAP 100, qty 10 => +2",
  },
  twap_slippage: {
    name: "Slippage vs TWAP",
    definition: "Precio de ejecución vs benchmark TWAP.",
    notes: "Requiere TWAP por trade.",
    method: "Compara precio de ejecución con TWAP.",
    example: "Exec 100.2, TWAP 100.1 => +1",
  },
  fill_rate: {
    name: "Tasa de fill",
    definition: "Cantidad ejecutada dividida entre cantidad intencionada.",
    notes: "Usa fills o quantity como cantidad ejecutada.",
    method: "Calcula fill rate por trade y promedia.",
    example: "Ejecutado 80 de 100 => 80%",
  },
  spread_paid_avg: {
    name: "Spread promedio pagado",
    definition: "Spread promedio pagado en puntos básicos.",
    notes: "Requiere spread_bps por trade.",
    method: "Promedio de spread_bps.",
    example: "Spreads 2, 4 => promedio 3 bps",
  },
  commission_per_trade_avg: {
    name: "Comisión por trade",
    definition: "Comisiones y fees promedio por trade.",
    notes: "Requiere fees_commissions.",
    method: "Promedio de fees_commissions.",
    example: "Fees 1, 2 => promedio 1.5",
  },
  execution_latency_avg_ms: {
    name: "Latencia de ejecución (ms)",
    definition: "Tiempo promedio desde la señal hasta el primer fill.",
    notes: "Requiere signal_time y fills.",
    method: "Calcula ms desde señal a primer fill.",
    example: "Señal 10:00:00, fill 10:00:05 => 5000 ms",
  },
  equity_at_risk_avg_percent: {
    name: "Equity en riesgo promedio %",
    definition: "Riesgo planificado promedio como % del equity.",
    notes: "Requiere curva de equity y riesgo planificado.",
    method: "Mapea equity al momento de entrada y calcula el ratio.",
    example: "Riesgo 100 en equity 10,000 => 1%",
  },
  gross_exposure_avg_percent: {
    name: "Exposición bruta promedio %",
    definition: "Exposición nocional promedio como % del equity.",
    notes: "Notional = precio de entrada * cantidad.",
    method: "Calcula notional por trade y divide por equity.",
    example: "Notional 20,000 en equity 100,000 => 20%",
  },
  concentration_hhi: {
    name: "Concentración HHI",
    definition: "Índice de Herfindahl de concentración nocional por símbolo.",
    notes: "Más alto significa mayor concentración.",
    method: "Agrega notional por símbolo y calcula HHI.",
    example: "Dos símbolos 50/50 => HHI = 0.5",
  },
  mae_avg: {
    name: "MAE promedio",
    definition: "Excursión adversa máxima promedio.",
    notes: "Asume MAE en moneda.",
    method: "Promedio de valores MAE.",
    example: "MAE -30, -20 => promedio -25",
  },
  mfe_avg: {
    name: "MFE promedio",
    definition: "Excursión favorable máxima promedio.",
    notes: "Asume MFE en moneda.",
    method: "Promedio de valores MFE.",
    example: "MFE 50, 80 => promedio 65",
  },
};

export function getKpiText(kpi: KPIDefinition, lang: "en" | "es"): KPILocalizedText {
  if (lang !== "es") {
    return {
      name: kpi.name,
      definition: kpi.definition,
      notes: kpi.notes,
      method: kpi.method,
      example: kpi.example,
      formula: kpi.formula,
    };
  }
  const es = KPI_I18N_ES[kpi.id];
  return {
    name: es?.name ?? kpi.name,
    definition: es?.definition ?? kpi.definition,
    notes: es?.notes ?? kpi.notes,
    method: es?.method ?? kpi.method,
    example: es?.example ?? kpi.example,
    formula: kpi.formula,
  };
}

const KPI_INPUT_LABELS: Record<"en" | "es", Record<string, string>> = {
  en: {
    realized_pnl: "Realized P&L",
    equity_curve: "Equity curve",
    planned_risk: "Planned risk",
    trade_id: "Trade ID",
    returns: "Returns",
    benchmark: "Benchmark",
    trade_returns: "Trade returns",
    entry_time: "Entry time",
    exit_time: "Exit time",
    arrival_price: "Arrival/decision price",
    "fills/entry_price": "Execution price",
    quantity: "Quantity",
    fees_commissions: "Fees & commissions",
    vwap: "VWAP",
    twap: "TWAP",
    intended_qty: "Intended quantity",
    "fills/quantity": "Filled quantity",
    spread_bps: "Spread (bps)",
    signal_time: "Signal time",
    fills: "Order fills",
    entry_price: "Entry price",
    symbol: "Symbol",
    mae: "MAE (Max Adverse Excursion)",
    mfe: "MFE (Max Favorable Excursion)",
  },
  es: {
    realized_pnl: "P&L realizado",
    equity_curve: "Curva de equity",
    planned_risk: "Riesgo planificado",
    trade_id: "ID de trade",
    returns: "Retornos",
    benchmark: "Benchmark (referencia)",
    trade_returns: "Retornos por trade",
    entry_time: "Hora de entrada",
    exit_time: "Hora de salida",
    arrival_price: "Precio de llegada/decisión",
    "fills/entry_price": "Precio de ejecución",
    quantity: "Cantidad",
    fees_commissions: "Comisiones y fees",
    vwap: "VWAP",
    twap: "TWAP",
    intended_qty: "Cantidad intencionada",
    "fills/quantity": "Cantidad ejecutada",
    spread_bps: "Spread (bps)",
    signal_time: "Hora de señal",
    fills: "Fills de la orden",
    entry_price: "Precio de entrada",
    symbol: "Símbolo",
    mae: "MAE (Excursión adversa máxima)",
    mfe: "MFE (Excursión favorable máxima)",
  },
};

export function formatKpiInputs(inputs: string[] | undefined, lang: "en" | "es"): string[] {
  const list = inputs ?? [];
  const labels = KPI_INPUT_LABELS[lang];
  return list.map((item) => labels[item] ?? item);
}

const FORMULA_LABELS: Record<"en" | "es", Record<string, string>> = {
  en: {
    realized_pnl: "realized P&L",
    gross_profit: "gross profit",
    gross_loss: "gross loss",
    avg_win: "avg win",
    avg_loss: "avg loss",
    net_pnl: "net P&L",
    planned_risk: "planned risk",
    wins: "wins",
    losses: "losses",
    total_trades: "total trades",
    equity_last: "ending equity",
    equity_first: "starting equity",
    peak: "peak",
    trough: "trough",
    equity: "equity",
    total_return: "total return",
    max_drawdown_abs: "max drawdown",
    drawdown: "drawdown",
    returns: "returns",
    trade_returns: "trade returns",
    P95: "95th percentile",
    P5: "5th percentile",
    VaR95: "VaR95",
    mean: "avg",
    std: "std dev",
    abs: "absolute",
    exec_price: "execution price",
    arrival_price: "arrival price",
    direction: "side",
    qty: "qty",
    fees: "fees",
    vwap: "VWAP",
    twap: "TWAP",
    filled_qty: "filled qty",
    intended_qty: "intended qty",
    spread_bps: "spread (bps)",
    first_fill_time: "first fill time",
    signal_time: "signal time",
    entry_time: "entry time",
    exit_time: "exit time",
    equity_at_entry: "equity at entry",
    notional: "notional",
    symbol_notional: "symbol notional",
    total_notional: "total notional",
    mae: "MAE",
    mfe: "MFE",
    beta: "beta",
    rf: "risk-free rate",
    benchmark: "benchmark",
    portfolio: "portfolio",
    rp: "portfolio returns",
    rb: "benchmark returns",
    LPM: "LPM",
  },
  es: {
    realized_pnl: "P&L realizado",
    gross_profit: "ganancia bruta",
    gross_loss: "pérdida bruta",
    avg_win: "ganancia promedio",
    avg_loss: "pérdida promedio",
    net_pnl: "P&L neto",
    planned_risk: "riesgo planificado",
    wins: "ganadas",
    losses: "pérdidas",
    total_trades: "total de trades",
    equity_last: "equity final",
    equity_first: "equity inicial",
    peak: "pico",
    trough: "valle",
    equity: "equity",
    total_return: "retorno total",
    max_drawdown_abs: "drawdown máximo",
    drawdown: "drawdown",
    returns: "retornos",
    trade_returns: "retornos por trade",
    P95: "percentil 95",
    P5: "percentil 5",
    VaR95: "VaR95",
    mean: "promedio",
    std: "desv. estándar",
    abs: "valor absoluto",
    exec_price: "precio de ejecución",
    arrival_price: "precio de llegada",
    direction: "dirección",
    qty: "cantidad",
    fees: "fees",
    vwap: "VWAP",
    twap: "TWAP",
    filled_qty: "cantidad ejecutada",
    intended_qty: "cantidad intencionada",
    spread_bps: "spread (bps)",
    first_fill_time: "primer fill",
    signal_time: "hora de señal",
    entry_time: "hora de entrada",
    exit_time: "hora de salida",
    equity_at_entry: "equity al entrar",
    notional: "notional",
    symbol_notional: "notional por símbolo",
    total_notional: "notional total",
    mae: "MAE",
    mfe: "MFE",
    beta: "beta",
    rf: "tasa libre de riesgo",
    benchmark: "benchmark",
    portfolio: "portafolio",
    rp: "retornos del portafolio",
    rb: "retornos del benchmark",
    LPM: "LPM",
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function humanizeKpiFormula(formula: string, lang: "en" | "es"): string {
  if (!formula) return "";
  const map = FORMULA_LABELS[lang];
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = formula.replace(/Σ/g, lang === "es" ? "Suma de " : "Sum of ");
  for (const key of keys) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(key)}\\b`, "g"), map[key]);
  }
  return out;
}

export const KPI_DIRECTION: Partial<Record<KPIId, "higher" | "lower">> = {
  net_pnl: "higher",
  gross_profit: "higher",
  gross_loss: "higher",
  roi_percent: "higher",
  cagr: "higher",
  win_rate: "higher",
  loss_rate: "lower",
  avg_win: "higher",
  avg_loss: "higher",
  expectancy: "higher",
  profit_factor: "higher",
  payoff_ratio: "higher",
  avg_r_multiple: "higher",
  profit_per_trade: "higher",
  max_drawdown_percent: "lower",
  avg_drawdown_percent: "lower",
  drawdown_duration_avg_days: "lower",
  time_to_recovery_avg_days: "lower",
  recovery_factor: "higher",
  calmar_ratio: "higher",
  ulcer_index: "lower",
  mar_ratio: "higher",
  var_95: "higher",
  cvar_95: "higher",
  tail_ratio: "higher",
  risk_of_ruin: "lower",
  sharpe_ratio: "higher",
  sortino_ratio: "higher",
  treynor_ratio: "higher",
  information_ratio: "higher",
  alpha: "higher",
  tracking_error: "lower",
  omega_ratio: "higher",
  gain_to_pain_ratio: "higher",
  kappa_3_ratio: "higher",
  return_std_dev: "lower",
  sqn_system_quality_number: "higher",
  median_trade_return: "higher",
  best_trade_pnl: "higher",
  worst_trade_pnl: "higher",
  max_consecutive_wins: "higher",
  max_consecutive_losses: "lower",
  avg_slippage: "lower",
  implementation_shortfall: "lower",
  vwap_slippage: "lower",
  twap_slippage: "lower",
  fill_rate: "higher",
  spread_paid_avg: "lower",
  commission_per_trade_avg: "lower",
  execution_latency_avg_ms: "lower",
  equity_at_risk_avg_percent: "lower",
  gross_exposure_avg_percent: "lower",
  concentration_hhi: "lower",
  mae_avg: "lower",
  mfe_avg: "higher",
};

// ----------------------------
// Compute functions (60)
// ----------------------------

export function computeKPI_net_pnl(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("net_pnl", null, "No trades.");
  const value = sum(trades.map((t) => safeNumber(t.realized_pnl) ?? 0));
  return buildResult("net_pnl", value);
}

export function computeKPI_gross_profit(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("gross_profit", null, "No trades.");
  const value = sum(trades.map((t) => Math.max(0, safeNumber(t.realized_pnl) ?? 0)));
  return buildResult("gross_profit", value);
}

export function computeKPI_gross_loss(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("gross_loss", null, "No trades.");
  const value = sum(trades.map((t) => Math.min(0, safeNumber(t.realized_pnl) ?? 0)));
  return buildResult("gross_loss", value);
}

export function computeKPI_roi_percent(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const total = equityReturnTotal(equity);
  if (total == null) return buildResult("roi_percent", null, "Missing equity curve.");
  return buildResult("roi_percent", total);
}

export function computeKPI_cagr(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const c = computeCagr(equity, cfgWithDefaults(cfg).annualizationDays);
  if (c == null) return buildResult("cagr", null, "Missing equity curve.");
  return buildResult("cagr", c);
}

export function computeKPI_win_rate(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("win_rate", null, "No trades.");
  const wins = trades.filter((t) => (safeNumber(t.realized_pnl) ?? 0) > 0).length;
  const value = (wins / trades.length) * 100;
  return buildResult("win_rate", value);
}

export function computeKPI_loss_rate(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("loss_rate", null, "No trades.");
  const losses = trades.filter((t) => (safeNumber(t.realized_pnl) ?? 0) < 0).length;
  const value = (losses / trades.length) * 100;
  return buildResult("loss_rate", value);
}

export function computeKPI_avg_win(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("avg_win", null, "No trades.");
  const wins = trades.map((t) => safeNumber(t.realized_pnl) ?? 0).filter((v) => v > 0);
  if (wins.length === 0) return buildResult("avg_win", null, "No winning trades.");
  return buildResult("avg_win", mean(wins));
}

export function computeKPI_avg_loss(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("avg_loss", null, "No trades.");
  const losses = trades.map((t) => safeNumber(t.realized_pnl) ?? 0).filter((v) => v < 0);
  if (losses.length === 0) return buildResult("avg_loss", null, "No losing trades.");
  return buildResult("avg_loss", mean(losses));
}

export function computeKPI_expectancy(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("expectancy", null, "No trades.");
  const avgWinRes = computeKPI_avg_win(trades);
  const avgLossRes = computeKPI_avg_loss(trades);
  if (avgWinRes.value == null || avgLossRes.value == null) {
    return buildResult("expectancy", null, "Requires wins and losses.");
  }
  const winRate = computeKPI_win_rate(trades).value ?? 0;
  const lossRate = computeKPI_loss_rate(trades).value ?? 0;
  const value = (winRate / 100) * avgWinRes.value + (lossRate / 100) * avgLossRes.value;
  return buildResult("expectancy", value);
}

export function computeKPI_profit_factor(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("profit_factor", null, "No trades.");
  const grossProfit = computeKPI_gross_profit(trades).value ?? 0;
  const grossLoss = computeKPI_gross_loss(trades).value ?? 0;
  if (grossLoss === 0) return buildResult("profit_factor", null, "No losses.");
  return buildResult("profit_factor", grossProfit / Math.abs(grossLoss));
}

export function computeKPI_payoff_ratio(trades: Trade[]): KPIResult {
  const avgWin = computeKPI_avg_win(trades).value;
  const avgLoss = computeKPI_avg_loss(trades).value;
  if (avgWin == null || avgLoss == null) return buildResult("payoff_ratio", null, "Requires wins and losses.");
  if (avgLoss === 0) return buildResult("payoff_ratio", null, "Average loss is 0.");
  return buildResult("payoff_ratio", avgWin / Math.abs(avgLoss));
}

export function computeKPI_avg_r_multiple(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("avg_r_multiple", null, "No trades.");
  const rs = rMultiples(trades);
  if (rs.length === 0) return buildResult("avg_r_multiple", null, "Missing planned_risk.");
  return buildResult("avg_r_multiple", mean(rs));
}

export function computeKPI_total_trades(trades: Trade[]): KPIResult {
  return buildResult("total_trades", trades?.length ?? 0);
}

export function computeKPI_profit_per_trade(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("profit_per_trade", null, "No trades.");
  const net = computeKPI_net_pnl(trades).value ?? 0;
  return buildResult("profit_per_trade", net / trades.length);
}

export function computeKPI_max_drawdown_percent(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const dd = maxDrawdownPct(equity);
  if (dd == null) return buildResult("max_drawdown_percent", null, "Missing equity curve.");
  return buildResult("max_drawdown_percent", dd);
}

export function computeKPI_avg_drawdown_percent(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const series = drawdownSeries(equity);
  if (series.length === 0) return buildResult("avg_drawdown_percent", null, "Missing equity curve.");
  const avg = mean(series.map((s) => s.pct * 100));
  return buildResult("avg_drawdown_percent", avg);
}

export function computeKPI_drawdown_duration_avg_days(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const series = drawdownSeries(equity);
  if (series.length === 0) return buildResult("drawdown_duration_avg_days", null, "Missing equity curve.");
  return buildResult("drawdown_duration_avg_days", mean(series.map((s) => s.durationDays)));
}

export function computeKPI_time_to_recovery_avg_days(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const series = drawdownSeries(equity);
  if (series.length === 0) return buildResult("time_to_recovery_avg_days", null, "Missing equity curve.");
  return buildResult("time_to_recovery_avg_days", mean(series.map((s) => s.recoveryDays)));
}

export function computeKPI_recovery_factor(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const totalReturn = equityReturnTotal(equity);
  const maxDd = maxDrawdownAbs(equity);
  if (totalReturn == null || maxDd == null) return buildResult("recovery_factor", null, "Missing equity curve.");
  if (maxDd === 0) return buildResult("recovery_factor", null, "Max drawdown is 0.");
  const first = equityPoints(equity)[0]?.value ?? 0;
  const last = equityPoints(equity).slice(-1)[0]?.value ?? 0;
  const totalAbs = last - first;
  return buildResult("recovery_factor", totalAbs / maxDd);
}

export function computeKPI_calmar_ratio(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const cagr = computeCagr(equity, cfgWithDefaults(cfg).annualizationDays);
  const maxDd = maxDrawdownPct(equity);
  if (cagr == null || maxDd == null) return buildResult("calmar_ratio", null, "Missing equity curve.");
  if (maxDd === 0) return buildResult("calmar_ratio", null, "Max drawdown is 0.");
  return buildResult("calmar_ratio", (cagr / 100) / (maxDd / 100));
}

export function computeKPI_ulcer_index(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const pts = equityPoints(equity);
  if (pts.length < 2) return buildResult("ulcer_index", null, "Missing equity curve.");
  let peak = pts[0].value;
  const drawdowns: number[] = [];
  for (const p of pts) {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? ((peak - p.value) / peak) * 100 : 0;
    drawdowns.push(dd);
  }
  const ui = Math.sqrt(mean(drawdowns.map((d) => d * d)));
  return buildResult("ulcer_index", ui);
}

export function computeKPI_mar_ratio(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const cagr = computeCagr(equity, cfgWithDefaults(cfg).annualizationDays);
  const maxDd = maxDrawdownPct(equity);
  if (cagr == null || maxDd == null) return buildResult("mar_ratio", null, "Missing equity curve.");
  if (maxDd === 0) return buildResult("mar_ratio", null, "Max drawdown is 0.");
  return buildResult("mar_ratio", (cagr / 100) / (maxDd / 100));
}

export function computeKPI_var_95(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const returns = dailyReturnsFromEquity(equity);
  const fallback = returns.length ? returns : tradeReturns(trades);
  if (fallback.length === 0) return buildResult("var_95", null, "No returns.");
  const v = quantile(fallback, 1 - (cfgWithDefaults(cfg).varConfidence));
  return buildResult("var_95", v);
}

export function computeKPI_cvar_95(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const returns = dailyReturnsFromEquity(equity);
  const fallback = returns.length ? returns : tradeReturns(trades);
  if (fallback.length === 0) return buildResult("cvar_95", null, "No returns.");
  const v = quantile(fallback, 1 - (cfgWithDefaults(cfg).varConfidence));
  const tail = fallback.filter((r) => r <= v);
  if (tail.length === 0) return buildResult("cvar_95", null, "No tail losses.");
  return buildResult("cvar_95", mean(tail));
}

export function computeKPI_tail_ratio(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const returns = dailyReturnsFromEquity(equity);
  const fallback = returns.length ? returns : tradeReturns(trades);
  if (fallback.length === 0) return buildResult("tail_ratio", null, "No returns.");
  const p95 = quantile(fallback, 0.95);
  const p5 = quantile(fallback, 0.05);
  if (p5 === 0) return buildResult("tail_ratio", null, "5th percentile is 0.");
  return buildResult("tail_ratio", p95 / Math.abs(p5));
}

export function computeKPI_risk_of_ruin(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("risk_of_ruin", null, "No trades.");
  const winRate = computeKPI_win_rate(trades).value;
  const payoff = computeKPI_payoff_ratio(trades).value;
  if (winRate == null || payoff == null || payoff === 0) return buildResult("risk_of_ruin", null, "Requires win rate and payoff ratio.");
  const p = winRate / 100;
  const q = 1 - p;
  if (p <= 0) return buildResult("risk_of_ruin", null, "Win rate is 0.");
  const proxy = Math.min(1, q / (p * payoff));
  return buildResult("risk_of_ruin", proxy * 100);
}

export function computeKPI_sharpe_ratio(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const returns = dailyReturnsFromEquity(equity);
  if (returns.length === 0) return buildResult("sharpe_ratio", null, "Missing equity curve.");
  const c = cfgWithDefaults(cfg);
  const rfDaily = (c.riskFreeRate * 100) / c.annualizationDays;
  const excess = returns.map((r) => r - rfDaily);
  const sd = stddev(excess);
  if (sd === 0) return buildResult("sharpe_ratio", null, "Zero volatility.");
  const value = (mean(excess) / sd) * Math.sqrt(c.annualizationDays);
  return buildResult("sharpe_ratio", value);
}

export function computeKPI_sortino_ratio(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const returns = dailyReturnsFromEquity(equity);
  if (returns.length === 0) return buildResult("sortino_ratio", null, "Missing equity curve.");
  const c = cfgWithDefaults(cfg);
  const threshold = c.downsideThreshold;
  const sd = downsideDeviation(returns, threshold);
  if (sd === 0) return buildResult("sortino_ratio", null, "Zero downside deviation.");
  const rfDaily = (c.riskFreeRate * 100) / c.annualizationDays;
  const excess = returns.map((r) => r - rfDaily);
  const value = (mean(excess) / sd) * Math.sqrt(c.annualizationDays);
  return buildResult("sortino_ratio", value);
}

export function computeKPI_treynor_ratio(trades: Trade[], equity?: EquityPoint[], benchmark?: BenchmarkPoint[], cfg?: KPIComputeConfig): KPIResult {
  const aligned = alignReturns(equity, benchmark);
  if (aligned.portfolio.length === 0) return buildResult("treynor_ratio", null, "Missing benchmark alignment.");
  const { beta } = regressionAlphaBeta(aligned.portfolio, aligned.benchmark);
  if (beta == null || beta === 0) return buildResult("treynor_ratio", null, "Beta unavailable.");
  const c = cfgWithDefaults(cfg);
  const rfDaily = (c.riskFreeRate * 100) / c.annualizationDays;
  const excess = mean(aligned.portfolio.map((r) => r - rfDaily));
  const annual = excess * c.annualizationDays;
  return buildResult("treynor_ratio", annual / beta);
}

export function computeKPI_information_ratio(trades: Trade[], equity?: EquityPoint[], benchmark?: BenchmarkPoint[]): KPIResult {
  const aligned = alignReturns(equity, benchmark);
  if (aligned.portfolio.length === 0) return buildResult("information_ratio", null, "Missing benchmark alignment.");
  const active = aligned.portfolio.map((r, i) => r - aligned.benchmark[i]);
  const te = stddev(active);
  if (te === 0) return buildResult("information_ratio", null, "Tracking error is 0.");
  return buildResult("information_ratio", mean(active) / te);
}

export function computeKPI_alpha(trades: Trade[], equity?: EquityPoint[], benchmark?: BenchmarkPoint[], cfg?: KPIComputeConfig): KPIResult {
  const aligned = alignReturns(equity, benchmark);
  if (aligned.portfolio.length === 0) return buildResult("alpha", null, "Missing benchmark alignment.");
  const { alpha } = regressionAlphaBeta(aligned.portfolio, aligned.benchmark);
  if (alpha == null) return buildResult("alpha", null, "Alpha unavailable.");
  const annual = alpha * cfgWithDefaults(cfg).annualizationDays;
  return buildResult("alpha", annual);
}

export function computeKPI_beta(trades: Trade[], equity?: EquityPoint[], benchmark?: BenchmarkPoint[]): KPIResult {
  const aligned = alignReturns(equity, benchmark);
  if (aligned.portfolio.length === 0) return buildResult("beta", null, "Missing benchmark alignment.");
  const { beta } = regressionAlphaBeta(aligned.portfolio, aligned.benchmark);
  if (beta == null) return buildResult("beta", null, "Beta unavailable.");
  return buildResult("beta", beta);
}

export function computeKPI_tracking_error(trades: Trade[], equity?: EquityPoint[], benchmark?: BenchmarkPoint[]): KPIResult {
  const aligned = alignReturns(equity, benchmark);
  if (aligned.portfolio.length === 0) return buildResult("tracking_error", null, "Missing benchmark alignment.");
  const active = aligned.portfolio.map((r, i) => r - aligned.benchmark[i]);
  return buildResult("tracking_error", stddev(active));
}

export function computeKPI_omega_ratio(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const returns = dailyReturnsFromEquity(equity);
  const fallback = returns.length ? returns : tradeReturns(trades);
  if (fallback.length === 0) return buildResult("omega_ratio", null, "No returns.");
  const threshold = cfgWithDefaults(cfg).omegaThreshold;
  const gains = sum(fallback.map((r) => Math.max(0, r - threshold)));
  const losses = sum(fallback.map((r) => Math.max(0, threshold - r)));
  if (losses === 0) return buildResult("omega_ratio", null, "No losses below threshold.");
  return buildResult("omega_ratio", gains / losses);
}

export function computeKPI_gain_to_pain_ratio(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const returns = dailyReturnsFromEquity(equity);
  const fallback = returns.length ? returns : tradeReturns(trades);
  if (fallback.length === 0) return buildResult("gain_to_pain_ratio", null, "No returns.");
  const gains = sum(fallback.filter((r) => r > 0));
  const losses = sum(fallback.filter((r) => r < 0));
  if (losses === 0) return buildResult("gain_to_pain_ratio", null, "No losses.");
  return buildResult("gain_to_pain_ratio", gains / Math.abs(losses));
}

export function computeKPI_kappa_3_ratio(trades: Trade[], equity?: EquityPoint[], cfg?: KPIComputeConfig): KPIResult {
  const returns = dailyReturnsFromEquity(equity);
  const fallback = returns.length ? returns : tradeReturns(trades);
  if (fallback.length === 0) return buildResult("kappa_3_ratio", null, "No returns.");
  const threshold = cfgWithDefaults(cfg).downsideThreshold;
  const lpm3 = mean(fallback.map((r) => Math.max(0, threshold - r) ** 3));
  if (lpm3 === 0) return buildResult("kappa_3_ratio", null, "No downside risk.");
  const meanExcess = mean(fallback.map((r) => r - threshold));
  return buildResult("kappa_3_ratio", meanExcess / Math.pow(lpm3, 1 / 3));
}

export function computeKPI_return_std_dev(trades: Trade[]): KPIResult {
  const returns = tradeReturns(trades);
  if (returns.length === 0) return buildResult("return_std_dev", null, "No returns.");
  return buildResult("return_std_dev", stddev(returns));
}

export function computeKPI_skewness(trades: Trade[]): KPIResult {
  const returns = tradeReturns(trades);
  if (returns.length === 0) return buildResult("skewness", null, "No returns.");
  return buildResult("skewness", skewness(returns));
}

export function computeKPI_kurtosis(trades: Trade[]): KPIResult {
  const returns = tradeReturns(trades);
  if (returns.length === 0) return buildResult("kurtosis", null, "No returns.");
  return buildResult("kurtosis", kurtosis(returns));
}

export function computeKPI_sqn_system_quality_number(trades: Trade[]): KPIResult {
  const rs = rMultiples(trades);
  if (rs.length === 0) return buildResult("sqn_system_quality_number", null, "Missing planned_risk.");
  const sd = stddev(rs);
  if (sd === 0) return buildResult("sqn_system_quality_number", null, "Zero R-multiple volatility.");
  return buildResult("sqn_system_quality_number", Math.sqrt(rs.length) * (mean(rs) / sd));
}

export function computeKPI_avg_trade_duration_minutes(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("avg_trade_duration_minutes", null, "No trades.");
  const durations: number[] = [];
  for (const t of trades) {
    const entry = toDate(t.entry_time);
    const exit = toDate(t.exit_time);
    if (!entry || !exit) continue;
    durations.push(minutesBetween(entry, exit));
  }
  if (durations.length === 0) return buildResult("avg_trade_duration_minutes", null, "Missing trade times.");
  return buildResult("avg_trade_duration_minutes", mean(durations));
}

export function computeKPI_median_trade_return(trades: Trade[]): KPIResult {
  const returns = tradeReturns(trades);
  if (returns.length === 0) return buildResult("median_trade_return", null, "No returns.");
  return buildResult("median_trade_return", median(returns));
}

export function computeKPI_best_trade_pnl(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("best_trade_pnl", null, "No trades.");
  const vals = trades.map((t) => safeNumber(t.realized_pnl) ?? 0);
  return buildResult("best_trade_pnl", Math.max(...vals));
}

export function computeKPI_worst_trade_pnl(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("worst_trade_pnl", null, "No trades.");
  const vals = trades.map((t) => safeNumber(t.realized_pnl) ?? 0);
  return buildResult("worst_trade_pnl", Math.min(...vals));
}

export function computeKPI_max_consecutive_wins(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("max_consecutive_wins", null, "No trades.");
  const sorted = [...trades].sort((a, b) => {
    const da = toDate(a.exit_time)?.getTime() ?? 0;
    const db = toDate(b.exit_time)?.getTime() ?? 0;
    return da - db;
  });
  const pnls = sorted.map((t) => safeNumber(t.realized_pnl) ?? 0);
  return buildResult("max_consecutive_wins", maxConsecutive(pnls, (n) => n > 0));
}

export function computeKPI_max_consecutive_losses(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("max_consecutive_losses", null, "No trades.");
  const sorted = [...trades].sort((a, b) => {
    const da = toDate(a.exit_time)?.getTime() ?? 0;
    const db = toDate(b.exit_time)?.getTime() ?? 0;
    return da - db;
  });
  const pnls = sorted.map((t) => safeNumber(t.realized_pnl) ?? 0);
  return buildResult("max_consecutive_losses", maxConsecutive(pnls, (n) => n < 0));
}

export function computeKPI_avg_slippage(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("avg_slippage", null, "No trades.");
  const vals: number[] = [];
  for (const t of trades) {
    const arrival = safeNumber(t.arrival_price ?? null);
    const exec = getExecutionPrice(t);
    const qty = safeNumber(t.quantity);
    if (arrival == null || exec == null || qty == null) continue;
    const direction = t.side === "short" ? -1 : 1;
    vals.push((exec - arrival) * direction * qty);
  }
  if (vals.length === 0) return buildResult("avg_slippage", null, "Missing arrival price or fills.");
  return buildResult("avg_slippage", mean(vals));
}

export function computeKPI_implementation_shortfall(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("implementation_shortfall", null, "No trades.");
  const vals: number[] = [];
  for (const t of trades) {
    const arrival = safeNumber(t.arrival_price ?? null);
    const exec = getExecutionPrice(t);
    const qty = safeNumber(t.quantity);
    const fees = safeNumber(t.fees_commissions ?? null) ?? 0;
    if (arrival == null || exec == null || qty == null) continue;
    const direction = t.side === "short" ? -1 : 1;
    vals.push((exec - arrival) * direction * qty + fees);
  }
  if (vals.length === 0) return buildResult("implementation_shortfall", null, "Missing arrival price or fills.");
  return buildResult("implementation_shortfall", mean(vals));
}

export function computeKPI_vwap_slippage(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("vwap_slippage", null, "No trades.");
  const vals: number[] = [];
  for (const t of trades) {
    const vwap = safeNumber(t.vwap ?? null);
    const exec = getExecutionPrice(t);
    const qty = safeNumber(t.quantity);
    if (vwap == null || exec == null || qty == null) continue;
    const direction = t.side === "short" ? -1 : 1;
    vals.push((exec - vwap) * direction * qty);
  }
  if (vals.length === 0) return buildResult("vwap_slippage", null, "Missing VWAP.");
  return buildResult("vwap_slippage", mean(vals));
}

export function computeKPI_twap_slippage(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("twap_slippage", null, "No trades.");
  const vals: number[] = [];
  for (const t of trades) {
    const twap = safeNumber(t.twap ?? null);
    const exec = getExecutionPrice(t);
    const qty = safeNumber(t.quantity);
    if (twap == null || exec == null || qty == null) continue;
    const direction = t.side === "short" ? -1 : 1;
    vals.push((exec - twap) * direction * qty);
  }
  if (vals.length === 0) return buildResult("twap_slippage", null, "Missing TWAP.");
  return buildResult("twap_slippage", mean(vals));
}

export function computeKPI_fill_rate(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("fill_rate", null, "No trades.");
  const rates: number[] = [];
  for (const t of trades) {
    const intended = safeNumber(t.intended_qty ?? null);
    const fills = t.fills ?? [];
    let filled = 0;
    for (const f of fills) {
      const q = safeNumber(f.qty);
      if (q != null) filled += q;
    }
    if (!fills.length) {
      const q = safeNumber(t.quantity);
      if (q != null) filled = q;
    }
    if (intended == null || intended === 0) continue;
    rates.push((filled / intended) * 100);
  }
  if (rates.length === 0) return buildResult("fill_rate", null, "Missing intended qty.");
  return buildResult("fill_rate", mean(rates));
}

export function computeKPI_spread_paid_avg(trades: Trade[]): KPIResult {
  const vals = trades.map((t) => safeNumber(t.spread_bps ?? null)).filter((v): v is number => v != null);
  if (vals.length === 0) return buildResult("spread_paid_avg", null, "Missing spread_bps.");
  return buildResult("spread_paid_avg", mean(vals));
}

export function computeKPI_commission_per_trade_avg(trades: Trade[]): KPIResult {
  const vals = trades.map((t) => safeNumber(t.fees_commissions ?? null)).filter((v): v is number => v != null);
  if (vals.length === 0) return buildResult("commission_per_trade_avg", null, "Missing fees_commissions.");
  return buildResult("commission_per_trade_avg", mean(vals));
}

export function computeKPI_execution_latency_avg_ms(trades: Trade[]): KPIResult {
  const vals: number[] = [];
  for (const t of trades) {
    const signal = toDate(t.signal_time ?? null);
    const fill = firstFillTime(t);
    if (!signal || !fill) continue;
    vals.push(fill.getTime() - signal.getTime());
  }
  if (vals.length === 0) return buildResult("execution_latency_avg_ms", null, "Missing signal_time or fills.");
  return buildResult("execution_latency_avg_ms", mean(vals));
}

export function computeKPI_equity_at_risk_avg_percent(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const vals: number[] = [];
  for (const t of trades) {
    const risk = safeNumber(t.planned_risk ?? null);
    const eq = getEquityAtTime(equity, t.entry_time);
    if (risk == null || eq == null || eq === 0) continue;
    vals.push((risk / eq) * 100);
  }
  if (vals.length === 0) return buildResult("equity_at_risk_avg_percent", null, "Missing planned_risk or equity.");
  return buildResult("equity_at_risk_avg_percent", mean(vals));
}

export function computeKPI_gross_exposure_avg_percent(trades: Trade[], equity?: EquityPoint[]): KPIResult {
  const vals: number[] = [];
  for (const t of trades) {
    const eq = getEquityAtTime(equity, t.entry_time);
    const notional = safeNumber(t.entry_price) && safeNumber(t.quantity)
      ? Math.abs((t.entry_price || 0) * (t.quantity || 0))
      : null;
    if (eq == null || eq === 0 || notional == null) continue;
    vals.push((notional / eq) * 100);
  }
  if (vals.length === 0) return buildResult("gross_exposure_avg_percent", null, "Missing equity or notional.");
  return buildResult("gross_exposure_avg_percent", mean(vals));
}

export function computeKPI_concentration_hhi(trades: Trade[]): KPIResult {
  if (!hasTrades(trades)) return buildResult("concentration_hhi", null, "No trades.");
  const bySymbol = new Map<string, number>();
  let total = 0;
  for (const t of trades) {
    const notional = safeNumber(t.entry_price) && safeNumber(t.quantity)
      ? Math.abs((t.entry_price || 0) * (t.quantity || 0))
      : null;
    if (notional == null) continue;
    total += notional;
    const prev = bySymbol.get(t.symbol) ?? 0;
    bySymbol.set(t.symbol, prev + notional);
  }
  if (total === 0) return buildResult("concentration_hhi", null, "Missing notional.");
  let hhi = 0;
  for (const v of bySymbol.values()) {
    const w = v / total;
    hhi += w * w;
  }
  return buildResult("concentration_hhi", hhi);
}

export function computeKPI_mae_avg(trades: Trade[]): KPIResult {
  const vals = trades.map((t) => safeNumber(t.mae ?? null)).filter((v): v is number => v != null);
  if (vals.length === 0) return buildResult("mae_avg", null, "Missing mae.");
  return buildResult("mae_avg", mean(vals));
}

export function computeKPI_mfe_avg(trades: Trade[]): KPIResult {
  const vals = trades.map((t) => safeNumber(t.mfe ?? null)).filter((v): v is number => v != null);
  if (vals.length === 0) return buildResult("mfe_avg", null, "Missing mfe.");
  return buildResult("mfe_avg", mean(vals));
}

// ----------------------------
// All KPIs
// ----------------------------

export function computeAllKPIs(
  trades: Trade[],
  equity?: EquityPoint[],
  benchmark?: BenchmarkPoint[],
  cfg?: KPIComputeConfig
): KPIResult[] {
  return [
    computeKPI_net_pnl(trades),
    computeKPI_gross_profit(trades),
    computeKPI_gross_loss(trades),
    computeKPI_roi_percent(trades, equity),
    computeKPI_cagr(trades, equity, cfg),
    computeKPI_win_rate(trades),
    computeKPI_loss_rate(trades),
    computeKPI_avg_win(trades),
    computeKPI_avg_loss(trades),
    computeKPI_expectancy(trades),
    computeKPI_profit_factor(trades),
    computeKPI_payoff_ratio(trades),
    computeKPI_avg_r_multiple(trades),
    computeKPI_total_trades(trades),
    computeKPI_profit_per_trade(trades),
    computeKPI_max_drawdown_percent(trades, equity),
    computeKPI_avg_drawdown_percent(trades, equity),
    computeKPI_drawdown_duration_avg_days(trades, equity),
    computeKPI_time_to_recovery_avg_days(trades, equity),
    computeKPI_recovery_factor(trades, equity),
    computeKPI_calmar_ratio(trades, equity, cfg),
    computeKPI_ulcer_index(trades, equity),
    computeKPI_mar_ratio(trades, equity, cfg),
    computeKPI_var_95(trades, equity, cfg),
    computeKPI_cvar_95(trades, equity, cfg),
    computeKPI_tail_ratio(trades, equity),
    computeKPI_risk_of_ruin(trades),
    computeKPI_sharpe_ratio(trades, equity, cfg),
    computeKPI_sortino_ratio(trades, equity, cfg),
    computeKPI_treynor_ratio(trades, equity, benchmark, cfg),
    computeKPI_information_ratio(trades, equity, benchmark),
    computeKPI_alpha(trades, equity, benchmark, cfg),
    computeKPI_beta(trades, equity, benchmark),
    computeKPI_tracking_error(trades, equity, benchmark),
    computeKPI_omega_ratio(trades, equity, cfg),
    computeKPI_gain_to_pain_ratio(trades, equity),
    computeKPI_kappa_3_ratio(trades, equity, cfg),
    computeKPI_return_std_dev(trades),
    computeKPI_skewness(trades),
    computeKPI_kurtosis(trades),
    computeKPI_sqn_system_quality_number(trades),
    computeKPI_avg_trade_duration_minutes(trades),
    computeKPI_median_trade_return(trades),
    computeKPI_best_trade_pnl(trades),
    computeKPI_worst_trade_pnl(trades),
    computeKPI_max_consecutive_wins(trades),
    computeKPI_max_consecutive_losses(trades),
    computeKPI_avg_slippage(trades),
    computeKPI_implementation_shortfall(trades),
    computeKPI_vwap_slippage(trades),
    computeKPI_twap_slippage(trades),
    computeKPI_fill_rate(trades),
    computeKPI_spread_paid_avg(trades),
    computeKPI_commission_per_trade_avg(trades),
    computeKPI_execution_latency_avg_ms(trades),
    computeKPI_equity_at_risk_avg_percent(trades, equity),
    computeKPI_gross_exposure_avg_percent(trades, equity),
    computeKPI_concentration_hhi(trades),
    computeKPI_mae_avg(trades),
    computeKPI_mfe_avg(trades),
  ];
}

export function computeKPIsByGroup(
  trades: Trade[],
  groupBy: keyof Trade | ((t: Trade) => string),
  equity?: EquityPoint[],
  benchmark?: BenchmarkPoint[],
  cfg?: KPIComputeConfig
): Record<string, KPIResult[]> {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = typeof groupBy === "function" ? groupBy(t) : String((t as any)[groupBy] ?? "Unknown");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const out: Record<string, KPIResult[]> = {};
  for (const [key, groupTrades] of groups.entries()) {
    out[key] = computeAllKPIs(groupTrades, equity, benchmark, cfg);
  }
  return out;
}

export function getKPIDefinition(id: KPIId): KPIDefinition {
  return KPI_DEFS[id];
}
