// app/account/page.tsx
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
import {
  getProfileGamification,
  type ProfileGamification,
} from "@/lib/profileGamificationSupabase";

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

  const [profile, setProfile] = useState<ProfileState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    avatarUrl: null,
  });

  const [gamification, setGamification] =
    useState<ProfileGamification | null>(null);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            "We couldn't load your profile from the database, but you can edit it below."
          );
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  /* ---------- Load gamification snapshot (Supabase async) ---------- */
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    async function loadGamification() {
      try {
        const g = await getProfileGamification(user.id, {
          syncToDb: true,
          fallbackToDbCache: true,
        });
        if (!cancelled) setGamification(g);
      } catch (e) {
        // no bloqueamos la página si falla gamification
        console.warn("[Account] Gamification load error:", e);
      }
    }

    void loadGamification();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading account…</p>
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
      ? planRaw.charAt(0).toUpperCase() + planRaw.slice(1)
      : "Standard";

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
            "We couldn't save your profile. Please try again."
        );
      } else {
        setMessage("Profile updated successfully.");

        // refresca gamification por si cambias algo y quieres re-render limpio
        try {
          const g = await getProfileGamification(user.id, {
            syncToDb: true,
            fallbackToDbCache: true,
          });
          setGamification(g);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      console.error("[Account] Unexpected error saving profile:", err);
      setError("Something went wrong while saving your profile.");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Upload avatar (solo storage + UI, no DB) ---------- */
  async function handleAvatarUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be ≤ 5MB.");
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
        setError("We couldn't upload your photo. Please try again.");
        setUploadingAvatar(false);
        return;
      }

      const { data: publicUrlData } = supabaseBrowser.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        setError("Photo uploaded, but we couldn't get the public URL.");
        setUploadingAvatar(false);
        return;
      }

      setProfile((prev) => ({
        ...prev,
        avatarUrl: publicUrl,
      }));
      setMessage("Profile photo updated.");
    } catch (err) {
      console.error("[Account] Unexpected avatar upload error:", err);
      setError("Something went wrong while uploading your photo.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  /* ---------- Helpers UI ---------- */
  const isCurrent = (href: string) => pathname === href;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="max-w-5xl mx-auto px-6 md:px-8 py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
              Account
            </p>
            <h1 className="text-3xl font-semibold mt-1">Account settings</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl">
              Update your identity, contact information and see your gamification
              progress inside NeuroTrader Journal.
            </p>
          </div>

          <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
            <span className="font-semibold text-emerald-100">Current plan:</span>{" "}
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
            Account settings
          </a>
          <a
            href="/account/password"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/account/password")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            Change password
          </a>
          <a
            href="/billing"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/billing")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            Billing & subscription
          </a>
          <a
            href="/billing/history"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/billing/history")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            Billing history
          </a>
        </nav>

        {/* Layout: profile form + gamification card */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)] mt-2">
          {/* Profile & identity */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
            <h2 className="text-sm font-semibold text-slate-100">
              Profile &amp; identity
            </h2>

            {/* Avatar + upload */}
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center text-sm font-semibold overflow-hidden border border-emerald-300/80">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt={profile.firstName || profile.email || "Avatar"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                <p>
                  This avatar is used in the top navigation, AI feedback and
                  rankings.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <label className="inline-flex items-center rounded-full bg-slate-800/70 px-3 py-1.5 text-[11px] font-medium text-slate-100 border border-slate-600 hover:border-emerald-400 hover:text-emerald-200 cursor-pointer transition">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    {uploadingAvatar ? "Uploading…" : "Upload photo"}
                  </label>
                  <span className="text-[10px] text-slate-500">
                    JPG, PNG, ≤ 5MB
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* First/Last name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    First name
                  </label>
                  <input
                    value={profile.firstName}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, firstName: e.target.value }))
                    }
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Last name
                  </label>
                  <input
                    value={profile.lastName}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, lastName: e.target.value }))
                    }
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="Last name"
                  />
                </div>
              </div>

              {/* Email (read only) */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Email
                </label>
                <input
                  value={profile.email}
                  readOnly
                  className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-300 outline-none cursor-not-allowed"
                  placeholder="Email"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  This email is used for your account and rankings.
                </p>
              </div>

              {/* Phone & address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Phone
                  </label>
                  <input
                    value={profile.phone}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="+1 555 000 0000"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Address
                  </label>
                  <input
                    value={profile.address}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, address: e.target.value }))
                    }
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    placeholder="City, Country"
                  />
                </div>
              </div>

              {/* Footer info + save button */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-slate-800 mt-2 gap-3">
                <div className="text-[11px] text-slate-500 space-y-1">
                  <p>
                    Current plan:{" "}
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
                  {saving ? "Saving…" : "Save changes"}
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
                  Loading profile…
                </p>
              )}
            </form>
          </section>

          {/* Gamification & progress */}
          <section className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-5 text-sm">
            <h2 className="text-sm font-semibold text-emerald-200">
              Gamification &amp; progress
            </h2>

            {!gamification && (
              <p className="mt-3 text-xs text-slate-400">
                Once you start challenges, your XP, level and tier will appear
                here. Complete process-green days and finish challenges to earn
                rewards.
              </p>
            )}

            {gamification && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-[11px] text-slate-400">Level</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      {gamification.level}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Based on total XP earned.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-[11px] text-slate-400">Tier</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      {gamification.tier}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Higher tiers unlock more rewards.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 col-span-2">
                    <p className="text-[11px] text-slate-400">
                      Total XP across challenges
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-200">
                      {gamification.xp.toLocaleString()} XP
                    </p>

                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
                      {(() => {
                        const xp = gamification.xp;
                        let pct = 0;
                        if (xp < 1000) pct = (xp / 1000) * 100;
                        else if (xp < 3000) pct = ((xp - 1000) / 2000) * 100;
                        else if (xp < 7000) pct = ((xp - 3000) / 4000) * 100;
                        else pct = 100;
                        return (
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        );
                      })()}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      XP comes from process-green days and completed challenges.
                    </p>
                  </div>
                </div>

                {gamification.badges.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] text-slate-400 mb-1">
                      Badges unlocked
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {gamification.badges.map((b: string) => (
                        <span
                          key={b}
                          className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-3 text-[11px] text-slate-500">
                  Your AI coach and global rankings will use this profile (level,
                  tier, XP and badges) to adjust feedback and rewards.
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
