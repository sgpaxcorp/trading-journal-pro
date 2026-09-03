export type BusinessMilestoneKey =
  | "business_plan_created"
  | "business_analysis_completed"
  | "scenario_selected"
  | "business_rules_defined"
  | "risk_rails_defined"
  | "business_protection_enabled"
  | "first_execution_record";

export type BusinessMilestoneDefinition = {
  key: BusinessMilestoneKey;
  title: {
    en: string;
    es: string;
  };
  description: {
    en: string;
    es: string;
  };
  completionHint: {
    en: string;
    es: string;
  };
  action: {
    href: string;
    label: {
      en: string;
      es: string;
    };
  };
};

export type BusinessMilestoneProgress = BusinessMilestoneDefinition & {
  completed: boolean;
  completedAt: string | null;
  metadata?: Record<string, unknown>;
};

export const BUSINESS_MILESTONE_DEFINITIONS: BusinessMilestoneDefinition[] = [
  {
    key: "business_plan_created",
    title: {
      en: "Trading Business Plan created",
      es: "Plan de Empresa de Trading creado",
    },
    description: {
      en: "The business now has a written operating plan instead of scattered intentions.",
      es: "La empresa ya tiene un plan operativo escrito en vez de intenciones sueltas.",
    },
    completionHint: {
      en: "Complete the eight capital-plan steps and save the plan.",
      es: "Completa los ocho pasos del plan de capital y guarda el plan.",
    },
    action: {
      href: "/growth-plan#gp-starting-balance",
      label: { en: "Open Growth Plan", es: "Abrir Growth Plan" },
    },
  },
  {
    key: "business_analysis_completed",
    title: {
      en: "Business Analysis completed",
      es: "Análisis empresarial completado",
    },
    description: {
      en: "Risk profile, experience, dependency, style, and drawdown comfort were captured.",
      es: "Se capturó perfil de riesgo, experiencia, dependencia, estilo y tolerancia al drawdown.",
    },
    completionHint: {
      en: "Answer all five AI-context questions: risk profile, experience, income dependency, drawdown comfort, and trading style; then save the plan.",
      es: "Contesta las cinco preguntas de contexto para la IA: perfil de riesgo, experiencia, dependencia de ingresos, tolerancia al drawdown y estilo de trading; luego guarda el plan.",
    },
    action: {
      href: "/growth-plan#gp-forecast-analysis",
      label: { en: "Complete the 5 answers", es: "Completar las 5 respuestas" },
    },
  },
  {
    key: "scenario_selected",
    title: {
      en: "Operating scenario selected",
      es: "Escenario operativo seleccionado",
    },
    description: {
      en: "The plan has a chosen conservative, moderate, or aggressive operating model.",
      es: "El plan tiene un modelo operativo conservador, moderado o agresivo seleccionado.",
    },
    completionHint: {
      en: "Choose a standard or manual operating mode in step 7 and save the plan.",
      es: "Escoge un modo operativo estándar o manual en el paso 7 y guarda el plan.",
    },
    action: {
      href: "/growth-plan#gp-scenario-selection",
      label: { en: "Choose operating mode", es: "Escoger modo operativo" },
    },
  },
  {
    key: "business_rules_defined",
    title: {
      en: "Business rules defined",
      es: "Reglas empresariales definidas",
    },
    description: {
      en: "Non-negotiable rules are documented so execution can be audited.",
      es: "Las reglas no negociables están documentadas para auditar la ejecución.",
    },
    completionHint: {
      en: "Add at least one non-negotiable rule or one active Do/Don't rule, then save the plan.",
      es: "Agrega al menos una regla no negociable o una regla activa de Hacer/No hacer y guarda el plan.",
    },
    action: {
      href: "/growth-plan#gp-rules",
      label: { en: "Define business rules", es: "Definir reglas empresariales" },
    },
  },
  {
    key: "risk_rails_defined",
    title: {
      en: "Risk rails defined",
      es: "Rieles de riesgo definidos",
    },
    description: {
      en: "Daily loss, daily goal, and risk-per-trade limits are measurable.",
      es: "Max loss diario, meta diaria y riesgo por trade son medibles.",
    },
    completionHint: {
      en: "Set a daily gain goal, hard daily stop, and risk per trade above 0%, then save the plan.",
      es: "Define una meta diaria, un stop diario duro y un riesgo por trade mayores de 0%; luego guarda el plan.",
    },
    action: {
      href: "/growth-plan#gp-scenario-selection",
      label: { en: "Set risk limits", es: "Definir límites de riesgo" },
    },
  },
  {
    key: "business_protection_enabled",
    title: {
      en: "Business Protection enabled",
      es: "Protección empresarial activada",
    },
    description: {
      en: "Plan-based alarms are active to protect the business rules.",
      es: "Las alarmas basadas en el plan están activas para proteger las reglas empresariales.",
    },
    completionHint: {
      en: "Save the plan and verify that the daily-goal and maximum-loss alarms are enabled.",
      es: "Guarda el plan y verifica que las alarmas de meta diaria y pérdida máxima estén activas.",
    },
    action: {
      href: "/rules-alarms/alarms",
      label: { en: "Review protection alarms", es: "Revisar alarmas de protección" },
    },
  },
  {
    key: "first_execution_record",
    title: {
      en: "First execution record captured",
      es: "Primer registro de ejecución capturado",
    },
    description: {
      en: "The business now has evidence to review, not just memory.",
      es: "La empresa ya tiene evidencia para revisar, no solo memoria.",
    },
    completionHint: {
      en: "Open today's session and save the first journal entry for this account.",
      es: "Abre la sesión de hoy y guarda la primera entrada del journal para esta cuenta.",
    },
    action: {
      href: "/dashboard",
      label: { en: "Open session calendar", es: "Abrir calendario de sesiones" },
    },
  },
];

export const BUSINESS_ANALYSIS_PROFILE_FIELD_KEYS = [
  "riskProfile",
  "experience",
  "incomeDependency",
  "drawdownComfort",
  "tradingStyle",
] as const;

export type BusinessAnalysisProfileFieldKey =
  (typeof BUSINESS_ANALYSIS_PROFILE_FIELD_KEYS)[number];

export function getMissingBusinessAnalysisProfileFields(
  value: unknown
): BusinessAnalysisProfileFieldKey[] {
  const profile =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return BUSINESS_ANALYSIS_PROFILE_FIELD_KEYS.filter(
    (key) => !String(profile[key] ?? "").trim()
  );
}

export function hasCompleteBusinessAnalysisProfile(value: unknown) {
  return getMissingBusinessAnalysisProfileFields(value).length === 0;
}

export function getMilestoneDefinition(key: string) {
  return BUSINESS_MILESTONE_DEFINITIONS.find((item) => item.key === key);
}

export function buildBusinessMilestoneMessage(params: {
  key: string;
  lang: "en" | "es";
  name?: string | null;
}) {
  const def = getMilestoneDefinition(params.key);
  const name = String(params.name ?? "").trim();
  const prefix = name ? `${name}, ` : "";
  if (!def) {
    return params.lang === "es"
      ? `${prefix}felicidades. Cumpliste un hito importante de tu empresa de trading.`
      : `${prefix}congratulations. You completed an important milestone in your trading business.`;
  }
  return params.lang === "es"
    ? `${prefix}felicidades. Hito completado: ${def.title.es}. ${def.description.es}`
    : `${prefix}congratulations. Milestone completed: ${def.title.en}. ${def.description.en}`;
}
