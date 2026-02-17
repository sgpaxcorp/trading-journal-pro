// app/billing/page.tsx
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

type BillingPageProps = {
  searchParams?: Promise<{
    plan?: string;
    partner?: string;
  }>;
};

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const planParam = params?.plan;
  const partnerCode = String(params?.partner ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);

  // Solo permitimos "core" o "advanced". Cualquier otra cosa → "core".
  let initialPlan: "core" | "advanced" = "core";
  if (planParam === "advanced") initialPlan = "advanced";
  if (planParam === "core") initialPlan = "core";

  return <BillingClient initialPlan={initialPlan} initialPartnerCode={partnerCode} />;
}
