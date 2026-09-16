# Evidence Index

## User Manual
- "Que es esta plataforma" -> `app/page.tsx`
- "Secciones principales" -> `app/components/TopNav.tsx`, `lib/i18n.ts`, `app/(private)/*/page.tsx`
- "Ayuda dentro de la app" -> `app/components/TopNav.tsx`, `lib/i18n.ts`
- "Neuro Assistant" -> `app/components/NeuroAssistant.tsx`, `app/api/neuro-assistant/route.ts`, `app/api/neuro-assistant/neuro-reaction/route.ts`
- "FAQ" -> `app/(private)/option-flow/page.tsx`, `app/(private)/import/page.tsx`, `app/signup/page.tsx`

## Getting Started
- Registro, verificacion y pasos -> `app/signup/page.tsx`
- Confirmacion / bienvenida -> `app/confirmed/page.tsx`
- Billing -> `app/billing/page.tsx`
- Contacto / soporte -> `app/contact/page.tsx`

## Workflows
- Dashboard + Journal (texto de ayuda) -> `lib/i18n.ts`
- Option Flows Analysis -> `app/(private)/option-flow/page.tsx`
- Importacion de brokers -> `app/(private)/import/page.tsx`
- Billing -> `app/billing/*`

## Data Inputs
- Option Flow file types, limits, keywords -> `app/(private)/option-flow/page.tsx`
- Importador de brokers -> `app/(private)/import/page.tsx`

## Reports
- Secciones del reporte Option Flow -> `app/(private)/option-flow/page.tsx`
- PDF y disclaimer -> `app/(private)/option-flow/page.tsx`
- Archivo en storage -> `app/(private)/option-flow/page.tsx`

## Post-mortem
- UI de post-mortem -> `app/(private)/option-flow/page.tsx`
- API post-mortem -> `app/api/option-flow/outcome/route.ts`

## Admin Manual
- Admin page / endpoints -> `app/(private)/admin/page.tsx`, `app/api/admin`

## Developer Manual
- Stack y scripts -> `package.json`
- Env vars -> `app/api/*`, `lib/*`, `proxy.ts`
- Estructura -> `app/`, `lib/`, `context/`, `hooks/`
- Lint/build -> salida de `npm run lint` y `npm run build`

## Investment Data Engine
- Architecture, point-in-time contract, SEC operations, formulas and release gates -> `docs/neuro-analysis/INVESTMENT_DATA_ENGINE.md`
- Canonical schema and append-only controls -> `supabase/migrations/20260916000600_investment_data_engine.sql`
- SEC ingestion and durable checkpoints -> `lib/neuroSecEdgarClient.ts`, `lib/neuroInvestmentDataPipeline.ts`
- Deterministic statements, metrics, screens and valuation -> `lib/neuroFinancialStatements.ts`, `lib/neuroDeterministicMetrics.ts`, `lib/neuroScreeningEngine.ts`, `lib/neuroDcf.ts`, `lib/neuroReverseDcf.ts`, `lib/neuroValuationEngine.ts`
- Daily discovery scheduler -> `app/api/neuro-analysis/investment-data/schedule/route.ts`, `vercel.json`
- Point-in-time and calculation tests -> `tests/unit/neuroFinancialStatements.test.ts`, `tests/unit/neuroDeterministicMetrics.test.ts`
