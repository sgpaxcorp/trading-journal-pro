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
  const [showProactiveMessage, setShowProactiveMessage] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const proactiveShownRef = useRef(false);

  const quickChips = [
    {
      id: "advanced",
      en: "Which plan is best for me?",
      es: "¿Qué plan me conviene?",
    },
    {
      id: "compare",
      en: "Compare Core vs Advanced",
      es: "Compara Core vs Advanced",
    },
    {
      id: "business",
      en: "How does this help me trade like a business?",
      es: "¿Cómo me ayuda a operar como negocio?",
    },
    {
      id: "reports",
      en: "Is Advanced worth it for funded traders?",
      es: "¿Advanced vale la pena para traders fondeados?",
    },
  ];

  useEffect(() => {
    if (typeof window === "undefined" || proactiveShownRef.current) return;

    const timer = window.setTimeout(() => {
      if (!open) {
        proactiveShownRef.current = true;
        setShowProactiveMessage(true);
        trackEvent("/ask-widget/proactive-prompt");
      }
    }, 60_000);

    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!sessionIdRef.current) {
      sessionIdRef.current =
        (crypto as any)?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    setShowProactiveMessage(false);
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
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/ask/ask", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: cleaned, locale: lang }),
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
      {showProactiveMessage && !open && (
        <div className="fixed bottom-20 right-6 z-40 w-80 max-w-[90vw] rounded-lg border border-emerald-300/40 bg-slate-950 p-3 shadow-2xl shadow-emerald-500/15">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-emerald-300">
                {L("Need help choosing?", "¿Necesitas ayuda escogiendo?")}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-200">
                {L(
                  "Ask me what you need to know. I can compare plans, explain the business value, and recommend the best path for your trading style.",
                  "Pregúntame lo que necesitas saber. Puedo comparar planes, explicar el valor de negocio y recomendarte el mejor camino según tu estilo de trading."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowProactiveMessage(false)}
              className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:border-slate-500 hover:text-slate-100"
              aria-label={L("Dismiss prompt", "Cerrar mensaje")}
            >
              ×
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setShowProactiveMessage(false);
            }}
            className="mt-3 w-full rounded-md bg-emerald-400 px-3 py-2 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300"
          >
            {L("Ask the sales advisor", "Preguntar al asesor")}
          </button>
        </div>
      )}

      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-400 text-slate-950 px-4 py-2 shadow-lg shadow-emerald-500/40 text-xs font-semibold hover:bg-emerald-300 transition"
      >
        {open ? L("Close advisor", "Cerrar asesor") : L("Ask the sales advisor", "Preguntar al asesor")}
      </button>

      {/* Panel flotante */}
      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-80 max-w-[90vw] rounded-lg border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-900/80 p-3 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-slate-100">
            {L("Neuro Trader Journal — Sales Advisor", "Neuro Trader Journal — Asesor comercial")}
          </p>
          <p className="text-[10px] text-slate-400">
            {L(
              "Ask about plans, business value, trading workflow, or whether Core or Advanced fits you best.",
              "Pregunta por planes, valor de negocio, flujo de trading o si Core o Advanced te conviene más."
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
              className="w-full resize-none rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
              placeholder={L("Ask me to recommend a plan or compare value…", "Pídeme recomendarte un plan o comparar valor…")}
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="w-full rounded-lg bg-emerald-400 text-slate-950 text-[11px] font-semibold py-1.5 hover:bg-emerald-300 transition disabled:opacity-50"
            >
              {loading ? L("Thinking…", "Pensando…") : L("Get recommendation", "Recibir recomendación")}
            </button>
          </form>

          {error && (
            <p className="text-[10px] text-red-400 mt-1">{error}</p>
          )}

          {answer && !error && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-slate-900/90 border border-slate-800 px-2.5 py-2 text-[11px] text-slate-100 whitespace-pre-wrap">
              {answer}
            </div>
          )}
        </div>
      )}
    </>
  );
}
