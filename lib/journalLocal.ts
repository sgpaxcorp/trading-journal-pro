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

// En vez de una sola key fija, usamos un prefijo + userId
const STORAGE_KEY_PREFIX = "tjp_journal_entries";

// Construye la key de storage para un usuario
function getStorageKey(userId?: string | null) {
  const id = userId || "anonymous";
  return `${STORAGE_KEY_PREFIX}_${id}`;
}

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

/**
 * Devuelve todas las entradas del journal para un usuario.
 * Si no pasas userId, usa "anonymous".
 */
export function getAllJournalEntries(
  userId?: string | null
): JournalEntry[] {
  if (typeof window === "undefined") return [];
  const key = getStorageKey(userId);
  return safeParse(window.localStorage.getItem(key));
}

/**
 * Devuelve la entrada de un día específico para un usuario.
 */
export function getJournalEntryByDate(
  userId: string | null | undefined,
  date: string
): JournalEntry | null {
  if (typeof window === "undefined") return null;
  const all = getAllJournalEntries(userId);
  return all.find((e) => e.date === date) || null;
}

/**
 * Guarda / actualiza una entrada de journal para un usuario.
 * Si ya existe una entrada para esa fecha, la reemplaza.
 */
export function saveJournalEntry(
  userId: string | null | undefined,
  entry: JournalEntry
) {
  if (typeof window === "undefined") return;

  const key = getStorageKey(userId);
  const all = getAllJournalEntries(userId);

  const filtered = all.filter((e) => e.date !== entry.date);
  filtered.push(entry);

  window.localStorage.setItem(key, JSON.stringify(filtered));
}

/**
 * Elimina la entrada de una fecha específica para un usuario.
 */
export function deleteJournalEntry(
  userId: string | null | undefined,
  date: string
) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(userId);
  const all = getAllJournalEntries(userId);
  const filtered = all.filter((e) => e.date !== date);
  window.localStorage.setItem(key, JSON.stringify(filtered));
}

/**
 * Borra TODO el journal de ese usuario (útil si quieres empezar de cero).
 */
export function clearAllJournalEntries(userId?: string | null) {
  if (typeof window === "undefined") return;
  const key = getStorageKey(userId);
  window.localStorage.removeItem(key);
}
