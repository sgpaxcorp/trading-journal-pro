"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";

import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale, t } from "@/lib/i18n";
import ThemeBoot from "@/app/components/ThemeBoot";

type NavItem = {
  id: string;
  title: string;
  description?: string;
  href?: string;
  badge?: string;
};

type DropdownProps = {
  title: string;
  items: NavItem[];
};

/* ========== Reusable Dropdown component (main nav menus) ========== */
function Dropdown({ title, items }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
          ${
            open
              ? "bg-slate-800 text-emerald-300"
              : "text-slate-200 hover:bg-slate-800 hover:text-slate-50"
          }`}
      >
        {title}
        <span
          className={`text-[11px] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 rounded-2xl border border-slate-800 bg-slate-950 shadow-xl shadow-slate-900/70 z-50">
          <ul className="py-2">
            {items.map((item) => {
              const Wrapper: any = item.href ? Link : "div";
              const wrapperProps = item.href ? { href: item.href } : {};

              return (
                <li key={item.id}>
                  <Wrapper
                    {...wrapperProps}
                    className="group flex w-full items-start gap-3 rounded-xl px-3 py-2.5
                               hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-100 group-hover:text-emerald-200">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-[11px] text-slate-400 group-hover:text-slate-200">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.badge && (
                      <span className="mt-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        {item.badge}
                      </span>
                    )}
                  </Wrapper>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ========== HELP MENU ( ? icon ) ========== */

function HelpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
        aria-label="Help"
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-800 bg-slate-950 shadow-xl shadow-slate-900/70 z-50 p-3">
          <p className="text-sm font-semibold text-slate-100 mb-1">
            Need help with this page?
          </p>
          <p className="text-[11px] text-slate-400 mb-3">
            This dashboard is your central hub: you can see your P&amp;L
            calendar, weekly summaries, streaks and daily targets. Use the
            widgets to customize what matters most for your process.
          </p>

          <ul className="space-y-1.5 text-[11px] text-slate-300">
            <li>• Click on any day in the calendar to open that journal.</li>
            <li>• Use the widget toggles to show/hide blocks you care about.</li>
            <li>• Edit your growth plan to update targets and calculations.</li>
          </ul>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Link
              href="/help/getting-started"
              className="px-2 py-1 rounded-lg border border-slate-700 text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              Getting started guide
            </Link>
            <Link
              href="/quick-tour/page/dashboard"
              className="px-2 py-1 rounded-lg border border-slate-700 text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              Dashboard tour
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== ACCOUNT MENU (avatar) ========== */

function AccountMenu() {
  const { user, signOut } = useAuth() as any;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);

  // Plan que viene de Supabase (profiles.plan)
  const [profilePlan, setProfilePlan] = useState<string | null>(null);

  // Nombre a mostrar (prioriza firstName/lastName si existen)
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Trader";

  const email = user?.email || "";

  // Plan que viene del objeto de usuario (auth)
  const rawPlanFromUser =
    user?.plan ||
    user?.subscriptionPlan ||
    user?.user_metadata?.plan ||
    "—";

  // Plan efectivo: primero profiles.plan, luego auth, luego —
  const rawPlan =
    profilePlan && typeof profilePlan === "string"
      ? profilePlan
      : rawPlanFromUser;

  const plan =
    typeof rawPlan === "string" && rawPlan !== "—"
      ? rawPlan.toLowerCase()
      : "—";

  const photoURL = user?.photoURL || null;

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  // Estilos del pill según plan
  const planLabel =
    plan === "core"
      ? "Core"
      : plan === "advanced"
      ? "Advanced"
      : "No plan";

  const planClasses =
    plan === "core"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/60"
      : plan === "advanced"
      ? "bg-violet-500/10 text-violet-200 border-violet-400/70"
      : "bg-slate-800 text-slate-300 border-slate-600";

  // Leer el plan más fresco desde profiles cuando haya user.id
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    async function fetchProfilePlan() {
      try {
        const { data, error } = await supabaseBrowser
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .single();

        if (error) {
          console.warn("[TopNav] Error loading profile plan:", error);
          return;
        }

        if (!cancelled && data?.plan) {
          setProfilePlan(data.plan as string);
        }
      } catch (err) {
        console.error("[TopNav] Unexpected error fetching profile plan:", err);
      }
    }

    fetchProfilePlan();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // ignore for now
    } finally {
      router.push("/signin");
    }
  };

  return (
    <div className="relative" ref={ref}>
      {/* BOTÓN SUPERIOR (avatar + nombre + plan) */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="group flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-100 hover:border-emerald-400 hover:text-emerald-300 hover:bg-slate-900 transition shadow-sm shadow-slate-900/40"
      >
        {/* Avatar */}
        <div className="relative">
          <div className="h-7 w-7 rounded-full overflow-hidden bg-emerald-400 text-slate-950 flex items-center justify-center text-[11px] font-semibold border border-emerald-300/80">
            {photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoURL}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{initials || "TJ"}</span>
            )}
          </div>
        </div>

        {/* Nombre + plan (solo en sm+) */}
        <div className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-[11px] font-medium truncate max-w-[120px]">
            {displayName}
          </span>
          <span
            className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-medium ${planClasses}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {plan === "—" ? "No plan set" : `Plan: ${planLabel}`}
          </span>
        </div>
      </button>

      {/* DROPDOWN */}
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-800 bg-slate-950 shadow-xl shadow-slate-900/70 z-50 overflow-hidden">
          {/* Header usuario */}
          <div className="border-b border-slate-800 px-3 py-3 bg-linear-to-r from-slate-950 via-slate-900 to-slate-950">
            <p className="text-[13px] font-semibold text-slate-100 truncate">
              {displayName}
            </p>
            {email && (
              <p className="text-[11px] text-slate-400 truncate">{email}</p>
            )}
            <p className="mt-1 text-[11px] text-emerald-300">
              {plan && plan !== "—"
                ? `Current plan: ${planLabel}`
                : "No subscription active"}
            </p>
          </div>

          {/* Opciones */}
          <ul className="py-2 text-[12px] text-slate-200">
            <li>
              <Link
                href="/account"
                className="flex items-center justify-between px-3 py-2 hover:bg-slate-900/80 transition-colors"
              >
                <span>{t("account.settings", lang)}</span>
                <span className="text-[10px] text-slate-400">
                  Profile & photo
                </span>
              </Link>
            </li>

            <li>
              <Link
                href="/account/preferences"
                className="flex items-center justify-between px-3 py-2 hover:bg-slate-900/80 transition-colors"
              >
                <span>{t("account.preferences", lang)}</span>
                <span className="text-[10px] text-slate-400">
                  Language & theme
                </span>
              </Link>
            </li>

            <li>
              <Link
                href="/account/password"
                className="flex items-center justify-between px-3 py-2 hover:bg-slate-900/80 transition-colors"
              >
                <span>Change password</span>
                <span className="text-[10px] text-slate-400">Security</span>
              </Link>
            </li>
            <li>
              <Link
                href="/billing"
                className="flex items-center justify-between px-3 py-2 hover:bg-slate-900/80 transition-colors"
              >
                <span>Billing & subscription</span>
                <span className="text-[10px] text-emerald-300">
                  Upgrade / cancel
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/billing/history"
                className="flex items-center justify-between px-3 py-2 hover:bg-slate-900/80 transition-colors"
              >
                <span>Billing history</span>
                <span className="text-[10px] text-slate-400">Invoices</span>
              </Link>
            </li>
          </ul>

          {/* Sign out */}
          <div className="border-t border-slate-800 px-3 py-2 bg-slate-950/95">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-xl bg-slate-900 text-[12px] text-slate-300 py-2 border border-slate-700 hover:border-red-400 hover:text-red-300 hover:bg-slate-900/80 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Menu data (dropdowns que sí se usan) ========== */

const performance: NavItem[] = [
  {
    id: "balance-chart",
    title: "Balance chart",
    description:
      "Evolution of your account and daily comparison vs. your target.",
    href: "/performance/balance-chart",
  },
  {
    id: "analytics-statistics",
    title: "Analytics Statistics",
    description: "Analyze your historical data with statistics.",
    href: "/performance/analytics-statistics",
  },
  {
    id: "ai-coaching",
    title: "AI Coaching",
    description: "Coaching ideas based on your metrics.",
    href: "/performance/ai-coaching",
    badge: "AI",
  },
  {
    id: "plan",
    title: "Cash Flow Tracking",
    description: "Track your deposits and withdrawals plan.",
    href: "/performance/plan",
  },
];

const challenges: NavItem[] = [
  {
    id: "challenges",
    title: "Challenges",
    description: "Consistency challenge with rules.",
    href: "/challenges",
  },
];

const resources: NavItem[] = [
  {
    id: "library",
    title: "Library",
    description: "Hand-picked books and videos.",
    href: "/resources/library",
  },
];

const rules: NavItem[] = [
  {
    id: "reminders",
    title: "Reminders",
    description: "Reminders that you need when somethin happens.",
    href: "/rules-alarms/reminders",
  },

  {
    id: "alarms",
    title: "Alarms",
    description: "Notifications for breaking rules.",
    href: "/rules-alarms/alarms",
  },
];

const forum: NavItem[] = [
  {
    id: "community-feed",
    title: "Community feed",
    description: "Share progress with other traders.",
    href: "/forum/community-feed",
  },
];

/* ========== TopNav ========== */

export default function TopNav() {
  // This also keeps Theme/Locale in sync if user changes them in Preferences.
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);

  return (
    <>
      {/* Applies persisted theme + locale */}
      <ThemeBoot />

      {/* ✅ Sticky: siempre visible */}
      <nav className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="flex items-center px-4 py-3 md:px-6 gap-6 w-full">
          {/* ✅ Brand: SOLO SVG, sin efectos, tamaño grande */}
          <Link
            href="/dashboard"
            className="shrink-0 flex items-center"
            aria-label="Go to dashboard"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/neurotrader-logo.svg"
              alt="Neuro Trader Journal"
              className="h-20 md:h-21 lg:h-33 w-auto object-contain"
              draggable={false}
            />
          </Link>

          {/* Nav row */}
          <div className="flex items-center gap-4 text-[14px] whitespace-nowrap flex-1">
            {/* Performance (dropdown) */}
            <Dropdown title={t("nav.performance", lang)} items={performance} />

            {/* Notebook como botón directo */}
            <Link
              href="/notebook"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-50 transition-colors"
            >
              {t("nav.notebook", lang)}
            </Link>

            {/* Back-Studying como botón directo */}
            <Link
              href="/back-study"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-50 transition-colors"
            >
              {t("nav.backStudy", lang)}
            </Link>

            {/* Resto de dropdowns */}
            <Dropdown title={t("nav.challenges", lang)} items={challenges} />
            <Dropdown title={t("nav.resources", lang)} items={resources} />
            <Dropdown title={t("nav.rules", lang)} items={rules} />
            <Dropdown title={t("nav.forum", lang)} items={forum} />

            {/* Global Ranking */}
            <Link
              href="/globalranking"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-50 transition-colors"
            >
              {t("nav.globalRanking", lang)}
            </Link>
          </div>

          {/* Right side: Help + Account */}
          <div className="flex items-center gap-3">
            <HelpMenu />
            <AccountMenu />
          </div>
        </div>
      </nav>
    </>
  );
}
