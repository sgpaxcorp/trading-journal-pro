export const BROKER_CONNECTIONS_DISABLED_CODE = "broker_connections_disabled";

type BrokerCopyLocale = "en" | "es";

const ENABLED_VALUES = new Set(["1", "true", "yes", "enabled", "on"]);

export function isEnabledEnvValue(value?: string | null) {
  return ENABLED_VALUES.has(String(value ?? "").trim().toLowerCase());
}

export function areBrokerConnectionsEnabledFromEnv(
  env?: Record<string, string | undefined>
) {
  const runtimeEnv = env ?? (typeof process !== "undefined" ? process.env : {});
  return (
    isEnabledEnvValue(runtimeEnv.BROKER_CONNECTIONS_ENABLED) ||
    isEnabledEnvValue(runtimeEnv.NEXT_PUBLIC_BROKER_CONNECTIONS_ENABLED) ||
    isEnabledEnvValue(runtimeEnv.EXPO_PUBLIC_BROKER_CONNECTIONS_ENABLED)
  );
}

export function brokerConnectionsUnavailableMessage(locale: BrokerCopyLocale = "en") {
  return locale === "es"
    ? "Las conexiones directas de broker estan deshabilitadas temporalmente mientras completamos aprobaciones de proveedores. Los imports manuales CSV/XLSX siguen disponibles."
    : "Direct broker connections are temporarily disabled while vendor approvals are completed. Manual CSV/XLSX imports remain available.";
}
