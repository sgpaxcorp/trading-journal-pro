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
import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import RichNotebookEditor from "@/app/components/RichNotebookEditor";
import {
  createNotebookBook,
  createNotebookPage,
  createNotebookSection,
  listNotebookData,
  updateNotebookPage,
  type NotebookBookRow,
  type NotebookPageRow,
  type NotebookSectionRow,
  type NotebookStorage,
} from "@/lib/notebookSupabase";
import {
  getFreeNotebookNote,
  upsertFreeNotebookNote,
} from "@/lib/notebookFreeNotesSupabase";

/* =========================
   Types & helpers
========================= */

type ViewMode = "notebook" | "calendar";
type NotebookSubView = "journal" | "custom";

type Holiday = {
  date: string; // YYYY-MM-DD
  label: string;
};

type LocalNotebook = NotebookBookRow;
type LocalNotebookSection = NotebookSectionRow;
type LocalNotebookPage = NotebookPageRow;

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

function getUsFederalHolidays(year: number, lang: "en" | "es"): Holiday[] {
  const holidays: Holiday[] = [];
  const label = (en: string, es: string) => (lang === "es" ? es : en);

  // Fixed-date
  holidays.push(
    { date: toYMD(new Date(year, 0, 1)), label: label("New Year's Day", "Año Nuevo") },
    {
      date: toYMD(new Date(year, 5, 19)),
      label: label("Juneteenth National Independence Day", "Juneteenth"),
    },
    { date: toYMD(new Date(year, 6, 4)), label: label("Independence Day", "Día de la Independencia") },
    { date: toYMD(new Date(year, 10, 11)), label: label("Veterans Day", "Día de los Veteranos") },
    { date: toYMD(new Date(year, 11, 25)), label: label("Christmas Day", "Navidad") }
  );

  // MLK – 3rd Monday Jan
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 0, 1, 3)),
    label: label("Martin Luther King Jr. Day", "Día de Martin Luther King Jr."),
  });

  // Presidents – 3rd Monday Feb
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 1, 1, 3)),
    label: label("Presidents' Day", "Día de los Presidentes"),
  });

  // Memorial – last Monday May
  holidays.push({
    date: toYMD(getLastWeekdayOfMonth(year, 4, 1)),
    label: label("Memorial Day", "Memorial Day"),
  });

  // Labor – 1st Monday Sep
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 8, 1, 1)),
    label: label("Labor Day", "Día del Trabajo"),
  });

  // Columbus / Indigenous – 2nd Monday Oct
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 9, 1, 2)),
    label: label("Columbus / Indigenous Peoples' Day", "Día de Colón / Pueblos Indígenas"),
  });

  // Thanksgiving – 4th Thursday Nov
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 10, 4, 4)),
    label: label("Thanksgiving Day", "Día de Acción de Gracias"),
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
        String(a.date || "").localeCompare(String(b.date || ""))
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
  const [nbLoading, setNbLoading] = useState(true);
  const [activeNotebookId, setActiveNotebookId] =
    useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] =
    useState<string | null>(null);
  const [activePageId, setActivePageId] =
    useState<string | null>(null);
  const [newNotebookName, setNewNotebookName] =
    useState<string>("");
  const [newSectionName, setNewSectionName] =
    useState<string>("");
  const [sectionExpanded, setSectionExpanded] = useState<Record<string, boolean>>({});
  const pageSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const freeNotesSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const loadedFreeNotesRef = useRef<Record<string, boolean>>({});
  const [pageSaveState, setPageSaveState] = useState<Record<string, { state: "idle" | "saving" | "saved" | "error"; ts?: number }>>({});
  const [freeNotesSaveState, setFreeNotesSaveState] = useState<Record<string, { state: "idle" | "saving" | "saved" | "error"; ts?: number }>>({});

  useEffect(() => {
    if (planLoading || plan !== "advanced") return;
    if (authLoading || !userId || accountsLoading || !activeAccountId) return;

    let alive = true;
    const load = async () => {
      setNbLoading(true);
      try {
        const data = await listNotebookData(userId, activeAccountId);
        if (!alive) return;
        setNbData(data);
        if (data.notebooks.length > 0) {
          setActiveNotebookId((prev) => {
            if (prev && data.notebooks.some((n) => n.id === prev)) return prev;
            return data.notebooks[0].id;
          });
        }
        if (data.sections.length > 0) {
          setActiveSectionId((prev) => {
            if (prev && data.sections.some((s) => s.id === prev)) return prev;
            return data.sections[0].id;
          });
        }
        setSectionExpanded((prev) => {
          const next = { ...prev };
          data.sections.forEach((s) => {
            if (next[s.id] === undefined) next[s.id] = true;
          });
          return next;
        });
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
    useState<Record<string, string>>({});
  const [freeNotesLoading, setFreeNotesLoading] = useState(false);

  useEffect(() => {
    // reset cache when switching accounts
    setFreeNotesByDate({});
    loadedFreeNotesRef.current = {};
  }, [activeAccountId]);

  useEffect(() => {
    if (!selectedJournalDate) return;
    if (authLoading || !userId || accountsLoading || !activeAccountId) return;
    if (loadedFreeNotesRef.current[selectedJournalDate]) return;

    let alive = true;
    const loadFreeNotes = async () => {
      setFreeNotesLoading(true);
      const content = await getFreeNotebookNote(
        userId,
        activeAccountId,
        selectedJournalDate
      );
      if (!alive) return;
      loadedFreeNotesRef.current[selectedJournalDate] = true;
      setFreeNotesByDate((prev) => ({
        ...prev,
        [selectedJournalDate]: content ?? "",
      }));
      setFreeNotesLoading(false);
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
    const stillValid = activeNotebookSections.some((s) => s.id === activeSectionId);
    if (!stillValid) {
      setActiveSectionId(firstSection?.id ?? null);
    }
  }, [activeNotebookId, activeNotebookSections, activeSectionId]);

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
      const key = p.section_id || "unassigned";
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
    return pagesBySection[activeSectionId] || [];
  }, [pagesBySection, activeSectionId]);

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

  const selectedFreeNotes =
    (selectedJournalDate && freeNotesByDate[selectedJournalDate]) || "";
  const freeNotesStatus =
    (selectedJournalDate && freeNotesSaveState[selectedJournalDate]) || null;
  const activePageStatus =
    (activePage?.id && pageSaveState[activePage.id]) || null;

  const handleFreeNotesChange = (html: string) => {
    if (!selectedJournalDate || !userId || !activeAccountId) return;
    setFreeNotesSaveState((prev) => ({
      ...prev,
      [selectedJournalDate]: { state: "saving" },
    }));
    setFreeNotesByDate((prev) => ({
      ...prev,
      [selectedJournalDate]: html,
    }));

    if (freeNotesSaveTimers.current[selectedJournalDate]) {
      clearTimeout(freeNotesSaveTimers.current[selectedJournalDate]);
    }
    freeNotesSaveTimers.current[selectedJournalDate] = setTimeout(() => {
      void (async () => {
        const ok = await upsertFreeNotebookNote(
          userId,
          activeAccountId,
          selectedJournalDate,
          html
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
    if (!selectedJournalEntry || !aiQuestion.trim()) return;
    if (!selectedJournalDate) return;

    setAiLoading(true);
    setAiAnswer(null);

    try {
      const anyEntry = selectedJournalEntry as any;
      const notes = anyEntry.notes || {};

      const structuredNotes = {
        premarket:
          notes.premarket ||
          notes.preMarket ||
          notes.pre ||
          anyEntry.premarket ||
          "",
        live:
          notes.live ||
          notes.session ||
          notes.during ||
          anyEntry.live ||
          "",
        post:
          notes.post ||
          notes.postMarket ||
          notes.after ||
          anyEntry.post ||
          "",
      };

      const languageHint = detectLanguage(aiQuestion);

      const res = await fetch("/api/notebook-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: aiQuestion,
          language: languageHint,
          journal: {
            date: anyEntry.date,
            pnl: anyEntry.pnl || 0,
            entries: anyEntry.entries ?? [],
            exits: anyEntry.exits ?? [],
            notes,
            structuredNotes,
            freeNotes: selectedFreeNotes,
            rawEntry: anyEntry,
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
  const handleAddNotebook = async () => {
    if (!userId || !activeAccountId) return;
    const name = newNotebookName.trim() || L("Untitled notebook", "Notebook sin título");
    const created = await createNotebookBook(userId, activeAccountId, name);
    if (!created) return;
    const section = await createNotebookSection(userId, created.id, L("General", "General"));
    setNbData((prev) => ({
      notebooks: [...prev.notebooks, created],
      sections: section ? [...prev.sections, section] : prev.sections,
      pages: prev.pages,
    }));
    setActiveNotebookId(created.id);
    if (section?.id) {
      setActiveSectionId(section.id);
      setSectionExpanded((prev) => ({ ...prev, [section.id]: true }));
    }
    setActivePageId(null);
    setNewNotebookName("");
    setSubView("custom");
  };

  const handleAddPageToSection = async (targetSectionId?: string | null) => {
    if (!activeNotebookId || !userId) return;

    let sectionId = targetSectionId || activeSectionId;
    let newSection: LocalNotebookSection | null = null;

    if (!sectionId) {
      const fallback = nbData.sections.find((s) => s.notebook_id === activeNotebookId);
      if (fallback) {
        sectionId = fallback.id;
      } else {
        newSection = await createNotebookSection(
          userId,
          activeNotebookId,
          L("General", "General")
        );
        sectionId = newSection?.id ?? null;
      }
    }

    if (!sectionId) return;
    const newPage = await createNotebookPage(
      userId,
      activeNotebookId,
      sectionId,
      L("Untitled page", "Página sin título")
    );
    if (!newPage) return;

    setNbData((prev) => ({
      notebooks: prev.notebooks,
      sections: newSection ? [...prev.sections, newSection] : prev.sections,
      pages: [...prev.pages, newPage],
    }));
    setActiveSectionId(sectionId);
    setActivePageId(newPage.id);
    if (newSection) {
      setSectionExpanded((prev) => ({ ...prev, [newSection.id]: true }));
    }
  };

  const handleAddPage = () => handleAddPageToSection(activeSectionId);

  const handleAddSection = async () => {
    if (!activeNotebookId || !userId) return;
    const name = newSectionName.trim() || L("New section", "Nueva sección");
    const newSection = await createNotebookSection(userId, activeNotebookId, name);
    if (!newSection) return;
    setNbData((prev) => ({
      notebooks: prev.notebooks,
      sections: [...prev.sections, newSection],
      pages: prev.pages,
    }));
    setActiveSectionId(newSection.id);
    setSectionExpanded((prev) => ({ ...prev, [newSection.id]: true }));
    setNewSectionName("");
  };

  const updateActivePage = (patch: Partial<LocalNotebookPage>) => {
    if (!activePage || !userId) return;
    const id = activePage.id;
    const now = new Date().toISOString();
    setNbData((prev) => ({
      notebooks: prev.notebooks,
      sections: prev.sections,
      pages: prev.pages.map((p) =>
        p.id === id ? { ...p, ...patch, updated_at: now } : p
      ),
    }));

    if (pageSaveTimers.current[id]) {
      clearTimeout(pageSaveTimers.current[id]);
    }
    setPageSaveState((prev) => ({ ...prev, [id]: { state: "saving" } }));
    pageSaveTimers.current[id] = setTimeout(() => {
      void (async () => {
        try {
          await updateNotebookPage(userId, id, {
            title: patch.title ?? activePage.title,
            content: patch.content ?? activePage.content,
            section_id: patch.section_id ?? activePage.section_id ?? null,
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
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {L("Journal notebook", "Notebook del journal")}
                </p>
                <h2 className="text-xl font-semibold text-slate-50 mt-1">
                  {L(
                    "Daily pages with summaries and free-space notes",
                    "Páginas diarias con resúmenes y notas libres"
                  )}
                </h2>
              </div>

              {sorted.length === 0 ? (
                <p className="text-slate-500 text-sm mt-3">
                  {L(
                    "You don't have journal pages yet. Create your first entry from the journal to see it here.",
                    "Aún no tienes páginas del journal. Crea tu primera entrada en el journal para verla aquí."
                  )}
                </p>
              ) : (
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* LISTA DE PÁGINAS A LA IZQUIERDA (tipo OneNote) */}
                  <aside className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 flex flex-col lg:w-80 xl:w-96 lg:flex-none max-h-[560px]">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">
                      {L("Pages", "Páginas")}
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {sorted.map((e: any) => {
                        const isSelected =
                          selectedJournalDate === e.date;
                        const preview = getNotebookPreview(
                          (e as any).notes,
                          L("Tap to open this notebook page summary.", "Toca para abrir el resumen de esta página.")
                        );

                        return (
                          <motion.button
                            key={e.date}
                            type="button"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.985 }}
                            onClick={() =>
                              setSelectedJournalDate(e.date)
                            }
                            className={`w-full text-left rounded-xl px-3 py-2 text-xs border transition flex flex-col gap-1 ${
                              isSelected
                                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-50"
                                : "border-slate-800 bg-slate-900/70 text-slate-200 hover:border-emerald-400/40 hover:bg-slate-900"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium truncate">
                                {formatShortDate(e.date, lang)}
                              </span>
                              <span
                                className={`text-[11px] tabular-nums ${
                                  (e.pnl || 0) >= 0
                                    ? "text-emerald-300"
                                    : "text-sky-300"
                                }`}
                              >
                                {(e.pnl || 0) >= 0 ? "+" : ""}
                                ${Number(e.pnl || 0).toFixed(0)}
                              </span>
                            </div>
                            {preview && (
                              <p className="text-[11px] text-slate-400 line-clamp-2">
                                {preview}
                              </p>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </aside>

                  {/* PÁGINA / RESUMEN A LA DERECHA */}
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-6 space-y-5 flex-1">
                    {selectedJournalEntry ? (
                      <>
                        {/* HEADER */}
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                              {L("Notebook page", "Página de notebook")}
                            </p>
                            <h3 className="text-2xl font-semibold text-slate-50">
                              {formatShortDate(
                                (selectedJournalEntry as any).date,
                                lang
                              )}
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {L(
                                "Summary and notes connected to your trading journal.",
                                "Resumen y notas conectadas a tu journal de trading."
                              )}
                            </p>
                          </div>
                          <div className="text-right space-y-1">
                            <p
                              className={`text-2xl font-semibold tabular-nums ${
                                ((selectedJournalEntry as any).pnl || 0) >= 0
                                  ? "text-emerald-300"
                                  : "text-sky-300"
                              }`}
                            >
                              {((selectedJournalEntry as any).pnl || 0) >= 0
                                ? "+"
                                : ""}
                              $
                              {Number(
                                (selectedJournalEntry as any).pnl || 0
                              ).toFixed(2)}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {L("Day P&L", "P&L del día")}
                            </p>
                            <Link
                              href={`/journal/${
                                (selectedJournalEntry as any).date
                              }`}
                              className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-[11px] font-medium text-slate-200 hover:border-emerald-400/60 hover:text-emerald-100 transition"
                            >
                              {L("Open full journal page →", "Abrir journal completo →")}
                            </Link>
                          </div>
                        </div>

                        {/* RESUMEN */}
                        <div className="grid gap-4 md:grid-cols-3 text-sm text-slate-200">
                          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {L("Trades", "Trades")}
                            </p>
                            <p className="mt-2">
                              {L("Entries:", "Entradas:")}{" "}
                              <span className="font-semibold">
                                {entriesFromNotes.length}
                              </span>
                            </p>
                            <p>
                              {L("Exits:", "Salidas:")}{" "}
                              <span className="font-semibold">
                                {exitsFromNotes.length}
                              </span>
                            </p>
                          </div>

                          {/* Tarjeta con estado de notas */}
                          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {L("Notes blocks", "Bloques de notas")}
                            </p>
                            <ul className="mt-2 space-y-1 text-sm">
                              <li>
                                {L("Premarket:", "Premarket:")}{" "}
                                <span className="font-semibold">
                                  {notesStatus?.premarket ? L("Written", "Escrito") : L("Empty", "Vacío")}
                                </span>
                              </li>
                              <li>
                                {L("Live session:", "Sesión en vivo:")}{" "}
                                <span className="font-semibold">
                                  {notesStatus?.live ? L("Written", "Escrito") : L("Empty", "Vacío")}
                                </span>
                              </li>
                              <li>
                                {L("Post-market:", "Post-market:")}{" "}
                                <span className="font-semibold">
                                  {notesStatus?.post ? L("Written", "Escrito") : L("Empty", "Vacío")}
                                </span>
                              </li>
                            </ul>
                          </div>

                          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {L("Tags used", "Tags usados")}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
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
                                <span className="text-[11px] text-slate-400">
                                  {L("No tags yet", "Aún sin tags")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm text-slate-200">
                          {[
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
                          ].map((card) => (
                            <div key={card.title} className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                {card.title}
                              </p>
                              <p className="mt-2 text-sm text-slate-200 line-clamp-5">
                                {card.body ||
                                  L(
                                    "No notes saved yet for this block.",
                                    "Aún no hay notas guardadas para este bloque."
                                  )}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* FREE NOTES + AI */}
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr),minmax(0,1.4fr)] mt-4">
                          {/* FREE NOTES */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                {L("Free notebook space", "Espacio libre del notebook")}
                              </p>
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
                              ) : null}
                            </div>

                            <RichNotebookEditor
                              value={selectedFreeNotes}
                              onChange={handleFreeNotesChange}
                              placeholder={L(
                                "Write anything here: study notes, psychology reflections, ideas for this day…",
                                "Escribe aquí: notas de estudio, reflexiones, ideas para este día…"
                              )}
                              minHeight={260}
                            />
                          </div>

                          {/* AI COACH */}
                          <div className="rounded-3xl border border-emerald-500/40 bg-linear-to-br from-slate-950 via-slate-950 to-emerald-900/30 p-3 md:p-4 space-y-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                                {L("AI coach", "Coach AI")}
                              </p>
                              <p className="text-sm text-emerald-50 mt-0.5">
                                {L(
                                  "Ask a question about this day. You can write in English or Spanish.",
                                  "Haz una pregunta sobre este día. Puedes escribir en español o inglés."
                                )}
                              </p>
                            </div>

                            <textarea
                              value={aiQuestion}
                              onChange={(e) =>
                                setAiQuestion(e.target.value)
                              }
                              placeholder={L(
                                "Example: What did I do well today and what should I adjust in my risk management?",
                                "Ejemplo: ¿Qué hice bien hoy y qué debería ajustar en mi gestión de riesgo?"
                              )}
                              className="w-full rounded-2xl border border-emerald-500/40 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 resize-y min-h-[90px] focus:outline-none focus:ring-1 focus:ring-emerald-400/70"
                            />

                            <button
                              type="button"
                              onClick={handleAskAi}
                              disabled={aiLoading || !aiQuestion.trim()}
                              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {aiLoading
                                ? L("Thinking…", "Pensando…")
                                : L("Ask AI about this page", "Preguntar al AI sobre esta página")}
                            </button>

                            {aiAnswer && (
                              <div className="rounded-2xl border border-emerald-500/40 bg-slate-950/80 px-3 py-2 text-xs text-emerald-50 max-h-48 overflow-y-auto whitespace-pre-wrap">
                                {aiAnswer}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">
                        {L("Select a page on the left to see its summary.", "Selecciona una página a la izquierda para ver su resumen.")}
                      </p>
                    )}
                  </section>
                </div>
              )}
            </div>
          )}

          {/* ===== CUSTOM NOTEBOOKS VIEW ===== */}
          {subView === "custom" && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {L("Custom notebooks", "Notebooks personalizados")}
                  </p>
                  <h2 className="text-xl font-semibold text-slate-50 mt-1">
                    {L(
                      "A OneNote-style workspace for your trading knowledge",
                      "Un espacio tipo OneNote para tu conocimiento de trading"
                    )}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder={L("New notebook name", "Nombre del nuevo notebook")}
                    value={newNotebookName}
                    onChange={(e) => setNewNotebookName(e.target.value)}
                    className="rounded-full bg-slate-900/80 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                  />
                  <button
                    type="button"
                    onClick={handleAddNotebook}
                    disabled={nbLoading}
                    className="rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {L("Create notebook", "Crear notebook")}
                  </button>

                  <input
                    type="text"
                    placeholder={L("New section", "Nueva sección")}
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    className="rounded-full bg-slate-900/80 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                  />
                  <button
                    type="button"
                    onClick={handleAddSection}
                    disabled={!activeNotebookId || nbLoading}
                    className="rounded-full bg-slate-900/80 border border-emerald-500/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {L("Create section", "Crear sección")}
                  </button>

                  <button
                    type="button"
                    onClick={handleAddPage}
                    disabled={!activeNotebookId || nbLoading}
                    className="rounded-full bg-slate-900/80 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/60 hover:text-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {L("New page", "Nueva página")}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[220px_320px_1fr]">
                {/* Notebooks column */}
                <aside className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">
                    {L("Notebooks", "Notebooks")}
                  </p>
                  {nbLoading ? (
                    <p className="text-xs text-slate-500">{L("Loading…", "Cargando…")}</p>
                  ) : nbData.notebooks.length == 0 ? (
                    <p className="text-xs text-slate-500">{L("No notebooks yet.", "Aún no hay notebooks.")}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {nbData.notebooks.map((nb) => {
                        const isActive = nb.id === activeNotebookId;
                        return (
                          <li key={nb.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveNotebookId(nb.id);
                                setActivePageId(null);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition ${
                                isActive
                                  ? "bg-emerald-500/10 text-emerald-200 border border-emerald-400/60"
                                  : "bg-slate-900/60 text-slate-200 border border-slate-800 hover:border-emerald-400/40 hover:text-emerald-100"
                              }`}
                            >
                              {nb.name}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </aside>

                {/* Sections + pages column */}
                <aside className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Sections & pages", "Secciones y páginas")}
                    </p>
                    <span className="text-[11px] text-slate-500">{activeNotebookSections.length}</span>
                  </div>

                  {activeNotebookSections.length === 0 ? (
                    <p className="text-xs text-slate-500">{L("Create a section to begin.", "Crea una sección para empezar.")}</p>
                  ) : (
                    <div className="space-y-2">
                      {activeNotebookSections.map((section) => {
                        const isOpen = sectionExpanded[section.id] ?? true;
                        const sectionPages = pagesBySection[section.id] || [];
                        return (
                          <div key={section.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-2">
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSectionId(section.id);
                                  setSectionExpanded((prev) => ({
                                    ...prev,
                                    [section.id]: !isOpen,
                                  }));
                                }}
                                className="text-left text-xs font-semibold text-slate-100"
                              >
                                {section.name}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSectionId(section.id);
                                  handleAddPageToSection(section.id);
                                }}
                                className="text-[11px] rounded-full border border-emerald-400/50 px-2 py-0.5 text-emerald-200 hover:bg-emerald-500/10"
                              >
                                {L("+ Page", "+ Página")}
                              </button>
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
                                  <div className="mt-2 space-y-1">
                                    {sectionPages.length === 0 ? (
                                      <p className="text-[11px] text-slate-500 px-1">
                                        {L("No pages yet.", "Sin páginas aún.")}
                                      </p>
                                    ) : (
                                      sectionPages.map((p) => {
                                        const isActive = p.id === activePage?.id;
                                        return (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setActivePageId(p.id)}
                                            className={`w-full text-left rounded-lg px-2 py-1 text-[11px] border transition ${
                                              isActive
                                                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-50"
                                                : "border-slate-800 bg-slate-900/70 text-slate-200 hover:border-emerald-400/40"
                                            }`}
                                          >
                                            <div className="font-medium truncate">{p.title}</div>
                                            <p className="text-[10px] text-slate-400">
                                              {p.updated_at
                                                ? formatShortDate(p.updated_at.slice(0, 10), lang)
                                                : "--"}
                                            </p>
                                          </button>
                                        );
                                      })
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </aside>

                {/* Editor */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-6 space-y-4">
                  {activeNotebook ? (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{L("Notebook", "Notebook")}</p>
                          <h3 className="text-xl font-semibold">{activeNotebook.name}</h3>
                        </div>
                        {activePage && (
                          <input
                            type="text"
                            value={activePage.title}
                            onChange={(e) => updateActivePage({ title: e.target.value })}
                            className="rounded-xl bg-slate-950/80 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                          />
                        )}
                      </div>

                      {activePage ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {L("Page notes", "Notas de la página")}
                            </p>
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
                          <RichNotebookEditor
                            value={activePage.content}
                            onChange={(html) => updateActivePage({ content: html })}
                            placeholder={L("Write your notes here...", "Escribe tus notas aquí...")}
                            minHeight={420}
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">
                          {L("Select a page to start writing.", "Selecciona una página para empezar a escribir.")}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {L("Select or create a notebook to start.", "Selecciona o crea un notebook para empezar.")}
                    </p>
                  )}
                </section>
              </div>
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
                    "Overview of the main U.S. federal holidays so you always know which days markets and many offices may be closed.",
                    "Resumen de los principales feriados federales de EE. UU. para saber qué días los mercados y oficinas pueden estar cerrados."
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
                          <span className="leading-snug">
                            {h.label}
                          </span>
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
