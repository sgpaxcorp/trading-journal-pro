// app/notebook/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import { useUserPlan } from "@/hooks/useUserPlan";
import TopNav from "@/app/components/TopNav";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import NotebookInkField from "@/app/components/NotebookInkField";
import {
  createNotebookBook,
  createNotebookPage,
  createNotebookSection,
  deleteNotebookBook,
  deleteNotebookPage,
  deleteNotebookSection,
  listNotebookData,
  updateNotebookBook,
  updateNotebookPage,
  updateNotebookSection,
  type NotebookBookRow,
  type NotebookPageRow,
  type NotebookSectionRow,
  type NotebookStorage,
} from "@/lib/notebookSupabase";
import {
  getFreeNotebookNote,
  listFreeNotebookNotes,
  upsertFreeNotebookNote,
  type FreeNotebookNoteRow,
} from "@/lib/notebookFreeNotesSupabase";
import {
  createNotebookEditableContent,
  getNotebookInkMode,
  type NotebookEditableContent,
  type NotebookInkPayload,
} from "@/lib/notebookInk";

/* =========================
   Types & helpers
========================= */

type ViewMode = "notebook" | "calendar";
type NotebookSubView = "journal" | "custom";

type Holiday = {
  date: string; // YYYY-MM-DD
  label: string;
  marketClosed?: boolean;
};

type LocalNotebook = NotebookBookRow;
type LocalNotebookSection = NotebookSectionRow;
type LocalNotebookPage = NotebookPageRow;
type CreateMode = "book" | "section" | "page";
type ManageTarget =
  | { kind: "book"; book: LocalNotebook }
  | { kind: "section"; section: LocalNotebookSection }
  | { kind: "page"; page: LocalNotebookPage };
type NotebookSelection = {
  notebookId?: string | null;
  sectionId?: string | null;
  pageId?: string | null;
};

type NotebookSurfaceMeta = {
  kind: "blank" | "text" | "ink" | "ios-ink";
  words: number;
  strokes: number;
};

const NOTEBOOK_PAGES_TABLE = "ntj_notebook_pages";
const NOTEBOOK_SECTIONS_TABLE = "ntj_notebook_sections";
const UNASSIGNED_SECTION_KEY = "__unassigned__";

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortDate(dateStr: string, locale?: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSavedTime(ts?: number, locale?: string) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDateTime(value?: string | null, locale?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Evita mostrar JSON crudo como notas
function getNotebookPreview(raw: any, fallbackText: string): string | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return fallbackText;
    }
    return trimmed;
  }

  return null;
}

function stripHtml(input?: string | null): string {
  if (!input) return "";
  return String(input).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function clampText(input: string, max = 900): string {
  if (!input) return "";
  if (input.length <= max) return input;
  return `${input.slice(0, max).trim()}…`;
}

function getNotebookBodyPreview(
  content: string | null | undefined,
  ink: NotebookInkPayload | null | undefined,
  messages: {
    empty: string;
    sketch: string;
    iosSketch: string;
  }
): string {
  const textPreview = clampText(stripHtml(content), 90);
  if (textPreview) return textPreview;

  if (ink?.mode === "ink") {
    if (ink.drawing?.engine === "pencilkit") {
      return messages.iosSketch;
    }
    return messages.sketch;
  }

  return messages.empty;
}

function countNotebookWords(content?: string | null): number {
  const text = stripHtml(content);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function getNotebookStrokeCount(ink?: NotebookInkPayload | null): number {
  if (ink?.drawing?.engine === "skia") {
    return ink.drawing.strokes.length;
  }
  if (ink?.drawing?.engine === "pencilkit") {
    return 1;
  }
  return 0;
}

function getNotebookSurfaceMeta(
  content: string | null | undefined,
  ink: NotebookInkPayload | null | undefined
): NotebookSurfaceMeta {
  const words = countNotebookWords(content);
  const strokes = getNotebookStrokeCount(ink);

  if (ink?.mode === "ink" && ink.drawing?.engine === "pencilkit") {
    return {
      kind: "ios-ink",
      words,
      strokes,
    };
  }

  if (ink?.mode === "ink") {
    return {
      kind: "ink",
      words,
      strokes,
    };
  }

  if (words > 0) {
    return {
      kind: "text",
      words,
      strokes,
    };
  }

  return {
    kind: "blank",
    words,
    strokes,
  };
}

function parseNotesJson(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

const NOTEBOOK_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "what", "where", "when", "why", "how",
  "que", "qué", "como", "cómo", "donde", "dónde", "cuando", "cuándo", "por", "para", "con",
  "del", "las", "los", "una", "uno", "unas", "unos", "sobre", "esto", "esta", "este",
  "please", "pls", "quiero", "busca", "buscar", "encuentra", "find", "locate", "show",
]);

function tokenizeForSearch(input: string): string[] {
  if (!input) return [];
  return input
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/gi, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !NOTEBOOK_STOPWORDS.has(t));
}

function extractQuotedPhrases(input: string): string[] {
  const phrases: string[] = [];
  const matches = input.match(/"([^"]+)"|'([^']+)'/g);
  if (!matches) return phrases;
  for (const m of matches) {
    const cleaned = m.replace(/^["']|["']$/g, "").trim();
    if (cleaned.length >= 3) phrases.push(cleaned);
  }
  return phrases;
}

function buildSnippet(text: string, token: string, max = 140): string {
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(token.toLowerCase());
  if (idx < 0) return text.slice(0, max).trim();
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + max);
  return text.slice(start, end).trim();
}

// IDs generados por Supabase

// localStorage eliminado; persistimos en Supabase

/** Helpers de holidays */

function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number
): Date {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekdayOffset =
    (7 + weekday - firstOfMonth.getDay()) % 7;
  const day = 1 + firstWeekdayOffset + 7 * (n - 1);
  return new Date(year, month, day);
}

function getLastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number
): Date {
  const lastOfMonth = new Date(year, month + 1, 0);
  const offsetBack = (7 + lastOfMonth.getDay() - weekday) % 7;
  const day = lastOfMonth.getDate() - offsetBack;
  return new Date(year, month, day);
}

function observedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  }
  if (day === 0) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  return date;
}

function getUsFederalHolidays(year: number, lang: "en" | "es"): Holiday[] {
  const holidays: Holiday[] = [];
  const label = (en: string, es: string) => (lang === "es" ? es : en);

  // Fixed-date
  holidays.push(
    {
      date: toYMD(observedDate(new Date(year, 0, 1))),
      label: label("New Year's Day", "Año Nuevo"),
      marketClosed: true,
    },
    {
      date: toYMD(observedDate(new Date(year, 5, 19))),
      label: label("Juneteenth National Independence Day", "Juneteenth"),
      marketClosed: true,
    },
    {
      date: toYMD(observedDate(new Date(year, 6, 4))),
      label: label("Independence Day", "Día de la Independencia"),
      marketClosed: true,
    },
    {
      date: toYMD(observedDate(new Date(year, 10, 11))),
      label: label("Veterans Day", "Día de los Veteranos"),
      marketClosed: false,
    },
    {
      date: toYMD(observedDate(new Date(year, 11, 25))),
      label: label("Christmas Day", "Navidad"),
      marketClosed: true,
    }
  );

  // MLK – 3rd Monday Jan
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 0, 1, 3)),
    label: label("Martin Luther King Jr. Day", "Día de Martin Luther King Jr."),
    marketClosed: true,
  });

  // Presidents – 3rd Monday Feb
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 1, 1, 3)),
    label: label("Presidents' Day", "Día de los Presidentes"),
    marketClosed: true,
  });

  // Memorial – last Monday May
  holidays.push({
    date: toYMD(getLastWeekdayOfMonth(year, 4, 1)),
    label: label("Memorial Day", "Memorial Day"),
    marketClosed: true,
  });

  // Labor – 1st Monday Sep
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 8, 1, 1)),
    label: label("Labor Day", "Día del Trabajo"),
    marketClosed: true,
  });

  // Columbus / Indigenous – 2nd Monday Oct
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 9, 1, 2)),
    label: label("Columbus / Indigenous Peoples' Day", "Día de Colón / Pueblos Indígenas"),
    marketClosed: false,
  });

  // Thanksgiving – 4th Thursday Nov
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 10, 4, 4)),
    label: label("Thanksgiving Day", "Día de Acción de Gracias"),
    marketClosed: true,
  });

  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return holidays;
}

/* Detectar idioma de la pregunta (simple) */
function detectLanguage(q: string): "es" | "en" | "auto" {
  const s = q.toLowerCase();
  if (!s.trim()) return "auto";
  if (
    /[áéíóúñü¿¡]/.test(s) ||
    /\b(qué|como|cómo|porque|por qué|cuál|días|semanas|meses|ganancia|pérdida|plan|riesgo|entrada|salida)\b/.test(
      s
    )
  ) {
    return "es";
  }
  return "en";
}

/* =========================
   Component
========================= */

export default function NotebookPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { activeAccountId, loading: accountsLoading } = useTradingAccounts();
  const { plan, loading: planLoading } = useUserPlan();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const userId = useMemo(() => (user as any)?.id || (user as any)?.uid || "", [user]);
  const describeSurface = (surface: NotebookSurfaceMeta) => {
    if (surface.kind === "ios-ink") {
      return {
        label: L("iPad ink", "Ink iPad"),
        detail: surface.words
          ? `${surface.words} ${L(
              surface.words === 1 ? "word" : "words",
              surface.words === 1 ? "palabra" : "palabras"
            )}`
          : L("Apple Pencil sketch", "Sketch Apple Pencil"),
        badgeClass:
          "border-sky-400/40 bg-sky-500/10 text-sky-100",
      };
    }

    if (surface.kind === "ink") {
      const strokeLabel =
        surface.strokes > 0
          ? `${surface.strokes} ${L(
              surface.strokes === 1 ? "stroke" : "strokes",
              surface.strokes === 1 ? "trazo" : "trazos"
            )}`
          : L("Ready to sketch", "Listo para dibujar");
      return {
        label: L("Ink", "Ink"),
        detail: surface.words
          ? `${strokeLabel} · ${surface.words} ${L(
              surface.words === 1 ? "word" : "words",
              surface.words === 1 ? "palabra" : "palabras"
            )}`
          : strokeLabel,
        badgeClass:
          "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
      };
    }

    if (surface.kind === "text") {
      return {
        label: L("Text", "Texto"),
        detail: `${surface.words} ${L(
          surface.words === 1 ? "word" : "words",
          surface.words === 1 ? "palabra" : "palabras"
        )}`,
        badgeClass:
          "border-slate-600 bg-slate-800/70 text-slate-100",
      };
    }

    return {
      label: L("Blank", "Vacío"),
      detail: L("Start writing or sketching", "Empieza a escribir o dibujar"),
      badgeClass:
        "border-slate-700 bg-slate-900/60 text-slate-400",
    };
  };

  // NOTE: We gate rendering below after hooks to avoid hook-order issues.

  // Journal entries desde Supabase
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState<boolean>(true);

  // Sin localStorage: dependemos de Supabase

  // Proteger ruta si no hay user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [authLoading, user, router]);

  // Cargar entries desde Supabase
  useEffect(() => {
    if (planLoading || plan !== "advanced") return;
    if (authLoading || !userId || accountsLoading || !activeAccountId) return;

    const load = async () => {
      try {
        setEntriesLoading(true);
        if (!userId) {
          setEntries([]);
        } else {
          const all = await getAllJournalEntries(userId, activeAccountId);
          setEntries(all);
        }
      } catch (err) {
        console.error("[Notebook] Error loading entries:", err);
        setEntries([]);
      } finally {
        setEntriesLoading(false);
      }
    };

    void load();
  }, [planLoading, plan, authLoading, userId, accountsLoading, activeAccountId]);

  const sorted = useMemo(
    () =>
      [...entries].sort((a: any, b: any) =>
        String(b.date || "").localeCompare(String(a.date || ""))
      ),
    [entries]
  );

  const [view, setView] = useState<ViewMode>("notebook");
  const [subView, setSubView] = useState<NotebookSubView>("journal");

  const [selectedJournalDate, setSelectedJournalDate] =
    useState<string | null>(null);

  useEffect(() => {
    if (!selectedJournalDate && sorted.length > 0) {
      setSelectedJournalDate(sorted[0].date);
    }
  }, [sorted, selectedJournalDate]);

  const selectedJournalEntry = useMemo(() => {
    if (!selectedJournalDate) return null;
    return (
      sorted.find((e: any) => e.date === selectedJournalDate) ?? null
    );
  }, [sorted, selectedJournalDate]);

  const parsedNotes = useMemo(() => {
    if (!selectedJournalEntry) return null;
    const raw = (selectedJournalEntry as any)?.notes;
    if (!raw || typeof raw !== "string") return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
    } catch {
      return null;
    }
  }, [selectedJournalEntry]);

  const premarketText = useMemo(
    () => stripHtml((parsedNotes as any)?.premarket),
    [parsedNotes]
  );
  const liveText = useMemo(
    () => stripHtml((parsedNotes as any)?.live),
    [parsedNotes]
  );
  const postText = useMemo(
    () => stripHtml((parsedNotes as any)?.post),
    [parsedNotes]
  );

  const entriesFromNotes = useMemo(
    () =>
      Array.isArray((parsedNotes as any)?.entries)
        ? ((parsedNotes as any)?.entries as any[])
        : [],
    [parsedNotes]
  );
  const exitsFromNotes = useMemo(
    () =>
      Array.isArray((parsedNotes as any)?.exits)
        ? ((parsedNotes as any)?.exits as any[])
        : [],
    [parsedNotes]
  );

  const combinedTags = useMemo(() => {
    const base = Array.isArray((selectedJournalEntry as any)?.tags)
      ? ((selectedJournalEntry as any).tags as string[])
      : [];
    const fromNotes = Array.isArray((parsedNotes as any)?.tags)
      ? ((parsedNotes as any).tags as string[])
      : [];
    const merged = [...base, ...fromNotes].map((t) => String(t).trim()).filter(Boolean);
    return Array.from(new Set(merged));
  }, [selectedJournalEntry, parsedNotes]);

  // ---- Estado de notas (premarket / live / post), para resumen UI y AI ----
  const notesStatus = useMemo(() => {
    if (!selectedJournalEntry) return null;
    const anyEntry = selectedJournalEntry as any;
    const notes = anyEntry.notes || {};

    const hasPremarket = Boolean(
      notes.premarket ||
        notes.preMarket ||
        notes.pre ||
        anyEntry.premarket
    );
    const hasLive = Boolean(
      notes.live ||
        notes.session ||
        notes.during ||
        anyEntry.live
    );
    const hasPost = Boolean(
      notes.post ||
        notes.postMarket ||
        notes.after ||
        anyEntry.post
    );

    return {
      premarket: hasPremarket,
      live: hasLive,
      post: hasPost,
    };
  }, [selectedJournalEntry]);

  // Custom notebooks (Supabase)
  const [nbData, setNbData] = useState<NotebookStorage>({
    notebooks: [],
    sections: [],
    pages: [],
  });
  const nbDataRef = useRef<NotebookStorage>({
    notebooks: [],
    sections: [],
    pages: [],
  });
  const [nbLoading, setNbLoading] = useState(true);
  const [activeNotebookId, setActiveNotebookId] =
    useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] =
    useState<string | null>(null);
  const [activePageId, setActivePageId] =
    useState<string | null>(null);
  const [sectionExpanded, setSectionExpanded] = useState<Record<string, boolean>>({});
  const pageSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const freeNotesSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const loadedFreeNotesRef = useRef<Record<string, boolean>>({});
  const activeNotebookIdRef = useRef<string | null>(null);
  const activeSectionIdRef = useRef<string | null>(null);
  const activePageIdRef = useRef<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [createName, setCreateName] = useState("");
  const [createNotebookId, setCreateNotebookId] = useState<string | null>(null);
  const [createSectionId, setCreateSectionId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [manageTarget, setManageTarget] = useState<ManageTarget | null>(null);
  const [manageName, setManageName] = useState("");
  const [manageNotebookId, setManageNotebookId] = useState<string | null>(null);
  const [manageSectionId, setManageSectionId] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [pageSaveState, setPageSaveState] = useState<Record<string, { state: "idle" | "saving" | "saved" | "error"; ts?: number }>>({});
  const [freeNotesSaveState, setFreeNotesSaveState] = useState<Record<string, { state: "idle" | "saving" | "saved" | "error"; ts?: number }>>({});

  useEffect(() => {
    activeNotebookIdRef.current = activeNotebookId;
  }, [activeNotebookId]);

  useEffect(() => {
    activeSectionIdRef.current = activeSectionId;
  }, [activeSectionId]);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    nbDataRef.current = nbData;
  }, [nbData]);

  function applyNotebookWorkspaceData(
    data: NotebookStorage,
    selection?: NotebookSelection
  ) {
    const desiredNotebookId = selection?.notebookId ?? activeNotebookIdRef.current;
    const nextNotebookId =
      desiredNotebookId && data.notebooks.some((notebook) => notebook.id === desiredNotebookId)
        ? desiredNotebookId
        : data.notebooks[0]?.id ?? null;

    const notebookSections = nextNotebookId
      ? data.sections.filter((section) => section.notebook_id === nextNotebookId)
      : [];
    const notebookPages = nextNotebookId
      ? data.pages.filter((page) => page.notebook_id === nextNotebookId)
      : [];

    const desiredSectionId = selection?.sectionId ?? activeSectionIdRef.current;
    let nextSectionId: string | null = null;

    if (desiredSectionId === UNASSIGNED_SECTION_KEY) {
      nextSectionId = notebookPages.some((page) => !page.section_id)
        ? UNASSIGNED_SECTION_KEY
        : null;
    } else if (
      desiredSectionId &&
      notebookSections.some((section) => section.id === desiredSectionId)
    ) {
      nextSectionId = desiredSectionId;
    } else if (notebookSections.length > 0) {
      nextSectionId = notebookSections[0].id;
    } else if (notebookPages.some((page) => !page.section_id)) {
      nextSectionId = UNASSIGNED_SECTION_KEY;
    }

    const sectionPages = notebookPages.filter((page) =>
      nextSectionId === UNASSIGNED_SECTION_KEY
        ? !page.section_id
        : page.section_id === nextSectionId
    );

    const desiredPageId = selection?.pageId ?? activePageIdRef.current;
    const nextPageId =
      desiredPageId && sectionPages.some((page) => page.id === desiredPageId)
        ? desiredPageId
        : sectionPages[0]?.id ?? null;

    nbDataRef.current = data;
    setNbData(data);
    setActiveNotebookId(nextNotebookId);
    setActiveSectionId(nextSectionId);
    setActivePageId(nextPageId);
    setSectionExpanded((prev) => {
      const next = { ...prev };
      data.sections.forEach((section) => {
        if (next[section.id] === undefined) next[section.id] = true;
      });
      return next;
    });
  }

  async function reloadNotebookWorkspace(selection?: NotebookSelection) {
    if (!userId || !activeAccountId) return;
    setNbLoading(true);
    try {
      const data = await listNotebookData(userId, activeAccountId);
      applyNotebookWorkspaceData(data, selection);
    } finally {
      setNbLoading(false);
    }
  }

  useEffect(() => {
    if (planLoading || plan !== "advanced") return;
    if (authLoading || !userId || accountsLoading || !activeAccountId) return;

    let alive = true;
    const load = async () => {
      setNbLoading(true);
      try {
        const data = await listNotebookData(userId, activeAccountId);
        if (!alive) return;
        applyNotebookWorkspaceData(data);
      } finally {
        if (alive) setNbLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [
    planLoading,
    plan,
    authLoading,
    userId,
    accountsLoading,
    activeAccountId,
  ]);

  // Free notes por fecha (Supabase)
  const [freeNotesByDate, setFreeNotesByDate] =
    useState<Record<string, NotebookEditableContent>>({});
  const [allFreeNotes, setAllFreeNotes] = useState<FreeNotebookNoteRow[]>([]);

  useEffect(() => {
    // reset cache when switching accounts
    setFreeNotesByDate({});
    loadedFreeNotesRef.current = {};
    setAllFreeNotes([]);
  }, [activeAccountId]);

  useEffect(() => {
    if (planLoading || plan !== "advanced") return;
    if (authLoading || !userId || accountsLoading || !activeAccountId) return;

    let alive = true;
    const loadAll = async () => {
      const rows = await listFreeNotebookNotes(userId, activeAccountId);
      if (!alive) return;
      setAllFreeNotes(rows);
    };

    void loadAll();
    return () => {
      alive = false;
    };
  }, [planLoading, plan, authLoading, userId, accountsLoading, activeAccountId]);

  useEffect(() => {
    if (!selectedJournalDate) return;
    if (authLoading || !userId || accountsLoading || !activeAccountId) return;
    if (loadedFreeNotesRef.current[selectedJournalDate]) return;

    let alive = true;
    const loadFreeNotes = async () => {
      const content = await getFreeNotebookNote(
        userId,
        activeAccountId,
        selectedJournalDate
      );
      if (!alive) return;
      loadedFreeNotesRef.current[selectedJournalDate] = true;
      const nextNote = createNotebookEditableContent(
        content?.content,
        content?.ink
      );
      setFreeNotesByDate((prev) => {
        return {
          ...prev,
          [selectedJournalDate]: nextNote,
        };
      });
    };

    void loadFreeNotes();
    return () => {
      alive = false;
    };
  }, [selectedJournalDate, authLoading, userId, accountsLoading, activeAccountId]);

  const todayStr = useMemo(() => toYMD(new Date()), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const holidays = useMemo(
    () => getUsFederalHolidays(currentYear, lang),
    [currentYear, lang]
  );

  const monthLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2020, i, 1)));
  }, [lang]);

  const holidaysByMonth = useMemo(() => {
    const byMonth: Record<number, Holiday[]> = {};
    for (const h of holidays) {
      const d = new Date(`${h.date}T00:00:00`);
      const month = d.getMonth();
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(h);
    }
    return byMonth;
  }, [holidays]);

  const activeNotebookSections = useMemo(() => {
    if (!activeNotebookId) return [] as LocalNotebookSection[];
    return nbData.sections.filter((s) => s.notebook_id === activeNotebookId);
  }, [nbData.sections, activeNotebookId]);

  const activeNotebookPages = useMemo(() => {
    if (!activeNotebookId) return [] as LocalNotebookPage[];
    return nbData.pages.filter((p) => p.notebook_id === activeNotebookId);
  }, [nbData.pages, activeNotebookId]);

  const activeNotebook = useMemo(() => {
    if (!activeNotebookId) return null as LocalNotebook | null;
    return (
      nbData.notebooks.find((n) => n.id === activeNotebookId) ||
      null
    );
  }, [activeNotebookId, nbData.notebooks]);

  useEffect(() => {
    if (!activeNotebookId) {
      setActiveSectionId(null);
      return;
    }
    const firstSection = activeNotebookSections[0];
    const hasLoosePages = activeNotebookPages.some((page) => !page.section_id);
    const stillValid =
      activeSectionId === UNASSIGNED_SECTION_KEY
        ? hasLoosePages
        : activeNotebookSections.some((section) => section.id === activeSectionId);
    if (!stillValid) {
      if (firstSection?.id) {
        setActiveSectionId(firstSection.id);
      } else if (hasLoosePages) {
        setActiveSectionId(UNASSIGNED_SECTION_KEY);
      } else {
        setActiveSectionId(null);
      }
    }
  }, [activeNotebookId, activeNotebookSections, activeNotebookPages, activeSectionId]);

  useEffect(() => {
    if (!activeNotebookSections.length) return;
    setSectionExpanded((prev) => {
      const next = { ...prev };
      activeNotebookSections.forEach((s) => {
        if (next[s.id] === undefined) next[s.id] = true;
      });
      return next;
    });
  }, [activeNotebookSections]);

  const pagesBySection = useMemo(() => {
    const map: Record<string, LocalNotebookPage[]> = {};
    activeNotebookPages.forEach((p) => {
      const key = p.section_id || UNASSIGNED_SECTION_KEY;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    );
    return map;
  }, [activeNotebookPages]);

  const activeSectionPages = useMemo(() => {
    if (!activeSectionId) return [] as LocalNotebookPage[];
    if (activeSectionId === UNASSIGNED_SECTION_KEY) {
      return pagesBySection[UNASSIGNED_SECTION_KEY] || [];
    }
    return pagesBySection[activeSectionId] || [];
  }, [pagesBySection, activeSectionId]);

  const activeLoosePages = useMemo(
    () => pagesBySection[UNASSIGNED_SECTION_KEY] || [],
    [pagesBySection]
  );

  const activePage = useMemo(() => {
    if (!activeNotebookId) return null as LocalNotebookPage | null;
    if (activeSectionPages.length === 0) return null;
    const found = activePageId
      ? activeSectionPages.find((p) => p.id === activePageId)
      : null;
    return found || activeSectionPages[0];
  }, [activeNotebookId, activeSectionPages, activePageId]);

  useEffect(() => {
    if (!activeSectionPages.length) {
      setActivePageId(null);
      return;
    }
    if (!activePageId || !activeSectionPages.some((p) => p.id === activePageId)) {
      setActivePageId(activeSectionPages[0].id);
    }
  }, [activeSectionPages, activePageId]);

  // AI coach state (para la página seleccionada del journal)
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const freeNotesByDateFromRows = useMemo(() => {
    const map: Record<string, NotebookEditableContent> = {};
    allFreeNotes.forEach((row) => {
      map[row.entry_date] = createNotebookEditableContent(row.content, row.ink);
    });
    return map;
  }, [allFreeNotes]);
  const dailyNotebookByDate = useMemo(
    () => ({
      ...freeNotesByDateFromRows,
      ...freeNotesByDate,
    }),
    [freeNotesByDateFromRows, freeNotesByDate]
  );
  const selectedFreeNote =
    (selectedJournalDate && freeNotesByDate[selectedJournalDate]) ||
    (selectedJournalDate && dailyNotebookByDate[selectedJournalDate]) ||
    createNotebookEditableContent();
  const selectedFreeNotes = selectedFreeNote.content;
  const selectedFreeNoteSurface = describeSurface(
    getNotebookSurfaceMeta(selectedFreeNote.content, selectedFreeNote.ink)
  );
  const freeNotesStatus =
    (selectedJournalDate && freeNotesSaveState[selectedJournalDate]) || null;
  const activePageStatus =
    (activePage?.id && pageSaveState[activePage.id]) || null;
  const selectedJournalPnl = Number((selectedJournalEntry as any)?.pnl || 0);
  const selectedJournalLabel = selectedJournalDate
    ? formatShortDate(selectedJournalDate, lang)
    : "";
  const selectedJournalPreview = selectedJournalEntry
    ? getNotebookPreview(
        (selectedJournalEntry as any).notes,
        L(
          "This day has structured notes saved in the journal blocks.",
          "Este día tiene notas estructuradas guardadas en los bloques del journal."
        )
      )
    : null;
  const writtenJournalBlocks = [notesStatus?.premarket, notesStatus?.live, notesStatus?.post].filter(Boolean).length;
  const selectedJournalCards = [
    {
      title: L("Premarket notes", "Notas premarket"),
      body: premarketText,
    },
    {
      title: L("Inside trade notes", "Notas en sesión"),
      body: liveText,
    },
    {
      title: L("After market notes", "Notas post-market"),
      body: postText,
    },
  ];
  const createNotebookSections = useMemo(
    () =>
      createNotebookId
        ? nbData.sections.filter((section) => section.notebook_id === createNotebookId)
        : [],
    [nbData.sections, createNotebookId]
  );
  const manageNotebookSections = useMemo(
    () =>
      manageNotebookId
        ? nbData.sections.filter((section) => section.notebook_id === manageNotebookId)
        : [],
    [nbData.sections, manageNotebookId]
  );
  const activeSectionLabel =
    activeSectionId === UNASSIGNED_SECTION_KEY
      ? L("Loose pages", "Páginas sueltas")
      : activeNotebookSections.find((section) => section.id === activeSectionId)?.name ||
        L("No section selected", "Sin sección seleccionada");
  const activePageUpdatedAt = activePage?.updated_at ?? activePage?.created_at ?? null;
  const activePageMode = getNotebookInkMode(activePage?.ink);
  const activePageSurface = describeSurface(
    getNotebookSurfaceMeta(activePage?.content, activePage?.ink)
  );

  const handleFreeNotesChange = (nextValue: NotebookEditableContent) => {
    if (!selectedJournalDate || !userId || !activeAccountId) return;
    setFreeNotesSaveState((prev) => ({
      ...prev,
      [selectedJournalDate]: { state: "saving" },
    }));
    setFreeNotesByDate((prev) => {
      return {
        ...prev,
        [selectedJournalDate]: nextValue,
      };
    });

    if (freeNotesSaveTimers.current[selectedJournalDate]) {
      clearTimeout(freeNotesSaveTimers.current[selectedJournalDate]);
    }
    freeNotesSaveTimers.current[selectedJournalDate] = setTimeout(() => {
      void (async () => {
        const ok = await upsertFreeNotebookNote(
          userId,
          activeAccountId,
          selectedJournalDate,
          nextValue.content,
          nextValue.ink
        );
        setFreeNotesSaveState((prev) => ({
          ...prev,
          [selectedJournalDate]: {
            state: ok ? "saved" : "error",
            ts: Date.now(),
          },
        }));
      })();
    }, 400);
  };

  const handleAskAi = async () => {
    if (!aiQuestion.trim()) return;

    setAiLoading(true);
    setAiAnswer(null);

    try {
      const anyEntry = (selectedJournalEntry as any) ?? {};
      const notes = parseNotesJson(anyEntry.notes) ?? (anyEntry.notes || {});

      const structuredNotes = {
        premarket: clampText(stripHtml(
          notes.premarket ||
            notes.preMarket ||
            notes.pre ||
            anyEntry.premarket ||
            ""
        )),
        live: clampText(stripHtml(
          notes.live ||
            notes.session ||
            notes.during ||
            anyEntry.live ||
            ""
        )),
        post: clampText(stripHtml(
          notes.post ||
            notes.postMarket ||
            notes.after ||
            anyEntry.post ||
            ""
        )),
      };

      const notebookNameById = new Map(nbData.notebooks.map((n) => [n.id, n.name]));
      const sectionNameById = new Map(nbData.sections.map((s) => [s.id, s.name]));

      const journalIndex = entries.flatMap((entry: any) => {
        const parsed = parseNotesJson(entry?.notes);
        const dateStr = String(entry?.date || "").slice(0, 10);
        if (!dateStr) return [];

        const pre = clampText(stripHtml(parsed?.premarket ?? entry?.premarket ?? ""));
        const live = clampText(stripHtml(parsed?.live ?? entry?.live ?? ""));
        const post = clampText(stripHtml(parsed?.post ?? entry?.post ?? ""));

        const rows: any[] = [];
        if (pre) rows.push({ source: "journal", date: dateStr, block: "premarket", text: pre });
        if (live) rows.push({ source: "journal", date: dateStr, block: "inside", text: live });
        if (post) rows.push({ source: "journal", date: dateStr, block: "after", text: post });
        return rows;
      });

      const freeNotesIndex = (allFreeNotes?.length ? allFreeNotes : []).map((row) => ({
        source: "free_notes",
        date: row.entry_date,
        block: "free",
        text: clampText(stripHtml(row.content || "")),
      })).filter((row) => row.text);

      if (
        selectedJournalDate &&
        selectedFreeNotes &&
        !freeNotesIndex.some((n) => n.date === selectedJournalDate)
      ) {
        freeNotesIndex.push({
          source: "free_notes",
          date: selectedJournalDate,
          block: "free",
          text: clampText(stripHtml(selectedFreeNotes)),
        });
      }

      const customIndex = nbData.pages.map((p) => ({
        source: "custom",
        notebook: notebookNameById.get(p.notebook_id) || "Notebook",
        section: p.section_id ? sectionNameById.get(p.section_id) || null : null,
        page: p.title || "Untitled page",
        text: clampText(stripHtml(p.content || "")),
      })).filter((row) => row.text);

      const notebookIndex = [
        ...journalIndex,
        ...freeNotesIndex,
        ...customIndex,
      ];

      const tokens = tokenizeForSearch(aiQuestion);
      const phrases = extractQuotedPhrases(aiQuestion);

      const searchHits = notebookIndex
        .map((item) => {
          const hay = item.text.toLowerCase();
          let score = 0;
          for (const phrase of phrases) {
            if (hay.includes(phrase.toLowerCase())) score += 10;
          }
          for (const token of tokens) {
            if (hay.includes(token)) score += 1;
          }
          return { item, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map(({ item, score }) => {
          const token = phrases[0] || tokens[0] || "";
          const snippet = token ? buildSnippet(item.text, token) : item.text.slice(0, 160).trim();
          let location = "";
          if (item.source === "journal") {
            const blockLabel =
              item.block === "premarket"
                ? "Premarket"
                : item.block === "inside"
                ? "Inside trade"
                : item.block === "after"
                ? "After market"
                : "Notes";
            location = `Journal ${item.date} · ${blockLabel}`;
          } else if (item.source === "free_notes") {
            location = `Journal ${item.date} · Free notebook`;
          } else {
            const parts = [
              `Notebook "${item.notebook}"`,
              item.section ? `Section "${item.section}"` : null,
              `Page "${item.page}"`,
            ].filter(Boolean);
            location = parts.join(" > ");
          }
          return { location, snippet, source: item.source, score };
        });

      const languageHint = detectLanguage(aiQuestion);

      const session = await supabaseBrowser.auth.getSession();
      const token = session?.data?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/notebook-ai", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: aiQuestion,
          language: languageHint,
          notebook: {
            selectedDate: anyEntry.date || selectedJournalDate || null,
            selectedNotes: structuredNotes,
            selectedFreeNotes: clampText(stripHtml(selectedFreeNotes || "")),
            selectedTags: combinedTags,
            activePage: (() => {
              const page = nbData.pages.find((p) => p.id === activePageId);
              if (!page) return null;
              return {
                notebook: notebookNameById.get(page.notebook_id) || "Notebook",
                section: page.section_id ? sectionNameById.get(page.section_id) || null : null,
                page: page.title || "Untitled page",
                text: clampText(stripHtml(page.content || "")),
              };
            })(),
            indexStats: {
              journalBlocks: journalIndex.length,
              freeNotesBlocks: freeNotesIndex.length,
              customPages: customIndex.length,
              totalBlocks: notebookIndex.length,
            },
            searchHits,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Bad response");
      }

      const data = await res.json();
      setAiAnswer(
        data.answer ??
          L(
            "The AI coach did not return a message. Please try again.",
            "El coach AI no devolvió un mensaje. Intenta de nuevo."
          )
      );
    } catch (err) {
      console.error(err);
      setAiAnswer(
        L(
          "There was an error talking to the AI coach. Please try again in a moment.",
          "Hubo un error al hablar con el coach AI. Intenta de nuevo en un momento."
        )
      );
    } finally {
      setAiLoading(false);
    }
  };

  // acciones para custom notebooks (Supabase)
  const handleAddNotebook = () => {
    setSubView("custom");
    setCreateMode("book");
    setCreateName("");
    setCreateNotebookId(activeNotebookId ?? nbData.notebooks[0]?.id ?? null);
    setCreateSectionId(null);
    setCreateError(null);
  };

  const handleAddSection = (targetNotebookId?: string | null) => {
    const nextNotebookId = targetNotebookId ?? activeNotebookId ?? nbData.notebooks[0]?.id ?? null;
    setSubView("custom");
    setCreateMode("section");
    setCreateName("");
    setCreateNotebookId(nextNotebookId);
    setCreateSectionId(null);
    setCreateError(null);
  };

  const handleAddPage = (targetSectionId?: string | null, targetNotebookId?: string | null) => {
    const nextNotebookId = targetNotebookId ?? activeNotebookId ?? nbData.notebooks[0]?.id ?? null;
    const nextSectionId =
      targetSectionId === undefined
        ? activeSectionId
        : targetSectionId;
    setSubView("custom");
    setCreateMode("page");
    setCreateName("");
    setCreateNotebookId(nextNotebookId);
    setCreateSectionId(nextSectionId ?? null);
    setCreateError(null);
  };

  const closeCreateModal = () => {
    setCreateMode(null);
    setCreateName("");
    setCreateError(null);
  };

  const openManageModal = (target: ManageTarget) => {
    setManageTarget(target);
    setManageError(null);
    if (target.kind === "book") {
      setManageName(target.book.name);
      setManageNotebookId(target.book.id);
      setManageSectionId(null);
      return;
    }
    if (target.kind === "section") {
      setManageName(target.section.name);
      setManageNotebookId(target.section.notebook_id);
      setManageSectionId(target.section.id);
      return;
    }
    setManageName(target.page.title);
    setManageNotebookId(target.page.notebook_id);
    setManageSectionId(target.page.section_id ?? UNASSIGNED_SECTION_KEY);
  };

  const closeManageModal = () => {
    setManageTarget(null);
    setManageError(null);
  };

  const handleCreateNotebookItem = async () => {
    if (!userId || !activeAccountId || !createMode) return;

    const trimmed = createName.trim();
    const untitledNotebook = L("Untitled notebook", "Notebook sin título");
    const untitledPage = L("Untitled page", "Página sin título");

    if (createMode === "section" && !trimmed) {
      setCreateError(L("Section name is required.", "El nombre de la sección es requerido."));
      return;
    }

    if ((createMode === "section" || createMode === "page") && !createNotebookId) {
      setCreateError(L("Select a notebook first.", "Selecciona primero un notebook."));
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      if (createMode === "book") {
        const created = await createNotebookBook(
          userId,
          activeAccountId,
          trimmed || untitledNotebook
        );
        if (!created) {
          throw new Error(L("We couldn't create the notebook.", "No pudimos crear el notebook."));
        }
        closeCreateModal();
        await reloadNotebookWorkspace({
          notebookId: created.id,
          sectionId: null,
          pageId: null,
        });
        return;
      }

      if (createMode === "section") {
        const createdSection = await createNotebookSection(userId, createNotebookId!, trimmed);
        if (!createdSection) {
          throw new Error(L("We couldn't create the section.", "No pudimos crear la sección."));
        }
        closeCreateModal();
        await reloadNotebookWorkspace({
          notebookId: createNotebookId,
          sectionId: createdSection.id,
          pageId: null,
        });
        return;
      }

      const sectionId =
        createSectionId && createSectionId !== UNASSIGNED_SECTION_KEY
          ? createSectionId
          : null;
      const createdPage = await createNotebookPage(
        userId,
        createNotebookId!,
        sectionId,
        trimmed || untitledPage
      );
      if (!createdPage) {
        throw new Error(L("We couldn't create the page.", "No pudimos crear la página."));
      }
      closeCreateModal();
      await reloadNotebookWorkspace({
        notebookId: createNotebookId,
        sectionId: sectionId ?? UNASSIGNED_SECTION_KEY,
        pageId: createdPage.id,
      });
    } catch (err: any) {
      setCreateError(
        err?.message ??
          L("We couldn't create this notebook item.", "No pudimos crear este elemento del notebook.")
      );
    } finally {
      setCreating(false);
    }
  };

  const handleManageNotebookItem = async () => {
    if (!userId || !manageTarget) return;

    const trimmed = manageName.trim();
    if (!trimmed) {
      setManageError(L("Name is required.", "El nombre es requerido."));
      return;
    }

    setManaging(true);
    setManageError(null);

    try {
      if (manageTarget.kind === "book") {
        const ok = await updateNotebookBook(userId, manageTarget.book.id, { name: trimmed });
        if (!ok) {
          throw new Error(L("We couldn't update the notebook.", "No pudimos actualizar el notebook."));
        }
        closeManageModal();
        await reloadNotebookWorkspace({
          notebookId: manageTarget.book.id,
          sectionId: activeSectionIdRef.current,
          pageId: activePageIdRef.current,
        });
        return;
      }

      if (!manageNotebookId) {
        throw new Error(L("Select a notebook first.", "Selecciona primero un notebook."));
      }

      if (manageTarget.kind === "section") {
        const movedNotebook = manageNotebookId !== manageTarget.section.notebook_id;
        const ok = await updateNotebookSection(userId, manageTarget.section.id, {
          name: trimmed,
          notebook_id: manageNotebookId,
        });
        if (!ok) {
          throw new Error(L("We couldn't update the section.", "No pudimos actualizar la sección."));
        }

        if (movedNotebook) {
          const { error } = await supabaseBrowser
            .from(NOTEBOOK_PAGES_TABLE)
            .update({
              notebook_id: manageNotebookId,
              updated_at: new Date().toISOString(),
            })
            .eq("section_id", manageTarget.section.id)
            .eq("user_id", userId);
          if (error) throw error;
        }

        closeManageModal();
        await reloadNotebookWorkspace({
          notebookId: manageNotebookId,
          sectionId: manageTarget.section.id,
          pageId: null,
        });
        return;
      }

      const nextSectionId =
        manageSectionId && manageSectionId !== UNASSIGNED_SECTION_KEY
          ? manageSectionId
          : null;
      const ok = await updateNotebookPage(userId, manageTarget.page.id, {
        title: trimmed,
        notebook_id: manageNotebookId,
        section_id: nextSectionId,
      });
      if (!ok) {
        throw new Error(L("We couldn't update the page.", "No pudimos actualizar la página."));
      }

      closeManageModal();
      await reloadNotebookWorkspace({
        notebookId: manageNotebookId,
        sectionId: nextSectionId ?? UNASSIGNED_SECTION_KEY,
        pageId: manageTarget.page.id,
      });
    } catch (err: any) {
      setManageError(
        err?.message ??
          L("We couldn't update this notebook item.", "No pudimos actualizar este elemento del notebook.")
      );
    } finally {
      setManaging(false);
    }
  };

  const handleDeleteNotebookItem = async () => {
    if (!userId || !manageTarget) return;

    const title =
      manageTarget.kind === "book"
        ? manageTarget.book.name
        : manageTarget.kind === "section"
        ? manageTarget.section.name
        : manageTarget.page.title;

    const confirmed = window.confirm(
      manageTarget.kind === "book"
        ? `${title}\n\n${L(
            "This deletes the notebook, every section, and every page inside it.",
            "Esto borra el notebook, todas sus secciones y todas sus páginas."
          )}`
        : manageTarget.kind === "section"
        ? `${title}\n\n${L(
            "This deletes the section and leaves its pages as loose pages.",
            "Esto borra la sección y deja sus páginas como páginas sueltas."
          )}`
        : `${title}\n\n${L(
            "This deletes the page permanently.",
            "Esto borra la página permanentemente."
          )}`
    );

    if (!confirmed) return;

    setManaging(true);
    setManageError(null);

    try {
      if (manageTarget.kind === "book") {
        const { error: pagesError } = await supabaseBrowser
          .from(NOTEBOOK_PAGES_TABLE)
          .delete()
          .eq("notebook_id", manageTarget.book.id)
          .eq("user_id", userId);
        if (pagesError) throw pagesError;

        const { error: sectionsError } = await supabaseBrowser
          .from(NOTEBOOK_SECTIONS_TABLE)
          .delete()
          .eq("notebook_id", manageTarget.book.id)
          .eq("user_id", userId);
        if (sectionsError) throw sectionsError;

        const ok = await deleteNotebookBook(userId, manageTarget.book.id);
        if (!ok) {
          throw new Error(L("We couldn't delete the notebook.", "No pudimos borrar el notebook."));
        }
      } else if (manageTarget.kind === "section") {
        const { error: releaseError } = await supabaseBrowser
          .from(NOTEBOOK_PAGES_TABLE)
          .update({
            section_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("section_id", manageTarget.section.id)
          .eq("user_id", userId);
        if (releaseError) throw releaseError;

        const ok = await deleteNotebookSection(userId, manageTarget.section.id);
        if (!ok) {
          throw new Error(L("We couldn't delete the section.", "No pudimos borrar la sección."));
        }
      } else {
        const ok = await deleteNotebookPage(userId, manageTarget.page.id);
        if (!ok) {
          throw new Error(L("We couldn't delete the page.", "No pudimos borrar la página."));
        }
      }

      closeManageModal();
      await reloadNotebookWorkspace({
        notebookId:
          manageTarget.kind === "book"
            ? nbData.notebooks.find((notebook) => notebook.id !== manageTarget.book.id)?.id ?? null
            : manageTarget.kind === "section"
            ? manageTarget.section.notebook_id
            : manageTarget.page.notebook_id,
        sectionId:
          manageTarget.kind === "section"
            ? UNASSIGNED_SECTION_KEY
            : manageTarget.kind === "page"
            ? manageTarget.page.section_id ?? UNASSIGNED_SECTION_KEY
            : null,
        pageId: null,
      });
    } catch (err: any) {
      setManageError(
        err?.message ??
          L("We couldn't delete this notebook item.", "No pudimos borrar este elemento del notebook.")
      );
    } finally {
      setManaging(false);
    }
  };

  const updateActivePage = (patch: Partial<LocalNotebookPage>) => {
    if (!activePage || !userId) return;
    const id = activePage.id;
    const now = new Date().toISOString();
    const currentPage =
      nbDataRef.current.pages.find((page) => page.id === id) ?? activePage;
    const nextPage = {
      ...currentPage,
      ...patch,
      updated_at: now,
    };
    setNbData((prev) => {
      const next = {
        notebooks: prev.notebooks,
        sections: prev.sections,
        pages: prev.pages.map((page) =>
          page.id === id ? nextPage : page
        ),
      };
      nbDataRef.current = next;
      return next;
    });

    if (pageSaveTimers.current[id]) {
      clearTimeout(pageSaveTimers.current[id]);
    }
    setPageSaveState((prev) => ({ ...prev, [id]: { state: "saving" } }));
    pageSaveTimers.current[id] = setTimeout(() => {
      void (async () => {
        try {
          await updateNotebookPage(userId, id, {
            title: nextPage.title,
            content: nextPage.content,
            section_id: nextPage.section_id ?? null,
            notebook_id: nextPage.notebook_id,
            ink: nextPage.ink,
          });
          setPageSaveState((prev) => ({
            ...prev,
            [id]: { state: "saved", ts: Date.now() },
          }));
        } catch {
          setPageSaveState((prev) => ({
            ...prev,
            [id]: { state: "error", ts: Date.now() },
          }));
        }
      })();
    }, 400);
  };

  if (planLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-16">
          <p className="text-sm text-slate-400">{L("Loading…", "Cargando…")}</p>
        </div>
      </main>
    );
  }

  if (plan !== "advanced") {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-emerald-300 text-[11px] uppercase tracking-[0.3em]">
              {L("Advanced feature", "Función Advanced")}
            </p>
            <h1 className="text-xl font-semibold mt-2">
              {L(
                "Notebook is included in Advanced",
                "El Notebook está incluido en Advanced"
              )}
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              {L(
                "Upgrade to Advanced to unlock the full notebook experience, custom pages, and richer journaling.",
                "Actualiza a Advanced para desbloquear el notebook completo, páginas personalizadas y un journaling más profundo."
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/billing"
                className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
              >
                {L("Upgrade to Advanced", "Actualizar a Advanced")}
              </Link>
              <Link
                href="/plans-comparison"
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 transition"
              >
                {L("Compare plans", "Comparar planes")}
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Loading global
  if (authLoading || accountsLoading || entriesLoading || nbLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 px-6 md:px-10 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {L("Daily notebook", "Notebook diario")}
        </h1>
        <p className="text-slate-400 mt-2 text-sm">
          {L("Loading your notebook…", "Cargando tu notebook…")}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-6 md:px-10 py-8">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400/60 hover:text-emerald-100 transition"
          >
            ← {L("Back", "Volver")}
          </button>

          <Link
            href={`/journal/${todayStr}`}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20 transition"
          >
            {L("Open today's journal page", "Abrir la página del journal de hoy")}
            <span className="text-xs text-emerald-200/80">
              ({formatShortDate(todayStr, lang)})
            </span>
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {L("Daily notebook", "Notebook diario")}
          </h1>
          <p className="text-slate-400 mt-1">
            {L(
              "Your journal in notebook format – free space for trading, study and life notes.",
              "Tu journal en formato notebook – espacio libre para trading, estudio y notas de vida."
            )}
          </p>
        </div>
      </header>

      {/* Tabs principales */}
      <div className="mt-6 inline-flex rounded-full bg-slate-900/80 border border-slate-800 p-1">
        <button
          type="button"
          onClick={() => setView("notebook")}
          className={`px-4 py-1.5 text-sm rounded-full transition ${
            view === "notebook"
              ? "bg-slate-800 text-slate-50 shadow-sm"
              : "text-slate-400 hover:text-slate-100"
          }`}
        >
          {L("Notebook pages", "Páginas del notebook")}
        </button>
        <button
          type="button"
          onClick={() => setView("calendar")}
          className={`px-4 py-1.5 text-sm rounded-full transition ${
            view === "calendar"
              ? "bg-slate-800 text-slate-50 shadow-sm"
              : "text-slate-400 hover:text-slate-100"
          }`}
        >
          {L("Calendar & holidays", "Calendario y feriados")}
        </button>
      </div>

      {view === "notebook" ? (
        <section className="mt-6 space-y-6">
          {/* Sub-tabs */}
          <div className="inline-flex rounded-full bg-slate-900/70 border border-slate-800 p-1">
            <button
              type="button"
              onClick={() => setSubView("journal")}
              className={`px-4 py-1.5 text-xs md:text-sm rounded-full transition ${
                subView === "journal"
                  ? "bg-slate-800 text-slate-50 shadow-sm"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {L("Journal notebook", "Notebook del journal")}
            </button>
            <button
              type="button"
              onClick={() => setSubView("custom")}
              className={`px-4 py-1.5 text-xs md:text-sm rounded-full transition ${
                subView === "custom"
                  ? "bg-slate-800 text-slate-50 shadow-sm"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {L("Custom notebooks", "Notebooks personalizados")}
            </button>
          </div>

          {/* ===== JOURNAL NOTEBOOK VIEW ===== */}
          {subView === "journal" && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-800 bg-linear-to-br from-slate-950 via-slate-900 to-sky-950/20 p-5 md:p-6">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div className="max-w-2xl">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-sky-300">
                      {L("Daily flow", "Flujo diario")}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                      {selectedJournalLabel ||
                        L(
                          "Daily pages with summaries and notebook space",
                          "Páginas diarias con resúmenes y espacio de notebook"
                        )}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-slate-300">
                      {selectedJournalPreview ||
                        L(
                          "Review your journal blocks, then use the notebook space to write the context that does not fit inside the structured journal.",
                          "Revisa tus bloques del journal y luego usa el espacio del notebook para escribir el contexto que no cabe dentro del journal estructurado."
                        )}
                    </p>
                  </div>

                  {selectedJournalEntry ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/journal/${(selectedJournalEntry as any).date}`}
                        className="rounded-full bg-sky-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition"
                      >
                        {L("Open full journal page", "Abrir journal completo")}
                      </Link>
                      <Link
                        href={`/journal/${todayStr}`}
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-sky-400/60 hover:text-sky-100 transition"
                      >
                        {L("Jump to today", "Ir a hoy")}
                      </Link>
                    </div>
                  ) : null}
                </div>

                {selectedJournalEntry ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Day P&L", "P&L del día")}
                      </p>
                      <p
                        className={`mt-2 text-2xl font-semibold tabular-nums ${
                          selectedJournalPnl >= 0 ? "text-emerald-300" : "text-sky-300"
                        }`}
                      >
                        {selectedJournalPnl >= 0 ? "+" : ""}${selectedJournalPnl.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Journal blocks", "Bloques del journal")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-50">
                        {writtenJournalBlocks}/3
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Trades tracked", "Trades registrados")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-50">
                        {entriesFromNotes.length + exitsFromNotes.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Notebook state", "Estado del notebook")}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-100">
                        {freeNotesStatus?.state === "saving"
                          ? L("Saving…", "Guardando…")
                          : freeNotesStatus?.state === "error"
                          ? L("Save failed", "Error al guardar")
                          : freeNotesStatus?.state === "saved"
                          ? `${L("Saved", "Guardado")} ${formatSavedTime(freeNotesStatus.ts, lang)}`
                          : L("Autosave ready", "Autosave listo")}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {sorted.length === 0 ? (
                <p className="text-slate-500 text-sm mt-3">
                  {L(
                    "You don't have journal pages yet. Create your first entry from the journal to see it here.",
                    "Aún no tienes páginas del journal. Crea tu primera entrada en el journal para verla aquí."
                  )}
                </p>
              ) : (
                <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <aside className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Daily note explorer", "Explorador de notas diarias")}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-100">
                        {L("Recent journal days", "Días recientes del journal")}
                      </h3>
                      <p className="mt-1 text-xs leading-6 text-slate-400">
                        {L(
                          "Move across your recent daily notes without leaving the notebook workspace.",
                          "Muévete entre tus notas diarias recientes sin salir del workspace del notebook."
                        )}
                      </p>
                    </div>

                    <div className="space-y-2 max-h-[840px] overflow-y-auto pr-1">
                      {sorted.map((entry: any) => {
                        const isSelected = selectedJournalDate === entry.date;
                        const preview = getNotebookPreview(
                          entry.notes,
                          L(
                            "This day has structured notes saved in the journal blocks.",
                            "Este día tiene notas estructuradas guardadas en los bloques del journal."
                          )
                        );
                        const dailyLayer =
                          dailyNotebookByDate[entry.date] ??
                          createNotebookEditableContent();
                        const dailyLayerSurface = describeSurface(
                          getNotebookSurfaceMeta(
                            dailyLayer.content,
                            dailyLayer.ink
                          )
                        );

                        return (
                          <motion.button
                            key={entry.date}
                            type="button"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.985 }}
                            onClick={() => setSelectedJournalDate(entry.date)}
                            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                              isSelected
                                ? "border-sky-400/60 bg-sky-500/10 text-sky-50"
                                : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-sky-400/40 hover:bg-slate-900"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold">
                                {formatShortDate(entry.date, lang)}
                              </span>
                              <span
                                className={`text-[11px] font-medium tabular-nums ${
                                  Number(entry.pnl || 0) >= 0 ? "text-emerald-300" : "text-sky-300"
                                }`}
                              >
                                {Number(entry.pnl || 0) >= 0 ? "+" : ""}${Number(entry.pnl || 0).toFixed(0)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dailyLayerSurface.badgeClass}`}
                              >
                                {dailyLayerSurface.label}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {dailyLayerSurface.detail}
                              </span>
                            </div>
                            {preview ? (
                              <p className="mt-2 text-[11px] leading-5 text-slate-400 line-clamp-3">
                                {preview}
                              </p>
                            ) : null}
                          </motion.button>
                        );
                      })}
                    </div>
                  </aside>

                  <section className="space-y-4">
                    {selectedJournalEntry ? (
                      <>
                        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 md:p-6 space-y-4">
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-sky-300">
                                {L("Daily notebook", "Notebook diario")}
                              </p>
                              <h3 className="mt-1 text-2xl font-semibold text-slate-50">
                                {selectedJournalLabel}
                              </h3>
                              <p className="mt-1 text-sm text-slate-400">
                                {L(
                                  "Use this as the free-form layer on top of your journal: context, psychology, ideas, preparation, and meaning.",
                                  "Usa esto como la capa libre encima de tu journal: contexto, psicología, ideas, preparación y significado."
                                )}
                              </p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${selectedFreeNoteSurface.badgeClass}`}
                                >
                                  {selectedFreeNoteSurface.label}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {selectedFreeNoteSurface.detail}
                                </span>
                              </div>
                            </div>

                            {freeNotesStatus?.state ? (
                              <span
                                className={`text-[11px] font-medium ${
                                  freeNotesStatus.state === "saving"
                                    ? "text-amber-300"
                                    : freeNotesStatus.state === "error"
                                    ? "text-rose-300"
                                    : "text-emerald-300"
                                }`}
                              >
                                {freeNotesStatus.state === "saving" &&
                                  L("Saving…", "Guardando…")}
                                {freeNotesStatus.state === "error" &&
                                  L("Save failed", "Error al guardar")}
                                {freeNotesStatus.state === "saved" &&
                                  `${L("Saved", "Guardado")} ${formatSavedTime(
                                    freeNotesStatus.ts,
                                    lang
                                  )}`}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">
                                {L("Autosave on edit", "Autosave al editar")}
                              </span>
                            )}
                          </div>

                          <NotebookInkField
                            label={L("Daily notebook surface", "Superficie del notebook diario")}
                            value={selectedFreeNote}
                            onChange={handleFreeNotesChange}
                            placeholder={L(
                              "Write anything here: study notes, psychology reflections, execution notes, and ideas connected to this day.",
                              "Escribe aquí: notas de estudio, reflexiones de psicología, notas de ejecución e ideas conectadas con este día."
                            )}
                            minHeight={340}
                          />
                        </div>

                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 md:p-6 space-y-4">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                  {L("Journal snapshot", "Snapshot del journal")}
                                </p>
                                <h3 className="mt-1 text-lg font-semibold text-slate-50">
                                  {L(
                                    "Structured context for this day",
                                    "Contexto estructurado de este día"
                                  )}
                                </h3>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {combinedTags.length > 0 ? (
                                  combinedTags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200"
                                    >
                                      {tag}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-slate-500">
                                    {L("No tags yet", "Aún sin tags")}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                  {L("Entries", "Entradas")}
                                </p>
                                <p className="mt-2 text-xl font-semibold text-slate-50">
                                  {entriesFromNotes.length}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                  {L("Exits", "Salidas")}
                                </p>
                                <p className="mt-2 text-xl font-semibold text-slate-50">
                                  {exitsFromNotes.length}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                  {L("Written blocks", "Bloques escritos")}
                                </p>
                                <p className="mt-2 text-xl font-semibold text-slate-50">
                                  {writtenJournalBlocks}
                                </p>
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                              {selectedJournalCards.map((card) => (
                                <div
                                  key={card.title}
                                  className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3"
                                >
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                    {card.title}
                                  </p>
                                  <p className="mt-2 text-sm leading-6 text-slate-200 line-clamp-6">
                                    {card.body ||
                                      L(
                                        "No notes saved yet for this block.",
                                        "Aún no hay notas guardadas para este bloque."
                                      )}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-3xl border border-emerald-500/40 bg-linear-to-br from-slate-950 via-slate-950 to-emerald-900/30 p-4 md:p-5 space-y-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                                {L("AI coach", "Coach AI")}
                              </p>
                              <h3 className="mt-1 text-lg font-semibold text-emerald-50">
                                {L(
                                  "Ask about this day and your notebook",
                                  "Pregunta sobre este día y tu notebook"
                                )}
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-emerald-50/80">
                                {L(
                                  "The AI can summarize patterns, locate notes, and help you connect your journal blocks with your free-form notebook.",
                                  "El AI puede resumir patrones, ubicar notas y ayudarte a conectar los bloques del journal con tu notebook libre."
                                )}
                              </p>
                            </div>

                            <textarea
                              value={aiQuestion}
                              onChange={(e) => setAiQuestion(e.target.value)}
                              placeholder={L(
                                "Example: What pattern keeps repeating in my execution on days like this one?",
                                "Ejemplo: ¿Qué patrón se sigue repitiendo en mi ejecución en días como este?"
                              )}
                              className="w-full rounded-2xl border border-emerald-500/40 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 resize-y min-h-[110px] focus:outline-none focus:ring-1 focus:ring-emerald-400/70"
                            />

                            <button
                              type="button"
                              onClick={handleAskAi}
                              disabled={aiLoading || !aiQuestion.trim()}
                              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {aiLoading
                                ? L("Thinking…", "Pensando…")
                                : L("Ask AI about this day", "Preguntar al AI sobre este día")}
                            </button>

                            {aiAnswer ? (
                              <div className="rounded-2xl border border-emerald-500/40 bg-slate-950/80 px-3 py-3 text-xs leading-6 text-emerald-50 whitespace-pre-wrap">
                                {aiAnswer}
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-emerald-500/30 bg-slate-950/40 px-3 py-3 text-xs leading-6 text-emerald-50/70">
                                {L(
                                  "Ask a direct question and the AI will answer only with the notebook and journal context available for this day.",
                                  "Haz una pregunta directa y el AI responderá solo con el contexto del notebook y del journal disponible para este día."
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">
                        {L(
                          "Select a day from the explorer to open its journal notebook.",
                          "Selecciona un día en el explorador para abrir su notebook del journal."
                        )}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          )}

          {/* ===== CUSTOM NOTEBOOKS VIEW ===== */}
          {subView === "custom" && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-800 bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950/20 p-5 md:p-6">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div className="max-w-2xl">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300">
                      {L("Custom workspace", "Workspace personalizado")}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                      {L(
                        "Notebook > section > page, with desktop-level editing",
                        "Notebook > sección > página, con edición a nivel desktop"
                      )}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-slate-300">
                      {L(
                        "This workspace keeps the stronger structure from mobile and adds the richer web editor, autosave, and longer-form writing flow.",
                        "Este workspace mantiene la estructura más fuerte del mobile y le suma el editor más rico de web, autosave y una experiencia mejor para escribir en profundidad."
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddNotebook}
                      className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300 transition"
                    >
                      {L("New notebook", "Nuevo notebook")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddSection()}
                      disabled={!activeNotebookId}
                      className="rounded-full border border-emerald-500/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {L("New section", "Nueva sección")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddPage()}
                      disabled={!activeNotebookId}
                      className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:text-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {L("New page", "Nueva página")}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Notebooks", "Notebooks")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-50">
                      {nbData.notebooks.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Sections", "Secciones")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-50">
                      {activeNotebookSections.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Pages in focus", "Páginas en foco")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-50">
                      {activeNotebookPages.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[260px_360px_minmax(0,1fr)]">
                <aside className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Workspace map", "Mapa del workspace")}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-100">
                        {L("Notebooks", "Notebooks")}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddNotebook}
                      className="rounded-full border border-emerald-500/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/10"
                    >
                      {L("+ Notebook", "+ Notebook")}
                    </button>
                  </div>

                  {nbLoading ? (
                    <p className="text-xs text-slate-500">{L("Loading…", "Cargando…")}</p>
                  ) : nbData.notebooks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                      {L(
                        "Create your first notebook to start organizing playbooks, reviews, and research.",
                        "Crea tu primer notebook para empezar a organizar playbooks, reviews e investigación."
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {nbData.notebooks.map((notebook) => {
                        const isActive = notebook.id === activeNotebookId;
                        const notebookSections = nbData.sections.filter(
                          (section) => section.notebook_id === notebook.id
                        );
                        const notebookPages = nbData.pages.filter(
                          (page) => page.notebook_id === notebook.id
                        );
                        return (
                          <div
                            key={notebook.id}
                            className={`rounded-2xl border p-3 transition ${
                              isActive
                                ? "border-emerald-400/60 bg-emerald-500/10"
                                : "border-slate-800 bg-slate-900/60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveNotebookId(notebook.id);
                                  setActivePageId(null);
                                }}
                                className="flex-1 text-left"
                              >
                                <p className="text-sm font-semibold text-slate-100">
                                  {notebook.name}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-400">
                                  {notebookPages.length} {L("pages", "páginas")} · {notebookSections.length} {L("sections", "secciones")}
                                </p>
                              </button>
                              <button
                                type="button"
                                onClick={() => openManageModal({ kind: "book", book: notebook })}
                                className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-400/50 hover:text-emerald-100"
                              >
                                {L("Manage", "Gestionar")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </aside>

                <aside className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Workspace explorer", "Explorador del workspace")}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-100">
                        {activeNotebook?.name || L("Select a notebook", "Selecciona un notebook")}
                      </h3>
                    </div>
                    {activeNotebook ? (
                      <button
                        type="button"
                        onClick={() => handleAddSection(activeNotebook.id)}
                        className="rounded-full border border-emerald-500/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/10"
                      >
                        {L("+ Section", "+ Sección")}
                      </button>
                    ) : null}
                  </div>

                  {!activeNotebook ? (
                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                      {L(
                        "Pick a notebook to reveal its sections, loose pages, and writing context.",
                        "Elige un notebook para ver sus secciones, páginas sueltas y contexto de escritura."
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className={`rounded-2xl border p-3 transition ${
                        activeSectionId === UNASSIGNED_SECTION_KEY
                          ? "border-emerald-400/60 bg-emerald-500/10"
                          : "border-slate-800 bg-slate-900/60"
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveSectionId(UNASSIGNED_SECTION_KEY)}
                            className="flex-1 text-left"
                          >
                            <p className="text-sm font-semibold text-slate-100">
                              {L("Loose pages", "Páginas sueltas")}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {activeLoosePages.length} {L("pages outside sections", "páginas fuera de secciones")}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddPage(UNASSIGNED_SECTION_KEY, activeNotebook.id)}
                            className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-400/50 hover:text-emerald-100"
                          >
                            {L("+ Page", "+ Página")}
                          </button>
                        </div>

                        {activeLoosePages.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {activeLoosePages.map((page) => {
                              const isActive = page.id === activePage?.id;
                              const pageSurface = describeSurface(
                                getNotebookSurfaceMeta(page.content, page.ink)
                              );
                              return (
                                <div
                                  key={page.id}
                                  className={`rounded-xl border p-2 transition ${
                                    isActive
                                      ? "border-emerald-400/60 bg-emerald-500/10"
                                      : "border-slate-800 bg-slate-950/70"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveSectionId(UNASSIGNED_SECTION_KEY);
                                        setActivePageId(page.id);
                                      }}
                                      className="flex-1 text-left"
                                    >
                                      <p className="text-xs font-semibold text-slate-100">
                                        {page.title}
                                      </p>
                                      <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <span
                                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pageSurface.badgeClass}`}
                                        >
                                          {pageSurface.label}
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                          {pageSurface.detail}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">
                                        {getNotebookBodyPreview(page.content, page.ink, {
                                          empty: L("No notes yet.", "Sin notas aún."),
                                          sketch: L("Ink sketch saved.", "Sketch en ink guardado."),
                                          iosSketch: L("iPad sketch saved.", "Sketch de iPad guardado."),
                                        })}
                                      </p>
                                      <p className="mt-1 text-[10px] text-slate-500">
                                        {formatShortDateTime(
                                          page.updated_at ?? page.created_at,
                                          lang
                                        ) || L("No update yet", "Sin actualización todavía")}
                                      </p>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openManageModal({ kind: "page", page })}
                                      className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-400/50 hover:text-emerald-100"
                                    >
                                      {L("Manage", "Gestionar")}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-3 text-[11px] text-slate-500">
                            {L("No loose pages yet.", "Todavía no hay páginas sueltas.")}
                          </p>
                        )}
                      </div>

                      {activeNotebookSections.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                          {L("Create a section or start with a loose page.", "Crea una sección o empieza con una página suelta.")}
                        </p>
                      ) : (
                        activeNotebookSections.map((section) => {
                          const isOpen = sectionExpanded[section.id] ?? true;
                          const isActive = activeSectionId === section.id;
                          const sectionPages = pagesBySection[section.id] || [];
                          return (
                            <div
                              key={section.id}
                              className={`rounded-2xl border p-3 transition ${
                                isActive
                                  ? "border-emerald-400/60 bg-emerald-500/10"
                                  : "border-slate-800 bg-slate-900/60"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveSectionId(section.id)}
                                  className="flex-1 text-left"
                                >
                                  <p className="text-sm font-semibold text-slate-100">
                                    {section.name}
                                  </p>
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    {sectionPages.length} {L("pages", "páginas")}
                                  </p>
                                </button>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSectionExpanded((prev) => ({
                                        ...prev,
                                        [section.id]: !isOpen,
                                      }))
                                    }
                                    className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-400/50 hover:text-emerald-100"
                                  >
                                    {isOpen ? L("Collapse", "Colapsar") : L("Open", "Abrir")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAddPage(section.id, activeNotebook.id)}
                                    className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-400/50 hover:text-emerald-100"
                                  >
                                    {L("+ Page", "+ Página")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openManageModal({ kind: "section", section })}
                                    className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-400/50 hover:text-emerald-100"
                                  >
                                    {L("Manage", "Gestionar")}
                                  </button>
                                </div>
                              </div>

                              <AnimatePresence initial={false}>
                                {isOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-3 space-y-2">
                                      {sectionPages.length === 0 ? (
                                        <p className="text-[11px] text-slate-500">
                                          {L("No pages in this section yet.", "Todavía no hay páginas en esta sección.")}
                                        </p>
                                      ) : (
                                        sectionPages.map((page) => {
                                          const isCurrentPage = page.id === activePage?.id;
                                          const pageSurface = describeSurface(
                                            getNotebookSurfaceMeta(page.content, page.ink)
                                          );
                                          return (
                                            <div
                                              key={page.id}
                                              className={`rounded-xl border p-2 transition ${
                                                isCurrentPage
                                                  ? "border-emerald-400/60 bg-emerald-500/10"
                                                  : "border-slate-800 bg-slate-950/70"
                                              }`}
                                            >
                                              <div className="flex items-start justify-between gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setActiveSectionId(section.id);
                                                    setActivePageId(page.id);
                                                  }}
                                                  className="flex-1 text-left"
                                                >
                                                  <p className="text-xs font-semibold text-slate-100">
                                                    {page.title}
                                                  </p>
                                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                                    <span
                                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pageSurface.badgeClass}`}
                                                    >
                                                      {pageSurface.label}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500">
                                                      {pageSurface.detail}
                                                    </span>
                                                  </div>
                                                  <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">
                                                    {getNotebookBodyPreview(page.content, page.ink, {
                                                      empty: L("No notes yet.", "Sin notas aún."),
                                                      sketch: L("Ink sketch saved.", "Sketch en ink guardado."),
                                                      iosSketch: L("iPad sketch saved.", "Sketch de iPad guardado."),
                                                    })}
                                                  </p>
                                                  <p className="mt-1 text-[10px] text-slate-500">
                                                    {formatShortDateTime(
                                                      page.updated_at ?? page.created_at,
                                                      lang
                                                    ) || L("No update yet", "Sin actualización todavía")}
                                                  </p>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => openManageModal({ kind: "page", page })}
                                                  className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-emerald-400/50 hover:text-emerald-100"
                                                >
                                                  {L("Manage", "Gestionar")}
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </aside>

                <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 md:p-6 space-y-4">
                  {activeNotebook ? (
                    <>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                              {L("Workspace", "Workspace")}
                            </p>
                            <h3 className="mt-1 text-2xl font-semibold text-slate-50">
                              {activeNotebook.name}
                            </h3>
                            <p className="mt-1 text-sm text-slate-400">
                              {L("Current lane:", "Carril actual:")}{" "}
                              <span className="font-medium text-slate-200">{activeSectionLabel}</span>
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openManageModal({ kind: "book", book: activeNotebook })}
                              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/50 hover:text-emerald-100"
                            >
                              {L("Manage notebook", "Gestionar notebook")}
                            </button>
                            {activeSectionId && activeSectionId !== UNASSIGNED_SECTION_KEY ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const currentSection = activeNotebookSections.find(
                                    (section) => section.id === activeSectionId
                                  );
                                  if (currentSection) {
                                    openManageModal({ kind: "section", section: currentSection });
                                  }
                                }}
                                className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/50 hover:text-emerald-100"
                              >
                                {L("Manage section", "Gestionar sección")}
                              </button>
                            ) : null}
                            {activePage ? (
                              <button
                                type="button"
                                onClick={() => openManageModal({ kind: "page", page: activePage })}
                                className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/50 hover:text-emerald-100"
                              >
                                {L("Manage page", "Gestionar página")}
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-4">
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {L("Page mode", "Modo de la página")}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-100">
                              {activePageMode === "ink"
                                ? L("Ink canvas", "Canvas de ink")
                                : L("Rich text editor", "Editor enriquecido")}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {L("Last update", "Última actualización")}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-100">
                              {activePageUpdatedAt
                                ? formatShortDateTime(activePageUpdatedAt, lang)
                                : "—"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {L("Surface", "Superficie")}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-100">
                              {activePageSurface.label}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {activePageSurface.detail}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {L("Focus", "Enfoque")}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-100">
                              {activePage ? activePage.title : L("Select a page", "Selecciona una página")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {activePage ? (
                        <div className="space-y-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex-1">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                {L("Page title", "Título de la página")}
                              </p>
                              <input
                                type="text"
                                value={activePage.title}
                                onChange={(e) => updateActivePage({ title: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                              />
                            </div>
                            {activePageStatus?.state ? (
                              <span
                                className={`text-[11px] font-medium ${
                                  activePageStatus.state === "saving"
                                    ? "text-amber-300"
                                    : activePageStatus.state === "error"
                                    ? "text-rose-300"
                                    : "text-emerald-300"
                                }`}
                              >
                                {activePageStatus.state === "saving" &&
                                  L("Saving…", "Guardando…")}
                                {activePageStatus.state === "error" &&
                                  L("Save failed", "Error al guardar")}
                                {activePageStatus.state === "saved" &&
                                  `${L("Saved", "Guardado")} ${formatSavedTime(
                                    activePageStatus.ts,
                                    lang
                                  )}`}
                              </span>
                            ) : null}
                          </div>

                          <NotebookInkField
                            label={L("Page body", "Cuerpo de la página")}
                            value={createNotebookEditableContent(
                              activePage.content,
                              activePage.ink
                            )}
                            onChange={(nextValue) =>
                              updateActivePage({
                                content: nextValue.content,
                                ink: nextValue.ink,
                              })
                            }
                            placeholder={L(
                              "Write your page here. Use this as a real knowledge workspace: process notes, playbooks, post-trade reviews, or research.",
                              "Escribe tu página aquí. Úsalo como un workspace real de conocimiento: notas de proceso, playbooks, reviews post-trade o investigación."
                            )}
                            minHeight={520}
                          />
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">
                          <p className="text-base font-semibold text-slate-200">
                            {L("Pick a page or create a new one.", "Elige una página o crea una nueva.")}
                          </p>
                          <p className="mt-2">
                            {L(
                              "This workspace is ready. What is missing is the page you want to work on.",
                              "Este workspace ya está listo. Lo que falta es la página en la que quieres trabajar."
                            )}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleAddPage()}
                              className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300 transition"
                            >
                              {L("Create page", "Crear página")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddSection()}
                              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/50 hover:text-emerald-100 transition"
                            >
                              {L("Create section", "Crear sección")}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 p-6 text-sm text-slate-400">
                      {L(
                        "Select or create a notebook to start building your web workspace.",
                        "Selecciona o crea un notebook para empezar a construir tu workspace web."
                      )}
                    </div>
                  )}
                </section>
              </div>

              {createMode && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 px-4">
                  <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-slate-950/60">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                          {L("Create", "Crear")}
                        </p>
                        <h3 className="mt-1 text-xl font-semibold text-slate-50">
                          {createMode === "book"
                            ? L("New notebook", "Nuevo notebook")
                            : createMode === "section"
                            ? L("New section", "Nueva sección")
                            : L("New page", "Nueva página")}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={closeCreateModal}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                      >
                        {L("Close", "Cerrar")}
                      </button>
                    </div>

                    <div className="mt-5 space-y-4">
                      {createMode !== "book" && (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {L("Notebook", "Notebook")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {nbData.notebooks.map((notebook) => {
                              const isSelected = notebook.id === createNotebookId;
                              return (
                                <button
                                  key={notebook.id}
                                  type="button"
                                  onClick={() => {
                                    setCreateNotebookId(notebook.id);
                                    if (
                                      createMode === "page" &&
                                      createSectionId &&
                                      createSectionId !== UNASSIGNED_SECTION_KEY &&
                                      !nbData.sections.some(
                                        (section) =>
                                          section.id === createSectionId &&
                                          section.notebook_id === notebook.id
                                      )
                                    ) {
                                      setCreateSectionId(UNASSIGNED_SECTION_KEY);
                                    }
                                  }}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    isSelected
                                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                      : "border-slate-700 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
                                  }`}
                                >
                                  {notebook.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {createMode === "page" && (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {L("Target section", "Sección destino")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setCreateSectionId(UNASSIGNED_SECTION_KEY)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                createSectionId === UNASSIGNED_SECTION_KEY
                                  ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                  : "border-slate-700 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
                              }`}
                            >
                              {L("Loose page", "Página suelta")}
                            </button>
                            {createNotebookSections.map((section) => {
                              const isSelected = section.id === createSectionId;
                              return (
                                <button
                                  key={section.id}
                                  type="button"
                                  onClick={() => setCreateSectionId(section.id)}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    isSelected
                                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                      : "border-slate-700 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
                                  }`}
                                >
                                  {section.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {createMode === "page"
                            ? L("Page title", "Título de la página")
                            : L("Name", "Nombre")}
                        </p>
                        <input
                          type="text"
                          value={createName}
                          onChange={(e) => setCreateName(e.target.value)}
                          placeholder={
                            createMode === "book"
                              ? L("My trading notebook", "Mi notebook de trading")
                              : createMode === "section"
                              ? L("Execution reviews", "Reviews de ejecución")
                              : L("Post CPI checklist", "Checklist post CPI")
                          }
                          className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                        />
                      </div>

                      {createError ? (
                        <p className="text-sm text-rose-300">{createError}</p>
                      ) : null}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={closeCreateModal}
                        className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500"
                      >
                        {L("Cancel", "Cancelar")}
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateNotebookItem}
                        disabled={creating}
                        className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creating ? L("Creating…", "Creando…") : L("Create", "Crear")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {manageTarget && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 px-4">
                  <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-slate-950/60">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300">
                          {L("Manage", "Gestionar")}
                        </p>
                        <h3 className="mt-1 text-xl font-semibold text-slate-50">
                          {manageTarget.kind === "book"
                            ? L("Notebook", "Notebook")
                            : manageTarget.kind === "section"
                            ? L("Section", "Sección")
                            : L("Page", "Página")}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={closeManageModal}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500"
                      >
                        {L("Close", "Cerrar")}
                      </button>
                    </div>

                    <div className="mt-5 space-y-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {manageTarget.kind === "page"
                            ? L("Page title", "Título de la página")
                            : L("Name", "Nombre")}
                        </p>
                        <input
                          type="text"
                          value={manageName}
                          onChange={(e) => setManageName(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                        />
                      </div>

                      {manageTarget.kind !== "book" && (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {L("Notebook", "Notebook")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {nbData.notebooks.map((notebook) => {
                              const isSelected = notebook.id === manageNotebookId;
                              return (
                                <button
                                  key={notebook.id}
                                  type="button"
                                  onClick={() => {
                                    setManageNotebookId(notebook.id);
                                    if (
                                      manageTarget.kind === "page" &&
                                      manageSectionId &&
                                      manageSectionId !== UNASSIGNED_SECTION_KEY &&
                                      !nbData.sections.some(
                                        (section) =>
                                          section.id === manageSectionId &&
                                          section.notebook_id === notebook.id
                                      )
                                    ) {
                                      setManageSectionId(UNASSIGNED_SECTION_KEY);
                                    }
                                  }}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    isSelected
                                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                      : "border-slate-700 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
                                  }`}
                                >
                                  {notebook.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {manageTarget.kind === "page" && (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {L("Section", "Sección")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setManageSectionId(UNASSIGNED_SECTION_KEY)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                manageSectionId === UNASSIGNED_SECTION_KEY
                                  ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                  : "border-slate-700 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
                              }`}
                            >
                              {L("Loose page", "Página suelta")}
                            </button>
                            {manageNotebookSections.map((section) => {
                              const isSelected = section.id === manageSectionId;
                              return (
                                <button
                                  key={section.id}
                                  type="button"
                                  onClick={() => setManageSectionId(section.id)}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    isSelected
                                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                                      : "border-slate-700 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-100"
                                  }`}
                                >
                                  {section.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {manageTarget.kind === "section" ? (
                        <p className="text-xs leading-6 text-slate-400">
                          {L(
                            "If you move this section to another notebook, every page inside it moves too.",
                            "Si mueves esta sección a otro notebook, todas sus páginas se mueven con ella."
                          )}
                        </p>
                      ) : null}

                      {manageError ? (
                        <p className="text-sm text-rose-300">{manageError}</p>
                      ) : null}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={handleDeleteNotebookItem}
                        disabled={managing}
                        className="rounded-full border border-rose-500/50 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        {L("Delete", "Borrar")}
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={closeManageModal}
                          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500"
                        >
                          {L("Cancel", "Cancelar")}
                        </button>
                        <button
                          type="button"
                          onClick={handleManageNotebookItem}
                          disabled={managing}
                          className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {managing ? L("Saving…", "Guardando…") : L("Save changes", "Guardar cambios")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        /* ===== CALENDAR VIEW ===== */
        <section className="mt-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 md:px-6 md:py-6 shadow-sm shadow-slate-950/40">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {L("Calendar page", "Página de calendario")}
                </p>
                <h2 className="text-2xl font-semibold mt-1">
                  {L(`${currentYear} holidays`, `Feriados ${currentYear}`)}
                </h2>
                <p className="text-slate-400 text-sm mt-1 max-w-xl">
                  {L(
                    "Overview of all U.S. federal holidays. Market-closed days are labeled so you can plan around them.",
                    "Resumen de todos los feriados federales de EE. UU. Los días con mercado cerrado están marcados para que puedas planificar."
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {monthLabels.map((label, monthIndex) => {
                const monthHolidays = holidaysByMonth[monthIndex] || [];
                if (monthHolidays.length === 0) return null;

                return (
                  <div
                    key={monthIndex}
                    className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-100">
                      {label}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                      {monthHolidays.map((h) => (
                        <li
                          key={h.date}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <div className="leading-snug">
                            <div className="flex items-center gap-2">
                              <span>{h.label}</span>
                              {h.marketClosed ? (
                                <span className="text-[10px] uppercase tracking-wide text-amber-200">
                                  {L("Market closed", "Mercado cerrado")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <span className="text-xs tabular-nums text-slate-400">
                            {formatShortDate(h.date, lang)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500 mt-4">
              {L(
                `Note: This page shows major U.S. federal holidays for ${currentYear}. If you need to add custom holidays (for your country, broker, or family events), you can note them directly in your daily notebook pages.`,
                `Nota: esta página muestra los principales feriados federales de EE. UU. de ${currentYear}. Si necesitas agregar feriados personalizados (tu país, broker o eventos familiares), puedes anotarlos en tus páginas diarias.`
              )}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
