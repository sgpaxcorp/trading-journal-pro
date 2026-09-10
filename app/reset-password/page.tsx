import { Suspense } from "react";
import ResetPasswordClient from "./ResetPasswordClient";
import { getRequestLocale } from "@/lib/requestLocale";

export const dynamic = "force-dynamic";

function ResetPasswordFallback({ lang }: { lang: "en" | "es" }) {
  const L = (en: string, es: string) => (lang === "es" ? es : en);
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">
          {L("Authentication", "Autenticación")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-50">
          {L("Choose a new password", "Elige una contraseña nueva")}
        </h1>
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
          {L("Loading reset session…", "Cargando la sesión de restablecimiento…")}
        </div>
      </div>
    </main>
  );
}

export default async function ResetPasswordPage() {
  const lang = await getRequestLocale();
  return (
    <Suspense fallback={<ResetPasswordFallback lang={lang} />}>
      <ResetPasswordClient />
    </Suspense>
  );
}
