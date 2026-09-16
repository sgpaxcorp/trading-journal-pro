# Option Flows Analysis
## Acceso
- Navegación lateral → Option Flow.

Estado: beta privada. El acceso público está deshabilitado mientras el módulo siga en development y test mode.

Option Flow convierte flujo en un plan premarket. No es un servicio de señales; es un resumen estructurado que validas con tu chart y reglas.

## Flujo estándar
1. Sube data de flujo (CSV/XLSX) o screenshots.
2. Genera el reporte.
3. Revisa resumen, niveles clave y mapa de flujo.
4. Envía el plan al Journal premarket.
5. Option Flow Intelligence agenda automáticamente la validación para las 5:00 PM ET de la próxima sesión.
6. (Opcional) Añade también tu post‑mortem manual y screenshot.

## Aprendizaje automático del próximo día

- Conserva los prints con hora entre 1:00 PM y 4:00 PM ET.
- Detecta la fecha de las filas del CSV. Si el archivo contiene varias sesiones, analiza solamente la fecha seleccionada y evita mezclar días.
- Reconoce `SPXW` como la raíz semanal de `SPX` y conserva `option_chain_id` para identificar cada contrato.
- Busca velas de 5 minutos del underlying para la sesión en que se observó el flow y la próxima sesión bursátil.
- Mide la primera confirmación de 0.25%, los minutos desde la apertura, el máximo movimiento a favor, el máximo movimiento en contra y el resultado al cierre.
- Distingue una confirmación sostenida de una confirmación intradía que luego revirtió.
- Evalúa cada transacción direccional: CALL comprado en ASK, PUT comprado en ASK, CALL vendido en BID y PUT vendido en BID.
- Incorpora las validaciones recientes del mismo underlying como contexto para análisis futuros, sin asumir que el patrón se repetirá.

La validación se refiere al movimiento del underlying. ASK/BID identifica el lado agresor, pero no demuestra si abrió o cerró la posición. No representa el P/L ni la depreciación real de la opción; eso requiere precios históricos del contrato, IV, spread y fills.

## Qué significa cada sección
**Resumen ejecutivo**  
Sesgo y contexto del día en versión resumida.

**Niveles clave**  
Strikes o niveles con actividad relevante.

**Mapa de flujo agresivo (ASK/BID)**  
Dónde compradores o vendedores fueron más agresivos.

**Contratos top**  
Impresiones con mayor premium o peso.

**Matriz de escenarios**  
Rutas posibles y niveles de confirmación.

## Inputs y límites
- Formatos: CSV, XLSX
- Tamaño máx: 12 MB
- Máx filas: 400 sin screenshots, 150 con screenshots
- Máx screenshots: 2

## Mejores prácticas
- Úsalo como filtro, no como gatillo.
- Verifica niveles en tu propio chart.
- Envía el plan al Journal para integrarlo al flujo de ejecución.
