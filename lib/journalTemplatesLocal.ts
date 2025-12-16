// lib/journalTemplatesLocal.ts

export type JournalTemplate = {
  id: string;
  name: string;
  content: string; // HTML o texto del template
};

const STORAGE_KEY = "tjp_journal_templates";

function safeParse(raw: string | null): JournalTemplate[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
}

function saveAll(templates: JournalTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function getJournalTemplates(): JournalTemplate[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function addJournalTemplate(name: string, content: string) {
  if (typeof window === "undefined") return;

  const all = getJournalTemplates();

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : "tpl_" + Math.random().toString(36).slice(2, 9);

  const tpl: JournalTemplate = {
    id,
    name,
    content,
  };

  saveAll([...all, tpl]);
}

export function deleteJournalTemplate(id: string) {
  if (typeof window === "undefined") return;
  const all = getJournalTemplates().filter((tpl) => tpl.id !== id);
  saveAll(all);
}
