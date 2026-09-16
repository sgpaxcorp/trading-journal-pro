# Performance Attribution Engine

## Purpose

The Performance Attribution Engine is deterministic financial code. It does not use an LLM to calculate returns, P&L, benchmark-relative effects, or cash-flow adjustments. AI may explain a frozen engine result, but it must not recalculate it, replace missing data with zero, or promote a cost-basis snapshot to a period return.

This methodology follows the core performance principles described by the [GIPS calculation methodology](https://www.gipsstandards.org/wp-content/uploads/2021/03/calculation_methodology_gs_2011.pdf): use total return, remove the effect of external cash flows from portfolio-level performance, value at external-flow boundaries when possible, and geometrically link subperiod returns. This product does not claim GIPS compliance.

## Two views of return

### Portfolio-level return

The preferred method is geometrically linked time-weighted return (TWR):

```text
TWR = Product(1 + subperiod return) - 1
```

Each supplied subperiod must begin and end at a valuation boundary. A contribution or withdrawal creates a new boundary, so the external flow is not treated as manager or security performance.

When flow-date valuations are unavailable, the engine uses Modified Dietz as a disclosed approximation:

```text
R = (EMV - BMV - Sum(CF)) / (BMV + Sum(weight_i * CF_i))
weight_i = days remaining after flow_i / days in period
```

`CF` is positive for a contribution into the portfolio and negative for a withdrawal.

### Investor-level return

The engine calculates XIRR from the investor perspective:

```text
0 = Sum(investor cash flow_i / (1 + r)^(days_i / 365))
```

- Beginning portfolio value: investor outflow.
- Contribution: investor outflow.
- Withdrawal: investor inflow.
- Ending portfolio value: investor inflow.

XIRR reflects the timing and size of the investor's capital decisions. It is not used as a replacement for portfolio-level TWR.

## External cash flows and P&L

Investment P&L is always calculated as:

```text
Investment P&L = Ending value - Beginning value - Contributions + Withdrawals
```

Contributions and withdrawals are shown separately and are never classified as investment performance.

The P&L bridge has non-overlapping source fields:

- Realized gains and losses
- Unrealized gains and losses
- Dividends
- Cash income
- Fees and expenses, shown as a negative contribution
- Currency gain or loss
- Unexplained residual

The engine reports a component as `unavailable` when the ledger does not supply it. It never silently substitutes zero. A residual is fully reconciled only when every component is supplied and the difference is within the deterministic tolerance.

## Benchmark and active return

The benchmark comes from the active Investment Policy. Benchmark total return is preferred. A price-only benchmark return is marked `partial` because distributions are unavailable.

```text
Active return = Portfolio return - Benchmark return
```

Sector and security attribution use Brinson-Fachler arithmetic attribution:

```text
Sector exposure = (Wp - Wb) * (Rb,sector - Rb,total)
Selection = Wb * (Rp,sector - Rb,sector)
Interaction = (Wp - Wb) * (Rp,sector - Rb,sector)
Security selection shown = Selection + Interaction
```

Cash is separated from sector exposure:

```text
Cash effect = Wcash * (Rcash - Rbenchmark)
```

When reliable local and base-currency total returns exist, currency is separated as:

```text
Currency effect = Sum(Wp * (Rbase - Rlocal))
```

Fees are shown separately as observed period fees divided by beginning portfolio value. The residual captures timing, compounding, rounding, and unavailable evidence. Dividends, realized gains, and unrealized gains belong to the P&L-source view; they are not added again to active attribution.

## Concentration

Concentration is a non-additive diagnostic. For positions above the configured position cap:

```text
Excess-weight effect = Sum((Wp - cap) * (Rp - Rbenchmark))
```

This answers how the return associated with weight above the policy cap compared with the benchmark. It is not added to active-return attribution and is not an automatic diversification recommendation.

## Snapshot-only mode

The current Neuro holding form contains shares, average cost, current price, and optional purchase date. Without dated portfolio valuations and a complete transaction, income, fee, and cash-flow ledger, the engine can calculate only:

- Current cost basis
- Current market value
- Current open-position unrealized gain or loss
- Return on recorded cost
- Current concentration weights

Return on recorded cost is not TWR, Modified Dietz, XIRR, alpha, or benchmark-relative performance. The UI labels this state `cost_basis_snapshot` and lists the evidence required to unlock full-period attribution.

## Reproducibility controls

- All calculation inputs are serializable.
- Dates are normalized to ISO calendar dates.
- Percentage inputs use decimals; report outputs use percentage points.
- Monetary outputs round to cents only after calculation.
- Return outputs round only at the report boundary.
- XIRR uses a deterministic bracket-and-bisection solver.
- The saved Neuro report and committee evidence preserve the exact calculated record.
- Unit fixtures cover linked TWR, Modified Dietz, XIRR, external-flow exclusion, P&L reconciliation, Brinson attribution, currency attribution, and snapshot-only behavior.

## Full-period input contract

`POST /api/neuro-analysis/performance-attribution` runs independently of OpenAI. It authenticates the user, loads the active investment policy on the server, and accepts an optional `performanceAttributionInput` object with:

- Period start and end date
- Beginning and ending portfolio value
- External contributions and withdrawals with dates
- Flow-neutral valuation subperiods when available
- Security beginning values or weights and period total returns
- Realized and unrealized gain/loss components
- Dividends, cash income, fees, and currency gain/loss
- Cash beginning value and return
- Configured benchmark total return and sector weights/returns
- Base currency and position currency

Incomplete input produces a partial report with explicit evidence gaps; it never produces fabricated completeness.
