"use client";

import { useEffect, useMemo, useState } from "react";

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
    provider: string;
    configured: boolean;
  };
  automations: Automation[];
  adminEmail: string;
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

  const grouped = useMemo(() => {
    const map = new Map<Automation["category"], Automation[]>();
    for (const row of data?.automations ?? []) {
      const next = map.get(row.category) ?? [];
      next.push(row);
      map.set(row.category, next);
    }
    return map;
  }, [data]);

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
            <p className="mt-1 text-sm text-slate-400 break-all">{data?.sender?.from ?? "—"}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">{L("Delivery status", "Estado de entrega")}</p>
                <p className="text-xs text-slate-400">
                  {L(
                    "Auth, billing, lifecycle, and operational emails use this configuration.",
                    "Los emails de auth, billing, lifecycle y operaciones usan esta configuración."
                  )}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data?.sender?.configured ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" : "bg-amber-500/15 text-amber-200 border border-amber-500/30"}`}>
                {data?.sender?.configured ? L("Configured", "Configurado") : L("Mock mode", "Modo mock")}
              </span>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("Test recipient", "Destino de prueba")}</span>
            <input
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
              placeholder="you@example.com"
            />
          </label>

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
                  {busyKey === item.key ? L("Sending…", "Enviando…") : L("Send test email", "Enviar email de prueba")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-400">{L("Loading email automations…", "Cargando emails automatizados…")}</p> : null}

      {[...grouped.entries()].map(([category, rows]) => (
        <div key={category} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{groupLabel(category, L)}</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">{L("Automation map", "Mapa de automatizaciones")}</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {rows.map((row) => (
              <div key={row.key} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-sm font-semibold text-slate-100">{row.name}</p>
                <p className="mt-1 text-xs text-slate-400">{row.trigger}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
