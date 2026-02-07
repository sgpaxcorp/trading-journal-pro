// app/billing/history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type Invoice = {
  id: string;
  number: string;
  date: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: "paid" | "open" | "void" | "draft" | "uncollectible";
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  billing_reason?: string | null;
  subscription?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  lines?: {
    description: string;
    amount: number;
    quantity?: number | null;
    price?: number | null;
  }[];
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
  const [showMonthlySummary, setShowMonthlySummary] = useState(true);
  const [showAllInvoices, setShowAllInvoices] = useState(false);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeTag, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }),
    [localeTag]
  );

  function formatAmount(amount: number, currency: string) {
    const code = (currency || "usd").toUpperCase();
    if (code === "USD") return currencyFormatter.format(amount / 100);
    return `${(amount / 100).toFixed(2)} ${code}`;
  }

  function invoiceAmount(inv: Invoice) {
    const paid = Number(inv.amount_paid || 0);
    return paid > 0 ? paid : Number(inv.amount_due || 0);
  }

  function monthKey(inv: Invoice) {
    const base = inv.period_start || inv.date || "";
    return base.slice(0, 7);
  }

  const displayInvoices = useMemo(() => {
    if (!showMonthlySummary) return invoices;
    const grouped = new Map<string, Invoice>();
    for (const inv of invoices) {
      const key = monthKey(inv) || inv.date.slice(0, 7);
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          ...inv,
          id: `month-${key}`,
          number: key,
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          lines: inv.lines ? [...inv.lines] : [],
        });
        continue;
      }
      existing.amount_due += inv.amount_due || 0;
      existing.amount_paid += inv.amount_paid || 0;
      existing.lines = [...(existing.lines || []), ...(inv.lines || [])];
      if (new Date(inv.date).getTime() > new Date(existing.date).getTime()) {
        existing.date = inv.date;
        existing.hosted_invoice_url = inv.hosted_invoice_url ?? existing.hosted_invoice_url;
        existing.invoice_pdf = inv.invoice_pdf ?? existing.invoice_pdf;
        existing.status = inv.status;
      }
    }
    return Array.from(grouped.values()).sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [invoices, showMonthlySummary]);

  const visibleInvoices = useMemo(() => {
    if (showAllInvoices) return displayInvoices;
    return displayInvoices.slice(0, 5);
  }, [displayInvoices, showAllInvoices]);

  async function loadLogoData(): Promise<{ dataUrl: string; width: number; height: number } | null> {
    try {
      const res = await fetch("/neurotrade-logo.png");
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(blob);
      });
      const dims = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.src = dataUrl;
      });
      return { dataUrl, width: dims.width, height: dims.height };
    } catch {
      return null;
    }
  }

  async function downloadInvoicePdf(inv: Invoice) {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 48;
    const startY = 48;
    const logo = await loadLogoData();

    let logoHeight = 0;
    if (logo) {
      const maxW = 200;
      const scale = maxW / logo.width;
      const w = maxW;
      const h = Math.max(1, Math.round(logo.height * scale));
      logoHeight = h;
      doc.addImage(logo.dataUrl, "PNG", marginX, startY, w, h);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(
      isEs ? "Factura Neuro Trader" : "Neuro Trader Invoice",
      marginX,
      logo ? startY + logoHeight + 18 : startY + 30
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(
      `${L("Invoice", "Factura")}: ${inv.number || inv.id}`,
      marginX,
      logo ? startY + logoHeight + 36 : startY + 50
    );
    doc.text(
      `${L("Date", "Fecha")}: ${new Date(inv.date).toLocaleDateString(localeTag)}`,
      marginX,
      logo ? startY + logoHeight + 54 : startY + 68
    );
    doc.text(
      `${L("Status", "Estado")}: ${inv.status}`,
      marginX,
      logo ? startY + logoHeight + 72 : startY + 86
    );

    doc.setFont("helvetica", "bold");
    doc.text(
      `${L("Total", "Total")}: ${formatAmount(invoiceAmount(inv), inv.currency)}`,
      marginX,
      logo ? startY + logoHeight + 96 : startY + 110
    );

    const tableStart = logo ? startY + logoHeight + 140 : startY + 150;
    const lines = (inv.lines || []).map((l) => [
      l.description || L("Subscription", "Suscripción"),
      l.quantity ?? "",
      formatAmount(l.amount ?? 0, inv.currency),
    ]);

    if (lines.length) {
      autoTable(doc, {
        startY: tableStart,
        head: [[L("Item", "Concepto"), L("Qty", "Cant."), L("Amount", "Monto")]],
        body: lines,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [15, 23, 42] },
      });
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      isEs
        ? "Gracias por tu suscripción. Este documento es para fines de facturación."
        : "Thank you for your subscription. This document is for billing purposes only.",
      marginX,
      doc.internal.pageSize.height - 40
    );

    doc.save(`neurotrader-invoice-${inv.number || inv.id}.pdf`);
  }

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoadingInvoices(true);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          setInvoices([]);
          return;
        }

        const res = await fetch("/api/stripe/invoices", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load invoices");

        const rows = Array.isArray(body?.invoices) ? body.invoices : [];
        setInvoices(rows);
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <p className="text-[11px] text-slate-400">
                {L(
                  "We summarize invoices by month to keep your billing clean.",
                  "Resumimos las facturas por mes para mantener tu billing limpio."
                )}
              </p>
              {!showAllInvoices && displayInvoices.length > 5 && (
                <p className="mt-1 text-[10px] text-slate-500">
                  {L("Showing last 5 payments.", "Mostrando los últimos 5 pagos.")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMonthlySummary((prev) => !prev)}
                className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
              >
                {showMonthlySummary ? L("Show all invoices", "Mostrar todas") : L("Show monthly summary", "Mostrar resumen mensual")}
              </button>
              {displayInvoices.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllInvoices((prev) => !prev)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
                >
                  {showAllInvoices ? L("Show latest 5", "Mostrar últimos 5") : L("Show all payments", "Mostrar todos los pagos")}
                </button>
              )}
            </div>
          </div>
          {loadingInvoices ? (
            <p className="text-sm text-slate-400">{L("Loading invoices…", "Cargando facturas…")}</p>
          ) : visibleInvoices.length === 0 ? (
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
                  {visibleInvoices.map((inv) => (
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
                        {formatAmount(invoiceAmount(inv), inv.currency)}
                      </td>
                      <td className="py-2 pr-4 text-[12px]">
                        <span
                          className={
                            inv.status === "paid"
                              ? "rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-300 text-[11px]"
                              : inv.status === "open"
                              ? "rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-300 text-[11px]"
                              : inv.status === "draft"
                              ? "rounded-full px-2 py-0.5 bg-slate-700/40 text-slate-300 text-[11px]"
                              : inv.status === "uncollectible"
                              ? "rounded-full px-2 py-0.5 bg-slate-700/40 text-slate-300 text-[11px]"
                              : "rounded-full px-2 py-0.5 bg-slate-700/40 text-slate-300 text-[11px]"
                          }
                        >
                          {inv.status === "paid"
                            ? L("paid", "pagado")
                            : inv.status === "open"
                              ? L("open", "abierto")
                              : inv.status === "draft"
                                ? L("draft", "borrador")
                                : inv.status === "uncollectible"
                                  ? L("uncollectible", "incobrable")
                              : L("void", "anulado")}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-[12px] text-right">
                        <div className="flex items-center justify-end gap-2">
                          {inv.hosted_invoice_url && (
                            <button
                              type="button"
                              onClick={() => window.open(inv.hosted_invoice_url ?? "", "_blank")}
                              className="text-slate-300 hover:text-emerald-200 text-[11px]"
                            >
                              {L("View", "Ver")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => downloadInvoicePdf(inv)}
                            className="text-emerald-300 hover:text-emerald-200 text-[11px]"
                          >
                            {L("Download PDF", "Descargar PDF")}
                          </button>
                        </div>
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
