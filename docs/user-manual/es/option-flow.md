# Option Flow Intelligence
## Acceso
- Smart Tools -> Option Flow Intelligence.

Estado: beta privada. El acceso está limitado a cuentas autorizadas mientras se valida el módulo.

Option Flow Intelligence es un centro de research persistente organizado por compañía o underlying. No envía un plan al Journal ni emite recomendaciones de trading. Cada ticker conserva su evidencia, análisis, historial de mercado y revisiones por horizonte para comparar el flow nuevo con lo observado anteriormente.

## Flujo estándar
1. Selecciona un ticker o crea el perfil de la compañía.
2. Escoge **Hoy** para la estructura de la misma sesión o **Posicionamiento futuro** para actividad entre expiraciones.
3. Añade evidencia CSV/XLSX, screenshots y contexto opcional del analista. Las fechas incluidas en la evidencia se detectan automáticamente; la fecha de respaldo solo se usa para filas o imágenes sin una fecha verificable.
4. Ejecuta los agentes especializados y revisa la interpretación principal, cambio de tesis, evidencia nueva versus repetida, contradicción, calidad de datos, expiraciones, contratos y manifiesto de fuentes.
5. Regresa al mismo perfil cuando llegue flow nuevo. Cada análisis guarda una versión sin sobrescribir las anteriores.
6. A las 6:00 PM America/New_York de cada día de mercado de EE. UU., el sistema registra el OHLC diario disponible y actualiza tendencia, cambios materiales y revisiones de horizontes vencidos.
7. A las 8:15 AM America/New_York, el sistema reconcilia el nuevo Open Interest consolidado durante la noche cuando existe un proveedor automático comercial configurado.

## Inteligencia de Open Interest
- El OI, precios de contratos, bid/ask, volumen, IV y Greeks importados permanecen atribuidos a la fuente cargada.
- Los snapshots automáticos requieren el proveedor comercial de datos de opciones configurado. Sin este, el módulo indica claramente el modo **solo imports**.
- La fecha de precio y la fecha efectiva del OI se guardan por separado. El OI publicado durante una sesión generalmente representa el conteo consolidado durante la noche anterior.
- El cambio de OI solo se calcula entre sesiones efectivas verificadas distintas o se acepta cuando la fuente lo reporta explícitamente. Dos prints intradía nunca crean un cambio de OI.
- La vista OI muestra OI actual, cambio confirmado, cambio del precio del contrato, volumen/OI, calidad de la fuente y la relación determinística entre precio y OI.
- Una revisión matutina de IA puede clasificar la tesis previa como fortalecida, debilitada, sin cambio o evidencia insuficiente. No puede recomendar un trade.
- Un aumento de OI no revela quién está long o short y no puede demostrar que un print específico abrió una posición.

## Modos de análisis
**Hoy**

Revisa la sesión verificable más reciente dentro de la evidencia, incluyendo concentración, lado agresor, strikes, expiraciones y estructura de la misma sesión. Las fechas anteriores de la carga permanecen guardadas en el perfil.

**Posicionamiento futuro**

Revisa el rango completo de fechas verificables, cómo se distribuye la actividad entre expiraciones y un horizonte de una semana, un mes, tres meses o una fecha personalizada. El horizonte es una ventana de evaluación, no una predicción de precio.

## Qué conserva el perfil
- Análisis versionados para el ticker.
- Fechas de cobertura de la evidencia y cantidad de eventos realmente nuevos y previamente observados.
- Clasificaciones de cambio de tesis: `STRENGTHENED`, `WEAKENED`, `UNCHANGED` o `INSUFFICIENT_EVIDENCE`.
- Manifiesto de fuentes con proveedor, fecha, cantidad de filas y huella SHA-256 cuando esté disponible.
- Eventos de flow normalizados y precios de contratos observados.
- Snapshots inmutables por contrato con fechas separadas para precio y OI efectivo.
- Reconciliaciones matutinas de OI y sus manifiestos de fuentes.
- Historial OHLC diario y cálculos determinísticos de tendencia.
- Revisiones diarias materiales y su interpretación de IA cuando corresponda.
- Checkpoints que comparan evidencia posterior con el análisis original.
- Registros de agente, modelo, trace, uso y errores para auditoría.

## Integridad de datos
- Los datos observados y la interpretación de IA permanecen separados.
- Un dato financiero o de mercado ausente se muestra como `DATA NOT AVAILABLE`; nunca se convierte silenciosamente en cero.
- ASK/BID puede identificar el lado agresor observado, pero no demuestra que una posición abrió o cerró.
- Los precios de contrato cargados son evidencia de la fuente, no el fill ni el costo base del usuario.
- Un target o escenario no es un forecast, una probabilidad ni una instrucción de compra o venta.
- Cada evento normalizado recibe una huella determinística. Volver a cargar el mismo evento o archivo se identifica como repetido y por sí solo no puede fortalecer ni debilitar la tesis.
- El primer análisis establece una línea base y no puede clasificarse como fortalecido o debilitado porque todavía no existe una lectura verificable anterior.
- El sistema no calcula P/L real de opciones sin fills verificados y la data histórica de contratos necesaria.

## Inputs y límites
- Web: CSV, XLSX, PNG, JPEG y WebP.
- Mobile: screenshots desde la librería de fotos.
- Hasta 2,000 filas procesadas por análisis.
- Hasta 4 screenshots por análisis.

## Mejores prácticas
- Mantén un perfil por underlying y añade evidencia al mismo registro con el tiempo.
- Alinea el modo y el horizonte con la pregunta que estás investigando.
- Verifica fechas, ticker, expiraciones y unidades antes de ejecutar los agentes.
- Trata los hallazgos contradictorios y la falta de datos como resultados útiles, no como fallas.
- Usa la revisión diaria para entender qué cambió, no como un gatillo automático de trading.
