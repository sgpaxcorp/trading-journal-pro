export default function ReplayPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-6 md:px-10 py-8">
      <h1 className="text-3xl font-semibold">Replay with candles</h1>
      <p className="text-slate-400 mt-1">
        Aquí verás velas del instrumento del día, tus entradas/salidas y notas del journal.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-slate-400 text-sm">
          (Placeholder) Integra aquí tu componente de velas (ej. Lightweight-Charts) y pinta markers con tus trades.
        </p>
      </div>
    </main>
  );
}
