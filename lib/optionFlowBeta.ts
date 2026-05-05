import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export type OptionFlowLang = "en" | "es";

const OPTION_FLOW_ENTITLEMENT_KEY = "option_flow";

export function resolveOptionFlowLang(value?: string | null): OptionFlowLang {
  return String(value ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

export async function hasOptionFlowBetaAccess(userId?: string | null): Promise<boolean> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return false;

  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("status")
    .eq("user_id", normalizedUserId)
    .eq("entitlement_key", OPTION_FLOW_ENTITLEMENT_KEY)
    .in("status", ["active", "trialing"])
    .limit(1);

  if (error) return false;
  return (data ?? []).length > 0;
}

export function getOptionFlowBetaCopy(lang: OptionFlowLang) {
  if (lang === "es") {
    return {
      badge: "BETA PRIVADA",
      title: "Option Flow Intelligence está en beta privada",
      description:
        "Option Flow Intelligence convierte screenshots o archivos de flujo de opciones en un reporte premarket estructurado con resumen asistido por IA, niveles clave, contexto ASK/BID y notas de riesgo.",
      availability:
        "El acceso se activa manualmente desde Admin Center mientras validamos workflow, data quality y reportes.",
      billingNotice:
        "Este módulo no está disponible para compra pública mientras permanezca en beta privada.",
      apiError:
        "Option Flow Intelligence está en beta privada. Solicita acceso y te lo activamos manualmente.",
      bullets: [
        "Lee screenshots y archivos CSV/XLSX de flujo.",
        "Resume actividad relevante y sesgo premarket.",
        "Resalta niveles clave, flujo agresivo y notas de riesgo.",
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
      "Option Flow Intelligence turns options flow screenshots or files into a structured premarket report with AI-assisted summaries, key levels, ASK/BID context, and risk notes.",
    availability:
      "Access is manually enabled from Admin Center while workflow, data quality, and reports are being validated.",
    billingNotice:
      "This module is not available for public purchase while it remains in private beta.",
    apiError:
      "Option Flow Intelligence is in private beta. Request access and we can enable it manually.",
    bullets: [
      "Reads screenshots and CSV/XLSX flow files.",
      "Builds a premarket summary from the most relevant activity.",
      "Highlights key levels, aggressive flow, and risk notes.",
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
