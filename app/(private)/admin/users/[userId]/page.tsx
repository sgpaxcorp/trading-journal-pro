"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import {
  ACCESS_GRANTS,
  type AccessGrantKey,
  type AccessGrantDefinition,
} from "@/lib/accessGrants";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type AdminUserDetail = {
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
    es: { title: "Comunidad", hint: "Áreas sociales y ranking" },
  },
  addons: {
    en: { title: "Add-ons", hint: "Extra capabilities" },
    es: { title: "Add-ons", hint: "Capacidades extra" },
  },
} as const;

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

function getActivityState(user: AdminUserDetail | null) {
  if (!user) return "never" as const;
  const days = daysSince(user.lastActiveAt);
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

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const router = useRouter();
  const { user, loading } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [userId, setUserId] = useState("");
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetEmailConfirm, setResetEmailConfirm] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    params.then((value) => setUserId(value.userId));
  }, [params]);

  const groupedGrants = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: ACCESS_GRANTS.filter((item) => item.group === group),
    })).filter((section) => section.items.length > 0);
  }, []);

  const totalEnabled = useMemo(
    () => ACCESS_GRANTS.filter((item) => selectedKeys[item.key]).length,
    [selectedKeys]
  );

  async function fetchDetail(currentUserId: string) {
    if (!currentUserId) return;
    setLoadingDetail(true);
    setNotice(null);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setForbidden(true);
        return;
      }

      const res = await fetch(`/api/admin/users/${currentUserId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 || res.status === 401) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(body?.error ?? L("Could not load user.", "No se pudo cargar el usuario.")),
        });
        return;
      }
      const nextUser = body?.user as AdminUserDetail;
      setDetail(nextUser);
      setSelectedKeys(
        Object.fromEntries(
          ACCESS_GRANTS.map((item) => [item.key, nextUser.activeEntitlements.includes(item.key)])
        )
      );
      setResetEmailConfirm("");
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    if (!userId || loading || !user) return;
    void fetchDetail(userId);
  }, [loading, user, userId]);

  async function saveAccess() {
    if (!userId) return;
    setSaving(true);
    setNotice(null);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setNotice({ tone: "error", text: L("Admin session missing.", "Falta la sesión de admin.") });
        return;
      }

      const accessKeys = ACCESS_GRANTS.map((item) => item.key).filter((key) => selectedKeys[key]);
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update_access",
          accessKeys,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: String(body?.error ?? L("Could not save access.", "No se pudieron guardar los accesos.")),
        });
        return;
      }

      setDetail(body?.user ?? null);
      setNotice({
        tone: "success",
        text: L("User access updated successfully.", "Los accesos del usuario se actualizaron correctamente."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: UserAction) {
    if (!detail) return;
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      setNotice({ tone: "error", text: L("Admin session missing.", "Falta la sesión de admin.") });
      return;
    }

    setBusyId(action);
    setNotice(null);
    try {
      const method = action === "delete" ? "DELETE" : "PATCH";
      const res = await fetch(`/api/admin/users/${detail.id}`, {
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

      if (action === "delete" || action === "reset") {
        router.push("/admin");
        return;
      }

      await fetchDetail(detail.id);
      setNotice({
        tone: "success",
        text:
          action === "ban"
            ? L("User banned successfully.", "Usuario baneado correctamente.")
            : L("User unbanned successfully.", "Usuario desbaneado correctamente."),
      });
    } finally {
      setBusyId(null);
    }
  }

  function toggleGrant(key: AccessGrantKey) {
    setSelectedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const activityState = getActivityState(detail);
  const canReset =
    Boolean(detail) &&
    resetEmailConfirm.trim().toLowerCase() === String(detail?.email ?? "").trim().toLowerCase();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <p className="text-sm text-slate-400">{L("Loading…", "Cargando…")}</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-xl font-semibold">{L("Access restricted", "Acceso restringido")}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {L("This section is only for authorized staff.", "Esta sección es solo para el staff autorizado.")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push("/admin");
            }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:border-emerald-400/40 hover:text-emerald-100"
          >
            <ArrowLeft className="h-4 w-4" />
            {L("Back", "Volver")}
          </button>
          <Link
            href="/admin"
            className="rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:border-emerald-400/40 hover:text-emerald-100"
          >
            {L("Admin home", "Admin home")}
          </Link>
        </div>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7">
          {loadingDetail && !detail ? (
            <p className="text-sm text-slate-400">{L("Loading user…", "Cargando usuario…")}</p>
          ) : detail ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">
                    {L("User profile", "Perfil del usuario")}
                  </p>
                  <div>
                    <h1 className="text-3xl font-semibold text-slate-100">{detail.fullName}</h1>
                    <p className="mt-2 text-sm text-slate-400">{detail.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${toneForActivity(activityState)}`}>
                      {activityState === "active7"
                        ? L("Active", "Activo")
                        : activityState === "inactive14"
                          ? L("Cooling off", "En enfriamiento")
                          : activityState === "inactive30"
                            ? L("Inactive", "Inactivo")
                            : L("No activity yet", "Sin actividad todavía")}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
                      {detail.plan ?? "—"} · {detail.subscriptionStatus ?? "—"}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
                      {detail.bannedUntil ? L("Banned", "Baneado") : L("Available", "Disponible")}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Included", "Incluidos")}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-100">{totalEnabled}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Sessions 30d", "Sesiones 30d")}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-100">{detail.sessions30d}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Events 30d", "Eventos 30d")}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-100">{detail.events30d}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Last sign-in", "Último sign-in")}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-100">{formatDateTime(detail.lastSignInAt)}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Created", "Creado")}</div>
                  <div className="mt-2 text-sm text-slate-100">{formatDateTime(detail.createdAt)}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Last activity", "Última actividad")}</div>
                  <div className="mt-2 text-sm text-slate-100">{formatDateTime(detail.lastActiveAt)}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Ranking", "Ranking")}</div>
                  <div className="mt-2 text-sm text-slate-100">
                    {detail.showInRanking ? L("Visible", "Visible") : L("Hidden", "Oculto")}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Source", "Origen")}</div>
                  <div className="mt-2 text-sm text-slate-100">{detail.accessSource ?? "—"}</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">{L("User not found.", "Usuario no encontrado.")}</p>
          )}
        </section>

        {detail ? (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-7">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    {L("Permissions", "Permisos")}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-100">
                    {L("Included modules", "Módulos incluidos")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {L(
                      "Turn modules on or off for this user. This is the place to manage what they can enter.",
                      "Activa o apaga módulos para este usuario. Aquí es donde se maneja a qué puede entrar."
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveAccess}
                  disabled={saving}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 disabled:opacity-50"
                >
                  {saving ? L("Saving…", "Guardando…") : L("Save changes", "Guardar cambios")}
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {groupedGrants.map((section) => (
                  <div key={section.group} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
                    <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                          {isEs ? GROUP_META[section.group].es.title : GROUP_META[section.group].en.title}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {isEs ? GROUP_META[section.group].es.hint : GROUP_META[section.group].en.hint}
                        </div>
                      </div>
                      <div className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300">
                        {section.items.filter((item) => selectedKeys[item.key]).length}/{section.items.length}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-800">
                      {section.items.map((item: AccessGrantDefinition) => {
                        const checked = Boolean(selectedKeys[item.key]);
                        return (
                          <label
                            key={item.key}
                            className="flex cursor-pointer items-start gap-3 px-4 py-3 transition hover:bg-slate-900/40"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGrant(item.key)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-slate-100">
                                    {isEs ? item.label.es : item.label.en}
                                  </div>
                                  <div className="mt-1 text-[11px] leading-5 text-slate-400">
                                    {isEs ? item.description.es : item.description.en}
                                  </div>
                                </div>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] ${
                                    checked
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                      : "border-slate-700 bg-slate-900 text-slate-400"
                                  }`}
                                >
                                  {checked ? <Check className="h-3 w-3" /> : null}
                                  {checked ? L("Included", "Incluido") : L("Off", "Off")}
                                </span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  {L("Quick actions", "Acciones rápidas")}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-100">
                  {L("Account controls", "Controles de cuenta")}
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void runAction(detail.bannedUntil ? "unban" : "ban")}
                    disabled={busyId === (detail.bannedUntil ? "unban" : "ban")}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                      detail.bannedUntil
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    } disabled:opacity-50`}
                  >
                    {detail.bannedUntil ? L("Unban user", "Desbanear usuario") : L("Ban user", "Banear usuario")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        L(
                          `Delete auth account for ${detail.email}? This is permanent.`,
                          `¿Borrar la cuenta auth de ${detail.email}? Esto es permanente.`
                        )
                      );
                      if (confirmed) void runAction("delete");
                    }}
                    disabled={busyId === "delete"}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-200 disabled:opacity-50"
                  >
                    {L("Delete auth user", "Borrar usuario auth")}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-rose-500/25 bg-rose-500/10 p-6">
                <p className="text-[11px] uppercase tracking-[0.24em] text-rose-300">
                  {L("Danger zone", "Zona de peligro")}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-rose-100">
                  {L("Full reset user", "Reset total del usuario")}
                </h2>
                <p className="mt-2 text-sm text-rose-100/80">
                  {L(
                    "This cancels active Stripe subscriptions when possible, removes user-owned files from storage, deletes the auth user, and leaves the database cleanup trigger to remove the rest of the data.",
                    "Esto cancela suscripciones activas de Stripe cuando sea posible, elimina archivos del usuario del storage, borra el usuario auth y deja que el cleanup trigger elimine el resto de la data."
                  )}
                </p>

                <label className="mt-4 flex flex-col gap-2">
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
                    placeholder={detail.email}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void runAction("reset")}
                  disabled={!canReset || busyId === "reset"}
                  className="mt-4 w-full rounded-xl border border-rose-500/35 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100 disabled:opacity-50"
                >
                  {busyId === "reset"
                    ? L("Resetting user…", "Reseteando usuario…")
                    : L("Full reset user", "Reset total del usuario")}
                </button>
              </div>
            </section>
          </div>
        ) : null}

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
      </div>
    </main>
  );
}
