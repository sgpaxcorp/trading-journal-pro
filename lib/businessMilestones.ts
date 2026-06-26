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
  },
];

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
