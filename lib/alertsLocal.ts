export type Alert = { id: string; date: string; message: string; read?: boolean };
const KEY = "tjp_alerts_v1";
export function pushAlert(a: Alert) {
  if (typeof window === "undefined") return;
  const all: Alert[] = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.unshift(a);
  localStorage.setItem(KEY, JSON.stringify(all));
}
export function getAlerts(): Alert[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}
