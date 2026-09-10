// app/billing/success/page.tsx
import { Suspense } from "react";
import BillingSuccessClient from "./BillingSuccessClient";
import { getRequestLocale } from "@/lib/requestLocale";

export default async function BillingSuccessPage() {
  const lang = await getRequestLocale();
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
          <p className="text-xs text-slate-400">
            {lang === "es" ? "Cargando estado de suscripción..." : "Loading subscription status..."}
          </p>
        </main>
      }
    >
      <BillingSuccessClient />
    </Suspense>
  );
}
