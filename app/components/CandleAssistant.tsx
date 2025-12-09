"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
// import Lottie from "lottie-react";
// import candleIdle from "@/animations/candle-idle.json";
// import candleTalking from "@/animations/candle-talking.json";

type AssistantState = "idle" | "thinking" | "talking";

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
        }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();
      const answer =
        data.answer ||
        "I'm here to help, but I got stuck. Try again in a moment.";

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
          text: "Something went wrong while answering. Try again in a moment.",
        },
      ]);
      setState("idle");
    }
  }

  // Placeholder de animación:
  // cuando tengas Lottie/Rive, solo reemplazas este bloque del botón.
  const isThinking = state === "thinking";
  const isTalking = state === "talking";

  return (
    <>
      {/* Botón flotante del muñequito */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400 bg-slate-950 shadow-lg shadow-emerald-500/40 hover:border-emerald-300 hover:shadow-emerald-300/40 transition"
      >
        {/* 🔁 Placeholder mientras no tengas animación real */}
        <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400 text-2xl">
          <span className="animate-bounce">📈</span>
          {/* Cuando tengas Lottie: 
          <Lottie
            animationData={isThinking || isTalking ? candleTalking : candleIdle}
            loop
            autoplay
          />
          */}
          <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-2 py-[1px] text-[9px] font-semibold text-slate-100 shadow">
            AI
          </span>
        </div>
      </button>

      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-20 right-4 z-40 w-80 max-w-[90vw] rounded-2xl border border-slate-800 bg-slate-900/95 p-3 shadow-xl shadow-emerald-500/30 backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-300">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/90 text-[12px]">
                📈
              </span>
              <span>NeuroCandle – in–app guide</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          </div>

          <div className="mb-2 max-h-60 overflow-y-auto space-y-1 text-[11px]">
            {messages.length === 0 && (
              <p className="rounded-lg bg-slate-800/70 px-2 py-2 text-[10px] text-slate-300">
                Ask me what you&apos;re supposed to write in this page, how to
                use a widget, or how to improve your routine. I always know
                which section you&apos;re on.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-lg px-2 py-1 ${
                  m.role === "user"
                    ? "ml-auto bg-emerald-500/15 text-emerald-100"
                    : "mr-auto bg-slate-800 text-slate-100"
                }`}
              >
                {m.text}
              </div>
            ))}
            {state === "thinking" && (
              <p className="mt-1 text-[10px] text-slate-500">
                Thinking about your question…
              </p>
            )}
          </div>

          <div className="mt-1 flex gap-1">
            <input
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-emerald-400"
              placeholder="Ask me anything about this page..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={state === "thinking"}
              className="rounded-lg bg-emerald-400 px-3 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
