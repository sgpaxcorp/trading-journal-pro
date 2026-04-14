"use client";

import { useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supaBaseClient";

type Props = {
  lang: "en" | "es";
};

type AdminUserSummary = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  bannedUntil: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  showInRanking: boolean;
  sessions30d: number;
  events30d: number;
  activeEntitlements: string[];
  accessSource: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function daysSince(value?: string | null) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  const diff = Date.now() - ts;
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function copyToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  void navigator.clipboard.writeText(value);
  return true;
}

export default function AdminUsersManager({ lang }: Props) {
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [rows, setRows] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [inactivityFilter, setInactivityFilter] = useState<"all" | "14" | "30">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "banned" | "active">("all");
  const [sortBy, setSortBy] = useState<"most_used" | "least_used" | "recent" | "oldest">("most_used");
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  async function fetchUsers() {
    setLoading(true);
    setNotice(null);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setNotice({ tone: "error", text: L("Admin session missing.", "Falta la sesión de admin.") });
        return;
      }
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(body?.error ?? L("Could not load users.", "No se pudieron cargar los usuarios.")),
        });
        return;
      }
      setRows(Array.isArray(body?.users) ? body.users : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchUsers();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inactivityDays = inactivityFilter === "all" ? null : Number(inactivityFilter);

    const next = rows.filter((row) => {
      if (q) {
        const haystack = [row.email, row.fullName, row.plan, row.subscriptionStatus, row.accessSource]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (statusFilter === "banned" && !row.bannedUntil) return false;
      if (statusFilter === "active" && row.bannedUntil) return false;

      if (inactivityDays !== null) {
        const days = daysSince(row.lastActiveAt);
        if (days === null || days < inactivityDays) return false;
      }

      return true;
    });

    next.sort((a, b) => {
      if (sortBy === "most_used") {
        return b.sessions30d - a.sessions30d || b.events30d - a.events30d;
      }
      if (sortBy === "least_used") {
        return a.sessions30d - b.sessions30d || a.events30d - b.events30d;
      }
      if (sortBy === "recent") {
        return String(b.lastActiveAt ?? "").localeCompare(String(a.lastActiveAt ?? ""));
      }
      return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    });

    return next;
  }, [inactivityFilter, query, rows, sortBy, statusFilter]);

  const filteredEmails = useMemo(
    () => filteredRows.map((row) => row.email).filter(Boolean),
    [filteredRows]
  );

  const summary = useMemo(() => {
    const inactive14 = rows.filter((row) => {
      const days = daysSince(row.lastActiveAt);
      return days !== null && days >= 14;
    }).length;
    const inactive30 = rows.filter((row) => {
      const days = daysSince(row.lastActiveAt);
      return days !== null && days >= 30;
    }).length;
    const banned = rows.filter((row) => Boolean(row.bannedUntil)).length;
    return {
      total: rows.length,
      inactive14,
      inactive30,
      banned,
    };
  }, [rows]);

  async function runAction(userId: string, action: "ban" | "unban" | "delete") {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      setNotice({ tone: "error", text: L("Admin session missing.", "Falta la sesión de admin.") });
      return;
    }

    setBusyId(`${action}:${userId}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(body?.error ?? L("Action failed.", "La acción falló.")),
        });
        return;
      }
      setNotice({
        tone: "success",
        text:
          action === "ban"
            ? L("User banned successfully.", "Usuario baneado correctamente.")
            : action === "unban"
              ? L("User unbanned successfully.", "Usuario desbaneado correctamente.")
              : L("User deleted successfully.", "Usuario borrado correctamente."),
      });
      await fetchUsers();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7 space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">
          {L("Users", "Usuarios")}
        </p>
        <h2 className="text-xl font-semibold text-slate-100">
          {L("User management and outreach segments", "Gestión de usuarios y segmentos de outreach")}
        </h2>
        <p className="text-sm text-slate-400">
          {L(
            "Review user activity, detect inactivity, and prepare email or message segments without leaving admin.",
            "Revisa actividad de usuarios, detecta inactividad y prepara segmentos de email o mensaje sin salir del admin."
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          { label: L("Total users", "Usuarios totales"), value: summary.total },
          { label: L("Inactive 14d", "Inactivos 14d"), value: summary.inactive14 },
          { label: L("Inactive 30d", "Inactivos 30d"), value: summary.inactive30 },
          { label: L("Banned", "Baneados"), value: summary.banned },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-slate-400">{L("Search", "Buscar")}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                placeholder={L("Email, name, plan…", "Email, nombre, plan…")}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs text-slate-400">{L("Inactivity", "Inactividad")}</span>
              <select
                value={inactivityFilter}
                onChange={(e) => setInactivityFilter(e.target.value as typeof inactivityFilter)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="all">{L("All users", "Todos los usuarios")}</option>
                <option value="14">{L("14+ days inactive", "14+ días inactivos")}</option>
                <option value="30">{L("30+ days inactive", "30+ días inactivos")}</option>
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs text-slate-400">{L("Status", "Estado")}</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="all">{L("All", "Todos")}</option>
                <option value="active">{L("Not banned", "No baneados")}</option>
                <option value="banned">{L("Banned", "Baneados")}</option>
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs text-slate-400">{L("Sort", "Ordenar")}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="most_used">{L("Most used", "Más usados")}</option>
                <option value="least_used">{L("Least used", "Menos usados")}</option>
                <option value="recent">{L("Most recent activity", "Actividad más reciente")}</option>
                <option value="oldest">{L("Oldest accounts", "Cuentas más antiguas")}</option>
              </select>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-400">
                  <th className="py-3 pr-4">{L("User", "Usuario")}</th>
                  <th className="py-3 pr-4">{L("Plan / status", "Plan / estado")}</th>
                  <th className="py-3 pr-4">{L("Last active", "Última actividad")}</th>
                  <th className="py-3 pr-4">{L("Usage 30d", "Uso 30d")}</th>
                  <th className="py-3 pr-4">{L("Access", "Acceso")}</th>
                  <th className="py-3 text-right">{L("Actions", "Acciones")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const inactivityDays = daysSince(row.lastActiveAt);
                  const isBanned = Boolean(row.bannedUntil);
                  return (
                    <tr key={row.id} className="border-b border-slate-900/80 align-top">
                      <td className="py-4 pr-4">
                        <div className="space-y-1">
                          <div className="font-medium text-slate-100">{row.fullName}</div>
                          <div className="text-xs text-slate-400">{row.email}</div>
                          <div className="text-[11px] text-slate-500">
                            {L("Created", "Creado")}: {formatDateTime(row.createdAt)}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="space-y-1 text-xs">
                          <div className="text-slate-200">{row.plan ?? "—"} · {row.subscriptionStatus ?? "—"}</div>
                          <div className="text-slate-400">
                            {row.showInRanking ? L("Ranking visible", "Ranking visible") : L("Ranking hidden", "Ranking oculto")}
                          </div>
                          <div className="text-slate-500">
                            {L("Source", "Origen")}: {row.accessSource ?? "—"}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="space-y-1 text-xs">
                          <div className="text-slate-200">{formatDateTime(row.lastActiveAt)}</div>
                          <div className="text-slate-400">
                            {inactivityDays === null
                              ? L("No activity yet", "Sin actividad todavía")
                              : `${inactivityDays} ${L("days ago", "días atrás")}`}
                          </div>
                          <div className="text-slate-500">
                            {L("Last sign-in", "Último sign-in")}: {formatDateTime(row.lastSignInAt)}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="space-y-1 text-xs">
                          <div className="text-slate-200">
                            {row.sessions30d} {L("sessions", "sesiones")}
                          </div>
                          <div className="text-slate-400">
                            {row.events30d} {L("events", "eventos")}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap gap-2">
                          {row.activeEntitlements.slice(0, 4).map((grant) => (
                            <span
                              key={grant}
                              className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300"
                            >
                              {grant}
                            </span>
                          ))}
                          {row.activeEntitlements.length > 4 ? (
                            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-400">
                              +{row.activeEntitlements.length - 4}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void runAction(row.id, isBanned ? "unban" : "ban")}
                            disabled={busyId === `${isBanned ? "unban" : "ban"}:${row.id}`}
                            className={`rounded-xl border px-3 py-2 text-xs font-medium ${
                              isBanned
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                            } disabled:opacity-50`}
                          >
                            {isBanned ? L("Unban", "Desbanear") : L("Ban", "Banear")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const confirmed = window.confirm(
                                L(
                                  `Delete ${row.email}? This cannot be undone.`,
                                  `¿Borrar ${row.email}? Esto no se puede deshacer.`
                                )
                              );
                              if (confirmed) void runAction(row.id, "delete");
                            }}
                            disabled={busyId === `delete:${row.id}`}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 disabled:opacity-50"
                          >
                            {L("Delete", "Borrar")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredRows.length === 0 ? (
                  <tr>
                    <td className="py-5 text-slate-500" colSpan={6}>
                      {L("No users match the current filters.", "Ningún usuario coincide con los filtros actuales.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
              {L("Audience segment", "Segmento de audiencia")}
            </p>
            <h3 className="text-lg font-semibold text-slate-100">
              {L("Current filter audience", "Audiencia del filtro actual")}
            </h3>
            <p className="text-sm text-slate-400">
              {L(
                "Use this segment block to prepare outreach to inactive users or any filtered audience.",
                "Usa este bloque para preparar outreach a usuarios inactivos o a cualquier audiencia filtrada."
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Users", "Usuarios")}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-100">{filteredRows.length}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Emails", "Emails")}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-100">{filteredEmails.length}</div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                const ok = copyToClipboard(filteredEmails.join(", "));
                setNotice({
                  tone: ok ? "success" : "info",
                  text: ok
                    ? L("Filtered emails copied.", "Emails filtrados copiados.")
                    : L("Clipboard is not available in this browser.", "Clipboard no está disponible en este browser."),
                });
              }}
              className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200"
            >
              {L("Copy filtered emails", "Copiar emails filtrados")}
            </button>

            <button
              type="button"
              onClick={() => {
                const ok = copyToClipboard(filteredRows.map((row) => row.id).join(", "));
                setNotice({
                  tone: ok ? "success" : "info",
                  text: ok
                    ? L("Filtered user IDs copied.", "IDs filtrados copiados.")
                    : L("Clipboard is not available in this browser.", "Clipboard no está disponible en este browser."),
                });
              }}
              className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200"
            >
              {L("Copy filtered user IDs", "Copiar IDs filtrados")}
            </button>
          </div>

          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-slate-300">
            <span className="font-medium text-sky-200">{L("Outreach ready", "Listo para outreach")}:</span>{" "}
            {L(
              "You can already segment inactive users here. The next layer would be a native bulk email/message composer tied to this filtered audience.",
              "Aquí ya puedes segmentar usuarios inactivos. La siguiente capa sería un composer nativo de emails/mensajes masivos atado a esta audiencia filtrada."
            )}
          </div>
        </div>
      </div>

      {notice ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : notice.tone === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-sky-500/30 bg-sky-500/10 text-sky-200"
          }`}
        >
          {notice.text}
        </div>
      ) : null}
    </section>
  );
}
