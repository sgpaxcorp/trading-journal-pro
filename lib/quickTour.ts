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

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

const BUILDERS: QuickTourBuilder[] = [
  {
    key: "dashboard",
    guideHref: "/help/dashboard-widgets",
    match: (path) => path.startsWith("/dashboard"),
    build: (L) => ({
      title: L("Business Center", "Centro Empresarial"),
      summary: L(
        "Use the Business Center to separate three realities: real account progress, business plan pacing, and what you actually did this week.",
        "Usa el Centro Empresarial para separar tres realidades: progreso real de la cuenta, ritmo del plan empresarial y lo que de verdad hiciste esta semana."
      ),
      bullets: [
        L("Account Progress answers how your equity is truly doing.", "Account Progress responde cómo va de verdad tu equity."),
        L("Plan Progress answers whether you are ahead or behind the Trading Business Plan.", "Plan Progress responde si vas adelantado o atrasado contra el Plan de Empresa de Trading."),
        L("Weekly Summary and the P&L Calendar keep realized performance separate from the plan.", "Weekly Summary y el calendario P&L separan el rendimiento realizado del plan."),
      ],
      steps: [
        {
          id: "dashboard-account",
          title: L("Account Progress", "Account Progress"),
          body: L(
            "This widget is about real equity. Use it to judge current balance, net account change, trading P&L, and cashflow-adjusted progress.",
            "Este widget trata de equity real. Úsalo para juzgar balance actual, cambio neto de cuenta, trading P&L y progreso ajustado por cashflows."
          ),
          selector: '[data-tour="dash-widget-progress"]',
        },
        {
          id: "dashboard-plan",
          title: L("Plan Progress", "Plan Progress"),
          body: L(
            "This widget compares your live balance against checkpoint targets. Week, month, and quarter here are plan checkpoints, not realized P&L blocks.",
            "Este widget compara tu balance vivo contra checkpoints del plan. Week, month y quarter aquí son checkpoints del plan, no bloques de P&L realizado."
          ),
          selector: '[data-tour="dash-widget-plan-progress"]',
        },
        {
          id: "dashboard-weekly",
          title: L("Weekly Summary", "Weekly Summary"),
          body: L(
            "This is the real weekly execution view. Use it to confirm what you actually produced this week before you draw any conclusion.",
            "Esta es la vista real de ejecución semanal. Úsala para confirmar qué produjiste realmente esta semana antes de sacar conclusiones."
          ),
          selector: '[data-tour="dash-widget-weekly"]',
        },
        {
          id: "dashboard-calendar",
          title: L("P&L Calendar", "Calendario P&L"),
          body: L(
            "Use the calendar to audit the month day by day and jump directly into the execution record behind any result.",
            "Usa el calendario para auditar el mes día a día y saltar directo al registro de ejecución detrás de cualquier resultado."
          ),
          selector: '[data-tour="dash-widget-calendar"]',
        },
      ],
    }),
  },
  {
    key: "growth-plan",
    guideHref: "/help/growth-plan",
    match: (path) => path.startsWith("/growth-plan"),
    build: (L) => ({
      title: L("Trading Business Plan", "Plan de Empresa de Trading"),
      summary: L(
        "This page is the source of truth for business pacing, risk, operating rules, and milestone math. The rest of Neuro Trader reads from what you define here.",
        "Esta página es la fuente de verdad para ritmo empresarial, riesgo, reglas operativas y matemática de metas. El resto de Neuro Trader lee lo que defines aquí."
      ),
      bullets: [
        L("Starting balance anchors every projection and reference return.", "El balance inicial ancla cada proyección y retorno de referencia."),
        L("Start date and target date define the pacing window for the whole plan.", "La fecha de inicio y la fecha objetivo definen la ventana de ritmo de todo el plan."),
        L("Trading days, plan mode, and phases determine how checkpoints are built.", "Los días de trading, el modo del plan y las fases determinan cómo se construyen los checkpoints."),
      ],
      steps: [
        {
          id: "gp-start",
          title: L("Starting balance", "Balance inicial"),
          body: L(
            "Use the real balance you are trading from. It becomes the anchor for progress, return calculations, and checkpoint math.",
            "Usa el balance real desde el que operas. Se convierte en el ancla del progreso, del retorno y de la matemática de checkpoints."
          ),
          anchor: "gp-starting-balance",
          selector: "#gp-starting-balance",
        },
        {
          id: "gp-target",
          title: L("Target balance", "Balance objetivo"),
          body: L(
            "This is the final destination. Weekly and monthly targets are derived from the path toward this number.",
            "Este es el destino final. Las metas semanales y mensuales se derivan de la ruta hacia este número."
          ),
          anchor: "gp-target-balance",
          selector: "#gp-target-balance",
        },
        {
          id: "gp-start-date",
          title: L("Start date", "Fecha de inicio"),
          body: L(
            "The plan starts counting from here. Trading-day math, monthly pacing, and milestone timing all begin on this date.",
            "El plan empieza a contar desde aquí. La matemática de días de trading, el ritmo mensual y el timing de metas arrancan en esta fecha."
          ),
          anchor: "gp-start-date",
          selector: "#gp-start-date",
        },
        {
          id: "gp-mode",
          title: L("Plan mode and phases", "Modo del plan y fases"),
          body: L(
            "Choose whether the system builds checkpoints automatically or from manual phases you control directly.",
            "Elige si el sistema construye checkpoints automáticamente o desde fases manuales que controlas directamente."
          ),
          anchor: "gp-plan-mode",
          selector: "#gp-plan-mode",
        },
        {
          id: "gp-days",
          title: L("Trading days", "Días de trading"),
          body: L(
            "Set only the days you are truly willing to trade. The calendar and pacing logic depend on this cadence.",
            "Define solo los días que de verdad estás dispuesto a operar. El calendario y la lógica de pacing dependen de esa cadencia."
          ),
          anchor: "gp-trading-days",
          selector: "#gp-trading-days",
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
        "The Execution Journal is where the trading business records what actually happened. A complete day captures plan, live decisions, review, and Neuro Layer truth.",
        "El Registro de Ejecución es donde la empresa de trading documenta lo que realmente pasó. Un día completo captura plan, decisiones en vivo, revisión y verdad del Neuro Layer."
      ),
      bullets: [
        L("Premarket defines bias, levels, setup, and risk before the session starts.", "Premarket define sesgo, niveles, setup y riesgo antes de que comience la sesión."),
        L("Inside the trade records execution notes, management actions, and emotional state in real time.", "Inside the trade registra notas de ejecución, acciones de manejo y estado emocional en tiempo real."),
        L("After-trade review and Neuro Layer turn the session into structured learning.", "La revisión post-trade y el Neuro Layer convierten la sesión en aprendizaje estructurado."),
      ],
      steps: [
        {
          id: "journal-header",
          title: L("Session header", "Encabezado de la sesión"),
          body: L(
            "Use the date header to move between sessions and keep one clean record per trading day.",
            "Usa el encabezado de fecha para moverte entre sesiones y mantener un registro limpio por día de trading."
          ),
          selector: '[data-tour="journal-date-header"]',
        },
        {
          id: "journal-premarket",
          title: L("Premarket Prep", "Premarket Prep"),
          body: L(
            "Write the plan before execution: market bias, key levels, setup, and one rule you cannot break.",
            "Escribe el plan antes de ejecutar: sesgo, niveles clave, setup y una regla que no puedes romper."
          ),
          anchor: "journal-step-premarket",
          selector: '[data-tour="journal-step-premarket"]',
        },
        {
          id: "journal-inside",
          title: L("Inside the Trade", "Dentro del trade"),
          body: L(
            "Capture what changed while the trade was alive: management decisions, mistakes, and emotional drift.",
            "Captura qué cambió mientras el trade estaba vivo: decisiones de manejo, errores y drift emocional."
          ),
          anchor: "journal-step-intrade",
          selector: '[data-tour="journal-step-intrade"]',
        },
        {
          id: "journal-after",
          title: L("After-trade Analysis", "Análisis post-trade"),
          body: L(
            "This is where truth matters. Record what worked, what failed, and the exact correction for next time.",
            "Aquí importa la verdad. Registra qué funcionó, qué falló y la corrección exacta para la próxima vez."
          ),
          anchor: "journal-step-after",
          selector: '[data-tour="journal-step-after"]',
        },
        {
          id: "journal-save",
          title: L("Save and sync", "Guardar y sincronizar"),
          body: L(
            "Save often. The rest of the platform can only analyze what has been stored as a real session.",
            "Guarda con frecuencia. El resto de la plataforma solo puede analizar lo que fue almacenado como una sesión real."
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
      title: L("Analytics & Performance", "Analítica y rendimiento"),
      summary: L(
        "Analytics is where you validate whether your edge is real and whether your process is consistent enough to trust.",
        "La Analítica es donde validas si tu edge es real y si tu proceso es lo suficientemente consistente como para confiar en él."
      ),
      bullets: [
        L("Start with sample size and overview KPIs before interpreting advanced metrics.", "Empieza por tamaño de muestra y KPIs de overview antes de interpretar métricas avanzadas."),
        L("Use Risk, Time, and Instruments to isolate where the edge actually lives.", "Usa Risk, Time e Instruments para aislar dónde vive realmente el edge."),
        L("If charts look empty, verify imports and saved sessions in the selected date range.", "Si los charts salen vacíos, verifica importaciones y sesiones guardadas en el rango elegido."),
      ],
      steps: [
        {
          id: "analytics-header",
          title: L("Analytics workspace", "Workspace de analítica"),
          body: L(
            "Use this page to move from raw results to diagnosis: KPIs, distributions, time-of-day patterns, and deeper statistics.",
            "Usa esta página para pasar de resultados crudos a diagnóstico: KPIs, distribuciones, patrones por horario y estadísticas profundas."
          ),
          selector: "main h1",
        },
        {
          id: "analytics-nav",
          title: L("Performance navigation", "Navegación de performance"),
          body: L(
            "Performance is not one report. Move across analytics, coaching, and business tracking depending on the question you need to answer.",
            "Performance no es un solo reporte. Muévete entre analítica, coaching y seguimiento del negocio según la pregunta que necesites responder."
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
      title: L("Profit & Loss Track", "Profit & Loss Track"),
      summary: L(
        "This page runs the business side of trading: budgets, subscriptions, vendors, renewals, and break-even math.",
        "Esta página maneja el lado de negocio del trading: presupuestos, suscripciones, vendors, renovaciones y break-even."
      ),
      bullets: [
        L("Treat this as business control, not as a trading scorecard.", "Trátalo como control del negocio, no como scorecard de trading."),
        L("Use it to see whether your trading operation is economically sustainable.", "Úsalo para ver si tu operación de trading es económicamente sostenible."),
        L("Keep subscriptions and recurring costs clean so the break-even view stays honest.", "Mantén suscripciones y costos recurrentes limpios para que la vista de break-even sea honesta."),
      ],
      steps: [
        {
          id: "profit-header",
          title: L("Business control", "Control del negocio"),
          body: L(
            "This screen is about costs, burn, and break-even. It complements trading performance, but it does not replace it.",
            "Esta pantalla trata de costos, burn y break-even. Complementa el rendimiento de trading, pero no lo reemplaza."
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
      title: L("Business AI Coach", "Coach Empresarial IA"),
      summary: L(
        "Business AI Coaching reads your execution records, trades, analytics, Neuro Layer context, and Trading Business Plan to turn patterns into next actions.",
        "El Coach Empresarial IA lee tus registros de ejecución, trades, analítica, contexto Neuro y Plan de Empresa de Trading para convertir patrones en próximas acciones."
      ),
      bullets: [
        L("Use a clean date range with enough sessions.", "Usa un rango limpio con suficientes sesiones."),
        L("Ask specific questions about discipline, execution, risk, or performance.", "Haz preguntas específicas sobre disciplina, ejecución, riesgo o performance."),
        L("Good Neuro Layer inputs make the business coach sharper and more personal.", "Buenos inputs del Neuro Layer hacen al coach empresarial más preciso y más personal."),
      ],
      steps: [
        {
          id: "coach-header",
          title: L("Coaching workspace", "Workspace de coaching"),
          body: L(
            "Use coaching after you have real samples. The goal is not inspiration; it is a tighter feedback loop for the next sessions.",
            "Usa coaching después de tener muestras reales. La meta no es inspiración; es un feedback loop más cerrado para las próximas sesiones."
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
      title: L("Imports", "Importaciones"),
      summary: L(
        "Imports are the foundation of trustworthy analytics. Clean data first, interpretation second.",
        "Las importaciones son la base de una analítica confiable. Primero datos limpios, después interpretación."
      ),
      bullets: [
        L("Use Broker Sync when supported. Use raw broker exports when you need CSV.", "Usa Broker Sync cuando esté soportado. Usa exportes crudos del broker cuando necesites CSV."),
        L("Do not edit the file before importing.", "No edites el archivo antes de importarlo."),
        L("Read Import History as batch quality control: imported, updated, duplicates, and audit-ready status.", "Lee el historial de importación como control de calidad del lote: importadas, actualizadas, duplicadas y estado audit-ready."),
      ],
      steps: [
        {
          id: "imports-header",
          title: L("Data intake", "Entrada de datos"),
          body: L(
            "This page connects real broker activity to the rest of the platform. If imports are wrong, analytics and coaching will be distorted.",
            "Esta página conecta la actividad real del broker con el resto de la plataforma. Si las importaciones están mal, la analítica y el coaching se distorsionan."
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
        "This workspace is for options flow reports, premarket context, and outcome review.",
        "Este workspace es para reportes de options flow, contexto premarket y revisión de outcomes."
      ),
      bullets: [
        L("Upload flow reports cleanly and keep screenshot evidence focused.", "Sube reportes de flow limpios y mantén la evidencia visual enfocada."),
        L("Use the output to strengthen the premarket plan, not to chase noise.", "Usa la salida para fortalecer el plan premarket, no para perseguir ruido."),
        L("Push the plan into the Execution Journal if you want the thesis to stay inside the daily workflow.", "Envía el plan al Registro de Ejecución si quieres que la tesis quede dentro del flujo diario."),
      ],
      steps: [
        {
          id: "flow-header",
          title: L("Flow workspace", "Workspace de flow"),
          body: L(
            "Think of this page as a premarket intelligence layer. It should sharpen your thesis before execution, not replace your process.",
            "Piensa esta página como una capa de inteligencia premarket. Debe afinar tu tesis antes de ejecutar, no reemplazar tu proceso."
          ),
          selector: "main h1",
        },
      ],
    }),
  },
  {
    key: "neuro-analysis",
    guideHref: "/neuro-analysis",
    match: (path) => path.startsWith("/neuro-analysis"),
    build: (L) => ({
      title: L("Neuro Analysis", "Neuro Analysis"),
      summary: L(
        "This workspace is for company intelligence, evidence checklists, market research, and 2-10 year valuation scenarios.",
        "Este workspace es para inteligencia de compañías, checklist de evidencia, research de mercado y escenarios de valuation 2-10 años."
      ),
      bullets: [
        L("Use it to frame business quality, financial statements, valuation, risk, competition, and long-term investment timing.", "Úsalo para estructurar calidad del negocio, estados financieros, valuation, riesgo, competencia y timing de inversión a largo plazo."),
        L("Future fair value is scenario based: bear, base, and bull from year 2 through year 10.", "El fair value futuro se modela por escenarios: bear, base y bull desde año 2 hasta año 10."),
        L("Outputs are analysis and simulation support, not guaranteed financial advice.", "Las salidas son apoyo de análisis y simulación, no consejo financiero garantizado."),
      ],
      steps: [
        {
          id: "neuro-header",
          title: L("Research command center", "Centro de research"),
          body: L(
            "Start with the company, horizon, documents, and assumptions before reviewing scenarios.",
            "Empieza con la compañía, horizonte, documentos y supuestos antes de revisar escenarios."
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
      title: L("Notebook", "Notebook"),
      summary: L(
        "Notebook is your playbook. Store what deserves to be repeated, not every random thought from a session.",
        "Notebook es tu playbook. Guarda lo que merece repetirse, no cualquier pensamiento aleatorio de una sesión."
      ),
      bullets: [
        L("Capture rules, setups, screenshots, and lessons worth keeping.", "Captura reglas, setups, screenshots y lecciones que valga la pena conservar."),
        L("Prefer evidence-backed notes over vague motivation.", "Prefiere notas respaldadas por evidencia sobre motivación vaga."),
        L("Use it to build repeatable decision standards.", "Úsalo para construir estándares de decisión repetibles."),
      ],
      steps: [
        {
          id: "notebook-header",
          title: L("Playbook workspace", "Workspace del playbook"),
          body: L(
            "Use Notebook as institutional memory. If something improves execution consistently, it belongs here.",
            "Usa Notebook como memoria institucional. Si algo mejora la ejecución de forma consistente, pertenece aquí."
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
      title: L("Back-Study", "Back-Study"),
      summary: L(
        "Back-Study is visual replay. Use it to validate entries, exits, timing, and setup quality with chart context.",
        "Back-Study es replay visual. Úsalo para validar entradas, salidas, timing y calidad del setup con contexto gráfico."
      ),
      bullets: [
        L("Replay the trade, not your memory of the trade.", "Reproduce el trade, no tu recuerdo del trade."),
        L("Audit whether the entry and exit matched the setup rules.", "Audita si la entrada y la salida coincidieron con las reglas del setup."),
        L("Use it to refine repeatable execution details.", "Úsalo para afinar detalles de ejecución repetibles."),
      ],
      steps: [
        {
          id: "backstudy-header",
          title: L("Replay workspace", "Workspace de replay"),
          body: L(
            "This screen is for evidence-based review. The goal is to validate decisions against the chart, not to romanticize hindsight.",
            "Esta pantalla es para revisión basada en evidencia. La meta es validar decisiones contra el gráfico, no romantizar el hindsight."
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
        "This page turns your Trading Business Plan into protection. It exists to help you obey your risk and routine rules when emotion gets loud.",
        "Esta página convierte tu Plan de Empresa de Trading en protección. Existe para ayudarte a obedecer tus reglas de riesgo y rutina cuando la emoción sube el volumen."
      ),
      bullets: [
        L("Use routine checks for premarket, execution records, and closeout habits.", "Usa chequeos de rutina para premarket, registros de ejecución y cierre del día."),
        L("Use critical alarms for hard safety signals only.", "Usa alarmas críticas solo para señales duras de seguridad."),
        L("If a rule matters, protect it before you trust memory.", "Si una regla importa, protégela antes de confiar en la memoria."),
      ],
      steps: [
        {
          id: "rules-header",
          title: L("Discipline automation", "Automatización de disciplina"),
          body: L(
            "Define rules that protect risk and routine. Good alarms reduce avoidable mistakes before they become costly behavior.",
            "Define reglas que protejan riesgo y rutina. Buenas alarmas reducen errores evitables antes de que se conviertan en conducta costosa."
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
      title: L("Community Forum", "Foro de comunidad"),
      summary: L(
        "The forum is for shared progress, feedback, and discussion. Use it to improve process, not to outsource conviction.",
        "El foro es para progreso compartido, feedback y discusión. Úsalo para mejorar el proceso, no para tercerizar convicción."
      ),
      bullets: [
        L("Share evidence, not just opinions.", "Comparte evidencia, no solo opiniones."),
        L("Use community feedback to refine your playbook and execution review.", "Usa el feedback de la comunidad para afinar tu playbook y tu revisión de ejecución."),
        L("Keep your own process as the primary source of truth.", "Mantén tu propio proceso como fuente principal de verdad."),
      ],
      steps: [
        {
          id: "forum-header",
          title: L("Community workspace", "Workspace de comunidad"),
          body: L(
            "Use this space to exchange ideas, lessons, and progress with context. Strong posts are specific, evidence-backed, and useful to others.",
            "Usa este espacio para intercambiar ideas, lecciones y progreso con contexto. Las publicaciones fuertes son específicas, apoyadas en evidencia y útiles para otros."
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
      title: L("Trader Entrepreneur Account", "Cuenta de Empresario Trader"),
      summary: L(
        "This area controls your trader entrepreneur identity, language, theme, privacy, and account security settings.",
        "Esta área controla tu identidad de empresario trader, idioma, tema, privacidad y ajustes de seguridad de la cuenta."
      ),
      bullets: [
        L("Keep your profile, business data, and security settings intentional.", "Mantén intencional tu perfil, data empresarial y seguridad."),
        L("Use preferences to align the app with your workflow and language.", "Usa preferencias para alinear la app con tu flujo y tu idioma."),
        L("Treat password and security updates as operational maintenance.", "Trata las actualizaciones de contraseña y seguridad como mantenimiento operativo."),
      ],
      steps: [
        {
          id: "account-header",
          title: L("Settings workspace", "Workspace de ajustes"),
          body: L(
            "This page manages the identity layer of the workspace: your profile, visibility, preferences, and protection settings.",
            "Esta página maneja la capa de identidad del workspace: tu perfil, visibilidad, preferencias y ajustes de protección."
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
      title: L("Billing & Plans", "Billing y planes"),
      summary: L(
        "This area controls access, plan type, and payment state. Web is the source of truth for subscription management.",
        "Esta área controla acceso, tipo de plan y estado de pago. La web es la fuente de verdad para la gestión de suscripción."
      ),
      bullets: [
        L("Use this page to confirm plan scope and payment state.", "Usa esta página para confirmar el alcance del plan y el estado de pago."),
        L("Subscription changes affect analytics, reports, and premium tools immediately after access sync.", "Los cambios de suscripción afectan analítica, reportes y herramientas premium apenas sincroniza el acceso."),
        L("Mobile is not the place to create or manage subscriptions.", "Mobile no es el lugar para crear o administrar suscripciones."),
      ],
      steps: [
        {
          id: "billing-header",
          title: L("Billing control", "Control de billing"),
          body: L(
            "Manage access and plan state here. Keep billing clean so the app permissions match the product tier you expect.",
            "Administra aquí el acceso y el estado del plan. Mantén billing limpio para que los permisos de la app coincidan con el tier que esperas."
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
      title: L("Support Center", "Centro de soporte"),
      summary: L(
        "This is your support workspace: open tickets, send details, and let the 24/7 virtual agent answer or escalate.",
        "Este es tu workspace de soporte: abre tickets, envía detalles y deja que el agente virtual 24/7 conteste o escale."
      ),
      bullets: [
        L("Use tickets for bugs, billing questions, feature ideas, and account help.", "Usa tickets para bugs, billing, ideas de mejora y ayuda de cuenta."),
        L("The virtual agent replies immediately when it has an answer.", "El agente virtual contesta de inmediato cuando tiene respuesta."),
        L("If the agent cannot solve it, the ticket stays open for human follow-up.", "Si el agente no puede resolverlo, el ticket queda abierto para seguimiento humano."),
      ],
      steps: [
        {
          id: "messages-header",
          title: L("Support workspace", "Workspace de soporte"),
          body: L(
            "Use this screen to keep platform conversations organized until each ticket is resolved.",
            "Usa esta pantalla para mantener las conversaciones de la plataforma organizadas hasta que cada ticket se resuelva."
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
      title: L("Workspace guide", "Guía del workspace"),
      summary: L(
        "Every screen in Neuro Trader should reinforce the business loop: plan, protect, execute, record, review, improve.",
        "Cada pantalla en Neuro Trader debe reforzar el ciclo empresarial: planificar, proteger, ejecutar, registrar, revisar, mejorar."
      ),
      bullets: [
        L("Use the page title to confirm what this screen is responsible for.", "Usa el título de la página para confirmar de qué es responsable esta pantalla."),
        L("Open the guide if you need the operating standard behind the workflow.", "Abre la guía si necesitas el estándar operativo detrás del flujo."),
        L("Run the quick tour to see the main touchpoints on this page.", "Ejecuta el quick tour para ver los puntos principales de esta página."),
      ],
      steps: [
        {
          id: "generic-header",
          title: L("This screen", "Esta pantalla"),
          body: L(
            "Start with the page title and the guide link. The goal is to understand how this screen supports your operating loop before you use it casually.",
            "Empieza por el título de la página y el link a la guía. La meta es entender cómo esta pantalla apoya tu ciclo operativo antes de usarla de forma casual."
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
