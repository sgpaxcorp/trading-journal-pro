export type OptionFlowLang = "en" | "es";

export function resolveOptionFlowLang(value?: string | null): OptionFlowLang {
  return String(value ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

export function getOptionFlowBetaCopy(lang: OptionFlowLang) {
  if (lang === "es") {
    return {
      badge: "BETA PRIVADA",
      title: "Option Flow Intelligence está en beta privada",
      description:
        "Option Flow Intelligence crea un perfil persistente por ticker, interpreta screenshots o archivos de flujo y compara cada lectura con el comportamiento diario del activo.",
      availability:
        "El acceso se activa manualmente desde Admin Center mientras validamos workflow, data quality y reportes.",
      billingNotice:
        "Este módulo no está disponible para compra pública mientras permanezca en beta privada.",
      apiError:
        "Option Flows Analysis está en beta privada. Solicita acceso y te lo activamos manualmente.",
      bullets: [
        "Lee screenshots y archivos CSV/XLSX de múltiples proveedores.",
        "Separa análisis de hoy y posicionamiento futuro por expiración.",
        "Registra OHLC cada día de mercado y revisa el horizonte original.",
      ],
      learnMore: "Ver descripción",
      requestAccess: "Solicitar acceso beta",
      openInternal: "Abrir beta",
      betaStatus: "BETA · acceso manual",
    };
  }

  return {
    badge: "PRIVATE BETA",
    title: "Option Flow Intelligence is in private beta",
    description:
      "Option Flow Intelligence creates a persistent profile for each ticker, interprets screenshots or flow files, and compares every read with the asset's daily price behavior.",
    availability:
      "Access is manually enabled from Admin Center while workflow, data quality, and reports are being validated.",
    billingNotice:
      "This module is not available for public purchase while it remains in private beta.",
    apiError:
      "Option Flows Analysis is in private beta. Request access and we can enable it manually.",
    bullets: [
      "Reads screenshots and CSV/XLSX files from multiple providers.",
      "Separates today's structure from future positioning by expiration.",
      "Records market-day OHLC and reviews the original horizon over time.",
    ],
    learnMore: "See description",
    requestAccess: "Request beta access",
    openInternal: "Open beta",
    betaStatus: "BETA · manual access",
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
