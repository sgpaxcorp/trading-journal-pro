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
    })).filter((section) => section.items.length > 0);
  }, []);

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
      page_order_audit: true,
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
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">
          {L("Manual access", "Acceso manual")}
        </p>
        <h2 className="text-xl font-semibold">
          {L("Create free-access users", "Crear usuarios con acceso gratis")}
        </h2>
        <p className="text-sm text-slate-400">
          {L(
            "Create or update a user without Stripe, then grant only the modules you want them to access.",
            "Crea o actualiza un usuario sin Stripe y dale solo los módulos a los que quieras que entre."
          )}
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("Email", "Email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
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
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
              placeholder={L("Required for new users", "Requerido para usuarios nuevos")}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("First name", "Nombre")}</span>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("Last name", "Apellido")}</span>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={selectCoreBundle}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200"
          >
            {L("Select core bundle", "Seleccionar bundle core")}
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400"
          >
            {L("Clear all", "Limpiar todo")}
          </button>
        </div>

        <div className="space-y-4">
          {grouped.map((section) => (
            <div key={section.group} className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <div className="border-b border-slate-800 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {section.group === "core"
                    ? L("Core", "Core")
                    : section.group === "performance"
                    ? L("Performance", "Performance")
                    : section.group === "tools"
                    ? L("Tools", "Herramientas")
                    : section.group === "community"
                    ? L("Community", "Comunidad")
                    : L("Add-ons", "Add-ons")}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="px-4 py-3 font-medium">{L("Module", "Módulo")}</th>
                      <th className="px-4 py-3 font-medium">{L("Route", "Ruta")}</th>
                      <th className="px-4 py-3 font-medium">{L("Grant", "Grant")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <tr key={item.key} className="border-t border-slate-800 align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-100">
                            {isEs ? item.label.es : item.label.en}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {isEs ? item.description.es : item.description.en}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-sky-300">
                          {item.primaryPath}
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedKeys[item.key])}
                              onChange={() => toggleKey(item.key)}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                            />
                            {L("Allow", "Permitir")}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
