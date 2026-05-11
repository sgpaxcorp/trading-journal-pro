"use client";

import { useMemo, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { ACCESS_GRANTS, type AccessGrantKey } from "@/lib/accessGrants";

type Props = {
  lang: "en" | "es";
};

type Notice = {
  tone: "success" | "error";
  text: string;
} | null;

const GROUP_ORDER = ["core", "performance", "tools", "community", "addons"] as const;

const GROUP_META = {
  core: {
    en: { title: "Core", hint: "Main workspace access" },
    es: { title: "Core", hint: "Acceso principal al workspace" },
  },
  performance: {
    en: { title: "Performance", hint: "Analytics and coaching" },
    es: { title: "Performance", hint: "Analítica y coaching" },
  },
  tools: {
    en: { title: "Tools", hint: "Execution utilities" },
    es: { title: "Herramientas", hint: "Utilidades de ejecución" },
  },
  community: {
    en: { title: "Community", hint: "Social and ranking areas" },
    es: { title: "Comunidad", hint: "Áreas sociales y de ranking" },
  },
  addons: {
    en: { title: "Add-ons", hint: "Extra capabilities" },
    es: { title: "Add-ons", hint: "Capacidades extra" },
  },
} as const;

function fallbackGrantLabel(value: string) {
  return String(value || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AccessGrantManager({ lang }: Props) {
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({
    platform_access: true,
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: ACCESS_GRANTS.filter((item) => item.group === group),
      selectedCount: ACCESS_GRANTS.filter((item) => item.group === group && selectedKeys[item.key]).length,
    })).filter((section) => section.items.length > 0);
  }, [selectedKeys]);

  const totalSelected = useMemo(
    () => ACCESS_GRANTS.filter((item) => selectedKeys[item.key]).length,
    [selectedKeys]
  );

  function toggleKey(key: AccessGrantKey) {
    setSelectedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function selectCoreBundle() {
    setSelectedKeys((prev) => ({
      ...prev,
      platform_access: true,
      page_dashboard: true,
      page_growth_plan: true,
      page_journal: true,
      page_import: true,
    }));
  }

  function clearAll() {
    setSelectedKeys({});
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const accessKeys = ACCESS_GRANTS.map((item) => item.key).filter((key) => selectedKeys[key]);
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setNotice({
          tone: "error",
          text: L("Admin session missing.", "Falta la sesión de admin."),
        });
        return;
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          accessKeys,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(body?.error ?? L("Could not save access grants.", "No se pudieron guardar los accesos.")),
        });
        return;
      }

      setNotice({
        tone: "success",
        text: body?.created
          ? L("Free access user created and grants saved.", "Usuario gratis creado y accesos guardados.")
          : L("User access updated successfully.", "Accesos del usuario actualizados correctamente."),
      });
      setPassword("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 md:p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">
          {L("Manual access", "Acceso manual")}
        </p>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {L("Create free-access users", "Crear usuarios con acceso gratis")}
          </h2>
          <p className="text-sm text-slate-400">
            {L(
              "Create or update a user without Stripe, then grant only the modules you want them to access.",
              "Crea o actualiza un usuario sin Stripe y dale solo los módulos a los que quieras que entre."
            )}
          </p>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-[11px] text-slate-300">
          {L("Selected grants", "Accesos seleccionados")}:{" "}
          <span className="font-semibold text-slate-100">{totalSelected}</span>
        </div>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("Email", "Email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
              placeholder="user@example.com"
              required
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">
              {L("Password", "Password")}
            </span>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
              placeholder={L("Required for new users", "Requerido para usuarios nuevos")}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("First name", "Nombre")}</span>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("Last name", "Apellido")}</span>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={selectCoreBundle}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
          >
            {L("Select core bundle", "Seleccionar bundle core")}
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
          >
            {L("Clear all", "Limpiar todo")}
          </button>
        </div>

        <div className="space-y-3">
          {grouped.map((section) => (
            <div key={section.group} className="rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    {isEs ? GROUP_META[section.group].es.title : GROUP_META[section.group].en.title}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {isEs ? GROUP_META[section.group].es.hint : GROUP_META[section.group].en.hint}
                  </p>
                </div>
                <div className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[10px] text-slate-300">
                  {section.selectedCount}/{section.items.length}
                </div>
              </div>

              <div className="divide-y divide-slate-800">
                {section.items.map((item) => {
                  const checked = Boolean(selectedKeys[item.key]);
                  return (
                    <label
                      key={item.key}
                      className="flex cursor-pointer items-start gap-3 px-4 py-3 transition hover:bg-slate-900/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKey(item.key)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-100">
                              {isEs ? item.label.es : item.label.en}
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-400">
                              {isEs ? item.description.es : item.description.en}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${
                              checked
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                : "border-slate-700 bg-slate-900 text-slate-400"
                            }`}
                          >
                            {checked ? L("Allowed", "Activo") : L("Off", "Off")}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-500">
                            {fallbackGrantLabel(item.key)}
                          </span>
                          {item.key === "platform_access" ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                              {L("Base access", "Acceso base")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {notice && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              notice.tone === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-slate-500">
            {L(
              "If the email already exists, this updates the access grants instead of creating a duplicate user.",
              "Si el email ya existe, esto actualiza los accesos en vez de crear un usuario duplicado."
            )}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 disabled:opacity-50"
          >
            {saving ? L("Saving access…", "Guardando accesos…") : L("Create / update user", "Crear / actualizar usuario")}
          </button>
        </div>
      </form>
    </section>
  );
}
