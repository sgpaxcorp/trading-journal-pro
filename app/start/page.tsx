// app/start/page.tsx
import { Suspense } from "react";
import StartClient from "./StartClient";

type PlanId = "core" | "advanced";

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

type StartPageProps = {
  searchParams?: Promise<SearchParams>;
};

export default async function StartPage({
  searchParams,
}: StartPageProps) {
  const params = searchParams ? await searchParams : {};
  const rawPlan = Array.isArray(params.plan)
    ? params.plan[0]
    : params.plan;

  let initialPlan: PlanId = "core";
  if (rawPlan === "advanced" || rawPlan === "core") {
    initialPlan = rawPlan;
  }

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
          <p className="text-xs text-slate-400">
            Loading checkout flow... / Cargando flujo de checkout...
          </p>
        </main>
      }
    >
      <StartClient initialPlan={initialPlan} />
    </Suspense>
  );
}
