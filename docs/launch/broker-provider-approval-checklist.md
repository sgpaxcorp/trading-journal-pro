# Broker Provider Approval Checklist

Last updated: September 3, 2026

Direct broker connections are disabled by default while SnapTrade/Webull approvals are pending. Manual broker statement, order-history, CSV, and XLSX imports remain available.

## Current Disabled State

- Web/API flag: `BROKER_CONNECTIONS_ENABLED=false`
- Browser flag: `NEXT_PUBLIC_BROKER_CONNECTIONS_ENABLED=false`
- Mobile flag: `EXPO_PUBLIC_BROKER_CONNECTIONS_ENABLED=false`
- Existing provider keys may remain configured, but routes return `broker_connections_disabled` until the flags are enabled.

## Approvals Needed Before Enabling

- SnapTrade production access approved for Neuro Trader / SG PAX CORP.
- Webull OAuth production app approved for Neuro Trader / SG PAX CORP.
- Written acceptance of each provider's API/platform terms.
- Confirmed allowed scopes are read-only and match the app disclosures.
- Confirmed redirect URIs:
  - `https://www.neurotrader-journal.com/import?snaptrade=connected`
  - `https://www.neurotrader-journal.com/api/webull/callback`
- Confirmed user-facing OAuth consent screen describes account, balances, holdings, positions, orders, activities, transactions, fees, commissions, timestamps, and sync metadata.
- Confirmed Terms & Conditions and Privacy Policy remain aligned with final provider scopes.
- Apple App Privacy and Google Play Data Safety answers updated to include broker data if direct sync is enabled.
- Support flow ready for disconnect, deletion, and data export requests.

## Activation Steps

1. Set provider production credentials in Vercel/EAS secrets.
2. Set `BROKER_CONNECTIONS_ENABLED=true` in the web server environment.
3. Set `NEXT_PUBLIC_BROKER_CONNECTIONS_ENABLED=true` in the web browser environment.
4. Set `EXPO_PUBLIC_BROKER_CONNECTIONS_ENABLED=true` for mobile builds that should expose broker sync.
5. Redeploy web and rebuild/submit mobile apps.
6. Test SnapTrade and Webull with a real read-only connection before public release.
