// app/components/FloatingAskButton.tsx
"use client";

import { useState, FormEvent } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
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

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-400 text-slate-950 px-4 py-2 shadow-lg shadow-emerald-500/40 text-xs font-semibold hover:bg-emerald-300 transition"
      >
        {open ? L("Close assistant", "Cerrar asistente") : L("Ask anything", "Pregunta lo que quieras")}
      </button>

      {/* Panel flotante */}
      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-80 max-w-[90vw] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-900/80 p-3 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-slate-100">
            {L("Ask the Trading Journal Pro assistant", "Pregunta al asistente de Trading Journal Pro")}
          </p>
          <p className="text-[10px] text-slate-400">
            {L(
              "You can ask about the platform, trading journaling, or any general question (definitions, concepts, etc.).",
              "Puedes preguntar sobre la plataforma, el journal de trading o cualquier duda general (definiciones, conceptos, etc.)."
            )}
          </p>

          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl bg-slate-900 border border-slate-700 px-2.5 py-2 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
              placeholder={L("Type your question here…", "Escribe tu pregunta aquí…")}
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
