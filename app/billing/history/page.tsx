// app/billing/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type Invoice = {
  id: string;
  number: string;
  date: string;
  amount: number;
  currency: string;
  status: "paid" | "open" | "void";
};

export default function BillingHistoryPage() {
  const { user, loading } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const localeTag = isEs ? "es-ES" : "en-US";
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoadingInvoices(true);
      try {
        // Futuro: llamar a tu API / Stripe
        await new Promise((res) => setTimeout(res, 500)); // mock

        setInvoices([
          {
            id: "inv_001",
            number: "0001",
            date: "2025-01-01",
            amount: 1900,
            currency: "usd",
            status: "paid",
          },
          {
            id: "inv_002",
            number: "0002",
            date: "2025-02-01",
            amount: 1900,
            currency: "usd",
            status: "paid",
          },
        ]);
      } finally {
        setLoadingInvoices(false);
      }
    }
    load();
  }, [user]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">{L("Loading billing history…", "Cargando historial de facturación…")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 space-y-6">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
            {L("Billing", "Facturación")}
          </p>
          <h1 className="text-3xl font-semibold mt-1">{L("Billing history", "Historial de facturación")}</h1>
          <p className="text-sm text-slate-400 mt-2">
            {L("View past invoices and payments for your subscription.", "Revisa facturas y pagos anteriores de tu suscripción.")}
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          {loadingInvoices ? (
            <p className="text-sm text-slate-400">{L("Loading invoices…", "Cargando facturas…")}</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-slate-400">
              {L(
                "No invoices yet. Your first invoice will appear after your first successful payment.",
                "Aún no hay facturas. Tu primera factura aparecerá después del primer pago exitoso."
              )}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">{L("Date", "Fecha")}</th>
                    <th className="py-2 pr-4">{L("Invoice #", "Factura #")}</th>
                    <th className="py-2 pr-4">{L("Amount", "Monto")}</th>
                    <th className="py-2 pr-4">{L("Status", "Estado")}</th>
                    <th className="py-2 pr-4 text-right">{L("Download", "Descargar")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-850/60 last:border-0"
                    >
                      <td className="py-2 pr-4 text-[12px] text-slate-200">
                        {new Date(inv.date).toLocaleDateString(localeTag)}
                      </td>
                      <td className="py-2 pr-4 text-[12px] text-slate-300">
                        {inv.number}
                      </td>
                      <td className="py-2 pr-4 text-[12px] text-slate-200">
                        {(inv.amount / 100).toFixed(2)}{" "}
                        {inv.currency.toUpperCase()}
                      </td>
                      <td className="py-2 pr-4 text-[12px]">
                        <span
                          className={
                            inv.status === "paid"
                              ? "rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-300 text-[11px]"
                              : inv.status === "open"
                              ? "rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-300 text-[11px]"
                              : "rounded-full px-2 py-0.5 bg-slate-700/40 text-slate-300 text-[11px]"
                          }
                        >
                          {inv.status === "paid"
                            ? L("paid", "pagado")
                            : inv.status === "open"
                              ? L("open", "abierto")
                              : L("void", "anulado")}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-[12px] text-right">
                        <button
                          type="button"
                          className="text-emerald-300 hover:text-emerald-200 text-[11px]"
                        >
                          {L("Download PDF", "Descargar PDF")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
