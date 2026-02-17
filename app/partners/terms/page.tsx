import Link from "next/link";
import PublicHomeLogoLink from "@/app/components/PublicHomeLogoLink";

export const dynamic = "force-static";

export default function PartnerTermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed left-6 top-10 z-20 hidden xl:block">
        <PublicHomeLogoLink size="lg" showLabel={false} />
      </div>
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-5 xl:hidden">
          <PublicHomeLogoLink size="md" showLabel={false} />
        </div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">Partner Program</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Partner Terms & Agreement</h1>
        <p className="mt-3 text-sm text-slate-300">
          This page defines the partner commission terms used by the platform MVP.
        </p>

        <div className="mt-6 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm leading-6 text-slate-200">
          <section>
            <h2 className="text-lg font-semibold text-slate-100">1) Commission model</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Annual subscription: partner earns 30% of the first-year charge.</li>
              <li>Monthly subscription: partner earns 20% of each paid monthly invoice.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-100">2) Payout methods</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>App credit: can be requested from the partner dashboard.</li>
              <li>Cash: requires a payout request from the partner dashboard.</li>
              <li>
                Cash payout windows follow partner policy and settlement timing tied to user payments.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-100">3) Agreement acceptance</h2>
            <p className="mt-2 text-slate-300">
              To activate partner status, the user must explicitly accept these terms and sign with legal name
              inside <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-100">/partners</code>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-100">4) Operational notes (MVP)</h2>
            <p className="mt-2 text-slate-300">
              This MVP focuses on deterministic tracking and partner dashboard operations. Manual review can be
              applied for payouts when needed.
            </p>
          </section>

          <section className="border-t border-slate-800 pt-4">
            <h2 className="text-lg font-semibold text-slate-100">Resumen rápido (Español)</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Anual: 30% del total del primer año.</li>
              <li>Mensual: 20% de cada mensualidad pagada.</li>
              <li>El partner puede solicitar pago en crédito o cash desde su dashboard.</li>
              <li>Para activar partner: aceptar términos y firmar con nombre legal en la página de partner.</li>
            </ul>
          </section>
        </div>

        <div className="mt-6">
          <Link
            href="/partners"
            className="inline-flex items-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
          >
            ← Back to partners
          </Link>
        </div>
      </div>
    </main>
  );
}
