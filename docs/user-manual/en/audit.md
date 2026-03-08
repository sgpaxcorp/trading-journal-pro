# Audit Guide (Order History)

## Access
- Left navigation → Back‑Study → Audit.

## What this audit does
This audit uses **broker order history** (not AI) to compute objective, rule-based checks about how orders were placed and managed.

It focuses on:
- Whether OCO orders were used
- Whether a stop was present on exits
- How many times the stop was modified
- Cancel / replace activity
- Whether exits were placed as market orders
- Time from entry fill to the first stop order

## Why the audit matters
Audit is your **execution truth layer**. It shows what actually happened (stops, OCOs, cancels, replaces), so coaching and review stay factual instead of speculative.

If you want the AI Coach to give you high‑quality feedback, **run Audit first** and reference those results in coaching.

## What you must provide
You must import a **Thinkorswim “Account Order History”** export using the existing Import page.

This import creates an append-only ledger of order events. The audit is computed from those events.

## How to run the audit
1. Go to **Back‑Studying → Audit** (tab).
2. Select a **date**.
3. Optionally enter a **symbol** or **instrument key**.
4. Run the audit to view metrics and evidence.

## Best practice: Audit → AI Coaching
After running Audit:
- Open **AI Coaching** and ask about the same date/trade.
- Share the audit summary or screenshot so the coach can interpret it.
- If you ask “what would have happened,” the coach will only use **real data** and may ask you to verify contract prices.

## Notes on instrument keys
For options, the key format is:
```
UNDERLYING|YYYY-MM-DD|C|STRIKE
```
Example:
```
SPX|2026-02-13|C|7000
```
For stocks or futures, the key is the symbol itself.

## Limitations
- **Timezone:** the import assumes a source timezone (default: America/New_York). Wrong timezone means incorrect timestamps.
- **Broker differences:** only Thinkorswim order history is supported in MVP.
- **Missing data:** if the export omits stop/replace details, the audit cannot infer them.

## Roadmap (planned)
- Overlay audit markers on back-study charts
- Support IBKR / Tradovate / NinjaTrader order history
- Optional AI explanations (after deterministic checks)
