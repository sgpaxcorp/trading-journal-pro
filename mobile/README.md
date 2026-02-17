# Neuro Trader Journal · Mobile (iPhone)

This is a separate mobile app scaffold inside:

`/Users/SGPAX/Dev/trading-journal-pro/mobile`

It does **not** modify or replace the web app.

## Run on iPhone simulator (Xcode)

1. `cd /Users/SGPAX/Dev/trading-journal-pro/mobile`
2. Copy env file:
   - `cp .env.example .env`
3. Fill Supabase values in `.env`:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. Start iOS:
   - `npm run ios`

## Current scaffold

- Tabs:
  - Dashboard
  - Calendar
  - Analytics
  - AI Coaching
  - Other
- Module placeholders prepared for:
  - Calendar / Statistics / Balance chart
  - Journal + Inside trade notes (inside Other)
  - AI Coaching bridge with audit
  - Resources library
  - Forum / Global ranking / Notebook / Cashflow / Profit & Loss / Balance chart / Audit

## Product rule kept

- Broker file imports stay on web/desktop in phase 1.
- Mobile focuses on read/write workflow and coaching loop.
