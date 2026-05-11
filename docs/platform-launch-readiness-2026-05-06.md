# Platform Launch Readiness Report

Date: 2026-05-06

## Executive Summary

Current verdict: **No-Go for full public launch**.

The platform is close on core functionality, and the main automated release gate passes locally, but the current state still has a small set of high-impact issues that should be closed before opening the product for unrestricted public use at scale.

What is in good shape:

- `npm run verify:release` passed end to end on the current codebase.
- Web build succeeds and mobile TypeScript checks succeed.
- Production smoke tests passed 4 of 5 checks.
- Current dependency audit gate has no `high` or `critical` findings.

What still blocks a full public launch:

1. Mobile auth sessions are stored in plain `AsyncStorage`.
2. Public and AI-facing abuse controls rely on an in-memory rate limiter that will not hold under multi-instance/serverless load.
3. A production private-route smoke test is failing: `/option-flow` renders the global error page instead of redirecting unauthenticated users to `/signin`.

## Checks Performed

### Automated checks

- `npm run verify:release` -> passed
- `E2E_BASE_URL=https://www.neurotrader-journal.com npm run test:e2e` -> failed 1 of 5

### Production runtime observations

- Public smoke pages load.
- `signup` and `contact` pages render correctly.
- Unauthenticated visit to `/option-flow` does **not** redirect cleanly to sign-in; it lands on the global error screen instead.

### Production environment review

The following production env keys exist in Vercel and need explicit value verification before launch:

- `OPTIONFLOW_BYPASS_ENTITLEMENT`
- `NEXT_PUBLIC_OPTIONFLOW_BYPASS`
- `NEXT_PUBLIC_BROKER_SYNC_FREE`
- `OPTIONFLOW_PAYWALL_ENABLED`
- `NEXT_PUBLIC_OPTIONFLOW_PAYWALL_ENABLED`

The listing confirms the keys exist, but not their values, so they must be manually confirmed as safe for production launch.

## Findings

### H-01: Mobile auth tokens are persisted in plain AsyncStorage

- Severity: High
- Location:
  - `/Users/SGPAX/Dev/trading-journal-pro/mobile/src/lib/supabase.ts:3`
  - `/Users/SGPAX/Dev/trading-journal-pro/mobile/src/lib/supabase.ts:8`
  - `/Users/SGPAX/Dev/trading-journal-pro/mobile/src/lib/supabase.ts:18`
- Evidence:
  - The mobile Supabase client uses `@react-native-async-storage/async-storage` as the auth storage adapter.
  - `persistSession: true` is enabled on that adapter.
- Impact:
  - Refresh tokens and session material are stored in app-readable plain storage rather than the device secure enclave/keychain layer. On a rooted/jailbroken device, via backup extraction, or during certain local compromise scenarios, session theft becomes easier than necessary.
- Fix:
  - Move Supabase auth persistence to `expo-secure-store` for tokens/session material.
  - Reserve `AsyncStorage` for non-sensitive preferences only.
- Mitigation:
  - Shorten session lifetime and refresh token validity if immediate migration is not possible.

### H-02: Rate limiting is process-local and can be bypassed under real production load

- Severity: High
- Location:
  - `/Users/SGPAX/Dev/trading-journal-pro/lib/rateLimit.ts:19`
  - `/Users/SGPAX/Dev/trading-journal-pro/lib/rateLimit.ts:21`
  - `/Users/SGPAX/Dev/trading-journal-pro/app/api/ask/ask/route.ts:12`
  - `/Users/SGPAX/Dev/trading-journal-pro/app/api/auth/signup/route.ts:31`
  - `/Users/SGPAX/Dev/trading-journal-pro/app/api/contact/route.ts:20`
- Evidence:
  - The limiter stores counters in a module-level `Map`.
  - Multiple public or cost-sensitive endpoints rely on it, including signup, password recovery, contact, and AI assistant routes.
  - `/api/ask/ask` is callable without authentication and only protected by this in-memory limiter.
- Impact:
  - In Vercel/serverless or any horizontally scaled setup, attackers can rotate instances and effectively bypass the limiter.
  - This creates avoidable exposure to signup spam, email spam, and OpenAI/LLM cost abuse.
- Fix:
  - Replace the current limiter with a shared backing store such as Upstash Redis, Vercel KV, or Supabase/Postgres-based atomic counters.
  - Apply shared quotas to all public endpoints and all LLM-backed endpoints.
- Mitigation:
  - As an interim step, keep hCaptcha mandatory on the highest-risk public forms and add upstream WAF/rate limiting.

### H-03: Production private-route access is currently broken for anonymous users

- Severity: High
- Location:
  - `/Users/SGPAX/Dev/trading-journal-pro/tests/e2e/smoke.spec.ts:41`
  - `/Users/SGPAX/Dev/trading-journal-pro/app/(private)/layout.tsx:48`
  - `/Users/SGPAX/Dev/trading-journal-pro/app/(private)/layout.tsx:262`
- Evidence:
  - Production smoke test `private route redirects to sign in` timed out on `/option-flow` instead of reaching `/signin`.
  - The failure rendered the global error screen (`Algo salio mal`) instead of a clean auth redirect.
  - The private layout triggers `router.replace("/signin")` in an effect, but still renders `children` unconditionally at the end of the component.
- Impact:
  - Anonymous users can hit an error boundary on protected pages instead of a controlled sign-in flow.
  - This is a launch blocker because it breaks first-touch behavior on deep links and any shared private URL.
- Fix:
  - Gate rendering in the private layout before rendering children when auth is unresolved or absent.
  - Return a neutral loading or redirect state until the auth/access decision is complete.
- Mitigation:
  - Add a specific smoke test for every major private entry route, not just `/option-flow`.

### M-01: iOS recovery flow relied on a custom URL scheme instead of a universal link

- Severity: Medium
- Location:
  - `/Users/SGPAX/Dev/trading-journal-pro/lib/authRedirects.ts:1`
  - `/Users/SGPAX/Dev/trading-journal-pro/lib/authRedirects.ts:12`
  - `/Users/SGPAX/Dev/trading-journal-pro/mobile/src/screens/AuthScreen.tsx:108`
- Evidence:
  - Password/account recovery emails previously could redirect to `com.sgpax.neurotraderjournal://reset-password`.
  - The mobile app explicitly requested that deep link when sending password/account recovery requests.
- Impact:
  - Custom URL schemes are easier to hijack than verified iOS universal links. Another installed app can potentially register the same scheme and intercept the recovery handoff.
- Fix:
  - Move iOS recovery to universal links on the verified NeuroTrader domain.
  - Keep the custom scheme only as a fallback, not the primary recovery transport.
  - Android App Links are intentionally deferred because Android is not part of the current public release scope.
- Mitigation:
  - Short expiry on recovery tokens and one-time use helps, but does not remove the interception class.

### M-02: The global CSP is present but weakened by `unsafe-inline` and `unsafe-eval`

- Severity: Medium
- Location:
  - `/Users/SGPAX/Dev/trading-journal-pro/next.config.ts:13`
  - `/Users/SGPAX/Dev/trading-journal-pro/next.config.ts:20`
  - `/Users/SGPAX/Dev/trading-journal-pro/next.config.ts:21`
- Evidence:
  - `style-src` includes `'unsafe-inline'`.
  - `script-src` includes both `'unsafe-inline'` and `'unsafe-eval'`.
- Impact:
  - The site has baseline browser protections, but the CSP provides weaker XSS containment than it should for a public app, especially because the product does render some rich/generated HTML in parts of the UI.
- Fix:
  - Move toward a nonce- or hash-based CSP.
  - Remove `unsafe-eval` unless there is a confirmed production runtime dependency.
  - Minimize or remove inline script/style requirements where possible.
- Mitigation:
  - Keep HTML sanitization centralized and tested anywhere rich/generated markup is rendered.

### M-03: Support-agent dry runs can be used as an authenticated LLM cost amplifier

- Severity: Medium
- Location:
  - `/Users/SGPAX/Dev/trading-journal-pro/app/api/support/agent/route.ts:285`
  - `/Users/SGPAX/Dev/trading-journal-pro/app/api/support/agent/route.ts:291`
  - `/Users/SGPAX/Dev/trading-journal-pro/app/api/support/agent/route.ts:330`
  - `/Users/SGPAX/Dev/trading-journal-pro/app/api/support/agent/route.ts:342`
- Evidence:
  - Any authenticated ticket owner can call the support agent endpoint.
  - `dryRun: true` bypasses the "latest message must be from the user" skip path and still invokes the model.
  - The route does not apply a rate limiter.
- Impact:
  - A normal authenticated user can repeatedly invoke the support model against the same thread without creating a new support exchange, increasing avoidable LLM spend.
- Fix:
  - Restrict `dryRun` to admins only, or remove it from the public path entirely.
  - Add a shared rate limiter to the support agent endpoint.
- Mitigation:
  - Log and alert on abnormal support-agent invocation frequency per user and per ticket.

## Non-Blocking Notes

### Dependency audit status

The current release gate passes because there are no `high` or `critical` advisories, but some moderate issues remain:

- Web: PostCSS advisory via Next.js dependency tree
- Mobile: PostCSS advisory via Expo dependency tree

These are not launch blockers on their own under the current gate, but they should stay on the patch queue.

### Production config items to verify manually

Before public launch, verify the actual values in Vercel for:

- `OPTIONFLOW_BYPASS_ENTITLEMENT` -> should be unset/false
- `NEXT_PUBLIC_OPTIONFLOW_BYPASS` -> should be unset/false
- `NEXT_PUBLIC_BROKER_SYNC_FREE` -> should be unset/false unless intentionally free
- `OPTIONFLOW_PAYWALL_ENABLED` and `NEXT_PUBLIC_OPTIONFLOW_PAYWALL_ENABLED` -> should match the intended launch posture

## Recommendation

### Public launch verdict

- **Full public launch:** No-Go until the High findings are closed.
- **Controlled soft launch:** Possible after fixing H-03, if H-01 and H-02 are actively scheduled and the production bypass flags are confirmed safe.

### Minimum exit criteria before full launch

1. Move mobile auth storage to `expo-secure-store`.
2. Replace the in-memory limiter with a shared production-grade limiter.
3. Fix the private-route guard so protected pages redirect cleanly without rendering the error boundary.
4. Verify all production bypass/paywall flags are in the intended state.
5. Re-run production smoke and get 5/5 green.
