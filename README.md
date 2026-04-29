# Neuro Trader Journal

Trading journal, analytics, billing, AI coaching, broker import, and mobile companion app.

## Stack

- Next.js 16 + React 19
- TypeScript
- Supabase Auth/Postgres/Storage
- Stripe subscriptions and add-ons
- OpenAI-powered coaching and option-flow analysis
- Expo/React Native mobile app in `mobile/`

## Local Setup

1. Install dependencies:

```bash
npm ci
```

2. Create local env files:

```bash
cp .env.example .env.local
cp mobile/.env.example mobile/.env
```

3. Fill the Supabase, Stripe, OpenAI, Resend, hCaptcha, broker, and cron values.

4. Start the web app:

```bash
npm run dev
```

5. Start mobile when needed:

```bash
npm run mobile:start
```

## Release Gates

Run the full local gate before release:

```bash
npm run verify:release
```

Individual checks:

```bash
npm run test:unit
npm run lint:web
npm run typecheck:web
npm run build
npm run typecheck:mobile
npm run audit:prod
npm run audit:mobile
```

Smoke e2e requires a running production server:

```bash
npm run build
npm run start
npm run test:e2e
```

## Deployment Notes

- Vercel project config exists in `.vercel/project.json`.
- Production env vars must match `.env.example`.
- Supabase migrations live in `supabase/migrations/`.
- Vercel crons are configured in `vercel.json`.
- Stripe webhooks must point to `/api/stripe/webhook`.

## Release Planning

See `docs/release-readiness-may-2026.md` for the May 2026 public launch readiness plan and go/no-go checklist.
