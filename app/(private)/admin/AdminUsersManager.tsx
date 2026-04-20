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

type UserAction = "ban" | "unban" | "delete" | "reset";

type ActivityFilter = "all" | "active7" | "inactive14" | "inactive30" | "never";
type AccountFilter = "all" | "available" | "banned";
type SortOption = "most_used" | "least_used" | "recent" | "oldest";

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

function getActivityState(row: AdminUserSummary) {
  const days = daysSince(row.lastActiveAt);
  if (days === null) return "never" as const;
  if (days >= 30) return "inactive30" as const;
  if (days >= 14) return "inactive14" as const;
  return "active7" as const;
}

function toneForActivity(state: ReturnType<typeof getActivityState>) {
  if (state === "active7") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (state === "inactive14") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (state === "inactive30") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  return "border-slate-700 bg-slate-900 text-slate-300";
}

export default function AdminUsersManager({ lang }: Props) {
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [rows, setRows] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("most_used");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [resetEmailConfirm, setResetEmailConfirm] = useState("");
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
      const nextRows = Array.isArray(body?.users) ? body.users : [];
      setRows(nextRows);
      setSelectedUserId((current) =>
        nextRows.some((row: AdminUserSummary) => row.id === current) ? current : nextRows[0]?.id ?? null
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchUsers();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = rows.filter((row) => {
      if (q) {
        const haystack = [
          row.email,
          row.fullName,
          row.plan,
          row.subscriptionStatus,
          row.accessSource,
          ...row.activeEntitlements,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (accountFilter === "banned" && !row.bannedUntil) return false;
      if (accountFilter === "available" && row.bannedUntil) return false;

      const state = getActivityState(row);
      if (activityFilter !== "all" && state !== activityFilter) return false;
      return true;
    });

    next.sort((a, b) => {
      if (sortBy === "most_used") return b.sessions30d - a.sessions30d || b.events30d - a.events30d;
      if (sortBy === "least_used") return a.sessions30d - b.sessions30d || a.events30d - b.events30d;
      if (sortBy === "recent") return String(b.lastActiveAt ?? "").localeCompare(String(a.lastActiveAt ?? ""));
      return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    });

    return next;
  }, [activityFilter, accountFilter, query, rows, sortBy]);

  const selectedUser =
    filteredRows.find((row) => row.id === selectedUserId) ||
    rows.find((row) => row.id === selectedUserId) ||
    filteredRows[0] ||
    rows[0] ||
    null;

  useEffect(() => {
    if (!selectedUser && filteredRows.length) setSelectedUserId(filteredRows[0].id);
  }, [filteredRows, selectedUser]);

  const filteredEmails = useMemo(
    () => filteredRows.map((row) => row.email).filter(Boolean),
    [filteredRows]
  );

  const summary = useMemo(() => {
    const active7 = rows.filter((row) => getActivityState(row) === "active7").length;
    const inactive14 = rows.filter((row) => getActivityState(row) === "inactive14").length;
    const inactive30 = rows.filter((row) => getActivityState(row) === "inactive30").length;
    const never = rows.filter((row) => getActivityState(row) === "never").length;
    const banned = rows.filter((row) => Boolean(row.bannedUntil)).length;
    return { total: rows.length, active7, inactive14, inactive30, never, banned };
  }, [rows]);

  async function runAction(userId: string, action: UserAction) {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      setNotice({ tone: "error", text: L("Admin session missing.", "Falta la sesión de admin.") });
      return;
    }

    setBusyId(`${action}:${userId}`);
    setNotice(null);
    try {
      const method = action === "delete" ? "DELETE" : "PATCH";
      const res = await fetch(`/api/admin/users/${userId}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: method === "DELETE" ? undefined : JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(body?.error ?? L("Action failed.", "La acción falló.")),
        });
        return;
      }

      if (action === "reset" || action === "delete") {
        setNotice({
          tone: "success",
          text: L(
            "User was fully reset and removed from the workspace.",
            "El usuario fue reseteado por completo y removido del workspace."
          ),
        });
        setResetEmailConfirm("");
      } else {
        setNotice({
          tone: "success",
          text:
            action === "ban"
              ? L("User banned successfully.", "Usuario baneado correctamente.")
              : L("User unbanned successfully.", "Usuario desbaneado correctamente."),
        });
      }

      await fetchUsers();
    } finally {
      setBusyId(null);
    }
  }

  const selectedActivityState = selectedUser ? getActivityState(selectedUser) : null;
  const canReset =
    Boolean(selectedUser) &&
    resetEmailConfirm.trim().toLowerCase() === String(selectedUser?.email ?? "").trim().toLowerCase();

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7 space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">
          {L("Users center", "Centro de usuarios")}
        </p>
        <h2 className="text-xl font-semibold text-slate-100">
          {L("Users, activity, and full reset controls", "Usuarios, actividad y controles de reset total")}
        </h2>
        <p className="text-sm text-slate-400">
          {L(
            "Review who is active, who is fading, and execute strong account actions from one organized admin surface.",
            "Revisa quién está activo, quién se está enfriando y ejecuta acciones fuertes de cuenta desde una sola superficie admin organizada."
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        {[
          { label: L("Total users", "Usuarios totales"), value: summary.total },
          { label: L("Active 7d", "Activos 7d"), value: summary.active7 },
          { label: L("Inactive 14d", "Inactivos 14d"), value: summary.inactive14 },
          { label: L("Inactive 30d", "Inactivos 30d"), value: summary.inactive30 },
          { label: L("Never active", "Nunca activos"), value: summary.never },
          { label: L("Banned", "Baneados"), value: summary.banned },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.95fr]">
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
              <span className="text-xs text-slate-400">{L("Activity", "Actividad")}</span>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="all">{L("All activity states", "Todos los estados")}</option>
                <option value="active7">{L("Active in last 7 days", "Activo en últimos 7 días")}</option>
                <option value="inactive14">{L("Inactive 14+ days", "Inactivo 14+ días")}</option>
                <option value="inactive30">{L("Inactive 30+ days", "Inactivo 30+ días")}</option>
                <option value="never">{L("Never active", "Nunca activo")}</option>
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs text-slate-400">{L("Account state", "Estado de cuenta")}</span>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value as AccountFilter)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="all">{L("All accounts", "Todas las cuentas")}</option>
                <option value="available">{L("Available", "Disponibles")}</option>
                <option value="banned">{L("Banned", "Baneadas")}</option>
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs text-slate-400">{L("Sort", "Ordenar")}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
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
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-400">
                  <th className="py-3 pr-4">{L("User", "Usuario")}</th>
                  <th className="py-3 pr-4">{L("Activity", "Actividad")}</th>
                  <th className="py-3 pr-4">{L("Plan / status", "Plan / estado")}</th>
                  <th className="py-3 pr-4">{L("Usage 30d", "Uso 30d")}</th>
                  <th className="py-3 pr-4">{L("Access", "Acceso")}</th>
                  <th className="py-3 text-right">{L("Quick actions", "Acciones rápidas")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const inactivityDays = daysSince(row.lastActiveAt);
                  const isBanned = Boolean(row.bannedUntil);
                  const activityState = getActivityState(row);
                  const selected = row.id === selectedUser?.id;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-900/80 align-top transition ${
                        selected ? "bg-slate-900/60" : ""
                      }`}
                    >
                      <td className="py-4 pr-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUserId(row.id);
                            setResetEmailConfirm("");
                          }}
                          className="space-y-1 text-left"
                        >
                          <div className="font-medium text-slate-100">{row.fullName}</div>
                          <div className="text-xs text-slate-400">{row.email}</div>
                          <div className="text-[11px] text-slate-500">
                            {L("Created", "Creado")}: {formatDateTime(row.createdAt)}
                          </div>
                        </button>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="space-y-2 text-xs">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 font-medium ${toneForActivity(activityState)}`}>
                            {activityState === "active7"
                              ? L("Active", "Activo")
                              : activityState === "inactive14"
                                ? L("Cooling off", "En enfriamiento")
                                : activityState === "inactive30"
                                  ? L("Inactive", "Inactivo")
                                  : L("No activity yet", "Sin actividad todavía")}
                          </span>
                          <div className="text-slate-300">{formatDateTime(row.lastActiveAt)}</div>
                          <div className="text-slate-500">
                            {inactivityDays === null
                              ? L("No tracked activity", "Sin actividad registrada")
                              : `${inactivityDays} ${L("days ago", "días atrás")}`}
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
                          <div className="text-slate-200">
                            {row.sessions30d} {L("sessions", "sesiones")}
                          </div>
                          <div className="text-slate-400">
                            {row.events30d} {L("events", "eventos")}
                          </div>
                          <div className="text-slate-500">
                            {L("Sign-in", "Sign-in")}: {formatDateTime(row.lastSignInAt)}
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
                            onClick={() => {
                              setSelectedUserId(row.id);
                              setResetEmailConfirm("");
                            }}
                            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200"
                          >
                            {L("Open", "Abrir")}
                          </button>
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

        <div className="space-y-4">
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
                  "Use this segment to identify inactive users, heavy users, or custom filtered cohorts for outreach.",
                  "Usa este segmento para identificar usuarios inactivos, usuarios intensos o cohortes filtradas para outreach."
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
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 space-y-4">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                {L("Selected user", "Usuario seleccionado")}
              </p>
              <h3 className="text-lg font-semibold text-slate-100">
                {selectedUser ? selectedUser.fullName : L("No user selected", "Ningún usuario seleccionado")}
              </h3>
              <p className="text-sm text-slate-400">
                {selectedUser
                  ? selectedUser.email
                  : L("Choose a row from the table to inspect details and run stronger actions.", "Elige una fila de la tabla para inspeccionar detalles y ejecutar acciones fuertes.")}
              </p>
            </div>

            {selectedUser ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-slate-500">{L("Activity", "Actividad")}</div>
                    <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 font-medium ${selectedActivityState ? toneForActivity(selectedActivityState) : "border-slate-700 bg-slate-900 text-slate-300"}`}>
                      {selectedActivityState === "active7"
                        ? L("Active", "Activo")
                        : selectedActivityState === "inactive14"
                          ? L("Cooling off", "En enfriamiento")
                          : selectedActivityState === "inactive30"
                            ? L("Inactive", "Inactivo")
                            : L("Never active", "Nunca activo")}
                    </div>
                    <div className="mt-2 text-slate-300">{formatDateTime(selectedUser.lastActiveAt)}</div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-slate-500">{L("Usage 30d", "Uso 30d")}</div>
                    <div className="mt-2 text-lg font-semibold text-slate-100">
                      {selectedUser.sessions30d} / {selectedUser.events30d}
                    </div>
                    <div className="mt-1 text-slate-400">
                      {L("sessions / events", "sesiones / eventos")}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-slate-500">{L("Billing", "Billing")}</div>
                    <div className="mt-2 text-slate-100">
                      {selectedUser.plan ?? "—"} · {selectedUser.subscriptionStatus ?? "—"}
                    </div>
                    <div className="mt-1 text-slate-400">
                      {L("Source", "Origen")}: {selectedUser.accessSource ?? "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="text-slate-500">{L("Account state", "Estado de cuenta")}</div>
                    <div className="mt-2 text-slate-100">
                      {selectedUser.bannedUntil ? L("Banned", "Baneado") : L("Available", "Disponible")}
                    </div>
                    <div className="mt-1 text-slate-400">
                      {L("Last sign-in", "Último sign-in")}: {formatDateTime(selectedUser.lastSignInAt)}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Entitlements", "Entitlements")}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedUser.activeEntitlements.length ? (
                      selectedUser.activeEntitlements.map((grant) => (
                        <span
                          key={grant}
                          className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] text-slate-300"
                        >
                          {grant}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">{L("No active entitlements.", "Sin entitlements activos.")}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void runAction(selectedUser.id, selectedUser.bannedUntil ? "unban" : "ban")}
                    disabled={busyId === `${selectedUser.bannedUntil ? "unban" : "ban"}:${selectedUser.id}`}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                      selectedUser.bannedUntil
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    } disabled:opacity-50`}
                  >
                    {selectedUser.bannedUntil ? L("Unban user", "Desbanear usuario") : L("Ban user", "Banear usuario")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        L(
                          `Delete auth account for ${selectedUser.email}? This is permanent.`,
                          `¿Borrar la cuenta auth de ${selectedUser.email}? Esto es permanente.`
                        )
                      );
                      if (confirmed) void runAction(selectedUser.id, "delete");
                    }}
                    disabled={busyId === `delete:${selectedUser.id}`}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-200 disabled:opacity-50"
                  >
                    {L("Delete auth user", "Borrar usuario auth")}
                  </button>
                </div>

                <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 space-y-4">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">{L("Danger zone", "Zona de peligro")}</p>
                    <h4 className="text-base font-semibold text-rose-100">
                      {L("Full reset user", "Reset total del usuario")}
                    </h4>
                    <p className="text-sm text-rose-100/80">
                      {L(
                        "This cancels active Stripe subscriptions when possible, removes user-owned files from Supabase Storage, deletes the auth user, and lets the database cleanup trigger remove the rest of the user-owned data.",
                        "Esto cancela suscripciones activas de Stripe cuando sea posible, elimina archivos del usuario en Supabase Storage, borra el usuario auth y deja que el trigger de cleanup de la base elimine el resto de la data del usuario."
                      )}
                    </p>
                  </div>

                  <label className="flex flex-col gap-2">
                    <span className="text-xs text-rose-100/70">
                      {L(
                        "Type the exact email to enable the full reset button",
                        "Escribe el email exacto para habilitar el botón de reset total"
                      )}
                    </span>
                    <input
                      value={resetEmailConfirm}
                      onChange={(e) => setResetEmailConfirm(e.target.value)}
                      className="rounded-xl border border-rose-500/30 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                      placeholder={selectedUser.email}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void runAction(selectedUser.id, "reset")}
                    disabled={!canReset || busyId === `reset:${selectedUser.id}`}
                    className="w-full rounded-xl border border-rose-500/35 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100 disabled:opacity-50"
                  >
                    {busyId === `reset:${selectedUser.id}`
                      ? L("Resetting user…", "Reseteando usuario…")
                      : L("Full reset user", "Reset total del usuario")}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
                {L(
                  "Choose a user from the table to see details, access, usage, and dangerous actions.",
                  "Elige un usuario de la tabla para ver detalles, acceso, uso y acciones peligrosas."
                )}
              </div>
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
