"use client";

import {
  useEffect,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import type { BusinessMilestoneProgress } from "@/lib/businessMilestones";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";

type ProfileState = {
  firstName: string;
  lastName: string;
  email: string; // solo lectura en el UI
  phone: string;
  address: string; // postal_address
  avatarUrl: string | null; // solo para UI, no se guarda en profiles
};

export default function AccountPage() {
  const { user, loading } = useAuth() as any;
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [profile, setProfile] = useState<ProfileState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    avatarUrl: null,
  });

  const [businessMilestones, setBusinessMilestones] = useState<BusinessMilestoneProgress[]>([]);
  const [milestoneCount, setMilestoneCount] = useState({ completed: 0, total: 0 });

  const {
    accounts,
    activeAccountId,
    createAccount,
    setActiveAccount,
    deleteAccount,
    loading: accountsLoading,
    error: accountsError,
  } = useTradingAccounts();
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBroker, setNewAccountBroker] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDone, setDeleteDone] = useState<string | null>(null);

  /* ---------- Auth protection ---------- */
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  /* ---------- Load profile (Supabase + auth metadata) ---------- */
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      setError(null);

      try {
        const { data, error } = await supabaseBrowser
          .from("profiles")
          .select(
            `
            email,
            first_name,
            last_name,
            phone,
            postal_address
          `
          )
          .eq("id", user.id)
          .maybeSingle();

        // Si supabase devuelve error, lo tiramos para que caiga al catch y use fallback
        if (error) throw error;

        const meta = user.user_metadata || {};
        const authEmail = (user.email as string | null) ?? "";

        const derivedEmail = (data as any)?.email ?? authEmail;

        const derivedFirstName =
          (data as any)?.first_name ?? meta.first_name ?? meta.firstName ?? "";
        const derivedLastName =
          (data as any)?.last_name ?? meta.last_name ?? meta.lastName ?? "";
        const derivedPhone =
          (data as any)?.phone ?? meta.phone ?? meta.phoneNumber ?? "";
        const derivedAddress =
          (data as any)?.postal_address ?? meta.postal_address ?? meta.address ?? "";

        if (!cancelled) {
          setProfile({
            firstName: derivedFirstName,
            lastName: derivedLastName,
            email: derivedEmail,
            phone: derivedPhone,
            address: derivedAddress,
            avatarUrl: null,
          });
          setLoadingProfile(false);
        }
      } catch (err) {
        console.warn("[Account] Unexpected profile load error:", err);

        const meta = user.user_metadata || {};
        const authEmail = (user.email as string | null) ?? "";

        if (!cancelled) {
          setProfile({
            firstName: meta.first_name ?? meta.firstName ?? "",
            lastName: meta.last_name ?? meta.lastName ?? "",
            email: authEmail,
            phone: meta.phone ?? meta.phoneNumber ?? "",
            address: meta.postal_address ?? meta.address ?? "",
            avatarUrl: null,
          });
          setLoadingProfile(false);
          setError(
            L(
              "We couldn't load your Trader Entrepreneur profile from the database, but you can edit it below.",
              "No pudimos cargar tu perfil de Empresario Trader desde la base de datos, pero puedes editarlo abajo."
            )
          );
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  /* ---------- Load business milestones ---------- */
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    async function loadBusinessMilestones() {
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const params = new URLSearchParams({ lang });
        if (activeAccountId) params.set("accountId", activeAccountId);
        const res = await fetch(`/api/business-milestones/sync?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "Unable to load business milestones.");
        if (cancelled) return;
        const milestones = Array.isArray(body?.milestones) ? body.milestones : [];
        setBusinessMilestones(milestones);
        setMilestoneCount({
          completed: Number(body?.completedCount ?? milestones.filter((item: any) => item.completed).length),
          total: Number(body?.totalCount ?? milestones.length),
        });
      } catch (e) {
        console.warn("[Account] Business milestones load error:", e);
      }
    }

    void loadBusinessMilestones();

    return () => {
      cancelled = true;
    };
  }, [user?.id, activeAccountId, lang]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="flex min-h-[60vh] items-center justify-center px-6">
          <p className="text-slate-400 text-sm">{L("Loading Trader Entrepreneur account…", "Cargando cuenta de Empresario Trader…")}</p>
        </div>
      </main>
    );
  }

  const planRaw =
    (user as any).plan ||
    (user as any).subscriptionPlan ||
    user.user_metadata?.plan ||
    "standard";

  const planLabel =
    typeof planRaw === "string"
      ? planRaw.toLowerCase() === "standard"
        ? L("Standard", "Estándar")
        : planRaw.toLowerCase() === "advanced"
        ? "Advance"
        : planRaw.charAt(0).toUpperCase() + planRaw.slice(1)
      : L("Standard", "Estándar");

  const initials =
    (profile.firstName || profile.email || user.email || "T")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]?.toUpperCase())
      .join("") || "TJ";

  /* ---------- Save profile (MATCH PROFILES TABLE) ---------- */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      const payload = {
        id: user.id,
        email: profile.email || user.email,
        first_name: profile.firstName || null,
        last_name: profile.lastName || null,
        phone: profile.phone || null,
        postal_address: profile.address || null,
      };

      const { error: upsertError } = await supabaseBrowser
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (upsertError) {
        console.error("[Account] Error saving profile:", upsertError);
        setError(
          upsertError.message ||
            L(
              "We couldn't save your Trader Entrepreneur profile. Please try again.",
              "No pudimos guardar tu perfil de Empresario Trader. Intenta de nuevo."
            )
        );
      } else {
        setMessage(L("Trader Entrepreneur profile updated successfully.", "Perfil de Empresario Trader actualizado con éxito."));
      }
    } catch (err: any) {
      console.error("[Account] Unexpected error saving profile:", err);
      setError(L("Something went wrong while saving your Trader Entrepreneur profile.", "Algo salió mal al guardar tu perfil de Empresario Trader."));
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Upload avatar (solo storage + UI, no DB) ---------- */
  async function handleAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(L("Image must be ≤ 5MB.", "La imagen debe ser ≤ 5MB."));
      e.target.value = "";
      return;
    }

    setError(null);
    setMessage(null);
    setUploadingAvatar(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabaseBrowser.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        console.error("[Account] Avatar upload error:", uploadError);
        setError(L("We couldn't upload your photo. Please try again.", "No pudimos subir tu foto. Intenta de nuevo."));
        setUploadingAvatar(false);
        return;
      }

      const { data: publicUrlData } = supabaseBrowser.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        setError(L("Photo uploaded, but we couldn't get the public URL.", "Se subió la foto, pero no pudimos obtener el enlace público."));
        setUploadingAvatar(false);
        return;
      }

      setProfile((prev) => ({
        ...prev,
        avatarUrl: publicUrl,
      }));
      setMessage(L("Profile photo updated.", "Foto de perfil actualizada."));
    } catch (err) {
      console.error("[Account] Unexpected avatar upload error:", err);
      setError(L("Something went wrong while uploading your photo.", "Algo salió mal al subir tu foto."));
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  /* ---------- Helpers UI ---------- */
  const isCurrent = (href: string) => pathname === href;
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? accounts[0] ?? null;

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    const name = newAccountName.trim();
    if (!name) return;
    setCreatingAccount(true);
    setAccountMessage(null);
    try {
      await createAccount(name, newAccountBroker.trim() || undefined);
      setNewAccountName("");
      setNewAccountBroker("");
      setAccountMessage(L("Trading account created.", "Cuenta creada."));
    } catch (err: any) {
      setAccountMessage(err?.message || L("Failed to create account.", "No se pudo crear la cuenta."));
    } finally {
      setCreatingAccount(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="max-w-5xl mx-auto px-6 md:px-8 py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
              {L("Trader Entrepreneur Account", "Cuenta de Empresario Trader")}
            </p>
            <h1 className="text-3xl font-semibold mt-1">{L("Trading Business Account", "Cuenta de Empresa de Trading")}</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl">
              {L(
                "Update your identity, contact information, trading accounts, and progress inside your NeuroTrader business workspace.",
                "Actualiza tu identidad, información de contacto, cuentas de trading y progreso dentro de tu espacio empresarial de NeuroTrader."
              )}
            </p>
          </div>

          <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
            <span className="font-semibold text-emerald-100">{L("Current plan:", "Plan actual:")}</span>{" "}
            {planLabel}
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex flex-wrap gap-2 text-[12px] border-b border-slate-800 pb-2">
          <a
            href="/account"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/account")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {L("Trader Entrepreneur Account", "Cuenta de Empresario Trader")}
          </a>

          <a
            href="/account/preferences"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/account/preferences")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {L("Preferences", "Preferencias")}
          </a>

          <a
            href="/account/password"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/account/password")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {L("Change password", "Cambiar contraseña")}
          </a>
          <a
            href="/billing"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/billing")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {L("Business billing & subscription", "Facturación empresarial y suscripción")}
          </a>
          <a
            href="/billing/history"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/billing/history")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {L("Billing history", "Historial de facturación")}
          </a>
        </nav>

        {/* Layout: profile form + business milestones card */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)] mt-2">
          {/* Profile & identity */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
            <h2 className="text-sm font-semibold text-slate-100">
              {L("Trader identity", "Identidad Trader")}
            </h2>

            {/* Avatar + upload */}
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center text-sm font-semibold overflow-hidden border border-emerald-300/80">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt={profile.firstName || profile.email || L("Avatar", "Avatar")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                <p>
                  {L(
                    "This avatar is used in the top navigation, AI feedback, and your business account.",
                    "Este avatar se usa en la navegación superior, feedback de IA y tu cuenta empresarial."
                  )}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <label className="inline-flex items-center rounded-full bg-slate-800/70 px-3 py-1.5 text-[11px] font-medium text-slate-100 border border-slate-600 hover:border-emerald-400 hover:text-emerald-200 cursor-pointer transition">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    {uploadingAvatar ? L("Uploading…", "Subiendo…") : L("Upload photo", "Subir foto")}
                  </label>
                  <span className="text-[10px] text-slate-500">
                    {L("JPG, PNG, ≤ 5MB", "JPG, PNG, ≤ 5MB")}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* First/Last name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {L("First name", "Nombre")}
                  </label>
                  <input
                    value={profile.firstName}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, firstName: e.target.value }))
                    }
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder={L("First name", "Nombre")}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {L("Last name", "Apellido")}
                  </label>
                  <input
                    value={profile.lastName}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, lastName: e.target.value }))
                    }
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder={L("Last name", "Apellido")}
                  />
                </div>
              </div>

              {/* Email (read only) */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {L("Email", "Correo")}
                </label>
                <input
                  value={profile.email}
                  readOnly
                  className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-300 outline-none cursor-not-allowed"
                  placeholder={L("Email", "Correo")}
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  {L("This email is used for your business account and security.", "Este correo se usa para tu cuenta empresarial y seguridad.")}
                </p>
              </div>

              {/* Phone & address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {L("Phone", "Teléfono")}
                  </label>
                  <input
                    value={profile.phone}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder={L("+1 555 000 0000", "+1 555 000 0000")}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {L("Address", "Dirección")}
                  </label>
                  <input
                    value={profile.address}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, address: e.target.value }))
                    }
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder={L("City, Country", "Ciudad, País")}
                  />
                </div>
              </div>

              {/* Footer info + save button */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-slate-800 mt-2 gap-3">
                <div className="text-[11px] text-slate-500 space-y-1">
                  <p>
                    {L("Current plan:", "Plan actual:")}{" "}
                    <span className="text-emerald-300 font-medium">
                      {planLabel}
                    </span>
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition disabled:opacity-60"
                >
                  {saving ? L("Saving…", "Guardando…") : L("Save changes", "Guardar cambios")}
                </button>
              </div>

              {message && (
                <p className="text-[11px] text-emerald-300 mt-1">{message}</p>
              )}
              {error && (
                <p className="text-[11px] text-red-400 mt-1">{error}</p>
              )}
              {loadingProfile && (
                <p className="text-[11px] text-slate-500 mt-1">
                  {L("Loading Trader Entrepreneur profile…", "Cargando perfil de Empresario Trader…")}
                </p>
              )}
            </form>
          </section>

          {/* Business Milestones */}
          <section className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-5 text-sm">
            <h2 className="text-sm font-semibold text-emerald-200">
              {L("Business Milestones", "Hitos empresariales")}
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              {L(
                "Progress is measured by business infrastructure completed, not points. Each milestone is tied to your plan, rules, protection, and execution evidence.",
                "El progreso se mide por infraestructura empresarial completada, no puntos. Cada hito se conecta a tu plan, reglas, protección y evidencia de ejecución."
              )}
            </p>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  {L("Completed", "Completados")}
                </p>
                <p className="text-lg font-semibold text-emerald-300">
                  {milestoneCount.completed}/{milestoneCount.total || businessMilestones.length || 0}
                </p>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{
                    width: `${Math.min(
                      100,
                      milestoneCount.total ? (milestoneCount.completed / milestoneCount.total) * 100 : 0
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {businessMilestones.slice(0, 7).map((milestone) => (
                <div
                  key={milestone.key}
                  className={`rounded-xl border px-3 py-2 ${
                    milestone.completed
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={milestone.completed ? "text-emerald-300" : "text-slate-600"}>
                      {milestone.completed ? "✓" : "•"}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-100">
                        {milestone.title[lang]}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {milestone.description[lang]}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Trading accounts */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
                {L("Trading business accounts", "Cuentas de empresa de trading")}
              </p>
              <h2 className="text-lg font-semibold text-slate-100">
                {L("Broker-specific business books", "Libros empresariales por bróker")}
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                {L(
                  "Each trading account keeps its own execution records, analytics, and cashflows. Switch accounts from the top nav.",
                  "Cada cuenta mantiene sus propios registros de ejecución, analíticas y cashflows. Cambia de cuenta desde la barra superior."
                )}
              </p>
            </div>
            <div className="text-[11px] text-slate-400">
              {activeAccount ? (
                <>
                  {L("Active:", "Activa:")}{" "}
                  <span className="text-emerald-200 font-semibold">{activeAccount.name}</span>
                </>
              ) : (
                L("No account selected", "Sin cuenta seleccionada")
              )}
            </div>
          </div>

          {accountsLoading ? (
            <p className="text-xs text-slate-400">{L("Loading accounts…", "Cargando cuentas…")}</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {accounts.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
                    {L("No trading accounts yet.", "Todavía no hay cuentas de trading.")}
                  </div>
                )}
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`rounded-xl border p-4 text-xs ${
                      acc.id === activeAccountId
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{acc.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {acc.broker ? acc.broker : L("Broker not set", "Broker no definido")}
                        </p>
                      </div>
                      {acc.id === activeAccountId ? (
                        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200">
                          {L("Active", "Activa")}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveAccount(acc.id)}
                            className="rounded-full border border-slate-700 px-3 py-1 text-[10px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
                          >
                            {L("Set active", "Activar")}
                          </button>
                          {accounts.length > 1 && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = window.confirm(
                                  L(
                                    "Delete this trading account? This will remove its journal, analytics, and cashflows.",
                                    "¿Eliminar esta cuenta? Se borrará su journal, analíticas y cashflows."
                                  )
                                );
                                if (!ok) return;
                                try {
                                  await deleteAccount(acc.id);
                                  setAccountMessage(L("Account deleted.", "Cuenta eliminada."));
                                } catch (err: any) {
                                  setAccountMessage(
                                    err?.message || L("Failed to delete account.", "No se pudo eliminar la cuenta.")
                                  );
                                }
                              }}
                              className="rounded-full border border-rose-500/50 px-3 py-1 text-[10px] text-rose-200 hover:border-rose-400 transition"
                            >
                              {L("Delete", "Eliminar")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleCreateAccount} className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {L("Account name", "Nombre de cuenta")}
                  </label>
                  <input
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder={L("e.g. Interactive Brokers", "ej. Interactive Brokers")}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {L("Broker (optional)", "Broker (opcional)")}
                  </label>
                  <input
                    value={newAccountBroker}
                    onChange={(e) => setNewAccountBroker(e.target.value)}
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder={L("e.g. IBKR, Tradovate", "ej. IBKR, Tradovate")}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={creatingAccount || !newAccountName.trim()}
                    className="w-full rounded-xl bg-emerald-400 text-slate-950 px-4 py-2 text-xs font-semibold hover:bg-emerald-300 transition disabled:opacity-60"
                  >
                    {creatingAccount ? L("Creating…", "Creando…") : L("Add account", "Agregar cuenta")}
                  </button>
                </div>
              </form>

              {accountMessage && <p className="text-[11px] text-emerald-300 mt-2">{accountMessage}</p>}
              {accountsError && <p className="text-[11px] text-red-400 mt-2">{accountsError}</p>}
            </>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-rose-200">{L("Delete account", "Eliminar cuenta")}</p>
              <p className="text-xs text-rose-200/80 mt-1 max-w-xl">
                {L(
                  "This permanently deletes your user and ALL related data (journal, analytics, trades, business milestones, etc.). This cannot be undone.",
                  "Esto elimina permanentemente tu usuario y TODA tu data (journal, analíticas, trades, trofeos, etc.). No se puede deshacer."
                )}
              </p>
              <p className="text-[11px] text-rose-200/70 mt-2">
                {L("Type DELETE to confirm.", "Escribe DELETE para confirmar.")}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-rose-500/40 px-3 py-2 text-xs text-slate-100 outline-none focus:border-rose-300"
              placeholder="DELETE"
            />
            <button
              type="button"
              disabled={deleteConfirm.trim().toUpperCase() !== "DELETE" || deletingAccount}
              onClick={async () => {
                const ok = window.confirm(
                  L(
                    "Final confirmation: delete your account and all data?",
                    "Confirmación final: ¿eliminar tu cuenta y toda la data?"
                  )
                );
                if (!ok) return;
                setDeleteError(null);
                setDeleteDone(null);
                setDeletingAccount(true);
                try {
                  const session = await supabaseBrowser.auth.getSession();
                  const token = session?.data?.session?.access_token;
                  if (!token) throw new Error(L("Not authenticated.", "No autenticado."));

                  const res = await fetch("/api/account/delete", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      confirmation: deleteConfirm.trim().toUpperCase(),
                      email: profile.email || user.email || "",
                    }),
                  });
                  const json = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(json?.error || L("Delete failed.", "No se pudo eliminar."));

                  setDeleteDone(L("Account deleted. Signing out…", "Cuenta eliminada. Cerrando sesión…"));
                  await supabaseBrowser.auth.signOut();
                  router.replace("/");
                } catch (err: any) {
                  setDeleteError(err?.message || L("Delete failed.", "No se pudo eliminar."));
                } finally {
                  setDeletingAccount(false);
                }
              }}
              className="rounded-xl bg-rose-500 text-white px-4 py-2 text-xs font-semibold hover:bg-rose-400 transition disabled:opacity-60"
            >
              {deletingAccount ? L("Deleting…", "Eliminando…") : L("Delete account", "Eliminar cuenta")}
            </button>
          </div>
          {deleteError && <p className="text-[11px] text-rose-300 mt-2">{deleteError}</p>}
          {deleteDone && <p className="text-[11px] text-emerald-300 mt-2">{deleteDone}</p>}
        </section>
      </div>
    </main>
  );
}
