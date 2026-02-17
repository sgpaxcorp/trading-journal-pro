# Neuro Trader · Mobile (iPhone)

This is the mobile app workspace:

`/Users/SGPAX/Dev/trading-journal-pro/mobile`

It does **not** modify or replace the web app.

## Architecture decision (for scale)

- Keep app source in `/mobile` (cross-platform).
- Keep native folders generated (`/mobile/ios`, `/mobile/android`) and treat them as build artifacts.
- Recreate native iOS from config with `npm run ios:prebuild`.
- Ship production builds from Release (embedded JS bundle), not from Metro.

## Run on iPhone (stable flow)

1. `cd /Users/SGPAX/Dev/trading-journal-pro/mobile`
2. Copy env file:
   - `cp .env.example .env`
3. Fill Supabase values in `.env`:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `EXPO_PUBLIC_API_URL` (default: `https://www.neurotrader-journal.com`)
4. Regenerate native iOS project from config:
   - `npm run ios:prebuild`
5. Install pods:
   - `npx pod-install ios`
6. Open workspace in Xcode:
   - `open ios/NeuroTrader.xcworkspace`
7. Run on iPhone:
   - `npm run ios:device`

## If you want live reload (dev server)

1. Terminal A:
   - `npm run start -- --dev-client --tunnel -c`
2. Terminal B:
   - `npm run ios:device`

## Production binary (no Metro required)

- `npm run ios:release` (auto-increments build number)
- Full reset + reinstall on iPhone:
  - `npm run ios:clean-run`

The project includes a config plugin (`plugins/with-device-debug-bundling.js`) so Debug builds on physical devices always embed a JS fallback and avoid `No script URL provided`.

## Current app flow

- First screen is native auth (`Sign in` / `Create account`).
- Tabs after login:
  - Home
  - Calendar
  - Analytics
  - AI Coach
  - Settings
- All screens are native (no WebView).

## Update playbook (when you ship changes)

1. JS/UI-only update (no native dependency/config changes):
   - `npm run ios:release`
2. Native-related update (new package, app config/plugin change, strange iOS cache behavior):
   - `npm run ios:sync-native`
   - `npm run ios:release`
3. If Xcode still shows stale behavior:
   - Delete app from iPhone.
   - Run `npm run ios:clean-run` again.

For App Store/TestFlight distribution, build with Archive from `ios/NeuroTrader.xcworkspace` (Release), then upload in Xcode Organizer.

## Automatic versioning

- `npm run version:bump`
  - keeps marketing version (`expo.version`) as-is
  - increments:
    - `expo.ios.buildNumber`
    - `expo.android.versionCode`
- `npm run version:bump:marketing`
  - bumps patch version (e.g. `1.0.3` -> `1.0.4`)
  - also increments `buildNumber` and `versionCode`

`ios:release` already runs `version:bump` automatically before building.
