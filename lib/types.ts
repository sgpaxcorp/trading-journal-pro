// lib/types.ts
export type PlanId = "standard" | "professional";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  plan: PlanId;
  createdAt: string;
}
