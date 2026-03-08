# Data Inputs and Imports

## Access
- Left navigation → Imports.

Clean data is the foundation of accurate analytics. You have two paths: **Broker Sync (SnapTrade)** or **CSV import**.

## 1) Broker Sync (SnapTrade)
Best when your broker is supported by SnapTrade.
1. Open Imports and choose **Broker Sync**.
2. Connect your broker and complete login in the SnapTrade portal.
3. Refresh accounts and select the account you want to sync.
4. Import activity and confirm it appears in your import history.

Tip: Check the “Supported brokers” table before purchasing Broker Sync.

## 2) CSV / XLS / XLSX Import
Best when your broker is not supported by SnapTrade.
1. Choose the **Broker** and (optional) add a **Comment** for the batch.
2. Upload the export file (CSV/XLS/XLSX) without editing.
3. Click **Import** and review the results in Import History.

### CSV import fields (what each input means)
**Broker**: the source broker format to parse.  
**Comment**: one‑line note saved with the batch.  
**Order history timezone (ToS only)**: used for Thinkorswim Order History imports.  
**File**: the export you received from your broker.

### Import History (how to read results)
**Imported**: new rows inserted.  
**Updated**: existing rows updated.  
**Duplicates**: rows detected and skipped.  
**Audit‑ready**: appears when Order History data is present.

## CSV best practices
Use standard column names so the parser can detect fields:
- Symbol or option symbol
- Underlying
- Expiration / expiry
- Strike
- Type (Call/Put)
- Side (Buy/Sell or Bid/Ask)
- Quantity
- Premium / notional
- Time / timestamp

## Option Flow uploads
Use the Option Flow page for flow reports.
- Supported formats: CSV, XLS, XLSX
- Max file size: 12 MB
- Max rows: 400 without screenshots, 150 with screenshots
- Max screenshots: 2

## Screenshot tips
- Crop to the exact prints you want to analyze.
- Use clear, high‑contrast images.

## FAQ
Q: My file is too large.  
A: Export a smaller date range or use screenshots.

Q: The parser did not match my columns.  
A: Rename columns to standard terms (symbol, strike, expiry, side, premium).
