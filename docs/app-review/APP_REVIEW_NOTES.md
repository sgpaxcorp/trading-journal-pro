# App Review Notes

## Review access

- The submitted iOS app does not offer account registration or payments.
- Use the review account supplied in App Store Connect. Its email is `appreview@neurotrader-journal.com`.
- The account is preloaded with simulated data. No sample file upload is required.
- A separate disposable account is supplied for testing permanent account deletion without removing the main review data.

## 1. Physical-device recording

A screen recording captured on a physical device running the latest available iOS version is attached to the Resolution Center response. It begins with a cold launch and shows login, the normal product flow, preloaded review data, restricted-feature access, legal links, sign out, and permanent account deletion using the disposable account.

The iOS app has no registration, checkout, pricing, subscription-purchase, or external purchase-link flow. It also has no public social feed or public user-generated content. Private journals, notebook entries, and screenshots are visible only to the authenticated account.

The submitted iOS app is a free stand-alone companion to the existing NeuroTrader web service. Users can access an existing membership, but they cannot create an account, purchase, upgrade, or follow a call to action to purchase from the iOS app.

If the Terms or Privacy Policy version changes, the mobile app blocks private workspace access until the authenticated user reviews both documents and affirmatively accepts the current disclosures. The acceptance includes explicit permission to send only the selected records and context needed for a user-requested AI feature to the disclosed AI service provider.

## 2. Purpose and target audience

NeuroTrader is a trading-business operations and education tool for self-directed traders who want to manage their activity with the discipline of a measurable business. It helps a Trader Entrepreneur define an operating plan, document executions and decisions, enforce personal risk rules, review performance, organize private notes, and receive educational AI-assisted reflection grounded in the user's own records.

The app does not execute trades, route orders, hold funds or securities, operate a brokerage, provide individualized financial advice, or guarantee income, profit, capital growth, or any projected result. Simulations and projections are educational planning outputs and may differ materially from actual results.

## 3. Setup and feature access

1. Install and launch the latest submitted build.
2. On the Log in screen, enter the review credentials provided in App Store Connect.
3. The Business Center opens with the preloaded `Two-Year Growth Demo` account.
4. The persistent tab bar returns to `Business Center` from each primary mobile section. Every deeper screen also provides both a native `Back` control and a `Return to Business Center` control.
5. Open `Trading Business Plan` to review the simulated $10,000 to $250,000 two-year operating plan. Because the simulated cycle is complete, the screen also shows an evidence-based next-cycle recommendation that does not increase risk automatically.
6. Open `P&L` to inspect daily results and journal dates.
7. Open `KPIs` to inspect objective performance measurements based on the simulated records.
8. Open `Coach` and ask a question such as `Analyze my two-year plan objectively.`
9. Open `Business Notebook` to inspect the private operating book and its sample pages.
10. Open `Settings` to view notification controls, Privacy Policy, Terms and Conditions, support, sign out, workspace reset, and permanent account deletion.
11. To test account deletion, sign out and use the disposable deletion credentials supplied in App Store Connect. In `Settings > Danger zone > Delete account`, enter that account email and `DELETE`, then complete both native confirmation dialogs.

All preloaded trades, balances, journal records, and results are simulated solely for App Review. They are labeled and are not customer claims or evidence of expected performance.

## 4. External services

- Supabase: authentication, account-access status, database, and private file storage.
- Vercel: hosts the authenticated application API used by the mobile client.
- OpenAI API: generates educational AI Coach responses from the authenticated user's selected records and plan context.
- Expo Notifications and Apple Push Notification service: device registration and optional business reminders.
- Resend: sends account, security, support, and other service-related email messages outside the iOS app.
- Stripe: manages memberships initiated outside the submitted iOS app. The iOS app does not display pricing, create subscriptions, process payments, or link users to a purchase flow.
- Direct broker connections are disabled in the submitted iOS build while provider approvals are completed. The app does not execute or route trades.

## 5. Regional behavior

The submitted app's core features and content function consistently in all supported regions. Users may choose English or Spanish. Optional notifications depend on device permission and Apple service availability. Direct broker connections are disabled in this build, so there is no regional broker-feature difference in the submitted binary.

## 6. Regulated activity and protected material

NeuroTrader is an educational recordkeeping, simulation, analytics, and business-discipline tool. It is not a broker-dealer, investment adviser, exchange, custodian, or trade-execution service. It does not recommend that a user buy, sell, or hold a particular security and does not guarantee results.

The submitted iOS app does not display, reproduce, or distribute third-party curriculum books or protected training material. Product copy, workflows, calculations, and sample data shown in the app are owned by the developer or generated specifically for the product. Supporting legal disclosures are available under `Settings > Legal and support`.

## Reviewer support

Contact: `support@neurotrader-journal.com`
