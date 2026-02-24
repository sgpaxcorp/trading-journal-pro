"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type IntroConfig = {
  key: string;
  match: (path: string) => boolean;
  title: string;
  body: string;
};

export default function PageIntro() {
  const pathname = usePathname();
  const { user } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const introConfig = useMemo<IntroConfig[]>(
    () => [
      {
        key: "performance",
        match: (p) => p.startsWith("/performance"),
        title: L("Performance", "Performance"),
        body: L(
          "Explore your stats, charts, and breakdowns. Use filters to isolate what is working.",
          "Explora tus stats, gráficos y desglose. Usa filtros para aislar lo que funciona."
        ),
      },
      {
        key: "notebook",
        match: (p) => p.startsWith("/notebook"),
        title: L("Notebook", "Notebook"),
        body: L(
          "Capture playbooks, lessons, and screenshots in one place.",
          "Guarda playbooks, lecciones y screenshots en un solo lugar."
        ),
      },
      {
        key: "back-study",
        match: (p) => p.startsWith("/back-study"),
        title: L("Back-Studying", "Back-Studying"),
        body: L(
          "Replay trades on the chart and audit entries, exits, and timing.",
          "Repite trades en el gráfico y audita entradas, salidas y timing."
        ),
      },
      {
        key: "option-flow",
        match: (p) => p.startsWith("/option-flow"),
        title: L("Option Flow Intelligence", "Option Flow Intelligence"),
        body: L(
          "Upload flow data and generate objective reports.",
          "Sube data de flujo y genera reportes objetivos."
        ),
      },
      {
        key: "challenges",
        match: (p) => p.startsWith("/challenges"),
        title: L("Challenges", "Desafíos"),
        body: L(
          "Behavior missions that help you build discipline week by week.",
          "Misiones de conducta para construir disciplina semana a semana."
        ),
      },
      {
        key: "resources",
        match: (p) => p.startsWith("/resources"),
        title: L("Resources", "Recursos"),
        body: L(
          "Save books, videos, and links you want to revisit.",
          "Guarda libros, videos y enlaces para revisar luego."
        ),
      },
      {
        key: "rules-alarms",
        match: (p) => p.startsWith("/rules-alarms"),
        title: L("Rules & Alarms", "Reglas y alarmas"),
        body: L(
          "Define your non-negotiables and alerts to protect your plan.",
          "Define tus no negociables y alertas para proteger tu plan."
        ),
      },
      {
        key: "forum",
        match: (p) => p.startsWith("/forum"),
        title: L("Forum", "Foro"),
        body: L(
          "Community insights, feedback, and shared progress.",
          "Comunidad, feedback y progreso compartido."
        ),
      },
      {
        key: "global-ranking",
        match: (p) => p.startsWith("/globalranking"),
        title: L("Global Ranking", "Ranking global"),
        body: L(
          "Track XP, levels, and your rank over time.",
          "Sigue tu XP, niveles y ranking con el tiempo."
        ),
      },
    ],
    [lang]
  );

  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<IntroConfig | null>(null);

  useEffect(() => {
    if (!user?.id || !pathname) return;
    const match = introConfig.find((item) => item.match(pathname));
    if (!match) {
      setVisible(false);
      setCurrent(null);
      return;
    }

    const key = `ntj_intro_${user.id}_${match.key}`;
    const seen = localStorage.getItem(key);
    if (seen) {
      setVisible(false);
      setCurrent(null);
      return;
    }

    setCurrent(match);
    setVisible(true);
  }, [introConfig, pathname, user?.id]);

  if (!visible || !current) return null;

  return (
    <div className="fixed right-6 top-[88px] z-[70] max-w-[360px] rounded-2xl border border-slate-800 bg-slate-950/95 p-4 text-slate-100 shadow-xl shadow-emerald-500/10">
      <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/70">
        {L("Quick summary", "Resumen rápido")}
      </p>
      <h3 className="text-lg font-semibold mt-1">{current.title}</h3>
      <p className="text-[13px] text-slate-300 mt-2">{current.body}</p>
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            if (!user?.id) return;
            const key = `ntj_intro_${user.id}_${current.key}`;
            localStorage.setItem(key, "1");
            setVisible(false);
          }}
          className="px-4 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-[12px] font-semibold hover:bg-emerald-300"
        >
          {L("Got it", "Entendido")}
        </button>
      </div>
    </div>
  );
}
