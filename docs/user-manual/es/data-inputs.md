# Importacion de datos
Como traer datos a la plataforma.

## Importador de broker (CSV/XLS/XLSX)
Ruta: `/import`
- Sube el archivo exportado desde tu broker.
- Revisa el resumen de importacion y corrige errores.
- Reabre analitica cuando termine la importacion.

## Option Flow uploads
Ruta: `/option-flow`
- Formatos: CSV, XLS, XLSX.
- Tamano maximo: 12 MB.
- Max filas: 400 sin screenshots, 150 con screenshots.
- Max screenshots: 2.

## Columnas recomendadas
Usa nombres comunes para que el parser detecte bien.
- Symbol u option symbol
- Underlying
- Expiration o expiry
- Strike
- Type (Call/Put)
- Side (Bid/Ask)
- Size o quantity
- Premium o notional
- Bid y ask
- Time o timestamp

## Tips de screenshots
- Recorta solo los prints que quieres analizar.
- Usa imagenes claras y con buen contraste.

## FAQ
P: Mi archivo es muy grande.
R: Exporta un rango menor o usa screenshots.

P: No reconoce las columnas.
R: Renombra columnas a terminos comunes como symbol, strike, expiry, side, premium.
