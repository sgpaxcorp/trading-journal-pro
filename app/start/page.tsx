// app/start/page.tsx
import { Suspense } from "react";
import StartClient from "./StartClient";

type PlanId = "core" | "advanced";

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

export default function StartPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawPlan = Array.isArray(searchParams.plan)
    ? searchParams.plan[0]
    : searchParams.plan;

  let initialPlan: PlanId = "core";
  if (rawPlan === "advanced" || rawPlan === "core") {
    initialPlan = rawPlan;
  }

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
          <p className="text-xs text-slate-400">Loading checkout flow...</p>
        </main>
      }
    >
      <StartClient initialPlan={initialPlan} />
    </Suspense>
  );
}
