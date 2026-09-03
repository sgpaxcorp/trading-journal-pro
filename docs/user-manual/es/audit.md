# Guía de Auditoría (Historial de Órdenes)

## Acceso
- Navegación lateral → Back‑Study → Auditoría.

## Qué hace esta auditoría
Esta auditoría usa el **historial de órdenes del broker** para mostrar verificaciones objetivas sobre tu proceso de ejecución. Estas verificaciones provienen de los eventos importados y no de una interpretación de inteligencia artificial.

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

La plataforma conserva los eventos importados y calcula la auditoría a partir de ellos.

## Cómo correr la auditoría
1. Ve a **Back‑Studying → Audit** (tab).
2. Selecciona una **fecha**.
3. Si deseas filtrar, escribe un **símbolo** o selecciona el identificador completo de la opción que muestra la plataforma.
4. Ejecuta la auditoría para ver métricas y evidencia.

## Buena práctica: Audit → AI Coaching
Después de correr la auditoría:
- Abre **AI Coaching** y pregunta por la misma fecha/trade.
- Comparte el resumen o un screenshot de la auditoría para que el coach lo interprete.
- Si preguntas “qué habría pasado”, el coach solo usa **datos reales** y puede pedirte que verifiques el precio del contrato.

## Cómo identificar el instrumento
Para acciones o futuros, escribe el símbolo. Para opciones, selecciona o escribe el activo principal, la fecha de expiración, Call o Put y el precio de ejercicio según aparecen en la página. Por ejemplo: SPX, 13 de febrero de 2026, Call, precio de ejercicio 7000.

## Limitaciones
- **Zona horaria:** confirma que la importación use la zona horaria de Nueva York. Una zona incorrecta puede cambiar la hora de las órdenes.
- **Diferencias por broker:** actualmente esta página admite el historial de Thinkorswim.
- **Datos incompletos:** si el export no incluye stops/reemplazos, la auditoría no puede inferirlos.
