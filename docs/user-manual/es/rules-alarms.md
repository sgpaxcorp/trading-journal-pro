# Rules & Alarms
## Acceso
- Navegación izquierda → `Rules & Alarms` → `Alarms`.

Rules & Alarms es tu consola automática de disciplina. Vigila tus reglas activas, revisa tu día de trading y crea alarmas cuando algo necesita atención.

## Para qué sirve esta página
Usa esta página para:
- ver alarmas activas que requieren acción ahora
- crear alarmas personalizadas para tu proceso
- revisar el historial de alarmas
- auditar posiciones abiertas y opciones que vencen hoy
- probar una regla antes de depender de ella en vivo

Esta página está pensada para **disciplina y control de riesgo**. No es solo una lista de recordatorios.

## Cómo funciona
La plataforma evalúa tus reglas activas y las compara con tu información real del día.

Puede revisar cosas como:
- posiciones abiertas todavía activas
- opciones que vencen hoy
- pérdida máxima diaria alcanzada
- screenshots faltantes
- emociones faltantes
- checklist faltante
- tags de impulso detectados

Si una regla se dispara, la plataforma crea un evento de alarma y lo muestra dentro de esta página y en el flujo de alertas de la app.

## Reglas core vs alarmas personalizadas
Hay dos tipos de reglas:

### Reglas core
Son reglas del sistema que protegen automáticamente lo más importante.

Ejemplos:
- `Open positions detected`
- `Options expiring today`

Las reglas core las administra el sistema para que siempre exista una capa mínima de protección.

### Alarmas personalizadas
Son reglas que tú creas.

Tu límite de alarmas personalizadas depende del plan:
- `Core`: hasta 2 alarmas personalizadas
- `Advanced`: hasta 10 alarmas personalizadas

## Secciones de la página
La página tiene cuatro tabs principales:

### Active
Muestra las alarmas que se están disparando ahora.

Úsala para:
- ver lo que requiere atención inmediata
- posponer una alarma
- descartarla
- revisar el detalle del evento activo

### Rules
Muestra tus reglas activas e inactivas.

Úsala para:
- revisar qué reglas están activas
- crear una alarma personalizada
- editar una regla
- probar una regla

### Audit Trail
Muestra detalles de auditoría relacionados con posiciones, especialmente:
- posiciones abiertas detectadas por el engine
- opciones que vencen hoy
- acciones rápidas para cerrarlas o clasificarlas correctamente

Úsala cuando una alarma esté relacionada con:
- posiciones abiertas
- contratos por vencer
- clasificación swing vs day trade

### History
Muestra alarmas descartadas o pasadas para que puedas revisar qué ocurrió antes.

## Tarjetas de resumen superiores
En la parte superior verás tarjetas como:
- `Active alarms`
- `Snoozed`
- `Rules enabled`
- `Open positions`

Sirven para entender rápido tu estado actual de riesgo y disciplina.

## Run Checks Now
Usa `Run checks now` cuando:
- acabas de guardar el journal
- acabas de sincronizar o importar trades
- quieres ver las alarmas actualizadas de inmediato

Esto fuerza una nueva evaluación de tus reglas activas.

## Cómo crear una alarma personalizada
Ve al tab `Rules` y haz clic en `Add alarm`.

Luego completa:

### 1. Title
Es el nombre corto de la alarma.

Ejemplos buenos:
- `Daily loss stop`
- `Missing screenshots`
- `Open positions after close`

Debe ser corto y claro.

### 2. Message
Es el mensaje de acción que quieres ver cuando la regla se dispare.

Ejemplos buenos:
- `Stop trading and review the day.`
- `Upload screenshots before closing the journal.`
- `Close the remaining position or mark it as swing.`

Escribe la instrucción que te gustaría recibir cuando la disciplina importe.

### 3. Trigger
Elige qué condición va a disparar la alarma.

Los triggers disponibles incluyen:
- `Max daily loss`
- `Open positions detected`
- `Options expiring today`
- `Missing screenshots`
- `Missing emotions`
- `Checklist missing`
- `Impulse tags detected`

### 4. Threshold o minimum open positions
Algunos triggers necesitan un número.

Ejemplos:
- `Max daily loss`: coloca el límite en dólares
- `Open positions detected`: coloca el mínimo de posiciones abiertas para disparar la alarma

Si el trigger no usa número, deja ese campo vacío.

### 5. Severity
Elige el nivel de importancia del evento:
- `Info`
- `Success`
- `Warning`
- `Critical`

Recomendación:
- usa `Warning` o `Critical` para alarmas reales de riesgo
- usa `Info` para recordatorios más suaves

### 6. Channels
Elige dónde debe aparecer el evento.

Opciones típicas:
- `Popup`
- `In-app`
- `Voice`

Recomendación:
- deja `In-app` activo
- usa `Popup` para alarmas urgentes

### 7. Save
Haz clic en `Create alarm`.

La regla se añadirá a tu lista y comenzará a evaluarse automáticamente si está activada.

## Cómo probar una regla
En el tab `Rules`, haz clic en `Test` sobre la regla.

Esto crea un evento de prueba separado para que puedas verificar:
- que la alarma aparece correctamente
- que el mensaje se lee bien
- que la severidad se siente correcta

Prueba una regla antes de depender de ella en vivo.

## Cómo manejar una alarma activa
Dentro del tab `Active` o del panel de detalle puedes:

### Snooze
Úsalo cuando:
- la condición sigue existiendo
- pero no necesitas verla por un periodo corto

Opciones comunes:
- `10m`
- `1h`
- `24h`

### Dismiss
Úsalo cuando:
- ya atendiste el problema
- o la alarma ya no necesita atención

Las alarmas descartadas pasan al historial.

## Cómo usar el Audit Trail
Usa `Audit Trail` cuando el engine detecta:
- posiciones abiertas
- opciones que vencen hoy

Esta sección te ayuda a revisar:
- qué símbolo sigue abierto
- cantidad
- tipo de contrato
- vencimiento
- si vino de trades, journal o notes

Úsala para:
- cerrar una posición restante
- decidir si debe marcarse como swing
- manejar estrategias de prima que vencen en cero

## Mejores prácticas
- Mantén solo las reglas que realmente importan. Demasiadas alarmas crean ruido.
- Usa mensajes directos para que la acción sea obvia.
- Prueba una regla después de crearla.
- Ejecuta checks después de importar, sincronizar o hacer cambios grandes en el journal.
- Revisa el historial semanalmente para detectar alarmas repetidas.

## Configuración inicial recomendada
Si vas comenzando, activa o crea primero:
- `Open positions detected`
- `Options expiring today`
- `Max daily loss`
- `Missing screenshots`
- `Missing emotions`

Eso te da una primera capa sólida de disciplina.

## Nota importante
Rules & Alarms está diseñado para proteger:
- riesgo
- proceso
- higiene del journal

No reemplaza tu criterio. Es tu asistente automático de disciplina.
