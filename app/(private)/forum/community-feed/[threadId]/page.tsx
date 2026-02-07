// app/(private)/forum/community-feed/[threadId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import {
  createForumPost,
  getForumThread,
  incrementForumThreadView,
  listForumPosts,
  type ForumPost,
  type ForumThread,
} from "@/lib/forumSupabase";

function safeNameFromUser(user: any, fallback: string) {
  const meta = user?.user_metadata || {};
  const full = meta.first_name || meta.full_name || meta.name || "";
  const email = user?.email || "";
  const emailHandle = email ? String(email).split("@")[0] : "";
  return (full || emailHandle || fallback).toString().trim();
}

function fmtDateTime(v: string) {
  if (!v) return "";
  // Keep stable formatting to avoid hydration issues
  return v.replace("T", " ").slice(0, 16);
}

const MD: any = {
  p: (props: any) => <p className="text-sm leading-relaxed my-2 text-slate-100" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-5 my-2 space-y-1 text-slate-100" {...props} />,
  ol: (props: any) => <ol className="list-decimal pl-5 my-2 space-y-1 text-slate-100" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  strong: (props: any) => <strong className="text-slate-50 font-semibold" {...props} />,
  em: (props: any) => <em className="text-slate-200" {...props} />,
  a: (props: any) => (
    <a className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200" target="_blank" rel="noreferrer" {...props} />
  ),
  code: ({ inline, children, ...props }: any) => {
    if (inline) {
      return (
        <code className="rounded bg-slate-950/70 px-1 py-0.5 text-[12px] text-emerald-200" {...props}>
          {children}
        </code>
      );
    }
    return <code {...props}>{children}</code>;
  },
  pre: (props: any) => (
    <pre className="my-3 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-[12px] leading-relaxed text-slate-100" {...props} />
  ),
  table: ({ children, ...props }: any) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/40">
      <table className="w-full border-collapse text-[12px]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: (props: any) => <thead className="bg-slate-950/60" {...props} />,
  tr: (props: any) => <tr className="border-t border-slate-700/70" {...props} />,
  th: (props: any) => <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.18em] text-slate-300" {...props} />,
  td: (props: any) => <td className="px-3 py-2 text-slate-100 align-top" {...props} />,
  blockquote: (props: any) => <blockquote className="my-3 border-l-2 border-emerald-500/60 pl-3 text-slate-200" {...props} />,
};

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
      {text}
    </ReactMarkdown>
  );
}

export default function CommunityThreadPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const userId = (user as any)?.id ?? "";
  const authorName = useMemo(() => safeNameFromUser(user, L("Trader", "Trader")), [user, L]);

  const threadId = Array.isArray((params as any)?.threadId)
    ? (params as any).threadId[0]
    : ((params as any)?.threadId as string);

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // Route protection
  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  async function loadThread() {
    if (!threadId) return;

    setLoading(true);
    setError(null);

    try {
      const [t, p] = await Promise.all([
        getForumThread(threadId),
        listForumPosts(threadId, 300),
      ]);

      setThread(t);
      setPosts(p);

      // best-effort view count
      void incrementForumThreadView(threadId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || L("Failed to load thread.", "No se pudo cargar el hilo."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId || authLoading) return;
    void loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authLoading, threadId]);

  const cat = (thread as any)?.forum_categories;

  const canReply = useMemo(() => {
    return Boolean(userId) && Boolean(threadId) && reply.trim().length >= 3 && !(thread?.is_locked);
  }, [userId, threadId, reply, thread?.is_locked]);

  async function handleSendReply() {
    if (!canReply || sending) return;

    setSending(true);
    setError(null);

    try {
      const created = await createForumPost({
        userId,
        authorName,
        threadId,
        body: reply,
      });

      setPosts((prev) => [...prev, created]);
      setReply("");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || L("Failed to post reply.", "No se pudo publicar la respuesta."));
    } finally {
      setSending(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400">{L("Loading thread…", "Cargando hilo…")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopNav />

      <main className="flex-1 min-h-0 w-full px-4 md:px-8 py-6">
        <div className="mx-auto w-full max-w-[1100px]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">{L("Forum", "Foro")}</p>
              <h1 className="text-xl md:text-2xl font-semibold mt-2">
                {L("Community feed", "Feed comunitario")}
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                href="/forum/community-feed"
                className="rounded-full border border-slate-700 px-4 py-2 text-sm hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                ← {L("Back", "Volver")}
              </Link>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="h-6 w-2/3 bg-slate-950/40 border border-slate-800 rounded animate-pulse" />
              <div className="mt-3 h-20 bg-slate-950/40 border border-slate-800 rounded animate-pulse" />
            </div>
          )}

          {!loading && !thread && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <p className="text-sm text-slate-300">{L("Thread not found.", "Hilo no encontrado.")}</p>
            </div>
          )}

          {!loading && thread && (
            <>
              {/* Thread card */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                <div className="border-b border-slate-800 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {thread.is_pinned && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] border border-amber-500/50 bg-amber-500/10 text-amber-200">
                        {L("Pinned", "Fijado")}
                      </span>
                    )}
                    {thread.is_locked && (
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

                  <h2 className="text-lg md:text-xl font-semibold text-slate-100 mt-2">
                    {thread.title}
                  </h2>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-2">
                    <span>
                      {L("Started by", "Iniciado por")}{" "}
                      <span className="text-slate-200 font-semibold">
                        {thread.author_name || L("Trader", "Trader")}
                      </span>
                    </span>
                    <span>·</span>
                    <span>{fmtDateTime(thread.created_at)}</span>
                    <span>·</span>
                    <span>
                      {thread.reply_count} {L("replies", "respuestas")}
                    </span>
                    <span>·</span>
                    <span>
                      {thread.view_count} {L("views", "vistas")}
                    </span>
                  </div>
                </div>

                <div className="px-4 py-4">
                  <Markdown text={thread.body || ""} />
                </div>
              </section>

              {/* Replies */}
              <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-100">{L("Replies", "Respuestas")}</p>
                    <p className="text-xs text-slate-500">
                      {L(
                        "Keep it constructive. If you share stats, include timeframe + sample size.",
                        "Mantén un tono constructivo. Si compartes estadísticas, incluye periodo y tamaño de muestra."
                      )}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {posts.length} {L("replies", "respuestas")}
                  </div>
                </div>

                {posts.length === 0 && (
                  <div className="px-4 py-6">
                    <p className="text-sm text-slate-300">
                      {L("No replies yet.", "Aún no hay respuestas.")}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {L("Be the first to reply.", "Sé el primero en responder.")}
                    </p>
                  </div>
                )}

                {posts.length > 0 && (
                  <div className="divide-y divide-slate-800">
                    {posts.map((p) => (
                      <div key={p.id} className="px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-200">
                              {p.author_name || L("Trader", "Trader")}
                            </span>
                            {p.is_ai && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] border border-emerald-500/60 bg-emerald-500/10 text-emerald-200">
                                AI
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500">{fmtDateTime(p.created_at)}</span>
                        </div>

                        <div className="mt-2">
                          <Markdown text={p.body || ""} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Reply box */}
              <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                <div className="border-b border-slate-800 px-4 py-3">
                  <p className="text-sm font-medium text-slate-100">{L("Reply", "Responder")}</p>
                  {thread.is_locked ? (
                    <p className="text-xs text-slate-500 mt-1">
                      {L(
                        "This thread is locked. New replies are disabled.",
                        "Este hilo está bloqueado. No se permiten nuevas respuestas."
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">
                      {L(
                        "Markdown supported (lists, links, tables).",
                        "Markdown disponible (listas, enlaces, tablas)."
                      )}
                    </p>
                  )}
                </div>

                <div className="px-4 py-4 space-y-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={L("Write a reply…", "Escribe una respuesta…")}
                    className="w-full min-h-[120px] rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40 disabled:opacity-60"
                    disabled={thread.is_locked}
                  />

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-500">
                      {L("Post as", "Publicar como")}{" "}
                      <span className="text-slate-200 font-semibold">{authorName}</span>.
                    </p>

                    <button
                      type="button"
                      onClick={handleSendReply}
                      disabled={!canReply || sending}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        !canReply || sending
                          ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                          : "bg-emerald-500 hover:bg-emerald-400 text-slate-900"
                      }`}
                    >
                      {sending ? L("Posting…", "Publicando…") : L("Post reply", "Publicar respuesta")}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
