# KPI Data Contract

This document describes the minimum and optional fields required by the institutional KPI library in `lib/kpiLibrary.ts`.

## Core Trade Fields (minimum)
Required for most P&L and distribution KPIs:
- `trade_id`: string
- `symbol`: string
- `asset_class`: string (e.g., `stock`, `option`, `future`, `crypto`)
- `side`: `long` | `short`
- `quantity`: number
- `entry_time`: ISO timestamp
- `exit_time`: ISO timestamp
- `entry_price`: number
- `exit_price`: number
- `realized_pnl`: number (net if available)

## Optional Trade Fields (used by specific KPIs)
Execution / TCA / Costs:
- `fees_commissions`: number (for `commission_per_trade_avg`, implementation shortfall)
- `arrival_price`: number (for `avg_slippage`, implementation shortfall)
- `intended_qty`: number (for `fill_rate`)
- `intended_price`: number (optional)
- `fills[]`: `{ price, qty, time }` (for slippage, fill rate, latency)
- `signal_time`: timestamp (for `execution_latency_avg_ms`)
- `vwap`, `twap`: number (for VWAP/TWAP slippage)
- `spread_bps`: number (for `spread_paid_avg`)

Risk / R-multiples:
- `planned_risk`: number (for `avg_r_multiple`, `sqn_system_quality_number`, `equity_at_risk_avg_percent`)
- `stop_price`, `target_price`: optional (not directly required by KPIs)

MAE/MFE:
- `mae`: number (currency)
- `mfe`: number (currency)

Segmentation tags:
- `setup_tag`, `entry_reason`, `exit_reason`, `market_regime_tag` (for grouping)

## Equity Curve (required for equity-based KPIs)
Type: `EquityPoint[]` with fields:
- `time`: ISO timestamp
- `equity_value`: number

Used by:
- ROI%, CAGR
- Max/avg drawdown, ulcer index, drawdown duration
- Sharpe/Sortino, VaR/CVaR (daily returns)
- Equity-at-risk and gross exposure percentages

## Benchmark Series (optional)
Type: `BenchmarkPoint[]` with fields:
- `time`: ISO timestamp
- `benchmark_return` (percent), OR
- `benchmark_price` (number)

Used by:
- Alpha, Beta, Treynor ratio, Information ratio, Tracking error

## KPI Output Rules
- If required inputs are missing for a KPI, the library returns `value: null` and a `reason`.
- Percent KPIs return **percent points** (e.g., `12.5` means 12.5%).
- Duration KPIs return numeric values in their unit (minutes or days).
