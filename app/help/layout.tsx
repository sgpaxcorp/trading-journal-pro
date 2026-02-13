import Link from "next/link";
import TopNav from "@/app/components/TopNav";
import { getHelpLocale } from "./_lib/locale";

const NAV_GROUPS = (lang: "en" | "es") => {
  const isEs = lang === "es";
  return [
    {
      title: isEs ? "Primeros pasos" : "Get started",
      items: [
        { href: "/help", label: isEs ? "Resumen" : "Overview" },
        { href: "/help/getting-started", label: isEs ? "Guia de inicio" : "Getting Started" },
      ],
    },
    {
      title: isEs ? "Uso diario" : "Daily use",
      items: [
        { href: "/help/journal", label: isEs ? "Entradas de Journal" : "Journal Entries" },
        { href: "/help/workflows", label: isEs ? "Flujos de trabajo" : "Workflows" },
        { href: "/help/dashboard-widgets", label: isEs ? "Dashboard y widgets" : "Dashboard & Widgets" },
        { href: "/help/analytics", label: isEs ? "Analitica y rendimiento" : "Analytics & Performance" },
      ],
    },
    {
      title: isEs ? "Datos y reportes" : "Data & reports",
      items: [
        { href: "/help/data-inputs", label: isEs ? "Importacion de datos" : "Data Inputs" },
        { href: "/help/reports", label: isEs ? "Option Flow reportes" : "Option Flow Reports" },
        { href: "/help/post-mortem", label: isEs ? "Post-mortem" : "Post-mortem" },
      ],
    },
    {
      title: isEs ? "Cuenta y ajustes" : "Account & settings",
      items: [{ href: "/help/settings", label: isEs ? "Idioma y ajustes" : "Language & Settings" }],
    },
  ];
};

export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const lang = await getHelpLocale();
  const isEs = lang === "es";
  const navGroups = NAV_GROUPS(lang);

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{ backgroundColor: "#0b1020", color: "#e2e8f0" }}
    >
      <TopNav />
      <div className="w-full px-6 py-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
            {isEs ? "Centro de ayuda" : "Help Center"}
          </p>
          <h1 className="text-2xl font-semibold text-slate-100">
            {isEs ? "Manual de Neuro Trader Journal" : "Neuro Trader Journal Manual"}
          </h1>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
          <aside
            className="lg:sticky lg:top-6 h-fit rounded-2xl border p-4"
            style={{
              backgroundColor: "rgba(15, 23, 42, 0.82)",
              borderColor: "rgba(148, 163, 184, 0.22)",
            }}
          >
            {navGroups.map((group) => (
              <div key={group.title} className="mb-5">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.25em] mb-2">
                  {group.title}
                </p>
                <nav className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-200 transition"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
            ))}
          </aside>

          <main
            className="rounded-2xl border p-5 lg:p-6"
            style={{
              backgroundColor: "rgba(15, 23, 42, 0.82)",
              borderColor: "rgba(148, 163, 184, 0.22)",
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
