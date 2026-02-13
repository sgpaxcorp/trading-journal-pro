# Developer Manual

## Stack (segun package.json)
- Next.js 16.0.7
- React 19.2.0
- TypeScript 5.x
- Tailwind CSS 4
Evidencia: `package.json`

## Scripts
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
Evidencia: `package.json`

## Servicios y dependencias externas (segun env vars usados)
Supabase:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
Evidencia: `lib/supaBaseAdmin.ts`, `lib/supaBaseClient.ts`, `lib/supabaseServer.ts`, `middleware.ts`

OpenAI:
- `OPENAI_API_KEY`
- `OPENAI_OPTIONFLOW_MODEL`
- `OPENAI_OPTIONFLOW_VISION_MODEL`
- `OPENAI_OPTIONFLOW_CHAT_MODEL`
- `OPENAI_BASE_URL`
- `AI_COACH_OPENAI_API_KEY`
- `AI_COACH_OPENAI_BASE_URL`
- `AI_COACH_MODEL`
- `AI_COACH_VISION_MODEL`
Evidencia: `app/api/option-flow/analyze/route.ts`, `app/api/option-flow/chat/route.ts`, `app/api/option-flow/outcome/route.ts`, `app/api/ai-coach/route.ts`, `app/api/ask/ask/route.ts`, `app/api/neuro-assistant/route.ts`

Stripe:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_CORE_MONTHLY`
- `STRIPE_PRICE_CORE_ANNUAL`
- `STRIPE_PRICE_ADVANCED_MONTHLY`
- `STRIPE_PRICE_ADVANCED_ANNUAL`
- `STRIPE_PRICE_OPTIONFLOW_MONTHLY`
- `NEXT_PUBLIC_APP_URL`
Evidencia: `app/api/stripe/create-checkout-session/route.ts`, `app/api/stripe/create-addon-session/route.ts`, `app/api/stripe/webhook/route.ts`

Resend (email):
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
Evidencia: `app/api/contact/route.ts`, `lib/email.ts`

hCaptcha:
- `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`
- `HCAPTCHA_SECRET_KEY`
Evidencia: `app/contact/page.tsx`, `app/api/contact/route.ts`

Trading Economics API:
- `TRADING_ECONOMICS_API_KEY`
Evidencia: `app/api/economic-calendar/route.ts`

Option Flow paywall:
- `OPTIONFLOW_PAYWALL_ENABLED`
- `OPTIONFLOW_BYPASS_ENTITLEMENT`
- `NEXT_PUBLIC_OPTIONFLOW_PAYWALL_ENABLED`
- `NEXT_PUBLIC_OPTIONFLOW_BYPASS`
Evidencia: `app/api/option-flow/analyze/route.ts`, `app/(private)/option-flow/page.tsx`

TODO: No existe `.env.example` en el repo.  
Evidencia: repo root (no hay archivo)

## Arquitectura (alto nivel, evidencia minima)
- App Next.js con rutas en `app/` (pages y API routes).
- Capas de acceso a datos en `lib/*Supabase.ts`.
- Componentes UI en `app/components/`.
Evidencia: estructura de carpetas `app/`, `lib/`, `context/`, `hooks/`

## Verificacion (lint/build)
### `npm run lint`
- Resultado: falla con multiples errores (`@typescript-eslint/no-explicit-any` y otros).  
- Conteo reportado: 1114 problemas (1010 errores, 104 warnings).  
Evidencia: salida de la ultima ejecucion en este entorno (ver logs del comando).

### `npm run build`
- Resultado: falla con error interno de Turbopack relacionado a `app/globals.css` y "Operation not permitted (os error 1)".  
- Panic log indicado en: `/var/folders/py/hypd4fv92tqd7dgnn_cg70mm0000gp/T/next-panic-5012cad38ebbfc97f5caa9bc9d1b1d3.log`.  
Evidencia: salida de la ultima ejecucion en este entorno (ver logs del comando).

## Neuro Assistant: base de conocimiento
UNKNOWN: No hay evidencia de un pipeline de ingestion de documentos para \"Neuro\" en el repo.  
TODO: definir mecanismo si se desea que el asistente responda preguntas con el manual.  
Evidencia: `app/components/NeuroAssistant.tsx`, `app/api/neuro-assistant/route.ts`

## Enlaces internos
- User manual: `../user-manual/README.md`
- Getting started: `../user-manual/getting-started.md`
- Workflows: `../user-manual/workflows.md`
- Data inputs: `../user-manual/data-inputs.md`
- Reports: `../user-manual/reports.md`
- Post-mortem: `../user-manual/post-mortem.md`
- Admin manual: `../admin-manual/README.md`
