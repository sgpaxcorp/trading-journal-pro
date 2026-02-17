import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const PARTNER_AGREEMENT_VERSION = "partner-v1-2026-02-17";
const REFERRAL_CODE_PREFIX = "NTJ";

export type PartnerProfileRow = {
  user_id: string;
  referral_code: string;
  legal_name: string;
  payout_preference: "credit" | "cash";
  payout_email: string | null;
  agreement_version: string;
  agreement_accepted: boolean;
  agreement_accepted_at: string | null;
  status: "active" | "paused";
  app_credit_balance: number;
  total_commissions_earned: number;
  total_commissions_paid: number;
  created_at: string;
  updated_at: string;
};

export type PartnerCommissionRow = {
  id: string;
  partner_user_id: string;
  referred_user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  stripe_checkout_session_id: string | null;
  plan_id: string | null;
  billing_cycle: "monthly" | "annual" | null;
  commission_rate: number;
  gross_amount: number;
  commission_amount: number;
  payout_method: "credit" | "cash";
  status: "pending" | "available" | "paid" | "reversed";
  available_on: string;
  description: string | null;
  meta: Record<string, any>;
  created_at: string;
  paid_on: string | null;
};

export type PartnerPayoutRequestRow = {
  id: string;
  partner_user_id: string;
  amount: number;
  payout_method: "credit" | "cash";
  status: "requested" | "processing" | "paid" | "rejected";
  notes: string | null;
  requested_at: string;
  eligible_on: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PartnerSummary = {
  pending: number;
  available: number;
  paid: number;
  reversed: number;
  total: number;
};

export function sanitizeReferralCode(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim().toUpperCase();
  const cleaned = value.replace(/[^A-Z0-9_-]/g, "");
  return cleaned.slice(0, 24);
}

function base36Hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0).toString(36).toUpperCase();
}

function randomCodeSuffix() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function generateUniqueReferralCode(seed: string) {
  const seedCode = sanitizeReferralCode(seed).replace(/_/g, "").replace(/-/g, "");
  const stem = (seedCode || `${REFERRAL_CODE_PREFIX}${base36Hash(seed)}`).slice(0, 10);

  for (let i = 0; i < 8; i += 1) {
    const candidate = sanitizeReferralCode(`${REFERRAL_CODE_PREFIX}-${stem}-${randomCodeSuffix()}`);
    const { data, error } = await supabaseAdmin
      .from("partner_profiles")
      .select("user_id")
      .eq("referral_code", candidate)
      .limit(1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) return candidate;
  }

  throw new Error("Could not generate a unique referral code.");
}

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function promoteAvailablePartnerCommissions(partnerUserId: string) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("partner_commissions")
    .update({ status: "available" })
    .eq("partner_user_id", partnerUserId)
    .eq("status", "pending")
    .lte("available_on", nowIso);
}

export async function getPartnerProfile(partnerUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("partner_profiles")
    .select("*")
    .eq("user_id", partnerUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PartnerProfileRow | null) ?? null;
}

function sumByStatus(rows: PartnerCommissionRow[]): PartnerSummary {
  let pending = 0;
  let available = 0;
  let paid = 0;
  let reversed = 0;
  let total = 0;

  for (const row of rows) {
    const amount = safeNum(row.commission_amount);
    if (row.status === "reversed") {
      reversed += amount;
      continue;
    }
    total += amount;
    if (row.status === "pending") pending += amount;
    else if (row.status === "available") available += amount;
    else if (row.status === "paid") paid += amount;
  }
  return { pending, available, paid, reversed, total };
}

export async function getPartnerDashboard(partnerUserId: string) {
  await promoteAvailablePartnerCommissions(partnerUserId);

  const profile = await getPartnerProfile(partnerUserId);
  if (!profile) return null;

  const [commissionsRes, payoutRes] = await Promise.all([
    supabaseAdmin
      .from("partner_commissions")
      .select("*")
      .eq("partner_user_id", partnerUserId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("partner_payout_requests")
      .select("*")
      .eq("partner_user_id", partnerUserId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (commissionsRes.error) throw new Error(commissionsRes.error.message);
  if (payoutRes.error) throw new Error(payoutRes.error.message);

  const commissions = (commissionsRes.data ?? []) as PartnerCommissionRow[];
  const payoutRequests = (payoutRes.data ?? []) as PartnerPayoutRequestRow[];

  const totals = sumByStatus(commissions);
  const reservedByRequests = payoutRequests
    .filter((r) => r.status === "requested" || r.status === "processing" || r.status === "paid")
    .reduce((acc, r) => acc + safeNum(r.amount), 0);

  const availableToRequest = Math.max(0, totals.available - reservedByRequests);

  return {
    profile,
    totals: {
      ...totals,
      reservedByRequests,
      availableToRequest,
    },
    commissions: commissions.slice(0, 25),
    payoutRequests: payoutRequests.slice(0, 25),
  };
}

export async function refreshPartnerTotals(partnerUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("partner_commissions")
    .select("commission_amount,status")
    .eq("partner_user_id", partnerUserId);

  if (error) throw new Error(error.message);

  let totalEarned = 0;
  let totalPaid = 0;
  for (const row of data ?? []) {
    const amount = safeNum((row as any).commission_amount);
    const status = String((row as any).status ?? "");
    if (status === "reversed") continue;
    totalEarned += amount;
    if (status === "paid") totalPaid += amount;
  }

  const { error: updErr } = await supabaseAdmin
    .from("partner_profiles")
    .update({
      total_commissions_earned: Number(totalEarned.toFixed(2)),
      total_commissions_paid: Number(totalPaid.toFixed(2)),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", partnerUserId);
  if (updErr) throw new Error(updErr.message);
}

export async function createPartnerCommission(params: {
  partnerUserId: string;
  referredUserId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId?: string | null;
  stripeCheckoutSessionId?: string | null;
  planId?: string | null;
  billingCycle: "monthly" | "annual";
  grossAmount: number;
  commissionRate: number;
  payoutMethod: "credit" | "cash";
  description?: string | null;
  availableOn: string;
  meta?: Record<string, any>;
}) {
  const grossAmount = Number(params.grossAmount || 0);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return { inserted: false, reason: "invalid_amount" } as const;

  const commissionAmount = Number(((grossAmount * params.commissionRate) / 100).toFixed(2));
  if (commissionAmount <= 0) return { inserted: false, reason: "zero_commission" } as const;

  if (params.stripeInvoiceId) {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("partner_commissions")
      .select("id")
      .eq("partner_user_id", params.partnerUserId)
      .eq("stripe_invoice_id", params.stripeInvoiceId)
      .limit(1);
    if (existingErr) throw new Error(existingErr.message);
    if (existing && existing.length > 0) return { inserted: false, reason: "duplicate_invoice" } as const;
  }

  if (params.billingCycle === "annual" && params.stripeSubscriptionId) {
    const { data: priorAnnual, error: priorErr } = await supabaseAdmin
      .from("partner_commissions")
      .select("id")
      .eq("partner_user_id", params.partnerUserId)
      .eq("stripe_subscription_id", params.stripeSubscriptionId)
      .eq("billing_cycle", "annual")
      .limit(1);
    if (priorErr) throw new Error(priorErr.message);
    if (priorAnnual && priorAnnual.length > 0) return { inserted: false, reason: "annual_already_recorded" } as const;
  }

  const { error } = await supabaseAdmin.from("partner_commissions").insert({
    partner_user_id: params.partnerUserId,
    referred_user_id: params.referredUserId ?? null,
    stripe_customer_id: params.stripeCustomerId ?? null,
    stripe_subscription_id: params.stripeSubscriptionId ?? null,
    stripe_invoice_id: params.stripeInvoiceId ?? null,
    stripe_checkout_session_id: params.stripeCheckoutSessionId ?? null,
    plan_id: params.planId ?? null,
    billing_cycle: params.billingCycle,
    commission_rate: params.commissionRate,
    gross_amount: grossAmount,
    commission_amount: commissionAmount,
    payout_method: params.payoutMethod,
    status: "pending",
    available_on: params.availableOn,
    description: params.description ?? null,
    meta: params.meta ?? {},
  });
  if (error) throw new Error(error.message);

  await refreshPartnerTotals(params.partnerUserId);
  return { inserted: true, commissionAmount } as const;
}
