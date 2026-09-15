# Auditoria de Ciberseguridad - NeuroTrader

**Fecha:** 2026-09-15  
**Preparado para:** SG PAX Corp.  
**Proyecto:** NeuroTrader / `trading-journal-pro`  
**Alcance:** aplicacion web Next.js, API routes, Supabase, Stripe, OpenAI, Resend, integraciones de brokers, carga de documentos y aplicacion movil Expo/React Native.

## 1. Resumen ejecutivo

La plataforma tiene una base defensiva mejor que la de una aplicacion promedio en etapa previa a lanzamiento: verifica tokens en el servidor, mantiene secretos privilegiados fuera del cliente, usa firma de webhooks de Stripe, aplica rate limiting compartido, cifra credenciales de brokers, protege buckets y entrega headers de seguridad en produccion.

Sin embargo, **no recomiendo abrir la plataforma a una audiencia amplia hasta corregir SEC-01 y SEC-02**. Ambos son problemas de autorizacion, el tipo de vulnerabilidad que puede saltarse controles visuales aunque la interfaz parezca cerrada:

1. Un usuario autenticado puede modificar campos sensibles de su propio perfil. Esos campos participan en el acceso a planes y en operaciones de facturacion, creando una via de elevacion de privilegios y un posible IDOR de Stripe.
2. Los hilos del foro que la interfaz presenta como privados pueden consultarse de forma anonima directamente desde la API de Supabase.

### Distribucion de hallazgos

| Severidad | Cantidad | Criterio |
|---|---:|---|
| Alta | 2 | Deben bloquear el lanzamiento publico |
| Media | 9 | Deben corregirse antes de escalar o procesar datos sensibles en volumen |
| Baja | 5 | Defensa en profundidad y reduccion de superficie |

**Veredicto:** buena base tecnica, pero aun no apta para escalar a 20,000 usuarios sin la primera ola de remediacion. La prioridad no es anadir mas controles visuales, sino hacer que la base de datos y el servidor sean la autoridad exclusiva para identidad, plan, facturacion y acceso.

## 2. Metodologia

La auditoria incluyo:

- Inventario de 124 API routes y de los limites de confianza entre navegador, servidor, Supabase, proveedores financieros, Stripe, OpenAI, Resend y la app movil.
- Revision estatica de autenticacion, autorizacion, RLS, storage, secretos, pagos, webhooks, redirecciones, uploads, renderizado de HTML, logging y acciones destructivas.
- Consultas anonimas no destructivas contra produccion para verificar aislamiento de tablas seleccionadas.
- Verificacion de headers HTTP en el dominio publico.
- Auditoria de dependencias de produccion con `npm audit` para web y movil.
- Busqueda de secretos en los archivos actuales del workspace.

No se realizaron acciones destructivas, escritura anonima, explotacion de cuentas ajenas ni pruebas de denegacion de servicio.

## 3. Arquitectura y limites de confianza

Los principales limites que deben considerarse en cada cambio son:

1. **Cliente web -> Next.js API:** todo valor enviado por el navegador es no confiable, incluido `user_id`, plan, rol, IDs de Stripe, URLs y archivos.
2. **Cliente -> Supabase REST/Storage:** RLS y politicas de storage son el control final. Ocultar una funcion en la interfaz no protege los datos.
3. **Next.js -> Supabase service role:** la clave administrativa omite RLS. Cada ruta que la usa debe volver a aplicar autorizacion y filtros de propietario.
4. **Next.js -> Stripe/Resend/OpenAI/brokers:** IDs de clientes, contenido y callbacks deben vincularse a una identidad verificada en servidor.
5. **App movil -> almacenamiento local:** tokens, balances y journals permanecen fuera del servidor y requieren proteccion del dispositivo y borrado de ciclo de vida.
6. **Uploads -> parsers/IA/storage:** un archivo es contenido hostil hasta validar tipo real, tamano expandido y comportamiento del parser.

## 4. Hallazgos de severidad alta

### SEC-01 - Campos sensibles del perfil editables por el usuario

**Severidad:** Alta  
**Confianza:** Alta  
**Estado:** Confirmado por codigo y politica SQL

**Ubicaciones principales:**

- `supabase/migrations/20260218000400_rls_policies_user_owned.sql:30`
- `app/(private)/account/page.tsx:253`
- `lib/serverFeatureAccess.ts:49`
- `lib/planAccess.ts:32`
- `supabase/migrations/20260420_plan_feature_rls_hardening.sql:4`
- `app/api/stripe/billing-portal/route.ts:66`
- `app/api/stripe/invoices/route.ts:29`
- `app/api/stripe/subscription/cancel/route.ts:58`
- `app/api/account/delete/route.ts:158`

**Evidencia:** la politica permite que un usuario autenticado actualice su propia fila completa en `profiles`, sin privilegios por columna. Esa fila contiene estado/plan y tambien IDs de Stripe. El servidor acepta datos del perfil como fallback de autorizacion y varias rutas de facturacion consumen `stripe_customer_id` o `stripe_subscription_id` desde ese perfil.

**Impacto:**

- Elevacion de plan sin pago al modificar `plan` o `subscription_status`.
- Acceso indebido a funciones premium que confian en el fallback del perfil.
- Si se obtiene un identificador de Stripe ajeno, posible acceso a portal/facturas o modificacion/cancelacion de una suscripcion que no pertenece al usuario.
- Alteracion del email de perfil usado por algunos avisos de seguridad.

**Remediacion recomendada:**

1. Hacer que `user_entitlements` o una tabla de billing propiedad exclusiva del servidor sea la unica autoridad para plan y facturacion.
2. Eliminar el fallback de `profiles` en `serverFeatureAccess`, `planAccess` y funciones SQL.
3. Revocar `UPDATE` general sobre `profiles`. Permitir solo columnas editables mediante privilegios por columna o una RPC `SECURITY DEFINER` con allowlist estricta.
4. Resolver los IDs de Stripe exclusivamente desde una tabla no editable por clientes y verificar que la metadata del objeto Stripe coincide con el usuario autenticado.
5. Migrar datos existentes y luego eliminar/deprecar campos sensibles duplicados en `profiles`.
6. Anadir pruebas con usuario A, usuario B y administrador para cada operacion de billing y entitlement.

**Controles compensatorios actuales:** se requiere autenticacion y los IDs de Stripe son dificiles de adivinar. Esto reduce la probabilidad, pero no elimina la vulnerabilidad de autorizacion ni el acceso premium gratuito.

### SEC-02 - Contenido del foro privado accesible anonimamente

**Severidad:** Alta  
**Confianza:** Alta  
**Estado:** Confirmado mediante lectura anonima no destructiva

**Ubicaciones principales:**

- `app/(private)/forum/community-feed/page.tsx:526`
- `lib/forumSupabase.ts:76`
- `lib/forumSupabase.ts:144`

**Evidencia:** la interfaz identifica la comunidad como privada para usuarios autenticados, pero no se encontro una migracion RLS para `forum_threads`/`forum_posts`. Una consulta REST anonima en produccion respondio `200` y devolvio una fila con titulo, cuerpo, autor y `user_id`.

**Impacto:** un tercero puede enumerar o extraer contenido generado por usuarios y sus identificadores sin iniciar sesion. El foro tampoco presenta mecanismos completos de reportar contenido o bloquear usuarios, lo que aumenta riesgo de abuso y moderacion.

**Remediacion recomendada:**

1. Activar RLS y revocar acceso anonimo a `forum_threads`, `forum_posts` y `forum_categories`.
2. Permitir `SELECT` solo a usuarios autenticados con acceso vigente a la plataforma.
3. Exigir `author_id = auth.uid()` en inserts y limitar updates/deletes al propietario o moderador.
4. No exponer UUID internos como identidad publica; usar un perfil publico minimo.
5. Implementar reportar, bloquear, moderar, conservar evidencia y rate limiting por accion.
6. Crear pruebas anonimo/usuario A/usuario B/moderador para leer, crear, editar y borrar.

**Nota:** la auditoria confirmo lectura anonima. No se intento ni se afirma escritura anonima.

## 5. Hallazgos de severidad media

### SEC-03 - Manipulacion del flujo de soporte por el propietario del ticket

**Ubicaciones:** `supabase/migrations/20260305000100_support_tickets.sql:57`, `:111`; `lib/supportTicketsSupabase.ts:141`, `:211`.

El propietario puede actualizar columnas operacionales de su ticket y enviar un `author_role` controlado por cliente. Puede falsificar la apariencia de mensajes administrativos o alterar prioridad, asignacion y estado, degradando la integridad del historial.

**Correccion:** bloquear campos administrativos con RLS/privilegios por columna, forzar `author_role = 'user'` para clientes y mover cambios de workflow a rutas/RPC verificadas por rol.

### SEC-04 - La sesion movil hace fallback a almacenamiento no seguro

**Ubicacion:** `mobile/src/lib/supabase.ts:15`.

Si SecureStore falla, la implementacion lee y escribe la sesion en `AsyncStorage`. Expo documenta que AsyncStorage no es almacenamiento seguro para tokens. Una falla del keychain no debe convertir silenciosamente la sesion en texto accesible a un dispositivo comprometido o backup.

**Correccion:** fallar cerrado, mantener la sesion solo en memoria y solicitar login nuevamente; nunca guardar tokens en AsyncStorage; borrar valores legacy y configurar una accesibilidad apropiada de SecureStore.

### SEC-05 - Validacion insuficiente de archivos no confiables

**Ubicaciones:**

- `app/api/neuro-analysis/upload-filing/route.ts:96`
- `app/api/notebook/assets/route.ts:23`
- `app/api/broker-import/route.ts:540`
- `lib/supportTicketsSupabase.ts:230`
- `supabase/migrations/20260305000100_support_tickets.sql:152`

Los PDFs se aceptan por MIME o extension, los CSV/XLSX por extension y los adjuntos de soporte dependen principalmente del cliente. El bucket de soporte observado no impone `file_size_limit` ni `allowed_mime_types`. No hay validacion uniforme de magic bytes, limites de paginas/expansion o escaneo antimalware.

**Impacto:** archivos disfrazados, bombas de descompresion, consumo excesivo de parser/IA y contenido activo servido posteriormente.

**Correccion:** centralizar uploads en servidor, verificar firma real y formato, generar nombres, limitar tamano expandido/paginas/celdas, usar antivirus/CDR, configurar limites del bucket y servir descargas con `Content-Disposition: attachment` y MIME seguro.

### SEC-06 - Datos financieros y de journal en cache movil sin cifrar

**Ubicacion:** `mobile/src/screens/DashboardScreen.tsx:287`.

Balances y entradas del journal se guardan en AsyncStorage por 24 horas. No se encontro un borrado completo asociado a logout, eliminacion o cambio de cuenta.

**Correccion:** cachear solo agregados minimos o cifrar con una clave protegida por el dispositivo; reducir TTL y borrar por logout, eliminacion, revocacion y cambio de cuenta.

### SEC-07 - Dependencias y configuracion de build movil con deuda de seguridad

**Ubicaciones:** `mobile/package.json`, `mobile/scripts/audit-ci.mjs:11`, `mobile/plugins/with-device-debug-bundling.js:392`.

`npm audit --omit=dev` reporto 8 vulnerabilidades altas y 3 moderadas en el arbol de Expo/Metro. Las altas se concentran en herramientas de imagen/build y el fix automatico requiere salto mayor a Expo 57. El CI permite temporalmente dos advisories. Ademas, un plugin desactiva `ENABLE_USER_SCRIPT_SANDBOXING` y suprime advertencias de Xcode.

**Correccion:** probar Expo 57 en una rama, fijar lockfile, construir en CI desechable, limitar assets no confiables, asignar fecha de expiracion a excepciones y reactivar el sandbox de scripts donde sea compatible. Las severidades upstream son altas; el riesgo directo para usuarios se clasifica medio porque la ruta principal es build-time.

### SEC-08 - Reenvio anonimo de emails de compra mediante `session_id`

**Ubicacion:** `app/api/stripe/resend-checkout-emails/route.ts:31`.

La ruta no requiere usuario autenticado. Quien posea un Checkout Session ID pagado puede volver a disparar emails de bienvenida, confirmacion y recibo. El ID puede quedar en historial, URLs o logs.

**Correccion:** exigir autenticacion y vincular `metadata.userId`/customer al usuario actual, o usar un token firmado de un solo uso; aplicar idempotencia de entrega y limites separados por sesion y cuenta.

### SEC-09 - Logs de Stripe contienen PII e identificadores sensibles

**Ubicacion:** `app/api/stripe/webhook/route.ts:528`.

El webhook registra metadata completa, email, customer ID, subscription ID y metadata de suscripcion. Los logs amplian el numero de sistemas con datos personales y facilitan que IDs reutilizables terminen en herramientas de observabilidad o soporte.

**Correccion:** logging estructurado con `event.id`, tipo y resultado; hash/truncado de identificadores; no registrar emails ni metadata completa; definir retencion, acceso y alertas.

### SEC-10 - Acciones de alto impacto sin step-up authentication

**Ubicaciones:** `lib/adminAuth.ts:47`, `:92`; `app/api/account/delete/route.ts:122`; `app/(private)/admin/AccessGrantManager.tsx:98`.

Las rutas administrativas verifican sesion/rol, pero no exigen AAL2. Existe un secreto estatico adicional que las interfaces administrativas revisadas no envian consistentemente. La eliminacion de cuenta usa bearer token mas texto/email de confirmacion, sin contrasena reciente o MFA.

**Correccion:** exigir MFA para administradores, verificar `aal2` en servidor y aplicar reautenticacion reciente para eliminar cuenta, cambiar billing, otorgar acceso y envios masivos. Sustituir el secreto compartido por autorizacion por rol, MFA y auditoria.

### SEC-11 - No hay pruebas automatizadas de RLS y aislamiento entre usuarios

**Ubicacion:** `supabase/migrations/` y ausencia de `supabase/tests/`.

El proyecto tiene decenas de migraciones y tablas expuestas por PostgREST, pero no un conjunto pgTAP que valide anonimo/usuario A/usuario B/admin. La exposicion del foro demuestra que la revision manual no basta.

**Correccion:** incorporar `supabase test db` al CI, cubriendo `SELECT/INSERT/UPDATE/DELETE` y storage para cada tabla/bucket expuesto; detectar drift entre migraciones locales y esquema remoto.

## 6. Hallazgos de severidad baja

### SEC-12 - Errores internos regresan al cliente

Varias rutas devuelven `error.message` o errores de proveedor, entre ellas checklist, journal sync, broker import, Neuro Analysis, notebook assets y reenvio de emails. Puede revelar nombres de tablas, restricciones o detalles operacionales.

**Correccion:** respuesta publica generica con request ID; detalle completo solo en log interno redactado.

### SEC-13 - Origen derivado de la solicitud en enlaces y callbacks

**Ubicaciones:** `app/api/auth/signup/route.ts:90`, `app/api/auth/resend/route.ts:107`, `app/api/webull/callback/route.ts:17`.

Algunos enlaces y redirecciones se construyen con el origen de la solicitud. La infraestructura actual probablemente normaliza el host, pero el control debe ser explicito.

**Correccion:** usar un origen canonico configurado y una allowlist estricta para preview/produccion; rechazar hosts inesperados.

### SEC-14 - CSP amplia y sanitizador HTML propio

**Ubicaciones:** `proxy.ts:19`; `app/(private)/option-flow/page.tsx`.

La CSP usa nonce y bloquea scripts inline no autorizados, lo cual es positivo, pero `connect-src https: wss:` e `img-src https:` son amplios y los estilos permiten `unsafe-inline`. Option Flow usa un sanitizador propio antes de `dangerouslySetInnerHTML`; no se confirmo XSS, pero mantener un parser de seguridad local es fragil.

**Correccion:** renderizar una estructura JSON con componentes React o usar un sanitizador mantenido; bloquear imagenes remotas no necesarias y reducir gradualmente los origenes CSP.

### SEC-15 - Higiene local de secretos y cifrado fail-open

`.env.local` y `mobile/.env` estan ignorados por Git, pero tienen permisos `0644`. `lib/secretVault.ts:29` permite continuar sin clave de cifrado, lo que puede terminar almacenando secretos sin cifrar en una configuracion incorrecta.

**Correccion:** `chmod 600`, fail closed en produccion, rotacion documentada y validacion obligatoria en release. Deshabilitar tambien `X-Powered-By` para reducir fingerprinting.

### SEC-16 - Controles de recursos incompletos en health e IA

**Ubicaciones:** `app/api/health/route.ts:9`, `app/api/ai-coach/route.ts:2206`.

El health check publico consulta la base de datos en cada solicitud. AI Coach acepta un cuerpo complejo y screenshot base64 sin limites explicitos uniformes de bytes, dimensiones o profundidad, aunque cuenta con rate/budget limiting.

**Correccion:** separar liveness barato de readiness protegido/cacheado; imponer limite global de body y esquemas runtime, longitud, dimensiones, nesting y timeout para entradas de IA.

## 7. Controles positivos verificados

- Tokens de usuario verificados en servidor con Supabase Auth.
- Service role y secretos de proveedores limitados a modulos de servidor.
- Rutas principales filtran datos por `user_id` y Neuro Analysis tiene gate de propietario.
- Rate limiting compartido y comportamiento fail-closed en produccion.
- Webhook de Stripe valida firma sobre el raw body.
- Credenciales de brokers en tablas restringidas y cifrado AES-256-GCM cuando la clave esta configurada.
- Buckets principales privados.
- CSP con nonce, HSTS, `nosniff`, `DENY`, Referrer Policy y Permissions Policy activos en produccion.
- No se encontraron `eval`, SQL interpolado ni secretos privados hard-coded en los archivos actuales.
- `npm audit --omit=dev` del proyecto web: 0 vulnerabilidades conocidas.
- Consultas anonimas de comprobacion a perfiles, trades, broker, Neuro Analysis, notebook, waitlist y entitlements no devolvieron filas; el hallazgo dinamico fue el foro.

## 8. Plan de remediacion recomendado

### Fase 0 - Antes del lanzamiento publico (0-48 horas)

1. Corregir SEC-01: separar perfil editable de entitlement/billing y cerrar permisos por columna.
2. Corregir SEC-02: RLS del foro, ocultar UUID y agregar base de moderacion.
3. Revisar logs de auditoria y Stripe por actividad anomala; rotar secretos solo si aparece evidencia de exposicion o acceso no autorizado.
4. Ejecutar pruebas con dos usuarios reales de staging, anonimo y administrador.

### Fase 1 - Antes de escalar usuarios (2-7 dias)

1. Cerrar manipulacion de soporte.
2. Eliminar fallback de tokens a AsyncStorage y limpiar cache movil al salir.
3. Endurecer uploads y buckets.
4. Proteger reenvio de checkout y redactar logs de Stripe.
5. Normalizar errores publicos y validar origen canonico.

### Fase 2 - Madurez operacional (1-3 semanas)

1. MFA/AAL2 y reautenticacion para administradores y acciones destructivas.
2. Upgrade controlado de Expo/Metro y endurecimiento de CI movil.
3. Suite pgTAP de RLS/storage y pruebas de autorizacion de APIs.
4. SAST, secret scanning, SBOM y dependency review en CI.
5. Alertas de abuso, anomalías de billing, accesos administrativos y picos de uploads/IA.

## 9. Criterios de aceptacion para relanzar la revision

- Un usuario no puede modificar plan, estado de suscripcion, rol ni IDs de Stripe directa o indirectamente.
- Todas las operaciones de Stripe resuelven y validan propiedad en servidor.
- Una llamada anonima a cualquier tabla/bucket privado devuelve `401/403` o cero filas segun el contrato.
- Usuario A no puede leer ni alterar recursos de usuario B en API, PostgREST o storage.
- Tokens moviles nunca llegan a AsyncStorage y el cache sensible se elimina al logout.
- Archivos falsos, sobredimensionados y bombas de expansion se rechazan antes del parser.
- Acciones administrativas requieren MFA/AAL2 y quedan auditadas.
- CI falla si aparece una regresion RLS, un secreto o una vulnerabilidad sobre el umbral acordado.

## 10. Verificaciones externas pendientes

Estas comprobaciones requieren acceso a los paneles de proveedores y no pueden confirmarse solo con el repositorio:

- MFA obligatorio, roles minimos y sesiones administrativas en Supabase, Vercel, Stripe, OpenAI, Resend, Apple y brokers.
- PITR/backups, restauracion probada y retencion de base de datos.
- Rotacion y antiguedad de secretos, claves y webhooks.
- WAF/bot protection, limites de gasto y alertas de consumo.
- Retencion/acceso de logs y acuerdos de tratamiento de datos con proveedores.
- Configuracion de privacidad/telemetria y borrado de datos en la app movil.

La revision de historial Git para secretos no pudo ejecutarse porque las herramientas de desarrollo locales estan bloqueadas por la licencia pendiente de Xcode. El workspace actual si fue inspeccionado y los `.env` estan ignorados.

## 11. Fuentes tecnicas

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security)
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Stripe Customer Portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal?locale=en-GB)
- [Expo Authentication and secure token storage](https://docs.expo.dev/guides/authentication/)
- [Expo SecureStore](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [Next.js Backend for Frontend security](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Next.js Content Security Policy](https://nextjs.org/docs/13/pages/building-your-application/configuring/content-security-policy)
- [Next.js poweredByHeader](https://nextjs.org/docs/pages/api-reference/config/next-config-js/poweredByHeader)

## 12. Limitaciones

Esta es una auditoria de codigo y configuracion observable, complementada con pruebas dinamicas no destructivas. No sustituye un pentest autenticado de caja gris, una auditoria SOC 2, una revision legal de privacidad ni una evaluacion independiente de infraestructura. Los hallazgos describen riesgo tecnico reproducible o deuda defensiva; no prueban que haya ocurrido una intrusión.
