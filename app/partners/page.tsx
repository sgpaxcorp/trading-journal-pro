"use client";

import Link from "next/link";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function PartnersPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-6 py-12">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#22c55e22_0,transparent_55%),radial-gradient(circle_at_bottom,#0f172a_0,#020817_70%)]" />
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#38bdf855_1px,transparent_1px),linear-gradient(to_bottom,#38bdf833_1px,transparent_1px)] bg-size-[80px_80px]" />
      </div>

      <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-4">
          <img
            src="/neurotrader-logo.svg"
            alt="Neuro Trader Journal"
            className="h-14 w-auto"
            draggable={false}
          />
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
              {L("Partner Program", "Programa Partner")}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold">
              {L("Coming soon", "Próximamente")}
            </h1>
          </div>
        </div>

        <p className="mt-5 text-sm text-slate-300 leading-relaxed">
          {L(
            "This page is currently in development. If you want to become a Neuro Trader partner, we’d love to hear from you.",
            "Esta página está en desarrollo. Si deseas ser partner de Neuro Trader, nos encantaría conocerte."
          )}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          {L(
            "Send us your interest and we’ll follow up with next steps.",
            "Envíanos tu interés y te contactaremos con los próximos pasos."
          )}
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link
            href="/contact"
            className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition text-center"
          >
            {L("Contact us", "Contactarnos")}
          </Link>
          <a
            href="mailto:support@neurotrader-journal.com"
            className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-200 text-xs font-semibold hover:border-emerald-400 transition text-center"
          >
            support@neurotrader-journal.com
          </a>
        </div>
      </div>
    </main>
  );
}
