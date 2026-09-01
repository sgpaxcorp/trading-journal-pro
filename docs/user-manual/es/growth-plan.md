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
8. Estructura de cuenta y apalancamiento máximo: cash, margen o derivados apalancados.
9. Costo estimado por sesión y porcentaje de reserva contributiva para crecimiento positivo de trading.
10. El plan operativo final que vas a seguir, incluyendo **Mi plan manual** cuando aplique.

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
6. Configuración de capital empresarial: estructura de cuenta, apalancamiento, aportaciones, retiros y costos operativos.
7. Fricción y reservas de planificación: costos estimados por sesión y reserva contributiva declarada por el usuario.

Luego separa cuatro valores que nunca deben mezclarse: la **proyección compuesta objetivo** requerida para alcanzar el capital y la fecha solicitados, la **proyección bruta de los porcentajes seleccionados** después de componer días de meta y días perdedores, la **proyección operativa neta** después de costos fijos por sesión, y el **balance real de la cuenta** proveniente de la misma serie que usa el Dashboard. Si el crecimiento bruto es positivo pero la proyección neta cae a cero, la plataforma identifica el impacto de costos fijos como la causa; nunca lo presenta como una falla de la fórmula compuesta ni reescribe los checkpoints de la meta.

Si la ejecución documentada no demuestra una ventaja positiva, el motor no asigna una fecha respaldada por ganancias de trading. La próxima fase correcta es validar evidencia y mejorar el proceso, no aumentar el supuesto de retorno. Si las aportaciones programadas por sí solas pueden alcanzar la meta, la plataforma puede mostrar ese horizonte de fondeo, pero mantiene el crecimiento de trading en 0% y el plan en calificación.

El modelo operativo evalúa hasta un horizonte de 50 años para buscar una fecha de cumplimiento defendible. Independientemente, la proyección compuesta objetivo siempre construye las metas semanales, mensuales, trimestrales, semestrales y anuales solicitadas cuando el retorno requerido puede resolverse matemáticamente.

## Laboratorio de escenarios
El plan compara cinco vistas sin mezclar sus propósitos:
1. **Tus datos declarados** muestran exactamente lo que producirían los porcentajes ingresados, incluso si esa combinación tiene expectativa negativa.
2. **Conservador, Moderado y Agresivo** presentan casos operativos controlados por política usando el mismo calendario, costos, flujos de capital y objetivo.
3. **Matemática exacta de meta** calcula el retorno de día-meta necesario para tocar el objetivo solicitado manteniendo la frecuencia y el supuesto declarado de días perdedores.

Cada vista muestra balance determinístico proyectado, matemática anualizada, balances de sensibilidad P10/mediana/P90, una **tasa condicional de llegada**, drawdown máximo mediano y sensibilidad de perder al menos 50% del capital inicial. La tasa condicional supone que continúan los porcentajes y la frecuencia de ganancias/pérdidas ingresados; no es una probabilidad empírica de éxito real. Las rutas con semilla son pruebas de estrés para planificación, no pronósticos, garantías ni asesoría de inversión individualizada. Una meta puede ser matemáticamente posible y aun ser especulativa, estar fuera de la política seleccionada o no estar respaldada por evidencia de ejecución.

## Guardrails de capital empresarial
El Growth Plan siempre clasifica la cuenta como **capital operativo del negocio de trading** y su origen como **ingreso del negocio**. No solicita fondos de emergencia, gastos de vida, fondos de retiro ni otra información de finanzas personales. La estructura de cuenta y el apalancamiento siguen siendo obligatorios porque cambian el riesgo operativo; un apalancamiento mayor de 2x se presenta como advertencia.

Los costos de trading reducen cada sesión modelada. La interfaz presenta el balance compuesto porcentual bruto, el balance neto de costos fijos por sesión y la diferencia acumulada entre ambos. La reserva contributiva se aplica únicamente al crecimiento neto positivo modelado de trading y se presenta por separado; es un estimado de planificación que debe confirmarse con un profesional contributivo cualificado.

## Ruta operativa recomendada por el modelo
Completa los cinco inputs de Business Analysis: perfil de riesgo, experiencia, dependencia de ingresos, tolerancia al drawdown y estilo de trading. El plan presentará una recomendación operativa explícita basada en tu capital inicial y meta empresarial.

La recomendación muestra:
1. El escenario operativo más apropiado para tu perfil.
2. Porcentaje en días de meta, riesgo por trade, pérdida diaria máxima y días de pérdida planificados por semana.
3. Días de trading, semanas operativas, meses y fecha estimada de cumplimiento.
4. Metas compuestas semanales, mensuales, trimestrales, semestrales y anuales con fechas, más el balance real y la variación cuando vence cada checkpoint.
5. Supuestos modelados de retorno semanal, mensual y anual antes de evaluar el plan.

Selecciona **Aplicar recomendación operativa** para usar el escenario elegido por el modelo. Si produce una fecha defendible posterior, **Usar runway operativo** permite cambiar explícitamente el período solicitado. La proyección objetivo nunca se reemplaza silenciosamente con una línea base operativa débil.

Esto es una proyección de planificación, no una promesa de rendimiento. El tiempo real cambia según la ejecución, pérdidas, retiros y condiciones del mercado.

## Supuestos operativos requeridos
La evaluación permanece oculta hasta completar los supuestos operativos. Escoge **Conservador**, **Moderado**, **Agresivo** o **Manual** y confirma:
1. Porcentaje de retorno del día-meta.
2. Porcentaje esperado de un día perdedor.
3. Días de trading y días perdedores esperados por semana.
4. Stop duro de pérdida diaria y riesgo por trade.
5. Si añadirás aportaciones, con frecuencia y monto.
6. Si retirarás capital, con frecuencia y monto.
7. Estructura de la cuenta empresarial y apalancamiento máximo.
8. Costos por sesión y porcentaje de reserva contributiva.
9. El plan operativo final seleccionado para ejecución.

Los modos de política completan automáticamente sus supuestos. El modo manual acepta los porcentajes del usuario y exige seleccionar explícitamente **Mi plan manual** antes de evaluar o guardar. La trayectoria determinística compuesta y la sensibilidad P10/P50/P90 usan el mismo calendario, días perdedores, aportaciones, retiros y costos. La ruta basada en evidencia todavía puede clasificar el plan como provisional o no respaldado; escribir un porcentaje nunca garantiza rendimiento.

Cada ruta separa **crecimiento de trading**, **aportaciones**, **retiros** y **cambio neto del balance**. Una aportación puede ayudar a alcanzar la meta de capital, pero nunca se presenta como ganancia de trading.

## Evaluación del plan basada en evidencia
La evaluación separa métricas que no deben confundirse:
1. **Retorno por sesión en trayectoria perfecta**: tasa compuesta matemática si todas las sesiones comprometidas fueran positivas, aplicando por separado las aportaciones y retiros declarados.
2. **Retorno requerido por la solicitud**: ritmo matemático necesario para alcanzar la meta en la fecha solicitada. Es un diagnóstico, no una meta operativa aprobada.
3. **Ritmo operativo disciplinado**: retorno de día-meta y pérdida esperada en día perdedor que usa la proyección adaptativa según el perfil.
4. **Evidencia de ejecución**: cantidad de sesiones/trades registrados más win rate, profit factor, expectativa y drawdown disponibles.
5. **Flujos de capital**: aportaciones y retiros planificados que cambian el equity sin cambiar el rendimiento de trading.
6. **Proyección operativa bruta versus neta**: primero se componen multiplicativamente los porcentajes de días-meta y días perdedores; luego se descuentan los costos fijos en dólares y se reportan como impacto de costos. Por ejemplo, cuatro días de `+2.5%` y uno de `-2%` producen aproximadamente `+8.17%` en la semana modelada antes de costos fijos. La matemática anualizada usa la cantidad de ciclos comprometidos disponibles en un año del calendario del instrumento seleccionado, para no tratar los feriados del NYSE como sesiones adicionales.

Las políticas predefinidas no permiten que un porcentaje declarado de día-meta eleve su recomendación operativa ni que un supuesto optimista de pérdidas mejore el modelo. Un plan manual seleccionado compone exactamente los porcentajes ingresados, pero una matemática anualizada extrema se identifica como escenario condicional y permanece provisional hasta que la evidencia de ejecución la respalde. La evidencia establecida puede reducir el ritmo modelado; nunca aumenta automáticamente el riesgo.

Selecciona **Hacer evaluación profunda** para que Research AI explique el cálculo verificado con la metodología privada de investigación informada por CFA. El motor determinístico mantiene la autoridad. La IA añade contexto, limitaciones y acciones disciplinadas; no puede cambiar los números, prometer retornos, ofrecer asesoría de inversión individualizada ni recomendar comprar o vender un valor.

## Divulgación obligatoria antes de activar
El Plan de Empresa de Trading es una herramienta educativa de planificación empresarial y disciplina. Sus proyecciones, trayectorias compuestas de metas, tasas condicionales de llegada, checkpoints, simulaciones y explicaciones de IA dependen de los datos y supuestos ingresados por el usuario. No son pronósticos, garantías de ganancias ni asesoría individualizada de inversión, trading, legal, contributiva o contable.

Antes de activar o actualizar un plan, el usuario debe:
1. Evaluar el borrador actual.
2. Revisar la comparación de proyectado versus real, supuestos operativos, costos, flujos de capital y límites de riesgo.
3. Aceptar la divulgación vigente del Plan de Empresa de Trading.

Cambiar cualquier input del borrador en mobile invalida la evaluación y aceptación anteriores. La plataforma guarda la versión de la divulgación, fecha de aceptación, propósito y origen junto al registro de Business Analysis. Aceptar significa comprometerse con el proceso disciplinado, controles de riesgo, registros precisos y revisión periódica; nunca significa comprometerse con un retorno prometido.

## Sincronización con la plataforma
En mobile, usa **Evaluar plan antes de guardar** para revisar los mismos cinco escenarios, validación estadística compuesta, configuración de capital empresarial, costos, reserva contributiva, horizonte, crecimiento de trading, aportaciones y retiros sin modificar el plan activo. Después de **Aprobar y guardar**, las fases guardadas se convierten en la fuente oficial para web, mobile, dashboard, Sistema de Protección Empresarial y AI Coach. `Plan Progress` lee el checkpoint semanal activo mientras la ruta adaptativa conserva metas semanales, mensuales, trimestrales, semestrales y anuales. Mobile nunca cambia silenciosamente una fecha no respaldada; el usuario debe aplicar explícitamente el runway operativo o revisar los supuestos antes de guardar.

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
Estos valores describen lo que exigen matemáticamente la meta y el plazo solicitados. Definen la proyección de checkpoints objetivo, pero no se convierten silenciosamente en el supuesto de retorno operativo seleccionado. Compáralos con la línea base operativa, balance real, variación y evidencia antes de aprobar el plan.

## 10) Cadencia y metas
Qué es: checkpoints semanales de la trayectoria compuesta objetivo dentro de metas mensuales, trimestrales, semestrales y anuales. Cada checkpoint vencido compara meta proyectada, balance real de la cuenta en esa fecha y variación en dólares.
Por qué importa: mueve la atención desde la cifra final distante hacia el próximo período medible del proceso.
Cómo usarlo:
1. Ejecuta contra el **próximo checkpoint mensual**.
2. Usa el checkpoint semanal para detectar desviaciones temprano.
3. Revisa metas trimestrales, semestrales y anuales sin aumentar riesgo para recuperar atraso.

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
