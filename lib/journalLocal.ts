// lib/journalLocal.ts

export type JournalEntry = {
  date: string; // YYYY-MM-DD
  pnl: number; // P&L in USD
  instrument?: string;
  direction?: "long" | "short";
  entryPrice?: number;
  exitPrice?: number;
  size?: number;
  screenshots?: string[]; // URLs
  notes?: string;
  emotion?: string;
  tags?: string[];
  respectedPlan?: boolean;
};

const STORAGE_KEY = "tjp_journal_entries";

function safeParse(json: string | null): JournalEntry[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
}

export function getAllJournalEntries(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function getJournalEntryByDate(date: string): JournalEntry | null {
  if (typeof window === "undefined") return null;
  const all = getAllJournalEntries();
  return all.find((e) => e.date === date) || null;
}

export function saveJournalEntry(entry: JournalEntry) {
  if (typeof window === "undefined") return;
  const all = getAllJournalEntries();
  const filtered = all.filter((e) => e.date !== entry.date);
  filtered.push(entry);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
