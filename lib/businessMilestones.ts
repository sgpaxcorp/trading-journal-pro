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
      en: "Operating analysis completed",
      es: "Análisis operativo completado",
    },
    description: {
      en: "The schedule, return model, loss assumptions, and risk limits were captured.",
      es: "Se capturaron el calendario, modelo de retorno, supuestos de pérdida y límites de riesgo.",
    },
    completionHint: {
      en: "Complete the operating assumptions, choose a standard or manual model, and save the plan.",
      es: "Completa los supuestos operativos, escoge un modelo estándar o manual y guarda el plan.",
    },
    action: {
      href: "/growth-plan#gp-forecast-analysis",
      label: { en: "Review operating analysis", es: "Revisar análisis operativo" },
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

export function hasCompleteBusinessOperatingAnalysis(value: unknown) {
  const asRecord = (entry: unknown): Record<string, unknown> =>
    entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
  const analysis = asRecord(value);
  if (!Object.keys(analysis).length) return false;
  const operatingModel = asRecord(analysis.operatingModel);
  const selectedScenario = asRecord(analysis.selectedScenario);
  const selectedPlanId = String(
    operatingModel.selectedPlanId ??
      operatingModel.returnModelMode ??
      analysis.selectedScenarioId ??
      selectedScenario.id ??
      ""
  ).trim();
  const positive = (entry: unknown) => {
    const number = Number(entry);
    return Number.isFinite(number) && number > 0;
  };
  const nonNegative = (entry: unknown) => {
    const number = Number(entry);
    return Number.isFinite(number) && number >= 0;
  };

  return Boolean(
    selectedPlanId &&
      positive(operatingModel.averageTradingDaysPerWeek ?? analysis.averageTradingDaysPerWeek) &&
      nonNegative(operatingModel.lossDaysPerWeek ?? selectedScenario.lossDaysPerWeek) &&
      positive(operatingModel.goalDayReturnPct ?? selectedScenario.dailyGoalPct) &&
      positive(operatingModel.expectedLossDayPct ?? selectedScenario.expectedLossDayPct) &&
      positive(operatingModel.maxDailyLossPercent ?? selectedScenario.maxDailyLossPct) &&
      positive(operatingModel.riskPerTradePct ?? selectedScenario.riskPerTradePct)
  );
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
