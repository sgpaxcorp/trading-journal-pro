# Data Inputs and Imports
How to bring data into the platform.

## Broker import (CSV/XLS/XLSX)
Route: `/import`
- Upload a file exported from your broker.
- Review the import summary and fix any errors.
- Reopen analytics after the import finishes.

## Option Flow uploads
Route: `/option-flow`
- Supported formats: CSV, XLS, XLSX.
- Max file size: 12 MB.
- Max rows: 400 without screenshots, 150 with screenshots.
- Max screenshots: 2.

## Recommended CSV columns
Use common names so the parser can detect them.
- Symbol or option symbol
- Underlying
- Expiration or expiry
- Strike
- Type (Call/Put)
- Side (Bid/Ask)
- Size or quantity
- Premium or notional
- Bid and ask
- Time or timestamp

## Screenshot tips
- Crop to the exact prints you want to analyze.
- Use clear, high contrast images.

## FAQ
Q: My file is too large.
A: Export a smaller date range or use screenshots.

Q: The parser did not match my columns.
A: Rename columns to common terms like symbol, strike, expiry, side, premium.
