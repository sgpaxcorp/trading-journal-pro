# AGENTS.md

## Objetivo del producto
Construir un "Options Flow Forecast Agent" que:
1) Ingiere options flow del día anterior desde CSV o screenshot.
2) Ingiere screenshot del chart premarket (8:30–9:00 AM US/Eastern).
3) Estructura los datos, calcula features, corre un modelo estadístico y genera un reporte
   probabilístico (escenarios + niveles + validación/invalidation).
4) Guarda inputs/outputs/outcomes para evaluación y mejora continua.

## Reglas de salida
- El backend DEBE devolver JSON válido (schema definido en /contracts).
- El sistema NUNCA debe prometer precisión (no afirmar 80–95% como garantía).
- Si falta información, devolver "needs_more_data" y explicar qué falta.
- Separar: (a) datos observados, (b) inferencias, (c) pronóstico.

## Stack objetivo (editable si falta algo)
- Backend: Python 3.11+, FastAPI, Pydantic, PostgreSQL
- ML: scikit-learn (baseline), joblib, pandas
- Storage de archivos: local (MVP) + interfaz para S3
- Frontend (MVP): Next.js/React con pantalla de upload + resultados

## Calidad
- Type hints, linting, tests (pytest) para parsing/features.
- Validación de schema fuerte.
- Logging estructurado (json logs).
- Un directorio /evals con scripts para backtesting y métricas.

## Seguridad y compliance
- No dar "financial advice". Incluir disclaimer visible.
- No ejecutar órdenes ni conectarse a broker en el MVP.
