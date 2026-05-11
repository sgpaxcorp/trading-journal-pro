const LEGACY_MOBILE_PASSWORD_RESET_REDIRECT = "com.sgpax.neurotraderjournal://reset-password";
const PASSWORD_RESET_PATH = "/reset-password";
const ALLOWED_WEB_RECOVERY_HOSTS = new Set([
  "www.neurotrader-journal.com",
  "neurotrader-journal.com",
]);

function normalizeRedirect(value: unknown) {
  return String(value ?? "").trim();
}

function isAllowedWebRecoveryRedirect(redirect: string, reqOrigin: string) {
  try {
    const parsed = new URL(redirect);
    if (parsed.protocol !== "https:") return false;
    const isSameOrigin = parsed.origin === reqOrigin;
    if (!isSameOrigin && !ALLOWED_WEB_RECOVERY_HOSTS.has(parsed.hostname)) return false;
    return parsed.pathname === PASSWORD_RESET_PATH;
  } catch {
    return false;
  }
}

export function resolvePasswordRecoveryRedirect(reqUrl: string, requestedRedirect?: unknown) {
  const origin = new URL(reqUrl).origin;
  const webFallback = `${origin}${PASSWORD_RESET_PATH}`;
  const redirect = normalizeRedirect(requestedRedirect);
  if (!redirect) return webFallback;
  if (redirect === LEGACY_MOBILE_PASSWORD_RESET_REDIRECT) return redirect;
  if (isAllowedWebRecoveryRedirect(redirect, origin)) return redirect;
  return webFallback;
}

export const AUTH_ALLOWED_REDIRECTS = {
  mobilePasswordResetLegacy: LEGACY_MOBILE_PASSWORD_RESET_REDIRECT,
  mobilePasswordResetWeb: `https://www.neurotrader-journal.com${PASSWORD_RESET_PATH}`,
};
