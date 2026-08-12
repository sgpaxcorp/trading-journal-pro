# Growth Plan (paso por paso)

## Acceso
- Navegación lateral → Growth Plan.

El Growth Plan es el centro de control de la plataforma. Define tu ritmo, límites de riesgo y fecha objetivo. Todos los widgets de progreso se calculan a partir de este plan.

## Antes de comenzar
Ten listos estos datos:
1. Tu balance real hoy.
2. Tu balance objetivo (equity total, no solo ganancia).
3. El runway que quieres evaluar (días, semanas, meses o años).
4. El instrumento principal que operas: acciones/ETFs, opciones listadas, futuros, forex, crypto u otro mercado.

## Modo del plan (Automático)
El plan es siempre automático y basado en runway. El sistema calcula la fecha objetivo desde la fecha inicial y el runway seleccionado; luego aplica el calendario del instrumento para calcular sesiones disponibles, días comprometidos, ritmo y checkpoints.

Acciones/ETFs y opciones listadas en EE. UU. usan el calendario de feriados de las bolsas estadounidenses. Crypto puede usar siete sesiones por semana. Futuros y `Otro` usan estimados de planificación porque las sesiones exactas dependen del contrato y mercado; verifica el calendario del contrato antes de depender de la fecha.

## Ruta operativa recomendada por el modelo
Completa los cinco inputs de Business Analysis: perfil de riesgo, experiencia, dependencia de ingresos, tolerancia al drawdown y estilo de trading. El plan presentará una recomendación operativa explícita basada en tu capital inicial y meta empresarial.

La recomendación muestra:
1. El escenario operativo más apropiado para tu perfil.
2. Porcentaje en días de meta, riesgo por trade, pérdida diaria máxima y días de pérdida planificados por semana.
3. Días de trading, semanas operativas, meses y fecha estimada de cumplimiento.
4. Metas de capital, porcentajes, fechas y períodos de ejecución para cada fase.

Selecciona **Aplicar recomendación operativa** para colocar en el plan el escenario, los porcentajes y la fecha objetivo calculada. El porcentaje se mantiene constante durante las fases para que el crecimiento proyectado venga del compounding y no de aumentar automáticamente el riesgo.

Esto es una proyección de planificación, no una promesa de rendimiento. El tiempo real cambia según la ejecución, pérdidas, retiros y condiciones del mercado.

## Evaluación del plan basada en evidencia
La evaluación separa métricas que no deben confundirse:
1. **Retorno por sesión en trayectoria perfecta**: tasa compuesta matemática si todas las sesiones comprometidas fueran positivas y no hubiera retiros.
2. **Retorno requerido en días de meta**: promedio requerido solo en días de meta después de aplicar días de pérdida, pérdida máxima y retiros.
3. **Cobertura del modelo operativo**: cuánto del ritmo requerido cubre el escenario seleccionado.
4. **Evidencia de ejecución**: cantidad de sesiones/trades registrados más win rate, profit factor, expectativa y drawdown disponibles.

Un plan puede estar definido matemáticamente sin estar sostenido por el modelo operativo o el historial de ejecución. La plataforma identifica esas condiciones por separado en vez de presentar una fórmula de retorno como promesa de viabilidad.

Selecciona **Hacer evaluación profunda** para que Research AI explique el cálculo verificado con la metodología privada de investigación. El motor determinístico mantiene la autoridad; la IA no puede cambiar los números, prometer retornos ni recomendar comprar o vender un valor.

## Sincronización con la plataforma
Después de **Aprobar y guardar**, las fases semanales guardadas se convierten en la fuente oficial de checkpoints para web y mobile. `Plan Progress` usa esas mismas fases para calcular los checkpoints de Semana, Mes y Trimestre, mientras el Sistema de Protección Empresarial recibe los límites de meta diaria y pérdida máxima del plan. Editar el plan desde mobile conserva el perfil de Business Analysis, runway, calendario del instrumento y escenario operativo, y regenera el mismo calendario oficial de checkpoints.

## 1) Balance inicial
Qué es: tu equity actual en el broker.  
Por qué importa: todo el riesgo y el ritmo se calculan desde aquí.  
Cómo llenarlo: edita **Capital inicial** directamente en `Meta y números → Análisis empresarial → Perfil de política de capital`. Usa el número real con el que operarás hoy.

## 2) Balance objetivo
Qué es: el equity total que quieres alcanzar en la fecha objetivo.  
Por qué importa: define el crecimiento requerido.  
Cómo llenarlo: edita **Meta empresarial** al lado de Capital inicial. Define una meta significativa y revisa el período recomendado por IA antes de guardar.

## 3) Runway y fecha objetivo
Qué es: el período que quieres evaluar en días, semanas, meses o años.
Por qué importa: desde ahí se calculan la fecha objetivo, sesiones, días comprometidos y ritmo de checkpoints.
Cómo llenarlo: escoge primero el período; la fecha objetivo es de solo lectura y se recalcula desde la fecha inicial.

## 4) Calendario del instrumento y días de trading
Qué es: cuántos días vas a operar entre hoy y la fecha objetivo.  
Cómo se calcula: automático usando el calendario del instrumento y tus días operativos promedio por semana.
Cuándo editarlo: ajusta los días promedio si deliberadamente operarás menos sesiones que las disponibles. Futuros y `Otro` permanecen como estimados hasta verificar el calendario del mercado/contrato.

## 5) Pérdida diaria máxima (%)
Qué es: tu freno de seguridad diario. Si lo alcanzas, paras de operar ese día.  
Por qué importa: evita que una sesión arruine el plan.  
Cómo llenarlo: un % realista que puedas respetar bajo presión.

## 6) Días de pérdida por semana
Qué es: cuántos días negativos esperas por cada 5 días de trading.  
Por qué importa: se usa para calcular el **% requerido en días de meta**.  
Cómo llenarlo: sé honesto con tu histórico.

## 7) Riesgo por trade (%)
Qué es: el riesgo máximo por operación, como % del equity.  
Por qué importa: mantiene el sizing consistente y protege el plan.  
Cómo llenarlo: un número que realmente seguirás.

## 8) % de trayectoria perfecta y % requerido en días de meta
Qué son: el % de trayectoria perfecta aplica a cada sesión comprometida sin pérdidas modeladas; el % requerido en días de meta aplica solo a **días de meta** después de considerar pérdidas y retiros.
Por qué importa: traduce el plan a un ritmo operativo requerido.
Cómo usarlo: lee siempre ambos valores y sus supuestos. Usa el resultado de día-meta como benchmark operativo, no como garantía diaria ni pronóstico de retorno.

## 9) Cadencia y metas
Qué es: checkpoints semanales alineados a metas mensuales, basados en días de trading.  
Por qué importa: evita pensar “me falta demasiado” y te da el próximo objetivo claro.  
Cómo usarlo:
1. Enfócate en el **primer checkpoint**.
2. Divide el mes en metas semanales.
3. Usa el resumen trimestral para validar el ritmo general.

Nota importante:
- En el Dashboard, `Account Progress` y `Plan Progress` no significan lo mismo.
- `Account Progress` muestra la realidad del equity de la cuenta.
- `Plan Progress` mide Week / Month / Quarter contra el **balance base** y el **balance objetivo** de cada checkpoint del plan.
- Por eso puedes ver una semana “adelantada” o “completada” aunque hoy estés en rojo, si tu balance actual sigue por encima del target de ese checkpoint.
- Para ver lo que realmente hiciste esta semana, usa `Weekly Summary`.

## PDF del plan
Usa “Download PDF” para guardar una versión de referencia del plan.

## Mejor práctica
Actualiza el plan solo cuando cambie tu realidad (capital, horario, tolerancia al riesgo). No lo modifiques por un día rojo.
