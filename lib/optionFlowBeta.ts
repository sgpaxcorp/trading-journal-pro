export type OptionFlowLang = "en" | "es";

const OPTION_FLOW_BETA_TESTER_EMAILS = new Set(["steven.otero@sgpax.com"]);

export function normalizeOptionFlowEmail(email?: string | null): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isOptionFlowBetaTester(email?: string | null): boolean {
  return OPTION_FLOW_BETA_TESTER_EMAILS.has(normalizeOptionFlowEmail(email));
}

export function resolveOptionFlowLang(value?: string | null): OptionFlowLang {
  return String(value ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

export function getOptionFlowBetaCopy(lang: OptionFlowLang) {
  if (lang === "es") {
    return {
      badge: "BETA",
      title: "Option Flow Intelligence está en desarrollo",
      description:
        "Option Flow Intelligence convierte screenshots o archivos de flujo de opciones en un reporte premarket estructurado con resumen asistido por IA, niveles clave, contexto ASK/BID y notas de riesgo.",
      availability:
        "Ahora mismo corre en development y test mode. El acceso está limitado a la cuenta interna de pruebas mientras validamos workflow, data quality y reportes.",
      billingNotice:
        "Este módulo no está disponible para compra mientras esté en beta privada.",
      apiError:
        "Option Flow Intelligence está en beta privada y solo está disponible para pruebas internas.",
      bullets: [
        "Lee screenshots y archivos CSV/XLSX de flujo.",
        "Resume actividad relevante y sesgo premarket.",
        "Resalta niveles clave, flujo agresivo y notas de riesgo.",
      ],
      learnMore: "Ver descripción",
      openInternal: "Abrir beta interna",
      betaStatus: "BETA · test mode",
    };
  }

  return {
    badge: "BETA",
    title: "Option Flow Intelligence is in development",
    description:
      "Option Flow Intelligence turns options flow screenshots or files into a structured premarket report with AI-assisted summaries, key levels, ASK/BID context, and risk notes.",
    availability:
      "It is currently running in development and test mode. Access is limited to the internal tester account while workflow, data quality, and reports are being validated.",
    billingNotice:
      "This module is not available for purchase while it remains in private beta.",
    apiError:
      "Option Flow Intelligence is in private beta and only available for internal testing.",
    bullets: [
      "Reads screenshots and CSV/XLSX flow files.",
      "Builds a premarket summary from the most relevant activity.",
      "Highlights key levels, aggressive flow, and risk notes.",
    ],
    learnMore: "See description",
    openInternal: "Open internal beta",
    betaStatus: "BETA · test mode",
  };
}

export function getOptionFlowBetaApiPayload(lang: OptionFlowLang = "en") {
  const copy = getOptionFlowBetaCopy(lang);
  return {
    error: copy.apiError,
    code: "option_flow_private_beta",
    beta: true,
    title: copy.title,
    description: copy.description,
    availability: copy.availability,
  };
}
