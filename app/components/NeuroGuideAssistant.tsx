"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, BrainCircuit, RotateCcw, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAuth } from "@/context/AuthContext";
import { fetchAccessStatus } from "@/lib/accessStatusClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type Source = {
  slug: string;
  title: string;
  href: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  introductory?: boolean;
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function NeuroGuideAssistant({ accessVerified = false }: { accessVerified?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth() as { user?: { id?: string } | null };
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const intro = L(
    "I can explain this page, search the User Manual, or give you a concise reading of your latest available performance.",
    "Puedo explicarte esta página, buscar en el Manual de Usuario o darte una lectura breve de tu desempeño más reciente disponible."
  );

  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState(accessVerified);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "intro", role: "assistant", content: intro, introductory: true },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const quickQuestions = [
    L("Explain this page", "Explícame esta página"),
    L("What should I do next?", "¿Qué debo hacer ahora?"),
    L("How is my performance?", "¿Cómo va mi desempeño?"),
  ];

  useEffect(() => {
    setMessages((current) => {
      if (current.length !== 1 || !current[0]?.introductory) return current;
      return [{ ...current[0], content: intro }];
    });
  }, [intro]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [loading, messages, open]);

  useEffect(() => {
    if (!user?.id) {
      setAllowed(false);
      return;
    }
    if (accessVerified) {
      setAllowed(true);
      return;
    }

    let active = true;
    void fetchAccessStatus({ timeoutMs: 8000 }).then((status) => {
      if (active) setAllowed(Boolean(status?.hasAppAccess));
    });
    return () => {
      active = false;
    };
  }, [accessVerified, user?.id]);

  if (!user?.id || !allowed) return null;

  async function sendMessage(rawMessage: string) {
    const question = rawMessage.trim();
    if (!question || loading) return;

    const priorMessages = messages.filter((message) => !message.introductory);
    const userMessage: Message = { id: makeId(), role: "user", content: question };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error(L("Your session expired. Sign in again.", "Tu sesión expiró. Inicia sesión nuevamente."));

      const response = await fetch("/api/help/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: question,
          locale: lang,
          pathname: pathname || "/dashboard",
          history: priorMessages.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          String(payload?.error || L("Neuro Guide is temporarily unavailable.", "Guía Neuro no está disponible temporalmente."))
        );
      }

      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: String(payload?.answer || ""),
          sources: Array.isArray(payload?.sources) ? payload.sources.slice(0, 4) : [],
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : L("Neuro Guide is temporarily unavailable.", "Guía Neuro no está disponible temporalmente."),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  function clearConversation() {
    setMessages([{ id: "intro", role: "assistant", content: intro, introductory: true }]);
    setInput("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-5 right-4 z-[80] flex h-14 items-center gap-2 rounded-full border border-cyan-300/30 bg-[#071329]/95 px-4 text-sm font-semibold text-slate-100 shadow-[0_18px_55px_rgba(8,145,178,0.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-emerald-300/60 sm:right-6"
        aria-label={open ? L("Close Neuro Guide", "Cerrar Guía Neuro") : L("Open Neuro Guide", "Abrir Guía Neuro")}
        aria-expanded={open}
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 via-sky-400 to-emerald-300 text-slate-950">
          {open ? <X className="h-5 w-5" /> : <BrainCircuit className="h-5 w-5" />}
          {!open ? <span className="absolute inset-0 animate-ping rounded-full border border-cyan-200/50" /> : null}
        </span>
        <span className="hidden sm:inline">{L("Neuro Guide", "Guía Neuro")}</span>
      </button>

      {open ? (
        <section
          className="fixed inset-x-3 bottom-24 z-[79] flex h-[min(76vh,680px)] flex-col overflow-hidden rounded-[26px] border border-cyan-300/20 bg-[#050d20]/98 text-slate-100 shadow-[0_30px_100px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:inset-x-auto sm:right-6 sm:w-[430px]"
          aria-label={L("Neuro Guide conversation", "Conversación con Guía Neuro")}
        >
          <header className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-cyan-400/15 via-indigo-400/10 to-emerald-400/15 px-5 py-4">
            <BrainCircuit className="absolute -right-5 -top-8 h-32 w-32 text-cyan-200/[0.06]" />
            <BrainCircuit className="absolute right-20 top-9 h-16 w-16 rotate-12 text-emerald-200/[0.04]" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/10 text-cyan-200">
                  <BrainCircuit className="h-6 w-6" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="bg-gradient-to-r from-cyan-200 via-violet-200 to-emerald-200 bg-clip-text text-base font-bold text-transparent">
                      {L("Neuro Guide", "Guía Neuro")}
                    </h2>
                    <span className="flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-200">
                      <Sparkles className="h-2.5 w-2.5" /> {L("Ready", "Lista")}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                    {L("Manual · current page · your performance", "Manual · página actual · tu desempeño")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearConversation}
                className="rounded-xl border border-white/10 bg-slate-950/40 p-2 text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-200"
                aria-label={L("Clear conversation", "Limpiar conversación")}
                title={L("Clear conversation", "Limpiar conversación")}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[88%]">
                  <div
                    className={
                      message.role === "user"
                        ? "rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-300 to-emerald-300 px-3.5 py-3 text-[12px] font-medium leading-relaxed text-slate-950 shadow-lg shadow-cyan-950/20"
                        : "rounded-2xl rounded-bl-md border border-slate-700/60 bg-slate-900/85 px-3.5 py-3 text-[12px] leading-relaxed text-slate-200"
                    }
                  >
                    {message.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
                          strong: ({ children }) => <strong className="font-semibold text-cyan-100">{children}</strong>,
                          a: ({ href, children }) => (
                            <a href={href} className="text-cyan-200 underline underline-offset-2">
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      message.content
                    )}
                  </div>

                  {message.sources?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.sources.map((source) => (
                        <Link
                          key={source.slug}
                          href={source.href}
                          className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2 py-1 text-[9px] font-semibold text-cyan-100 transition hover:border-cyan-300/50"
                        >
                          <BookOpen className="h-2.5 w-2.5" /> {source.title}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-slate-700/60 bg-slate-900/85 px-4 py-3">
                  <div className="flex items-center gap-1.5" aria-label={L("Neuro Guide is thinking", "Guía Neuro está pensando")}>
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300" />
                    <span className="ml-2 text-[10px] text-slate-400">{L("Reviewing your context…", "Revisando tu contexto…")}</span>
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {messages.every((message) => message.introductory) ? (
            <div className="flex gap-2 overflow-x-auto px-4 pb-3">
              {quickQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void sendMessage(question)}
                  className="shrink-0 rounded-full border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:border-emerald-300/40 hover:text-emerald-200"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}

          <form onSubmit={submit} className="border-t border-white/10 bg-[#071126] p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/70 p-2 focus-within:border-cyan-300/50">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                maxLength={1200}
                className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-600"
                placeholder={L("Ask about this page, the manual, or your results…", "Pregunta por esta página, el manual o tus resultados…")}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={L("Send question", "Enviar pregunta")}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[9px] text-slate-600">
              {L("Educational guidance. Verify important decisions.", "Orientación educativa. Verifica las decisiones importantes.")}
            </p>
          </form>
        </section>
      ) : null}
    </>
  );
}
