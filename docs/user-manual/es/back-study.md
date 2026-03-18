# Back-Study
## Acceso
- Navegación lateral → `Back-Study`.
- La página tiene dos modos:
  - `Trade review`
  - `Audit workbench`
- `Trade review` está disponible en `Core` y `Advanced`.
- `Audit workbench` está disponible solo en `Advanced`.

## Qué es ahora Back-Study
Back-Study ya no es solo una página de replay visual. Ahora es un workspace de revisión del trade que combina:
1. Replay visual desde las entradas y salidas del journal.
2. Auditoría determinística de ejecución desde el order history importado del broker.
3. Cumplimiento del proceso frente al checklist y las reglas del Growth Plan.
4. Handoff directo al AI Coach con el contexto del trade seleccionado.

## Modo Trade review
### Qué aparece en la página
1. Selector de sesión.
2. Selector de trade para el día seleccionado.
3. Controles de timeframe, rango histórico y modo horario.
4. Charts del subyacente y, cuando exista, del contrato usado.
5. Para `Advanced`, resumen de auditoría de ejecución del trade seleccionado.
6. Para `Advanced`, secuencia del trade basada en eventos del broker.
7. Para `Advanced`, revisión de proceso e insights determinísticos.
8. Para `Advanced`, evidencia cruda de ejecución.

### Cómo funciona
1. Selecciona la fecha de la sesión.
2. Selecciona el trade que quieres revisar.
3. Elige timeframe, rango y modo horario.
4. Carga o refresca el replay.
5. Usa el chart para entender el contexto.
6. Usa el panel de audit para validar la verdad de ejecución.
7. Compara la ejecución con tu proceso.
8. Envía el trade al AI Coach si quieres una lectura de coaching.

### Regla importante
El chart muestra contexto. El audit muestra verdad de ejecución.

Si ambos no coinciden, confía primero en la auditoría del broker.

## Modo Audit workbench
Usa `Audit workbench` cuando quieras un análisis determinístico más amplio por fecha e instrumento, fuera del flujo puntual del replay.

Este modo sirve cuando:
1. Quieres inspeccionar todos los eventos del broker en una fecha.
2. Quieres auditar un instrumento directamente por símbolo o instrument key.
3. Quieres una lectura más amplia del cumplimiento del proceso independiente del replay.

## Qué debes mirar como trader
1. ¿La entrada en el chart coincide con el timing real de ejecución del broker?
2. ¿Usaste OCO correctamente?
3. ¿El stop estuvo presente a tiempo?
4. ¿Saliste manualmente cuando el plan pedía stop o target?
5. ¿Tu checklist y las reglas del Growth Plan coinciden con lo que realmente pasó?

## Mejores prácticas
- Usa `Trade review` después de cada trade importante o al menos semanalmente.
- Usa `Audit workbench` cuando un trade se sienta raro, desordenado o cargado de ejecución.
- Si falta data del contrato, trata esa vista como proxy, no como verdad exacta.
- Usa AI Coach solo después de revisar tanto el replay como el audit.
