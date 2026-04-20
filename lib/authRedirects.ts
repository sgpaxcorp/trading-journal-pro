const MOBILE_PASSWORD_RESET_REDIRECT = "com.sgpax.neurotraderjournal://reset-password";

function normalizeRedirect(value: unknown) {
  return String(value ?? "").trim();
}

export function resolvePasswordRecoveryRedirect(reqUrl: string, requestedRedirect?: unknown) {
  const origin = new URL(reqUrl).origin;
  const webFallback = `${origin}/reset-password`;
  const redirect = normalizeRedirect(requestedRedirect);
  if (!redirect) return webFallback;
  if (redirect === MOBILE_PASSWORD_RESET_REDIRECT) return redirect;
  if (redirect === webFallback) return redirect;
  return webFallback;
}

export const AUTH_ALLOWED_REDIRECTS = {
  mobilePasswordReset: MOBILE_PASSWORD_RESET_REDIRECT,
};
