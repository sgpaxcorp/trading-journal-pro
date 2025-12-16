


export type Checklist = {
  date: string;          // "YYYY-MM-DD"
  preDone: boolean;
  postDone: boolean;
  emotion1to5?: number;
  lesson?: string;
};

const KEY = "tjp_checklists_v1";

export function getChecklist(date: string): Checklist | null {
  if (typeof window === "undefined") return null;
  const map = JSON.parse(localStorage.getItem(KEY) || "{}");
  return map[date] || null;
}

export function saveChecklist(c: Checklist) {
  if (typeof window === "undefined") return;
  const map = JSON.parse(localStorage.getItem(KEY) || "{}");
  map[c.date] = c;
  localStorage.setItem(KEY, JSON.stringify(map));
}
