"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";

import { useAppSettings, type Theme } from "@/lib/appSettings";
import { resolveLocale, t, type Locale } from "@/lib/i18n";
import { listAlertEvents, subscribeToAlertEvents } from "@/lib/alertsSupabase";

type NavItem = {
  id: string;
  title?: string;
  description?: string;
  titleKey?: string;
  descriptionKey?: string;
  href?: string;
  badge?: string;
};

type DropdownProps = {
  title?: string;
  titleKey?: string;
  items: NavItem[];
  theme: Theme;
  lang: Locale;
};

/* ========== Reusable Dropdown component (main nav menus) ========== */
function Dropdown({ title, titleKey, items, theme, lang }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const label = titleKey ? t(titleKey, lang) : title ?? "";

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

  const isLight = theme === "light";

  const buttonClass = isLight
    ? open
      ? "bg-slate-200/80 text-slate-900 ring-1 ring-slate-300"
      : "text-slate-700 hover:bg-slate-200/70 hover:text-slate-900"
    : open
    ? "bg-slate-800 text-emerald-300"
    : "text-slate-200 hover:bg-slate-800 hover:text-slate-50";

  const panelClass = isLight
    ? "nt-dropdown-panel nt-card-glow border border-slate-200"
    : "border border-slate-800 bg-slate-950 shadow-xl shadow-slate-900/70";

  const itemHoverClass = isLight
    ? "hover:bg-slate-100/80"
    : "hover:bg-slate-800";

  const titleClass = isLight
    ? "text-slate-900 group-hover:text-emerald-700"
    : "text-slate-100 group-hover:text-emerald-200";

  const descClass = isLight
    ? "text-slate-600 group-hover:text-slate-700"
    : "text-slate-400 group-hover:text-slate-200";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`nt-menu-button flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${buttonClass}`}
      >
        {label}
        <span
          className={`text-[11px] transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className={`absolute left-0 mt-2 w-80 rounded-2xl shadow-xl z-50 overflow-hidden ${panelClass}`}
        >
          <ul className="py-2">
            {items.map((item) => {
              const Wrapper: any = item.href ? Link : "div";
              const wrapperProps = item.href ? { href: item.href } : {};

              const itemTitle = item.titleKey ? t(item.titleKey, lang) : item.title;
              const itemDesc = item.descriptionKey
                ? t(item.descriptionKey, lang)
                : item.description;

              return (
                <li key={item.id}>
                  <Wrapper
                    {...wrapperProps}
                    className={`group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 transition-colors cursor-pointer ${itemHoverClass}`}
                  >
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${titleClass}`}>
                        {itemTitle}
                      </p>
                      {itemDesc && (
                        <p className={`text-[11px] ${descClass}`}>{itemDesc}</p>
                      )}
                    </div>
                    {item.badge && (
                      <span className="mt-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
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

function HelpMenu({ theme, lang }: { theme: Theme; lang: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const isLight = theme === "light";

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

  const btnClass = isLight
    ? "border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-400 hover:text-emerald-300";

  const panelClass = isLight
    ? "nt-dropdown-panel nt-card-glow border border-slate-200"
    : "border border-slate-800 bg-slate-950 shadow-xl shadow-slate-900/70";

  const linkClass = isLight
    ? "border-slate-300 text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
    : "border-slate-700 text-slate-200 hover:border-emerald-400 hover:text-emerald-300";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm transition ${btnClass}`}
        aria-label="Help"
      >
        ?
      </button>

      {open && (
        <div
          className={`absolute right-0 mt-2 w-80 rounded-2xl shadow-xl z-50 p-3 ${panelClass}`}
        >
          <p
            className={`text-sm font-semibold ${
              isLight ? "text-slate-900" : "text-slate-100"
            } mb-1`}
          >
            {t("help.title", lang)}
          </p>
          <p className={`text-[11px] ${isLight ? "text-slate-600" : "text-slate-400"} mb-3`}>
            {t("help.desc", lang)}
          </p>

          <ul
            className={`space-y-1.5 text-[11px] ${
              isLight ? "text-slate-700" : "text-slate-300"
            }`}
          >
            <li>• {t("help.bullet.calendar", lang)}</li>
            <li>• {t("help.bullet.widgets", lang)}</li>
            <li>• {t("help.bullet.plan", lang)}</li>
          </ul>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Link
              href="/help/getting-started"
              className={`px-2 py-1 rounded-lg border transition ${linkClass}`}
            >
              {t("help.link.gettingStarted", lang)}
            </Link>
            <Link
              href="/quick-tour/page/dashboard"
              className={`px-2 py-1 rounded-lg border transition ${linkClass}`}
            >
              {t("help.link.dashboardTour", lang)}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== ALERTS INBOX (message icon + badge) ========== */

function AlertsInboxButton({ theme }: { theme: Theme }) {
  const { user } = useAuth() as any;
  const userId = (user as any)?.id || (user as any)?.uid || "";
  const [count, setCount] = useState(0);

  const isLight = theme === "light";

  const btnClass = isLight
    ? "border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-400 hover:text-emerald-300";

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    const res = await listAlertEvents(userId, { includeDismissed: false, limit: 200 });
    if (!res.ok) {
      setCount(0);
      return;
    }
    setCount(res.data.events.length);
  }, [userId]);

  useEffect(() => {
    refresh().catch(() => void 0);
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const sub = subscribeToAlertEvents(userId, () => {
      refresh().catch(() => void 0);
    });

    const t = window.setInterval(() => {
      refresh().catch(() => void 0);
    }, 30_000);

    const onForce = () => refresh().catch(() => void 0);
    window.addEventListener("ntj_alert_force_pull", onForce);

    return () => {
      window.clearInterval(t);
      window.removeEventListener("ntj_alert_force_pull", onForce);
      sub?.unsubscribe?.();
    };
  }, [userId, refresh]);

  const label = count > 9 ? "9+" : String(count);

  return (
    <Link
      href="/messages"
      className={`relative flex h-9 w-9 items-center justify-center rounded-full border text-sm transition ${btnClass}`}
      aria-label="Alerts inbox"
      title="Alerts inbox"
    >
      <MessageSquare className="h-4 w-4" />
      {count > 0 ? (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-emerald-400 text-[10px] font-semibold text-slate-950 flex items-center justify-center px-1 shadow-sm">
          {label}
        </span>
      ) : null}
    </Link>
  );
}

/* ========== ACCOUNT MENU (avatar) ========== */

function AccountMenu({ theme, lang }: { theme: Theme; lang: Locale }) {
  const { user, signOut } = useAuth() as any;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Plan que viene de Supabase (profiles.plan)
  const [profilePlan, setProfilePlan] = useState<string | null>(null);

  const isLight = theme === "light";

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
    user?.plan || user?.subscriptionPlan || user?.user_metadata?.plan || "—";

  // Plan efectivo: primero profiles.plan, luego auth, luego —
  const rawPlan =
    profilePlan && typeof profilePlan === "string" ? profilePlan : rawPlanFromUser;

  const plan =
    typeof rawPlan === "string" && rawPlan !== "—" ? rawPlan.toLowerCase() : "—";

  const photoURL = user?.photoURL || null;

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  // Estilos del pill según plan
  const planLabel =
    plan === "core" ? "Core" : plan === "advanced" ? "Advanced" : t("account.plan.none", lang);

  const planClasses =
    plan === "core"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-400/60"
      : plan === "advanced"
      ? "bg-violet-500/10 text-violet-700 border-violet-400/70"
      : isLight
      ? "bg-slate-100 text-slate-700 border-slate-300"
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

  const buttonClass = isLight
    ? "border-slate-300 bg-white text-slate-800 hover:border-emerald-400 hover:text-emerald-700"
    : "border-slate-700 bg-slate-900/90 text-slate-100 hover:border-emerald-400 hover:text-emerald-300 hover:bg-slate-900";

  const panelClass = isLight
    ? "nt-dropdown-panel nt-card-glow border border-slate-200"
    : "border border-slate-800 bg-slate-950 shadow-xl shadow-slate-900/70";

  const itemHoverClass = isLight ? "hover:bg-slate-100/80" : "hover:bg-slate-900/80";

  return (
    <div className="relative" ref={ref}>
      {/* BOTÓN SUPERIOR (avatar + nombre + plan) */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`group flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs transition shadow-sm ${buttonClass}`}
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
            {plan === "—"
              ? t("account.plan.none", lang)
              : `${t("account.plan.label", lang)}: ${planLabel}`}
          </span>
        </div>
      </button>

      {/* DROPDOWN */}
      {open && (
        <div
          className={`absolute right-0 mt-2 w-72 rounded-2xl shadow-xl z-50 overflow-hidden ${panelClass}`}
        >
          {/* Header usuario */}
          <div
            className={`border-b px-3 py-3 ${
              isLight
                ? "border-slate-200"
                : "border-slate-800 bg-linear-to-r from-slate-950 via-slate-900 to-slate-950"
            }`}
          >
            <p
              className={`text-[13px] font-semibold truncate ${
                isLight ? "text-slate-900" : "text-slate-100"
              }`}
            >
              {displayName}
            </p>
            {email && (
              <p className={`text-[11px] truncate ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                {email}
              </p>
            )}
            <p className={`mt-1 text-[11px] ${isLight ? "text-emerald-700" : "text-emerald-300"}`}>
              {plan && plan !== "—"
                ? `${t("Plan", lang)}: ${planLabel}`
                : t("account.noSubscription", lang)}
            </p>
          </div>

          {/* Opciones */}
          <ul className={`py-2 text-[12px] ${isLight ? "text-slate-800" : "text-slate-200"}`}>
            <li>
              <Link
                href="/account"
                className={`flex items-center justify-between px-3 py-2 transition-colors ${itemHoverClass}`}
              >
                <span>{t("Account", lang)}</span>
                <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {t("account.menu.profile", lang)}
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/account/preferences"
                className={`flex items-center justify-between px-3 py-2 transition-colors ${itemHoverClass}`}
              >
                <span>{t("Preferences", lang)}</span>
                <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {t("account.menu.langTheme", lang)}
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/account/password"
                className={`flex items-center justify-between px-3 py-2 transition-colors ${itemHoverClass}`}
              >
                <span>{t("Security & Privacy", lang)}</span>
                <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {t("account.menu.security", lang)}
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/billing"
                className={`flex items-center justify-between px-3 py-2 transition-colors ${itemHoverClass}`}
              >
                <span>{t("Billing", lang)}</span>
                <span className={`text-[10px] ${isLight ? "text-emerald-700" : "text-emerald-300"}`}>
                  {t("account.menu.upgrade", lang)}
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/billing/history"
                className={`flex items-center justify-between px-3 py-2 transition-colors ${itemHoverClass}`}
              >
                <span>{t("Billing History", lang)}</span>
                <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {t("account.menu.invoices", lang)}
                </span>
              </Link>
            </li>
          </ul>

          {/* Sign out */}
          <div className={`border-t px-3 py-2 ${isLight ? "border-slate-200" : "border-slate-800"}`}>
            <button
              type="button"
              onClick={handleSignOut}
              className={`w-full rounded-xl py-2 border text-[12px] transition ${
                isLight
                  ? "bg-white text-slate-700 border-slate-300 hover:border-red-400 hover:text-red-600"
                  : "bg-slate-900 text-slate-300 border-slate-700 hover:border-red-400 hover:text-red-300 hover:bg-slate-900/80"
              }`}
            >
              {t("account.menu.signOut", lang)}
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
    titleKey: "nav.performance.balanceChart.title",
    descriptionKey: "nav.performance.balanceChart.desc",
    href: "/performance/balance-chart",
  },
  {
    id: "analytics-statistics",
    titleKey: "nav.performance.analytics.title",
    descriptionKey: "nav.performance.analytics.desc",
    href: "/performance/analytics-statistics",
  },
  {
    id: "ai-coaching",
    titleKey: "nav.performance.aiCoaching.title",
    descriptionKey: "nav.performance.aiCoaching.desc",
    href: "/performance/ai-coaching",
    badge: "AI",
  },
  {
    id: "plan",
    titleKey: "nav.performance.cashflow.title",
    descriptionKey: "nav.performance.cashflow.desc",
    href: "/performance/plan",
  },
];

const challenges: NavItem[] = [
  {
    id: "challenges",
    titleKey: "nav.challenges.item.title",
    descriptionKey: "nav.challenges.item.desc",
    href: "/challenges",
  },
];

const resources: NavItem[] = [
  {
    id: "library",
    titleKey: "nav.resources.library.title",
    descriptionKey: "nav.resources.library.desc",
    href: "/resources/library",
  },
];

const rules: NavItem[] = [
  {
    id: "reminders",
    titleKey: "nav.rules.reminders.title",
    descriptionKey: "nav.rules.reminders.desc",
    href: "/rules-alarms/reminders",
  },
  {
    id: "alarms",
    titleKey: "nav.rules.alarms.title",
    descriptionKey: "nav.rules.alarms.desc",
    href: "/rules-alarms/alarms",
  },
];

const forum: NavItem[] = [
  {
    id: "community-feed",
    titleKey: "nav.forum.community.title",
    descriptionKey: "nav.forum.community.desc",
    href: "/forum/community-feed",
  },
];

/* ========== TopNav ========== */

export default function TopNav() {
  const { theme, locale } = useAppSettings();
  const lang = resolveLocale(locale);

  const isLight = theme === "light";

  const navClass = isLight
    ? "nt-topnav sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur"
    : "sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur";

  const linkClass = isLight
    ? "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200/70 hover:text-slate-900 transition-colors"
    : "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-50 transition-colors";

  return (
    <nav className={navClass}>
      <div className="flex items-center px-4 py-3 md:px-6 gap-6 w-full">
        {/* Brand */}
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
          <Dropdown
            titleKey="nav.performance"
            items={performance}
            theme={theme}
            lang={lang}
          />

          <Link href="/notebook" className={linkClass}>
            {t("nav.notebook", lang)}
          </Link>

          <Link href="/back-study" className={linkClass}>
            {t("nav.backStudy", lang)}
          </Link>

          <Link href="/option-flow" className={linkClass}>
            {t("nav.optionFlow", lang)}
          </Link>

          <Dropdown
            titleKey="nav.challenges"
            items={challenges}
            theme={theme}
            lang={lang}
          />
          <Dropdown
            titleKey="nav.resources"
            items={resources}
            theme={theme}
            lang={lang}
          />
          <Dropdown
            titleKey="nav.rules"
            items={rules}
            theme={theme}
            lang={lang}
          />
          <Dropdown
            titleKey="nav.forum"
            items={forum}
            theme={theme}
            lang={lang}
          />

          <Link href="/globalranking" className={linkClass}>
            {t("nav.globalRanking", lang)}
          </Link>
        </div>

        {/* Right side: Help + Account */}
        <div className="flex items-center gap-3">
          <AlertsInboxButton theme={theme} />
          <HelpMenu theme={theme} lang={lang} />
          <AccountMenu theme={theme} lang={lang} />
        </div>
      </div>
    </nav>
  );
}
