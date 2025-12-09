"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import {
  FaInstagram,
  FaFacebookF,
  FaTwitter, // lo usamos como X (Twitter)
  FaDiscord,
} from "react-icons/fa";

export default function QuickTourPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    try {
      setSaving(true);

      // 1) Obtener user actual
      const {
        data: { user },
        error: userError,
      } = await supabaseBrowser.auth.getUser();

      if (userError || !user) {
        console.error("Error getting current user:", userError);
        setSaving(false);
        return;
      }

      const userId = user.id;

      // 2) Marcar onboarding en metadata de Auth
      const { error: authError } = await supabaseBrowser.auth.updateUser({
        data: {
          onboardingCompleted: true,
        },
      });

      if (authError) {
        console.error("Error updating onboardingCompleted in auth:", authError);
      }

      // 3) Marcar onboarding en tabla profiles
      const { error: profileError } = await supabaseBrowser
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", userId);

      if (profileError) {
        console.error(
          "Error updating onboarding_completed in profiles:",
          profileError
        );
      }

      // 4) Luego de marcar el onboarding, vamos al dashboard
      router.replace("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <section className="max-w-5xl mx-auto px-4 py-10 md:py-14">
        {/* Header */}
        <header className="mb-8 md:mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400 mb-2">
            Quick tour · 3–4 minutes
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-50 mb-2">
            Welcome to your NeuroTrader Journal.
          </h1>
          <p className="text-xs md:text-sm text-slate-400 max-w-xl">
            Before you start logging trades, let&apos;s walk through the key
            areas so you can exprimir la plataforma al máximo desde el día uno.
          </p>
        </header>

        {/* Steps grid */}
        <div className="grid gap-4 md:gap-5 md:grid-cols-2 mb-10">
          {/* Step 1 */}
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5 shadow-lg/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-[11px] font-semibold text-emerald-300 border border-emerald-400/40">
                1
              </span>
              <h2 className="text-sm font-semibold text-slate-50">
                Build your Growth Plan
              </h2>
            </div>
            <p className="text-[11px] md:text-xs text-slate-400 mb-2">
              En la sección <span className="font-semibold">Growth Plan</span>{" "}
              defines tu tipo de operador, horarios, riesgo por operación y tus
              reglas no negociables. Esto es el contrato entre tú y tu trader
              ideal.
            </p>
            <p className="text-[11px] md:text-xs text-slate-500">
              Cada vez que el AI Coach te dé feedback, usará este plan como
              referencia para decirte si estás respetando tu marco o no.
            </p>
          </article>

          {/* Step 2 */}
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5 shadow-lg/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-[11px] font-semibold text-emerald-300 border border-emerald-400/40">
                2
              </span>
              <h2 className="text-sm font-semibold text-slate-50">
                Journal + Back-Study
              </h2>
            </div>
            <p className="text-[11px] md:text-xs text-slate-400 mb-2">
              Usa el <span className="font-semibold">Journal</span> para
              registrar cada sesión, emoción clave y las reglas que cumpliste o
              rompiste. Luego, en <span className="font-semibold">Back-Study</span>{" "}
              verás cada trade sobre el gráfico del subyacente.
            </p>
            <p className="text-[11px] md:text-xs text-slate-500">
              Marca entradas y salidas, revisa si te saliste temprano, tarde o
              perfecto, y convierte tus screenshots en decisiones concretas.
            </p>
          </article>

          {/* Step 3 */}
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5 shadow-lg/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-[11px] font-semibold text-emerald-300 border border-emerald-400/40">
                3
              </span>
              <h2 className="text-sm font-semibold text-slate-50">
                Dashboard & widgets
              </h2>
            </div>
            <p className="text-[11px] md:text-xs text-slate-400 mb-2">
              En el <span className="font-semibold">Dashboard</span> verás tus
              rachas verdes, P&amp;L por día, activos top y errores repetidos.
              Los widgets son interactivos: puedes reorganizarlos y enfocarte en
              lo que más impacto tenga para ti.
            </p>
            <p className="text-[11px] md:text-xs text-slate-500">
              La idea es que en 10 segundos sepas si estás creciendo como
              trader, no solo si tu cuenta subió o bajó.
            </p>
          </article>

          {/* Step 4 */}
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5 shadow-lg/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-[11px] font-semibold text-emerald-300 border border-emerald-400/40">
                4
              </span>
              <h2 className="text-sm font-semibold text-slate-50">
                Performance & AI Coaching
              </h2>
            </div>
            <p className="text-[11px] md:text-xs text-slate-400 mb-2">
              En <span className="font-semibold">Performance</span> vas a ver
              breakdowns por instrumento, horario, setup y nivel de disciplina.
              El <span className="font-semibold">AI Coach</span> lee tu journal,
              growth plan y estadísticas para darte feedback psicológico y
              técnico en lenguaje humano, no en puro numerito.
            </p>
            <p className="text-[11px] md:text-xs text-slate-500">
              Piensa en esto como tener un psicólogo del trading y un risk
              manager 24/7 dentro de la plataforma.
            </p>
          </article>

          {/* Step 5 */}
          <article className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5 shadow-lg/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-[11px] font-semibold text-emerald-300 border border-emerald-400/40">
                5
              </span>
              <h2 className="text-sm font-semibold text-slate-50">
                Help center & community tutorials
              </h2>
            </div>
            <p className="text-[11px] md:text-xs text-slate-400 mb-3">
              Si quieres ver paso a paso en video cómo usar cada módulo, tienes
              toda una biblioteca de tutoriales y ejemplos reales. Desde la
              sección de <span className="font-semibold">Help</span> y nuestras
              redes sociales puedes ver:
            </p>

            {/* Social row */}
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <a
                href="https://instagram.com/tu_cuenta_aqui"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                <FaInstagram className="h-3.5 w-3.5" />
                Instagram tutorials
              </a>
              <a
                href="https://facebook.com/tu_cuenta_aqui"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                <FaFacebookF className="h-3.5 w-3.5" />
                Facebook community
              </a>
              <a
                href="https://x.com/tu_cuenta_aqui"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                <FaTwitter className="h-3.5 w-3.5" />
                X (Twitter) updates
              </a>
              <a
                href="https://discord.gg/tu_invite_aqui"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                <FaDiscord className="h-3.5 w-3.5" />
                Discord live room
              </a>
            </div>

            <p className="text-[10px] md:text-[11px] text-slate-500">
              Cambia estos enlaces por tus cuentas oficiales. La idea es que el
              usuario siempre sepa dónde encontrar tutorials, Q&amp;A y
              actualizaciones nuevas de la plataforma.
            </p>
          </article>
        </div>

        {/* CTA final */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[11px] md:text-xs text-slate-400 max-w-md">
            Cuando termines este tour, te llevamos directo al dashboard para que
            empieces a registrar tu próxima sesión con toda esta estructura en
            mente.
          </p>

          <button
            type="button"
            onClick={handleFinish}
            disabled={saving}
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60 transition shadow-lg shadow-emerald-500/25"
          >
            {saving ? "Finishing…" : "Finish & go to dashboard"}
          </button>
        </div>
      </section>
    </main>
  );
}
