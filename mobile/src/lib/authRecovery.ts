import { supabaseMobile } from "./supabase";

export const MOBILE_PASSWORD_RESET_REDIRECT_URL = "com.sgpax.neurotraderjournal://reset-password";

function appendParams(target: URLSearchParams, source: URLSearchParams) {
  source.forEach((value, key) => {
    if (!target.has(key)) {
      target.append(key, value);
    }
  });
}

function mergedParamsFromUrl(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  if (hash) {
    appendParams(params, new URLSearchParams(hash));
  }
  return { parsed, params };
}

export function isPasswordRecoveryUrl(url: string) {
  try {
    const { parsed, params } = mergedParamsFromUrl(url);
    const hostPath = [parsed.hostname, parsed.pathname].filter(Boolean).join("");
    const normalizedPath = hostPath.startsWith("/") ? hostPath : `/${hostPath}`;
    return normalizedPath.includes("/reset-password") || params.get("type") === "recovery";
  } catch {
    return false;
  }
}

export async function createRecoverySessionFromUrl(url: string) {
  if (!supabaseMobile) return null;

  const { params } = mergedParamsFromUrl(url);
  const errorCode = params.get("error_code") || params.get("errorCode");
  const errorDescription = params.get("error_description") || params.get("errorDescription");
  if (errorCode) {
    throw new Error(errorDescription ? decodeURIComponent(errorDescription) : errorCode);
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) {
    return null;
  }

  const { data, error } = await supabaseMobile.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return data.session;
}
