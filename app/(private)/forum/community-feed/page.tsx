// app/(private)/forum/community-feed/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import {
  createForumThread,
  listForumCategories,
  listForumThreads,
  type ForumCategory,
  type ForumThread,
  type ThreadSort,
} from "@/lib/forumSupabase";

function safeNameFromUser(user: any) {
  const meta = user?.user_metadata || {};
  const full = meta.first_name || meta.full_name || meta.name || "";
  const email = user?.email || "";
  const emailHandle = email ? String(email).split("@")[0] : "";
  return (full || emailHandle || "Trader").toString().trim();
}

function clampText(s: any, max = 180) {
  const t = (s ?? "").toString().trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function fmtDate(d: string | null | undefined) {
  const s = (d || "").toString();
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

export default function CommunityFeedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const userId = (user as any)?.id ?? "";
  const authorName = useMemo(() => safeNameFromUser(user), [user]);

  // Route protection
  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  // Data
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryId, setCategoryId] = useState<string | null>(null); // null = all
  const [sort, setSort] = useState<ThreadSort>("active");
  const [query, setQuery] = useState("");

  // New thread modal
  const [newOpen, setNewOpen] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  const activeCategory = useMemo(
    () => (categoryId ? categories.find((c) => c.id === categoryId) : null),
    [categoryId, categories]
  );

  const canCreateThread = useMemo(() => {
    return Boolean(userId) && Boolean(newCategoryId) && newTitle.trim().length >= 6 && newBody.trim().length >= 20;
  }, [userId, newCategoryId, newTitle, newBody]);

  async function loadAll() {
    if (!userId) return;
    setDataLoading(true);
    setError(null);

    try {
      const [cats, th] = await Promise.all([
        listForumCategories(),
        listForumThreads({ categoryId, sort, query, limit: 80 }),
      ]);

      setCategories(cats);

      // If a category is currently selected but no longer exists, reset.
      if (categoryId && !cats.some((c) => c.id === categoryId)) {
        setCategoryId(null);
      }

      // Default new thread category to "platform-questions" if present.
      if (!newCategoryId) {
        const preferred =
          cats.find((c) => c.slug === "platform-questions")?.id ||
          cats[0]?.id ||
          "";
        setNewCategoryId(preferred);
      }

      setThreads(th);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || L("Failed to load community feed.", "No se pudo cargar el feed de comunidad."));
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (!userId || authLoading) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authLoading, categoryId, sort]);

  async function runSearch() {
    if (!userId) return;
    setDataLoading(true);
    setError(null);
    try {
      const th = await listForumThreads({ categoryId, sort, query, limit: 80 });
      setThreads(th);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || L("Search failed.", "La búsqueda falló."));
    } finally {
      setDataLoading(false);
    }
  }

  async function handleCreateThread() {
    if (!canCreateThread || creating) return;

    setCreating(true);
    setError(null);

    try {
      const created = await createForumThread({
        userId,
        authorName,
        categoryId: newCategoryId,
        title: newTitle,
        body: newBody,
      });

      // Close modal + reset
      setNewOpen(false);
      setNewTitle("");
      setNewBody("");

      // Navigate to the thread
      router.push(`/forum/community-feed/${created.id}`);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || L("Failed to create thread.", "No se pudo crear el hilo."));
    } finally {
      setCreating(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400">{L("Loading community…", "Cargando comunidad…")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopNav />

      <main className="flex-1 min-h-0 w-full px-4 md:px-8 py-6">
        <div className="mx-auto w-full max-w-[1400px]">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
            <div>
              <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">{L("Forum", "Foro")}</p>
              <h1 className="text-2xl md:text-3xl font-semibold mt-2">{L("Community feed", "Feed de comunidad")}</h1>
              <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                {L(
                  "Share progress, ask platform questions, post trade reviews, and build better process with other traders.",
                  "Comparte avances, haz preguntas de la plataforma, publica reviews de trades y construye mejor proceso con otros traders."
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-slate-900 transition"
              >
                {L("+ New thread", "+ Nuevo hilo")}
              </button>
              <Link
                href="/performance/analytics-statistics"
                className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium border border-slate-700 text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                {L("Analytics", "Analytics")}
              </Link>
            </div>
          </div>

          {/* Controls */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 mb-5">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
              <div className="flex-1 flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={L("Search threads (title or body)…", "Buscar hilos (título o contenido)…")}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                />
                <button
                  type="button"
                  onClick={runSearch}
                  className="shrink-0 rounded-xl border border-slate-700 px-4 py-2 text-sm hover:border-emerald-400 hover:text-emerald-200 transition"
                >
                  {L("Search", "Buscar")}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={categoryId || ""}
                  onChange={(e) => setCategoryId(e.target.value ? e.target.value : null)}
                  className="text-sm rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2"
                >
                  <option value="">{L("All categories", "Todas las categorías")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ThreadSort)}
                  className="text-sm rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2"
                >
                  <option value="active">{L("Most active", "Más activos")}</option>
                  <option value="new">{L("Newest", "Más nuevos")}</option>
                  <option value="top">{L("Top (views)", "Top (vistas)")}</option>
                </select>
              </div>
            </div>

            {activeCategory && (
              <p className="text-xs text-slate-400 mt-2">
                {L("Filtering by:", "Filtrando por:")}{" "}
                <span className="text-emerald-200 font-semibold">{activeCategory.name}</span>
                {activeCategory.description ? <span className="text-slate-500"> — {activeCategory.description}</span> : null}
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {error}
            </div>
          )}

          {/* Content */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4">
            {/* Thread list */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
              <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-100">{L("Threads", "Hilos")}</p>
                  <p className="text-xs text-slate-400">{L("Ask, share, review, and improve together.", "Pregunta, comparte, revisa y mejora en comunidad.")}</p>
                </div>
                <div className="text-xs text-slate-500">
                  {dataLoading ? L("Loading…", "Cargando…") : L(`${threads.length} shown`, `${threads.length} mostrados`)}
                </div>
              </div>

              <div className="divide-y divide-slate-800">
                {dataLoading && (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-14 rounded-xl bg-slate-950/40 border border-slate-800 animate-pulse" />
                    ))}
                  </div>
                )}

                {!dataLoading && threads.length === 0 && (
                  <div className="p-6">
                    <p className="text-sm text-slate-300">{L("No threads found.", "No se encontraron hilos.")}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {L(
                        "Try removing filters, or create the first thread in this category.",
                        "Prueba quitando filtros o crea el primer hilo en esta categoría."
                      )}
                    </p>
                  </div>
                )}

                {!dataLoading &&
                  threads.map((t) => {
                    const cat = (t as any).forum_categories;
                    const excerpt = clampText(t.body, 220);

                    return (
                      <Link
                        key={t.id}
                        href={`/forum/community-feed/${t.id}`}
                        className="block p-4 hover:bg-slate-950/40 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {t.is_pinned && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] border border-amber-500/50 bg-amber-500/10 text-amber-200">
                                  {L("Pinned", "Fijado")}
                                </span>
                              )}
                              {t.is_locked && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] border border-slate-600 bg-slate-950/50 text-slate-300">
                                  {L("Locked", "Bloqueado")}
                                </span>
                              )}
                              {cat?.name && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] border border-slate-700 bg-slate-950/40 text-slate-300">
                                  {cat.name}
                                </span>
                              )}
                            </div>

                            <p className="text-sm font-semibold text-slate-100 truncate">
                              {t.title}
                            </p>
                            {excerpt && (
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                                {excerpt}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-2">
                              <span>
                                {L("by", "por")}{" "}
                                <span className="text-slate-300 font-semibold">
                                  {t.author_name || L("Trader", "Trader")}
                                </span>
                              </span>
                              <span>·</span>
                              <span>{L("Created", "Creado")} {fmtDate(t.created_at)}</span>
                              <span>·</span>
                              <span>{L("Active", "Activo")} {fmtDate(t.last_post_at)}</span>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2 text-[11px]">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-2 py-1 text-slate-300">
                              {t.reply_count} {L("replies", "respuestas")}
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-2 py-1 text-slate-300">
                              {t.view_count} {L("views", "vistas")}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </section>

            {/* Sidebar */}
            <aside className="space-y-4">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <h2 className="text-sm font-medium text-slate-200">{L("Categories", "Categorías")}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {L(
                    "Use categories to keep discussions focused and searchable.",
                    "Usa categorías para mantener discusiones enfocadas y fáciles de buscar."
                  )}
                </p>

                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => setCategoryId(null)}
                    className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition ${
                      !categoryId
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-800 bg-slate-950/40 text-slate-200 hover:border-emerald-400"
                    }`}
                  >
                    {L("All categories", "Todas las categorías")}
                  </button>

                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition ${
                        categoryId === c.id
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                          : "border-slate-800 bg-slate-950/40 text-slate-200 hover:border-emerald-400"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{c.name}</span>
                        {c.is_locked && (
                          <span className="text-[10px] text-slate-400">{L("Locked", "Bloqueado")}</span>
                        )}
                      </div>
                      {c.description && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          {c.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <h2 className="text-sm font-medium text-slate-200">{L("How to get better answers", "Cómo obtener mejores respuestas")}</h2>
                <ul className="mt-2 text-xs text-slate-400 space-y-2 list-disc pl-5">
                  <li>{L("Write the instrument, timeframe, and what you were trying to do.", "Escribe el instrumento, timeframe y lo que intentabas hacer.")}</li>
                  <li>{L("For platform issues, include screenshots + what you expected vs what happened.", "Para problemas de plataforma, incluye screenshots y lo esperado vs lo ocurrido.")}</li>
                  <li>{L("For trade reviews, post entry/exit rules and what you felt during the trade.", "Para reviews de trades, incluye reglas de entrada/salida y cómo te sentiste.")}</li>
                </ul>
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                  {L(
                    "Tip: Use the",
                    "Tip: Usa la"
                  )}{" "}
                  <span className="text-emerald-200 font-semibold">{L("Platform Questions", "Preguntas de plataforma")}</span>{" "}
                  {L("category for anything related to imports, sync, PnL, templates, or settings.", "para cualquier tema de imports, sync, PnL, plantillas o settings.")}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>

      {/* New thread modal */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
            <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">{L("Create a new thread", "Crear un nuevo hilo")}</p>
                <p className="text-xs text-slate-400">{L("Keep it specific and actionable.", "Manténlo específico y accionable.")}</p>
              </div>
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr] gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Category</label>
                  <select
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id} disabled={c.is_locked}>
                        {c.name}{c.is_locked ? L(" (locked)", " (bloqueado)") : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">{L("Your name (display)", "Tu nombre (visible)")}</label>
                  <input
                    readOnly
                    value={authorName}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">{L("Title", "Título")}</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={L("Example: My PnL doesn't match after refresh (fees?)", "Ejemplo: Mi PnL no coincide después de refrescar (comisiones?)")}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
                <p className="text-[11px] text-slate-500 mt-1">{L("Min 6 characters.", "Mínimo 6 caracteres.")}</p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">{L("Post", "Publicación")}</label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder={L(
                    "Describe context, what happened, what you expected, and any screenshots or steps to reproduce.",
                    "Describe el contexto, lo que pasó, lo que esperabas y cualquier screenshot o pasos para reproducir."
                  )}
                  className="w-full min-h-40 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                />
                <p className="text-[11px] text-slate-500 mt-1">{L("Min 20 characters.", "Mínimo 20 caracteres.")}</p>
              </div>
            </div>

            <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between">
              <p className="text-[11px] text-slate-500">
                {L(
                  "Community is private to logged-in users. Be respectful, keep it constructive.",
                  "La comunidad es privada para usuarios logueados. Sé respetuoso y constructivo."
                )}
              </p>

              <button
                type="button"
                onClick={handleCreateThread}
                disabled={!canCreateThread || creating}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  !canCreateThread || creating
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-emerald-500 hover:bg-emerald-400 text-slate-900"
                }`}
              >
                {creating ? L("Creating…", "Creando…") : L("Create thread", "Crear hilo")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
