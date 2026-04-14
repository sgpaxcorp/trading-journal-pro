# Billing & Plans
## Access
- From the left navigation, open `Billing`.
- You can also reach it from account settings, upgrade prompts, plan comparison, or checkout follow-up screens.

Billing is managed in the web app. The mobile app does not create accounts, change subscriptions, or manage add-ons.

## What you can do here
1. Upgrade or downgrade between `Core` and `Advanced`.
2. Switch between monthly and annual billing.
3. Add or remove supported add-ons such as `Broker Sync`.
4. Review subscription status, next renewal date, and billing cycle.
5. Turn auto-renew on or off.
6. Schedule subscription cancellation.
7. Open billing history.

## Option Flow status
`Option Flow Intelligence` is currently in private beta. It is not available for public purchase or self-service activation from Billing.

## Subscription cancellation
### Where to cancel
1. Open `Billing`.
2. Scroll to `Subscription settings`.
3. Find the `Auto-renew & cancellation` section.
4. Click `Open cancellation flow`.

### What the user sees before cancelling
- Current subscription status.
- Next billing cycle date.
- The date until access stays active.
- A rule reminder that cancelling today stops the next renewal only.
- A reminder that the action does not issue an automatic refund unless required by law or separately approved.

### Step 1: Exit survey
The cancellation modal starts with a survey. The user is asked for:
1. Main cancellation reason.
2. How much they used the platform.
3. What felt missing or difficult.
4. What would make them come back.
5. Any extra written comments.

The first two answers are required before moving to final review.

### Step 2: Final review
Before the cancellation is confirmed, the modal shows:
1. The next billing cycle date.
2. The exact date the membership remains active through.
3. The rule that cancelling today only stops future renewal.
4. The rule that no automatic refund is issued through this action.
5. A confirmation checkbox the user must accept.

The cancellation is only submitted after the user clicks `Confirm cancellation`.

### After cancellation
When the cancellation is accepted:
1. Auto-renew is turned off.
2. The membership remains active until the current billing period ends.
3. The platform shows a confirmation notice with the access-through date.
4. The user receives a cancellation email from NeuroTrader Journal.
5. The cancellation survey answers are stored for internal review.
6. A winback follow-up is scheduled for 30 days later.

### Important billing rules
- Cancelling does not immediately remove access.
- Cancelling does not cancel the current paid period.
- If the user paid recently, access still remains active until the next billing cycle date shown in Billing.
- The cancellation flow stops future renewals only.
- Refunds are not automatic in this flow.

## Billing history
Open `Billing History` to review past invoices and payment periods.

## Billing emails
NeuroTrader Journal now sends the main subscription lifecycle emails from the platform design system instead of relying on Stripe customer emails alone.

### What the user can receive
1. `Subscription confirmation` right after checkout succeeds.
2. `Subscription receipt` after a successful payment or renewal.
3. `Renewal reminder` before the next recurring charge.
4. `Payment issue` if a renewal fails and the payment method must be reviewed.
5. `Cancellation scheduled` after auto-renew is turned off.
6. `Winback offer` later if the user stays canceled long enough to enter the follow-up campaign.

### What these emails are for
- Keep the billing experience visually aligned with NeuroTrader Journal.
- Point the user back to `Billing` inside the app instead of sending them to a generic external flow first.
- Make receipts, reminders, and recovery emails easier to understand in the same visual style as onboarding and account recovery.

### Important admin note
- Stripe can still send its own customer emails if they are enabled in the Stripe Dashboard.
- To avoid duplicate receipts or reminders, platform admins should disable the overlapping Stripe customer email settings after the NeuroTrader Journal versions are live.

## Best practices
- Review the next renewal date before changing auto-renew.
- Use annual billing only if it matches your expected trading horizon.
- Cancel through Billing instead of removing the payment method externally, so access dates and confirmation emails stay accurate.
