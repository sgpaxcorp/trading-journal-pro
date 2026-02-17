import Constants from "expo-constants";
import { supabaseMobile } from "./supabase";

const DEFAULT_API_URL = "https://www.neurotrader-journal.com";
const EXTRA_API_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  "";
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || EXTRA_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");

async function getAccessToken() {
  if (!supabaseMobile) return "";
  const { data } = await supabaseMobile.auth.getSession();
  return data.session?.access_token ?? "";
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: token ? `Bearer ${token}` : "",
    },
  });
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    if (contentType.includes("text/html")) {
      throw new Error(`API error: received HTML from ${url}`);
    }
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  if (contentType.includes("text/html")) {
    throw new Error(`API error: received HTML from ${url}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: token ? `Bearer ${token}` : "",
    },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    if (contentType.includes("text/html")) {
      throw new Error(`API error: received HTML from ${url}`);
    }
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  if (contentType.includes("text/html")) {
    throw new Error(`API error: received HTML from ${url}`);
  }
  return (await res.json()) as T;
}
