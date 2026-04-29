import { Suspense } from "react";
import UpdatePaymentClient from "./UpdatePaymentClient";

export const dynamic = "force-dynamic";

export default function UpdatePaymentPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
          <p className="text-sm text-slate-400">Opening secure billing...</p>
        </main>
      }
    >
      <UpdatePaymentClient />
    </Suspense>
  );
}
