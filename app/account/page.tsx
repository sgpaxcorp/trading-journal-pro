// app/account/page.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      setName((user as any).name || "");
      setPhotoURL((user as any).photoURL || "");
    }
  }, [user]);

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
      // Aquí luego conectas tu API real, por ejemplo:
      // await fetch("/api/account/profile", { method: "PATCH", body: JSON.stringify({ name, photoURL }) })
      await new Promise((res) => setTimeout(res, 600)); // mock delay

      setMessage("Profile updated successfully.");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const plan = (user as any)?.plan || (user as any)?.subscriptionPlan || "standard";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 md:px-8 py-8 space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
            Account
          </p>
          <h1 className="text-3xl font-semibold mt-1">Account settings</h1>
          <p className="text-sm text-slate-400 mt-2">
            Update your profile information and how you&apos;re displayed inside
            Trading Journal Pro.
          </p>
        </header>

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
                  <span>
                    {(name || (user as any).email || "T")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((s: string) => s[0]?.toUpperCase())
                      .join("")}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                <p>We use your name and photo in the top navigation.</p>
                <p className="mt-1">
                  Later you can connect Gravatar or upload directly from cloud storage.
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
                In producción real, esto se cambiaría por un uploader seguro
                (S3, Cloudinary, etc.).
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 mt-2">
              <div className="text-[11px] text-slate-500">
                <p>
                  Email:{" "}
                  <span className="text-slate-200">{(user as any).email}</span>
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
            {error && <p className="text-[11px] text-red-400">{error}</p>}
          </form>
        </section>
      </div>
    </main>
  );
}
