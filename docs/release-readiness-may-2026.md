# Evaluacion de salida publica - Mayo 2026

Fecha de evaluacion: 2026-04-20  
Ultima verificacion tecnica: 2026-04-21  
Objetivo: definir que falta para abrir Neuro Trader Journal al publico en mayo de 2026.

## Resumen ejecutivo

El producto web ya esta en una version publicable a nivel de gates tecnicos: compila, pasa lint, typecheck, tests unitarios, smoke e2e local y smoke e2e contra produccion, audits web/mobile y deploy de produccion en Vercel. Despues del hardening inicial, los bloqueadores de dependencias high/critical, el checkout stub de `/plans`, `.env.example`, CI base, documentacion operativa, Vercel auth/envs, Stripe Broker Sync, historial/migraciones Supabase y warning de `.env` en deploy quedaron corregidos o verificados.

Aun asi, antes de escalar marketing fuerte, recomiendo completar una verificacion funcional con cuentas reales de prueba: checkout Stripe end-to-end con compra controlada, email delivery, hCaptcha, crons, broker sync real y flows de soporte/admin.

Recomendacion: el web app queda en estado Go tecnico para abrir un soft launch controlado. Para cobrar usuarios publicos o escalar marketing fuerte en mayo, cerrar primero la compra live controlada, admin/support y servicios externos prometidos.

## Evidencia tecnica actual

Checks ejecutados y revalidados entre el 2026-04-20 y el 2026-04-21:

| Area | Resultado |
| --- | --- |
| Git | Rama `main`, con cambios locales existentes antes de esta evaluacion. |
| Unit tests | `npm run test:unit`: 2 archivos, 2 tests, passed. |
| Lint web | `npm run lint:web`: passed. |
| TypeScript web | `npm run typecheck:web`: passed. |
| TypeScript mobile | `npm run typecheck:mobile`: passed. |
| Build produccion | `npm run build`: passed, 147 rutas locales generadas/servidas. |
| Smoke e2e | `E2E_BASE_URL=http://localhost:3001 npm run test:e2e`: 5/5 passed con Chromium. |
| Smoke e2e produccion | `E2E_BASE_URL=https://www.neurotrader-journal.com npm run test:e2e`: 5/5 passed con Chromium. |
| k6 smoke | 20 VUs por 2m, 5,940 checks, 0% failures, p95 20.06ms en `/`, `/pricing`, `/signin`. |
| Supabase remote | Historial legacy reparado; `supabase db push` aplico `20260420000200_lifecycle_email_deliveries.sql` y `20260420_plan_feature_rls_hardening.sql`; REST de `lifecycle_email_deliveries` respondio 200. |
| Supabase CLI post-push | El schema critico quedo verificado por REST; una relectura posterior por CLI quedo temporalmente limitada por el pooler/circuit breaker de Supabase. No es bloqueador del launch, pero conviene reintentar `migration list` mas tarde o con `SUPABASE_DB_PASSWORD` para auditoria operativa. |
| Vercel remote | CLI autenticado como `sgpaxcorp`; production envs listadas y completadas; `.env*` excluido del deploy con `.vercelignore`. |
| Stripe Broker Sync | Producto live `prod_UN2UR9t0p36UNi`; monthly `price_1TOIPNRoVVUlsLztFAHwfdR8`; annual `price_1TOIPNRoVVUlsLzt60H9HtLF`; ambos guardados en Vercel production. Webhook live habilitado para checkout/subscription/invoice events. |
| Vercel production deploy | `npx vercel deploy --prod -y`: passed. Production `https://trading-journal-eg4u427xf-sgpaxcorps-projects.vercel.app`; alias `https://www.neurotrader-journal.com`; status Ready. |
| npm audit web | `npm audit --omit=dev`: found 0 vulnerabilities despues del hardening. |
| npm audit mobile | `npm audit --omit=dev`: found 0 vulnerabilities despues del hardening. |

Nota: el smoke k6 y el smoke e2e publico cubren paginas y redirecciones principales sin login. No sustituyen QA de pagos, auth, brokers, IA ni mobile.

## Bloqueadores antes de abrir al publico

### P0 - Deben cerrarse antes de cobrar usuarios publicos

1. Ejecutar una compra live controlada de Stripe end-to-end.
   - Signup -> email OTP -> billing -> Stripe Checkout -> webhook -> `profiles` + `user_entitlements` -> acceso.
   - Cancelacion, auto-renew, invoice history, winback/followup.
   - Add-ons: `broker_sync` y estado beta de `option_flow`.
   - La configuracion de Broker Sync ya existe en Stripe/Vercel.
   - Webhook live, eventos y secret quedaron verificados; falta confirmar con una compra real controlada que el entitlement se crea sin intervencion manual.

2. Confirmar accesos administrativos reales.
   - `ADMIN_EMAILS` solo si no hay admin activo en tabla `admin_users`.
   - Verificar que un usuario admin real pueda entrar, revisar usuarios, grants, emails y soporte.

3. Confirmar servicios prometidos publicamente.
   - `CRON_SECRET` solo para llamadas manuales; Vercel Cron funciona por `x-vercel-cron`.
   - `TRADING_ECONOMICS_API_KEY` si el calendario economico se promete en launch.
   - Resend/domain/from email, hCaptcha y broker sync real con cuentas controladas.

### P1 - Necesario para un launch confiable en mayo

1. Ampliar QA automatizado de flujos reales.
   - Hoy hay 2 unit tests y 5 smoke e2e.
   - Faltan pruebas para auth, signup, checkout, webhook simulable, journal CRUD, imports, entitlements, admin restrictions, support, billing, AI endpoints y mobile smoke.

2. Observabilidad y soporte.
   - No se detecto Sentry/monitoring dedicado.
   - Definir alertas para 500s, Stripe webhook failures, crons, OpenAI errors, Supabase errors, email delivery y broker sync.

3. Mobile release readiness.
   - Typecheck pasa.
   - `mobile/.env` local solo contiene Supabase; falta confirmar `EXPO_PUBLIC_API_URL`.
   - Hay iOS nativo y EAS config, pero no se verifico archive/TestFlight actual.
   - Android no parece listo como target de mayo si no existe carpeta nativa actual.

### P2 - Puede ir despues del launch inicial

1. Roadmap visual en pricing con items "Coming soon".
   - Newsletter, Neuro Clubs, Neuro Store, Neuro Arena, importacion directa.
   - Puede quedarse como roadmap si no promete disponibilidad inmediata.

2. Partners.
   - `/partners` y `/partners/terms` dicen proximamente.
   - Aceptable si no es parte de la promesa de launch.

3. Ramp/spike load tests.
   - Smoke actual paso muy bien.
   - Antes de crecimiento publico fuerte, correr `k6-ramp.js` y `k6-spike.js` contra staging/production.

## Calendario recomendado

### 2026-04-20 a 2026-04-26 - Hardening tecnico y release gates

Meta: convertir el repo en release candidate defendible.

- Cerrado: dependencias high/critical de web y mobile.
- Cerrado: `xlsx` reemplazado por `exceljs`; para launch se soporta CSV/XLSX, no XLS.
- Cerrado: `/plans` usa Stripe Checkout real y `/api/checkout` stub fue retirado.
- Cerrado: `.env.example` web y CI release gates.
- Cerrado: Vercel CLI autenticado y production envs completadas para Webull, AI Coach y Broker Sync.
- Cerrado: Stripe live product/prices de Broker Sync creados y guardados en Vercel production.
- Cerrado: Supabase migration history reparado para eliminar drift de versiones legacy cortas.
- Cerrado: Supabase `db push` aplicado para lifecycle email deliveries y plan feature RLS hardening; REST remoto verificado con status 200.
- Cerrado: deploy de produccion a Vercel con alias `https://www.neurotrader-journal.com`; status Ready.
- Cerrado: smoke e2e contra produccion publica, 5/5 passed.
- Cerrado: `.env*` excluido de Vercel uploads mediante `.vercelignore`.
- Pendiente: validar los mismos gates en CI remoto.

Gate de salida: `test:unit`, `lint:web`, `tsc`, `typecheck:mobile`, `build`, `test:e2e`, audit triaged.

### 2026-04-27 a 2026-05-03 - Produccion, pagos y datos

Meta: comprobar que el dinero, acceso y datos trabajan en ambiente real.

- Probar Stripe live con checkout y webhook real.
- Confirmar `user_entitlements` despues de pago, cancelacion y add-ons.
- Validar crons de Vercel en logs; `CRON_SECRET` solo es necesario para ejecucion manual externa.
- Validar Resend/domain/from email.
- Validar hCaptcha production.
- Confirmar OpenAI model/env y limites de costo.
- QA manual de admin: usuarios, grants, emails, reset/delete.

Gate de salida: primer pago exitoso de prueba crea acceso correcto sin intervencion manual.

### 2026-05-04 a 2026-05-10 - QA funcional completo

Meta: congelar scope y probar los modulos principales.

- Journal: crear/editar trades, notas, premarket, screenshots si aplica.
- Dashboard y analytics: data real y empty states.
- Growth plan y performance plan.
- Profit & Loss Track.
- Notebook advanced.
- AI Coaching y Neuro Assistant.
- Option Flow: paywall/beta, analyze, chat, outcome/post-mortem.
- Import: CSV/order history, SnapTrade, Webull segun lo que se prometa publicamente.
- Rules/alarms y notificaciones.
- Forum/support/messages.
- Mobile iOS: auth, dashboard, calendar, journal, analytics, AI Coach, notebook, broker connect, reset password.
- Bilingue: ES/EN en paginas publicas, signup, billing y modulos core.

Gate de salida: no P0/P1 abiertos; solo P2 conocidos y documentados.

### 2026-05-11 a 2026-05-17 - Soft launch controlado

Meta: abrir a 10-25 usuarios reales con soporte cercano.

- Invitar testers/clientes de confianza.
- Activar checklist de soporte diario.
- Medir signup conversion, checkout success, webhook failures, 500s, email delivery, OpenAI failures.
- Correr k6 ramp contra staging o production fuera de horas pico.
- Revisar logs cada dia.
- Corregir bugs P0/P1 dentro de 24 horas.
- Preparar FAQ y respuestas de soporte.

Gate de salida: 5-10 pagos/testers completan onboarding sin soporte tecnico critico.

### 2026-05-18 a 2026-05-24 - Lanzamiento publico

Meta: abrir marketing y ventas publicas.

- Go/no-go el 2026-05-17.
- Publicar pricing final, terms, privacy y contact/support.
- Confirmar dominio, SSL, redirect canonical y email support.
- Activar monitoreo de launch.
- Mantener ventana diaria de triage.
- No lanzar features nuevas durante esta semana salvo fixes.

Gate de salida: launch publico si no hay P0 y si P1 esta cerrado o aceptado formalmente.

### 2026-05-25 a 2026-05-31 - Estabilizacion y backlog post-launch

Meta: convertir feedback en roadmap ordenado.

- Revisar metricas de activacion, conversion, churn temprano y errores.
- Priorizacion de bugs P2/P3.
- Mejoras de docs y onboarding.
- Plan de mobile/App Store si no entro al launch publico.
- Plan de features "Coming soon".

## Criterios Go / No-Go

Go tecnico:
- Build, lint, typechecks, unit y smoke e2e pasan.
- Audit high/critical resuelto o aceptado formalmente con mitigacion.
- Stripe webhook, precios y envs live verificados.
- Supabase migrations verificadas en remoto.
- Vercel production env verificada.
- Contact/support operativo.
- No hay rutas publicas apuntando a stubs.
- Admin APIs devuelven 403 a usuarios no autorizados.

Go comercial:
- Compra Stripe live controlada confirma `user_entitlements` sin intervencion manual.
- Email/hCaptcha/crons/broker sync reales funcionan con cuentas controladas.
- Admin/support tienen responsables y acceso confirmado.

No-Go:
- Vulnerabilidad critica sin mitigacion.
- Checkout o webhook falla durante la compra controlada.
- Entitlements no se crean correctamente.
- Migraciones remotas desconocidas.
- Vercel env no verificada.
- `/plans` o cualquier CTA principal lleva a stub/error.
- No hay manera clara de recibir soporte/contactos.

## Decision recomendada

Go tecnico aprobado para soft launch controlado. La aplicacion ya compila, despliega, pasa release gates, smoke local/produccion, audits y verificaciones remotas principales. Antes de cobrar usuarios publicos o abrir marketing fuerte, falta cerrar el Go comercial con compra Stripe live controlada, admin/support real y servicios externos prometidos.

Calendario sano para mayo:

- Soft launch: semana del 2026-05-11.
- Public launch: semana del 2026-05-18.
- Backup launch: semana del 2026-05-25 si seguridad, Stripe o Supabase se atrasan.
