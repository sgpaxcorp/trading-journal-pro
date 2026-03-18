# Back-Study
## Access
- Left navigation → `Back-Study`.
- The page has two modes:
  - `Trade review`
  - `Audit workbench`
- `Trade review` is available in `Core` and `Advanced`.
- `Audit workbench` is available in `Advanced` only.

## What Back-Study is now
Back-Study is no longer just a chart replay page. It is a trade review workspace that combines:
1. Chart replay from your journal entries and exits.
2. Deterministic execution audit from imported broker order history.
3. Process compliance against checklist and Growth Plan rules.
4. Direct handoff to AI Coach with the selected trade context.

## Trade review mode
### What appears on the page
1. Session selector.
2. Trade selector for the selected day.
3. Timeframe, history range, and time mode controls.
4. Replay charts for underlying and, when available, the contract used.
5. For `Advanced`, execution-audit summary for the selected trade.
6. For `Advanced`, trade sequence from broker events.
7. For `Advanced`, process review and deterministic insights.
8. For `Advanced`, raw execution evidence.

### How it works
1. Select a session date.
2. Select the trade you want to review.
3. Choose timeframe, range, and time mode.
4. Load or refresh the replay.
5. Review the chart for context.
6. Review the audit panel for execution truth.
7. Compare execution against your process.
8. Send the trade to AI Coach if you want a coaching read.

### Important rule
The chart shows context. The audit shows execution truth.

If both disagree, trust the broker audit first.

## Audit workbench mode
Use `Audit workbench` when you want a broader deterministic analysis by date and instrument, outside the selected replay flow.

This mode is useful when:
1. You want to inspect all broker events for a date.
2. You want to audit an instrument directly by symbol or instrument key.
3. You want a larger process-compliance read independent of the replay page.

## What to look for as a trader
1. Did the chart entry line up with the real broker event timing?
2. Did you use OCO correctly?
3. Was a stop present early enough?
4. Did you exit manually when the plan called for a stop or target?
5. Did your checklist and Growth Plan rules match what actually happened?

## Best practices
- Use `Trade review` after each meaningful trade or at least weekly.
- Use `Audit workbench` when a trade feels suspicious, messy, or execution-heavy.
- Treat missing contract data as a proxy view, not exact truth.
- Use AI Coach only after reviewing both replay and audit context.
