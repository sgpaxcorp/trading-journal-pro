import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { operationalFingerprint, recordOperationalEvent } = await import("@/lib/operationalTelemetry");
  const message = error instanceof Error ? error.message : String(error);
  const digest = typeof error === "object" && error !== null && "digest" in error
    ? String(error.digest)
    : "";

  await recordOperationalEvent({
    severity: "error",
    source: "next-server",
    eventType: "unhandled_request_error",
    message,
    routePath: context.routePath || request.path,
    fingerprint: operationalFingerprint([context.routePath, context.routeType, digest || message]),
    metadata: {
      method: request.method,
      routerKind: context.routerKind,
      routeType: context.routeType,
      digest,
    },
  });
};
