// app/notebook/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import type { JournalEntry } from "@/lib/journalLocal";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import RichNotebookEditor from "@/app/components/RichNotebookEditor";

/* =========================
   Types & helpers
========================= */

type ViewMode = "notebook" | "calendar";
type NotebookSubView = "journal" | "custom";

type Holiday = {
  date: string; // YYYY-MM-DD
  label: string;
};

type LocalNotebook = {
  id: string;
  name: string;
  createdAt: string;
};

type LocalNotebookPage = {
  id: string;
  notebookId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  content: string;
};

type NotebookStorage = {
  notebooks: LocalNotebook[];
  pages: LocalNotebookPage[];
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const NOTEBOOK_STORAGE_KEY = "tjp_notebooks_v1";
const FREE_NOTES_STORAGE_KEY = "tjp_notebook_free_notes_v1";

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Evita mostrar JSON crudo como notas
function getNotebookPreview(raw: any): string | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return "Tap to open this notebook page summary.";
    }
    return trimmed;
  }

  return null;
}

function createId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadNotebookStorageSafe(): NotebookStorage {
  if (typeof window === "undefined") {
    return { notebooks: [], pages: [] };
  }
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_STORAGE_KEY);
    if (!raw) return { notebooks: [], pages: [] };
    const parsed = JSON.parse(raw);
    if (!parsed.notebooks || !parsed.pages) {
      return { notebooks: [], pages: [] };
    }
    return parsed as NotebookStorage;
  } catch {
    return { notebooks: [], pages: [] };
  }
}

function saveNotebookStorageSafe(data: NotebookStorage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      NOTEBOOK_STORAGE_KEY,
      JSON.stringify(data)
    );
  } catch {
    // ignore
  }
}

// Free notes por fecha
function loadFreeNotesSafe(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FREE_NOTES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function saveFreeNotesSafe(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FREE_NOTES_STORAGE_KEY,
      JSON.stringify(map)
    );
  } catch {
    // ignore
  }
}

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

function getUsFederalHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // Fixed-date
  holidays.push(
    { date: toYMD(new Date(year, 0, 1)), label: "New Year's Day" },
    {
      date: toYMD(new Date(year, 5, 19)),
      label: "Juneteenth National Independence Day",
    },
    { date: toYMD(new Date(year, 6, 4)), label: "Independence Day" },
    { date: toYMD(new Date(year, 10, 11)), label: "Veterans Day" },
    { date: toYMD(new Date(year, 11, 25)), label: "Christmas Day" }
  );

  // MLK – 3rd Monday Jan
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 0, 1, 3)),
    label: "Martin Luther King Jr. Day",
  });

  // Presidents – 3rd Monday Feb
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 1, 1, 3)),
    label: "Presidents' Day",
  });

  // Memorial – last Monday May
  holidays.push({
    date: toYMD(getLastWeekdayOfMonth(year, 4, 1)),
    label: "Memorial Day",
  });

  // Labor – 1st Monday Sep
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 8, 1, 1)),
    label: "Labor Day",
  });

  // Columbus / Indigenous – 2nd Monday Oct
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 9, 1, 2)),
    label: "Columbus / Indigenous Peoples' Day",
  });

  // Thanksgiving – 4th Thursday Nov
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 10, 4, 4)),
    label: "Thanksgiving Day",
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

  // Journal entries desde Supabase
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState<boolean>(true);

  // Hidratación (para localStorage)
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Proteger ruta si no hay user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [authLoading, user, router]);

  // Cargar entries desde Supabase
  useEffect(() => {
    if (authLoading || !user) return;

    const load = async () => {
      try {
        setEntriesLoading(true);
        const userId =
          (user as any)?.uid || (user as any)?.id || (user as any)?.email || "";
        if (!userId) {
          setEntries([]);
        } else {
          const all = await getAllJournalEntries(userId);
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
  }, [authLoading, user]);

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

  // Custom notebooks (localStorage)
  const [nbData, setNbData] = useState<NotebookStorage>({
    notebooks: [],
    pages: [],
  });
  const [activeNotebookId, setActiveNotebookId] =
    useState<string | null>(null);
  const [activePageId, setActivePageId] =
    useState<string | null>(null);
  const [newNotebookName, setNewNotebookName] =
    useState<string>("");
  const [isNbLoaded, setIsNbLoaded] = useState(false);

  useEffect(() => {
    const loaded = loadNotebookStorageSafe();
    setNbData(loaded);
    if (loaded.notebooks.length > 0) {
      setActiveNotebookId(loaded.notebooks[0].id);
    }
    setIsNbLoaded(true);
  }, []);

  useEffect(() => {
    if (!isNbLoaded) return;
    saveNotebookStorageSafe(nbData);
  }, [nbData, isNbLoaded]);

  // Free notes por fecha (libreta rica)
  const [freeNotesByDate, setFreeNotesByDate] =
    useState<Record<string, string>>({});
  const [freeNotesLoaded, setFreeNotesLoaded] =
    useState(false);

  useEffect(() => {
    const loaded = loadFreeNotesSafe();
    setFreeNotesByDate(loaded);
    setFreeNotesLoaded(true);
  }, []);

  useEffect(() => {
    if (!freeNotesLoaded) return;
    saveFreeNotesSafe(freeNotesByDate);
  }, [freeNotesByDate, freeNotesLoaded]);

  const todayStr = useMemo(() => toYMD(new Date()), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const holidays = useMemo(
    () => getUsFederalHolidays(currentYear),
    [currentYear]
  );

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

  const activeNotebookPages = useMemo(() => {
    if (!activeNotebookId) return [] as LocalNotebookPage[];
    return nbData.pages.filter((p) => p.notebookId === activeNotebookId);
  }, [nbData.pages, activeNotebookId]);

  const activeNotebook = useMemo(() => {
    if (!activeNotebookId) return null as LocalNotebook | null;
    return (
      nbData.notebooks.find((n) => n.id === activeNotebookId) ||
      null
    );
  }, [activeNotebookId, nbData.notebooks]);

  const activePage = useMemo(() => {
    if (!activeNotebookId)
      return null as LocalNotebookPage | null;
    if (activeNotebookPages.length === 0) return null;
    const found = activePageId
      ? activeNotebookPages.find((p) => p.id === activePageId)
      : null;
    return found || activeNotebookPages[0];
  }, [activeNotebookId, activeNotebookPages, activePageId]);

  // AI coach state (para la página seleccionada del journal)
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const selectedFreeNotes =
    (selectedJournalDate &&
      freeNotesByDate[selectedJournalDate]) ||
    "";

  const handleFreeNotesChange = (html: string) => {
    if (!selectedJournalDate) return;
    setFreeNotesByDate((prev) => ({
      ...prev,
      [selectedJournalDate]: html,
    }));
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
          "The AI coach did not return a message. Please try again."
      );
    } catch (err) {
      console.error(err);
      setAiAnswer(
        "There was an error talking to the AI coach. Please try again in a moment."
      );
    } finally {
      setAiLoading(false);
    }
  };

  // acciones para custom notebooks
  const handleAddNotebook = () => {
    if (!isNbLoaded) return;
    const name = newNotebookName.trim() || "Untitled notebook";
    const id = createId();
    const now = new Date().toISOString();
    setNbData((prev) => ({
      notebooks: [...prev.notebooks, { id, name, createdAt: now }],
      pages: prev.pages,
    }));
    setActiveNotebookId(id);
    setActivePageId(null);
    setNewNotebookName("");
    setSubView("custom");
  };

  const handleAddPage = () => {
    if (!activeNotebookId || !isNbLoaded) return;
    const id = createId();
    const now = new Date().toISOString();
    const newPage: LocalNotebookPage = {
      id,
      notebookId: activeNotebookId,
      title: "Untitled page",
      createdAt: now,
      updatedAt: now,
      content: "",
    };
    setNbData((prev) => ({
      notebooks: prev.notebooks,
      pages: [...prev.pages, newPage],
    }));
    setActivePageId(id);
  };

  const updateActivePage = (patch: Partial<LocalNotebookPage>) => {
    if (!activePage) return;
    const id = activePage.id;
    const now = new Date().toISOString();
    setNbData((prev) => ({
      notebooks: prev.notebooks,
      pages: prev.pages.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: now } : p
      ),
    }));
  };

  // Loading global
  if (
    !hasHydrated ||
    authLoading ||
    (user && entriesLoading)
  ) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 px-6 md:px-10 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Daily notebook
        </h1>
        <p className="text-slate-400 mt-2 text-sm">
          Loading your notebook…
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
            ← Back
          </button>

          <Link
            href={`/journal/${todayStr}`}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20 transition"
          >
            Open today&apos;s journal page
            <span className="text-xs text-emerald-200/80">
              ({formatShortDate(todayStr)})
            </span>
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Daily notebook
          </h1>
          <p className="text-slate-400 mt-1">
            Your journal in notebook format – free space for trading, study and
            life notes.
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
          Notebook pages
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
          Calendar & holidays
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
              Journal notebook
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
              Custom notebooks
            </button>
          </div>

          {/* ===== JOURNAL NOTEBOOK VIEW ===== */}
          {subView === "journal" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Journal notebook
                </p>
                <h2 className="text-xl font-semibold text-slate-50 mt-1">
                  Daily pages with summaries and free-space notes
                </h2>
              </div>

              {sorted.length === 0 ? (
                <p className="text-slate-500 text-sm mt-3">
                  You don&apos;t have journal pages yet. Create your first
                  entry from the journal to see it here.
                </p>
              ) : (
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* LISTA DE PÁGINAS A LA IZQUIERDA (tipo OneNote) */}
                  <aside className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 flex flex-col lg:w-80 xl:w-96 lg:flex-none max-h-[560px]">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">
                      Pages
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {sorted.map((e: any) => {
                        const isSelected =
                          selectedJournalDate === e.date;
                        const preview = getNotebookPreview(
                          (e as any).notes
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
                                {formatShortDate(e.date)}
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
                              Notebook page
                            </p>
                            <h3 className="text-2xl font-semibold text-slate-50">
                              {formatShortDate(
                                (selectedJournalEntry as any).date
                              )}
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Summary and notes connected to your trading
                              journal.
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
                              Day P&amp;L
                            </p>
                            <Link
                              href={`/journal/${
                                (selectedJournalEntry as any).date
                              }`}
                              className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-[11px] font-medium text-slate-200 hover:border-emerald-400/60 hover:text-emerald-100 transition"
                            >
                              Open full journal page →
                            </Link>
                          </div>
                        </div>

                        {/* RESUMEN */}
                        <div className="grid gap-4 md:grid-cols-3 text-sm text-slate-200">
                          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              Trades
                            </p>
                            <p className="mt-2">
                              Entries:{" "}
                              <span className="font-semibold">
                                {Array.isArray(
                                  (selectedJournalEntry as any).entries
                                )
                                  ? (selectedJournalEntry as any).entries.length
                                  : 0}
                              </span>
                            </p>
                            <p>
                              Exits:{" "}
                              <span className="font-semibold">
                                {Array.isArray(
                                  (selectedJournalEntry as any).exits
                                )
                                  ? (selectedJournalEntry as any).exits.length
                                  : 0}
                              </span>
                            </p>
                          </div>

                          {/* Tarjeta con estado de notas */}
                          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              Notes blocks
                            </p>
                            <ul className="mt-2 space-y-1 text-sm">
                              <li>
                                Premarket:{" "}
                                <span className="font-semibold">
                                  {notesStatus?.premarket ? "Written" : "Empty"}
                                </span>
                              </li>
                              <li>
                                Live session:{" "}
                                <span className="font-semibold">
                                  {notesStatus?.live ? "Written" : "Empty"}
                                </span>
                              </li>
                              <li>
                                Post-market:{" "}
                                <span className="font-semibold">
                                  {notesStatus?.post ? "Written" : "Empty"}
                                </span>
                              </li>
                            </ul>
                          </div>

                          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              Quick description
                            </p>
                            <p className="mt-2 text-sm text-slate-200">
                              {getNotebookPreview(
                                (selectedJournalEntry as any).notes
                              ) ??
                                "Write a short description in your journal notes to see it here as a quick summary."}
                            </p>
                          </div>
                        </div>

                        {/* FREE NOTES + AI */}
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr),minmax(0,1.4fr)] mt-4">
                          {/* FREE NOTES */}
                          <div className="space-y-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              Free notebook space
                            </p>

                            <RichNotebookEditor
                              value={selectedFreeNotes}
                              onChange={handleFreeNotesChange}
                              placeholder="Write anything here: study notes, psychology reflections, ideas for this day…"
                              minHeight={260}
                            />
                          </div>

                          {/* AI COACH */}
                          <div className="rounded-3xl border border-emerald-500/40 bg-linear-to-br from-slate-950 via-slate-950 to-emerald-900/30 p-3 md:p-4 space-y-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                                AI coach
                              </p>
                              <p className="text-sm text-emerald-50 mt-0.5">
                                Ask a question about this day. Puedes escribir
                                en español o inglés.
                              </p>
                            </div>

                            <textarea
                              value={aiQuestion}
                              onChange={(e) =>
                                setAiQuestion(e.target.value)
                              }
                              placeholder="Example: ¿Qué hice bien hoy y qué debería ajustar en mi gestión de riesgo?"
                              className="w-full rounded-2xl border border-emerald-500/40 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 resize-y min-h-[90px] focus:outline-none focus:ring-1 focus:ring-emerald-400/70"
                            />

                            <button
                              type="button"
                              onClick={handleAskAi}
                              disabled={aiLoading || !aiQuestion.trim()}
                              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {aiLoading
                                ? "Thinking…"
                                : "Ask AI about this page"}
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
                        Select a page on the left to see its summary.
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
                    Custom notebooks
                  </p>
                  <h2 className="text-xl font-semibold text-slate-50 mt-1">
                    Create notebooks and free pages for courses, ideas and notes
                  </h2>
                </div>

                {/* Botones de crear notebook y page */}
                <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="New notebook name"
                      value={newNotebookName}
                      onChange={(e) =>
                        setNewNotebookName(e.target.value)
                      }
                      className="rounded-full bg-slate-900/80 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                    />
                    <button
                      type="button"
                      onClick={handleAddNotebook}
                      disabled={!isNbLoaded}
                      className="rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Create notebook
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddPage}
                    disabled={!activeNotebookId || !isNbLoaded}
                    className="rounded-full bg-slate-900/80 border border-emerald-500/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Create page
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[260px,1fr]">
                {/* Sidebar notebooks */}
                <aside className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                  {!isNbLoaded ? (
                    <p className="text-xs text-slate-500">
                      Loading notebooks…
                    </p>
                  ) : nbData.notebooks.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No custom notebooks yet. Create one to start writing.
                    </p>
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
                              className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium transition ${
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

                {/* Main notebook editor */}
                <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 md:p-5">
                  {!activeNotebook ? (
                    <p className="text-sm text-slate-500">
                      Select a notebook on the left or create a new one.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Notebook
                          </p>
                          <h3 className="text-lg font-semibold text-slate-50">
                            {activeNotebook.name}
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Created{" "}
                            {formatShortDate(
                              activeNotebook.createdAt.slice(0, 10)
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {activeNotebookPages.length > 0 && (
                            <select
                              value={activePageId ?? ""}
                              onChange={(e) =>
                                setActivePageId(e.target.value || null)
                              }
                              className="rounded-full bg-slate-900/80 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                            >
                              {activeNotebookPages.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.title || "Untitled page"}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>

                      {activeNotebookPages.length === 0 ? (
                        <p className="text-sm text-slate-500 mt-4">
                          This notebook doesn&apos;t have pages yet. Use
                          &quot;Create page&quot; to start writing.
                        </p>
                      ) : activePage ? (
                        <div className="mt-4 space-y-3">
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={activePage.title}
                              onChange={(e) =>
                                updateActivePage({
                                  title: e.target.value,
                                })
                              }
                              placeholder="Page title"
                              className="w-full rounded-2xl bg-slate-900/90 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
                            />
                            <p className="text-[11px] text-slate-500">
                              Last updated{" "}
                              {formatShortDate(
                                activePage.updatedAt.slice(0, 10)
                              )}
                            </p>
                          </div>

                          {/* Editor tipo OneNote simple (texto libre) */}
                          <div className="relative rounded-[28px] border border-slate-700/80 bg-slate-900/90 shadow-inner shadow-slate-950/50 overflow-hidden">
                            <div className="absolute inset-0 opacity-35 pointer-events-none bg-[linear-gradient(to_bottom,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-size-[100%_28px]" />
                            <textarea
                              value={activePage.content}
                              onChange={(e) =>
                                updateActivePage({
                                  content: e.target.value,
                                })
                              }
                              placeholder="Write anything here: course notes, reflections, trading lessons, ideas..."
                              className="relative w-full min-h-[220px] md:min-h-80 resize-y bg-transparent px-4 py-4 text-sm text-slate-100 focus:outline-none"
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
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
                  Calendar page
                </p>
                <h2 className="text-2xl font-semibold mt-1">
                  {currentYear} holidays
                </h2>
                <p className="text-slate-400 text-sm mt-1 max-w-xl">
                  Overview of the main U.S. federal holidays so you always know
                  which days markets and many offices may be closed.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {MONTH_LABELS.map((label, monthIndex) => {
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
                            {formatShortDate(h.date)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500 mt-4">
              Note: This page shows major U.S. federal holidays for{" "}
              {currentYear}. If you need to add custom holidays (for your
              country, broker, or family events), you can note them directly in
              your daily notebook pages.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
