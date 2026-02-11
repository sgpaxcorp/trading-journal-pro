"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { onNeuroPush, type NeuroPush } from "@/app/components/neuroEventBus";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type AssistantState = "idle" | "thinking" | "talking";
type Lang = "en" | "es";
type ChatMessage = { role: "user" | "assistant"; text: string };
type AvatarState = "idle" | "thinking" | "speaking" | "happy" | "error";

const AVATAR_SRC: Record<AvatarState, { webm?: string; mp4: string }> = {
  idle: { webm: "/ai-avatar/idle.webm", mp4: "/ai-avatar/idle.mp4" },
  thinking: { webm: "/ai-avatar/idle.webm", mp4: "/ai-avatar/idle.mp4" },
  speaking: { webm: "/ai-avatar/speaking.webm", mp4: "/ai-avatar/speaking.mp4" },
  happy: { webm: "/ai-avatar/happy.webm", mp4: "/ai-avatar/happy.mp4" },
  error: { webm: "/ai-avatar/idle.webm", mp4: "/ai-avatar/idle.mp4" },
};

function NeuroAvatarButton({
  state,
  open,
  size = 104, // ✅ más compacto
  onToggle,
  ariaLabel,
}: {
  state: AvatarState;
  open: boolean;
  size?: number;
  onToggle: () => void;
  ariaLabel: string;
}) {
  const [topState, setTopState] = useState<AvatarState>("idle");
  const [bottomState, setBottomState] = useState<AvatarState>("idle");
  const [fadeTop, setFadeTop] = useState(true);

  const topRef = useRef<HTMLVideoElement | null>(null);
  const bottomRef = useRef<HTMLVideoElement | null>(null);

  const isHappy = state === "happy";
  const isThinking = state === "thinking";

  // ✅ deps constante: evita el error de React
  useEffect(() => {
    const nextToTop = !fadeTop;
    if (nextToTop) setTopState(state);
    else setBottomState(state);

    const t = window.setTimeout(() => setFadeTop(nextToTop), 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    const tryPlay = async (v?: HTMLVideoElement | null) => {
      if (!v) return;
      try {
        v.muted = true;
        (v as any).playsInline = true;
        await v.play();
      } catch {}
    };
    tryPlay(topRef.current);
    tryPlay(bottomRef.current);
  }, [topState, bottomState]);

  const pulse = isThinking ? "animate-pulse" : "";

  const top = AVATAR_SRC[topState];
  const bottom = AVATAR_SRC[bottomState];

  const halo =
    state === "happy"
      ? "rgba(34,197,94,0.55)"
      : state === "thinking"
      ? "rgba(16,185,129,0.55)"
      : open
      ? "rgba(16,185,129,0.45)"
      : "rgba(16,185,129,0.28)";

  return (
    <button
      type="button"
      onClick={() => {
        topRef.current?.play?.().catch(() => {});
        bottomRef.current?.play?.().catch(() => {});
        onToggle();
      }}
      aria-label={ariaLabel}
      className="fixed bottom-4 right-4 z-40 select-none"
      style={{ width: size, height: size }}
    >
      <div className={["relative w-full h-full", pulse].join(" ")}>
        {/* ✅ Halo más fuerte, bordes más transparentes */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 50%,
              ${halo} 0%,
              rgba(16,185,129,0.35) 28%,
              rgba(16,185,129,0.18) 50%,
              rgba(16,185,129,0.08) 68%,
              rgba(0,0,0,0) 100%)`,
            filter: "blur(18px)",
            transform: "scale(1.45)",
            pointerEvents: "none",
          }}
        />

        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{
            boxShadow: "0 0 0 1px rgba(16,185,129,0.16)",
            pointerEvents: "none",
          }}
        >
          {/* ✅ vignette suave */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.22) 78%, rgba(0,0,0,0.45) 100%)",
              pointerEvents: "none",
              zIndex: 3,
            }}
          />

          <video
            ref={bottomRef}
            autoPlay
            muted
            playsInline
            loop={!isHappy}
            preload="auto"
            className={[
              "absolute inset-0 w-full h-full object-cover",
              "transition-opacity duration-200",
              fadeTop ? "opacity-0" : "opacity-100",
            ].join(" ")}
            style={{ transform: "scale(1.28)", objectPosition: "50% 38%" }}
          >
            {bottom.webm ? <source src={bottom.webm} type="video/webm" /> : null}
            <source src={bottom.mp4} type="video/mp4" />
          </video>

          <video
            ref={topRef}
            autoPlay
            muted
            playsInline
            loop={!isHappy}
            preload="auto"
            className={[
              "absolute inset-0 w-full h-full object-cover",
              "transition-opacity duration-200",
              fadeTop ? "opacity-100" : "opacity-0",
            ].join(" ")}
            style={{ transform: "scale(1.28)", objectPosition: "50% 38%" }}
          >
            {top.webm ? <source src={top.webm} type="video/webm" /> : null}
            <source src={top.mp4} type="video/mp4" />
          </video>
        </div>
      </div>
    </button>
  );
}

export default function NeuroAssistant() {
  const pathname = usePathname();
  const { locale } = useAppSettings();
  const prefLang: Lang = resolveLocale(locale) === "es" ? "es" : "en";

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AssistantState>("idle");
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lang, setLang] = useState<Lang>(prefLang);
  const L = (en: string, es: string) => (lang === "es" ? es : en);

  useEffect(() => {
    setLang(prefLang);
  }, [prefLang]);

  // ✅ Auto-scroll al final
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // ✅ Chat pegado al avatar (sin taparlo)
  const AVATAR_SIZE = 120;
  const RIGHT_OFFSET = useMemo(() => {
    const rightPadding = 16; // right-4
    const gap = -32; // espacio entre chat y muñeco
    return `calc(${rightPadding}px + ${AVATAR_SIZE}px + ${gap}px)`;
  }, []);

  useEffect(() => {
    const off = onNeuroPush((p: NeuroPush) => {
      if (p.kind === "neuro_open") {
        setOpen(true);
        return;
      }

      if (p.kind === "neuro_push") {
        setOpen(true);
        setMessages((prev) => [...prev, { role: "assistant", text: p.text }]);

        setState("talking");
        setAvatarState("speaking");
        window.setTimeout(() => setAvatarState("happy"), 450);
        window.setTimeout(() => {
          setAvatarState("idle");
          setState("idle");
        }, 1100);
      }
    });

    return off;
  }, []);

  // ✅ Siempre ver el último mensaje
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, messages, state]);

  async function handleSend() {
    if (!input.trim()) return;

    const question = input.trim();
    setInput("");

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setState("thinking");
    setAvatarState("thinking");

    try {
      const session = await supabaseBrowser.auth.getSession();
      const token = session?.data?.session?.access_token;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        // ✅ ayuda extra (no rompe nada) para que el server respete el idioma
        "Accept-Language": lang === "en" ? "en" : "es",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/neuro-assistant", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question,
          contextPath: pathname,
          lang, // ✅ este es el que usa tu route.ts
        }),
      });

      if (!res.ok) throw new Error(L("Request failed", "La solicitud falló"));

      const data = await res.json();
      const answer: string =
        data.answer ||
        (lang === "es"
          ? "Estoy aquí para ayudarte, pero algo falló. Intenta de nuevo en un momento."
          : "I’m here to help, but something failed. Please try again in a moment.");

      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);

      setState("talking");
      setAvatarState("speaking");

      window.setTimeout(() => setAvatarState("happy"), 600);
      window.setTimeout(() => {
        setAvatarState("idle");
        setState("idle");
      }, 1400);
    } catch (err) {
      console.error("[NeuroAssistant] Error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            lang === "es"
              ? "Hubo un problema al generar la respuesta. Intenta de nuevo en un momento."
              : "Something went wrong while answering. Please try again in a moment.",
        },
      ]);

      setAvatarState("error");
      window.setTimeout(() => {
        setAvatarState("idle");
        setState("idle");
      }, 900);
    }
  }

  return (
    <>
      <NeuroAvatarButton
        state={avatarState}
        open={open}
        size={AVATAR_SIZE}
        onToggle={() => setOpen((o) => !o)}
        ariaLabel={L("Open Neuro Assistant", "Abrir asistente Neuro")}
      />

      {open && (
        <div
          className="fixed bottom-40 z-40 w-96 max-w-[92vw]"
          style={{ right: RIGHT_OFFSET }}
        >
          <div className="absolute -right-3 bottom-10 h-6 w-6 rotate-45 rounded-sm border border-slate-800 bg-slate-900/95 shadow-xl shadow-emerald-500/30 backdrop-blur" />

          <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl shadow-emerald-500/30 backdrop-blur max-h-[70vh] flex flex-col">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/90 text-sm">
                  🧠
                </span>
                <span className="font-semibold">
                  {L("Neuro – Neuro Trader Guide", "Neuro — Guía de Neuro Trader")}
                </span>
              </div>

              <div className="flex items-center gap-2">
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
                  aria-label={L("Close", "Cerrar")}
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="mb-3 max-h-80 overflow-y-auto space-y-2 text-sm"
            >
              {messages.length === 0 && (
                <p className="rounded-lg bg-slate-800/70 px-3 py-2 text-slate-200">
                  {lang === "es"
                    ? "Pregúntame cómo llenar esta página, cómo escribir en tu journal o cómo usar un widget. Siempre sé en qué sección estás."
                    : "Ask me how to fill out this page, what to write in your journal, or how to use a widget. I always know which section you’re on."}
                </p>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[92%] rounded-lg px-3 py-2 leading-snug ${
                    m.role === "user"
                      ? "ml-auto bg-emerald-500/15 text-emerald-100"
                      : "mr-auto bg-slate-800 text-slate-100"
                  }`}
                >
                  {m.text}
                </div>
              ))}

              {state === "thinking" && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{lang === "es" ? "Pensando..." : "Thinking…"}</span>
                </div>
              )}

              <div ref={endRef} />
            </div>

            <div className="mt-1 flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
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
                className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
              >
                {lang === "es" ? "Enviar" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
