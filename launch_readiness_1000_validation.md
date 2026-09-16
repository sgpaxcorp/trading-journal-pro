# Validacion de lanzamiento para 1,000 suscriptores

**Fecha:** 2026-09-15  
**Objetivo:** validar capacidad y controles operacionales para una apertura de hasta 1,000 suscriptores, con una cohorte promocional inicial de 500.  
**Decision de codigo:** **PASS** en los ocho controles evaluados.  
**Decision de produccion:** aplicar las migraciones pendientes, configurar alertas y repetir el smoke test en el deployment antes de abrir registros.

## Resumen final

| # | Area | Resultado | Evidencia principal |
|---:|---|---|---|
| 1 | Carga y concurrencia | PASS | 0 errores; p95 de 1,217 ms a 500 concurrentes |
| 2 | IA: presupuesto y concurrencia | PASS | Reserva atomica, limites diarios/mensuales y limites de concurrencia |
| 3 | PDFs: procesamiento asincrono | PASS | Upload `202`, staging privado, worker durable, retries y polling de estado |
| 4 | Supabase: aislamiento y RLS | PASS | Foro retirado, entitlements server-owned y pruebas pgTAP de autorizacion |
| 5 | Stripe | PASS | Firma, ledger global, idempotencia, reconciliacion e identidad de billing verificada |
| 6 | Emails | PASS | Jobs por canal, worker durable, dedupe, retries y backoff |
| 7 | Monitoreo | PASS | Instrumentacion de errores, watchdog, alertas y consola operacional |
| 8 | Controles de emergencia | PASS | Switches auditados para registro, checkout, IA, PDFs, email y brokers |

## 1. Simulacion de carga

La prueba se ejecuto contra un build local optimizado de produccion de Next.js, no contra el servidor de desarrollo. Uso 1,000 identidades sinteticas y las rutas publicas `/`, `/signin`, `/pricing`, `/privacy` y `/terms`.

**Umbrales:** errores <= 1%, p95 <= 2,000 ms y timeout de 10 segundos.

| Concurrentes | Requests | Errores | Throughput | p50 | p95 | p99 | Resultado |
|---:|---:|---:|---:|---:|---:|---:|---|
| 50 | 1,000 | 0 | 463.74 req/s | 103 ms | 149 ms | 203 ms | PASS |
| 150 | 1,000 | 0 | 514.09 req/s | 279 ms | 598 ms | 935 ms | PASS |
| 300 | 1,200 | 0 | 577.47 req/s | 517 ms | 553 ms | 557 ms | PASS |
| 500 | 2,000 | 0 | 573.25 req/s | 871 ms | 1,217 ms | 2,258 ms | PASS |

Esta prueba demuestra estabilidad de las paginas publicas bajo el modelo sintetico. No sustituye una prueba distribuida de staging con usuarios autenticados y dependencia real de Supabase, Stripe, Resend u OpenAI.

## 2. IA

- Las rutas de IA llaman `requireAiBudget` antes del proveedor.
- `reserve_ai_usage_budget` serializa reservas mediante advisory lock dentro de la transaccion.
- Las reservas consideran costo registrado mas costo en vuelo.
- Hay limites por usuario, categoria, dia, mes y concurrencia global.
- Si la comprobacion falla, el sistema responde cerrado con `503`; si se alcanza el limite, responde `429`.
- Con 500 solicitudes simultaneas de $0.25 y limite diario de $75, el modelo acepta 300 y rechaza 200, sin overshoot teorico.

## 3. PDFs

- El navegador valida identidad y acceso antes del upload.
- El servidor valida tamano, extension, MIME y firma `%PDF-`.
- El archivo entra a un bucket privado de staging.
- La API crea un job durable y devuelve `202` sin esperar a OpenAI.
- El worker reclama con `FOR UPDATE SKIP LOCKED`, limita intentos, aplica backoff y recupera jobs abandonados.
- La interfaz consulta el job y presenta el resultado cuando termina.
- La eliminacion de cuenta tambien limpia el staging privado.

## 4. Supabase y autorizacion

- El foro, sus rutas, helpers, manuales, permisos y tablas fueron retirados.
- `profiles` protege plan, billing, trial, email y aceptaciones legales mediante trigger server-owned.
- `user_entitlements` es la autoridad de acceso; se revoca mutacion directa a `anon` y `authenticated`.
- Las rutas ya no usan `profiles` como fallback de plan o suscripcion.
- `supabase/tests/authorization_hardening.sql` comprueba los controles estructurales y la ausencia de tablas del foro.

## 5. Stripe

- El webhook verifica la firma sobre el body original.
- `stripe_webhook_events` reclama cada evento atomica e idempotentemente.
- Los side effects existentes de email y comisiones conservan sus claves unicas.
- Las rutas de portal, facturas, cancelacion, auto-renew y borrado resuelven billing desde entitlements server-owned.
- Los objetos Stripe se vinculan al usuario por metadata verificada o email autenticado antes de persistir identidad.

## 6. Email

- El dispatch de waitlist crea jobs pequenos con `dedupe_key` por destinatario y canal.
- `claim_email_delivery_jobs` usa `SKIP LOCKED` para consumidores concurrentes.
- El worker procesa lotes de 25, registra resultado, reintenta con backoff y conserva fallos finales.
- El cron se ejecuta cada minuto y el request inicial solo dispara trabajo en background.

## 7. Monitoreo

- `instrumentation.ts` registra errores no manejados del servidor sin guardar headers, cookies, query strings o secretos.
- `operational_events` conserva eventos sanitizados para el Admin.
- `/api/operations/watchdog` revisa jobs fallidos/estancados y webhooks Stripe fallidos cada cinco minutos.
- Alertas criticas se envian por Resend a `OPERATIONAL_ALERT_EMAILS` o `ADMIN_EMAILS`, con dedupe de 15 minutos.
- El tab **Operations** del Admin muestra colas, fallos, eventos y estado de los controles.

## 8. Controles de emergencia

El Admin puede pausar individualmente:

- nuevos registros;
- checkout;
- servicios de IA;
- ingestion y procesamiento de PDFs;
- entregas de email;
- conexiones y sincronizacion de brokers.

Los cambios exigen autenticacion admin, rate limit, step-up secret y auditoria. Variables `DISABLE_*` proveen un segundo control de emergencia desde infraestructura.

## Verificaciones ejecutadas

- `npm run typecheck:web`: PASS.
- `npm run lint:web`: PASS.
- `npm run test:unit`: PASS, 30 archivos y 136 pruebas.
- `npm run build`: PASS, 180 paginas generadas.
- `npm run release:validate-operational`: PASS, 7/7 controles estructurales (areas 2-8).
- `npm run release:simulate-capacity`: PASS en las cuatro etapas.
- `supabase db push --dry-run`: PASS; 10 migraciones pendientes detectadas en orden, sin aplicarlas.

## Pasos obligatorios de deployment

1. Aplicar las migraciones listadas por el dry-run.
2. Configurar `CRON_SECRET`, `ADMIN_ACTION_SECRET`, `ADMIN_EMAILS` y opcionalmente `OPERATIONAL_ALERT_EMAILS`.
3. Confirmar que los crons de jobs y watchdog estan activos en Vercel.
4. Ejecutar smoke tests de login, checkout test, upload PDF, email test y Admin Operations.
5. Repetir la prueba de carga en staging para rutas autenticadas antes de eliminar cualquier limite de apertura.

El sistema de codigo queda listo para deployment controlado. El estado de produccion no debe marcarse como final hasta que migraciones, variables y crons hayan sido verificados en el entorno desplegado.
