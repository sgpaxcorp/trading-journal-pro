# Option Flows Analysis
## Access
- Left navigation → Option Flow.

Status: private beta. Public access is disabled while the module is in development and test mode.

Option Flow turns raw flow data into a premarket plan. It is not a signal service — it is a structured summary you validate with your own chart and rules.

## Standard workflow
1. Upload flow data (CSV/XLSX) or screenshots.
2. Generate the report.
3. Review the executive summary, key levels, and flow map.
4. Send the plan to your Journal premarket section.
5. Option Flow Intelligence automatically schedules validation for 5:00 PM ET after the next session.
6. (Optional) Add your manual post‑mortem and screenshot as well.

## Automatic next-session learning

- Keeps timestamped prints between 1:00 PM and 4:00 PM ET.
- Detects the session date in CSV rows. If a file contains multiple sessions, it analyzes only the selected date instead of mixing days.
- Recognizes `SPXW` as the weekly `SPX` root and keeps `option_chain_id` to identify each contract.
- Fetches five-minute underlying candles for the source session and the next market session.
- Measures the first 0.25% confirmation, minutes from the open, maximum favorable move, maximum adverse move, and close result.
- Distinguishes a sustained confirmation from an intraday confirmation that later reversed.
- Evaluates each directional print: CALL bought at ASK, PUT bought at ASK, CALL sold at BID, and PUT sold at BID.
- Supplies recent validations for the same underlying as context to future analyses without assuming the pattern will repeat.

Validation refers to the underlying move. ASK/BID identifies the aggressor but does not prove whether the position was opened or closed. It does not represent the option's actual P/L or decay, which requires historical contract prices, IV, spread, and fills.

## What each section means
**Executive summary**  
Condensed bias and context for the day.

**Key levels**  
Strikes or price levels that show the most meaningful activity.

**Aggressive flow map (ASK/BID)**  
Where buyers or sellers were most aggressive.

**Top contracts**  
Largest premium or notable prints to review.

**Scenario matrix**  
Possible paths and confirmation levels.

## Inputs and limits
- Supported formats: CSV, XLSX
- Max file size: 12 MB
- Max rows: 400 without screenshots, 150 with screenshots
- Max screenshots: 2

## Best practices
- Use the report as a filter, not a trigger.
- Always verify levels on your own chart.
- Send the plan to Journal so it becomes part of your execution flow.
