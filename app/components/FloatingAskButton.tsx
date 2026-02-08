// app/components/FloatingAskButton.tsx
"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export default function FloatingAskButton() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const quickChips = [
    {
      id: "advanced",
      en: "What's included in Advanced?",
      es: "¿Qué incluye Advanced?",
    },
    {
      id: "ai-coach",
      en: "How does AI coaching help me trade better?",
      es: "¿Cómo me ayuda el AI coaching a mejorar?",
    },
    {
      id: "accounts",
      en: "Can I run multiple trading accounts?",
      es: "¿Puedo manejar múltiples cuentas de trading?",
    },
    {
      id: "reports",
      en: "Do you have PDF reports for prop firms?",
      es: "¿Hay reportes PDF para prop firms?",
    },
  ];

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!sessionIdRef.current) {
      sessionIdRef.current =
        (crypto as any)?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    trackEvent("/ask-widget/open");
  }, [open]);

  async function trackEvent(path: string) {
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      if (!sessionIdRef.current) {
        sessionIdRef.current =
          (crypto as any)?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }
      await fetch("/api/admin/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path, sessionId: sessionIdRef.current }),
      });
    } catch {
      // silent
    }
  }

  async function submitQuestion(q: string, source?: string) {
    const cleaned = q.trim();
    if (!cleaned) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      await trackEvent(source ? `/ask-widget/${source}` : "/ask-widget/submit");
      const res = await fetch("/api/ask/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: cleaned }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || L("Something went wrong.", "Algo salió mal."));
      } else {
        setAnswer(data.answer);
      }
    } catch (err) {
      console.error("Ask error", err);
      setError(L("Network error. Please try again.", "Error de red. Intenta de nuevo."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submitQuestion(question, "submit");
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-400 text-slate-950 px-4 py-2 shadow-lg shadow-emerald-500/40 text-xs font-semibold hover:bg-emerald-300 transition"
      >
        {open ? L("Close assistant", "Cerrar asistente") : L("Ask about the platform", "Pregunta sobre la plataforma")}
      </button>

      {/* Panel flotante */}
      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-80 max-w-[90vw] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-900/80 p-3 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-slate-100">
            {L("Neuro Trader Journal — Quick Help", "Neuro Trader Journal — Ayuda rápida")}
          </p>
          <p className="text-[10px] text-slate-400">
            {L(
              "Ask about features, plans, or how to get the most out of Advanced. I’ll answer like a product specialist.",
              "Pregunta por funciones, planes o cómo aprovechar Advanced. Responderé como especialista del producto."
            )}
          </p>
          <div className="text-[10px] text-slate-400 space-y-1">
            <p className="text-slate-500">{L("Quick questions:", "Preguntas rápidas:")}</p>
            <div className="flex flex-wrap gap-2">
              {quickChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    const text = isEs ? chip.es : chip.en;
                    setQuestion(text);
                    submitQuestion(text, `chip/${chip.id}`);
                  }}
                  className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
                >
                  {isEs ? chip.es : chip.en}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl bg-slate-900 border border-slate-700 px-2.5 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
              placeholder={L("Ask about features, pricing, or recommendations…", "Pregunta sobre funciones, precios o recomendaciones…")}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="w-full rounded-xl bg-emerald-400 text-slate-950 text-[11px] font-semibold py-1.5 hover:bg-emerald-300 transition disabled:opacity-50"
            >
              {loading ? L("Thinking…", "Pensando…") : L("Ask", "Preguntar")}
            </button>
          </form>

          {error && (
            <p className="text-[10px] text-red-400 mt-1">{error}</p>
          )}

          {answer && !error && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-xl bg-slate-900/90 border border-slate-800 px-2.5 py-2 text-[11px] text-slate-100 whitespace-pre-wrap">
              {answer}
            </div>
          )}
        </div>
      )}
    </>
  );
}
