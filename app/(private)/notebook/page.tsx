"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileSearch,
  FolderPlus,
  History,
  Layers3,
  LoaderCircle,
  Menu,
  NotebookPen,
  Paperclip,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import NotebookInkField from "@/app/components/NotebookInkField";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { createNotebookEditableContent, type NotebookEditableContent } from "@/lib/notebookInk";
import { notebookApi, NotebookApiError, notebookWorkspaceAction } from "@/lib/notebookClient";
import {
  NOTEBOOK_PAGE_STATUSES,
  NOTEBOOK_PAGE_TYPES,
  NOTEBOOK_TEMPLATES,
  stripNotebookHtml,
  type NotebookAsset,
  type NotebookBook,
  type NotebookLibrary,
  type NotebookPageDetail,
  type NotebookPageStatus,
  type NotebookPageSummary,
  type NotebookPageType,
  type NotebookScope,
  type NotebookSection,
  type NotebookVersion,
} from "@/lib/notebookKnowledge";

type WorkspaceView = "overview" | "daily" | "library" | "trash";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

type DailyFacts = {
  executionRecords: number;
  pnl: number;
  outcome: "profit" | "loss" | "flat" | "no_activity";
  planRespected: number;
  planViolated: number;
  noteBlocks: { premarket: boolean; live: boolean; post: boolean };
  instruments: string[];
};

type DailyNote = {
  id?: string;
  content?: string | null;
  ink?: unknown;
  version?: number;
  updated_at?: string | null;
};

type SearchHit = {
  id: string;
  sourceType: "page" | "daily_review" | "journal";
  label: string;
  excerpt: string;
  href: string;
  date?: string | null;
};

type TrashData = {
  books: NotebookBook[];
  pages: NotebookPageSummary[];
  available: boolean;
};

const PAGE_TYPE_ICONS: Record<NotebookPageType, typeof NotebookPen> = {
  general: NotebookPen,
  daily_review: CalendarDays,
  lesson: Sparkles,
  setup_playbook: Target,
  risk_rule: ShieldCheck,
  research: FileSearch,
  decision: CheckCircle2,
  funded_program: BriefcaseBusiness,
};

function todayYmd() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value || 0);
}

function pageTypeLabel(type: NotebookPageType, isEs: boolean) {
  const labels: Record<NotebookPageType, [string, string]> = {
    general: ["General note", "Nota general"],
    daily_review: ["Daily review", "Revisión diaria"],
    lesson: ["Lesson", "Lección"],
    setup_playbook: ["Setup playbook", "Playbook de setup"],
    risk_rule: ["Risk rule", "Regla de riesgo"],
    research: ["Research", "Investigación"],
    decision: ["Decision", "Decisión"],
    funded_program: ["Funded program", "Programa fondeado"],
  };
  return labels[type][isEs ? 1 : 0];
}

function statusLabel(status: NotebookPageStatus, isEs: boolean) {
  const labels: Record<NotebookPageStatus, [string, string]> = {
    draft: ["Draft", "Borrador"],
    candidate: ["Candidate", "Candidata"],
    validated: ["Validated", "Validada"],
    active: ["Active", "Activa"],
    retired: ["Retired", "Retirada"],
    archived: ["Archived", "Archivada"],
  };
  return labels[status][isEs ? 1 : 0];
}

function sourceHref(page: NotebookPageDetail) {
  if (!page.source_type || !page.source_id) return "";
  if (page.source_type === "journal_day") return `/journal/${page.source_id}`;
  if (page.source_type === "back_study" || page.source_type === "trade") return `/back-study?trade=${encodeURIComponent(page.source_id)}`;
  if (page.source_type === "business_plan") return "/growth-plan";
  if (page.source_type === "ai_coaching") return "/performance/ai-coaching";
  return "";
}

function PageRow({ page, active, isEs, onClick }: { page: NotebookPageSummary; active?: boolean; isEs: boolean; onClick: () => void }) {
  const Icon = PAGE_TYPE_ICONS[page.page_type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full border-b border-slate-800 px-3 py-3 text-left transition last:border-b-0 ${active ? "bg-emerald-400/10" : "hover:bg-slate-900"}`}
    >
      <div className="flex items-start gap-3">
        <Icon size={16} className={active ? "mt-0.5 text-emerald-300" : "mt-0.5 text-slate-500"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-100">{page.title}</p>
            {page.is_pinned ? <Pin size={12} className="shrink-0 text-amber-300" /> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
            {page.summary || pageTypeLabel(page.page_type, isEs)}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold uppercase text-slate-500">
            <span>{statusLabel(page.status, isEs)}</span>
            {page.tags[0] ? <span>#{page.tags[0]}</span> : null}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function NotebookPage() {
  const { user, loading: authLoading } = useAuth();
  const { plan, loading: planLoading } = useUserPlan();
  const { accounts, activeAccountId, loading: accountsLoading, setActiveAccount } = useTradingAccounts();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);

  const [scope, setScope] = useState<NotebookScope>("account");
  const [view, setView] = useState<WorkspaceView>("overview");
  const [library, setLibrary] = useState<NotebookLibrary | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [page, setPage] = useState<NotebookPageDetail | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageSaveState, setPageSaveState] = useState<SaveState>("idle");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [createPageOpen, setCreatePageOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState("blank");
  const [newPageTitle, setNewPageTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [simpleDialog, setSimpleDialog] = useState<"book" | "section" | "rename_book" | null>(null);
  const [simpleValue, setSimpleValue] = useState("");

  const [selectedDate, setSelectedDate] = useState(todayYmd());
  const [dailyFacts, setDailyFacts] = useState<DailyFacts | null>(null);
  const [dailyNote, setDailyNote] = useState<DailyNote | null>(null);
  const [dailyDraft, setDailyDraft] = useState<NotebookEditableContent>(() => createNotebookEditableContent());
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailySaveState, setDailySaveState] = useState<SaveState>("idle");

  const [trash, setTrash] = useState<TrashData | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiCitations, setAiCitations] = useState<SearchHit[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bootstrapRef = useRef(new Set<string>());
  const initialUrlRef = useRef(false);
  const pageEditSeq = useRef(0);
  const dailyEditSeq = useRef(0);

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  );
  const accountId = scope === "account" ? activeAccountId : null;
  const books = library?.books.filter((book) => !book.archived_at) ?? [];
  const selectedBook = books.find((book) => book.id === selectedBookId) ?? books[0] ?? null;
  const sections = (library?.sections ?? []).filter((section) => section.notebook_id === selectedBook?.id);
  const pages = (library?.pages ?? []).filter((item) => {
    if (item.notebook_id !== selectedBook?.id) return false;
    if (selectedSectionId === "all") return true;
    if (selectedSectionId === "loose") return !item.section_id;
    return item.section_id === selectedSectionId;
  });
  const reviewPages = (library?.pages ?? []).filter((item) => item.status === "candidate" || (item.review_due_at && item.review_due_at.slice(0, 10) <= todayYmd()));
  const recentPages = [...(library?.pages ?? [])]
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))
    .slice(0, 6);

  const loadLibrary = useCallback(async (preferredPageId?: string | null) => {
    if (plan !== "advanced" || (scope === "account" && !activeAccountId)) return;
    setLibraryLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ view: "library", scope });
      if (scope === "account" && activeAccountId) params.set("accountId", activeAccountId);
      let result = await notebookApi<{ library: NotebookLibrary }>(`/api/notebook/workspace?${params}`);
      if (result.library.books.length === 0) {
        const key = `${scope}:${activeAccountId || "business"}`;
        if (!bootstrapRef.current.has(key)) {
          bootstrapRef.current.add(key);
          await notebookWorkspaceAction("create_book", {
            scope,
            accountId: scope === "account" ? activeAccountId : null,
            name: scope === "business" ? L("Business Knowledge", "Conocimiento del negocio") : L("Account Playbook", "Playbook de la cuenta"),
          });
          result = await notebookApi<{ library: NotebookLibrary }>(`/api/notebook/workspace?${params}`);
        }
      }
      setLibrary(result.library);
      setSelectedBookId((current) => {
        const preferred = preferredPageId
          ? result.library.pages.find((item) => item.id === preferredPageId)?.notebook_id
          : null;
        return preferred || (current && result.library.books.some((book) => book.id === current) ? current : result.library.books[0]?.id ?? null);
      });
      setSelectedPageId((current) => preferredPageId || (current && result.library.pages.some((item) => item.id === current) ? current : null));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : L("Unable to load the notebook.", "No se pudo cargar el notebook."));
    } finally {
      setLibraryLoading(false);
    }
  }, [L, activeAccountId, plan, scope]);

  useEffect(() => {
    if (!accountsLoading && !activeAccountId && scope === "account") setScope("business");
  }, [accountsLoading, activeAccountId, scope]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (initialUrlRef.current || typeof window === "undefined") return;
    initialUrlRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const linkedPage = params.get("page");
    const linkedDate = params.get("date");
    if (linkedPage) {
      setView("library");
      setSelectedPageId(linkedPage);
    } else if (linkedDate) {
      setView("daily");
      setSelectedDate(linkedDate);
    }
  }, []);

  useEffect(() => {
    if (!selectedPageId) {
      setPage(null);
      return;
    }
    let active = true;
    setPageLoading(true);
    notebookApi<{ page: NotebookPageDetail }>(`/api/notebook/workspace?view=page&pageId=${encodeURIComponent(selectedPageId)}`)
      .then((result) => {
        if (!active) return;
        setPage(result.page);
        setPageSaveState("idle");
        const pageMeta = library?.pages.find((item) => item.id === selectedPageId);
        if (pageMeta) setSelectedBookId(pageMeta.notebook_id);
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Unable to load page."))
      .finally(() => active && setPageLoading(false));
    return () => { active = false; };
  }, [library?.pages, selectedPageId]);

  const updatePageDraft = useCallback((patch: Partial<NotebookPageDetail>) => {
    pageEditSeq.current += 1;
    setPage((current) => current ? { ...current, ...patch } : current);
    setPageSaveState("dirty");
  }, []);

  const savePage = useCallback(async () => {
    if (!page || pageSaveState === "saving") return;
    const seq = pageEditSeq.current;
    setPageSaveState("saving");
    try {
      const result = await notebookWorkspaceAction<{ page: NotebookPageDetail }>("update_page", {
        pageId: page.id,
        title: page.title,
        content: page.content,
        ink: page.ink,
        sectionId: page.section_id,
        pageType: page.page_type,
        status: page.status,
        tags: page.tags,
        isPinned: page.is_pinned,
        reviewDueAt: page.review_due_at,
        expectedVersion: page.version,
      });
      setPage((current) => current ? {
        ...(pageEditSeq.current === seq ? result.page : current),
        links: current.links,
        assets: current.assets,
        versions: current.versions,
        version: result.page.version,
      } : current);
      if (pageEditSeq.current === seq) setPageSaveState("saved");
      else setPageSaveState("dirty");
      setLibrary((current) => current ? {
        ...current,
        pages: current.pages.map((item) => item.id === result.page.id ? { ...item, ...result.page } : item),
      } : current);
    } catch (caught) {
      setPageSaveState(caught instanceof NotebookApiError && caught.code === "version_conflict" ? "conflict" : "error");
      setError(caught instanceof Error ? caught.message : L("Unable to save the page.", "No se pudo guardar la página."));
    }
  }, [L, page, pageSaveState]);

  useEffect(() => {
    if (pageSaveState !== "dirty") return;
    const timeout = window.setTimeout(() => void savePage(), 1500);
    return () => window.clearTimeout(timeout);
  }, [page, pageSaveState, savePage]);

  const loadDaily = useCallback(async () => {
    if (scope !== "account" || !activeAccountId || view !== "daily") return;
    setDailyLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ view: "daily", accountId: activeAccountId, date: selectedDate });
      const result = await notebookApi<{ daily: { note: DailyNote | null; facts: DailyFacts } }>(`/api/notebook/workspace?${params}`);
      setDailyNote(result.daily.note);
      setDailyFacts(result.daily.facts);
      setDailyDraft(createNotebookEditableContent(result.daily.note?.content ?? "", result.daily.note?.ink));
      setDailySaveState("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : L("Unable to load this review.", "No se pudo cargar esta revisión."));
    } finally {
      setDailyLoading(false);
    }
  }, [L, activeAccountId, scope, selectedDate, view]);

  useEffect(() => { void loadDaily(); }, [loadDaily]);

  const saveDaily = useCallback(async () => {
    if (!activeAccountId || dailySaveState === "saving") return;
    const seq = dailyEditSeq.current;
    setDailySaveState("saving");
    try {
      const result = await notebookWorkspaceAction<{ note: DailyNote }>("upsert_daily", {
        accountId: activeAccountId,
        date: selectedDate,
        content: dailyDraft.content,
        ink: dailyDraft.ink,
        expectedVersion: dailyNote?.version,
      });
      setDailyNote(result.note);
      setDailySaveState(dailyEditSeq.current === seq ? "saved" : "dirty");
    } catch (caught) {
      setDailySaveState(caught instanceof NotebookApiError && caught.code === "version_conflict" ? "conflict" : "error");
      setError(caught instanceof Error ? caught.message : L("Unable to save the review.", "No se pudo guardar la revisión."));
    }
  }, [L, activeAccountId, dailyDraft, dailyNote?.version, dailySaveState, selectedDate]);

  useEffect(() => {
    if (dailySaveState !== "dirty") return;
    const timeout = window.setTimeout(() => void saveDaily(), 1500);
    return () => window.clearTimeout(timeout);
  }, [dailyDraft, dailySaveState, saveDaily]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: searchQuery.trim(), scope });
        if (accountId) params.set("accountId", accountId);
        const result = await notebookApi<{ citations: SearchHit[] }>(`/api/notebook/search?${params}`);
        setSearchHits(result.citations);
      } catch {
        setSearchHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [accountId, scope, searchQuery]);

  const openSearchHit = useCallback((hit: SearchHit) => {
    setSearchOpen(false);
    setSearchQuery("");
    if (hit.sourceType === "page") {
      const pageId = hit.id.replace(/^page:/, "");
      setView("library");
      setSelectedPageId(pageId);
      const meta = library?.pages.find((item) => item.id === pageId);
      if (meta) setSelectedBookId(meta.notebook_id);
    } else if (hit.sourceType === "daily_review") {
      const date = hit.href.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1];
      if (date) setSelectedDate(date);
      setView("daily");
    }
  }, [library?.pages]);

  const createPage = useCallback(async () => {
    if (!selectedBook) return;
    setCreating(true);
    setError("");
    try {
      const result = await notebookWorkspaceAction<{ page: NotebookPageSummary }>("create_page", {
        notebookId: selectedBook.id,
        sectionId: selectedSectionId === "all" || selectedSectionId === "loose" ? null : selectedSectionId,
        templateKey,
        title: newPageTitle,
        language: isEs ? "es" : "en",
      });
      setCreatePageOpen(false);
      setNewPageTitle("");
      setTemplateKey("blank");
      await loadLibrary(result.page.id);
      setSelectedPageId(result.page.id);
      setView("library");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : L("Unable to create the page.", "No se pudo crear la página."));
    } finally {
      setCreating(false);
    }
  }, [L, isEs, loadLibrary, newPageTitle, selectedBook, selectedSectionId, templateKey]);

  const submitSimpleDialog = useCallback(async () => {
    if (!simpleDialog || !simpleValue.trim()) return;
    setCreating(true);
    try {
      if (simpleDialog === "book") {
        const result = await notebookWorkspaceAction<{ book: NotebookBook }>("create_book", { scope, accountId, name: simpleValue });
        await loadLibrary();
        setSelectedBookId(result.book.id);
      } else if (simpleDialog === "section" && selectedBook) {
        const result = await notebookWorkspaceAction<{ section: NotebookSection }>("create_section", { notebookId: selectedBook.id, name: simpleValue });
        await loadLibrary();
        setSelectedSectionId(result.section.id);
      } else if (simpleDialog === "rename_book" && selectedBook) {
        await notebookWorkspaceAction("update_book", { bookId: selectedBook.id, name: simpleValue });
        await loadLibrary();
      }
      setSimpleDialog(null);
      setSimpleValue("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save.");
    } finally {
      setCreating(false);
    }
  }, [accountId, loadLibrary, scope, selectedBook, simpleDialog, simpleValue]);

  const trashPage = useCallback(async () => {
    if (!page || !window.confirm(L("Move this page to trash?", "¿Mover esta página a la papelera?"))) return;
    await notebookWorkspaceAction("trash_page", { pageId: page.id });
    setSelectedPageId(null);
    setPage(null);
    await loadLibrary();
  }, [L, loadLibrary, page]);

  const convertDailyToLesson = useCallback(async () => {
    if (!selectedBook || !dailyFacts) return;
    setCreating(true);
    try {
      const facts = L(
        `<h2>Observed facts</h2><p>${dailyFacts.executionRecords} execution records; outcome: ${dailyFacts.outcome}; recorded P/L: ${money(dailyFacts.pnl, lang)}.</p>`,
        `<h2>Hechos observados</h2><p>${dailyFacts.executionRecords} registros de ejecución; resultado: ${dailyFacts.outcome}; P/L registrado: ${money(dailyFacts.pnl, lang)}.</p>`
      );
      const template = NOTEBOOK_TEMPLATES.find((item) => item.key === "lesson")!;
      const result = await notebookWorkspaceAction<{ page: NotebookPageSummary }>("create_page", {
        notebookId: selectedBook.id,
        templateKey: "lesson",
        pageType: "lesson",
        status: "candidate",
        title: L(`Lesson from ${selectedDate}`, `Lección del ${selectedDate}`),
        content: `${facts}${template.content[isEs ? "es" : "en"]}${dailyDraft.content}`,
        sourceType: "journal_day",
        sourceId: selectedDate,
        language: isEs ? "es" : "en",
      });
      await loadLibrary(result.page.id);
      setSelectedPageId(result.page.id);
      setView("library");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create lesson.");
    } finally {
      setCreating(false);
    }
  }, [L, dailyDraft.content, dailyFacts, isEs, lang, loadLibrary, selectedBook, selectedDate]);

  const askNotebook = useCallback(async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiAnswer("");
    setAiCitations([]);
    try {
      const result = await notebookApi<{ answer: string; citations: SearchHit[] }>("/api/notebook-ai", {
        method: "POST",
        body: JSON.stringify({
          question: aiQuestion,
          scope,
          accountId,
          selectedPageId,
          selectedDate: view === "daily" ? selectedDate : null,
          language: isEs ? "es" : "en",
        }),
      });
      setAiAnswer(result.answer);
      setAiCitations(result.citations);
    } catch (caught) {
      setAiAnswer(caught instanceof Error ? caught.message : L("Analysis failed.", "El análisis falló."));
    } finally {
      setAiLoading(false);
    }
  }, [L, accountId, aiQuestion, isEs, scope, selectedDate, selectedPageId, view]);

  const uploadAsset = useCallback(async (file: File) => {
    if (!page) return;
    const form = new FormData();
    form.set("pageId", page.id);
    form.set("file", file);
    try {
      const result = await notebookApi<{ asset: NotebookAsset }>("/api/notebook/assets", { method: "POST", body: form });
      setPage((current) => current ? { ...current, assets: [...(current.assets ?? []), result.asset] } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    }
  }, [page]);

  const loadTrash = useCallback(async () => {
    const params = new URLSearchParams({ view: "trash", scope });
    if (accountId) params.set("accountId", accountId);
    const result = await notebookApi<{ trash: TrashData }>(`/api/notebook/workspace?${params}`);
    setTrash(result.trash);
  }, [accountId, scope]);

  useEffect(() => {
    if (view === "trash") void loadTrash().catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load trash."));
  }, [loadTrash, view]);

  if (authLoading || planLoading || accountsLoading) {
    return <main className="min-h-screen bg-[#020617] text-slate-100"><TopNav /><div className="grid min-h-[70vh] place-items-center"><LoaderCircle className="animate-spin text-emerald-300" /></div></main>;
  }

  if (!user) return null;

  if (plan !== "advanced") {
    return (
      <main className="min-h-screen bg-[#020617] text-slate-100">
        <TopNav />
        <section className="mx-auto max-w-3xl px-5 py-20">
          <div className="rounded-lg border border-emerald-400/30 bg-slate-950 p-8">
            <BookOpen className="text-emerald-300" />
            <h1 className="mt-5 text-3xl font-bold">Business Notebook</h1>
            <p className="mt-3 leading-7 text-slate-400">{L("Build a searchable operating memory from reviews, lessons, research, rules, and playbooks.", "Construye una memoria operativa consultable con revisiones, lecciones, investigación, reglas y playbooks.")}</p>
            <Link href="/plans" className="mt-6 inline-flex rounded-md bg-emerald-400 px-4 py-2 font-semibold text-slate-950">{L("View Advanced", "Ver Advanced")}</Link>
          </div>
        </section>
      </main>
    );
  }

  const navItems: { id: WorkspaceView; label: string; icon: typeof BookOpen }[] = [
    { id: "overview", label: L("Overview", "Resumen"), icon: Layers3 },
    { id: "daily", label: L("Daily reviews", "Revisiones diarias"), icon: CalendarDays },
    { id: "library", label: L("Knowledge", "Conocimiento"), icon: BookOpen },
    { id: "trash", label: L("Trash", "Papelera"), icon: Trash2 },
  ];

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100">
      <TopNav />
      <div className="border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-3">
          <button type="button" onClick={() => setMobileNavOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 lg:hidden" title={L("Open navigation", "Abrir navegación")}><Menu size={17} /></button>
          <div className="mr-auto min-w-[180px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">{L("Operating memory", "Memoria operativa")}</p>
            <h1 className="text-lg font-bold">Business Notebook</h1>
          </div>

          <div data-tour="notebook-scope" className="inline-flex h-9 rounded-md border border-slate-700 bg-slate-900 p-0.5" aria-label={L("Notebook scope", "Alcance del notebook")}>
            <button type="button" onClick={() => { setScope("business"); setSelectedPageId(null); }} className={`rounded px-3 text-xs font-semibold ${scope === "business" ? "bg-emerald-400 text-slate-950" : "text-slate-300"}`}>{L("Business-wide", "Todo el negocio")}</button>
            <button type="button" disabled={!activeAccountId} onClick={() => { setScope("account"); setSelectedPageId(null); }} className={`rounded px-3 text-xs font-semibold disabled:opacity-40 ${scope === "account" ? "bg-emerald-400 text-slate-950" : "text-slate-300"}`}>{L("Specific account", "Cuenta específica")}</button>
          </div>

          {scope === "account" ? (
            <select
              value={activeAccountId ?? ""}
              onChange={(event) => void setActiveAccount(event.target.value)}
              className="h-9 min-w-[180px] rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
              aria-label={L("Trading account", "Cuenta de trading")}
            >
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.account_type === "funded" ? L("Funded", "Fondeada") : L("Personal", "Personal")}</option>)}
            </select>
          ) : null}

          <div data-tour="notebook-search" className="relative w-full sm:w-[300px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-slate-500" />
            <input value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} placeholder={L("Search your operating memory", "Buscar en tu memoria operativa")} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-9 text-sm outline-none focus:border-emerald-400" />
            {searching ? <LoaderCircle size={15} className="absolute right-3 top-2.5 animate-spin text-emerald-300" /> : null}
            {searchOpen && searchQuery.trim().length >= 2 ? (
              <div className="absolute right-0 top-11 z-40 max-h-[420px] w-full overflow-auto rounded-md border border-slate-700 bg-slate-950 shadow-2xl sm:w-[520px]">
                {searchHits.length ? searchHits.map((hit) => (
                  <button type="button" key={hit.id} onClick={() => openSearchHit(hit)} className="block w-full border-b border-slate-800 px-4 py-3 text-left last:border-0 hover:bg-slate-900">
                    <p className="text-sm font-semibold text-slate-100">{hit.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{hit.excerpt}</p>
                  </button>
                )) : !searching ? <p className="p-4 text-sm text-slate-500">{L("No matching evidence found.", "No se encontró evidencia coincidente.")}</p> : null}
              </div>
            ) : null}
          </div>

          <button data-tour="notebook-analyze" type="button" onClick={() => setAiOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-400 px-3 text-sm font-bold text-slate-950"><BrainCircuit size={16} />{L("Analyze", "Analizar")}</button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1680px]">
        <aside className={`${mobileNavOpen ? "block" : "hidden"} fixed inset-x-0 z-30 border-b border-slate-800 bg-slate-950 p-3 lg:static lg:block lg:min-h-[calc(100vh-130px)] lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r`}>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return <button key={item.id} type="button" onClick={() => { setView(item.id); setMobileNavOpen(false); }} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold ${view === item.id ? "bg-emerald-400/15 text-emerald-200" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`}><Icon size={17} />{item.label}</button>;
            })}
          </nav>
          <div className="mt-6 border-t border-slate-800 pt-5">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{L("Current context", "Contexto actual")}</p>
            <p className="mt-2 px-3 text-sm font-semibold text-slate-200">{scope === "business" ? L("Entire trading business", "Todo el negocio de trading") : activeAccount?.name}</p>
            {scope === "account" ? <p className="mt-1 px-3 text-xs text-slate-500">{activeAccount?.account_type === "funded" ? L("Funded account", "Cuenta fondeada") : L("Personal account", "Cuenta personal")}</p> : null}
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-4 md:p-6">
          {error ? <div className="mb-4 flex items-start justify-between rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"><span>{error}</span><button type="button" onClick={() => setError("")} title={L("Dismiss", "Cerrar")}><X size={16} /></button></div> : null}
          {libraryLoading && !library ? <div className="grid min-h-[55vh] place-items-center"><LoaderCircle className="animate-spin text-emerald-300" /></div> : null}

          {view === "overview" && library ? (
            <div className="space-y-6">
              <header data-tour="notebook-capture" className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{L("Business knowledge system", "Sistema de conocimiento del negocio")}</p><h2 className="mt-2 text-2xl font-bold">{L("Turn evidence into better operating decisions", "Convierte evidencia en mejores decisiones operativas")}</h2></div>
                <button type="button" onClick={() => setCreatePageOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950"><Plus size={16} />{L("Quick capture", "Captura rápida")}</button>
              </header>

              <div className="grid gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 sm:grid-cols-3">
                <div className="bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">{L("Knowledge pages", "Páginas")}</p><p className="mt-2 text-2xl font-bold">{library.pages.length}</p></div>
                <div className="bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">{L("Needs review", "Requiere revisión")}</p><p className="mt-2 text-2xl font-bold text-amber-200">{reviewPages.length}</p></div>
                <div className="bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">{L("Validated or active", "Validada o activa")}</p><p className="mt-2 text-2xl font-bold text-emerald-200">{library.pages.filter((item) => item.status === "validated" || item.status === "active").length}</p></div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950">
                  <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><h3 className="font-bold">{L("Needs review", "Requiere revisión")}</h3><p className="mt-1 text-xs text-slate-500">{L("Candidate insights and scheduled checks", "Ideas candidatas y revisiones programadas")}</p></div><button type="button" onClick={() => setView("library")} className="text-xs font-semibold text-emerald-300">{L("Open library", "Abrir biblioteca")}</button></div>
                  {reviewPages.length ? reviewPages.slice(0, 5).map((item) => <PageRow key={item.id} page={item} isEs={isEs} onClick={() => { setSelectedPageId(item.id); setSelectedBookId(item.notebook_id); setView("library"); }} />) : <div className="p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-300" /><p className="mt-3 text-sm font-semibold">{L("Nothing waiting for review", "Nada pendiente de revisión")}</p></div>}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950">
                  <div className="border-b border-slate-800 px-4 py-3"><h3 className="font-bold">{L("Recently worked", "Trabajo reciente")}</h3><p className="mt-1 text-xs text-slate-500">{L("Continue where your thinking last changed", "Continúa donde cambió tu razonamiento")}</p></div>
                  {recentPages.length ? recentPages.map((item) => <PageRow key={item.id} page={item} isEs={isEs} onClick={() => { setSelectedPageId(item.id); setSelectedBookId(item.notebook_id); setView("library"); }} />) : <div className="p-8 text-center text-sm text-slate-500">{L("Create the first lesson, rule, or playbook.", "Crea la primera lección, regla o playbook.")}</div>}
                </div>
              </div>

              <div data-tour="notebook-operating-loop" className="rounded-lg border border-slate-800 bg-slate-950 p-5">
                <h3 className="font-bold">{L("Operating loop", "Ciclo operativo")}</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[L("Capture evidence", "Captura evidencia"), L("Review objectively", "Revisa objetivamente"), L("Validate a lesson", "Valida una lección"), L("Promote to the plan", "Llévala al plan")].map((label, index) => <div key={label} className="flex items-center gap-3 border-l-2 border-emerald-400 px-3 py-2"><span className="text-xs font-bold text-emerald-300">0{index + 1}</span><span className="text-sm font-semibold">{label}</span></div>)}
                </div>
              </div>
            </div>
          ) : null}

          {view === "daily" ? (
            scope !== "account" || !activeAccountId ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-10 text-center"><CalendarDays className="mx-auto text-slate-500" /><h2 className="mt-4 text-xl font-bold">{L("Choose a specific account", "Selecciona una cuenta específica")}</h2><p className="mt-2 text-sm text-slate-400">{L("Daily reviews stay attached to the account that produced the evidence.", "Las revisiones diarias permanecen ligadas a la cuenta que produjo la evidencia.")}</p><button type="button" disabled={!activeAccountId} onClick={() => setScope("account")} className="mt-5 rounded-md bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{L("Use active account", "Usar cuenta activa")}</button></div>
            ) : (
              <div className="space-y-5">
                <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">{activeAccount?.name}</p><h2 className="mt-2 text-2xl font-bold">{L("Daily execution review", "Revisión diaria de ejecución")}</h2></div><div className="flex items-center gap-2"><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm" /><Link href={`/journal/${selectedDate}`} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-semibold">{L("Open journal", "Abrir journal")}<ExternalLink size={14} /></Link></div></header>
                {dailyLoading ? <div className="grid min-h-[360px] place-items-center"><LoaderCircle className="animate-spin text-emerald-300" /></div> : (
                  <>
                    <div className="grid gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">{L("Execution records", "Registros de ejecución")}</p><p className="mt-2 text-2xl font-bold">{dailyFacts?.executionRecords ?? 0}</p></div>
                      <div className="bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">{L("Recorded outcome", "Resultado registrado")}</p><p className={`mt-2 text-2xl font-bold ${(dailyFacts?.pnl ?? 0) < 0 ? "text-rose-300" : "text-emerald-200"}`}>{money(dailyFacts?.pnl ?? 0, lang)}</p><p className="mt-1 text-xs text-slate-500">{dailyFacts?.outcome === "loss" ? L("Loss day", "Día de pérdida") : dailyFacts?.outcome === "profit" ? L("Profit day", "Día de ganancia") : dailyFacts?.outcome === "flat" ? L("Flat day", "Día neutral") : L("No activity", "Sin actividad")}</p></div>
                      <div className="bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">{L("Plan alignment", "Alineación al plan")}</p><p className="mt-2 text-2xl font-bold">{dailyFacts?.planRespected ?? 0}/{(dailyFacts?.planRespected ?? 0) + (dailyFacts?.planViolated ?? 0)}</p><p className="mt-1 text-xs text-slate-500">{L("Records marked compliant", "Registros marcados en cumplimiento")}</p></div>
                      <div className="bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">{L("Journal coverage", "Cobertura del journal")}</p><p className="mt-2 text-2xl font-bold">{dailyFacts ? Object.values(dailyFacts.noteBlocks).filter(Boolean).length : 0}/3</p><p className="mt-1 text-xs text-slate-500">{L("Pre, live, and post-session", "Pre, durante y post-sesión")}</p></div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 md:p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">{L("Context and reflection", "Contexto y reflexión")}</h3><p className="mt-1 text-xs text-slate-500">{L("The journal supplies facts; use this space for meaning, patterns, and the next test.", "El journal aporta hechos; usa este espacio para significado, patrones y la próxima prueba.")}</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{dailySaveState === "saving" ? L("Saving...", "Guardando...") : dailySaveState === "saved" ? L("Saved", "Guardado") : dailySaveState === "conflict" ? L("Reload required", "Requiere recargar") : ""}</span><button type="button" disabled={!dailyFacts || creating} onClick={() => void convertDailyToLesson()} className="inline-flex items-center gap-2 rounded-md border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-100"><Sparkles size={14} />{L("Create lesson candidate", "Crear lección candidata")}</button></div></div>
                      <NotebookInkField label={L("Daily review", "Revisión diaria")} value={dailyDraft} onChange={(next) => { dailyEditSeq.current += 1; setDailyDraft(next); setDailySaveState("dirty"); }} placeholder={L("What happened, what does the evidence support, and what will you test next?", "¿Qué ocurrió, qué sostiene la evidencia y qué vas a probar después?")} minHeight={360} />
                    </div>
                  </>
                )}
              </div>
            )
          ) : null}

          {view === "library" && library ? (
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 xl:grid xl:min-h-[680px] xl:grid-cols-[220px_300px_minmax(0,1fr)]">
              <aside className="border-b border-slate-800 p-3 xl:border-b-0 xl:border-r">
                <div className="flex items-center justify-between px-1 pb-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{L("Notebooks", "Notebooks")}</p><button type="button" title={L("New notebook", "Nuevo notebook")} onClick={() => { setSimpleValue(""); setSimpleDialog("book"); }} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-emerald-300"><FolderPlus size={15} /></button></div>
                <div className="space-y-1">{books.map((book) => <button key={book.id} type="button" onClick={() => { setSelectedBookId(book.id); setSelectedSectionId("all"); setSelectedPageId(null); }} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold ${selectedBook?.id === book.id ? "bg-emerald-400/15 text-emerald-100" : "text-slate-400 hover:bg-slate-900"}`}><BookOpen size={15} /><span className="truncate">{book.name}</span></button>)}</div>
                {selectedBook ? (
                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <div className="flex items-center justify-between px-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{L("Sections", "Secciones")}</p><button type="button" title={L("New section", "Nueva sección")} onClick={() => { setSimpleValue(""); setSimpleDialog("section"); }} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800"><Plus size={14} /></button></div>
                    <div className="mt-2 space-y-1">
                      <button type="button" onClick={() => setSelectedSectionId("all")} className={`w-full rounded-md px-2.5 py-2 text-left text-xs font-semibold ${selectedSectionId === "all" ? "bg-slate-800 text-slate-100" : "text-slate-500"}`}>{L("All pages", "Todas las páginas")}</button>
                      {sections.map((section) => <div key={section.id} className={`flex items-center rounded-md ${selectedSectionId === section.id ? "bg-slate-800" : ""}`}><button type="button" onClick={() => setSelectedSectionId(section.id)} className={`min-w-0 flex-1 truncate px-2.5 py-2 text-left text-xs font-semibold ${selectedSectionId === section.id ? "text-slate-100" : "text-slate-500"}`}>{section.name}</button><button type="button" title={L("Delete section", "Eliminar sección")} onClick={async () => { if (!window.confirm(L("Delete this section? Its pages will remain unfiled.", "¿Eliminar esta sección? Sus páginas quedarán sin archivar."))) return; await notebookWorkspaceAction("delete_section", { sectionId: section.id }); setSelectedSectionId("all"); await loadLibrary(); }} className="mr-1 grid h-6 w-6 place-items-center rounded text-slate-600 hover:text-rose-300"><X size={12} /></button></div>)}
                      <button type="button" onClick={() => setSelectedSectionId("loose")} className={`w-full rounded-md px-2.5 py-2 text-left text-xs font-semibold ${selectedSectionId === "loose" ? "bg-slate-800 text-slate-100" : "text-slate-500"}`}>{L("Unfiled", "Sin archivar")}</button>
                    </div>
                    <div className="mt-4 flex items-center gap-1 px-1">
                      <button type="button" title={L("Rename notebook", "Renombrar notebook")} onClick={() => { setSimpleValue(selectedBook.name); setSimpleDialog("rename_book"); }} className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-200"><NotebookPen size={13} />{L("Rename", "Renombrar")}</button>
                      <button type="button" title={L("Move notebook to trash", "Mover notebook a papelera")} onClick={async () => { if (!window.confirm(L("Move this notebook and its pages to trash?", "¿Mover este notebook y sus páginas a la papelera?"))) return; await notebookWorkspaceAction("trash_book", { bookId: selectedBook.id }); setSelectedPageId(null); await loadLibrary(); }} className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ) : null}
              </aside>

              <div className="border-b border-slate-800 xl:border-b-0 xl:border-r">
                <div className="flex h-14 items-center justify-between border-b border-slate-800 px-3"><div><p className="text-xs font-bold text-slate-200">{selectedBook?.name}</p><p className="text-[10px] text-slate-500">{pages.length} {L("pages", "páginas")}</p></div><button type="button" title={L("Create page", "Crear página")} onClick={() => setCreatePageOpen(true)} className="grid h-8 w-8 place-items-center rounded-md bg-emerald-400 text-slate-950"><Plus size={16} /></button></div>
                <div className="max-h-[360px] overflow-y-auto xl:max-h-[calc(100vh-220px)]">{pages.length ? pages.map((item) => <PageRow key={item.id} page={item} active={item.id === selectedPageId} isEs={isEs} onClick={() => setSelectedPageId(item.id)} />) : <div className="p-8 text-center"><NotebookPen className="mx-auto text-slate-600" /><p className="mt-3 text-sm text-slate-500">{L("No pages in this section.", "No hay páginas en esta sección.")}</p></div>}</div>
              </div>

              <div className="min-w-0">
                {pageLoading ? <div className="grid min-h-[560px] place-items-center"><LoaderCircle className="animate-spin text-emerald-300" /></div> : page ? (
                  <div className="p-4 md:p-5">
                    <div className="flex flex-wrap items-start gap-3 border-b border-slate-800 pb-4">
                      <input value={page.title} onChange={(event) => updatePageDraft({ title: event.target.value })} className="min-w-[220px] flex-1 bg-transparent text-xl font-bold outline-none placeholder:text-slate-600" placeholder={L("Untitled page", "Página sin título")} />
                      <select value={page.page_type} onChange={(event) => updatePageDraft({ page_type: event.target.value as NotebookPageType })} className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs font-semibold">{NOTEBOOK_PAGE_TYPES.map((type) => <option key={type} value={type}>{pageTypeLabel(type, isEs)}</option>)}</select>
                      <select value={page.status} onChange={(event) => updatePageDraft({ status: event.target.value as NotebookPageStatus })} className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs font-semibold">{NOTEBOOK_PAGE_STATUSES.filter((status) => status !== "active" || page.status === "active").map((status) => <option key={status} value={status}>{statusLabel(status, isEs)}</option>)}</select>
                      <button type="button" title={page.is_pinned ? L("Unpin", "Desfijar") : L("Pin", "Fijar")} onClick={() => updatePageDraft({ is_pinned: !page.is_pinned })} className={`grid h-9 w-9 place-items-center rounded-md border ${page.is_pinned ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-slate-700 text-slate-400"}`}><Pin size={15} /></button>
                      <button type="button" title={L("Move to trash", "Mover a papelera")} onClick={() => void trashPage()} className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-400 hover:border-rose-400 hover:text-rose-200"><Trash2 size={15} /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input value={page.tags.join(", ")} onChange={(event) => updatePageDraft({ tags: event.target.value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 20) })} placeholder={L("Tags separated by commas", "Tags separados por comas")} className="h-8 min-w-[220px] flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 text-xs outline-none focus:border-emerald-400" />
                      <input type="date" value={page.review_due_at?.slice(0, 10) ?? ""} onChange={(event) => updatePageDraft({ review_due_at: event.target.value || null })} title={L("Review date", "Fecha de revisión")} className="h-8 rounded-md border border-slate-800 bg-slate-900 px-2 text-xs" />
                      <span className={`text-xs ${pageSaveState === "error" || pageSaveState === "conflict" ? "text-rose-300" : "text-slate-500"}`}>{pageSaveState === "saving" ? L("Saving...", "Guardando...") : pageSaveState === "dirty" ? L("Unsaved changes", "Cambios sin guardar") : pageSaveState === "saved" ? L("Saved", "Guardado") : pageSaveState === "conflict" ? L("Changed elsewhere. Reload.", "Cambió en otra sesión. Recarga.") : `v${page.version}`}</span>
                      {pageSaveState === "conflict" ? <button type="button" onClick={() => { const id = page.id; setSelectedPageId(null); window.setTimeout(() => setSelectedPageId(id), 0); }} className="text-xs font-bold text-emerald-300">{L("Reload", "Recargar")}</button> : null}
                      {sourceHref(page) ? <Link href={sourceHref(page)} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300"><ExternalLink size={12} />{L("Open source evidence", "Abrir evidencia fuente")}</Link> : null}
                      {(page.status === "validated" || page.status === "active") && ["lesson", "setup_playbook", "risk_rule"].includes(page.page_type) ? <button type="button" onClick={async () => { if (!window.confirm(L("Promote this validated knowledge into the operating system?", "¿Llevar este conocimiento validado al sistema operativo?"))) return; const result = await notebookWorkspaceAction<{ page: NotebookPageDetail; targetHref: string }>("promote_page", { pageId: page.id }); setPage((current) => current ? { ...current, ...result.page } : current); window.location.href = result.targetHref; }} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 px-2.5 py-1.5 text-xs font-bold text-emerald-200"><ChevronRight size={13} />{page.page_type === "risk_rule" ? L("Promote to protection", "Llevar a protección") : L("Promote to plan", "Llevar al plan")}</button> : null}
                    </div>
                    <div className="mt-5"><NotebookInkField label={pageTypeLabel(page.page_type, isEs)} value={createNotebookEditableContent(page.content, page.ink)} onChange={(next) => updatePageDraft({ content: next.content, ink: next.ink })} placeholder={L("Record evidence, reasoning, invalidation, and the next test...", "Registra evidencia, razonamiento, invalidación y la próxima prueba...")} minHeight={420} /></div>
                    <div className="mt-6 grid gap-5 border-t border-slate-800 pt-5 lg:grid-cols-2">
                      <div><div className="flex items-center justify-between"><h3 className="text-sm font-bold">{L("Evidence and attachments", "Evidencia y adjuntos")}</h3><button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-semibold"><Upload size={13} />{L("Attach", "Adjuntar")}</button><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = ""; }} /></div><div className="mt-3 space-y-2">{page.assets?.length ? page.assets.map((asset) => <div key={asset.id} className="flex items-center gap-2"><a href={asset.signed_url ?? "#"} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-slate-800 px-3 py-2 text-sm hover:border-emerald-400/40"><Paperclip size={14} className="shrink-0 text-slate-500" /><span className="truncate">{asset.file_name}</span><span className="ml-auto shrink-0 text-[10px] text-slate-600">{Math.ceil(asset.size_bytes / 1024)} KB</span></a><button type="button" title={L("Remove attachment", "Eliminar adjunto")} onClick={async () => { if (!window.confirm(L("Remove this attachment?", "¿Eliminar este adjunto?"))) return; await notebookApi("/api/notebook/assets", { method: "DELETE", body: JSON.stringify({ assetId: asset.id }) }); setPage((current) => current ? { ...current, assets: current.assets?.filter((item) => item.id !== asset.id) } : current); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-800 text-slate-500 hover:border-rose-400 hover:text-rose-200"><X size={13} /></button></div>) : <p className="text-xs text-slate-500">{L("No attachments on this page. Private storage limit: 250 MB.", "Esta página no tiene adjuntos. Límite privado: 250 MB.")}</p>}</div></div>
                      <div><h3 className="flex items-center gap-2 text-sm font-bold"><History size={15} />{L("Version history", "Historial de versiones")}</h3><div className="mt-3 max-h-40 space-y-2 overflow-auto">{page.versions?.length ? page.versions.map((version: NotebookVersion) => <div key={version.id} className="flex items-center gap-3 rounded-md border border-slate-800 px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">v{version.version} · {version.title}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(version.created_at, lang)}</p></div><button type="button" title={L("Restore version", "Restaurar versión")} onClick={async () => { const result = await notebookWorkspaceAction<{ page: NotebookPageDetail }>("restore_version", { pageId: page.id, versionId: version.id }); setPage((current) => current ? { ...current, ...result.page } : current); }} className="grid h-7 w-7 place-items-center rounded-md border border-slate-700"><RotateCcw size={13} /></button></div>) : <p className="text-xs text-slate-500">{L("Version snapshots appear as the page evolves.", "Las versiones aparecen a medida que evoluciona la página.")}</p>}</div></div>
                    </div>
                  </div>
                ) : <div className="grid min-h-[560px] place-items-center p-8 text-center"><div><BookOpen className="mx-auto text-slate-600" /><h3 className="mt-4 font-bold">{L("Choose a page or capture a new idea", "Elige una página o captura una idea nueva")}</h3><button type="button" onClick={() => setCreatePageOpen(true)} className="mt-4 rounded-md bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950">{L("Create page", "Crear página")}</button></div></div>}
              </div>
            </div>
          ) : null}

          {view === "trash" ? (
            <div className="space-y-5">
              <header className="border-b border-slate-800 pb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{L("Recovery", "Recuperación")}</p>
                <h2 className="mt-2 text-2xl font-bold">{L("Trash", "Papelera")}</h2>
              </header>
              {trash?.available === false ? <p className="rounded-md border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">{L("Trash recovery will activate with the database update.", "La recuperación de papelera se activará con la actualización de base de datos.")}</p> : null}
              {trash?.books.length ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950">
                  <p className="border-b border-slate-800 px-4 py-3 text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{L("Notebooks", "Notebooks")}</p>
                  {trash.books.map((book) => <div key={book.id} className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3 last:border-0"><BookOpen size={15} className="text-slate-600" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{book.name}</p><p className="mt-1 text-xs text-slate-500">{formatDate(book.deleted_at, lang)}</p></div><button type="button" onClick={async () => { await notebookWorkspaceAction("restore_book", { bookId: book.id }); await loadTrash(); await loadLibrary(); }} className="rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs font-bold text-emerald-200">{L("Restore", "Restaurar")}</button><button type="button" title={L("Delete forever", "Eliminar para siempre")} onClick={async () => { if (!window.confirm(L("Delete this notebook and every page forever?", "¿Eliminar este notebook y todas sus páginas para siempre?"))) return; await notebookWorkspaceAction("delete_book_forever", { bookId: book.id }); await loadTrash(); }} className="grid h-8 w-8 place-items-center rounded-md border border-rose-500/40 text-rose-200"><X size={14} /></button></div>)}
                </div>
              ) : null}
              <div className="rounded-lg border border-slate-800 bg-slate-950">
                <p className="border-b border-slate-800 px-4 py-3 text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{L("Pages", "Páginas")}</p>
                {trash?.pages.length ? trash.pages.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3 last:border-0"><Trash2 size={15} className="text-slate-600" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{formatDate(item.deleted_at, lang)}</p></div><button type="button" onClick={async () => { await notebookWorkspaceAction("restore_page", { pageId: item.id }); await loadTrash(); await loadLibrary(); }} className="rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs font-bold text-emerald-200">{L("Restore", "Restaurar")}</button><button type="button" title={L("Delete forever", "Eliminar para siempre")} onClick={async () => { if (!window.confirm(L("Delete this page forever?", "¿Eliminar esta página para siempre?"))) return; await notebookWorkspaceAction("delete_page_forever", { pageId: item.id }); await loadTrash(); }} className="grid h-8 w-8 place-items-center rounded-md border border-rose-500/40 text-rose-200"><X size={14} /></button></div>) : <div className="p-8 text-center text-sm text-slate-500">{L("No deleted pages.", "No hay páginas eliminadas.")}</div>}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {createPageOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setCreatePageOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">{L("Capture with purpose", "Captura con propósito")}</h2><p className="mt-1 text-sm text-slate-400">{L("Choose the structure that matches the decision you are documenting.", "Elige la estructura que corresponde a la decisión que documentas.")}</p></div><button type="button" title={L("Close", "Cerrar")} onClick={() => setCreatePageOpen(false)}><X /></button></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">{NOTEBOOK_TEMPLATES.map((template) => { const Icon = PAGE_TYPE_ICONS[template.pageType]; return <button key={template.key} type="button" onClick={() => setTemplateKey(template.key)} className={`flex items-start gap-3 rounded-md border p-3 text-left ${templateKey === template.key ? "border-emerald-400 bg-emerald-400/10" : "border-slate-800 hover:border-slate-600"}`}><Icon size={17} className="mt-0.5 text-emerald-300" /><span><span className="block text-sm font-bold">{template.title[isEs ? "es" : "en"]}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{template.description[isEs ? "es" : "en"]}</span></span></button>; })}</div>
            <label className="mt-5 block text-xs font-bold uppercase text-slate-500">{L("Page title", "Título de la página")}</label><input autoFocus value={newPageTitle} onChange={(event) => setNewPageTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createPage(); }} placeholder={NOTEBOOK_TEMPLATES.find((item) => item.key === templateKey)?.title[isEs ? "es" : "en"]} className="mt-2 h-11 w-full rounded-md border border-slate-700 bg-slate-900 px-3 outline-none focus:border-emerald-400" />
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreatePageOpen(false)} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold">{L("Cancel", "Cancelar")}</button><button type="button" disabled={creating || !selectedBook} onClick={() => void createPage()} className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{creating ? L("Creating...", "Creando...") : L("Create page", "Crear página")}</button></div>
          </div>
        </div>
      ) : null}

      {simpleDialog ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setSimpleDialog(null); }}><div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 p-5"><h2 className="font-bold">{simpleDialog === "book" ? L("New notebook", "Nuevo notebook") : simpleDialog === "section" ? L("New section", "Nueva sección") : L("Rename notebook", "Renombrar notebook")}</h2><input autoFocus value={simpleValue} onChange={(event) => setSimpleValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitSimpleDialog(); }} className="mt-4 h-11 w-full rounded-md border border-slate-700 bg-slate-900 px-3 outline-none focus:border-emerald-400" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setSimpleDialog(null)} className="rounded-md border border-slate-700 px-3 py-2 text-sm">{L("Cancel", "Cancelar")}</button><button type="button" disabled={!simpleValue.trim() || creating} onClick={() => void submitSimpleDialog()} className="rounded-md bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{L("Save", "Guardar")}</button></div></div></div>
      ) : null}

      {aiOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/70" onMouseDown={(event) => { if (event.currentTarget === event.target) setAiOpen(false); }}>
          <aside className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-slate-700 bg-slate-950 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 p-5"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{L("Evidence analysis", "Análisis de evidencia")}</p><h2 className="mt-2 text-xl font-bold">{L("Ask your Business Notebook", "Consulta tu Business Notebook")}</h2><p className="mt-1 text-xs text-slate-500">{scope === "business" ? L("Entire trading business", "Todo el negocio") : activeAccount?.name}</p></div><button type="button" onClick={() => setAiOpen(false)} title={L("Close", "Cerrar")}><X /></button></div>
            <div className="flex-1 overflow-y-auto p-5">
              {!aiAnswer && !aiLoading ? <div className="rounded-md border border-slate-800 p-4"><p className="text-sm font-semibold">{L("Useful questions", "Preguntas útiles")}</p><div className="mt-3 flex flex-wrap gap-2">{[L("What patterns are supported by my evidence?", "¿Qué patrones sostiene mi evidencia?"), L("Which candidate lesson is ready to validate?", "¿Qué lección candidata está lista para validar?"), L("Where does my evidence contradict a current rule?", "¿Dónde contradice mi evidencia una regla actual?")].map((prompt) => <button type="button" key={prompt} onClick={() => setAiQuestion(prompt)} className="rounded-md border border-slate-700 px-3 py-2 text-left text-xs text-slate-300 hover:border-cyan-400">{prompt}</button>)}</div></div> : null}
              {aiLoading ? <div className="grid min-h-[280px] place-items-center"><LoaderCircle className="animate-spin text-cyan-300" /></div> : null}
              {aiAnswer ? <div className="prose prose-invert max-w-none text-sm leading-7 text-slate-200"><ReactMarkdown>{aiAnswer}</ReactMarkdown></div> : null}
              {aiCitations.length ? <div className="mt-6 border-t border-slate-800 pt-4"><p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{L("Evidence used", "Evidencia utilizada")}</p><div className="mt-3 space-y-2">{aiCitations.map((citation, index) => <button type="button" key={citation.id} onClick={() => openSearchHit(citation)} className="block w-full rounded-md border border-slate-800 p-3 text-left hover:border-cyan-400/50"><p className="text-xs font-bold text-cyan-200">S{index + 1} · {citation.label}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{citation.excerpt}</p></button>)}</div></div> : null}
            </div>
            <div className="border-t border-slate-800 p-4"><textarea value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askNotebook(); } }} rows={3} placeholder={L("Ask for an objective evaluation of the evidence...", "Pide una evaluación objetiva de la evidencia...")} className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 p-3 text-sm outline-none focus:border-cyan-400" /><button type="button" disabled={!aiQuestion.trim() || aiLoading} onClick={() => void askNotebook()} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"><Send size={15} />{L("Send", "Enviar")}</button></div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
