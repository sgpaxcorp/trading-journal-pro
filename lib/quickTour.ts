export type QuickTourLocalizer = (en: string, es: string) => string;

export type QuickTourStep = {
  id: string;
  title: string;
  body: string;
  selector?: string | null;
  anchor?: string | null;
};

export type QuickTourContext = {
  key: string;
  title: string;
  summary: string;
  bullets: string[];
  guideHref: string;
  steps: QuickTourStep[];
};

type QuickTourBuilder = {
  key: string;
  guideHref: string;
  match: (path: string) => boolean;
  build: (L: QuickTourLocalizer, path: string) => Omit<QuickTourContext, "key" | "guideHref">;
};

export const QUICK_TOUR_OPEN_EVENT = "ntj_quick_tour_open";
export const QUICK_TOUR_FORCE_KEY = "ntj_quick_tour_force";
export const QUICK_TOUR_SEEN_VERSION = 1;
export const QUICK_TOUR_USER_METADATA_KEY = `operating_tour_seen_v${QUICK_TOUR_SEEN_VERSION}`;

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

const BUILDERS: QuickTourBuilder[] = [
  {
    key: "dashboard",
    guideHref: "/help/dashboard-widgets",
    match: (path) => path.startsWith("/dashboard"),
    build: (L) => ({
      title: L("Trader Entrepreneur Business Center", "Centro Empresarial del Trader Entrepreneur"),
      summary: L(
        "This is the first operating view of the business. Start here to see plan status, real account progress, execution quality, and the next action the business needs.",
        "Esta es la primera vista operativa del negocio. Empieza aquí para ver estado del plan, progreso real de la cuenta, calidad de ejecución y la próxima acción que necesita la empresa."
      ),
      bullets: [
        L("The Business Plan defines what should happen; the dashboard shows what is actually happening.", "El Plan Empresarial define lo que debe pasar; el dashboard muestra lo que realmente está pasando."),
        L("Read progress, risk, execution records, and milestones as one operating loop.", "Lee progreso, riesgo, registros de ejecución e hitos como un solo ciclo operativo."),
        L("Your first job after signup is to complete the plan, connect/import data, and let the dashboard become objective.", "Tu primer trabajo después del registro es completar el plan, conectar/importar data y dejar que el dashboard se vuelva objetivo."),
      ],
      steps: [
        {
          id: "dashboard-brand",
          title: L("Your operating system", "Tu sistema operativo"),
          body: L(
            "The brand link always brings you back to the Business Center. Treat this screen as the home base for running the trading business, not as a decorative dashboard.",
            "El logo siempre te trae de vuelta al Centro Empresarial. Trata esta pantalla como la base para operar la empresa de trading, no como un dashboard decorativo."
          ),
          selector: '[data-tour="nav-brand"]',
        },
        {
          id: "dashboard-plan-entry",
          title: L("Build the business plan first", "Primero construye el plan empresarial"),
          body: L(
            "This is the first action for a new Trader Entrepreneur. Define capital, target, dates, risk limits, rules, and the operating commitment before judging results.",
            "Esta es la primera acción para un Trader Entrepreneur nuevo. Define capital, meta, fechas, límites de riesgo, reglas y compromiso operativo antes de juzgar resultados."
          ),
          selector: '[data-tour="dash-edit-growth-plan"]',
        },
        {
          id: "dashboard-milestones",
          title: L("Business milestones", "Hitos empresariales"),
          body: L(
            "Milestones show whether the business has the minimum operating structure in place: plan, rules, analysis, risk controls, journal habits, review loop, and accountability.",
            "Los hitos muestran si la empresa tiene la estructura operativa mínima: plan, reglas, análisis, controles de riesgo, hábito de journal, ciclo de revisión y accountability."
          ),
          selector: '[data-tour="dash-business-milestones"]',
        },
        {
          id: "dashboard-account",
          title: L("Real account progress", "Progreso real de la cuenta"),
          body: L(
            "This widget answers the money question objectively: current balance, net change, trading P&L, cashflows, and whether growth is coming from execution or deposits.",
            "Este widget responde la pregunta del dinero objetivamente: balance actual, cambio neto, trading P&L, cashflows y si el crecimiento viene de ejecución o depósitos."
          ),
          selector: '[data-tour="dash-widget-progress"]',
        },
        {
          id: "dashboard-plan",
          title: L("Plan progress", "Progreso contra el plan"),
          body: L(
            "This compares the live account against the plan checkpoints. It tells you if the business is ahead, behind, or on pace without confusing projections with realized P&L.",
            "Esto compara la cuenta viva contra los checkpoints del plan. Te dice si la empresa va adelantada, atrasada o en ritmo sin confundir proyecciones con P&L realizado."
          ),
          selector: '[data-tour="dash-widget-plan-progress"]',
        },
        {
          id: "dashboard-weekly",
          title: L("Weekly execution summary", "Resumen semanal de ejecución"),
          body: L(
            "Use this to review the current operating week. Before changing strategy, verify sample size, rule adherence, risk behavior, and whether the week is actually complete.",
            "Usa esto para revisar la semana operativa actual. Antes de cambiar estrategia, verifica muestra, cumplimiento de reglas, conducta de riesgo y si la semana realmente está completa."
          ),
          selector: '[data-tour="dash-widget-weekly"]',
        },
        {
          id: "dashboard-calendar",
          title: L("Daily P&L audit", "Auditoría diaria de P&L"),
          body: L(
            "The calendar turns the month into an audit trail. Use it to connect any result back to the execution record, not to celebrate or punish one isolated day.",
            "El calendario convierte el mes en una pista de auditoría. Úsalo para conectar cualquier resultado con el registro de ejecución, no para celebrar o castigar un día aislado."
          ),
          selector: '[data-tour="dash-widget-calendar"]',
        },
        {
          id: "dashboard-performance-nav",
          title: L("Performance diagnostics", "Diagnóstico de performance"),
          body: L(
            "Performance is where the business diagnoses edge quality, risk behavior, statistics, balance history, plan variance, and coaching opportunities.",
            "Performance es donde la empresa diagnostica calidad del edge, conducta de riesgo, estadísticas, historial de balance, variación contra el plan y oportunidades de coaching."
          ),
          selector: '[data-tour="nav-performance"]',
        },
        {
          id: "dashboard-playbook-nav",
          title: L("Playbook and evidence", "Playbook y evidencia"),
          body: L(
            "Notebook keeps repeatable standards. Back-Study validates decisions against chart evidence. Together they convert experience into operating knowledge.",
            "Notebook guarda estándares repetibles. Back-Study valida decisiones contra evidencia del chart. Juntos convierten experiencia en conocimiento operativo."
          ),
          selector: '[data-tour="nav-notebook"]',
        },
        {
          id: "dashboard-protection-nav",
          title: L("Protect the business", "Protege la empresa"),
          body: L(
            "Rules and alarms convert the plan into guardrails. Use them for loss limits, routines, reminders, and the behavior checks that protect the account.",
            "Reglas y alarmas convierten el plan en barandas. Úsalas para límites de pérdida, rutinas, recordatorios y chequeos de conducta que protegen la cuenta."
          ),
          selector: '[data-tour="nav-rules"]',
        },
      ],
    }),
  },
  {
    key: "growth-plan",
    guideHref: "/help/growth-plan",
    match: (path) => path.startsWith("/growth-plan"),
    build: (L) => ({
      title: L("Trading Business Plan", "Plan Empresarial de Trading"),
      summary: L(
        "This is the operating contract of the trading business. It defines capital, destination, pacing, risk governance, strategy rules, and the standards the rest of the platform audits.",
        "Este es el contrato operativo de la empresa de trading. Define capital, destino, ritmo, gobierno de riesgo, reglas estratégicas y los estándares que el resto de la plataforma audita."
      ),
      bullets: [
        L("Complete this before expecting dashboards, analytics, or coaching to be meaningful.", "Complétalo antes de esperar que dashboards, analítica o coaching tengan significado."),
        L("The plan should be measurable enough that the system can detect variance and risk drift.", "El plan debe ser tan medible que el sistema pueda detectar variación y desviación de riesgo."),
        L("A Trader Entrepreneur does not only trade; they operate against a documented standard.", "Un Trader Entrepreneur no solo opera; ejecuta contra un estándar documentado."),
      ],
      steps: [
        {
          id: "gp-business-analysis",
          title: L("Business analysis foundation", "Fundación de análisis empresarial"),
          body: L(
            "Define capital, target, runway, primary instrument, and operating profile. The selected market calendar becomes the source for sessions and checkpoints.",
            "Define capital, meta, runway, instrumento principal y perfil operativo. El calendario del mercado seleccionado se convierte en la fuente de sesiones y checkpoints."
          ),
          anchor: "gp-business-analysis",
          selector: "#gp-business-analysis",
        },
        {
          id: "gp-start",
          title: L("Starting capital", "Capital inicial"),
          body: L(
            "Use the real capital assigned to this business. It anchors returns, drawdown limits, checkpoint math, and whether deposits or trading are driving growth.",
            "Usa el capital real asignado a esta empresa. Ancla retornos, límites de drawdown, matemática de checkpoints y si el crecimiento viene de depósitos o trading."
          ),
          anchor: "gp-starting-balance",
          selector: "#gp-starting-balance",
        },
        {
          id: "gp-target",
          title: L("Target capital", "Capital objetivo"),
          body: L(
            "This is the destination the plan is trying to reach. The review will test it against time, loss assumptions, the operating model, and execution evidence.",
            "Este es el destino que el plan intenta alcanzar. La evaluación lo comparará con tiempo, supuestos de pérdida, modelo operativo y evidencia de ejecución."
          ),
          anchor: "gp-target-balance",
          selector: "#gp-target-balance",
        },
        {
          id: "gp-start-date",
          title: L("Operating start date", "Fecha de inicio operativo"),
          body: L(
            "This date starts the measurement period. The system uses it to calculate pacing, plan variance, monthly progress, and the calendar rhythm.",
            "Esta fecha inicia el periodo de medición. El sistema la usa para calcular ritmo, variación contra el plan, progreso mensual y cadencia del calendario."
          ),
          anchor: "gp-start-date",
          selector: "#gp-start-date",
        },
        {
          id: "gp-target-date",
          title: L("Target date", "Fecha objetivo"),
          body: L(
            "Choose a runway in days, weeks, months, or years. The target date is calculated automatically from the start date and drives the required pace.",
            "Escoge un runway en días, semanas, meses o años. La fecha objetivo se calcula automáticamente desde la fecha inicial y determina el ritmo requerido."
          ),
          anchor: "gp-target-date",
          selector: "#gp-target-date",
        },
        {
          id: "gp-withdrawals",
          title: L("Owner cashflows", "Cashflows del dueño"),
          body: L(
            "Planned withdrawals separate business performance from owner distributions. Use this so the dashboard does not mistake withdrawals for trading failure.",
            "Los retiros planificados separan performance del negocio de distribuciones del dueño. Úsalo para que el dashboard no confunda retiros con fallo de trading."
          ),
          anchor: "gp-planned-withdrawals",
          selector: "#gp-planned-withdrawals",
        },
        {
          id: "gp-mode",
          title: L("Plan mode and phases", "Modo del plan y fases"),
          body: L(
            "Choose automatic checkpoints or manual phases. Automatic is faster; phases give more control when your growth plan changes by stage.",
            "Elige checkpoints automáticos o fases manuales. Automático es más rápido; las fases dan más control cuando tu crecimiento cambia por etapa."
          ),
          anchor: "gp-plan-mode",
          selector: "#gp-plan-mode",
        },
        {
          id: "gp-days",
          title: L("Trading cadence", "Cadencia de trading"),
          body: L(
            "Only select the days you can trade with discipline. The plan should measure the business you can actually operate, not the schedule you wish you had.",
            "Selecciona solo los días que puedes operar con disciplina. El plan debe medir la empresa que realmente puedes operar, no el horario que quisieras tener."
          ),
          anchor: "gp-trading-days",
          selector: "#gp-trading-days",
        },
        {
          id: "gp-daily-loss",
          title: L("Daily loss limit", "Límite diario de pérdida"),
          body: L(
            "This is a business protection line. When it is reached, the day stops so one session cannot damage the operating plan.",
            "Esta es una línea de protección empresarial. Cuando se alcanza, el día se detiene para que una sesión no dañe el plan operativo."
          ),
          anchor: "gp-max-daily-loss",
          selector: "#gp-max-daily-loss",
        },
        {
          id: "gp-risk-trade",
          title: L("Risk per trade", "Riesgo por trade"),
          body: L(
            "Risk per trade connects setup quality to capital protection. It keeps individual decisions small enough for the business to survive variance.",
            "El riesgo por trade conecta calidad de setup con protección de capital. Mantiene cada decisión lo bastante pequeña para que la empresa sobreviva la variación."
          ),
          anchor: "gp-risk-per-trade",
          selector: "#gp-risk-per-trade",
        },
        {
          id: "gp-required-goal",
          title: L("Required pace", "Ritmo requerido"),
          body: L(
            "Compare the perfect-path session rate with the loss-adjusted goal-day rate, scenario coverage, and real execution evidence. Research AI explains the verified math but cannot change it or promise returns.",
            "Compara el ritmo de trayectoria perfecta con el ritmo ajustado por pérdidas en días de meta, cobertura del escenario y evidencia real. Research AI explica la matemática verificada, pero no puede cambiarla ni prometer retornos."
          ),
          anchor: "gp-required-goal",
          selector: "#gp-required-goal",
        },
        {
          id: "gp-phase-builder",
          title: L("Stage the business", "Divide la empresa por etapas"),
          body: L(
            "Phases let you run the account like a staged business plan: build consistency, increase size only after evidence, and protect capital during transitions.",
            "Las fases te permiten operar la cuenta como un plan empresarial por etapas: construir consistencia, subir tamaño solo con evidencia y proteger capital en transiciones."
          ),
          anchor: "gp-phase-builder",
          selector: "#gp-phase-builder",
        },
        {
          id: "gp-system",
          title: L("Trading system", "Sistema de trading"),
          body: L(
            "Document the setups, markets, session windows, entry logic, invalidation, and management standards. This is the business model for execution.",
            "Documenta setups, mercados, ventanas de sesión, lógica de entrada, invalidación y estándares de manejo. Este es el modelo operativo de ejecución."
          ),
          anchor: "gp-trading-system",
          selector: "#gp-trading-system",
        },
        {
          id: "gp-rules",
          title: L("Rules and accountability", "Reglas y accountability"),
          body: L(
            "Rules are non-negotiable controls. Write them clearly enough that a future audit can tell whether you operated the business or improvised.",
            "Las reglas son controles no negociables. Escríbelas con suficiente claridad para que una auditoría futura sepa si operaste la empresa o improvisaste."
          ),
          anchor: "gp-rules",
          selector: "#gp-rules",
        },
        {
          id: "gp-commitment",
          title: L("Operating commitment", "Compromiso operativo"),
          body: L(
            "The commitment turns the plan into a standard you agree to protect. Save only when the plan is clear enough to be audited by your own data.",
            "El compromiso convierte el plan en un estándar que aceptas proteger. Guarda solo cuando el plan sea lo bastante claro para ser auditado por tu propia data."
          ),
          anchor: "gp-commitment",
          selector: "#gp-commitment",
        },
      ],
    }),
  },
  {
    key: "journal",
    guideHref: "/help/journal",
    match: (path) => path.startsWith("/journal/"),
    build: (L) => ({
      title: L("Execution Journal", "Registro de Ejecución"),
      summary: L(
        "The journal is the legal record of the trading business. It captures the plan, execution decisions, emotional state, mistakes, and lessons behind every trading day.",
        "El journal es el registro formal de la empresa de trading. Captura plan, decisiones de ejecución, estado emocional, errores y lecciones detrás de cada día operativo."
      ),
      bullets: [
        L("Premarket creates the daily operating plan before emotion enters.", "Premarket crea el plan operativo diario antes de que entre la emoción."),
        L("Inside the Trade records decision quality while the trade is alive.", "Inside the Trade registra calidad de decisión mientras el trade está vivo."),
        L("After-trade review turns the session into a correction loop.", "El review post-trade convierte la sesión en un ciclo de corrección."),
      ],
      steps: [
        {
          id: "journal-header",
          title: L("One day, one record", "Un día, un registro"),
          body: L(
            "Use the date header to keep each session clean. A business cannot improve what it cannot locate and compare.",
            "Usa el encabezado de fecha para mantener cada sesión limpia. Una empresa no puede mejorar lo que no puede localizar y comparar."
          ),
          selector: '[data-tour="journal-date-header"]',
        },
        {
          id: "journal-premarket",
          title: L("Premarket operating plan", "Plan operativo premarket"),
          body: L(
            "Define bias, levels, setup, risk, and the one rule that protects the day. This is where you decide before pressure arrives.",
            "Define sesgo, niveles, setup, riesgo y la regla que protege el día. Aquí decides antes de que llegue la presión."
          ),
          anchor: "journal-step-premarket",
          selector: '[data-tour="journal-step-premarket"]',
        },
        {
          id: "journal-inside",
          title: L("Live execution evidence", "Evidencia de ejecución en vivo"),
          body: L(
            "Record management actions, emotions, rule pressure, and deviations while they happen. This makes review honest instead of reconstructed from memory.",
            "Registra manejo, emociones, presión contra reglas y desviaciones mientras ocurren. Esto hace el review honesto en vez de reconstruido por memoria."
          ),
          anchor: "journal-step-intrade",
          selector: '[data-tour="journal-step-intrade"]',
        },
        {
          id: "journal-after",
          title: L("Post-session audit", "Auditoría post-sesión"),
          body: L(
            "Close the loop with what worked, what failed, and the exact correction for the next session. No correction means the business did not learn.",
            "Cierra el ciclo con qué funcionó, qué falló y la corrección exacta para la próxima sesión. Sin corrección, la empresa no aprendió."
          ),
          anchor: "journal-step-after",
          selector: '[data-tour="journal-step-after"]',
        },
        {
          id: "journal-save",
          title: L("Save the record", "Guardar el registro"),
          body: L(
            "Save the session so analytics, coaching, reports, and accountability can read the same source of truth.",
            "Guarda la sesión para que analítica, coaching, reportes y accountability lean la misma fuente de verdad."
          ),
          selector: '[data-tour="journal-save"]',
        },
      ],
    }),
  },
  {
    key: "analytics",
    guideHref: "/help/analytics",
    match: (path) => startsWithAny(path, ["/performance/analytics-statistics", "/performance/balance-chart", "/performance/plan-summary"]),
    build: (L) => ({
      title: L("Business Performance Diagnostics", "Diagnóstico de Performance Empresarial"),
      summary: L(
        "Analytics turns trades and journal records into business intelligence. Use it to test whether the process is profitable, repeatable, and controlled.",
        "Analytics convierte trades y registros de journal en inteligencia empresarial. Úsalo para probar si el proceso es rentable, repetible y controlado."
      ),
      bullets: [
        L("Start with sample size before trusting any conclusion.", "Empieza por tamaño de muestra antes de confiar en cualquier conclusión."),
        L("Separate edge, execution, risk, timing, and instrument behavior.", "Separa edge, ejecución, riesgo, timing y comportamiento por instrumento."),
        L("Use findings to update rules and the business plan, not to chase random changes.", "Usa hallazgos para actualizar reglas y el plan empresarial, no para perseguir cambios aleatorios."),
      ],
      steps: [
        {
          id: "analytics-header",
          title: L("From results to diagnosis", "De resultados a diagnóstico"),
          body: L(
            "Use this workspace after data has been imported or journaled. The goal is to understand what is driving the business results.",
            "Usa este workspace después de importar o registrar data. La meta es entender qué está moviendo los resultados del negocio."
          ),
          selector: "main h1",
        },
        {
          id: "analytics-nav",
          title: L("Performance menu", "Menú de performance"),
          body: L(
            "Move between analytics, balance history, plan summaries, coaching, and business finance depending on the decision you need to make.",
            "Muévete entre analítica, historial de balance, resúmenes del plan, coaching y finanzas del negocio según la decisión que necesites tomar."
          ),
          selector: '[data-tour="nav-performance"]',
        },
      ],
    }),
  },
  {
    key: "profit-loss-track",
    guideHref: "/help/profit-loss-track",
    match: (path) => startsWithAny(path, ["/performance/profit-loss-track", "/performance/plan"]),
    build: (L) => ({
      title: L("Business Finance Control", "Control Financiero Empresarial"),
      summary: L(
        "This area tracks the economics of the trading operation: costs, subscriptions, renewals, cash needs, and break-even pressure.",
        "Esta área rastrea la economía de la operación de trading: costos, suscripciones, renovaciones, necesidades de efectivo y presión de break-even."
      ),
      bullets: [
        L("Treat trading like a business with operating expenses, not only gross P&L.", "Trata el trading como negocio con gastos operativos, no solo P&L bruto."),
        L("Use break-even to know what the account must produce before the business is sustainable.", "Usa break-even para saber qué debe producir la cuenta antes de que el negocio sea sostenible."),
        L("Keep vendor and subscription costs current so decisions are grounded.", "Mantén costos de vendors y suscripciones actualizados para decidir con base real."),
      ],
      steps: [
        {
          id: "profit-header",
          title: L("Operating economics", "Economía operativa"),
          body: L(
            "This screen separates trading performance from business viability. A profitable trader still needs a controlled cost structure.",
            "Esta pantalla separa performance de trading de viabilidad empresarial. Un trader rentable también necesita una estructura de costos controlada."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "ai-coaching",
    guideHref: "/help/ai-coaching",
    match: (path) => path.startsWith("/performance/ai-coaching"),
    build: (L) => ({
      title: L("AI Accountability Coach", "Coach IA de Accountability"),
      summary: L(
        "The coach reads your plan, journal, trades, and analytics to identify behavior patterns and recommend the next operating correction.",
        "El coach lee tu plan, journal, trades y analítica para identificar patrones de conducta y recomendar la próxima corrección operativa."
      ),
      bullets: [
        L("Ask about discipline, risk, execution, routine, or performance using a specific date range.", "Pregunta sobre disciplina, riesgo, ejecución, rutina o performance usando un rango específico."),
        L("Better records create better coaching because the system can see the real pattern.", "Mejores registros crean mejor coaching porque el sistema puede ver el patrón real."),
        L("Use coaching as accountability, not entertainment.", "Usa coaching como accountability, no como entretenimiento."),
      ],
      steps: [
        {
          id: "coach-header",
          title: L("Pattern to correction", "De patrón a corrección"),
          body: L(
            "Use coaching when you want a clear diagnosis and one action to improve the next sessions. The value depends on the quality of your saved data.",
            "Usa coaching cuando quieras un diagnóstico claro y una acción para mejorar las próximas sesiones. El valor depende de la calidad de tu data guardada."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "imports",
    guideHref: "/help/data-inputs",
    match: (path) => path.startsWith("/import"),
    build: (L) => ({
      title: L("Business Data Intake", "Entrada de Data Empresarial"),
      summary: L(
        "Imports connect broker reality to the operating system. Clean inputs make dashboards, analytics, and coaching reliable.",
        "Las importaciones conectan la realidad del broker con el sistema operativo. Inputs limpios hacen confiables dashboards, analítica y coaching."
      ),
      bullets: [
        L("Use broker sync when available; use broker exports when CSV is required.", "Usa broker sync cuando esté disponible; usa exportes del broker cuando haga falta CSV."),
        L("Do not edit raw files before importing unless the system asks for a specific format.", "No edites archivos crudos antes de importar a menos que el sistema pida un formato específico."),
        L("Review import history as quality control: imported, updated, skipped, and duplicate rows.", "Revisa el historial de importación como control de calidad: importadas, actualizadas, omitidas y duplicadas."),
      ],
      steps: [
        {
          id: "imports-header",
          title: L("Data before opinion", "Data antes de opinión"),
          body: L(
            "This page is where the business feeds objective activity into the platform. If data is incomplete, every downstream insight becomes weaker.",
            "Esta página es donde la empresa alimenta actividad objetiva a la plataforma. Si la data está incompleta, cada insight posterior se debilita."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "option-flow",
    guideHref: "/help/option-flow",
    match: (path) => path.startsWith("/option-flow"),
    build: (L) => ({
      title: L("Option Flow Intelligence", "Option Flow Intelligence"),
      summary: L(
        "This premium workspace analyzes options flow as a market intelligence input. It should sharpen your premarket thesis and outcome review without replacing your rules.",
        "Este workspace premium analiza options flow como input de inteligencia de mercado. Debe afinar tu tesis premarket y review de outcomes sin reemplazar tus reglas."
      ),
      bullets: [
        L("Upload clean flow evidence and keep the question specific.", "Sube evidencia de flow limpia y mantén la pregunta específica."),
        L("Use the result to support or reject a thesis before execution.", "Usa el resultado para apoyar o rechazar una tesis antes de ejecutar."),
        L("Push useful conclusions into the journal so the idea becomes auditable.", "Lleva conclusiones útiles al journal para que la idea sea auditable."),
      ],
      steps: [
        {
          id: "flow-header",
          title: L("Market intelligence layer", "Capa de inteligencia de mercado"),
          body: L(
            "Use this screen before or after execution. The business question is: did flow improve decision quality, or did it create noise?",
            "Usa esta pantalla antes o después de ejecutar. La pregunta empresarial es: el flow mejoró la calidad de decisión o creó ruido?"
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "neuro-analysis",
    guideHref: "/help/neuro-layer",
    match: (path) => path.startsWith("/neuro-analysis"),
    build: (L) => ({
      title: L("Neuro Analysis", "Neuro Analysis"),
      summary: L(
        "This premium workspace is for company research, filings, historical data, portfolio evaluation, allocation simulation, and future scenario analysis.",
        "Este workspace premium es para research de compañías, reportes, data histórica, evaluación de portfolio, simulación de allocation y escenarios futuros."
      ),
      bullets: [
        L("Start with ticker, holdings, cost basis, capital, horizon, and the latest company documents.", "Empieza con ticker, posiciones, costo promedio, capital, horizonte y los reportes más recientes de la compañía."),
        L("The system should extract business quality, financial trends, cash flows, risks, valuation ranges, and future scenarios.", "El sistema debe extraer calidad del negocio, tendencias financieras, cash flows, riesgos, rangos de valoración y escenarios futuros."),
        L("Use the output to compare allocation choices and simulate portfolio impact before committing money.", "Usa el output para comparar decisiones de allocation y simular impacto en portfolio antes de comprometer dinero."),
      ],
      steps: [
        {
          id: "neuro-header",
          title: L("Company analysis command center", "Centro de análisis de compañías"),
          body: L(
            "This is where a user uploads company documents, connects portfolio context, and asks the platform to convert raw information into investment-grade analysis and scenarios.",
            "Aquí el usuario sube reportes de compañía, conecta contexto de portfolio y pide a la plataforma convertir información cruda en análisis y escenarios de nivel premium."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "notebook",
    guideHref: "/help/notebook",
    match: (path) => path.startsWith("/notebook"),
    build: (L) => ({
      title: L("Operating Playbook", "Playbook Operativo"),
      summary: L(
        "Notebook is the memory of the business. Store rules, setups, screenshots, lessons, decisions, and standards that deserve to be repeated.",
        "Notebook es la memoria de la empresa. Guarda reglas, setups, screenshots, lecciones, decisiones y estándares que merecen repetirse."
      ),
      bullets: [
        L("Keep evidence-backed notes instead of vague motivation.", "Guarda notas con evidencia en vez de motivación vaga."),
        L("Turn repeated lessons into rules, checklists, or alarms.", "Convierte lecciones repetidas en reglas, checklists o alarmas."),
        L("Use it to make the business smarter every month.", "Úsalo para hacer la empresa más inteligente cada mes."),
      ],
      steps: [
        {
          id: "notebook-header",
          title: L("Institutional memory", "Memoria institucional"),
          body: L(
            "Use Notebook for reusable knowledge. If it improves execution, risk control, or decision quality, it belongs in the playbook.",
            "Usa Notebook para conocimiento reutilizable. Si mejora ejecución, control de riesgo o calidad de decisión, pertenece en el playbook."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "back-study",
    guideHref: "/help/back-study",
    match: (path) => path.startsWith("/back-study"),
    build: (L) => ({
      title: L("Evidence-Based Back-Study", "Back-Study Basado en Evidencia"),
      summary: L(
        "Back-Study validates decisions against chart evidence. It helps the business separate good process from lucky or emotional outcomes.",
        "Back-Study valida decisiones contra evidencia del chart. Ayuda al negocio a separar buen proceso de resultados por suerte o emoción."
      ),
      bullets: [
        L("Replay the chart, not your memory of the trade.", "Reproduce el chart, no tu recuerdo del trade."),
        L("Audit entry, exit, timing, sizing, and rule adherence.", "Audita entrada, salida, timing, tamaño y cumplimiento de reglas."),
        L("Convert observations into playbook updates.", "Convierte observaciones en updates al playbook."),
      ],
      steps: [
        {
          id: "backstudy-header",
          title: L("Chart evidence review", "Review con evidencia del chart"),
          body: L(
            "Use this workspace to test whether the setup and execution matched your standard. The point is correction, not hindsight storytelling.",
            "Usa este workspace para probar si el setup y la ejecución coincidieron con tu estándar. El punto es corrección, no narrativas de hindsight."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "rules-alarms",
    guideHref: "/help/rules-alarms",
    match: (path) => path.startsWith("/rules-alarms"),
    build: (L) => ({
      title: L("Business Protection System", "Sistema de Protección Empresarial"),
      summary: L(
        "Rules and alarms protect the business from avoidable damage. They turn the plan into reminders, limits, checks, and escalation points.",
        "Reglas y alarmas protegen la empresa de daño evitable. Convierten el plan en recordatorios, límites, chequeos y puntos de escalación."
      ),
      bullets: [
        L("Use reminders for routine discipline: premarket, journal, review, and closeout.", "Usa recordatorios para disciplina de rutina: premarket, journal, review y cierre."),
        L("Use critical alarms for risk limits and behavior you refuse to normalize.", "Usa alarmas críticas para límites de riesgo y conducta que no vas a normalizar."),
        L("If a rule matters, automate its protection before the session starts.", "Si una regla importa, automatiza su protección antes de que empiece la sesión."),
      ],
      steps: [
        {
          id: "rules-header",
          title: L("Governance in motion", "Gobernanza en movimiento"),
          body: L(
            "This screen turns written rules into operational protection. Good controls keep one bad decision from becoming a business problem.",
            "Esta pantalla convierte reglas escritas en protección operativa. Buenos controles evitan que una mala decisión se convierta en problema empresarial."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "forum",
    guideHref: "/help/forum",
    match: (path) => path.startsWith("/forum"),
    build: (L) => ({
      title: L("Trader Entrepreneur Community", "Comunidad Trader Entrepreneur"),
      summary: L(
        "The community is for evidence-backed discussion, progress, lessons, and feedback. Use it to improve process without outsourcing conviction.",
        "La comunidad es para discusión con evidencia, progreso, lecciones y feedback. Úsala para mejorar proceso sin tercerizar convicción."
      ),
      bullets: [
        L("Share context, data, and what decision you are trying to improve.", "Comparte contexto, data y qué decisión estás tratando de mejorar."),
        L("Use feedback to refine the business plan, playbook, and review process.", "Usa feedback para refinar el plan empresarial, playbook y proceso de review."),
        L("Keep your documented process as the primary source of truth.", "Mantén tu proceso documentado como fuente principal de verdad."),
      ],
      steps: [
        {
          id: "forum-header",
          title: L("Community with context", "Comunidad con contexto"),
          body: L(
            "Strong posts explain the setup, evidence, decision, and lesson. The goal is better operators, not louder opinions.",
            "Publicaciones fuertes explican setup, evidencia, decisión y lección. La meta es mejores operadores, no opiniones más ruidosas."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "account-settings",
    guideHref: "/help/settings",
    match: (path) => startsWithAny(path, ["/account", "/account/preferences", "/account/password"]),
    build: (L) => ({
      title: L("Trader Entrepreneur Account", "Cuenta Trader Entrepreneur"),
      summary: L(
        "This area controls identity, preferences, language, privacy, and account security. Treat it as operating maintenance.",
        "Esta área controla identidad, preferencias, idioma, privacidad y seguridad de cuenta. Trátala como mantenimiento operativo."
      ),
      bullets: [
        L("Keep profile and preferences aligned with how you work.", "Mantén perfil y preferencias alineadas con tu forma de trabajar."),
        L("Protect access with clean password and security habits.", "Protege acceso con contraseña y hábitos de seguridad limpios."),
        L("Use privacy and data controls intentionally.", "Usa controles de privacidad y data con intención."),
      ],
      steps: [
        {
          id: "account-header",
          title: L("Identity and security layer", "Capa de identidad y seguridad"),
          body: L(
            "This workspace protects the user layer of the business: who owns the records, how the app behaves, and how access is secured.",
            "Este workspace protege la capa de usuario del negocio: quién posee los registros, cómo se comporta la app y cómo se asegura el acceso."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "billing",
    guideHref: "/help/billing",
    match: (path) => startsWithAny(path, ["/billing", "/pricing", "/confirmed"]),
    build: (L) => ({
      title: L("Access and Billing Control", "Control de Acceso y Billing"),
      summary: L(
        "Billing controls plan access, add-ons, renewal status, invoices, and subscription management. It is the commercial gate into the operating system.",
        "Billing controla acceso del plan, add-ons, renovación, facturas y gestión de suscripción. Es la puerta comercial al sistema operativo."
      ),
      bullets: [
        L("Choose the plan that matches the operating system level you need.", "Elige el plan que corresponda al nivel operativo que necesitas."),
        L("After payment, access syncs through the subscription event and opens the workspace.", "Después del pago, el acceso sincroniza por el evento de suscripción y abre el workspace."),
        L("Use billing management for renewals, invoices, and payment method changes.", "Usa billing management para renovaciones, facturas y cambios de método de pago."),
      ],
      steps: [
        {
          id: "billing-header",
          title: L("Subscription gate", "Puerta de suscripción"),
          body: L(
            "This screen determines what the account can access. Keep billing clean so the workspace matches the product tier the business paid for.",
            "Esta pantalla determina a qué puede acceder la cuenta. Mantén billing limpio para que el workspace coincida con el tier pagado por la empresa."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "messages",
    guideHref: "/help",
    match: (path) => path.startsWith("/messages"),
    build: (L) => ({
      title: L("Support and Escalation Center", "Centro de Soporte y Escalación"),
      summary: L(
        "Support keeps issues, billing questions, product feedback, and account help organized until resolution.",
        "Soporte mantiene organizados problemas, preguntas de billing, feedback de producto y ayuda de cuenta hasta resolverlos."
      ),
      bullets: [
        L("Open tickets with enough context to reproduce or understand the issue.", "Abre tickets con suficiente contexto para reproducir o entender el problema."),
        L("Use support for account, billing, bugs, and product improvement ideas.", "Usa soporte para cuenta, billing, bugs e ideas de mejora del producto."),
        L("A clean ticket is faster to resolve than scattered messages.", "Un ticket limpio se resuelve más rápido que mensajes dispersos."),
      ],
      steps: [
        {
          id: "messages-header",
          title: L("Keep support auditable", "Mantén soporte auditable"),
          body: L(
            "Use this workspace when the business needs help. Keep each issue specific so it can be answered, tracked, or escalated cleanly.",
            "Usa este workspace cuando la empresa necesita ayuda. Mantén cada asunto específico para que pueda contestarse, rastrearse o escalarse limpiamente."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "generic-workspace",
    guideHref: "/help",
    match: () => true,
    build: (L) => ({
      title: L("Workspace Operating Guide", "Guía Operativa del Workspace"),
      summary: L(
        "Every screen supports the same business loop: plan, protect, execute, record, review, and improve.",
        "Cada pantalla apoya el mismo ciclo empresarial: planificar, proteger, ejecutar, registrar, revisar y mejorar."
      ),
      bullets: [
        L("Identify the business decision this screen is designed to support.", "Identifica la decisión empresarial que esta pantalla está diseñada para apoyar."),
        L("Use saved records and objective data before changing the process.", "Usa registros guardados y data objetiva antes de cambiar el proceso."),
        L("Open the guide or run the tour whenever the workflow feels unclear.", "Abre la guía o corre el tour cuando el flujo no esté claro."),
      ],
      steps: [
        {
          id: "generic-header",
          title: L("This operating screen", "Esta pantalla operativa"),
          body: L(
            "Start with the page title and ask what part of the operating loop this screen protects. Then use it with a specific decision in mind.",
            "Empieza por el título de la página y pregunta qué parte del ciclo operativo protege esta pantalla. Luego úsala con una decisión específica en mente."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
];

export function getQuickTourContext(path: string, L: QuickTourLocalizer): QuickTourContext {
  const cleanPath = path || "/dashboard";
  const match = BUILDERS.find((builder) => builder.match(cleanPath)) ?? BUILDERS[BUILDERS.length - 1];
  return {
    key: match.key,
    guideHref: match.guideHref,
    ...match.build(L, cleanPath),
  };
}

export function getQuickTourSeenKey(userId: string, key: string) {
  return `ntj_quick_tour_seen_${userId}_${key}`;
}

export function getQuickIntroSeenKey(userId: string, key: string) {
  return `ntj_intro_${userId}_${key}`;
}

export function getQuickTourGlobalSeenKey(userId: string) {
  return `ntj_operating_tour_seen_${userId}_v${QUICK_TOUR_SEEN_VERSION}`;
}
