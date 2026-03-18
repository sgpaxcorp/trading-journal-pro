export type QuickTourLocalizer = (en: string, es: string) => string;

export type QuickTourStep = {
  id: string;
  title: string;
  body: string;
  selector?: string | null;
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
      title: L("Dashboard", "Dashboard"),
      summary: L(
        "Use the Dashboard to separate three realities: real account progress, plan pacing, and what you actually did this week.",
        "Usa el Dashboard para separar tres realidades: progreso real de la cuenta, ritmo contra el plan y lo que de verdad hiciste esta semana."
      ),
      bullets: [
        L("Account Progress answers how your equity is truly doing.", "Account Progress responde cómo va de verdad tu equity."),
        L("Plan Progress answers whether you are ahead or behind the Growth Plan.", "Plan Progress responde si vas adelantado o atrasado contra el Growth Plan."),
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
            "Use the calendar to audit the month day by day and jump directly into the Journal session behind any result.",
            "Usa el calendario para auditar el mes día a día y saltar directo al Journal detrás de cualquier resultado."
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
      title: L("Growth Plan", "Growth Plan"),
      summary: L(
        "This page is the source of truth for pacing, risk, and milestone math. The rest of the platform reads from what you define here.",
        "Esta página es la fuente de verdad para ritmo, riesgo y la matemática de metas. El resto de la plataforma lee lo que defines aquí."
      ),
      bullets: [
        L("Starting balance anchors every projection and reference return.", "El balance inicial ancla cada proyección y retorno de referencia."),
        L("Target balance and target date define the business objective, not a vanity number.", "El balance objetivo y la fecha objetivo definen el objetivo del negocio, no un número de ego."),
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
          selector: "#gp-starting-balance",
        },
        {
          id: "gp-target",
          title: L("Target balance", "Balance objetivo"),
          body: L(
            "This is the final destination. Weekly and monthly targets are derived from the path toward this number.",
            "Este es el destino final. Las metas semanales y mensuales se derivan de la ruta hacia este número."
          ),
          selector: "#gp-target-balance",
        },
        {
          id: "gp-mode",
          title: L("Plan mode and phases", "Modo del plan y fases"),
          body: L(
            "Choose whether the system builds checkpoints automatically or from manual phases you control directly.",
            "Elige si el sistema construye checkpoints automáticamente o desde fases manuales que controlas directamente."
          ),
          selector: "#gp-plan-mode",
        },
        {
          id: "gp-days",
          title: L("Trading days", "Días de trading"),
          body: L(
            "Set only the days you are truly willing to trade. The calendar and pacing logic depend on this cadence.",
            "Define solo los días que de verdad estás dispuesto a operar. El calendario y la lógica de pacing dependen de esa cadencia."
          ),
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
      title: L("Journal", "Journal"),
      summary: L(
        "The Journal is where execution becomes data. A complete day captures plan, live decisions, review, and Neuro Layer truth.",
        "El Journal es donde la ejecución se convierte en datos. Un día completo captura plan, decisiones en vivo, revisión y verdad del Neuro Layer."
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
          selector: '[data-tour="journal-premarket"]',
        },
        {
          id: "journal-inside",
          title: L("Inside the Trade", "Dentro del trade"),
          body: L(
            "Capture what changed while the trade was alive: management decisions, mistakes, and emotional drift.",
            "Captura qué cambió mientras el trade estaba vivo: decisiones de manejo, errores y drift emocional."
          ),
          selector: '[data-tour="journal-inside"]',
        },
        {
          id: "journal-after",
          title: L("After-trade Analysis", "Análisis post-trade"),
          body: L(
            "This is where truth matters. Record what worked, what failed, and the exact correction for next time.",
            "Aquí importa la verdad. Registra qué funcionó, qué falló y la corrección exacta para la próxima vez."
          ),
          selector: '[data-tour="journal-after"]',
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
      title: L("AI Coaching", "AI Coaching"),
      summary: L(
        "AI Coaching reads your journal, trades, analytics, and Neuro Layer context to turn patterns into action items.",
        "AI Coaching lee tu journal, trades, analítica y contexto del Neuro Layer para convertir patrones en action items."
      ),
      bullets: [
        L("Use a clean date range with enough sessions.", "Usa un rango limpio con suficientes sesiones."),
        L("Ask specific questions about discipline, execution, risk, or performance.", "Haz preguntas específicas sobre disciplina, ejecución, riesgo o performance."),
        L("Good Neuro Layer inputs make coaching sharper and more personal.", "Buenos inputs del Neuro Layer hacen el coaching más preciso y más personal."),
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
        "This workspace is for flow reports, premarket context, and idea validation before the opening bell.",
        "Este workspace es para reportes de flujo, contexto premarket y validación de ideas antes de la apertura."
      ),
      bullets: [
        L("Upload flow reports cleanly and keep screenshot evidence focused.", "Sube reportes de flujo limpios y mantén la evidencia visual enfocada."),
        L("Use the output to strengthen the premarket plan, not to chase noise.", "Usa la salida para fortalecer el plan premarket, no para perseguir ruido."),
        L("Push the plan into the Journal if you want the thesis to stay inside the daily workflow.", "Envía el plan al Journal si quieres que la tesis quede dentro del flujo diario."),
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
      title: L("Rules & Alarms", "Reglas y alarmas"),
      summary: L(
        "This page turns discipline into automation. It exists to protect the process when emotion gets loud.",
        "Esta página convierte disciplina en automatización. Existe para proteger el proceso cuando la emoción sube el volumen."
      ),
      bullets: [
        L("Use reminders for routine habits such as premarket and journaling.", "Usa recordatorios para hábitos de rutina como premarket y journaling."),
        L("Use alarms for critical live safety signals only.", "Usa alarmas solo para señales críticas de seguridad en vivo."),
        L("If a rule matters, automate the reminder before you trust memory.", "Si una regla importa, automatiza el recordatorio antes de confiar en la memoria."),
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
    key: "challenges",
    guideHref: "/help/challenges",
    match: (path) => path.startsWith("/challenges"),
    build: (L) => ({
      title: L("Challenges", "Retos"),
      summary: L(
        "Challenges are short consistency programs. Use them to train one behavior at a time instead of trying to fix everything at once.",
        "Los retos son programas cortos de consistencia. Úsalos para entrenar una conducta a la vez en vez de intentar arreglar todo de golpe."
      ),
      bullets: [
        L("Pick one challenge that matches your current weakness or plan objective.", "Elige un reto que coincida con tu debilidad actual o con el objetivo del plan."),
        L("Track the challenge inside Dashboard and Journal, not only inside the challenge page.", "Da seguimiento al reto desde Dashboard y Journal, no solo dentro de la página del reto."),
        L("Consistency beats intensity. One clean challenge is enough.", "La consistencia le gana a la intensidad. Un reto limpio es suficiente."),
      ],
      steps: [
        {
          id: "challenges-header",
          title: L("Consistency programs", "Programas de consistencia"),
          body: L(
            "Use challenges to reinforce one operating behavior until it becomes standard. They work best when aligned with the Growth Plan.",
            "Usa los retos para reforzar una conducta operativa hasta que se vuelva estándar. Funcionan mejor cuando están alineados con el Growth Plan."
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
    key: "global-ranking",
    guideHref: "/help/global-ranking",
    match: (path) => path.startsWith("/globalranking"),
    build: (L) => ({
      title: L("Global Ranking", "Ranking global"),
      summary: L(
        "The ranking is live feedback from XP and trophies. Treat it as a consistency scoreboard, not as identity.",
        "El ranking es feedback en vivo a partir de XP y trofeos. Trátalo como un scoreboard de consistencia, no como identidad."
      ),
      bullets: [
        L("Your snapshot shows XP, trophies, and whether you are inside the top 25.", "Tu snapshot muestra XP, trofeos y si estás dentro del top 25."),
        L("Public profiles expose trophies and ranking stats only.", "Los perfiles públicos muestran solo trofeos y estadísticas de ranking."),
        L("Use trophy progress as reinforcement for disciplined behavior.", "Usa el progreso de trofeos como refuerzo de conducta disciplinada."),
      ],
      steps: [
        {
          id: "ranking-header",
          title: L("Ranking snapshot", "Snapshot del ranking"),
          body: L(
            "Track your level, XP, and trophy count here. The value is in consistency feedback over time, not in one-day comparison.",
            "Sigue aquí tu nivel, XP y cantidad de trofeos. El valor está en el feedback de consistencia en el tiempo, no en la comparación de un solo día."
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
      title: L("Account & Settings", "Cuenta y ajustes"),
      summary: L(
        "This area controls profile, language, theme, privacy, and account security settings.",
        "Esta área controla perfil, idioma, tema, privacidad y ajustes de seguridad de la cuenta."
      ),
      bullets: [
        L("Keep your profile and ranking visibility intentional.", "Mantén intencional tu perfil y visibilidad en el ranking."),
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
      title: L("Messages & alerts", "Mensajes y alertas"),
      summary: L(
        "This inbox centralizes notifications, reminders, and system messages that matter to your process.",
        "Esta bandeja centraliza notificaciones, recordatorios y mensajes del sistema que importan para tu proceso."
      ),
      bullets: [
        L("Review reminders and alerts here instead of relying on memory.", "Revisa aquí recordatorios y alertas en vez de depender de la memoria."),
        L("Treat this as an operational inbox, not as social noise.", "Trátala como una bandeja operativa, no como ruido social."),
        L("If something is critical, connect it back to Rules & Alarms or the Journal workflow.", "Si algo es crítico, conéctalo de vuelta con Rules & Alarms o con el flujo del Journal."),
      ],
      steps: [
        {
          id: "messages-header",
          title: L("Operational inbox", "Bandeja operativa"),
          body: L(
            "Use this screen to catch platform signals that require attention, follow-up, or action.",
            "Usa esta pantalla para capturar señales de la plataforma que requieren atención, seguimiento o acción."
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
        "Every screen in Neuro Trader Journal should reinforce the loop: plan, execute, journal, review, improve.",
        "Cada pantalla en Neuro Trader Journal debe reforzar el ciclo: plan, ejecutar, journalear, revisar, mejorar."
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
