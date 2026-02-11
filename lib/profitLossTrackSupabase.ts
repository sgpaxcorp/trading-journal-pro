import { supabaseBrowser } from "@/lib/supaBaseClient";

export type BillingCycle =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "one_time";

export type CostCategory =
  | "subscription"
  | "data"
  | "education"
  | "funding"
  | "software"
  | "other";

export type ProfitLossCost = {
  id: string;
  user_id: string;
  account_id?: string | null;
  name: string;
  category: CostCategory;
  vendor?: string | null;
  billing_cycle: BillingCycle;
  amount: number;
  currency?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

const TABLE = "profit_loss_costs";

function toNumber(x: any): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(row: any): ProfitLossCost {
  return {
    id: row.id,
    user_id: row.user_id,
    account_id: row.account_id ?? null,
    name: row.name,
    category: row.category,
    vendor: row.vendor ?? null,
    billing_cycle: row.billing_cycle,
    amount: toNumber(row.amount),
    currency: row.currency ?? "USD",
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listProfitLossCosts(userId: string, accountId?: string | null) {
  if (!userId) return [] as ProfitLossCost[];
  let query = supabaseBrowser.from(TABLE).select("*").eq("user_id", userId);
  if (accountId) query = query.eq("account_id", accountId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createProfitLossCost(params: {
  userId: string;
  accountId?: string | null;
  name: string;
  category: CostCategory;
  vendor?: string | null;
  billingCycle: BillingCycle;
  amount: number;
  currency?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .insert({
      user_id: params.userId,
      account_id: params.accountId ?? null,
      name: params.name,
      category: params.category,
      vendor: params.vendor ?? null,
      billing_cycle: params.billingCycle,
      amount: params.amount,
      currency: params.currency ?? "USD",
      starts_at: params.startsAt ?? null,
      ends_at: params.endsAt ?? null,
      notes: params.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteProfitLossCost(userId: string, id: string) {
  if (!id) throw new Error("Missing cost id");
  const { error } = await supabaseBrowser
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export async function updateProfitLossCost(userId: string, id: string, patch: Partial<ProfitLossCost>) {
  if (!id) throw new Error("Missing cost id");
  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .update({
      name: patch.name,
      category: patch.category,
      vendor: patch.vendor,
      billing_cycle: patch.billing_cycle,
      amount: patch.amount,
      currency: patch.currency,
      starts_at: patch.starts_at,
      ends_at: patch.ends_at,
      notes: patch.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}
