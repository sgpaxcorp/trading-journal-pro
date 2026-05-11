"use client";

import { useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supaBaseClient";

type Props = {
  lang: "en" | "es";
};

type Automation = {
  key: string;
  category: "Authentication" | "Billing" | "Lifecycle" | "Operations";
  name: string;
  description: string;
  trigger: string;
  delivery: string;
  from: string;
  preview: {
    subject: string;
    text: string;
    html: string;
  };
};

type Payload = {
  sender: {
    from: string;
    authFrom?: string;
    provider: string;
    configured: boolean;
  };
  automations: Automation[];
  adminEmail: string;
  broadcastAudienceCount: number;
};

function groupLabel(category: Automation["category"], L: (en: string, es: string) => string) {
  if (category === "Authentication") return L("Authentication", "Autenticación");
  if (category === "Billing") return L("Billing", "Billing");
  if (category === "Lifecycle") return L("Lifecycle", "Lifecycle");
  return L("Operations", "Operaciones");
}

export default function AdminEmailAutomations({ lang }: Props) {
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [broadcastTemplateKey, setBroadcastTemplateKey] = useState("custom_broadcast");
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastHighlight, setBroadcastHighlight] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastCtaLabel, setBroadcastCtaLabel] = useState("");
  const [broadcastCtaUrl, setBroadcastCtaUrl] = useState("");
  const [broadcastFooter, setBroadcastFooter] = useState("");
  const [confirmText, setConfirmText] = useState("");

  async function load() {
    setLoading(true);
    setNotice(null);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setNotice({ tone: "error", text: L("Admin session missing.", "Falta la sesión de admin.") });
        return;
      }

      const res = await fetch("/api/admin/email-automations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(body?.error ?? L("Could not load email automations.", "No se pudieron cargar los emails automatizados.")),
        });
        return;
      }
      setData(body as Payload);
      setTestRecipient(String((body as Payload)?.adminEmail ?? ""));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function sendTest(key: string) {
    setNotice(null);
    setBusyKey(key);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setNotice({ tone: "error", text: L("Admin session missing.", "Falta la sesión de admin.") });
        return;
      }

      const res = await fetch("/api/admin/email-automations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, to: testRecipient }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(body?.error ?? L("Could not send test email.", "No se pudo enviar el email de prueba.")),
        });
        return;
      }
      setNotice({
        tone: "success",
        text: L(
          `Test email sent to ${testRecipient}.`,
          `Email de prueba enviado a ${testRecipient}.`
        ),
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function sendBroadcast(mode: "preview" | "all") {
    setNotice(null);
    setBusyKey(mode === "preview" ? "broadcast-preview" : "broadcast-all");
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setNotice({ tone: "error", text: L("Admin session missing.", "Falta la sesión de admin.") });
        return;
      }

      const res = await fetch("/api/admin/email-automations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: mode === "preview" ? "broadcast_preview" : "broadcast_all",
          to: testRecipient,
          templateKey: broadcastTemplateKey,
          subject: broadcastSubject,
          title: broadcastTitle,
          highlight: broadcastHighlight,
          message: broadcastMessage,
          ctaLabel: broadcastCtaLabel,
          ctaUrl: broadcastCtaUrl,
          footerNote: broadcastFooter,
          confirmText,
          locale: lang,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(
            body?.error ??
              (mode === "preview"
                ? L("Could not send preview email.", "No se pudo enviar el preview.")
                : L("Could not send broadcast.", "No se pudo enviar el broadcast."))
          ),
        });
        return;
      }

      if (mode === "preview") {
        setNotice({
          tone: "success",
          text: L(
            `Preview sent to ${testRecipient}.`,
            `Preview enviado a ${testRecipient}.`
          ),
        });
      } else {
        const result = body?.result ?? {};
        setNotice({
          tone: "success",
          text: L(
            `Broadcast sent to ${result.sent ?? 0} users. Failed: ${result.failed ?? 0}.`,
            `Broadcast enviado a ${result.sent ?? 0} usuarios. Fallidos: ${result.failed ?? 0}.`
          ),
        });
        setConfirmText("");
      }
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7 space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">{L("Emails", "Emails")}</p>
        <h2 className="text-xl font-semibold text-slate-100">
          {L("Email automations and Resend delivery", "Emails automatizados y entrega con Resend")}
        </h2>
        <p className="text-sm text-slate-400 max-w-3xl">
          {L(
            "Review the automated emails the platform sends, preview the actual design, and send yourself test copies before touching production flows.",
            "Revisa los emails automatizados que envía la plataforma, previsualiza el diseño real y envíate copias de prueba antes de tocar los flujos de producción."
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{L("Sender", "Remitente")}</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">{data?.sender?.provider ?? "Resend"}</h3>
            <div className="mt-2 space-y-2 text-sm text-slate-400 break-all">
              <p>
                <span className="text-slate-500">{L("Default", "General")}:</span>{" "}
                {data?.sender?.from ?? "—"}
              </p>
              <p>
                <span className="text-slate-500">{L("Auth no-reply", "Auth no-reply")}:</span>{" "}
                {data?.sender?.authFrom ?? data?.sender?.from ?? "—"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {L("Broadcast audience", "Audiencia del broadcast")}
                </p>
                <p className="text-xs text-slate-400">
                  {L(
                    "These are the profile emails currently available inside the app.",
                    "Estos son los emails de perfiles actualmente disponibles dentro de la app."
                  )}
                </p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs font-semibold text-slate-200">
                {data?.broadcastAudienceCount ?? 0} {L("users", "usuarios")}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">{L("Delivery status", "Estado de entrega")}</p>
                <p className="text-xs text-slate-400">
                  {L(
                    "Billing, lifecycle, and operational emails use the default sender. Authentication emails can use a dedicated no-reply sender.",
                    "Los emails de billing, lifecycle y operaciones usan el remitente general. Los emails de autenticación pueden usar un remitente no-reply dedicado."
                  )}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data?.sender?.configured ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" : "bg-amber-500/15 text-amber-200 border border-amber-500/30"}`}>
                {data?.sender?.configured ? L("Configured", "Configurado") : L("Mock mode", "Modo mock")}
              </span>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("Preview recipient", "Destino del preview")}</span>
            <input
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
              placeholder="you@example.com"
            />
          </label>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                {L("Broadcast composer", "Composer de broadcast")}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-100">
                {L("Use a system template and write your own message", "Usa un template del sistema y redacta tu propio mensaje")}
              </h3>
              <p className="mt-1 text-xs leading-6 text-slate-400">
                {L(
                  "Choose the template style, write the copy you want, send yourself a preview, and only then send it to all users.",
                  "Elige el estilo del template, redacta el copy que quieras, envíate un preview y solo después mándalo a todos los usuarios."
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">{L("Template to use", "Template a usar")}</span>
                <select
                  value={broadcastTemplateKey}
                  onChange={(e) => setBroadcastTemplateKey(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                >
                  <option value="custom_broadcast">{L("System announcement", "Comunicado del sistema")}</option>
                  {(data?.automations ?? []).map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">{L("Subject", "Asunto")}</span>
                <input
                  value={broadcastSubject}
                  onChange={(e) => setBroadcastSubject(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                  placeholder={L("Example: New feature live today", "Ejemplo: Nueva función activa hoy")}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">{L("Title", "Título")}</span>
                <input
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                  placeholder={L("Large heading inside the email", "Título grande dentro del email")}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">{L("Highlight", "Highlight")}</span>
                <input
                  value={broadcastHighlight}
                  onChange={(e) => setBroadcastHighlight(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                  placeholder={L("Short emphasized line", "Línea corta destacada")}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">{L("Message", "Mensaje")}</span>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="min-h-[150px] rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                  placeholder={L(
                    "Write the message here. Separate paragraphs with empty lines.",
                    "Escribe aquí el mensaje. Separa párrafos con líneas vacías."
                  )}
                />
              </label>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-slate-400">{L("CTA label (optional)", "Texto del CTA (opcional)")}</span>
                  <input
                    value={broadcastCtaLabel}
                    onChange={(e) => setBroadcastCtaLabel(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                    placeholder={L("Open dashboard", "Abrir dashboard")}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs text-slate-400">{L("CTA URL (optional)", "URL del CTA (opcional)")}</span>
                  <input
                    value={broadcastCtaUrl}
                    onChange={(e) => setBroadcastCtaUrl(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                    placeholder="https://www.neurotrader-journal.com/dashboard"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">{L("Footer note (optional)", "Nota de footer (opcional)")}</span>
                <input
                  value={broadcastFooter}
                  onChange={(e) => setBroadcastFooter(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                  placeholder={L("Optional note at the bottom of the email", "Nota opcional al final del email")}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs text-slate-400">{L("Type SEND to confirm broadcast", "Escribe SEND para confirmar el broadcast")}</span>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                  placeholder="SEND"
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <button
                type="button"
                onClick={() => void sendBroadcast("preview")}
                disabled={busyKey === "broadcast-preview" || !testRecipient}
                className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 disabled:opacity-50"
              >
                {busyKey === "broadcast-preview"
                  ? L("Sending preview…", "Enviando preview…")
                  : L("Send preview with this template", "Enviar preview con este template")}
              </button>
              <button
                type="button"
                onClick={() => void sendBroadcast("all")}
                disabled={busyKey === "broadcast-all" || confirmText.trim().toUpperCase() !== "SEND"}
                className="rounded-xl border border-sky-500/35 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-200 disabled:opacity-50"
              >
                {busyKey === "broadcast-all"
                  ? L("Sending to all users…", "Enviando a todos los usuarios…")
                  : L("Send to all users", "Enviar a todos los usuarios")}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400 leading-6">
            <p>
              {L(
                "Use this tab to review what the user will actually receive. Password reset and account recovery are already sent through Resend. New signup confirmation now starts from the app and uses the same visual system.",
                "Usa este tab para revisar lo que realmente recibe el usuario. Password reset y account recovery ya salen por Resend. La confirmación inicial de signup ahora también sale desde la app y usa el mismo sistema visual."
              )}
            </p>
          </div>

          {notice ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${notice.tone === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>
              {notice.text}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(data?.automations ?? []).map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      {groupLabel(item.category, L)}
                    </span>
                    <span className="text-[11px] text-slate-500">{item.delivery}</span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">{item.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1">
                    <div>{L("Trigger", "Trigger")}: {item.trigger}</div>
                    <div>{L("Subject", "Subject")}: {item.preview.subject}</div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-white">
                  <iframe
                    title={`${item.name} preview`}
                    srcDoc={item.preview.html}
                    className="h-[360px] w-full"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void sendTest(item.key)}
                  disabled={busyKey === item.key || !testRecipient}
                  className="w-full rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 disabled:opacity-50"
                >
                  {busyKey === item.key ? L("Sending…", "Enviando…") : L("Send automation preview", "Enviar preview de automatización")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-400">{L("Loading email automations…", "Cargando emails automatizados…")}</p> : null}
    </section>
  );
}
