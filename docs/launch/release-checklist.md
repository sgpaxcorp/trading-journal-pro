# Release readiness checklist

Use this before every production release.

## Required automated checks

- `npm run lint:web`
- `npm run typecheck:web`
- `npm run typecheck:mobile`
- `npm run test:unit`
- `npm run build`
- `npm run audit:prod`
- `npm run audit:mobile`
- `npm run verify:release` before a final release candidate
- Review `docs/launch/dependency-risk-register.md`; do not run `npm audit fix --force` on a release branch.

## Production environment

- `NODE_ENV=production`
- `NEXT_PUBLIC_APP_URL` points to the production app origin.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` point to production Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` is set only on server-side deployment environments.
- `CRON_SECRET` is set and rotated after any suspected exposure.
- `HCAPTCHA_SECRET_KEY` is set before public signup/contact traffic.
- `STRIPE_SECRET_KEY`, price IDs, and `STRIPE_WEBHOOK_SECRET` are production values.
- `OPENAI_API_KEY` is scoped to this product and monitored for cost spikes.
- `BROKER_SECRET_ENCRYPTION_KEY` is set before onboarding real broker connections.
- `ADMIN_ACTION_SECRET` is set if destructive admin actions should require step-up verification.
- Public bypass flags are off:
  - `OPTIONFLOW_BYPASS_ENTITLEMENT=false`
  - `NEXT_PUBLIC_OPTIONFLOW_BYPASS=false`
  - `BROKER_SYNC_FREE=false`
  - `NEXT_PUBLIC_BROKER_SYNC_FREE=false`

## Supabase

- All migrations have been applied to production.
- RLS is enabled for user-owned tables.
- Broker credential tables are service-role only.
- Storage buckets containing user uploads are private unless explicitly public.
- Point-in-time recovery or daily backups are enabled.
- A restore test has been performed for the production project.

## Admin and identity

- Admin users are listed in `admin_users`; `ADMIN_EMAILS` is only a bootstrap fallback.
- MFA is enabled for admin accounts in Supabase Auth.
- Password policy is aligned across Supabase, web, mobile, and admin-created users:
  - Minimum length: 12 characters.
  - Requires uppercase, lowercase, number, and special character.
  - Password changes require the current password except recovery-link resets.
  - Email OTP length is 8 digits.
- Admin destructive actions are tested with confirmations and audit events.
- Password recovery and signup resend do not reveal account state.
- Do not enable Supabase Auth captcha protection until signup/login/reset flows send a captcha token.
- Email domain has SPF, DKIM, and DMARC configured.

## Third-party integrations

- Stripe webhook receives and verifies live events.
- Resend transactional email is verified from the production domain.
- SnapTrade/Webull scopes are read-only unless the business explicitly launches trading actions.
- Broker OAuth redirect URIs match production and local development origins.
- OpenAI data retention and deletion expectations are reflected in privacy policy.

## Manual smoke test

- Signup -> email verification -> checkout -> confirmed app access.
- Login/logout on web and mobile.
- Journal save/load.
- Notebook access denied on Core and allowed on Advanced.
- AI Coaching request with realistic growth plan data.
- Broker connect flow with read-only scope.
- Admin login, user detail view, audit event, and non-destructive update.
- Account deletion in a test account with Stripe subscription.
