# Incident runbook

## Account takeover

1. Disable affected user sessions in Supabase Auth.
2. Force password reset and review recent login/device activity.
3. Review `usage_events`, `usage_sessions`, support tickets, broker connections, and admin audit events.
4. If broker data may be exposed, revoke broker OAuth/SnapTrade connections and notify the user.
5. Document timeline, impact, containment, and follow-up fixes.

## Admin token compromise

1. Remove or deactivate the admin row in `admin_users`.
2. Rotate the affected admin password and require MFA before re-enabling admin access.
3. Rotate `ADMIN_ACTION_SECRET` if configured.
4. Review `admin_audit_events` for user create/update/delete/ban/reset/broadcast actions.
5. Notify affected users if their account, billing, broker, or personal data was touched.

## Broker credential exposure

1. Disable broker sync for affected users.
2. Delete or revoke SnapTrade/Webull connections.
3. Rotate `BROKER_SECRET_ENCRYPTION_KEY` only after planning a re-encryption or reconnect flow.
4. Review broker read history and API logs.
5. Notify users with clear scope: read-only data, accounts affected, date range.

## Stripe webhook failure

1. Check Stripe dashboard webhook delivery attempts.
2. Re-send failed events after confirming `STRIPE_WEBHOOK_SECRET` and deployment health.
3. Reconcile `profiles` and `user_entitlements` against Stripe subscription status.
4. Confirm onboarding/receipt emails were delivered or replay them safely.

## OpenAI/API cost spike

1. Disable the affected feature flag or route at deployment level.
2. Check rate-limit tables and route logs for abusive user/IP.
3. Rotate OpenAI key if exposed.
4. Lower per-user limits temporarily.
5. Restore service only after confirming quotas and budget alerts.

## Supabase outage or data issue

1. Check Supabase status and project logs.
2. Disable write-heavy features if partial degradation is occurring.
3. Verify backups/PITR before attempting destructive repairs.
4. Communicate user-facing status if journal, billing, or broker data is affected.
