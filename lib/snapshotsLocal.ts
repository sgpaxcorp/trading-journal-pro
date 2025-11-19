// Simple store en localStorage para snapshots diarios
export type DailySnapshot = {
  date: string; // "YYYY-MM-DD"
  startOfDayBalance: number;
  expectedUSD: number;
  realizedUSD: number;
  deltaUSD: number;
  goalMet: boolean;
};

const KEY = "tjp_snapshots_v1";

export function getSnapshots(): DailySnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DailySnapshot[]) : [];
  } catch {
    return [];
  }
}

export function upsertSnapshot(s: DailySnapshot) {
  if (typeof window === "undefined") return;
  const arr = getSnapshots();
  const idx = arr.findIndex((x) => x.date === s.date);
  if (idx >= 0) arr[idx] = s;
  else arr.push(s);
  localStorage.setItem(KEY, JSON.stringify(arr));
}
