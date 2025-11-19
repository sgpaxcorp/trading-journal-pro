"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

export default function FloatingAskButton() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAnswer(null);

    const q = question.trim();
    if (!q) return;

    try {
      setLoading(true);

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error from AI");
      }

      setAnswer(data.answer);
    } catch (err: any) {
      setError(
        err.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-lg transition-all z-50"
      >
        <MessageCircle size={16} />
        <span>Ask Anything</span>
      </button>

      {/* Caja de chat */}
      {open && (
        <div className="fixed bottom-20 right-6 w-80 bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm shadow-2xl z-50">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-slate-100 text-sm">
              Ask Anything
            </h4>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleAsk} className="space-y-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about features, psychology, goals..."
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 text-xs"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Ask"}
            </button>
          </form>

          {error && (
            <div className="mt-2 text-[10px] text-red-400">
              {error}
            </div>
          )}

          {answer && !error && (
            <div className="mt-3 bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs leading-snug max-h-40 overflow-y-auto whitespace-pre-wrap">
              {answer}
            </div>
          )}
        </div>
      )}
    </>
  );
}

