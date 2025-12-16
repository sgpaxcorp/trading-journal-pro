// lib/types.ts
export type PlanId = "core" | "advanced";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  plan: PlanId;
  createdAt: string;
}
