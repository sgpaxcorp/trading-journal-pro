export type MotivationLocale = "en" | "es";

type AnnualMotivationCopy = {
  title: string;
  body: string;
};

export type DailyPushMotivationCopy = AnnualMotivationCopy & {
  dateKey: string;
  sequence: number;
};

const EN_TITLES = [
  "Neuro Trader - Business Briefing",
  "Neuro Trader - Capital Protection",
  "Neuro Trader - Operator Focus",
  "Neuro Trader - Execution Standard",
  "Neuro Trader - Business Review",
  "Neuro Trader - Plan Discipline",
  "Neuro Trader - Risk Desk",
];

const ES_TITLES = [
  "Neuro Trader - Briefing Empresarial",
  "Neuro Trader - Protección de Capital",
  "Neuro Trader - Enfoque del Operador",
  "Neuro Trader - Estándar de Ejecución",
  "Neuro Trader - Revisión del Negocio",
  "Neuro Trader - Disciplina del Plan",
  "Neuro Trader - Mesa de Riesgo",
];

const EN_OPENERS = [
  "Start with ownership.",
  "Treat today like a boardroom decision.",
  "Before the chart gets loud, return to the business plan.",
  "Your first edge today is restraint.",
  "Capital is the inventory of this company.",
  "The market can offer noise; you offer structure.",
  "A Trader Entrepreneur does not need every setup.",
  "Open the session with numbers, not emotion.",
  "Your business does not grow from random conviction.",
  "Let the plan speak before the candle does.",
  "Consistency is an operating policy.",
  "Do not make the market your manager today.",
  "A clean no is also a business decision.",
  "The best trade may be the one that protects tomorrow.",
  "You are here to run an operation, not chase a feeling.",
  "Process creates the room for confidence.",
  "Discipline is the business model before profit appears.",
];

const EN_FOCUS = [
  "Confirm the valid setup, risk per trade, daily max loss, and the rule that cannot be negotiated.",
  "Check whether today's target fits the capital plan before thinking about upside.",
  "Protect your risk rails before you look for speed.",
  "Decide what a good trading day means before the first entry.",
  "Separate market opportunity from business permission.",
  "Measure patience as seriously as profit.",
  "Read your rules like operating policy, not friendly suggestions.",
  "Keep one clean objective in front of the screen.",
  "Audit whether your size matches your current account condition.",
  "Make the next decision easy by defining what you will not do.",
  "Let yesterday inform you without controlling you.",
  "Check the calendar, liquidity, and emotional state before exposure.",
  "Use your Trading Business Plan as the filter for every idea.",
  "Respect the cost of being early, late, or emotionally loaded.",
  "Look for alignment between setup, timing, risk, and your mental state.",
  "Notice any urge to recover, prove, or force.",
  "Keep the session small enough to execute well.",
  "Start by protecting the downside of the business.",
  "Make evidence stronger than impulse.",
];

const EN_ACTIONS = [
  "If the trade is not inside the plan, pass with confidence.",
  "Write the risk before you touch execution.",
  "Take one breath before every order and ask what business rule it serves.",
  "After each decision, leave a note your future self can audit.",
  "If you hit a limit, stop managing emotion through another trade.",
  "Scale only when process quality is present.",
  "Do not increase size to repair a feeling.",
  "If the setup is unclear, cash is a position.",
  "Use the journal to capture facts, not defend decisions.",
  "Trade the rule, then review the result.",
  "Pause after wins so euphoria does not become risk.",
  "Pause after losses so frustration does not become strategy.",
  "Let one missed move remain one missed move.",
  "When the plan says stop, protect the company.",
  "Choose fewer decisions with better documentation.",
  "Review open risk before adding new exposure.",
  "Let your max loss be a boundary, not a negotiation.",
  "If your focus is scattered, reduce complexity.",
  "Use the checklist before trusting conviction.",
  "Keep execution slower than emotion.",
  "Record what you did, why you did it, and what it cost.",
  "Protect the weekly goal from one impulsive decision.",
  "Trade only what you can explain after the session.",
];

const EN_CLOSERS = [
  "That is how the business survives long enough to compound.",
  "Small disciplined days build serious operators.",
  "The goal is not drama; the goal is repeatability.",
  "Your future data starts with this decision.",
  "A clean process is worth defending.",
  "Control today so the plan still has tomorrow.",
  "This is how you earn trust with yourself.",
  "Let the numbers prove the operator is improving.",
  "Calm execution is a business asset.",
  "The company grows when the operator stays honest.",
  "Make today boring in the best possible way.",
  "Your job is to protect the plan from pressure.",
  "One clean session is real progress.",
];

const ES_OPENERS = [
  "Empieza con mentalidad de dueño.",
  "Trata hoy como una decisión de junta directiva.",
  "Antes de que el gráfico haga ruido, vuelve al plan empresarial.",
  "Tu primer edge hoy es la contención.",
  "El capital es el inventario de esta empresa.",
  "El mercado puede traer ruido; tú traes estructura.",
  "Un Empresario Trader no necesita todos los setups.",
  "Abre la sesión con números, no con emoción.",
  "Tu negocio no crece desde convicción aleatoria.",
  "Deja que el plan hable antes que la vela.",
  "La consistencia es una política operativa.",
  "No dejes que el mercado sea tu gerente hoy.",
  "Un no limpio también es una decisión empresarial.",
  "El mejor trade puede ser el que protege mañana.",
  "Estás aquí para operar una empresa, no para perseguir una sensación.",
  "El proceso crea espacio para la confianza.",
  "La disciplina es el modelo de negocio antes de que aparezca la ganancia.",
];

const ES_FOCUS = [
  "Confirma el setup válido, riesgo por trade, pérdida máxima diaria y la regla que no se negocia.",
  "Verifica si la meta de hoy encaja con el plan de capital antes de pensar en upside.",
  "Protege tus límites de riesgo antes de buscar velocidad.",
  "Define qué significa un buen día de trading antes de la primera entrada.",
  "Separa oportunidad de mercado de permiso empresarial.",
  "Mide la paciencia con la misma seriedad que el profit.",
  "Lee tus reglas como política operativa, no como sugerencias amistosas.",
  "Mantén un objetivo limpio frente a la pantalla.",
  "Audita si tu tamaño corresponde a la condición actual de la cuenta.",
  "Haz fácil la próxima decisión definiendo lo que no vas a hacer.",
  "Deja que ayer te informe sin controlarte.",
  "Revisa calendario, liquidez y estado emocional antes de exponerte.",
  "Usa tu Plan de Empresa de Trading como filtro para cada idea.",
  "Respeta el costo de entrar temprano, tarde o cargado emocionalmente.",
  "Busca alineación entre setup, timing, riesgo y estado mental.",
  "Observa cualquier urgencia de recuperar, probar o forzar.",
  "Mantén la sesión lo suficientemente simple para ejecutarla bien.",
  "Empieza protegiendo el downside del negocio.",
  "Haz que la evidencia pese más que el impulso.",
];

const ES_ACTIONS = [
  "Si el trade no está dentro del plan, pásalo con confianza.",
  "Escribe el riesgo antes de tocar la ejecución.",
  "Respira antes de cada orden y pregunta qué regla empresarial sirve.",
  "Después de cada decisión, deja una nota que tu yo futuro pueda auditar.",
  "Si tocas un límite, no intentes manejar emoción con otro trade.",
  "Escala solo cuando la calidad del proceso esté presente.",
  "No aumentes tamaño para reparar una sensación.",
  "Si el setup no está claro, cash también es posición.",
  "Usa el journal para capturar hechos, no para defender decisiones.",
  "Opera la regla y luego revisa el resultado.",
  "Pausa después de ganar para que la euforia no se convierta en riesgo.",
  "Pausa después de perder para que la frustración no se convierta en estrategia.",
  "Deja que un movimiento perdido sea solo un movimiento perdido.",
  "Cuando el plan diga stop, protege la empresa.",
  "Elige menos decisiones con mejor documentación.",
  "Revisa riesgo abierto antes de añadir exposición.",
  "Deja que tu max loss sea frontera, no negociación.",
  "Si tu enfoque está disperso, reduce complejidad.",
  "Usa el checklist antes de confiar en la convicción.",
  "Mantén la ejecución más lenta que la emoción.",
  "Registra qué hiciste, por qué lo hiciste y cuánto costó.",
  "Protege la meta semanal de una decisión impulsiva.",
  "Opera solo lo que puedas explicar después de la sesión.",
];

const ES_CLOSERS = [
  "Así el negocio sobrevive lo suficiente para componer.",
  "Días pequeños y disciplinados construyen operadores serios.",
  "La meta no es drama; la meta es repetición.",
  "Tu data futura empieza con esta decisión.",
  "Un proceso limpio merece defensa.",
  "Controla hoy para que el plan todavía tenga mañana.",
  "Así ganas confianza contigo mismo.",
  "Deja que los números prueben que el operador está mejorando.",
  "La ejecución calmada es un activo empresarial.",
  "La empresa crece cuando el operador se mantiene honesto.",
  "Haz que hoy sea aburrido de la mejor manera posible.",
  "Tu trabajo es proteger el plan de la presión.",
  "Una sesión limpia ya es progreso real.",
];

const EN_PUSH_TITLES = [
  "Daily focus",
  "Protect capital",
  "Trade the plan",
  "Execution check",
  "Operator focus",
  "Risk first",
  "Business discipline",
];

const ES_PUSH_TITLES = [
  "Enfoque de hoy",
  "Protege el capital",
  "Opera el plan",
  "Chequeo de ejecución",
  "Enfoque del operador",
  "Riesgo primero",
  "Disciplina empresarial",
];

const EN_PUSH_LEADS = [
  "Protect the business:",
  "Before the first order:",
  "Your edge today:",
  "Keep the session clean:",
  "Capital comes first:",
  "One operating rule:",
  "Trade with evidence:",
  "Slow the decision:",
  "Run the plan:",
  "Stay inside the rails:",
  "Make patience visible:",
  "Keep control:",
  "Choose repeatability:",
  "Think like the owner:",
  "Reduce the noise:",
  "Defend tomorrow:",
  "Earn the next trade:",
];

const ES_PUSH_LEADS = [
  "Protege el negocio:",
  "Antes de la primera orden:",
  "Tu edge de hoy:",
  "Mantén limpia la sesión:",
  "El capital va primero:",
  "Una regla operativa:",
  "Opera con evidencia:",
  "Baja la velocidad:",
  "Ejecuta el plan:",
  "Quédate dentro de los límites:",
  "Haz visible la paciencia:",
  "Mantén el control:",
  "Elige repetición:",
  "Piensa como dueño:",
  "Reduce el ruido:",
  "Protege mañana:",
  "Gánate el próximo trade:",
];

const EN_PUSH_ACTIONS = [
  "wait for confirmation before entry",
  "write the dollar risk first",
  "skip anything outside the playbook",
  "honor the daily loss limit",
  "name the invalidation before entry",
  "use the checklist before conviction",
  "pause after every loss",
  "pause after every win",
  "keep size inside the plan",
  "take only the clearest setup",
  "separate opportunity from permission",
  "review open risk before adding exposure",
  "let cash remain a valid position",
  "document the reason for the trade",
  "stop when the business rule says stop",
  "trade only what you can explain",
  "reduce size when focus is scattered",
  "protect the weekly objective",
  "do not chase a missed move",
  "keep emotion slower than execution",
  "confirm setup, timing, and risk",
  "make evidence stronger than urgency",
  "finish one decision before the next",
];

const ES_PUSH_ACTIONS = [
  "espera confirmación antes de entrar",
  "escribe primero el riesgo en dólares",
  "descarta lo que esté fuera del playbook",
  "respeta la pérdida máxima diaria",
  "define la invalidación antes de entrar",
  "usa el checklist antes de la convicción",
  "pausa después de cada pérdida",
  "pausa después de cada ganancia",
  "mantén el tamaño dentro del plan",
  "toma solo el setup más claro",
  "separa oportunidad de permiso",
  "revisa el riesgo antes de añadir exposición",
  "recuerda que cash también es posición",
  "documenta la razón del trade",
  "detente cuando lo diga la regla",
  "opera solo lo que puedas explicar",
  "reduce tamaño si pierdes enfoque",
  "protege el objetivo semanal",
  "no persigas un movimiento perdido",
  "mantén la emoción fuera de la ejecución",
  "confirma setup, timing y riesgo",
  "haz que la evidencia supere la urgencia",
  "termina una decisión antes de la próxima",
];

const EN_PUSH_CHECKPOINTS = [
  "log it at close",
  "protect the next session",
  "one clean decision at a time",
  "no exceptions today",
  "measure process, not drama",
  "make the rule auditable",
  "keep the capital available",
  "let the journal prove it",
  "finish with honest data",
  "repeat what works",
  "interrupt the first impulse",
  "review before resizing",
  "leave evidence for tomorrow",
  "protect the operator's pace",
  "clarity before speed",
  "discipline before upside",
  "one plan, one standard",
  "control what is controllable",
  "close the loop today",
];

const ES_PUSH_CHECKPOINTS = [
  "regístralo al cerrar",
  "protege la próxima sesión",
  "una decisión limpia a la vez",
  "sin excepciones hoy",
  "mide proceso, no drama",
  "haz auditable la regla",
  "mantén disponible el capital",
  "deja que el journal lo pruebe",
  "termina con data honesta",
  "repite lo que funciona",
  "interrumpe el primer impulso",
  "revisa antes de subir tamaño",
  "deja evidencia para mañana",
  "protege el ritmo del operador",
  "claridad antes que velocidad",
  "disciplina antes que upside",
  "un plan, un estándar",
  "controla lo controlable",
  "cierra el ciclo hoy",
];

function item<T>(items: T[], dayOfYear: number, multiplier: number, offset = 0): T {
  const day = Number.isFinite(dayOfYear) ? Math.max(1, Math.min(366, Math.floor(dayOfYear))) : 1;
  return items[((day - 1) * multiplier + offset) % items.length];
}

export function normalizeMotivationLocale(locale: string | null | undefined): MotivationLocale {
  return String(locale || "").toLowerCase().startsWith("es") ? "es" : "en";
}

function normalizeDateKey(value: Date | string | number) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  return `${safe.getUTCFullYear()}-${String(safe.getUTCMonth() + 1).padStart(2, "0")}-${String(
    safe.getUTCDate()
  ).padStart(2, "0")}`;
}

function dailySequence(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.max(0, Math.floor(Date.UTC(year, month - 1, day) / 86_400_000));
}

function shortenPushBody(value: string, max = 140) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const candidate = text.slice(0, max - 1);
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, Math.max(boundary, max - 18)).replace(/[,:;.!?]+$/, "")}…`;
}

function pushDateLabel(dateKey: string, lang: MotivationLocale) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(lang === "es" ? "es-PR" : "en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  })
    .format(date)
    .replace(/\./g, "");
}

/**
 * Compact phone copy. The visible date makes every day's notification unique,
 * while the mixed-radix sequence rotates the coaching instruction for more than a century.
 */
export function buildDailyPushMotivationMessage(
  date: Date | string | number,
  locale: string | null | undefined
): DailyPushMotivationCopy {
  const lang = normalizeMotivationLocale(locale);
  const dateKey = normalizeDateKey(date);
  const sequence = dailySequence(dateKey);
  const titles = lang === "es" ? ES_PUSH_TITLES : EN_PUSH_TITLES;
  const leads = lang === "es" ? ES_PUSH_LEADS : EN_PUSH_LEADS;
  const actions = lang === "es" ? ES_PUSH_ACTIONS : EN_PUSH_ACTIONS;
  const checkpoints = lang === "es" ? ES_PUSH_CHECKPOINTS : EN_PUSH_CHECKPOINTS;
  const title = `${titles[sequence % titles.length]} · ${pushDateLabel(dateKey, lang)}`;
  const lead = leads[Math.floor(sequence / titles.length) % leads.length];
  const action = actions[Math.floor(sequence / (titles.length * leads.length)) % actions.length];
  const checkpoint = checkpoints[
    Math.floor(sequence / (titles.length * leads.length * actions.length)) % checkpoints.length
  ];

  return {
    title,
    body: shortenPushBody(`${lead} ${action}; ${checkpoint}.`),
    dateKey,
    sequence,
  };
}

export function buildAnnualMotivationMessage(
  dayOfYear: number,
  locale: string | null | undefined
): AnnualMotivationCopy {
  const lang = normalizeMotivationLocale(locale);
  if (lang === "es") {
    return {
      title: item(ES_TITLES, dayOfYear, 1),
      body: [
        item(ES_OPENERS, dayOfYear, 5),
        item(ES_FOCUS, dayOfYear, 7, 3),
        item(ES_ACTIONS, dayOfYear, 11, 5),
        item(ES_CLOSERS, dayOfYear, 7, 2),
      ].join(" "),
    };
  }

  return {
    title: item(EN_TITLES, dayOfYear, 1),
    body: [
      item(EN_OPENERS, dayOfYear, 5),
      item(EN_FOCUS, dayOfYear, 7, 3),
      item(EN_ACTIONS, dayOfYear, 11, 5),
      item(EN_CLOSERS, dayOfYear, 7, 2),
    ].join(" "),
  };
}
