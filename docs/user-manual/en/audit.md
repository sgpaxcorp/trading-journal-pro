# Audit Guide (Order History)

## Access
- Left navigation → Back‑Study → Audit.

## What this audit does
This audit uses **broker order history** to show objective checks about how orders were placed and managed. These checks come from the imported order events rather than an AI interpretation.

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

The platform keeps the imported order events and calculates the audit from them.

## How to run the audit
1. Go to **Back‑Studying → Audit** (tab).
2. Select a **date**.
3. Optionally enter a **symbol** or the complete option identifier shown by the platform.
4. Run the audit to view metrics and evidence.

## Best practice: Audit → AI Coaching
After running Audit:
- Open **AI Coaching** and ask about the same date/trade.
- Share the audit summary or screenshot so the coach can interpret it.
- If you ask “what would have happened,” the coach will only use **real data** and may ask you to verify contract prices.

## How to identify the instrument
For stocks or futures, enter the symbol. For options, select or enter the underlying symbol, expiration date, Call or Put, and strike price as shown on the page. For example: SPX, February 13, 2026, Call, strike 7000.

## Limitations
- **Timezone:** the import assumes a source timezone (default: America/New_York). Wrong timezone means incorrect timestamps.
- **Broker differences:** the page currently supports Thinkorswim order history.
- **Missing data:** if the export omits stop/replace details, the audit cannot infer them.
