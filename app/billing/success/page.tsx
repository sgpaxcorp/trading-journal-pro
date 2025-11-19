// app/billing/success/page.tsx
"use client";

type BillingSuccessPageProps = {
  searchParams: {
    session_id?: string;
  };
};

export default function BillingSuccessPage({
  searchParams,
}: BillingSuccessPageProps) {
  const sessionId = searchParams?.session_id ?? "";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-emerald-500/40 bg-slate-900/90 p-6 shadow-2xl space-y-4">
        <h1 className="text-xl font-semibold text-emerald-300">
          Billing success (placeholder)
        </h1>

        <p className="text-sm text-slate-300">
          Tu pago se procesó correctamente. Más adelante aquí mostraremos el
          recibo detallado usando Stripe.
        </p>

        {sessionId && (
          <p className="text-xs text-slate-500">
            Session ID (para pruebas):{" "}
            <span className="font-mono text-slate-300">{sessionId}</span>
          </p>
        )}

        <p className="text-xs text-slate-500">
          Puedes cerrar esta ventana o volver al dashboard cuando esté
          disponible.
        </p>
      </div>
    </main>
  );
}
