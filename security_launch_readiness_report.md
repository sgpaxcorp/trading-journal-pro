# Evaluacion de seguridad y lanzamiento

Fecha de cierre: 2026-06-09  
Alcance: app web Next.js, APIs, mobile Expo/React Native, Supabase/RLS, Stripe, broker sync, AI/OpenAI y subproyecto `options-flow-forecast`.

## Veredicto ejecutivo

Se cerraron los P1-P3 accionables en codigo para reducir riesgo de abuso publico, robo de identidad, expansion de permisos broker y freeze por llamadas externas. La plataforma ahora tiene mejores limites, timeouts, rate limits, CSP con nonce, admin guard centralizado, respuestas auth menos enumerables, secretos broker cifrables y runbooks/checklists de lanzamiento.

No la marcaria como "lista para trafico publico amplio" hasta completar las configuraciones externas: MFA admin, secretos de produccion rotados/validados, `BROKER_SECRET_ENCRYPTION_KEY`, backups/PITR Supabase, dominios de correo y monitoreo. El codigo ya paso `verify:release`.

## Verificacion ejecutada

- `python3 -m py_compile options-flow-forecast/backend/app/main.py options-flow-forecast/backend/app/core/config.py options-flow-forecast/backend/app/services/ocr.py`: paso.
- `npm run lint:web`: paso.
- `npm run typecheck:web`: paso.
- `npm run typecheck:mobile`: paso.
- `npm run test:unit`: paso, 3 archivos / 6 tests.
- `npm run build`: paso, 164 rutas validadas.
- `npm run audit:prod`: paso sin high/critical de produccion; quedan 4 moderadas transitivas.
- `npm run audit:mobile`: paso sin high/critical de produccion; quedan 13 moderadas transitivas.
- `npm run verify:release`: paso completo.

## P1 cerrado en codigo

1. Endpoints publicos de mercado/calendario.
   - `app/api/economic-calendar/route.ts` ahora valida pais, fechas, importancia, rango maximo, rate limit por IP, timeout y cache corto.
   - `app/api/yahoo-chart/route.ts` ahora valida simbolo, interval/range allowlist, rango maximo, limite de velas, rate limit por IP, timeout y cache corto.
   - `app/api/neuro-analysis/market-data/route.ts`, `app/api/neuro-analysis/company-documents/route.ts` y `app/api/contact/route.ts` ahora tienen timeouts en llamadas externas.

2. Broker sync y OAuth.
   - `app/api/snaptrade/login/route.ts` ya no acepta `connectionType` del cliente; fuerza `read`, valida broker/redirect y tiene rate limit por usuario.
   - `app/api/webull/authorize/route.ts` ya no acepta `scope` del cliente; usa `WEBULL_SCOPE` server-side y rate limit por usuario.
   - SnapTrade/Webull order history ahora limita `days` a 180 dias.
   - `lib/webullClient.ts` ahora usa timeout para token/API calls.

3. Admin y acciones de alto impacto.
   - Se agrego `lib/adminAuth.ts` con `requireAdminUser`, `isAdminAccount` y `requireAdminActionSecret`.
   - Rutas admin principales ahora usan guard centralizado y rate limit por admin.
   - Acciones destructivas o sensibles pueden requerir step-up con `ADMIN_ACTION_SECRET` si se configura.
   - `app/api/support/agent/route.ts` reutiliza el guard admin centralizado.

4. Tracking de sesiones.
   - `app/api/admin/track/route.ts` valida path/session id, aplica rate limit y actualiza sesiones filtrando por `id` y `user_id`, reduciendo riesgo de poisoning.

5. CSP.
   - `proxy.ts` genera nonce por request y aplica CSP dinamico.
   - `next.config.ts` ya no define CSP estatica con `script-src 'unsafe-inline'`.
   - `unsafe-eval` queda limitado a desarrollo.

6. Auth enumeration.
   - `app/api/auth/signup/resend/route.ts` responde de forma generica para usuarios inexistentes, ya verificados o errores internos de resend.

## P2 cerrado o mitigado

- Broker/OAuth secrets:
  - Se agrego `lib/secretVault.ts` con AES-256-GCM.
  - `lib/snaptradeStorage.ts` y `lib/brokerOAuthStorage.ts` cifran nuevos secretos/tokens si `BROKER_SECRET_ENCRYPTION_KEY` existe y mantienen compatibilidad con plaintext viejo para migracion gradual.

- Stripe/billing:
  - Portal, add-on session, auto-renew y cancel ahora tienen rate limit por usuario/IP.

- `options-flow-forecast`:
  - API key ya no puede quedar abierta por accidente; si falta `OPTIONS_FLOW_API_KEY`, responde 503 salvo que `ALLOW_UNSAFE_DEV_NO_API_KEY=true`.
  - Se agrego rate limit por minuto, allowlist de content-type en uploads y timeout OpenAI.
  - `.env.example` documenta `ALLOW_UNSAFE_DEV_NO_API_KEY=false` y `RATE_LIMIT_PER_MINUTE=60`.

- Operacion:
  - Se agregaron `docs/launch/release-checklist.md` y `docs/launch/incident-runbook.md`.

## P3 cerrado o documentado

- `docs/launch/release-checklist.md` define checks automatizados, variables de entorno, Supabase, admin/identity, integraciones y smoke tests.
- `docs/launch/incident-runbook.md` cubre account takeover, secreto admin, broker credential exposure, Stripe webhook failure, OpenAI cost spike y Supabase outage/data issue.
- Se intento `npm audit fix --package-lock-only` sin `--force`; npm no resolvio todo porque los fixes restantes requieren upgrades mayores o breaking.

## Riesgos pendientes antes de produccion

1. Configuracion externa obligatoria.
   - Activar MFA para admins en Supabase Auth.
   - Configurar `BROKER_SECRET_ENCRYPTION_KEY` antes de conectar brokers reales.
   - Configurar/rotar `CRON_SECRET`, `HCAPTCHA_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, SnapTrade/Webull secrets y service role.
   - Confirmar `NEXT_PUBLIC_APP_URL` correcto en produccion.
   - Apagar bypass flags: `OPTIONFLOW_BYPASS_ENTITLEMENT`, `NEXT_PUBLIC_OPTIONFLOW_BYPASS`, `BROKER_SYNC_FREE`, `NEXT_PUBLIC_BROKER_SYNC_FREE`.

2. Dependencias moderadas transitivas.
   - Web prod: `postcss` via Next y `uuid` via ExcelJS quedan como moderadas. No hay high/critical en `--omit=dev`.
   - Mobile prod: `postcss` y `uuid` via Expo/tooling quedan como moderadas. No hay high/critical en `--omit=dev`.
   - Dev tooling: audit completo reporta riesgo en Vite/Vitest/esbuild; afecta servidor de desarrollo, no el build Next de produccion. Requiere upgrade controlado de Vitest/Vite.
   - No se debe correr `npm audit fix --force` directo porque npm propone cambios mayores/breaking.

3. Migracion de secretos existentes.
   - El codigo nuevo cifra secretos nuevos, pero secretos broker existentes en plaintext seguiran leyendo por compatibilidad.
   - Despues de configurar `BROKER_SECRET_ENCRYPTION_KEY`, conviene correr un job controlado que re-guarde conexiones existentes para cifrarlas.

4. Monitoreo y respuesta.
   - Falta conectar Sentry/Logtail o equivalente.
   - Faltan alertas por 5xx, p95/p99, rate-limit spikes, webhook failures, OpenAI cost spikes y admin destructive actions.

5. Privacidad/compliance.
   - Actualizar Privacy/Terms con AI usage, broker data, financial data, retention, deletion/export y subprocessors.
   - Verificar SPF/DKIM/DMARC del dominio transaccional.
   - Activar backups/PITR y probar restore.

## Riesgo de robo de identidad despues del hardening

El riesgo bajo bastante en endpoints y admin routes, pero las piezas mas sensibles siguen siendo operativas: una sesion admin robada, service role expuesto, OAuth broker tokens y reset/delete de usuarios. La defensa correcta para lanzar es MFA admin, alertas por acciones admin, rotacion de secretos, audit logs revisables y separacion estricta de variables por entorno.

## Riesgo de freeze despues del hardening

Los puntos publicos mas obvios ya tienen rate limit, limites de rango y timeouts. Aun asi, para trafico real hacen falta monitoreo y load test con escenarios de AI/broker/analytics. Las rutas AI largas deben moverse a colas si el uso crece o si la latencia p95 se vuelve inestable.

## Checklist final para pasar a produccion

1. Aplicar migraciones Supabase en produccion y confirmar RLS/buckets privados.
2. Configurar secretos de produccion y rotar cualquier secreto compartido en desarrollo.
3. Activar MFA admin y revisar `admin_users`; usar `ADMIN_EMAILS` solo como bootstrap.
4. Configurar `BROKER_SECRET_ENCRYPTION_KEY` y plan de migracion de secretos existentes.
5. Confirmar Stripe live webhook, Resend domain, hCaptcha, SnapTrade/Webull redirect URIs.
6. Activar monitoreo/alertas y backups/PITR con prueba de restore.
7. Ejecutar `npm run verify:release`.
8. Ejecutar smoke test real: signup, verify email, checkout, login web/mobile, journal, notebook paid gate, AI Coaching con Growth Plan, broker read-only, admin non-destructive update y account deletion de prueba.
