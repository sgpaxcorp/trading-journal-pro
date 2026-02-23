import { apiGet } from "./api";

export async function refreshAppBaseline() {
  try {
    await apiGet("/api/trading-accounts/list");
  } catch {
    // ignore
  }
  try {
    await apiGet("/api/entitlements/list");
  } catch {
    // ignore
  }
}
