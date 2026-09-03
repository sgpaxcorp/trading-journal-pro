type BrokerCopyLocale = "en" | "es";

const ENABLED_VALUES = new Set(["1", "true", "yes", "enabled", "on"]);

export function isEnabledEnvValue(value?: string | null) {
  return ENABLED_VALUES.has(String(value ?? "").trim().toLowerCase());
}

export function areBrokerConnectionsEnabledFromEnv() {
  return isEnabledEnvValue(process.env.EXPO_PUBLIC_BROKER_CONNECTIONS_ENABLED);
}

export function brokerConnectionsUnavailableMessage(locale: BrokerCopyLocale = "en") {
  return locale === "es"
    ? "Las conexiones directas de broker estan deshabilitadas temporalmente mientras completamos aprobaciones de proveedores. Los imports manuales CSV/XLSX siguen disponibles en web."
    : "Direct broker connections are temporarily disabled while vendor approvals are completed. Manual CSV/XLSX imports remain available on web.";
}
