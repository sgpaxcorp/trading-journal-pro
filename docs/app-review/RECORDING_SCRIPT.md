# Physical Device Recording Script

Record one uninterrupted video on a physical iPhone running the latest iOS version available for that device. Turn on touch indicators if your recording setup supports them and avoid showing unrelated notifications.

## Before recording

1. Confirm that the final Neuro Trader submission build is installed on the physical iPhone. The reviewed backend changes are already deployed.
2. Run `APP_REVIEW_DEMO_PASSWORD='<review password>' npm run app-review:seed-demo` to restore both review accounts.
3. Confirm the main review login and the disposable deletion login on the device.
4. Sign out, force-close the app, and begin the recording from the Home Screen.

## Recording flow

1. Launch Neuro Trader from the Home Screen.
2. Show that the first screen is `Sign in`; there is no account-creation or payment control.
3. Log in with `appreview@neurotrader-journal.com`.
4. Pause on the Business Center and show the selected `Two-Year Growth Demo` account.
5. Open the Trading Business Plan and show the $10,000 starting balance, $250,000 target, two-year dates, risk limits, and completed-cycle recommendation.
6. Tap `Prepare recommended cycle` to show that the next plan is prefilled from evidence and does not raise risk. Do not save over the demo plan.
7. Show the native `Back` and `Return to Business Center` controls, return to the Business Center, and open P&L. Open September 10, 2026 in the Execution Journal and show the populated stock, option-contract, crypto, and forex transactions, followed by the private execution notes and completed review fields.
8. Open KPIs and show the populated performance measurements and drawdown.
9. Open Business Notebook and show the operating book and one sample page.
10. Open Coach, submit `Analyze my two-year plan objectively`, and show the response.
11. Open Settings. Show notifications, Privacy Policy, Terms and Conditions, Contact support, workspace reset, permanent account deletion, and Sign out.
12. Sign out.
13. Log in with `appreview-delete@neurotrader-journal.com`.
14. Open Settings, scroll to `Delete account`, enter the disposable email and `DELETE`, and complete both confirmation dialogs.
15. Show that the app returns to the Log in screen. End the recording.

## After recording

Run the seed command once more. This recreates the disposable deletion account and restores the main review dataset before Apple begins testing.
