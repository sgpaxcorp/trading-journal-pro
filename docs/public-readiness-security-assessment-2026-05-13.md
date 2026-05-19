# NeuroTrader Journal - Public Readiness and Security Assessment

Date: 2026-05-13
Scope: Web app, Next.js API routes, Supabase/Postgres/RLS, Stripe billing, Resend emails, OpenAI/AI features, broker integrations, iOS mobile app, admin center, support center, ranking/challenges/trophies, and launch readiness for 20,000 users.

## Executive verdict

NeuroTrader Journal is not ready yet for a broad public launch to 20,000 users.

The platform is much closer than before: the web build passes, web lint passes, web and mobile typechecks pass, high-severity npm audit gates pass, Stripe webhook signature validation exists, support ticket ownership is mostly solid, and many private database reads are correctly scoped by `user_id`.

However, there are release blockers that must be closed before public launch:

1. Several core APIs are authenticated but not server-side paywalled.
2. Multiple cron/admin automation endpoints trust `x-vercel-cron`, which can be spoofed.
3. Broker OAuth/SnapTrade secrets are stored as plaintext and are selectable by the owning client.
4. XP/trophies/challenge data can be manipulated from the client, which breaks Global Ranking integrity.
5. The iOS app does not currently have a full platform-level paid-access gate equivalent to the web app.
6. Public proxy endpoints can be abused without auth, rate limits, or cache controls suitable for scale.
7. Admin user operations rely on Supabase `listUsers` scans capped around 5,000 users and will not scale to 20,000.
8. AI/vision/import endpoints need stricter rate, body-size, file, and cost controls.

If these blockers are fixed, the remaining work becomes a normal hardening, scale, and QA checklist. Until then, opening to thousands of real users creates billing bypass, data-integrity, operational-cost, and privacy risk.

## Verification already performed

The following local checks were executed:

- `npm run build`: passed.
- `npm run lint:web`: passed.
- `npm run typecheck:web`: passed.
- `npm run typecheck:mobile`: passed.
- `npm audit --omit=dev --audit-level=high`: passed for the web/root app. Remaining findings are moderate `postcss` issues through upstream Next dependencies.
- `npm audit --omit=dev --audit-level=high` inside `mobile`: passed. Remaining findings are moderate `postcss` issues through upstream Expo/Metro dependencies.

The following could not be completed locally:

- `supabase db lint`: failed because the local Supabase database was not running on `127.0.0.1:54322`.

This means database linting and production RLS verification still need to be run against the linked Supabase environment or a started local Supabase stack.

## What is already strong

### Stripe billing foundation

`app/api/stripe/webhook/route.ts` verifies the Stripe webhook signature with `stripe.webhooks.constructEvent(...)`. The checkout flow validates plan and billing cycle inputs before creating Stripe sessions. Entitlements are persisted through server-side API work instead of trusting client-side plan state.

This is a good base.

### Web private layout paywall direction

`app/(private)/layout.tsx` checks `/api/access/status` and redirects users without app access to billing completion routes. It also supports route-level entitlements for advanced and add-on areas.

The problem is not the web UI gate. The problem is that the API layer is not consistently enforcing the same rule.

### Support Center ownership model

The support ticket migrations use owner-based RLS policies for tickets, messages, and support attachments. The support agent API also checks that the current user owns the ticket or is an admin before it replies.

This is one of the better isolated areas.

### Mobile secure session storage

`mobile/src/lib/supabase.ts` uses SecureStore-backed session storage for Supabase sessions. That is the right approach for iOS. It is much better than storing Supabase sessions only in AsyncStorage.

### Security headers exist

`next.config.ts` sets useful headers such as:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `X-Frame-Options: DENY`
- HSTS in production
- Permissions Policy
- CSP

The CSP still needs tightening, but the project already has the right place to harden it.

## Release blockers

### B1 - Core APIs can be used by unpaid users

Severity: Critical

Evidence:

- `app/(private)/layout.tsx:111` fetches `/api/access/status` and redirects unpaid users in the browser.
- `app/api/access/status/route.ts` correctly checks app access and disables local profile fallback in production.
- `app/api/trading-accounts/create/route.ts:35` is a good example because it requires recognized access before creating accounts.
- But many core APIs only authenticate the Supabase user and do not require paid platform access.
- Examples:
  - `app/api/journal/list/route.ts:45` authenticates the bearer token but does not call the platform access check.
  - `app/api/journal/sync/route.ts` authenticates but does not consistently enforce platform access.
  - `app/api/analytics/snapshot/route.ts:317` authenticates, then only uses plan level to shape the response.
  - Several checklist, alert, account, trophy, and sync APIs follow the same pattern.

Risk:

An unpaid but verified user can bypass the web UI by calling private API endpoints directly with a valid Supabase JWT. That is a billing bypass and a launch blocker.

Required fix:

Create one shared server helper, for example `requirePaidPlatformAccess(request)`, that:

1. Reads and validates the bearer token.
2. Resolves the Supabase user.
3. Calls the same entitlement logic used by `/api/access/status`.
4. Returns `403` for users without active paid/trial/internal access.

Apply it to every core private API except the routes that must remain reachable before payment:

- auth/signup
- email verification
- billing/checkout
- Stripe return routes
- support/help routes if intentionally available
- admin auth checks

Verification:

1. Create a verified user with no paid entitlement.
2. Call `/api/journal/list` with that user's bearer token.
3. Expected result after fix: `403`.
4. Repeat for `/api/analytics/snapshot`, `/api/checklist`, `/api/alerts`, `/api/trophies/sync`, and broker-related routes.

### B2 - Cron endpoints can be spoofed with `x-vercel-cron`

Severity: Critical

Evidence:

Several cron or automation routes treat the presence of `x-vercel-cron` as authorization:

- `app/api/notifications/send-daily/route.ts:109`
- `app/api/notifications/send-daily-motivation/route.ts:333`
- `app/api/lifecycle/inactivity/route.ts:46`
- `app/api/stripe/payment-method-expiring/route.ts:29`
- Similar patterns exist in profit/loss alert and daily goal notification routes.

Risk:

If an external caller can hit the endpoint and supply `x-vercel-cron: true`, they may trigger push notifications, lifecycle emails, Stripe scans, or other platform automation. Even when no data is leaked, this can create spam, cost, reputation, and trust damage.

Required fix:

All cron routes should require:

```text
Authorization: Bearer <CRON_SECRET>
```

Do not accept `x-vercel-cron` alone. It can be used as an extra signal for logging, but not as the secret.

Verification:

1. Call each cron route with only `x-vercel-cron: true`.
2. Expected result after fix: `401`.
3. Call with a bad bearer token.
4. Expected result: `401`.
5. Call with the real cron secret from Vercel.
6. Expected result: authorized.

### B3 - Broker and SnapTrade secrets are plaintext and client-readable

Severity: Critical

Evidence:

- `lib/brokerOAuthStorage.ts:17` selects `access_token` and `refresh_token`.
- `lib/brokerOAuthStorage.ts:33` stores broker OAuth tokens.
- `lib/snaptradeStorage.ts:10` selects `snaptrade_user_secret`.
- `lib/snaptradeStorage.ts:41` stores `snaptrade_user_secret`.
- `supabase/migrations/20260420_plan_feature_rls_hardening.sql:340` creates `snaptrade_users.snaptrade_user_secret text`.
- `supabase/migrations/20260420_plan_feature_rls_hardening.sql:360` creates `broker_oauth_connections.access_token text` and `refresh_token text`.
- The RLS policies allow authenticated owners with broker access to select these rows.

Risk:

The app avoids cross-user exposure, but it still exposes the user's own broker secrets to the browser/mobile client if the Supabase client queries those tables. A browser XSS, malicious extension, compromised device, or mobile instrumentation could exfiltrate OAuth tokens and SnapTrade secrets.

Required fix:

Broker secrets should be service-role-only.

1. Remove authenticated client `select`, `insert`, `update`, and `delete` policies from secret-bearing tables.
2. Expose only non-secret broker connection metadata to clients through server APIs.
3. Encrypt tokens at rest using a managed key strategy:
   - Supabase Vault/pgsodium if available,
   - app-level envelope encryption,
   - or a KMS-backed solution.
4. Rotate current stored tokens/secrets after the policy change.

Verification:

In Supabase SQL/API using an authenticated user token:

```sql
select access_token, refresh_token from public.broker_oauth_connections;
select snaptrade_user_secret from public.snaptrade_users;
```

Expected result after fix: denied or zero rows from client context. Only server/service-role APIs should be able to read secrets.

### B4 - XP, trophies, and Global Ranking can be manipulated by users

Severity: Critical

Evidence:

- `supabase/migrations/20260311000500_trophy_system_baseline.sql:77` allows users to insert their own `user_trophies`.
- `supabase/migrations/20260511000100_challenges_trophies_xp_consistency.sql:135` allows users to insert/update their own `challenge_runs`.
- `supabase/migrations/20260511000100_challenges_trophies_xp_consistency.sql:166` allows users to insert/update their own `challenge_run_days`.
- `supabase/migrations/20260511000100_challenges_trophies_xp_consistency.sql:197` allows users to insert/update their own `profile_gamification`.
- `lib/challengesSupabase.ts:641` computes XP from client-side check-in data and persists it from the client path.
- `supabase/migrations/20260513000100_global_ranking_visibility_privacy.sql:55` calculates public ranking totals from trophies and challenge XP.

Risk:

Any technical user can self-award trophies, inflate XP, and manipulate Global Ranking. This is not cross-user data theft, but it breaks the integrity of a public ranking system. If ranking is a visible product feature, this is a launch blocker.

Required fix:

1. Revoke client insert/update/delete permissions for `user_trophies`, XP totals, and gamification summary fields.
2. Move trophy and XP award logic to trusted server APIs or `security definer` RPCs.
3. Make client check-ins write only raw user intent, not final XP.
4. Calculate XP server-side from immutable evidence:
   - journal completion,
   - challenge day completion,
   - verified trading day data,
   - allowed manual actions with audit log.
5. Add an audit table for all XP grants.

Verification:

Using an authenticated Supabase client:

```sql
insert into public.user_trophies (user_id, trophy_key, xp_awarded) values (auth.uid(), 'fake', 999999);
update public.profile_gamification set total_xp = 999999 where user_id = auth.uid();
```

Expected result after fix: denied.

### B5 - iOS mobile does not have a full paid-access gate

Severity: Critical

Evidence:

- `mobile/App.tsx:516` shows main tabs when `session` exists.
- Advanced-only areas use `PlanGate`, but the entire app is not blocked for unpaid users.
- `mobile/src/lib/usePlanAccess.ts:48` calls `/api/entitlements/list` for feature-level access.
- There is no mobile equivalent of the web `/api/access/status` gate that blocks the full private app until payment/trial/internal access is active.

Risk:

A logged-in but unpaid iOS user may enter the app shell and use any feature still allowed by RLS or by mobile direct Supabase access. This is the same paywall bypass class as B1, but on mobile.

Required fix:

1. On mobile app startup after login, call `/api/access/status`.
2. If `hasAppAccess` is false, show a payment-required screen or billing completion screen.
3. Do not mount private tabs until app access is active.
4. Keep support/help, logout, and billing flows available.

Verification:

1. Create a verified unpaid user.
2. Login on iOS.
3. Expected result after fix: payment-required screen, not dashboard tabs.
4. Confirm a paid user reaches the dashboard.

### B6 - Public data proxies can be abused

Severity: High

Evidence:

- `app/api/economic-calendar/route.ts:17` is a public GET route.
- It uses the TradingEconomics API key server-side and fetches with `cache: "no-store"`.
- `app/api/yahoo-chart/route.ts:7` is also public.
- It accepts query parameters and proxies chart data with `cache: "no-store"`.

Risk:

These endpoints can be abused to burn third-party API quota, increase Vercel/serverless cost, or use your app as a proxy. At 20,000 users, even legitimate traffic should be cached/rate-limited. With no auth or rate limit, external abuse is easy.

Required fix:

1. If these are private product features, require paid platform access.
2. If they are public landing-page data, add IP-based rate limiting.
3. Add strict allowlists for ranges, symbols, regions, and intervals.
4. Add caching with a short TTL where data freshness allows.
5. Add request logging and quota alerts.

Verification:

1. Unauthenticated request should fail or be heavily rate-limited.
2. Repeated requests from the same IP should hit a rate limit.
3. Cached calls should not refetch upstream every time.

### B7 - Admin user management will not scale to 20,000 users

Severity: High

Evidence:

- `app/api/admin/users/route.ts:282` scans Supabase Auth users with pagination.
- Several helpers cap `listUsers` searching around 25 pages of 200 users, or about 5,000 users.
- `app/api/auth/signup/resend/route.ts:30` has a similar `findAuthUserByEmail` loop.
- Admin list logic also aggregates sessions, events, profiles, and entitlements for broad user sets.

Risk:

At 20,000 users, admin search and signup resend flows can miss users after the first 5,000 records. Admin screens will also become slow and expensive if they load all users and all activity snapshots at once.

Required fix:

1. Make `profiles.email` a trusted indexed lookup field.
2. Use search-driven and paginated admin APIs.
3. Avoid scanning Supabase Auth for broad admin lists.
4. Use `getUserById` when the user id is known.
5. Materialize admin summary metrics or query them in bounded pages.
6. Add database indexes for admin filters:
   - email
   - created_at
   - subscription_status
   - last_seen_at
   - trial/paid/internal flags

Verification:

1. Seed or simulate 20,000 users.
2. Admin Users should load first page in under 1 second from DB query time.
3. Search by exact email should find users beyond row 5,000.
4. Signup resend should not depend on scanning auth users.

### B8 - AI, screenshot, and import endpoints need stricter cost controls

Severity: High

Evidence:

- `app/api/ai-coach/route.ts` has auth, advanced plan checks, and rate limiting. This is good.
- But it accepts `backStudyContext` and `screenshotBase64` without an obvious strict body-size and MIME validation boundary.
- `app/api/option-flow/analyze/route.ts` checks auth and entitlement, but it processes rows and screenshot data for AI analysis without an obvious route-level rate limit.
- The default model path is expensive enough that abuse matters.

Risk:

AI endpoints can become the fastest way to burn money or crash request execution under launch traffic. This matters more at 20,000 users than normal CRUD screens.

Required fix:

1. Add DB-backed rate limits to every AI route.
2. Add body-size limits before parsing where possible.
3. Limit screenshot count, dimensions, bytes, and MIME type.
4. Reject SVG/data URLs that are not safe image types.
5. Add per-user daily/monthly AI budgets.
6. Add admin-visible AI cost metrics.

Verification:

1. Oversized payload returns `413`.
2. Unsupported MIME returns `415` or `400`.
3. Repeated calls hit rate limit.
4. Admin can see usage per user.

### B9 - Storage policies and upload validation are incomplete

Severity: High

Evidence:

- Support attachment storage policies exist and are owner-scoped.
- `lib/supportTicketsSupabase.ts:230` uploads support attachments, but file type and size validation are not strong enough at the client/API boundary.
- `app/(private)/account/page.tsx:282` validates avatar size but not strict MIME/extension/content.
- Option Flow report uploads use `option_flow_reports`, but bucket policy definitions were not found in migrations.

Risk:

Without migration-managed bucket policies and strict file validation, uploads can create storage abuse, malware handling risk, unexpected public exposure, or cross-user object path mistakes.

Required fix:

1. Put all bucket creation and storage policies in migrations.
2. Keep sensitive report buckets private.
3. Validate file type and size before upload.
4. Use server-side signed upload URLs for higher-risk files.
5. Enforce per-user storage quotas.
6. Add cleanup jobs for abandoned imports and old attachments.

Verification:

1. User A cannot read User B storage path.
2. User A cannot write outside their own prefix.
3. Non-image avatar uploads fail.
4. Oversized support attachments fail.
5. Option Flow report signed URLs expire.

## High-priority privacy issue

### H1 - Global Ranking says opt-in, but migration enables many users by default

Severity: High

Evidence:

- `supabase/migrations/20260513000100_global_ranking_visibility_privacy.sql:4` adds `show_in_ranking boolean default true`.
- The same migration sets active/trialing/paid profiles to visible.
- Ranking display names can fall back to first and last name.
- The UI text describes ranking as opt-in.

Risk:

For a public community ranking, showing real names by default can create trust, privacy, and legal risk. The product promise says opt-in, but the data behavior appears closer to opt-out.

Required fix:

1. Make `show_in_ranking` default `false`.
2. Ask users to opt in.
3. Require a ranking alias.
4. Do not fall back to full name unless the user explicitly chooses that.

Verification:

1. New paid user does not appear in Global Ranking by default.
2. User must opt in and choose a display name.
3. API output never exposes email, phone, or full name unless explicitly selected.

## Medium-priority hardening items

### M1 - CSP is useful but still too permissive

Evidence:

- `next.config.ts` includes a CSP.
- Production `script-src` includes `'unsafe-inline'`.
- `connect-src` allows broad `https:` and `wss:`.
- `img-src` allows broad `https:` and `data:`.

Recommendation:

Move toward nonces/hashes for inline scripts, reduce broad external sources to known domains, and revisit `data:` image allowances after the rich HTML rendering path is cleaned up.

### M2 - Custom HTML sanitizer should be replaced or tightened

Evidence:

- `app/(private)/option-flow/page.tsx` uses a custom DOMParser sanitizer.
- The sanitizer allows inline style attributes, background styles, remote images, and `data:image`.
- The sanitized output is rendered with `dangerouslySetInnerHTML`.

Recommendation:

Use a proven sanitizer such as DOMPurify with a strict allowlist. Disallow unsafe data image formats, background URLs, inline event handlers, and unnecessary styles. Add tests with known XSS payloads.

### M3 - Service-role client should be server-only

Evidence:

- `lib/supaBaseAdmin.ts` exports a service-role Supabase client.
- The file does not include a `server-only` import.

Recommendation:

Add `import "server-only";` to service-role modules and keep service role usage out of anything that can be bundled client-side.

### M4 - Admin helpers are duplicated

Evidence:

Admin auth checks are duplicated across multiple admin/support routes.

Recommendation:

Create one shared admin authorization helper with consistent:

- active admin check
- optional `ADMIN_EMAILS` fallback
- audit logging
- rate limits for destructive actions
- step-up confirmation for delete, ban, reset, or manual entitlement actions

### M5 - Password recovery deep links should be stricter on mobile

Evidence:

- `mobile/src/lib/authRecovery.ts` accepts URLs containing reset-password/recovery patterns and sets the Supabase session from URL tokens.

Recommendation:

Restrict accepted schemes and hosts to known production domains and known app schemes. Reject unknown hosts, unknown schemes, and unexpected paths.

### M6 - Checkout creation should be rate-limited

Evidence:

Stripe checkout routes validate auth and plan, but checkout creation can still be spammed by a real user.

Recommendation:

Add per-user rate limiting to checkout/session creation to prevent Stripe object spam.

### M7 - Moderate dependency advisories remain

Evidence:

High-severity npm audit passed for web and mobile, but moderate `postcss` advisories remain through upstream Next/Expo/Metro dependency chains.

Recommendation:

Do not force downgrade/breaking changes just to silence audit. Track upstream releases and upgrade Next/Expo when compatible patched versions are available.

## User isolation assessment

### Journal and trade data

Many private reads correctly scope by `user_id`. For example, journal and broker import logic generally uses `eq("user_id", userId)`. This helps prevent User A from reading User B's journal rows.

Risk remains because not every API enforces paid access, but cross-user isolation appears directionally sound in the reviewed journal/import paths.

### Support tickets

Support tickets and support messages are properly owner/admin scoped in migrations. This is one of the strongest isolation areas.

### Broker secrets

Cross-user isolation is not the primary issue. The issue is that a user can potentially read their own sensitive tokens from the client. For broker integrations, client-readable secrets should be treated as a serious vulnerability even if the owner is the same user.

### Ranking/challenges/trophies

This is not primarily a confidentiality problem. It is an integrity problem. Users can manipulate their own trophy/XP state and therefore manipulate public ranking.

### Mobile

The mobile app depends heavily on Supabase RLS and direct client calls. That is acceptable only if every sensitive table has strict RLS and every paid feature is gated server-side. Today, the mobile shell needs a full paid-access gate and the gamification RLS needs to be fixed.

## Scalability assessment for 20,000 users

### Admin Center

Current admin user list and email lookup patterns will not scale cleanly to 20,000 users because of Supabase Auth list scans and capped loops.

Target state:

- DB-backed profile search
- cursor pagination
- indexed filters
- materialized admin metrics
- no all-user auth scans during normal page load

### Cron notifications

Daily push notification routes load all push tokens and send in chunks. For 20,000 users, sequential sending inside a single serverless request risks timeout and retry duplication.

Target state:

- queue or batched background job
- chunk state table
- idempotency per notification campaign
- dead-letter logging
- retry with bounded attempts

### AI usage

AI features are valuable but need financial guardrails.

Target state:

- per-user AI budget
- per-route limits
- payload-size limits
- admin cost dashboard
- graceful degradation when quota is reached

### Database

The schema has many indexes, but production readiness needs:

- `supabase db lint`
- EXPLAIN checks for admin screens
- EXPLAIN checks for dashboard and analytics
- load test with realistic profile/journal/trade/trophy/support volumes
- monitoring for slow queries

### Mobile

iOS typecheck passes and session storage is solid. Before App Store/public use, mobile still needs:

- full paid access gate
- recovery link host restriction
- API route parity with web
- push notification permission and token registration QA
- TestFlight regression pass
- App Store privacy labels aligned with broker, AI, and analytics data use

Android should remain "coming soon" operationally until a separate release checklist exists.

## Recommended launch sequence

### Phase 1 - Blockers before any public launch

1. Add server-side paid access enforcement to core APIs.
2. Add mobile full-app paid access gate.
3. Replace cron authorization with bearer `CRON_SECRET` only.
4. Remove client access to broker/SnapTrade secrets and encrypt stored tokens.
5. Lock XP/trophy/challenge writes behind trusted server logic.
6. Fix Global Ranking to be explicit opt-in.
7. Rate-limit and cache public proxies or move them behind paid access.
8. Add AI/body-size/file validation to expensive endpoints.

### Phase 2 - Scale hardening for 20,000 users

1. Rebuild admin user list/search around DB pagination and indexes.
2. Move push/email lifecycle campaigns to queue-like batches with idempotency.
3. Add upload quotas and migration-managed storage policies.
4. Run database lint and slow-query review.
5. Run k6 or equivalent load tests for key endpoints.
6. Add admin dashboards for AI spend, email delivery, push delivery, and support volume.

### Phase 3 - Public launch QA

1. Create test users:
   - unpaid verified
   - paid Core
   - paid Advanced
   - cancelled but active until period end
   - expired/canceled
   - internal/admin
2. Verify web route access for each.
3. Verify API access for each with bearer tokens, not only browser clicks.
4. Verify iOS access for each.
5. Verify Stripe lifecycle:
   - checkout
   - invoice paid
   - failed payment
   - cancellation scheduled
   - renewal reminder
   - payment method expiring
6. Verify emails:
   - confirmation
   - welcome
   - subscription confirmation
   - receipt
   - support ticket reply
7. Verify support:
   - user opens ticket
   - admin sees it
   - AI agent replies only when confident
   - admin can classify priority
8. Verify Global Ranking:
   - new users hidden by default
   - opt-in alias works
   - fake XP insert fails

## Minimum security tests before public launch

Run these with two test users: User A and User B.

### API paywall test

1. Create User A with no paid entitlement.
2. Login and capture bearer token.
3. Call:
   - `/api/journal/list`
   - `/api/analytics/snapshot`
   - `/api/checklist`
   - `/api/alerts`
   - `/api/trophies/sync`
4. Expected: all protected core routes return `403`.

### Cross-user data test

1. Create journal/trade/support data for User B.
2. Use User A token to query User B ids through API parameters.
3. Expected: no User B data is returned.

### Secret exposure test

1. Use authenticated client context.
2. Try to select from:
   - `broker_oauth_connections`
   - `snaptrade_users`
3. Expected: denied.

### XP integrity test

1. Use authenticated client context.
2. Try to insert fake trophy rows or update `profile_gamification.total_xp`.
3. Expected: denied.

### Cron spoof test

1. Call cron endpoints with `x-vercel-cron: true` and no bearer secret.
2. Expected: `401`.

### Upload isolation test

1. User A uploads support attachment.
2. User B tries to read/delete it.
3. Expected: denied.
4. Upload invalid MIME and oversized files.
5. Expected: denied.

### Mobile unpaid test

1. Login to iOS as verified unpaid user.
2. Expected: billing/payment-required screen.
3. Private tabs must not mount.

## Final readiness status

Current status: not ready for 20,000 public users.

Confidence: high.

The application has a strong product foundation and many of the right building blocks. The launch risk is concentrated in a manageable list of backend enforcement, RLS, mobile paywall, cron authorization, token secrecy, and scaling issues. These should be fixed before marketing/public deployment.

