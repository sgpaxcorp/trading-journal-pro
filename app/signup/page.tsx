import type { PlanId } from "@/lib/types";

import SignUpClient from "./SignUpClient";

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

type BillingCycle = "monthly" | "annual";

type SignUpPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = searchParams ? await searchParams : {};

  const rawPlan = firstParam(params.plan);
  const initialPlan: PlanId = rawPlan === "advanced" ? "advanced" : "core";

  const rawCycle = firstParam(params.cycle);
  const initialBillingCycle: BillingCycle = rawCycle === "annual" ? "annual" : "monthly";

  const partnerRaw = firstParam(params.partner || params.ref);
  const initialPartnerCode = partnerRaw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);

  return (
    <SignUpClient
      initialPlan={initialPlan}
      initialBillingCycle={initialBillingCycle}
      initialPartnerCode={initialPartnerCode}
    />
  );
}
