# Datos e importaciones

## Acceso
- Navegación lateral → Imports.

Datos limpios = analítica precisa. Tienes dos caminos: **Broker Sync (SnapTrade)** o **CSV**.

## 1) Broker Sync (SnapTrade)
Mejor opción si tu broker está soportado.
1. Abre Imports y elige **Broker Sync**.
2. Conecta tu broker y completa el login en SnapTrade.
3. Refresca cuentas y selecciona la cuenta.
4. Importa actividad y confirma en el historial.

Tip: revisa la tabla de “Brokers soportados” antes de comprar Broker Sync.

## 2) Importación CSV / XLS / XLSX
Ideal cuando tu broker no está soportado por SnapTrade.
1. Elige el **Broker** y (opcional) agrega un **Comentario**.
2. Sube el archivo sin editar.
3. Presiona **Importar** y revisa el historial.

### Campos del import (qué significa cada uno)
**Broker**: formato del broker para parsear.  
**Comentario**: nota corta guardada con el lote.  
**Zona horaria (solo ToS)**: usada en Order History de Thinkorswim.  
**Archivo**: export oficial del broker.

### Historial de importación (cómo leerlo)
**Importadas**: filas nuevas.  
**Actualizadas**: filas existentes actualizadas.  
**Duplicadas**: filas detectadas y omitidas.  
**Listo para auditoría**: aparece si hay Order History.

## Buenas prácticas de CSV
Usa nombres comunes de columnas:
- Symbol / option symbol
- Underlying
- Expiration / expiry
- Strike
- Type (Call/Put)
- Side (Buy/Sell o Bid/Ask)
- Quantity
- Premium / notional
- Time / timestamp

## Subidas de Option Flow
Usa Option Flow para reportes de flujo.
- Formatos: CSV, XLS, XLSX
- Tamaño máx: 12 MB
- Máx filas: 400 sin screenshots, 150 con screenshots
- Máx screenshots: 2

## Tips de screenshots
- Recorta solo las prints relevantes.
- Usa imágenes claras y de alto contraste.

## FAQ
P: Mi archivo es muy grande.  
R: Exporta un rango menor o usa screenshots.

P: El parser no reconoció columnas.  
R: Renombra a términos estándar (symbol, strike, expiry, side, premium).
