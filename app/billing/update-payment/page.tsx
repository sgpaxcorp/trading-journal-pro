import { Suspense } from "react";
import UpdatePaymentClient from "./UpdatePaymentClient";
import { getRequestLocale } from "@/lib/requestLocale";

export const dynamic = "force-dynamic";

export default async function UpdatePaymentPage() {
  const lang = await getRequestLocale();
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
          <p className="text-sm text-slate-400">
            {lang === "es" ? "Abriendo la facturación segura..." : "Opening secure billing..."}
          </p>
        </main>
      }
    >
      <UpdatePaymentClient />
    </Suspense>
  );
}
