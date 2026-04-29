# Developer Manual

## Stack

- Next.js 16.2.x
- React 19.2.x
- TypeScript 5.x
- Tailwind CSS 4
- Supabase
- Stripe
- OpenAI
- Resend
- Expo/React Native mobile workspace in `mobile/`

Evidence: `package.json`, `mobile/package.json`.

## Core Scripts

- `npm run dev` - local web dev server.
- `npm run build` - production Next.js build with webpack.
- `npm run start` - production server after build.
- `npm run test:unit` - Vitest unit suite.
- `npm run lint:web` - ESLint for app/context/lib/hooks/proxy/tests.
- `npm run typecheck:web` - `next typegen` plus TypeScript.
- `npm run typecheck:mobile` - mobile TypeScript check.
- `npm run audit:prod` - production dependency audit.
- `npm run audit:mobile` - mobile production dependency audit.
- `npm run verify:release` - combined release gate.

## Environment

Use `.env.example` as the source of truth for web/server configuration and `mobile/.env.example` for mobile.

Main groups:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plan and add-on price IDs.
- OpenAI: `OPENAI_API_KEY`, option-flow models, AI coach models.
- Email/contact: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, hCaptcha keys.
- Admin/crons: `ADMIN_EMAILS`, `CRON_SECRET`.
- Broker integrations: SnapTrade and Webull env vars.

## Release Verification

Current expected release gate:

```bash
npm run verify:release
```

For browser smoke tests:

```bash
npm run build
npm run start
npm run test:e2e
```

For load smoke:

```bash
k6 run k6-smoke.js
```

## Architecture

- `app/` - Next.js pages, layouts, and API routes.
- `app/(private)/` - authenticated product surface.
- `app/api/` - server routes for auth, billing, AI, broker import, alerts, admin, support, and analytics.
- `lib/` - shared domain logic and Supabase/server helpers.
- `context/` and `hooks/` - client app state.
- `mobile/` - Expo app.
- `supabase/migrations/` - database migrations.
- `docs/` - user/admin/developer manuals and launch readiness.

## Known External Release Checks

These cannot be proven by local tests alone:

- Vercel production env vars and domain config.
- Supabase remote migration state and RLS policies.
- Stripe live/test webhook delivery.
- Resend domain verification.
- hCaptcha production configuration.
- OpenAI billing/rate limits.
- SnapTrade/Webull production credentials.
