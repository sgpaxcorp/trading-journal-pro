"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Neuro Trader Journal</p>
        <h1 className="mt-3 text-2xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-slate-400">
          Tuvimos un error inesperado. Puedes intentar recargar esta vista.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
