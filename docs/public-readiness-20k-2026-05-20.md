# Neuro Trader Journal Public Readiness Review - 20,000 Users

Date: 2026-05-20  
Scope: Web app, API routes, Supabase, Vercel cron, Stripe/payment access, iOS mobile app, security posture, and scale readiness.

## Executive Summary

The platform is close, but it is not ready for a full public launch to 20,000 users today.

The web and iOS builds pass, production public pages are fast, push notifications are technically working, and the major security direction is much stronger than before. The remaining launch risk is mostly operational and backend integrity: the final gamification SQL fix still has to be applied to Supabase production, Supabase CLI currently needs `SUPABASE_DB_PASSWORD` to continue cleanly, and the current worktree still needs to be committed/deployed as one controlled release.

Update after hardening work:

- Service-role Supabase usage now has an explicit server-only boundary.
- Option Flow chat/session endpoints now enforce ownership, payload clamps, role validation, and rate limits.
- Partner profile and payout endpoints now enforce rate limits, payout input limits, duplicate-open-request protection, and admin review for credit payouts.
- Trading account create/delete/set-active endpoints now enforce rate limits, text clamps, and UUID validation.
- The `public.nt_award_trophies` lint error was fixed and the RPC was verified remotely.
- Remaining Supabase lint error: `public.recompute_profile_gamification` still needs the JSONB badges fix applied on the remote database.

Recommended launch posture:

- Limited beta / controlled paid users: acceptable after deploying the current changes and applying the pending migrations.
- Full public launch to 20,000 users: not yet; fix the blockers below first.

## Verification Performed

Passed:

- `npm run verify:release`
- Unit tests: 2/2 passed.
- Web lint.
- Web typecheck.
- Web production build.
- Mobile TypeScript typecheck.
- Production npm audit at `--audit-level=high`.
- Mobile npm audit at `--audit-level=high`.
- iOS native build:
  - `xcodebuild -workspace mobile/ios/NeuroTrader.xcworkspace -scheme NeuroTrader -configuration Debug -sdk iphoneos -destination generic/platform=iOS ...`
  - Result: `BUILD SUCCEEDED`.
- Production header check:
  - `/` returned 200.
  - `/api/notifications/send-daily-motivation` returned 401 without `CRON_SECRET`, expected.
  - `/.well-known/apple-app-site-association` returned 200.
- Production public smoke load:
  - `BASE_URL=https://www.neurotrader-journal.com k6 run k6-smoke.js`
  - 4,608 HTTP requests.
  - 0% failures.
  - p95 latency: 154.73ms.

Warnings:

- `npm audit` still reports moderate vulnerabilities in `postcss`. Current high-severity gates pass.
- The k6 test only covers public pages, not authenticated dashboard/API/mobile workloads.

## Launch Blockers

### B1 - Final Supabase gamification SQL fix is not yet applied

Severity: High

Evidence:

Most pending security migrations were pushed, including rate-limit buckets, challenge/trophy consistency, ranking privacy, broker secret hardening, gamification integrity, admin audit events, daily motivation delivery, and Option Flow chat hardening.

`supabase db lint --linked` still reports:

```text
function: public.recompute_profile_gamification
level: error
message: column "badges" is of type jsonb but expression is of type text[]
```

The fix is staged locally in:

- `supabase/migrations/20260520000300_fix_profile_gamification_recompute_badges_jsonb.sql`

Impact:

Gamification recalculation can fail when the function writes badges back to `profile_gamification`. This affects trophies, XP refresh, and Global Ranking consistency.

Fix:

Apply the staged SQL using Supabase SQL Editor or rerun the migration with `SUPABASE_DB_PASSWORD` available locally. Then rerun `supabase db lint --linked`.

### B2 - Supabase CLI migration history still needs cleanup

Severity: High

Evidence:

Supabase CLI is currently refusing to continue cleanly without `SUPABASE_DB_PASSWORD` and reports the remote-only/local-only `20260420` history mismatch when trying to push only the latest local migration.

Impact:

Future migrations may be confusing or blocked unless the migration history is repaired intentionally. This is manageable, but it should be cleaned before public launch.

Fix:

Set `SUPABASE_DB_PASSWORD`, repair the `20260420` history carefully, and avoid reapplying old broker-token policies without the later broker secret hardening migration after it.

### B3 - Current release state is not committed/deployed as one controlled unit

Severity: High

Evidence:

`git status --short` shows many modified and untracked files, including API security changes, admin changes, mobile-related docs, migrations, cron auth, admin audit, challenge endpoints, and billing/marketing changes.

Impact:

Production, local code, migration state, and the final intended release are not yet a single reproducible deploy. For 20,000 users, this creates rollback, debugging, and compliance risk.

Fix:

Create a release branch/commit, apply migrations, deploy, then run production smoke tests against that exact deployment.

## High Priority Before Public Launch

### H1 - Server-only boundary should be explicit for Supabase service role client

Status: Fixed

Location:

- `lib/supaBaseAdmin.ts:1`

Evidence:

```ts
import { createClient } from "@supabase/supabase-js";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
```

Impact:

The module is intended for backend only, but it does not declare `import "server-only";`. Current usage appears server-side, but adding the boundary prevents future accidental client imports.

Fix applied:

`import "server-only";` was added as the first line.

### H2 - Some authenticated mutation endpoints need rate limits and payload clamps

Status: Fixed for the identified high-risk endpoints

Locations:

- `app/api/option-flow/chat-messages/route.ts:57`
- `app/api/option-flow/chat-messages/route.ts:72`
- `app/api/partners/payout-request/route.ts:12`
- `app/api/partners/payout-request/route.ts:48`

Impact:

Abuse by authenticated users could create DB growth, support/partner noise, or unnecessary server load. This matters more at 20,000 users than in a small beta.

Fix applied:

Added shared `rateLimit`, content/meta clamps, role validation, session ownership checks, payout throttling/idempotency, and trading-account mutation throttles.

### H3 - Partner payout/credit path needs review controls

Status: Fixed

Location:

- `app/api/partners/payout-request/route.ts:45`
- `app/api/partners/payout-request/route.ts:62`

Evidence:

```ts
const status = payoutMethod === "credit" ? "paid" : "requested";
...
app_credit_balance: nextCredit
```

Impact:

Even if bounded by available commission, automatic credit settlement should have idempotency and audit trail before public partner marketing.

Fix applied:

Open payout requests are de-duplicated, payout requests are rate-limited, and credit payouts now stay in review instead of being auto-paid.

### H4 - CSP is present, but still allows inline scripts/styles

Severity: Medium

Location:

- `next.config.ts:16`
- `next.config.ts:37`

Evidence:

```ts
"'unsafe-inline'"
...
"style-src 'self' 'unsafe-inline' ..."
```

Impact:

The app has CSP, frame protection, HSTS, and `nosniff`, which is good. However, `unsafe-inline` weakens CSP as an XSS containment layer.

Fix:

Move toward nonce/hash-based scripts and reduce inline styles where practical. This is not a day-one blocker if XSS sinks stay controlled, but it should be on the security roadmap.

## Positive Findings

- Cron endpoints now require `CRON_SECRET`; production correctly returns 401 without it.
- Daily motivation push path has a valid iOS token, active messages, and schedule set to 8:30 AM ET.
- Web security headers are present in production:
  - CSP
  - HSTS
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - Referrer policy
  - Permissions policy
- Stripe webhook uses signature verification.
- Main AI and expensive endpoints have rate limits.
- Broker token storage has server-only direction and pending hardening migrations.
- Global ranking privacy is designed as opt-in in the pending hardening migration.
- iOS app builds successfully.
- Mobile push registration works technically; Expo receipt returned `status: ok` in the previous notification test.

## Mobile iOS Readiness

Current status: technically healthy, not App Store final until release packaging is done.

Passed:

- Mobile TypeScript.
- Native iOS Debug/device build.
- Associated domains endpoint returns 200.
- Push token exists in production.
- Expo push receipt succeeded.

Before App Store / broad mobile launch:

- Produce a Release archive/TestFlight build, not only Debug generic build.
- Confirm production environment variables used by the mobile binary.
- Confirm App Store privacy nutrition labels match data collected: email, subscription status, trading/journal data, broker imports, push token, support messages.
- Confirm notification permission copy is clear.
- Confirm Apple sign-in requirements if any third-party auth is added later.
- Android remains out of launch scope.

## 20,000 User Scale Readiness

Current status: not proven yet.

What passed:

- Public static/SSR pages handled 20 VUs for 2 minutes with 0 failures and p95 154.73ms.

What is still missing:

- Authenticated k6 scenario for dashboard/journal/growth plan/rules/support.
- Supabase load test for high-volume user-owned tables.
- AI endpoint cost controls at business level, not just per-minute rate limits.
- Cron volume simulation for 20,000 push tokens.
- Database index review using real expected query patterns.
- Monitoring/alerting runbook for Vercel, Supabase, Stripe, Resend, Expo push, and OpenAI.

## Recommended Order To Finish Public Launch

1. Apply `20260520000300_fix_profile_gamification_recompute_badges_jsonb.sql` to Supabase production.
2. Rerun `supabase db lint --linked` until it has no errors.
3. Create a clean release branch/commit and deploy once.
4. Run production smoke tests: signup, paid checkout, webhook, login web, login iOS, push notification, journal, growth plan, challenges, trophies, ranking, support ticket.
5. Run authenticated k6 load test with realistic usage.
6. Prepare iOS Release archive/TestFlight and App Store privacy metadata.
7. Open public launch gradually: 100 users, 500, 2,000, then broader.

## Final Decision

Not ready for an immediate 20,000-user public launch.

Ready for a controlled beta after the current code is deployed and the critical Supabase migrations are reconciled.

Ready for broad public launch after the blockers and high-priority items above are closed and verified.
