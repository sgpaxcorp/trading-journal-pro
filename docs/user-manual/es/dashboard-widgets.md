# Dashboard y widgets

## Acceso
- Navegación lateral → Dashboard.

El Dashboard responde tres preguntas distintas:
- `¿Cómo va mi cuenta?`
- `¿Cómo voy contra el plan?`
- `¿Qué hice realmente esta semana?`

## Personaliza el layout
- Arrastra los widgets desde la barra superior.
- Ajusta el tamaño para priorizar lo importante.
- El layout se guarda automáticamente.

## Glosario de widgets
**Account Progress**  
Muestra la realidad de la cuenta y del equity.

Qué incluye:
- `Current balance`
- `Net account change`
- `Return on reference`
- `Trading P&L`
- `Net cashflow`
- `High-water mark`

Qué responde:
- `¿Cómo va mi equity real?`

Cómo toma la referencia:
- Si existe Growth Plan, usa el balance inicial del plan como referencia.
- Si no existe Growth Plan, usa el primer punto de equity registrado.

Importante:
- Este widget no evalúa checkpoints semanales, mensuales o trimestrales.
- `Trading P&L` es resultado de trading.
- `Net account change` puede incluir depósitos o retiros si existieron cashflows.

**Plan Progress**  
Compara tu balance actual contra la ruta del Growth Plan.

Qué incluye:
- fase actual
- `Checkpoint start`
- `Balance now`
- `Checkpoint target`
- `Ahead by` o `Remaining`
- fechas objetivo

Qué responde:
- `¿Voy adelantado o atrasado contra el plan?`

Importante:
- `Week / Month / Quarter` aquí no significan “mi P&L realizado de esa semana o mes”.
- Son checkpoints del plan.
- El sistema compara:
  - balance base del checkpoint
  - balance actual
  - balance objetivo del checkpoint

Ejemplo:
- `Week checkpoint start`: `$835.95`
- `Week checkpoint target`: `$855.88`
- `Balance now`: `$1111.83`

Entonces:
- el movimiento requerido desde el inicio del checkpoint era `$19.93`
- tu balance actual está `$255.95` por encima del target del checkpoint
- por eso aparece `Ahead by`, aunque hoy estés rojo

**Weekly Summary**  
Muestra el rendimiento real de la semana actual.

Qué responde:
- `¿Qué hice realmente esta semana?`

Úsalo para:
- validar ritmo operativo real
- ver resultado semanal real
- no confundir performance realizada con progreso contra el plan

**P&L Calendar**  
Vista mensual del P&L diario. Verde = día positivo, azul = pérdida controlada.

**Daily Target**  
Meta diaria vs P&L real cuando existe un target en el Growth Plan.

**Trading Days**  
Progreso del año y días de trading restantes según el plan.

**Green Streak**  
Rachas de días verdes y comparación verde vs azul.

**Checklist / Trading System**  
Checklist de disciplina diaria. Úsalo como filtro antes de operar.

**Mindset Ratio**  
Comparación de sesiones alineadas con reglas vs sesiones con rompimientos.

**Economic News Calendar**  
Eventos macro por país. Úsalo para evitar operar durante volatilidad alta.

## Cómo leer el Dashboard
1. Empieza con `Account Progress` para ver la realidad del equity.
2. Revisa `Plan Progress` para saber si vas adelantado o atrasado contra el Growth Plan.
3. Usa `Weekly Summary` para ver el resultado real de la semana.
4. Escanea `P&L Calendar` y `Daily Target` para validar ritmo corto plazo.

## Tips
- Widgets vacíos suelen indicar sesiones o importaciones faltantes.
- Si `Daily Target` no aparece, revisa los campos del Growth Plan.
- Si `Account Progress` y `Plan Progress` no cuentan la misma historia, no es un bug: están respondiendo preguntas distintas.

## FAQ
P: ¿Por qué la meta semanal aparece completada si hoy estoy negativo?  
R: Porque `Plan Progress` mide tu balance actual contra el checkpoint semanal del plan, no contra el resultado del día.

P: ¿Dónde veo lo que realmente hice esta semana?  
R: En `Weekly Summary`.

P: ¿Dónde veo el estado real de la cuenta?  
R: En `Account Progress`.

P: ¿Por qué el P&L Calendar sale vacío?  
R: Necesitas sesiones guardadas en el mes seleccionado.

P: ¿Puedo ocultar widgets?  
R: Sí. Usa el panel de widgets dentro del dashboard.
