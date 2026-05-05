// lib/types.ts
export type PlanId = "core" | "advanced";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  plan: PlanId;
  createdAt: string;
  user_metadata?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    name?: string;
    plan?: PlanId | string;
    subscriptionStatus?: string;
    accessSource?: string;
    uid?: string;
    legacy_uid?: string;
    legacy_user_id?: string;
    user_uid?: string;
    [key: string]: unknown;
  };
}
