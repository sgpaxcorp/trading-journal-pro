"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, ExternalLink, FileText, Link2, Plus, Search, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  createResourceLibraryItem,
  deleteResourceLibraryItem,
  listResourceLibraryItems,
  type ResourceKind,
  type ResourceLibraryItemRow,
} from "@/lib/resourcesLibrarySupabase";

type KindOption = {
  value: ResourceKind;
  labelEn: string;
  labelEs: string;
  icon: "youtube" | "book" | "amazon" | "article" | "note" | "link";
};

const KIND_OPTIONS: KindOption[] = [
  { value: "youtube", labelEn: "YouTube", labelEs: "YouTube", icon: "youtube" },
  { value: "book", labelEn: "Book", labelEs: "Libro", icon: "book" },
  { value: "amazon", labelEn: "Amazon book", labelEs: "Libro de Amazon", icon: "amazon" },
  { value: "article", labelEn: "Article", labelEs: "Artículo", icon: "article" },
  { value: "note", labelEn: "Note", labelEs: "Nota", icon: "note" },
  { value: "link", labelEn: "Link", labelEs: "Enlace", icon: "link" },
];

function kindLabel(kind: ResourceKind, isEs: boolean): string {
  const opt = KIND_OPTIONS.find((k) => k.value === kind);
  if (!opt) return kind;
  return isEs ? opt.labelEs : opt.labelEn;
}

function kindIcon(kind: ResourceKind) {
  if (kind === "youtube") return <Video size={14} />;
  if (kind === "book" || kind === "amazon") return <BookOpen size={14} />;
  if (kind === "article" || kind === "note") return <FileText size={14} />;
  return <Link2 size={14} />;
}

function requiresUrl(kind: ResourceKind) {
  return kind === "youtube" || kind === "amazon" || kind === "article" || kind === "link";
}

function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const maybe = value.includes("://") ? value : `https://${value}`;
    const parsed = new URL(maybe);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function toCsv(items: ResourceLibraryItemRow[], isEs: boolean): string {
  const header = isEs
    ? ["Tipo", "Título", "Autor", "URL", "Contenido", "Creado"]
    : ["Type", "Title", "Author", "URL", "Content", "Created"];
  const esc = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = items.map((it) =>
    [
      esc(kindLabel(it.kind, isEs)),
      esc(it.title),
      esc(it.author),
      esc(it.url),
      esc(it.content),
      esc(it.created_at),
    ].join(",")
  );
  return [header.map(esc).join(","), ...lines].join("\n");
}

function formatLocalDate(iso: string, locale: string) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleString(locale);
}

export default function ResourcesLibraryPage() {
  const router = useRouter();
  const { user } = useAuth() as any;
  const { activeAccountId } = useTradingAccounts();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const localeTag = isEs ? "es-ES" : "en-US";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [items, setItems] = useState<ResourceLibraryItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [kind, setKind] = useState<ResourceKind>("youtube");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ResourceKind>("all");

  async function loadItems() {
    if (!user?.id) return;
    setLoading(true);
    const rows = await listResourceLibraryItems(user.id, activeAccountId ?? null);
    setItems(rows);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeAccountId]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (kindFilter !== "all" && it.kind !== kindFilter) return false;
      if (!q) return true;
      return [it.title, it.author, it.url, it.content, it.kind]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q));
    });
  }, [items, query, kindFilter]);

  async function onSave() {
    if (!user?.id) return;
    setError(null);
    setNotice(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(L("Title is required.", "El título es obligatorio."));
      return;
    }

    const parsedUrl = normalizeUrl(url);
    if (requiresUrl(kind) && !parsedUrl) {
      setError(
        L(
          "A valid URL is required for this resource type.",
          "Para este tipo de recurso necesitas una URL válida."
        )
      );
      return;
    }

    setSaving(true);
    const created = await createResourceLibraryItem(user.id, activeAccountId ?? null, {
      kind,
      title: cleanTitle,
      url: parsedUrl,
      author,
      content,
    });
    setSaving(false);

    if (!created) {
      setError(
        L(
          "Could not save. Verify the table migration was applied.",
          "No se pudo guardar. Verifica que la migración de tabla esté aplicada."
        )
      );
      return;
    }

    setItems((prev) => [created, ...prev]);
    setTitle("");
    setUrl("");
    setAuthor("");
    setContent("");
    setNotice(L("Resource saved.", "Recurso guardado."));
  }

  async function onDelete(id: string) {
    if (!user?.id) return;
    const ok = await deleteResourceLibraryItem(user.id, id);
    if (!ok) {
      setError(L("Could not delete item.", "No se pudo eliminar el recurso."));
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function onCopy(text: string | null | undefined) {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => null);
    setNotice(L("Copied.", "Copiado."));
  }

  function onExportCsv() {
    const csv = toCsv(filteredItems, isEs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `resource-library-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
                {L("Resources", "Recursos")}
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-100">
                {L("Library", "Biblioteca")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                {L(
                  "Save your YouTube links, book names, Amazon links, and notes in one place.",
                  "Guarda tus enlaces de YouTube, nombres de libros, enlaces de Amazon y notas en un solo lugar."
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                <ArrowLeft size={14} />
                {L("Back to dashboard", "Volver al dashboard")}
              </button>
              <button
                type="button"
                onClick={onExportCsv}
                className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 hover:text-sky-300 transition"
              >
                {L("Export CSV", "Exportar CSV")}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {notice}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                {L("Add resource", "Agregar recurso")}
              </p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">{L("Type", "Tipo")}</span>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as ResourceKind)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  >
                    {KIND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {isEs ? opt.labelEs : opt.labelEn}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">{L("Title", "Título")}</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={L("e.g. Trading in the Zone", "ej. Trading in the Zone")}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    {L("URL (optional)", "URL (opcional)")}
                  </span>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">{L("Author (optional)", "Autor (opcional)")}</span>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder={L("e.g. Mark Douglas", "ej. Mark Douglas")}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    {L("Text / notes (paste)", "Texto / notas (pegar)")}
                  </span>
                  <textarea
                    rows={6}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={L(
                      "Paste any notes, summary, or quotes you want to keep.",
                      "Pega notas, resumen o citas que quieras guardar."
                    )}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </label>

                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                >
                  <Plus size={14} />
                  {saving ? L("Saving...", "Guardando...") : L("Save resource", "Guardar recurso")}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={L("Search by title, author, link, or text...", "Buscar por título, autor, enlace o texto...")}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  />
                </div>

                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as "all" | ResourceKind)}
                  className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                >
                  <option value="all">{L("All types", "Todos los tipos")}</option>
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {isEs ? opt.labelEs : opt.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
                {loading ? (
                  <p className="text-sm text-slate-400">{L("Loading resources...", "Cargando recursos...")}</p>
                ) : filteredItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
                    {L(
                      "No resources yet for this account/filter.",
                      "Todavía no hay recursos para esta cuenta/filtro."
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredItems.map((item) => (
                      <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                              {kindIcon(item.kind)}
                              {kindLabel(item.kind, isEs)}
                            </div>
                            <h2 className="mt-2 text-base font-semibold text-slate-100">{item.title}</h2>
                            {item.author ? (
                              <p className="mt-1 text-xs text-slate-400">
                                {L("Author", "Autor")}: {item.author}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-slate-500">
                              {formatLocalDate(item.created_at, localeTag)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => onDelete(item.id)}
                            className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-red-400 hover:text-red-300"
                            aria-label={L("Delete resource", "Eliminar recurso")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {item.content ? (
                          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
                            {item.content}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {item.url ? (
                            <>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
                              >
                                <ExternalLink size={12} />
                                {L("Open link", "Abrir enlace")}
                              </a>
                              <button
                                type="button"
                                onClick={() => onCopy(item.url)}
                                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-sky-400 hover:text-sky-300"
                              >
                                {L("Copy URL", "Copiar URL")}
                              </button>
                            </>
                          ) : null}

                          {item.content ? (
                            <button
                              type="button"
                              onClick={() => onCopy(item.content)}
                              className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-sky-400 hover:text-sky-300"
                            >
                              {L("Copy text", "Copiar texto")}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
