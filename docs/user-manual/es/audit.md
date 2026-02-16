# Guía de Auditoría (Historial de Órdenes)

## Qué hace esta auditoría
Esta auditoría usa el **historial de órdenes del broker** (sin AI) para calcular métricas objetivas y determinísticas sobre tu proceso de ejecución.

Se enfoca en:
- Uso de OCO
- Presencia de stop en salidas
- Número de modificaciones de stop
- Actividad de cancelaciones / reemplazos
- Uso de órdenes de mercado al salir
- Tiempo desde el fill de entrada hasta el primer stop

## Por qué la auditoría es importante
La auditoría es tu **capa de verdad de ejecución**. Muestra lo que realmente pasó (stops, OCO, cancelaciones, reemplazos), para que el coaching y la revisión sean factuales y no especulativos.

Si quieres que el AI Coach te dé feedback de calidad, **corre Audit primero** y usa esos resultados en coaching.

## Qué necesitas importar
Debes importar el **“Account Order History” de Thinkorswim** usando la página de Importación existente.

Ese import crea un ledger append-only de eventos, y la auditoría se calcula sobre esos eventos.

## Cómo correr la auditoría
1. Ve a **Back‑Studying → Audit** (tab).
2. Selecciona una **fecha**.
3. (Opcional) escribe un **símbolo** o **instrument key**.
4. Ejecuta la auditoría para ver métricas y evidencia.

## Buena práctica: Audit → AI Coaching
Después de correr la auditoría:
- Abre **AI Coaching** y pregunta por la misma fecha/trade.
- Comparte el resumen o un screenshot de la auditoría para que el coach lo interprete.
- Si preguntas “qué habría pasado”, el coach solo usa **datos reales** y puede pedirte que verifiques el precio del contrato.

## Instrument keys
Para opciones, el formato es:
```
UNDERLYING|YYYY-MM-DD|C|STRIKE
```
Ejemplo:
```
SPX|2026-02-13|C|7000
```
Para acciones o futuros, la key es el símbolo.

## Limitaciones
- **Zona horaria:** el import asume una zona de origen (default: America/New_York). Un tz incorrecto cambia los timestamps.
- **Diferencias por broker:** en MVP solo se soporta Thinkorswim.
- **Datos incompletos:** si el export no incluye stops/reemplazos, la auditoría no puede inferirlos.

## Roadmap (plan)
- Overlay de auditoría en back-study
- Soporte para IBKR / Tradovate / NinjaTrader
- Explicaciones con AI (después de las reglas determinísticas)
