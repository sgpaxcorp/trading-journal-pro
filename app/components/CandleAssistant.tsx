"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
// import Lottie from "lottie-react";
// import candleIdle from "@/animations/candle-idle.json";
// import candleTalking from "@/animations/candle-talking.json";

type AssistantState = "idle" | "thinking" | "talking";
type Lang = "en" | "es";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export default function CandleAssistant() {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AssistantState>("idle");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lang, setLang] = useState<Lang>("en"); // 👈 idioma elegido

  async function handleSend() {
    if (!input.trim()) return;

    const question = input.trim();
    setInput("");

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setState("thinking");

    try {
      const res = await fetch("/api/candle-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          contextPath: pathname,
          lang, // 👈 mandamos idioma al backend
        }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();
      const answer: string =
        data.answer ||
        (lang === "es"
          ? "Estoy aquí para ayudarte, pero algo falló. Intenta de nuevo en un momento."
          : "I'm here to help, but I got stuck. Try again in a moment.");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: answer },
      ]);
      setState("talking");
    } catch (err) {
      console.error("[CandleAssistant] Error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            lang === "es"
              ? "Hubo un problema al generar la respuesta. Intenta de nuevo en un momento."
              : "Something went wrong while answering. Try again in a moment.",
        },
      ]);
      setState("idle");
    }
  }

  const isThinking = state === "thinking" || state === "talking";

  return (
    <>
      {/* Botón flotante del muñequito (icono igual que antes) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400 bg-slate-950 shadow-lg shadow-emerald-500/40 hover:border-emerald-300 hover:shadow-emerald-300/40 transition"
      >
        <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400 text-2xl">
          <span className={isThinking ? "animate-bounce" : ""}>📈</span>
          {/* Aquí luego va Lottie/Rive */}
          <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-2 py-px text-[9px] font-semibold text-slate-100 shadow">
            AI
          </span>
        </div>
      </button>

      {/* Panel de chat */}
     {open && (
  <div className="fixed bottom-20 right-4 z-40 w-80 max-w-[90vw] rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl shadow-emerald-500/30 backdrop-blur max-h-[70vh] flex flex-col">

          {/* Header + toggle idioma */}
          <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/90 text-sm">
                📈
              </span>
              <span className="font-semibold">
                NeuroCandle – in–app guide
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Toggle EN / ES */}
              <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 p-[.5px] text-[10px]">
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={`px-2 py-[.5px] rounded-full transition ${
                    lang === "en"
                      ? "bg-emerald-400 text-slate-950 font-semibold"
                      : "text-slate-300 hover:text-slate-50"
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang("es")}
                  className={`px-2 py-[.5px] rounded-full transition ${
                    lang === "es"
                      ? "bg-emerald-400 text-slate-950 font-semibold"
                      : "text-slate-300 hover:text-slate-50"
                  }`}
                >
                  ES
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Mensajes – MÁS ALTOS Y LETRA MÁS GRANDE */}
          <div className="mb-3 max-h-80 overflow-y-auto space-y-2 text-xs">
            {messages.length === 0 && (
              <p className="rounded-lg bg-slate-800/70 px-3 py-2 text-slate-300">
                {lang === "es"
                  ? "Pregúntame cómo llenar esta página, cómo escribir en tu journal o cómo usar un widget. Siempre sé en qué sección estás."
                  : "Ask me what you should write on this page, how to journal, or how to use a widget. I always know which section you're on."}
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-lg px-3 py-2 leading-snug ${
                  m.role === "user"
                    ? "ml-auto bg-emerald-500/15 text-emerald-100"
                    : "mr-auto bg-slate-800 text-slate-100"
                }`}
              >
                {m.text}
              </div>
            ))}
            {state === "thinking" && (
              <p className="mt-1 text-[11px] text-slate-500">
                {lang === "es"
                  ? "Pensando en tu pregunta..."
                  : "Thinking about your question…"}
              </p>
            )}
          </div>

          {/* Input – más grande */}
          <div className="mt-1 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder={
                lang === "es"
                  ? "Pregúntame lo que quieras sobre esta página..."
                  : "Ask me anything about this page..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={state === "thinking"}
              className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
            >
              {lang === "es" ? "Enviar" : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
