// app/billing/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

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
        <p className="text-slate-400 text-sm">Loading billing history…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 space-y-6">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
            Billing
          </p>
          <h1 className="text-3xl font-semibold mt-1">Billing history</h1>
          <p className="text-sm text-slate-400 mt-2">
            View past invoices and payments for your subscription.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          {loadingInvoices ? (
            <p className="text-sm text-slate-400">Loading invoices…</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-slate-400">
              No invoices yet. Your first invoice will appear after your first
              successful payment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Invoice #</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4 text-right">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-850/60 last:border-0"
                    >
                      <td className="py-2 pr-4 text-[12px] text-slate-200">
                        {new Date(inv.date).toLocaleDateString()}
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
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-[12px] text-right">
                        <button
                          type="button"
                          className="text-emerald-300 hover:text-emerald-200 text-[11px]"
                        >
                          Download PDF
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
