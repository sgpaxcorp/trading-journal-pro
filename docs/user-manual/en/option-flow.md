# Option Flow Intelligence
## Access
- Smart Tools -> Option Flow Intelligence.

Status: private beta. Access is limited to entitled accounts while the module is validated.

Option Flow Intelligence is a persistent research center organized by company or underlying. It does not send a plan to the Journal and it does not issue trade recommendations. Each ticker keeps its own evidence, analyses, market history, and horizon reviews so new flow can be compared with what was observed before.

## Standard workflow
1. Select a ticker or create its company profile.
2. Choose **Today** for same-session structure or **Future positioning** for activity across expirations.
3. Add CSV/XLSX evidence, screenshots, and optional analyst context. Dates embedded in the evidence are detected automatically; the fallback date is used only for rows or images without a verifiable date.
4. Run the specialist agents and review the main interpretation, thesis change, new-versus-repeated evidence, contradiction, data quality, expirations, contracts, and source manifest.
5. Return to the same profile whenever new flow arrives. A new version is saved without overwriting earlier analyses.
6. At 6:00 PM America/New_York on US market days, the system records the available daily OHLC data and updates trend, material-change, and due-horizon reviews.
7. At 8:15 AM America/New_York, the system reconciles newly available overnight open interest when a licensed automatic provider is configured.

## Open-interest intelligence
- Imported OI, contract prices, bid/ask, volume, IV, and Greeks remain attributed to the uploaded source.
- Automatic contract snapshots require the configured commercial options-data provider. Without it, the module clearly remains in **imports only** mode.
- Price session date and OI effective date are stored separately. OI published during a session generally represents the prior overnight consolidated position count.
- OI changes are calculated only between distinct verified effective sessions or accepted as explicitly reported by the source. Two intraday prints never create an OI change.
- The OI view shows current OI, confirmed change, contract-price change, volume/OI, source quality, and the deterministic price/OI relationship.
- A morning AI review may classify the prior flow thesis as strengthened, weakened, unchanged, or insufficient evidence. It cannot recommend a trade.
- An OI increase does not reveal who is long or short and cannot prove that a specific print opened a position.

## Analysis modes
**Today**

Reviews the most recent verified session in the evidence, including concentration, aggressive side, strikes, expirations, and same-session structure. Earlier dates in the upload remain preserved in the profile.

**Future positioning**

Reviews the full verified date range in the evidence, how activity is distributed across expirations, and a one-week, one-month, three-month, or custom horizon. A horizon is an evaluation window, not a price prediction.

## What the profile preserves
- Versioned analyses for the ticker.
- Evidence coverage dates and the count of genuinely new and previously seen events.
- Thesis-change classifications: `STRENGTHENED`, `WEAKENED`, `UNCHANGED`, or `INSUFFICIENT_EVIDENCE`.
- Source manifest with provider, date, row count, and SHA-256 fingerprint when available.
- Normalized flow events and observed contract prices.
- Immutable contract snapshots with separate price and effective-OI dates.
- Morning OI reconciliations and their source manifests.
- Daily OHLC market history and deterministic trend calculations.
- Material daily reviews and their AI interpretation when required.
- Horizon checkpoints that compare later price evidence with the original analysis.
- Agent run, model, trace, usage, and error records for auditability.

## Data integrity
- Observed data and AI interpretation remain separate.
- A missing financial or market value is shown as `DATA NOT AVAILABLE`; it is not silently converted to zero.
- ASK/BID can identify the observed aggressive side, but it does not prove that a position was opened or closed.
- Uploaded contract prices are evidence from the source, not the user's fill price or cost basis.
- A target or scenario is not a forecast, probability, or instruction to buy or sell.
- Every normalized event receives a deterministic fingerprint. Re-uploading the same event or file is labeled as repeated and cannot strengthen or weaken the thesis by itself.
- The first analysis establishes a baseline and cannot be labeled strengthened or weakened because no earlier verified read exists.
- The system does not calculate actual option P/L without verified fills and the required historical contract data.

## Inputs and limits
- Web: CSV, XLSX, PNG, JPEG, and WebP.
- Mobile: screenshots from the photo library.
- Up to 2,000 parsed rows per analysis.
- Up to 4 screenshots per analysis.

## Best practices
- Keep one profile per underlying and add evidence to that same record over time.
- Match the analysis mode and horizon to the question you are researching.
- Verify source dates, ticker, expirations, and units before running the agents.
- Treat contradiction and insufficient-data findings as useful outcomes, not failures.
- Use the daily review to monitor what changed, not as an automatic trading trigger.
