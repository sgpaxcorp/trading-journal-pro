// app/billing/success/page.tsx
import { Suspense } from "react";
import BillingSuccessClient from "./BillingSuccessClient";

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
          <p className="text-xs text-slate-400">
            Loading subscription status... / Cargando estado de suscripción...
          </p>
        </main>
      }
    >
      <BillingSuccessClient />
    </Suspense>
  );
}
