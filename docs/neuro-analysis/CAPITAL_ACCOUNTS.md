# Individual Capital Accounts

## Purpose

Capital Accounts is the investor subledger inside Fund Business Plan. It preserves each investor's dated contributions, units, withdrawals, distributions, allocated expenses, current ownership, NAV history, net investment result, and money-weighted return.

It does not custody money, execute transfers, calculate portfolio performance, or use an LLM for arithmetic.

## Accounting model

1. The capital pool has one base currency and one shared NAV per unit.
2. An initial or additional contribution issues units at the latest frozen NAV per unit.
3. A withdrawal redeems units at the latest frozen NAV per unit.
4. A distribution is cash paid to an investor and does not change units.
5. An allocated expense is identified as either included in fund NAV or paid externally by the investor. This prevents double counting.
6. A NAV close records total net assets. The database derives total units, NAV per unit, and the exact event-sequence cutoff included in that close.

Capital events and NAV closes are append-only. The database serializes entries per pool, blocks negative units, prevents unordered backdating, recomputes units from amount divided by NAV, and rejects client attempts to overwrite calculation fields.

## Investor return

Investor performance uses XIRR:

- Contributions and investor-paid expenses are investor cash outflows.
- Withdrawals and distributions are investor cash inflows.
- Ending account NAV is the terminal investor value.
- Each cash flow uses its actual date.

The application never calculates individual return as current value divided by lifetime contributions. Two investors with the same lifetime contribution can have different XIRRs when their cash-flow dates differ.

XIRR is marked provisional when the latest frozen NAV predates the report date or capital events occurred after that NAV.

## Portfolio separation

Capital Accounts answers who owns the pool and what each investor experienced. The separate Performance Attribution Engine calculates portfolio TWR, benchmark-relative attribution, security selection, sector, cash, currency, dividends, fees, realized gains, and unrealized gains.

Deposits and withdrawals therefore cannot be counted as portfolio investment performance.

## Reproducibility

The deterministic engine is `lib/neuroCapitalAccounts.ts`. Every report includes its normalized `calculationInput`, `calculationVersion`, `generatedBy: deterministic_financial_code`, and `llmUsed: false`. Replaying that frozen input produces the same report.
