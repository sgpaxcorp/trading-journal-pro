"use client";

import { loadPlanAndEntries } from "@/app/(shared)/stats";
import Link from "next/link";

export default function NotebookPage() {
  const { entries } = loadPlanAndEntries();
  const sorted = [...entries].sort((a,b)=>a.date.localeCompare(b.date));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-6 md:px-10 py-8">
      <h1 className="text-3xl font-semibold">Daily notebook</h1>
      <p className="text-slate-400 mt-1">Tu journal en formato libreta.</p>

      <div className="mt-6 space-y-4">
        {sorted.map(e => (
          <Link key={e.date} href={`/journal/${e.date}`} className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-emerald-400/40">
            <p className="text-slate-300 text-sm">{e.date}</p>
            <p className={`text-lg font-semibold ${ (e.pnl||0) >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
              {(e.pnl||0) >= 0 ? "+" : ""}${(e.pnl||0).toFixed(2)}
            </p>
            {Boolean((e as any).notes) && (
              <p className="text-slate-400 mt-2 text-sm line-clamp-3">{(e as any).notes}</p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
