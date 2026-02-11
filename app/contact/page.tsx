"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Script from "next/script";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function ContactPage() {
  const { theme, locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const isLight = theme === "light";
  const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError(L("Please complete the required fields.", "Completa los campos requeridos."));
      return;
    }

    setSending(true);
    try {
      const captchaToken = hcaptchaSiteKey
        ? (document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement | null)?.value || ""
        : "";
      if (hcaptchaSiteKey && !captchaToken) {
        setError(L("Please complete the captcha.", "Completa el captcha."));
        setSending(false);
        return;
      }
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, captchaToken, company }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Contact failed");

      setStatus(L("Message sent. We’ll reply soon.", "Mensaje enviado. Te responderemos pronto."));
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setCompany("");
    } catch (err: any) {
      setError(err?.message || L("We couldn't send your message.", "No pudimos enviar tu mensaje."));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={isLight ? "min-h-screen bg-slate-50 text-slate-900" : "min-h-screen bg-slate-950 text-slate-50"}>
      {hcaptchaSiteKey && <Script src="https://hcaptcha.com/1/api.js" async defer />}
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/neurotrader-logo.svg" alt="Neuro Trader" className="h-28 md:h-32 w-auto" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400">
                {L("Contact", "Contacto")}
              </p>
              <h1 className="text-2xl md:text-3xl font-semibold">{L("Contact Neuro Trader", "Contacta a Neuro Trader")}</h1>
            </div>
          </div>
          <Link
            href="/"
            className={isLight ? "text-sm text-slate-600 hover:text-emerald-600" : "text-sm text-slate-400 hover:text-emerald-300"}
          >
            {L("Back to home", "Volver al inicio")}
          </Link>
        </header>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[0.9fr,1.1fr] gap-6">
          <section className={isLight ? "rounded-2xl border border-slate-200 bg-white p-6" : "rounded-2xl border border-slate-800 bg-slate-900/70 p-6"}>
            <h2 className="text-lg font-semibold">{L("Support & inquiries", "Soporte y consultas")}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {L(
                "Tell us how we can help. Our team reviews every request.",
                "Cuéntanos cómo podemos ayudar. Nuestro equipo revisa cada solicitud."
              )}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Email</p>
                <p className="font-semibold text-emerald-300">support@neurotrader-journal.com</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{L("Response time", "Tiempo de respuesta")}</p>
                <p className="text-slate-300">{L("Typically within 24–48 hours.", "Normalmente dentro de 24–48 horas.")}</p>
              </div>
            </div>
          </section>

          <section className={isLight ? "rounded-2xl border border-slate-200 bg-white p-6" : "rounded-2xl border border-slate-800 bg-slate-900/70 p-6"}>
            <h2 className="text-lg font-semibold">{L("Send a message", "Enviar mensaje")}</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="hidden" aria-hidden="true">
                <label className="block text-[11px] text-slate-400 mb-1">Company</label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {L("Full name *", "Nombre completo *")}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {L("Email *", "Correo *")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {L("Subject", "Asunto")}
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {L("Message *", "Mensaje *")}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>

              {hcaptchaSiteKey && (
                <div className="pt-1">
                  <div className="h-captcha" data-sitekey={hcaptchaSiteKey} />
                </div>
              )}

              {status && <p className="text-[11px] text-emerald-300">{status}</p>}
              {error && <p className="text-[11px] text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
              >
                {sending ? L("Sending…", "Enviando…") : L("Send message", "Enviar mensaje")}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
