// app/billing/page.tsx
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

type BillingPageProps = {
  searchParams?: {
    plan?: string;
  };
};

export default function BillingPage({ searchParams }: BillingPageProps) {
  const planParam = searchParams?.plan;

  // Solo permitimos "core" o "advanced". Cualquier otra cosa → "core".
  let initialPlan: "core" | "advanced" = "core";
  if (planParam === "advanced") initialPlan = "advanced";
  if (planParam === "core") initialPlan = "core";

  return <BillingClient initialPlan={initialPlan} />;
}