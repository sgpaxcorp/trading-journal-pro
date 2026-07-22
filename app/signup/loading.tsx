export default function SignUpLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <div className="space-y-2">
          <div className="mb-1 flex gap-2">
            <div className="h-1 flex-1 rounded-full bg-emerald-400" />
            <div className="h-1 flex-1 rounded-full bg-slate-800" />
            <div className="h-1 flex-1 rounded-full bg-slate-800" />
            <div className="h-1 flex-1 rounded-full bg-slate-800" />
            <div className="h-1 flex-1 rounded-full bg-slate-800" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="h-6 w-56 rounded bg-slate-800" />
          <div className="h-3 w-full rounded bg-slate-800/90" />
          <div className="h-3 w-5/6 rounded bg-slate-800/70" />
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="h-10 rounded-md bg-slate-950/90 ring-1 ring-slate-800" />
            <div className="h-10 rounded-md bg-slate-950/90 ring-1 ring-slate-800" />
          </div>
          <div className="h-10 rounded-md bg-slate-950/90 ring-1 ring-slate-800" />
          <div className="h-10 rounded-md bg-slate-950/90 ring-1 ring-slate-800" />
          <div className="h-10 rounded-md bg-slate-950/90 ring-1 ring-slate-800" />
        </div>

        <div className="space-y-3">
          <div className="h-11 rounded-xl bg-emerald-400/85" />
          <p className="text-center text-xs text-slate-400">
            Loading sign up... / Cargando registro...
          </p>
        </div>
      </div>
    </main>
  );
}
