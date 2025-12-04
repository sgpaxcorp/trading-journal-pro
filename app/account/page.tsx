// app/account/page.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import {
  getProfileGamification,
  type ProfileGamification,
} from "@/lib/profileGamificationLocal";

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [gamification, setGamification] =
    useState<ProfileGamification | null>(null);

  /* ---------- Auth protection ---------- */
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  /* ---------- Load user profile fields ---------- */
  useEffect(() => {
    if (user) {
      setName((user as any).name || "");
      setPhotoURL((user as any).photoURL || "");
    }
  }, [user]);

  /* ---------- Load gamification snapshot ---------- */
  useEffect(() => {
    try {
      const g = getProfileGamification();
      setGamification(g);
    } catch {
      // ignore for now
    }
  }, []);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading account…</p>
      </main>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      // Later you can connect this to your real backend:
      // await fetch("/api/account/profile", { method: "PATCH", body: JSON.stringify({ name, photoURL }) })
      await new Promise((res) => setTimeout(res, 600)); // mock delay

      setMessage("Profile updated successfully.");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const plan =
    (user as any)?.plan ||
    (user as any)?.subscriptionPlan ||
    "standard";

  const initials =
    (name || (user as any).email || "T")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]?.toUpperCase())
      .join("") || "TJ";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
              Account
            </p>
            <h1 className="text-3xl font-semibold mt-1">
              Account settings
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl">
              Update your profile information and see your gamification
              progress inside Trading Journal Pro.
            </p>
          </div>

          <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
            <span className="font-semibold text-emerald-100">
              Current plan:
            </span>{" "}
            {plan}
          </div>
        </header>

        {/* Layout: profile form + gamification card */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {/* Profile & identity (tu código original) */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
            <h2 className="text-sm font-semibold text-slate-100">
              Profile &amp; identity
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center text-sm font-semibold overflow-hidden">
                  {photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoURL}
                      alt={name || "Avatar"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  <p>We use your name and photo in the top navigation.</p>
                  <p className="mt-1">
                    Later you can connect Gravatar or upload directly from
                    cloud storage.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Full name
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Photo URL (optional)
                </label>
                <input
                  value={photoURL}
                  onChange={(e) => setPhotoURL(e.target.value)}
                  className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                  placeholder="https://…"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  In real production this would be replaced by a secure
                  uploader (S3, Cloudinary, etc.).
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800 mt-2">
                <div className="text-[11px] text-slate-500">
                  <p>
                    Email:{" "}
                    <span className="text-slate-200">
                      {(user as any).email}
                    </span>
                  </p>
                  <p>
                    Current plan:{" "}
                    <span className="text-emerald-300 font-medium">
                      {plan}
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
                <p className="text-[11px] text-emerald-300">{message}</p>
              )}
              {error && (
                <p className="text-[11px] text-red-400">{error}</p>
              )}
            </form>
          </section>

          {/* Gamification & progress (nuevo) */}
          <section className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-5 text-sm">
            <h2 className="text-sm font-semibold text-emerald-200">
              Gamification &amp; progress
            </h2>

            {!gamification && (
              <p className="mt-3 text-xs text-slate-400">
                Once you start challenges, your XP, level and tier will
                appear here. Complete process-green days and finish
                challenges to earn rewards.
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

                    {/* simple progress feeling */}
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
                      XP comes from process-green days and completed
                      challenges.
                    </p>
                  </div>
                </div>

                {gamification.badges.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] text-slate-400 mb-1">
                      Badges unlocked
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {gamification.badges.map((b) => (
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
                  Your AI coach and global rankings will use this profile
                  (level, tier, XP and badges) to adjust feedback and
                  rewards.
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
