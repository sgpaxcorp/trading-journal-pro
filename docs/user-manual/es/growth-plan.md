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
5. El modelo de retorno que quieres evaluar: conservador, moderado, agresivo o manual.
6. Días de trading y días perdedores esperados por semana, incluyendo el porcentaje típico de un día perdedor.
7. Aportaciones o retiros recurrentes, incluyendo monto, frecuencia y período inicial.
8. El origen del capital inicial, cobertura del fondo de emergencia, gastos esenciales mensuales y reservas líquidas fuera de trading.
9. Estructura de cuenta y apalancamiento máximo: cash, margen o derivados apalancados.
10. Costo estimado por sesión y porcentaje de reserva contributiva para crecimiento positivo de trading.

## Modo del plan (Automático)
El plan es siempre automático y basado en runway. El sistema calcula la fecha objetivo desde la fecha inicial y el runway seleccionado; luego aplica el calendario del instrumento para calcular sesiones disponibles, días comprometidos, ritmo y checkpoints.

Acciones/ETFs y opciones listadas en EE. UU. usan el calendario de feriados de las bolsas estadounidenses. Crypto puede usar siete sesiones por semana. Futuros y `Otro` usan estimados de planificación porque las sesiones exactas dependen del contrato y mercado; verifica el calendario del contrato antes de depender de la fecha.

## Meta solicitada vs. horizonte operativo disciplinado
Puedes ingresar cualquier capital inicial, capital objetivo y runway solicitado. La plataforma no asume que el plazo solicitado sea viable ni convierte un input agresivo en un supuesto de retorno aprobado.

El motor adaptativo evalúa:
1. Las sesiones exactas disponibles según el instrumento seleccionado.
2. Tus días operativos y días perdedores esperados por semana.
3. Retorno en día-meta, resultado esperado en día perdedor, límite duro de pérdida diaria y riesgo por trade.
4. Aportaciones y retiros planificados. Se modelan como flujos de capital, nunca como rendimiento de trading.
5. Evidencia real de ejecución: sesiones, trades, resultado neto promedio por sesión, profit factor, expectativa y drawdown.
6. Capacidad financiera: origen del capital, reservas de emergencia, gastos esenciales, estructura de cuenta y apalancamiento.
7. Fricción y reservas de planificación: costos estimados por sesión y reserva contributiva declarada por el usuario.

Luego presenta el capital proyectado para la fecha solicitada, cobertura del plazo, déficit y una fecha disciplinada estimada de cumplimiento. Si el plazo solicitado no está respaldado, selecciona **Usar runway recomendado** antes de activar el plan. Los checkpoints oficiales de web y mobile usarán el horizonte disciplinado aceptado, no el plazo no respaldado.

Si la ejecución documentada no demuestra una ventaja positiva, el motor no asigna una fecha respaldada por ganancias de trading. La próxima fase correcta es validar evidencia y mejorar el proceso, no aumentar el supuesto de retorno. Si las aportaciones programadas por sí solas pueden alcanzar la meta, la plataforma puede mostrar ese horizonte de fondeo, pero mantiene el crecimiento de trading en 0% y el plan en calificación.

La ruta determinística evalúa hasta un horizonte de planificación de 50 años. Una meta fuera de ese límite no puede activarse como calendario oficial de checkpoints.

## Laboratorio de escenarios
El plan compara cinco vistas sin mezclar sus propósitos:
1. **Tus datos declarados** muestran exactamente lo que producirían los porcentajes ingresados, incluso si esa combinación tiene expectativa negativa.
2. **Conservador, Moderado y Agresivo** presentan casos operativos controlados por política usando el mismo calendario, costos, flujos de capital y objetivo.
3. **Matemática exacta de meta** calcula el retorno de día-meta necesario para tocar el objetivo solicitado manteniendo la frecuencia y el supuesto declarado de días perdedores.

Cada vista muestra balance determinístico proyectado, matemática anualizada, balances de sensibilidad P10/mediana/P90, sensibilidad de alcanzar la meta, drawdown máximo mediano y sensibilidad de perder al menos 50% del capital inicial. Las rutas con semilla son pruebas de estrés para planificación, no pronósticos, garantías ni asesoría de inversión individualizada. Una meta puede ser matemáticamente posible y aun ser especulativa, estar fuera de la política seleccionada o no estar respaldada por evidencia de ejecución.

## Guardrails de capacidad financiera
El plan puede evaluar cualquier origen de capital declarado, pero no puede activarse con dinero prestado, fondos de retiro, fondo de emergencia o dinero requerido para gastos de vida. Reservas menores de tres meses y apalancamiento mayor de 2x se presentan como advertencias. Estas reglas evitan confundir capital esencial con capital de riesgo.

Los costos de trading reducen cada sesión modelada. La reserva contributiva se aplica únicamente al crecimiento positivo modelado de trading y se presenta por separado; es un estimado de planificación que debe confirmarse con un profesional contributivo cualificado.

## Ruta operativa recomendada por el modelo
Completa los cinco inputs de Business Analysis: perfil de riesgo, experiencia, dependencia de ingresos, tolerancia al drawdown y estilo de trading. El plan presentará una recomendación operativa explícita basada en tu capital inicial y meta empresarial.

La recomendación muestra:
1. El escenario operativo más apropiado para tu perfil.
2. Porcentaje en días de meta, riesgo por trade, pérdida diaria máxima y días de pérdida planificados por semana.
3. Días de trading, semanas operativas, meses y fecha estimada de cumplimiento.
4. Metas mensuales, trimestrales y anuales con fechas y períodos de ejecución.
5. Supuestos modelados de retorno semanal, mensual y anual antes de evaluar el plan.

Selecciona **Aplicar recomendación operativa** para usar el escenario elegido por el modelo. Si el plazo solicitado no está respaldado, usa **Usar runway recomendado** para recalcular los checkpoints oficiales. El porcentaje se mantiene constante durante las fases para que el crecimiento proyectado venga del compounding y no de aumentar automáticamente el riesgo.

Esto es una proyección de planificación, no una promesa de rendimiento. El tiempo real cambia según la ejecución, pérdidas, retiros y condiciones del mercado.

## Supuestos operativos requeridos
La evaluación permanece oculta hasta completar los supuestos operativos. Escoge **Conservador**, **Moderado**, **Agresivo** o **Manual** y confirma:
1. Porcentaje de retorno del día-meta.
2. Porcentaje esperado de un día perdedor.
3. Días de trading y días perdedores esperados por semana.
4. Stop duro de pérdida diaria y riesgo por trade.
5. Si añadirás aportaciones, con frecuencia y monto.
6. Si retirarás capital, con frecuencia y monto.
7. Capacidad financiera, origen del capital, estructura de cuenta y apalancamiento.
8. Costos por sesión y porcentaje de reserva contributiva.

Los modos de política completan automáticamente sus supuestos. El modo manual acepta los porcentajes del usuario, pero el motor adaptativo todavía los evalúa contra los guardrails del perfil y la ejecución documentada. Escribir un porcentaje mayor no hace que el sistema apruebe un ritmo más rápido.

Cada ruta separa **crecimiento de trading**, **aportaciones**, **retiros** y **cambio neto del balance**. Una aportación puede ayudar a alcanzar la meta de capital, pero nunca se presenta como ganancia de trading.

## Evaluación del plan basada en evidencia
La evaluación separa métricas que no deben confundirse:
1. **Retorno por sesión en trayectoria perfecta**: tasa compuesta matemática si todas las sesiones comprometidas fueran positivas, aplicando por separado las aportaciones y retiros declarados.
2. **Retorno requerido por la solicitud**: ritmo matemático necesario para alcanzar la meta en la fecha solicitada. Es un diagnóstico, no una meta operativa aprobada.
3. **Ritmo operativo disciplinado**: retorno de día-meta y pérdida esperada en día perdedor que usa la proyección adaptativa según el perfil.
4. **Evidencia de ejecución**: cantidad de sesiones/trades registrados más win rate, profit factor, expectativa y drawdown disponibles.
5. **Flujos de capital**: aportaciones y retiros planificados que cambian el equity sin cambiar el rendimiento de trading.

Un porcentaje declarado de día-meta no puede elevar la recomendación sobre la política seleccionada, y un supuesto optimista de pérdidas no puede mejorar el modelo sin evidencia. La evidencia establecida puede reducir el ritmo recomendado; nunca aumenta automáticamente el riesgo.

Selecciona **Hacer evaluación profunda** para que Research AI explique el cálculo verificado con la metodología privada de investigación informada por CFA. El motor determinístico mantiene la autoridad. La IA añade contexto, limitaciones y acciones disciplinadas; no puede cambiar los números, prometer retornos, ofrecer asesoría de inversión individualizada ni recomendar comprar o vender un valor.

## Sincronización con la plataforma
En mobile, usa **Evaluar plan antes de guardar** para revisar los mismos cinco escenarios, guardrails de capacidad, costos, reserva contributiva, horizonte, crecimiento de trading, aportaciones y retiros sin modificar el plan activo. Después de **Aprobar y guardar**, las fases guardadas se convierten en la fuente oficial para web, mobile, dashboard, Sistema de Protección Empresarial y AI Coach. `Plan Progress` lee el checkpoint semanal activo mientras la ruta adaptativa conserva metas mensuales, trimestrales y anuales. En su primer guardado, mobile activa automáticamente el horizonte disciplinado si encuentra que el plazo solicitado no está respaldado.

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

Es un guardrail duro, no la pérdida asumida para cada día perdedor modelado.

## 6) Modelo de día-meta y pérdida esperada
**Modelo de día-meta** es el supuesto disciplinado para sesiones positivas modeladas. **Pérdida esperada** es el resultado de planificación para una sesión perdedora típica. La plataforma evalúa tus valores declarados contra la política del perfil y no permite que un input más agresivo acelere la recomendación.

## 7) Días de pérdida por semana
Qué es: cuántos días negativos esperas por cada 5 días de trading.  
Por qué importa: se usa para calcular el **% requerido en días de meta**.  
Cómo llenarlo: sé honesto con tu histórico.

## 8) Riesgo por trade (%)
Qué es: el riesgo máximo por operación, como % del equity.  
Por qué importa: mantiene el sizing consistente y protege el plan.  
Cómo llenarlo: un número que realmente seguirás.

## 9) % de trayectoria perfecta y ritmo requerido por la solicitud
Estos valores describen lo que exigen matemáticamente la meta y el plazo solicitados. No se convierten en la meta diaria guardada. Compáralos con la recomendación adaptativa, capital proyectado, cobertura del plazo y horizonte recomendado.

## 10) Cadencia y metas
Qué es: checkpoints semanales de ejecución dentro de metas mensuales, trimestrales y anuales de capital.
Por qué importa: mueve la atención desde la cifra final distante hacia el próximo período medible del proceso.
Cómo usarlo:
1. Ejecuta contra el **próximo checkpoint mensual**.
2. Usa el checkpoint semanal para detectar desviaciones temprano.
3. Revisa metas trimestrales y anuales sin aumentar riesgo para recuperar atraso.

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
